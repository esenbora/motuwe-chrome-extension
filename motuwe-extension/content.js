// Motuwe Scraper - Content Script
// Receives RUN_SCRAPE and extracts page data per config.

function nowIso() {
  return new Date().toISOString();
}

function tryParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function isTransfermarktHost() {
  try { return /(^|\.)transfermarkt\./i.test(location.hostname); } catch { return false; }
}

async function acceptCookiesTM() {
  try {
    const btn = document.querySelector('#onetrust-accept-btn-handler, .ot-sdk-container #onetrust-accept-btn-handler');
    if (btn) { btn.click(); await new Promise(r => setTimeout(r, 300)); }
  } catch {}
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

async function waitForIdle({ minQuietMs = 1200, timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, timeoutMs);

    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };

    let idleTimer;
    const mo = new MutationObserver(() => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(done, minQuietMs);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    idleTimer = setTimeout(done, minQuietMs);
  });
}

async function autoScroll({ stepPx = 800, maxSteps = 8, waitMs = 350 } = {}) {
  for (let i = 0; i < maxSteps; i++) {
    window.scrollBy(0, stepPx);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  window.scrollTo(0, 0);
}

function getText(el) {
  return (el?.textContent || '').trim();
}

function getAttr(el, attr) {
  if (!attr || attr === 'text' || attr === 'textContent') return getText(el);
  return el?.getAttribute?.(attr) || '';
}

function extractBySelectors(selectors = []) {
  const out = {};
  for (const s of selectors) {
    const name = s.name || s.key || s.selector;
    if (!name || !s.selector) continue;
    if (s.all) {
      const nodes = Array.from(document.querySelectorAll(s.selector));
      out[name] = nodes.map((n) => getAttr(n, s.attr));
    } else {
      const node = document.querySelector(s.selector);
      out[name] = node ? getAttr(node, s.attr) : '';
    }
  }
  return out;
}

function extractOpenGraph() {
  const metas = Array.from(document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]'));
  const data = {};
  for (const m of metas) {
    const key = m.getAttribute('property') || m.getAttribute('name');
    const val = m.getAttribute('content');
    if (key && val) data[key] = val;
  }
  return data;
}

function extractJsonLd() {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  const data = [];
  for (const s of scripts) {
    const parsed = tryParseJSON(s.textContent);
    if (parsed) data.push(parsed);
  }
  return data;
}

function pickLargestImages(max = 8) {
  const imgs = Array.from(document.images || []);
  const scored = imgs
    .map((img) => ({ src: img.currentSrc || img.src, area: (img.naturalWidth || 0) * (img.naturalHeight || 0) }))
    .filter((x) => x.src)
    .sort((a, b) => b.area - a.area);
  return uniq(scored.map((x) => x.src)).slice(0, max);
}

function findTitle() {
  const fromOg = document.querySelector('meta[property="og:title"], meta[name="twitter:title"]')?.content;
  if (fromOg) return fromOg.trim();
  const h1 = document.querySelector('h1');
  if (h1) return getText(h1);
  const itemName = document.querySelector('[itemprop="name"], [data-testid*="title" i]');
  if (itemName) return getText(itemName);
  return document.title || '';
}

function findDescription() {
  const m = document.querySelector('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]');
  if (m?.content) return m.content.trim();
  const p = document.querySelector('article p, .description, [itemprop="description"]');
  if (p) return getText(p);
  return '';
}

function parsePrice(text) {
  if (!text) return null;
  const m = String(text).match(/([€$£₺]|USD|EUR|TRY)\s?([0-9]+(?:[.,][0-9]{2})?)/i);
  if (!m) return null;
  return { raw: m[0], currency: m[1], value: m[2] };
}

function findPrice() {
  const el = document.querySelector('[itemprop="price"], [data-price], [data-testid*="price" i], .price, .product-price');
  if (el) return parsePrice(getText(el));
  const meta = document.querySelector('meta[itemprop="price"]')?.content;
  if (meta) return parsePrice(meta);
  return null;
}

function autoExtractBasics() {
  const title = findTitle();
  const description = findDescription();
  const price = findPrice();
  const og = extractOpenGraph();
  const jsonLd = extractJsonLd();
  const images = uniq([
    og['og:image'],
    og['twitter:image'],
    ...pickLargestImages(6),
  ].filter(Boolean));
  return { title, description, price, images, og, jsonLd };
}

function extractLinks({ linkSelector, linkPatterns }) {
  let links = [];
  const els = Array.from(document.querySelectorAll(linkSelector || 'a[href]'));
  for (const a of els) {
    const href = a.href || a.getAttribute('href');
    if (!href) continue;
    links.push(href);
  }
  links = uniq(links);
  if (Array.isArray(linkPatterns) && linkPatterns.length) {
    const regs = linkPatterns.map((p) => {
      try { return new RegExp(p); } catch { return null; }
    }).filter(Boolean);
    links = links.filter((l) => regs.some((re) => re.test(l)));
  }
  return links;
}

function extractTables({ tableSelector }) {
  if (!tableSelector) return [];
  const tables = Array.from(document.querySelectorAll(tableSelector));
  return tables.map((t) => tableToMatrix(t));
}

function extractKVFromTable(table) {
  const out = {};
  const rows = Array.from(table.querySelectorAll('tr'));
  for (const r of rows) {
    const th = r.querySelector('th');
    const td = r.querySelector('td');
    const k = getText(th);
    const v = getText(td);
    if (k) out[k] = v;
  }
  return out;
}

function extractTransfermarktKV() {
  const kv = {};
  const tables = Array.from(document.querySelectorAll('table.auflistung'));
  for (const t of tables) Object.assign(kv, extractKVFromTable(t));
  // Common keys normalization (best-effort)
  const map = {
    'Geb./Alter': 'Birth/Age',
    'Geburtsdatum': 'Birth date',
    'Nationalität': 'Citizenship',
    'Position': 'Position',
    'Fuß': 'Foot',
    'Größe': 'Height',
    'Aktueller Verein': 'Current club',
    'Vertrag bis': 'Contract until',
    'Marktwert': 'Market value',
  };
  const norm = {};
  for (const [k, v] of Object.entries(kv)) norm[map[k] || k] = v;
  // Market value fallback
  const mvEl = document.querySelector('.dataMarktwert, .tm-player-market-value-development .data');
  if (mvEl && !norm['Market value']) norm['Market value'] = getText(mvEl);
  return norm;
}

function extractTransfermarktTables() {
  const sel = 'table.items, table.tabelle, table.auflistung, table.responsive-table';
  const tables = Array.from(document.querySelectorAll(sel));
  return tables.map((t) => tableToMatrix(t));
}

function extractTransfermarktBasics() {
  const name = getText(document.querySelector('h1[itemprop="name"], h1.spielername, h1')); 
  const kv = extractTransfermarktKV();
  const club = kv['Current club'] || getText(document.querySelector('.dataZusatz .hide-for-small a, .dataContent a.vereinprofil_tooltip'));
  const marketValue = kv['Market value'] || getText(document.querySelector('.dataMarktwert'));
  const pageType = (location.pathname.includes('/spieler/') || location.pathname.includes('/player/'))
    ? 'player'
    : (location.pathname.includes('/verein/') || location.pathname.includes('/club/'))
      ? 'club'
      : (location.pathname.includes('/wettbewerb/') || location.pathname.includes('/competition/'))
        ? 'competition'
        : 'page';
  return { name, club, marketValue, kv, pageType };
}


function isVisible(el) {
  if (!el || !el.ownerDocument) return false;
  const cs = el.ownerDocument.defaultView?.getComputedStyle?.(el);
  if (!cs) return true;
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

function tableToMatrix(tableEl) {
  const headers = [];
  const headerRowEls = tableEl.querySelectorAll('thead tr, tr:has(th)');
  if (headerRowEls.length) {
    const first = headerRowEls[0];
    const ths = Array.from(first.querySelectorAll('th'));
    for (const th of ths) headers.push(getText(th));
  }
  const rows = [];
  const rowEls = Array.from(tableEl.querySelectorAll('tbody tr, tr')).filter((tr) => tr.querySelector('td,th'));
  for (const r of rowEls) {
    const cells = Array.from(r.querySelectorAll('th,td')).map((c) => getText(c));
    if (cells.length) rows.push(cells);
  }
  const objects = headers.length ? rows.map((row) => Object.fromEntries(headers.map((h, i) => [h || String(i), row[i] ?? '']))) : [];
  return { type: 'html-table', selector: cssPath(tableEl), headers, rows, objects };
}

function ariaGridToMatrix(root) {
  const rows = [];
  const rowEls = Array.from(root.querySelectorAll('[role="row"]'));
  const headers = Array.from(root.querySelectorAll('[role="columnheader"], [role="rowheader"]'))
    .slice(0, 50)
    .map((el) => getText(el));
  for (const r of rowEls) {
    const cells = Array.from(r.querySelectorAll('[role="gridcell"], [role="cell"], [role="columnheader"], [role="rowheader"]')).map((c) => getText(c));
    if (cells.length) rows.push(cells);
  }
  const objects = headers.length ? rows.map((row) => Object.fromEntries(headers.map((h, i) => [h || String(i), row[i] ?? '']))) : [];
  return { type: 'aria-grid', selector: cssPath(root), headers, rows, objects };
}

function cssPath(el) {
  try {
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 6) {
      let part = el.nodeName.toLowerCase();
      if (el.id) { part += `#${el.id}`; parts.unshift(part); break; }
      const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0,2);
      if (cls.length) part += '.' + cls.join('.');
      const parent = el.parentElement;
      if (parent) {
        const idx = Array.from(parent.children).filter((c) => c.nodeName === el.nodeName).indexOf(el);
        if (idx >= 0) part += `:nth-of-type(${idx+1})`;
      }
      parts.unshift(part);
      el = el.parentElement;
    }
    return parts.join(' > ');
  } catch { return ''; }
}

function extractDisplayTables() {
  const out = [];
  const tables = Array.from(document.querySelectorAll('table')).filter(isVisible).slice(0, 20);
  for (const t of tables) out.push(tableToMatrix(t));

  const ariaRoots = Array.from(document.querySelectorAll('[role="table"], [role="grid"]')).filter(isVisible).slice(0, 20);
  for (const r of ariaRoots) out.push(ariaGridToMatrix(r));

  // Detect CSS display table/gird-like structures
  const all = Array.from(document.querySelectorAll('*')).slice(0, 2000);
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!cs) continue;
    if ((cs.display === 'table' || cs.display === 'inline-table') && el.querySelector('tr, [role="row"]')) {
      out.push({ type: 'css-table', selector: cssPath(el), headers: [], rows: Array.from(el.querySelectorAll('tr')).map((r) => Array.from(r.children).map((c) => getText(c))), objects: [] });
    }
  }
  // Remove duplicates by selector+type
  const seen = new Set();
  return out.filter((t) => {
    const k = `${t.type}|${t.selector}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return t.rows?.length;
  });
}

async function runScrape(config = {}) {
  const cfg = config || {};
  if (cfg.deepScan) {
    await autoScroll({});
  }
  await waitForIdle({});

  const mode = cfg.mode || 'auto';
  const base = {
    page: { url: location.href, title: document.title },
    timestamp: nowIso(),
  };

  // Site-specific: Transfermarkt
  if (isTransfermarktHost()) {
    await acceptCookiesTM();
    const tmBasics = extractTransfermarktBasics();
    const tmTables = extractTransfermarktTables();
    const data = { ...base, site: 'transfermarkt', tm: tmBasics };
    data.tables = (data.tables || []).concat(tmTables);
    if (mode === 'advanced') {
      data.selectors = extractBySelectors(cfg.selectors || []);
      if (cfg.includeOpenGraph) data.openGraph = extractOpenGraph();
      if (cfg.includeJsonLd) data.jsonLd = extractJsonLd();
    } else {
      // auto: also include OG/JSON-LD for richer context
      data.openGraph = extractOpenGraph();
      data.jsonLd = extractJsonLd();
    }
    if (cfg.collectLinks || cfg.linkPatterns) {
      const links = extractLinks({ linkSelector: cfg.linkSelector, linkPatterns: cfg.linkPatterns || ["/spieler/", "/player/"] });
      data.links = links;
    }
    return data;
  }

  if (mode === 'advanced') {
    const data = { ...base, selectors: extractBySelectors(cfg.selectors || []) };
    if (cfg.includeOpenGraph) data.openGraph = extractOpenGraph();
    if (cfg.includeJsonLd) data.jsonLd = extractJsonLd();
    if (cfg.linkSelector || (cfg.linkPatterns && cfg.linkPatterns.length)) data.links = extractLinks(cfg);
    const tables = [];
    if (cfg.tableSelector) tables.push(...extractTables(cfg));
    // also include auto-detected tables in advanced unless explicitly disabled
    if (cfg.autoTables !== false) tables.push(...extractDisplayTables());
    if (tables.length) data.tables = tables;
    return data;
  }

  // auto mode: opinionated extraction for end users
  const basics = autoExtractBasics();
  const data = { ...base, ...basics };
  // auto include detected tables for end users
  data.tables = extractDisplayTables();
  if (cfg.collectLinks || (cfg.linkPatterns && cfg.linkPatterns.length)) {
    data.links = extractLinks({ linkSelector: cfg.linkSelector, linkPatterns: cfg.linkPatterns });
  }
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'RUN_SCRAPE') {
      const result = await runScrape(msg.payload || {});
      sendResponse(result);
    }
  })().catch((err) => {
    console.error('Content script error:', err);
    try { sendResponse({ error: String(err?.message || err) }); } catch (_) {}
  });
  return true;
});
// --- fbref support and comment-embedded table parsing ---
function isFbrefHost() {
  try { return /(^|\.)fbref\.com$/i.test(location.hostname) || /fbref\.com$/i.test(location.hostname); } catch { return false; }
}

function extractTablesFromComments({ limit = 10 } = {}) {
  const out = [];
  try {
    const root = document.body || document;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT, null);
    let node; let count = 0;
    while ((node = walker.nextNode())) {
      const txt = node.textContent || '';
      if (txt.includes('<table') && txt.includes('</table')) {
        try {
          const doc = new DOMParser().parseFromString(txt, 'text/html');
          const tables = Array.from(doc.querySelectorAll('table')).slice(0, 3);
          for (const t of tables) {
            const m = tableToMatrix(t);
            m.type = 'comment-table';
            const parent = node.parentElement;
            m.selector = parent ? (typeof cssPath === 'function' ? cssPath(parent) : '(comment)') + ' (comment)' : '(comment)';
            out.push(m);
            count++;
            if (count >= limit) return out;
          }
        } catch {}
      }
      if (count >= limit) break;
    }
  } catch {}
  return out;
}

// Enhance existing functions without rewriting the whole file
(function enhanceForFbref() {
  try {
    if (typeof extractDisplayTables === 'function') {
      const _origExtractDisplayTables = extractDisplayTables;
      extractDisplayTables = function() {
        const base = _origExtractDisplayTables ? _origExtractDisplayTables() : [];
        const extra = extractTablesFromComments({ limit: 10 });
        return [...base, ...extra];
      };
    }
  } catch {}

  try {
    if (typeof runScrape === 'function') {
      const _origRunScrape = runScrape;
      runScrape = async function(config = {}) {
        const data = await _origRunScrape(config);
        if (isFbrefHost()) {
          try { materializeFbrefCommentTables(); } catch {}
          let fbTables = extractFbrefAllTables({ limit: 200 });
          if (!fbTables.length) {
            // Fallback: refetch raw HTML and parse all tables
            try {
              const html = await fetch(location.href, { credentials: 'include', cache: 'no-cache' }).then(r => r.text());
              fbTables = extractFbrefFromHtmlString(html, { limit: 200 });
            } catch {}
          }
          if (fbTables.length) data.tables = fbTables;
        }
        return data;
      };
    }
  } catch {}
})();

// Stronger FBref parsing utilities
function extractFbrefAllTables({ limit = 300 } = {}) {
  try {
    const fromDom = extractFbrefTablesFromDom({ limit });
    const fromComments = extractFbrefTablesFromComments({ limit });
    const fromAllDivs = extractFbrefFromAllDivInnerHTML({ limit });
    const all = [...fromAllDivs, ...fromComments, ...fromDom];
    // Keep all (avoid aggressive dedupe that might drop distinct tables)
    return all.slice(0, limit);
  } catch { return []; }
}

function extractFbrefTablesFromDom({ limit = 200 } = {}) {
  // Capture all tables on page, not only stats_*; FBref uses many wrappers
  const tables = Array.from(document.querySelectorAll('table')).slice(0, limit);
  return tables.map(fbrefTableToMatrix);
}

function extractFbrefTablesFromComments({ limit = 100 } = {}) {
  const results = [];
  try {
    // Walk all comments in document; FBref hides tables widely
    const root = document.body || document;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT, null);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent || '';
      if (!txt.includes('<table')) continue;
      try {
        const cleaned = txt.replace(/^\s*-->|<!--\s*|\s*-->\s*$/g, '');
        const doc = new DOMParser().parseFromString(cleaned, 'text/html');
        const tables = Array.from(doc.querySelectorAll('table'));
        for (const t of tables) {
          results.push(fbrefTableToMatrix(t));
          if (results.length >= limit) return results;
        }
      } catch {}
      if (results.length >= limit) break;
    }
  } catch {}
  return results;
}

function extractFbrefFromAllDivInnerHTML({ limit = 150 } = {}) {
  const out = [];
  try {
    const holders = Array.from(document.querySelectorAll('div[id^="all_"]'));
    for (const h of holders) {
      const html = h.innerHTML || '';
      if (!html || html.indexOf('<table') === -1) continue;
      try {
        const cleaned = html.replace(/<!--/g, '').replace(/-->/g, '');
        const doc = new DOMParser().parseFromString(cleaned, 'text/html');
        const tables = Array.from(doc.querySelectorAll('table'));
        for (const t of tables) {
          const m = fbrefTableToMatrix(t);
          // If table id is missing (because parsed from fragment), synthesize from holder id
          if ((!m.selector || !m.selector.startsWith('#')) && h.id) m.selector = `#${h.id.replace(/^all_/, 'stats_')}`;
          out.push(m);
          if (out.length >= limit) return out;
        }
      } catch {}
    }
  } catch {}
  return out;
}

function materializeFbrefCommentTables() {
  // Insert hidden parsed tables from comment blocks into DOM to aid selection
  try {
    const holders = Array.from(document.querySelectorAll('div[id^="all_"]'));
    for (const h of holders) {
      // Skip if already materialized
      if (h.querySelector('.motuwe-materialized')) continue;
      const walker = document.createTreeWalker(h, NodeFilter.SHOW_COMMENT, null);
      let node; let injected = false;
      while ((node = walker.nextNode())) {
        const txt = node.textContent || '';
        if (!txt.includes('<table')) continue;
        try {
          const cleaned = txt.replace(/^\s*-->|<!--\s*|\s*-->\s*$/g, '');
          const doc = new DOMParser().parseFromString(cleaned, 'text/html');
          const frag = document.createElement('div');
          frag.className = 'motuwe-materialized';
          frag.style.display = 'none';
          const inner = doc.body ? Array.from(doc.body.childNodes) : [];
          for (const n of inner) frag.appendChild(document.importNode(n, true));
          h.appendChild(frag);
          injected = true;
        } catch {}
      }
      if (!injected) continue;
    }
  } catch {}
}

function extractFbrefFromHtmlString(html, { limit = 200 } = {}) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const domTables = Array.from(doc.querySelectorAll('table.stats_table, table[id^="stats_"], div.table_container table')).map(fbrefTableToMatrix);
    // Comments in string doc
    const results = [];
    const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_COMMENT, null);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent || '';
      if (!txt.includes('<table')) continue;
      try {
        const cleaned = txt.replace(/^\s*-->|<!--\s*|\s*-->\s*$/g, '');
        const sub = new DOMParser().parseFromString(cleaned, 'text/html');
        const tables = Array.from(sub.querySelectorAll('table'));
        for (const t of tables) {
          results.push(fbrefTableToMatrix(t));
          if (results.length >= limit) break;
        }
      } catch {}
      if (results.length >= limit) break;
    }
    const all = [...results, ...domTables];
    const byId = new Map();
    for (const t of all) {
      const idMatch = (t.selector || '').match(/^#([A-Za-z0-9_-]+)/);
      const key = idMatch ? `id:${idMatch[1]}` : `idx:${byId.size}`;
      if (!byId.has(key)) byId.set(key, t);
      if (byId.size >= limit) break;
    }
    return Array.from(byId.values());
  } catch { return []; }
}

function fbrefTableToMatrix(tableEl) {
  try {
    // Determine headers from the last header row with th scope="col"
    const headerRows = Array.from(tableEl.querySelectorAll('thead tr'));
    let headerCells = [];
    for (let i = headerRows.length - 1; i >= 0; i--) {
      const cells = Array.from(headerRows[i].querySelectorAll('th'));
      if (cells.length) { headerCells = cells; break; }
    }
    let headers = headerCells.map((th) => th.getAttribute('data-stat') || getText(th) || '');
    // Infer headers from first body row if header row is sparse
    const bodyRowsAll = Array.from(tableEl.querySelectorAll('tbody tr'));
    const firstBody = bodyRowsAll.find(r => r.querySelector('td')) || tableEl.querySelector('tbody tr');
    const firstBodyCells = firstBody ? Array.from(firstBody.querySelectorAll('th,td')) : [];
    if (!headers.length || headers.filter(h => h && h.trim()).length < Math.floor((firstBodyCells.length || 0) * 0.6)) {
      headers = firstBodyCells.map((c, i) => (c.getAttribute && c.getAttribute('data-stat')) || getText(c) || `Col ${i+1}`);
    }
    headers = headers.map((h, i) => (h && h.trim()) ? h.trim() : `Col ${i+1}`);

    const rows = [];
    let bodyRows = Array.from(tableEl.querySelectorAll('tbody tr'));
    if (!bodyRows.length) bodyRows = Array.from(tableEl.querySelectorAll('tr'));
    for (const r of bodyRows) {
      const cls = (r.className || '').toString();
      if (/thead|over_header|spacer|partial_table/i.test(cls)) continue; // skip repeated headers/separators
      const cells = Array.from(r.querySelectorAll('th,td'));
      if (!cells.length) continue;
      const row = cells.map((c) => getText(c));
      if (row.some((v) => v && v.trim().length)) rows.push(row);
    }

    // Include tfoot totals if present
    const footRows = Array.from(tableEl.querySelectorAll('tfoot tr'));
    for (const r of footRows) {
      const cells = Array.from(r.querySelectorAll('th,td'));
      const row = cells.map((c) => getText(c));
      if (row.some((v) => v && v.trim().length)) rows.push(row);
    }

    const objects = headers.length ? rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))) : [];

    const sel = tableEl.id ? `#${tableEl.id}` : (typeof cssPath === 'function' ? cssPath(tableEl) : '');
    return { type: 'fbref-table', selector: sel, headers, rows, objects };
  } catch {
    // fallback to generic
    return tableToMatrix(tableEl);
  }
}
