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
  $("defIncludeOpenGraph").checked = !!cfg.includeOpenGraph;
  $("defIncludeJsonLd").checked = !!cfg.includeJsonLd;
  $("defDeepScan").checked = !!cfg.deepScan;
  $("defCollectLinks").checked = !!cfg.collectLinks;
}

async function saveAll() {
  const cfg = { selectors: [] };
  try { cfg.selectors = JSON.parse($("selectors").value || '[]'); } catch { cfg.selectors = []; }
  cfg.includeOpenGraph = $("defIncludeOpenGraph").checked;
  cfg.includeJsonLd = $("defIncludeJsonLd").checked;
  cfg.deepScan = $("defDeepScan").checked;
  cfg.collectLinks = $("defCollectLinks").checked;
  await chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', payload: cfg });
  const be = { url: $("backendUrl").value || '', token: $("authToken").value || '' };
  await chrome.runtime.sendMessage({ type: 'SAVE_BACKEND', payload: be });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  $("save").addEventListener('click', async () => {
    try { await saveAll(); $("status").textContent = 'Saved.'; } catch (e) { $("status").textContent = 'Error: ' + e.message; }
  });
  // Presets
  $("presetTransfermarkt").addEventListener('click', () => {
    const preset = [
      { name: 'player-name', selector: 'h1[itemprop="name"], h1.spielername, h1' },
      { name: 'market-value', selector: '.dataMarktwert, .tm-player-market-value-development .data' },
    ];
    $("selectors").value = JSON.stringify(preset, null, 2);
    $("defCollectLinks").checked = true;
    $("defIncludeOpenGraph").checked = true;
  });
  $("presetFbref").addEventListener('click', () => {
    const preset = [
      { name: 'page-title', selector: 'h1' },
      { name: 'season', selector: 'select#season, .filter select' },
    ];
    $("selectors").value = JSON.stringify(preset, null, 2);
    $("defIncludeJsonLd").checked = true;
  });
});
