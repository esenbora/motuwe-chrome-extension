const STORAGE_KEYS = {
  config: 'motuwe:config',
  backend: 'motuwe:backend',
};

function $(id) { return document.getElementById(id); }

async function loadAll() {
  const cfgRes = await chrome.runtime.sendMessage({ type: 'LOAD_CONFIG' });
  const beRes = await chrome.runtime.sendMessage({ type: 'LOAD_BACKEND' });
  const cfg = cfgRes?.config || {};
  const be = beRes?.backend || {};
  $("backendUrl").value = be.url || '';
  $("authToken").value = be.token || '';
  $("selectors").value = JSON.stringify(cfg.selectors || [], null, 2);
}

async function saveAll() {
  const cfg = { selectors: [] };
  try { cfg.selectors = JSON.parse($("selectors").value || '[]'); } catch { cfg.selectors = []; }
  await chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', payload: cfg });
  const be = { url: $("backendUrl").value || '', token: $("authToken").value || '' };
  await chrome.runtime.sendMessage({ type: 'SAVE_BACKEND', payload: be });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  $("save").addEventListener('click', async () => {
    try { await saveAll(); $("status").textContent = 'Saved.'; } catch (e) { $("status").textContent = 'Error: ' + e.message; }
  });
});

