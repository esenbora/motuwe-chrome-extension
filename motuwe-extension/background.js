// Motuwe Scraper - Background Service Worker (MV3)
// Handles: config storage, content injection, messaging, backend fetch with retries.

const STORAGE_KEYS = {
  config: 'motuwe:config',
  backend: 'motuwe:backend',
};
const SESSION_KEYS = {
  lastSelection: 'motuwe:lastSelection',
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

async function ensurePageCss(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId, allFrames: true },
      files: ['css/inject.css']
    });
  } catch (e) {
    // Non-fatal: content script will inject minimal inline styles as fallback
    console.warn('insertCSS failed:', e?.message || e);
  }
}

async function saveStorage(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}

async function loadStorage(key, defaults = null) {
  const res = await chrome.storage.sync.get(key);
  return res[key] ?? defaults;
}

async function saveSession(key, value) {
  try { await chrome.storage.session.set({ [key]: value }); } catch (e) { console.warn('session set failed', e?.message || e); }
}
async function loadSession(key) {
  try { const r = await chrome.storage.session.get(key); return r[key]; } catch { return undefined; }
}
async function clearSession(key) {
  try { await chrome.storage.session.remove(key); } catch {}
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

        // Filter out non-HTTP(S) or blank frames for stability
        const filtered = (frames || []).filter((f) => {
          const u = (f && f.url) ? f.url : '';
          return u && /^https?:/i.test(u) && u !== 'about:blank';
        });

        const targetFrames = filtered.length ? filtered : [{ frameId: undefined }];

        const calls = targetFrames.map(async (f) => {
          try {
            const res = await chrome.tabs.sendMessage(tab.id, { type: 'RUN_SCRAPE', payload: msg.payload }, f.frameId !== undefined ? { frameId: f.frameId } : undefined);
            return { ok: true, frameId: f.frameId, url: f.url, res };
          } catch (e) {
            return { ok: false, frameId: f.frameId, error: String(e?.message || e) };
          }
        });

        const results = await Promise.all(calls);

        // Merge: prefer top frame for page info; concat tables/links
        const topFrame = ((filtered.find((fr) => fr.parentFrameId === -1) || filtered[0]) || { frameId: undefined });
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
      case 'START_SELECTION': {
        const tab = await getActiveTab();
        await ensureContentScript(tab.id);
        await ensurePageCss(tab.id);
        try {
          const res = await chrome.tabs.sendMessage(tab.id, { type: 'START_SELECTION' });
          // Respond immediately that selection mode is active; actual result will be stored in session
          sendResponse({ ok: true, started: true, info: res });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        break;
      }
      case 'STOP_SELECTION': {
        try {
          const tab = await getActiveTab();
          await chrome.tabs.sendMessage(tab.id, { type: 'STOP_SELECTION' });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        break;
      }
      case 'SELECTION_RESULT': {
        try {
          // Payload shape: { table }
          const payload = msg.payload || {};
          await saveSession(SESSION_KEYS.lastSelection, { ...payload, timestamp: Date.now() });
          try { chrome.runtime.sendMessage({ type: 'SELECTION_READY' }); } catch {}
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        break;
      }
      case 'GET_LAST_SELECTION': {
        try {
          const val = await loadSession(SESSION_KEYS.lastSelection);
          if (msg.payload && msg.payload.consume && val !== undefined) {
            await clearSession(SESSION_KEYS.lastSelection);
          }
          sendResponse({ ok: true, selection: val });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        break;
      }
      case 'HIGHLIGHT_TABLE': {
        try {
          const tab = await getActiveTab();
          await ensureContentScript(tab.id);
          const { selector, frameId } = msg.payload || {};
          const target = frameId !== undefined ? { frameId } : undefined;
          const res = await chrome.tabs.sendMessage(tab.id, { type: 'HIGHLIGHT_TABLE', selector }, target);
          sendResponse(res || { ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        break;
      }
      case 'GET_TABLE_SNAPSHOT': {
        try {
          const tab = await getActiveTab();
          await ensureContentScript(tab.id);
          const { selector, frameId } = msg.payload || {};
          const target = frameId !== undefined ? { frameId } : undefined;
          const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_TABLE_SNAPSHOT', payload: { selector } }, target);
          sendResponse(res || { ok: false, error: 'No response' });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
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

// Prefer opening Side Panel on action click
try {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
} catch {}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      try { await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'popup.html', enabled: true }); } catch {}
      await chrome.sidePanel.open({ tabId: tab.id });
    } else {
      await chrome.windows.create({ url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 560, height: 720, focused: true });
    }
  } catch (e) {
    console.warn('Open panel on action failed:', e?.message || e);
  }
});
