// Motuwe Scraper - Background Service Worker (MV3)
// Handles: config storage, content injection, messaging, backend fetch with retries.

const STORAGE_KEYS = {
  config: 'motuwe:config',
  backend: 'motuwe:backend',
};

// Basic exponential backoff with jitter
async function withRetries(fn, { retries = 2, baseDelayMs = 500 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      const jitter = Math.floor(Math.random() * 200);
      const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}

function withTimeout(promise, ms, errorMsg = 'Timeout') {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(errorMsg)), ms)),
  ]);
}

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab');
    return tab;
  }

async function ensureContentScript(tabId) {
  // Inject into all frames to reach content inside same-origin iframes
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['content.js'],
    injectImmediately: true,
    world: 'ISOLATED'
  });
}

async function saveStorage(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}

async function loadStorage(key, defaults = null) {
  const res = await chrome.storage.sync.get(key);
  return res[key] ?? defaults;
}

async function backgroundFetch(input, init = {}, { timeoutMs = 10000, retries = 1 } = {}) {
  return withRetries(
    () =>
      withTimeout(
        fetch(input, init).then(async (r) => {
          const text = await r.text();
          return { ok: r.ok, status: r.status, headers: Object.fromEntries(r.headers.entries()), body: text };
        }),
        timeoutMs,
        'Fetch timeout'
      ),
    { retries }
  );
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'SAVE_CONFIG': {
        await saveStorage(STORAGE_KEYS.config, msg.payload);
        sendResponse({ ok: true });
        break;
      }
      case 'LOAD_CONFIG': {
        const cfg = await loadStorage(STORAGE_KEYS.config, null);
        sendResponse({ ok: true, config: cfg });
        break;
      }
      case 'SAVE_BACKEND': {
        await saveStorage(STORAGE_KEYS.backend, msg.payload);
        sendResponse({ ok: true });
        break;
      }
      case 'LOAD_BACKEND': {
        const be = await loadStorage(STORAGE_KEYS.backend, null);
        sendResponse({ ok: true, backend: be });
        break;
      }
      case 'RUN_SCRAPE': {
        const tab = await getActiveTab();
        await ensureContentScript(tab.id);

        // Gather results from all frames to include tables inside iframes
        let frames = [];
        try {
          frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
        } catch (_) {
          frames = [];
        }

        const calls = (frames.length ? frames : [{ frameId: undefined }]).map(async (f) => {
          try {
            const res = await chrome.tabs.sendMessage(tab.id, { type: 'RUN_SCRAPE', payload: msg.payload }, f.frameId !== undefined ? { frameId: f.frameId } : undefined);
            return { ok: true, frameId: f.frameId, url: f.url, res };
          } catch (e) {
            return { ok: false, frameId: f.frameId, error: String(e?.message || e) };
          }
        });

        const results = await Promise.all(calls);

        // Merge: prefer top frame for page info; concat tables/links
        const topFrame = (frames.find((fr) => fr.parentFrameId === -1) || frames[0]) || { frameId: undefined };
        const topRes = results.find((r) => r.ok && r.frameId === topFrame.frameId) || results.find((r) => r.ok);
        const merged = topRes?.res ? JSON.parse(JSON.stringify(topRes.res)) : { page: {}, timestamp: new Date().toISOString() };
        merged.tables = [];
        merged.links = merged.links || [];

        for (const r of results) {
          if (!r.ok || !r.res) continue;
          if (Array.isArray(r.res.tables)) {
            for (const t of r.res.tables) {
              merged.tables.push({ ...t, frameId: r.frameId, frameUrl: r.url });
            }
          }
          if (Array.isArray(r.res.links)) {
            merged.links.push(...r.res.links);
          }
        }
        // dedupe links
        merged.links = Array.from(new Set(merged.links));

        sendResponse({ ok: true, result: merged });
        break;
      }
      case 'BACKGROUND_FETCH': {
        const res = await backgroundFetch(msg.payload.url, msg.payload.init, msg.payload.options || {});
        sendResponse({ ok: true, response: res });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'Unknown message type' });
    }
  })().catch((err) => {
    console.error('Background error:', err);
    try {
      sendResponse({ ok: false, error: String(err?.message || err) });
    } catch (_) {}
  });
  return true; // keep sendResponse async
});
