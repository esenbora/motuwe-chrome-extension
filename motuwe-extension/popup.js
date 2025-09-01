const STORAGE_KEYS = { config: 'motuwe:config', backend: 'motuwe:backend' };
let LAST_RESULT = null;

function $(id) { return document.getElementById(id); }

function readConfigFromUI({ mode = 'advanced' } = {}) {
  let selectors = [];
  try { selectors = JSON.parse($("selectors").value || '[]'); } catch { selectors = []; }
  const linkPatterns = ($("linkPatterns").value || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    mode,
    selectors,
    includeOpenGraph: $("includeOpenGraph").checked,
    includeJsonLd: $("includeJsonLd").checked,
    linkSelector: $("linkSelector").value || undefined,
    linkPatterns: linkPatterns.length ? linkPatterns : undefined,
    deepScan: $("deepScan").checked,
    collectLinks: $("collectLinks").checked,
  };
}

function writeConfigToUI(cfg) {
  if (!cfg) return;
  $("selectors").value = JSON.stringify(cfg.selectors || [], null, 2);
  $("includeOpenGraph").checked = !!cfg.includeOpenGraph;
  $("includeJsonLd").checked = !!cfg.includeJsonLd;
  $("linkSelector").value = cfg.linkSelector || '';
  $("linkPatterns").value = (cfg.linkPatterns || []).join(',');
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
  $("output").textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}

function setLoading(on, msg = 'Working...') {
  const ov = $("loading");
  const lm = $("loadingMsg");
  if (lm) lm.textContent = msg;
  ov.style.display = on ? 'flex' : 'none';
  ["scrape","copy","download","save","preview","send","openOptions"].forEach(id => {
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
  tables.slice(0, 50).forEach((t, idx) => {
    const card = document.createElement('div');
    card.style.marginBottom = '10px';
    const title = document.createElement('div');
    title.innerHTML = `<div class="row"><div><strong>#${idx+1}</strong> <span class="muted">${t.type || 'table'}</span> <span class="muted">${(t.selector || '').slice(0,80)}</span></div><div style=\"text-align:right\"><button data-idx=\"${idx}\" class=\"copy-json\">Copy JSON</button> <button data-idx=\"${idx}\" class=\"download-csv\">CSV</button></div></div>`;
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
    const rows = Array.isArray(t.rows) ? t.rows.slice(0, 20) : [];
    rows.forEach(r=>{
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
    hostEl.appendChild(card);
  });

  // Wire copy/download
  hostEl.querySelectorAll('.copy-json').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-idx'));
      const t = tables[i];
      copyToClipboard(JSON.stringify(t, null, 2));
    });
  });
  hostEl.querySelectorAll('.download-csv').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-idx'));
      const t = tables[i];
      const delim = chooseCsvDelimiter();
      const csv = tableToCSV(t, { delimiter: delim });
      const host = safeHostFromResult(LAST_RESULT);
      downloadFile(`${host}-table-${i+1}.csv`, csv, 'text/csv;charset=utf-8;', { bom: true });
    });
  });
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

    $("save").addEventListener('click', async () => {
      try {
        await saveConfig();
        setOutput('Saved.');
      } catch (e) { setOutput('Save error: ' + e.message); }
    });
    $("preview").addEventListener('click', async () => {
      setOutput('Running...');
      try { await previewScrape(); } catch (e) { setOutput('Preview error: ' + e.message); }
    });
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
    $("copy").addEventListener('click', async () => {
      const text = $("output").textContent || '';
      copyToClipboard(text);
      setOutput('Copied to clipboard.');
    });
    $("download").addEventListener('click', async () => {
      const text = $("output").textContent || '';
      if (!text) return setOutput('Nothing to download.');
      const host = safeHostFromResult(LAST_RESULT);
      downloadFile(`${host}-scrape.json`, text, 'application/json');
    });

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
  } catch (e) {
    setOutput('Init error: ' + e.message);
  }
});
