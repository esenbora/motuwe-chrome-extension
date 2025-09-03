const STORAGE_KEYS = { config: 'motuwe:config', backend: 'motuwe:backend' };
let LAST_RESULT = null;

function $(id) { return document.getElementById(id); }

function readConfigFromUI({ mode = 'advanced' } = {}) {
  const get = (id) => document.getElementById(id);
  let selectors = [];
  try {
    const txt = get('selectors')?.value;
    selectors = JSON.parse(txt || '[]');
  } catch { selectors = []; }
  const patternsTxt = get('linkPatterns')?.value || '';
  const linkPatterns = patternsTxt.split(',').map(s => s.trim()).filter(Boolean);
  return {
    mode,
    selectors,
    includeOpenGraph: !!get('includeOpenGraph')?.checked,
    includeJsonLd: !!get('includeJsonLd')?.checked,
    linkSelector: get('linkSelector')?.value || undefined,
    linkPatterns: linkPatterns.length ? linkPatterns : undefined,
    deepScan: !!get('deepScan')?.checked,
    collectLinks: !!get('collectLinks')?.checked,
  };
}

function writeConfigToUI(cfg) {
  if (!cfg) return;
  // Advanced controls removed; keep function tolerant to missing elements
  const set = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
  set('selectors', 'value', JSON.stringify(cfg.selectors || [], null, 2));
  const og = document.getElementById('includeOpenGraph'); if (og) og.checked = !!cfg.includeOpenGraph;
  const jl = document.getElementById('includeJsonLd'); if (jl) jl.checked = !!cfg.includeJsonLd;
  set('linkSelector', 'value', cfg.linkSelector || '');
  set('linkPatterns', 'value', (cfg.linkPatterns || []).join(','));
}

async function saveConfig() {
  const config = readConfigFromUI({ mode: 'advanced' });
  await chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', payload: config });
}

async function loadConfig() {
  const res = await chrome.runtime.sendMessage({ type: 'LOAD_CONFIG' });
  return res?.config || null;
}

async function saveBackend() {
  const backend = { url: $("backendUrl").value || '', token: $("authToken").value || '' };
  await chrome.runtime.sendMessage({ type: 'SAVE_BACKEND', payload: backend });
}

async function loadBackend() {
  const res = await chrome.runtime.sendMessage({ type: 'LOAD_BACKEND' });
  return res?.backend || null;
}

function setOutput(obj) {
  const out = $("output");
  if (!out) return; // raw JSON hidden in simplified UI
  out.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}

function setLoading(on, msg = 'Working...') {
  const ov = $("loading");
  const lm = $("loadingMsg");
  if (lm) lm.textContent = msg;
  ov.style.display = on ? 'flex' : 'none';
  ["scrape","download","save","preview","send","openOptions","selectTable"].forEach(id => {
    const el = $(id); if (el) el.disabled = on;
  });
}

async function previewScrape() {
  const config = readConfigFromUI({ mode: 'advanced' });
  setLoading(true, 'Scraping...');
  const res = await chrome.runtime.sendMessage({ type: 'RUN_SCRAPE', payload: config });
  if (!res?.ok) throw new Error(res?.error || 'Scrape failed');
  LAST_RESULT = res.result;
  setOutput(res.result);
  updatePills(res.result);
  renderTables(res.result.tables || []);
  $("results").style.display = 'block';
  setLoading(false);
}

function copyToClipboard(text) {
  try { navigator.clipboard.writeText(text); } catch (_) {}
}

function downloadFile(filename, content, type = 'application/json', { bom = false } = {}) {
  const parts = [];
  if (bom && type.startsWith('text/csv')) parts.push('\ufeff');
  parts.push(content);
  const blob = new Blob(parts, { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function runAutoScrape() {
  const config = readConfigFromUI({ mode: 'auto' });
  setLoading(true, 'Scraping...');
  const res = await chrome.runtime.sendMessage({ type: 'RUN_SCRAPE', payload: config });
  if (!res?.ok) throw new Error(res?.error || 'Scrape failed');
  return res.result;
}

function updatePills(result) {
  const tables = Array.isArray(result?.tables) ? result.tables.length : 0;
  const links = Array.isArray(result?.links) ? result.links.length : 0;
  const images = Array.isArray(result?.images) ? result.images.length : (Array.isArray(result?.openGraph?.images) ? result.openGraph.images.length : 0);
  $("pillTables").textContent = `${tables} tables`;
  $("pillLinks").textContent = `${links} links`;
  $("pillImages").textContent = `${images} images`;
}

function renderTables(tables = []) {
  const hostEl = $("tablesList");
  hostEl.innerHTML = '';
  if (!Array.isArray(tables) || !tables.length) {
    hostEl.innerHTML = '<div class="muted">No tables detected on this page.</div>';
    return;
  }
  const sorted = [...tables].sort((a,b) => (b.score||0) - (a.score||0));
  sorted.slice(0, 50).forEach((t, idx) => {
    const card = document.createElement('div');
    card.style.marginBottom = '10px';
    const title = document.createElement('div');
    title.className = 'table-meta';
    const src = t.frameUrl ? ` <span class="muted">@ ${shortUrl(t.frameUrl)}</span>` : '';
    const cols = Array.isArray(t.headers) && t.headers.length ? t.headers.length : (Array.isArray(t.rows) && t.rows[0] ? t.rows[0].length : 0);
    const rcount = Array.isArray(t.rows) ? t.rows.length : 0;
    title.innerHTML = `<div style="flex:1;"><strong>#${idx+1}</strong> <span class="muted">${t.type || 'table'}</span> <span class="muted">${(t.selector || '').slice(0,80)}</span>${src}</div><div class="table-actions" style="flex:1;"><span class="pill">${rcount}×${cols}</span><button data-idx="${idx}" class="open-on-page">Open</button><button data-idx="${idx}" class="download-csv">CSV</button></div>`;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.className = 'table';
    const headers = Array.isArray(t.headers) && t.headers.length ? t.headers : (Array.isArray(t.rows) && t.rows[0] ? t.rows[0].map((_,i)=>`Col ${i+1}`) : []);
    if (headers.length) {
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      headers.forEach(h=>{ const th = document.createElement('th'); th.textContent = String(h||''); tr.appendChild(th); });
      thead.appendChild(tr); table.appendChild(thead);
    }
    const tbody = document.createElement('tbody');
    const previewRows = Array.isArray(t.rows) ? t.rows.slice(0, 12) : [];
    previewRows.forEach(r=>{
      const tr = document.createElement('tr');
      r.forEach(c=>{ const td = document.createElement('td'); td.textContent = String(c ?? ''); tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const scaler = document.createElement('div');
    scaler.className = 'scaler';
    scaler.appendChild(table);
    wrap.appendChild(scaler);
    card.appendChild(title);
    card.appendChild(wrap);
    // Native preview container (hidden until used)
    const nwrap = document.createElement('div');
    nwrap.className = 'native-wrap';
    nwrap.style.display = 'none';
    card.appendChild(nwrap);
    hostEl.appendChild(card);
  });

  // Wire download
  hostEl.querySelectorAll('.download-csv').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-idx'));
      const t = sorted[i];
      const delim = chooseCsvDelimiter();
      const csv = tableToCSV(t, { delimiter: delim });
      const host = safeHostFromResult(LAST_RESULT);
      downloadFile(`${host}-table-${i+1}.csv`, csv, 'text/csv;charset=utf-8;', { bom: true });
    });
  });
  hostEl.querySelectorAll('.open-on-page').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const i = Number(btn.getAttribute('data-idx'));
        const t = sorted[i];
        // Toggle native preview: fetch snapshot and display in iframe
        const container = btn.closest('.table-meta')?.parentElement; // parent is card container
        const nwrap = container?.querySelector('.native-wrap');
        const tableWrap = container?.querySelector('.table-wrap');
        if (nwrap && tableWrap) {
          // fetch snapshot lazily
          if (!nwrap.querySelector('iframe')) {
            const res = await chrome.runtime.sendMessage({ type: 'GET_TABLE_SNAPSHOT', payload: { selector: t.selector, frameId: t.frameId } });
            if (res?.ok && res.html) {
              const iframe = document.createElement('iframe');
              iframe.setAttribute('sandbox', 'allow-same-origin');
              iframe.srcdoc = res.html;
              nwrap.appendChild(iframe);
            }
          }
          // show native, hide ai-rendered table
          tableWrap.style.display = 'none';
          nwrap.style.display = 'block';
        }
        // Also scroll/flash on page
        await chrome.runtime.sendMessage({ type: 'HIGHLIGHT_TABLE', payload: { selector: t.selector, frameId: t.frameId } });
      } catch (e) {
        setOutput('Open error: ' + e.message);
      }
    });
  });
}

function shortUrl(u) {
  try {
    const url = new URL(u);
    const path = url.pathname || '/';
    const shortPath = path.length > 30 ? path.slice(0,30) + '…' : path;
    return `${url.hostname}${shortPath}`;
  } catch { return (u || '').slice(0, 40); }
}

function tableToCSV(t, { delimiter = ',' } = {}) {
  const rows = Array.isArray(t?.rows) ? t.rows : [];
  const escape = (v) => {
    const s = String(v ?? '');
    const needsQuote = s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delimiter);
    if (needsQuote) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = rows.map(r => r.map(escape).join(delimiter));
  return lines.join('\r\n');
}

function chooseCsvDelimiter() {
  try {
    const sel = document.getElementById('csvDelimiter');
    const override = sel && sel.value;
    if (override && override !== 'auto') return override;
  } catch {}
  try {
    const host = location.hostname || '';
    const lang = navigator.language || '';
    if (host.endsWith('.com.tr') || lang.toLowerCase().startsWith('tr')) return ';';
  } catch {}
  return ',';
}

function safeHostFromResult(res) {
  try {
    const url = res?.page?.url || location.href;
    const { hostname } = new URL(url);
    return hostname.replace(/[^a-z0-9.-]/gi, '_');
  } catch { return 'page'; }
}

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const cfg = await loadConfig();
      if (cfg) writeConfigToUI(cfg);

    // advanced controls removed
    $("scrape").addEventListener('click', async () => {
      try {
        const result = await runAutoScrape();
        LAST_RESULT = result;
        setOutput(result);
        updatePills(result);
        renderTables(result.tables || []);
        $("results").style.display = 'block';
      } catch (e) { setOutput('Error: ' + e.message); }
      finally { setLoading(false); }
    });
    // Copy button removed in simplified UI
    $("selectTable").addEventListener('click', async () => {
      try {
        setOutput('Selection started. Click a table on the page.');
        await chrome.runtime.sendMessage({ type: 'START_SELECTION' });
      } catch (e) {
        setOutput('Selection error: ' + e.message);
      }
    });

    // Note: side panel is default on action click; no need for an explicit button here
    
      $("download").addEventListener('click', async () => {
        try {
          let data = LAST_RESULT;
          if (!data) { data = await runAutoScrape(); LAST_RESULT = data; }
          const host = safeHostFromResult(LAST_RESULT);
          downloadFile(`${host}-scrape.json`, JSON.stringify(data, null, 2), 'application/json');
        } catch (e) {
          setOutput('Download error: ' + e.message);
        }
      });

      const dlBestBtn = document.getElementById('downloadBestCsv');
      if (dlBestBtn) {
        dlBestBtn.addEventListener('click', () => {
          try {
            const tables = Array.isArray(LAST_RESULT?.tables) ? LAST_RESULT.tables : [];
            if (!tables.length) { setOutput('No tables to download.'); return; }
            const sorted = [...tables].sort((a,b) => (b.score||0) - (a.score||0));
            const best = sorted[0];
            const delim = chooseCsvDelimiter();
            const host = safeHostFromResult(LAST_RESULT);
            const csv = tableToCSV(best, { delimiter: delim });
            downloadFile(`${host}-best.csv`, csv, 'text/csv;charset=utf-8;', { bom: true });
          } catch (e) { setOutput('Download error: ' + e.message); }
        });
      }

    const be = await loadBackend();
    const hasBackend = !!(be && be.url);
    $("send").style.display = hasBackend ? 'inline-block' : 'none';
    $("send").addEventListener('click', async () => {
      try {
        setLoading(true, 'Sending...');
        let data = LAST_RESULT;
        if (!data) { data = await runAutoScrape(); LAST_RESULT = data; }
        const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        if (be.token) init.headers['Authorization'] = be.token;
        const postRes = await chrome.runtime.sendMessage({ type: 'BACKGROUND_FETCH', payload: { url: be.url, init, options: { timeoutMs: 15000, retries: 2 } } });
        if (!postRes?.ok) throw new Error(postRes?.error || 'Upload failed');
        setOutput({ uploaded: true, status: postRes.response?.status, ok: postRes.response?.ok });
      } catch (e) { setOutput('Send error: ' + e.message); }
      finally { setLoading(false); }
    });

    $("openOptions").addEventListener('click', () => chrome.runtime.openOptionsPage());

    // If a selection was made while the popup was closed, incorporate it
    try {
      const r = await chrome.runtime.sendMessage({ type: 'GET_LAST_SELECTION', payload: { consume: true } });
      const sel = r?.selection;
      if (sel && sel.table) {
        if (!LAST_RESULT) {
          LAST_RESULT = { page: { url: 'selection', title: document.title || 'Selection' }, timestamp: new Date().toISOString(), tables: [] };
        }
        LAST_RESULT.tables = Array.isArray(LAST_RESULT.tables) ? LAST_RESULT.tables : [];
        LAST_RESULT.tables.unshift(sel.table);
        setOutput(LAST_RESULT);
        updatePills(LAST_RESULT);
        renderTables(LAST_RESULT.tables);
        $("results").style.display = 'block';
      }
    } catch {}

    // Zoom slider removed; previews render at fixed compact scale

    // If side panel is open, listen for selection ready to live-update
    try {
      chrome.runtime.onMessage.addListener(async (msg) => {
        if (msg && msg.type === 'SELECTION_READY') {
          try {
            const r2 = await chrome.runtime.sendMessage({ type: 'GET_LAST_SELECTION', payload: { consume: true } });
            const sel2 = r2?.selection;
            if (sel2 && sel2.table) {
              if (!LAST_RESULT) {
                LAST_RESULT = { page: { url: 'selection', title: document.title || 'Selection' }, timestamp: new Date().toISOString(), tables: [] };
              }
              LAST_RESULT.tables = Array.isArray(LAST_RESULT.tables) ? LAST_RESULT.tables : [];
              LAST_RESULT.tables.unshift(sel2.table);
              setOutput(LAST_RESULT);
              updatePills(LAST_RESULT);
              renderTables(LAST_RESULT.tables);
              $("results").style.display = 'block';
            }
          } catch {}
        }
      });
    } catch {}

    // Live-update when selection completes (e.g., side panel stays open)
    try {
      chrome.runtime.onMessage.addListener(async (msg) => {
        if (msg && msg.type === 'SELECTION_READY') {
          try {
            const r2 = await chrome.runtime.sendMessage({ type: 'GET_LAST_SELECTION', payload: { consume: true } });
            const sel2 = r2?.selection;
            if (sel2 && sel2.table) {
              if (!LAST_RESULT) {
                LAST_RESULT = { page: { url: 'selection', title: document.title || 'Selection' }, timestamp: new Date().toISOString(), tables: [] };
              }
              LAST_RESULT.tables = Array.isArray(LAST_RESULT.tables) ? LAST_RESULT.tables : [];
              LAST_RESULT.tables.unshift(sel2.table);
              setOutput(LAST_RESULT);
              updatePills(LAST_RESULT);
              renderTables(LAST_RESULT.tables);
              $("results").style.display = 'block';
            }
          } catch {}
        }
      });
    } catch {}
  } catch (e) {
    setOutput('Init error: ' + e.message);
  }
});
