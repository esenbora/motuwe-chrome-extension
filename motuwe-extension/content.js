// Motuwe Scraper - Content Script
// Receives RUN_SCRAPE and extracts page data per config.
// Idempotent guard: avoid duplicate listeners when reinjected
if (typeof window !== 'undefined') {
  try {
    if (!window.__motuweInjected) {
      window.__motuweInjected = true;
    }
  } catch {}
}

// Scan tuning flag set per run
let __motuweDeepScan = false;

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

function isYouTubeHost() {
  try { return /(^|\.)youtube\.com$/i.test(location.hostname) || /(^|\.)m\.youtube\.com$/i.test(location.hostname); } catch { return false; }
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
  return tables.map((t) => {
    const m = tableToMatrix(t);
    m.type = 'tm-table';
    m.site = 'transfermarkt';
    return m;
  });
}

// tm-roster removed per request; rely on generic table extraction

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
  const allRows = Array.from(tableEl.querySelectorAll('tr')).filter(tr => tr.querySelector('td,th'));
  const grid = [];
  let maxCols = 0;
  for (let r = 0; r < allRows.length; r++) {
    const rowEl = allRows[r];
    const cells = Array.from(rowEl.querySelectorAll('th,td'));
    grid[r] = grid[r] || [];
    let c = 0;
    for (const cell of cells) {
      while (grid[r][c] !== undefined) c++;
      const colSpan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10));
      const rowSpan = Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10));
      const text = getText(cell);
      for (let rr = 0; rr < rowSpan; rr++) {
        const rIndex = r + rr;
        grid[rIndex] = grid[rIndex] || [];
        for (let cc = 0; cc < colSpan; cc++) {
          const cIndex = c + cc;
          grid[rIndex][cIndex] = text;
          if (cIndex + 1 > maxCols) maxCols = cIndex + 1;
        }
      }
      c += colSpan;
    }
  }
  const headerRows = Array.from(tableEl.querySelectorAll('thead tr'));
  let headers = [];
  if (headerRows.length) {
    const headIndex = allRows.indexOf(headerRows[headerRows.length - 1]);
    if (headIndex >= 0) headers = (grid[headIndex] || []).map((h, i) => h || `Col ${i + 1}`);
  } else {
    const thIndex = allRows.findIndex(r => r.querySelector('th'));
    if (thIndex >= 0) headers = (grid[thIndex] || []).map((h, i) => h || `Col ${i + 1}`);
  }
  const rows = grid.filter((row) => row && row.length && row.some(v => v && String(v).trim().length));
  const objects = headers.length ? rows.map((row) => Object.fromEntries(headers.map((h, i) => [h || String(i), row[i] ?? '']))) : [];
  const selector = cssPath(tableEl);
  let elWidth = 0, elHeight = 0, area = 0;
  try { const r = tableEl.getBoundingClientRect(); elWidth = Math.round(r.width); elHeight = Math.round(r.height); area = Math.round(r.width * r.height); } catch {}
  return { type: 'html-table', selector, headers, rows, objects, rowsCount: rows.length, colsCount: maxCols, elWidth, elHeight, area };
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
  let elWidth = 0, elHeight = 0, area = 0; try { const r = root.getBoundingClientRect(); elWidth = Math.round(r.width); elHeight = Math.round(r.height); area = Math.round(r.width * r.height); } catch {}
  return { type: 'aria-grid', selector: cssPath(root), headers, rows, objects, elWidth, elHeight, area };
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

  // Detect CSS display table/grid-like structures (capped unless deep scan)
  const cap = __motuweDeepScan ? 2000 : 800;
  const all = Array.from(document.querySelectorAll('*')).slice(0, cap);
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!cs) continue;
    if ((cs.display === 'table' || cs.display === 'inline-table') && el.querySelector('tr, [role="row"]')) {
      out.push({ type: 'css-table', selector: cssPath(el), headers: [], rows: Array.from(el.querySelectorAll('tr')).map((r) => Array.from(r.children).map((c) => getText(c))), objects: [] });
    }
  }

  // Pseudo-table detection: repeated cards/lists → table
  try {
    const pseudo = detectPseudoTables({ minItems: 5, maxContainers: 30, capNodes: __motuweDeepScan ? 5000 : 2000 });
    if (pseudo.length) out.push(...pseudo);
  } catch {}
  // Remove duplicates by selector+type
  const seen = new Set();
  let deduped = out.filter((t) => {
    const k = `${t.type}|${t.selector}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return t.rows?.length;
  });
  // Keep all types; rely on scoring to de-prioritize noisy css-table
  // Helpers for scoring
  const alphaRe = /[A-Za-z--]/; // rough alpha including some accents
  const isMostlyNumeric = (s) => {
    const str = String(s || '').trim();
    if (!str) return false;
    if (/^[-+]?\d+[\d.,/\-\s]*$/.test(str)) return true; // numbers, dates-like
    if (/^(\d{1,2}[./-]){2}\d{2,4}$/.test(str)) return true; // date
    return false;
  };
  const headerQualityScore = (headers = []) => {
    if (!headers || !headers.length) return 0;
    let good = 0;
    for (const h of headers) {
      const s = String(h || '').trim();
      if (s && alphaRe.test(s) && s.length >= 2 && !/^col\s*\d+$/i.test(s)) good++;
    }
    return good / headers.length;
  };

  // Score and sort best-first
  for (const t of deduped) {
    const rc = Array.isArray(t.rows) ? t.rows.length : (t.rowsCount || 0);
    const cc = Array.isArray(t.headers) && t.headers.length ? t.headers.length : (Array.isArray(t.rows) && t.rows[0] ? t.rows[0].length : (t.colsCount || 0));
    const hq = headerQualityScore(t.headers || []);
    // Ratios
    let total = 0, numeric = 0, nonempty = 0;
    try {
      for (const row of (t.rows || [])) {
        for (const v of row) {
          total++;
          const s = String(v || '').trim();
          if (s) nonempty++;
          if (isMostlyNumeric(s)) numeric++;
        }
      }
    } catch {}
    const fillRatio = total ? nonempty / total : 0.5;
    const numericRatio = total ? numeric / total : 0.0;

    // Base: prefer moderate density (avoid ultra-wide/ultra-long noise grids)
    const density = Math.min(4000, rc * Math.min(cc, 30));
    let score = density + Math.floor(hq * 500) + Math.floor(fillRatio * 300);
    // Penalties
    if (cc > 24) score -= (cc - 24) * 60;
    if (numericRatio > 0.65) score -= Math.floor((numericRatio - 0.65) * 800);
    // Area has smaller weight
    score += Math.min(800, Math.floor((t.area || 0) / 4000));

    // Heuristic boosts for meaningful headers (common table words)
    try {
      const headerStr = (t.headers || []).join(' ').toLowerCase();
      const keywords = ['oyuncu','player','poz','position','kulüp','club','uyruk','nation','piyasa','market','age','yaş','doğum','born'];
      if (keywords.some(k => headerStr.includes(k))) score += 600;
    } catch {}

    t.rowsCount = rc; t.colsCount = cc; t.score = score;
  }
  return deduped.sort((a, b) => (b.score || 0) - (a.score || 0));
}

// ---------- Pseudo-table detection (domain-agnostic) ----------
function getSig(el) {
  try {
    const tag = el.tagName.toLowerCase();
    const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean);
    const first = cls.slice(0, 2).join('.');
    return first ? `${tag}.${first}` : tag;
  } catch { return el.tagName ? el.tagName.toLowerCase() : 'node'; }
}

function detectRepeatedChildGroup(container) {
  const groups = new Map();
  for (const ch of Array.from(container.children)) {
    const sig = getSig(ch);
    const g = groups.get(sig) || [];
    g.push(ch);
    groups.set(sig, g);
  }
  let best = null;
  for (const [sig, arr] of groups) {
    if (arr.length >= 5) {
      if (!best || arr.length > best.items.length) best = { sig, items: arr };
    }
  }
  // Accept if majority of children belong to the group
  const total = container.children.length || 1;
  if (best && best.items.length / total >= 0.5) return best.items;
  return null;
}

function textOr(el, sel) {
  try { const n = el.querySelector(sel); return n ? getText(n) : ''; } catch { return ''; }
}
function hrefOr(el, sel) {
  try { const a = el.querySelector(sel); let href = a ? (a.href || a.getAttribute('href')) : ''; if (href && !/^https?:/i.test(href)) href = new URL(href, location.href).href; return href || ''; } catch { return ''; }
}
function imageOr(el) {
  try { const img = el.querySelector('img'); let src = img ? (img.currentSrc || img.src || img.getAttribute('src')) : ''; if (src && !/^https?:/i.test(src)) src = new URL(src, location.href).href; const alt = img?.getAttribute('alt') || ''; return { src: src || '', alt }; } catch { return { src: '', alt: '' }; }
}

function detectPseudoTables({ minItems = 5, maxContainers = 30, capNodes = 2000 } = {}) {
  const results = [];
  const nodes = Array.from(document.querySelectorAll('body *')).slice(0, capNodes);
  const containers = nodes.filter((n) => n.children && n.children.length >= minItems && isVisible(n)).slice(0, 200);
  let picked = 0;
  for (const c of containers) {
    if (picked >= maxContainers) break;
    const group = detectRepeatedChildGroup(c);
    if (!group) continue;
    const items = group.filter(isVisible).slice(0, 200);
    if (items.length < minItems) continue;

    const headers = ['Title', 'URL', 'Image', 'Price', 'Date'];
    const rows = [];
    for (const it of items) {
      const title = textOr(it, 'h1, h2, h3, h4, h5, h6, [role="heading"], .title, a[title], a');
      const url = hrefOr(it, 'a[href]');
      const img = imageOr(it);
      const priceTxt = (function() {
        const txt = getText(it);
        const p = parsePrice(txt);
        return p ? p.raw : '';
      })();
      const dateTxt = (function() {
        const t = it.querySelector('time'); if (t) return getText(t);
        const m = String(getText(it)).match(/\b(\d{1,2}[.\/ -]\d{1,2}[.\/ -]\d{2,4}|\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})\b/);
        return m ? m[0] : '';
      })();
      if ([title, url, img.src, priceTxt, dateTxt].some((v) => String(v||'').trim())) {
        rows.push([title, url, img.src, priceTxt, dateTxt]);
      }
    }
    if (rows.length >= minItems) {
      const selector = cssPath(c);
      const table = { type: 'pseudo-table', selector, headers, rows, objects: rows.map((r) => ({ Title: r[0], URL: r[1], Image: r[2], Price: r[3], Date: r[4] })) };
      // modest boost if we captured meaningful titles and urls
      const titleFilled = rows.filter((r) => r[0]).length / rows.length;
      const urlFilled = rows.filter((r) => r[1]).length / rows.length;
      table.score = Math.floor(800 * titleFilled + 600 * urlFilled + Math.min(2000, rows.length * (headers.length || 5)));
      results.push(table);
      picked++;
    }
  }
  return results;
}

async function runScrape(config = {}) {
  const cfg = config || {};
  try { __motuweDeepScan = !!cfg.deepScan; } catch { __motuweDeepScan = false; }
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
    // Include both specialized roster tables and generic detected tables
    try {
      const autoTables = extractDisplayTables();
      const merged = dedupeTables([...(tmTables || []), ...(autoTables || [])]);
      if (merged.length) data.tables = merged;
    } catch {
      if (tmTables?.length) data.tables = tmTables;
    }
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

  // Site-specific: YouTube (playlist, search, channel videos)
  if (isYouTubeHost()) {
    const yt = extractYouTubeData();
    const data = { ...base, site: 'youtube', yt };
    if (Array.isArray(yt?.tables) && yt.tables.length) data.tables = (data.tables || []).concat(yt.tables);
    if (cfg.collectLinks || cfg.linkPatterns) {
      const links = extractLinks({ linkSelector: 'a#video-title, ytd-video-renderer a#video-title, ytd-grid-video-renderer a#video-title', linkPatterns: cfg.linkPatterns });
      data.links = links;
    }
    // Always include OpenGraph/JSON-LD for YouTube context
    data.openGraph = extractOpenGraph();
    data.jsonLd = extractJsonLd();
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

function dedupeTables(arr = []) {
  const seen = new Set();
  const out = [];
  for (const t of arr) {
    const key = `${t.type || 'table'}|${t.selector || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// Visual selection state and helpers
let __motuweSelecting = false;
let __motuweHighlightEl = null;
let __motuweHandlersBound = false;

function ensureInlineStyles() {
  try {
    if (document.getElementById('motuwe-inline-style')) return;
    const style = document.createElement('style');
    style.id = 'motuwe-inline-style';
    style.textContent = `
      .motuwe-overlay-highlight{box-shadow:0 0 0 3px #4CAF50,0 0 0 6px rgba(76,175,80,.3)!important;position:relative!important;z-index:2147483646!important}
      .motuwe-selection-guide{position:fixed!important;top:10px!important;left:50%!important;transform:translateX(-50%)!important;background:rgba(0,0,0,.9)!important;color:#fff!important;padding:10px 20px!important;border-radius:6px!important;font-size:13px!important;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,sans-serif!important;z-index:2147483647!important;pointer-events:none!important}
      .motuwe-selecting *{user-select:none!important}
      .motuwe-cancel-hint{opacity:.8;font-size:12px;margin-left:8px}
      .motuwe-pointer{cursor:crosshair!important}
    `;
    document.documentElement.appendChild(style);
  } catch {}
}

function highlight(el) {
  try {
    if (__motuweHighlightEl === el) return;
    if (__motuweHighlightEl) __motuweHighlightEl.classList.remove('motuwe-overlay-highlight');
    __motuweHighlightEl = el;
    if (el) el.classList.add('motuwe-overlay-highlight');
  } catch {}
}

function clearHighlight() { highlight(null); }

function findTableLike(target) {
  if (!target) return null;
  let el = target.closest('table,[role="table"],[role="grid"]');
  if (!el) return null;
  return el;
}

function pickMatrixForElement(el) {
  if (!el) return null;
  const role = (el.getAttribute && (el.getAttribute('role') || '')).toLowerCase();
  if (el.tagName === 'TABLE') return tableToMatrix(el);
  if (role === 'table' || role === 'grid') return ariaGridToMatrix(el);
  // fallback
  return tableToMatrix(el);
}

function bindSelectionHandlers() {
  if (__motuweHandlersBound) return;
  __motuweHandlersBound = true;
  document.addEventListener('mousemove', __motuweOnMove, true);
  document.addEventListener('click', __motuweOnClick, true);
  document.addEventListener('keydown', __motuweOnKey, true);
}

function unbindSelectionHandlers() {
  if (!__motuweHandlersBound) return;
  __motuweHandlersBound = false;
  document.removeEventListener('mousemove', __motuweOnMove, true);
  document.removeEventListener('click', __motuweOnClick, true);
  document.removeEventListener('keydown', __motuweOnKey, true);
}

function showGuide() {
  try {
    if (document.getElementById('motuwe-selection-guide')) return;
    const g = document.createElement('div');
    g.id = 'motuwe-selection-guide';
    g.className = 'motuwe-selection-guide';
    g.textContent = 'Click a table to select';
    const span = document.createElement('span');
    span.className = 'motuwe-cancel-hint';
    span.textContent = '(Esc to cancel)';
    g.appendChild(span);
    document.documentElement.appendChild(g);
  } catch {}
}

function hideGuide() {
  try { const g = document.getElementById('motuwe-selection-guide'); if (g) g.remove(); } catch {}
}

function __motuweOnMove(e) {
  if (!__motuweSelecting) return;
  try { document.documentElement.classList.add('motuwe-pointer'); } catch {}
  const el = findTableLike(e.target);
  highlight(el);
}

function __motuweOnClick(e) {
  if (!__motuweSelecting) return;
  e.preventDefault();
  e.stopPropagation();
  const el = findTableLike(e.target);
  if (!el) return;
  const m = pickMatrixForElement(el);
  const selector = cssPath(el);
  stopSelection();
  // Send selection result to background to store in session
  try { chrome.runtime.sendMessage({ type: 'SELECTION_RESULT', payload: { table: { ...m, selector, frameUrl: location.href } } }); } catch {}
  try { chrome.runtime.sendMessage({ type: 'STOP_SELECTION' }); } catch {}
}

function __motuweOnKey(e) {
  if (!__motuweSelecting) return;
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    stopSelection();
  }
}

function startSelection() {
  try { ensureInlineStyles(); } catch {}
  __motuweSelecting = true;
  bindSelectionHandlers();
  showGuide();
}

function stopSelection() {
  __motuweSelecting = false;
  unbindSelectionHandlers();
  clearHighlight();
  hideGuide();
  try { document.documentElement.classList.remove('motuwe-pointer'); } catch {}
}

// Register message listener once per page/frame
if (!window.__motuweMsgHooked) {
  window.__motuweMsgHooked = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      switch (msg?.type) {
        case 'RUN_SCRAPE': {
          const result = await runScrape(msg.payload || {});
          sendResponse(result);
          break;
        }
        case 'START_SELECTION': {
          startSelection();
          sendResponse({ ok: true, started: true });
          break;
        }
        case 'STOP_SELECTION': {
          stopSelection();
          sendResponse({ ok: true });
          break;
        }
        case 'HIGHLIGHT_TABLE': {
          try {
            const selector = msg.selector;
            const el = selector ? document.querySelector(selector) : null;
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('motuwe-overlay-highlight');
              setTimeout(() => { try { el.classList.remove('motuwe-overlay-highlight'); } catch {} }, 2000);
              sendResponse({ ok: true });
            } else {
              sendResponse({ ok: false, error: 'Element not found' });
            }
          } catch (e) {
            sendResponse({ ok: false, error: String(e?.message || e) });
          }
          break;
        }
        case 'GET_TABLE_SNAPSHOT': {
          try {
            const { selector } = msg.payload || {};
            const html = getTableSnapshotHtml(selector);
            sendResponse({ ok: true, html });
          } catch (e) {
            sendResponse({ ok: false, error: String(e?.message || e) });
          }
          break;
        }
        default:
          // ignore
          break;
      }
    })().catch((err) => {
      console.error('Content script error:', err);
      try { sendResponse({ error: String(err?.message || err) }); } catch (_) {}
    });
    return true;
  });
}
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

// YouTube extraction
function extractYouTubeData() {
  try {
    const tables = [];
    // 1) Playlist panel on watch pages
    const panelItems = Array.from(document.querySelectorAll('ytd-playlist-panel-video-renderer'));
    if (panelItems.length >= 3) {
      tables.push(cardListToTable(panelItems, {
        title: 'a#video-title',
        url: 'a#video-title',
        channel: 'ytd-channel-name a',
        duration: 'ytd-thumbnail-overlay-time-status-renderer span, .ytd-thumbnail-overlay-time-status-renderer span',
        meta: '#metadata-line span'
      }, { tableType: 'yt-playlist-panel' }));
    }
    // 2) Playlist page (grid/list of playlist videos)
    const pv = Array.from(document.querySelectorAll('ytd-playlist-video-renderer'));
    if (pv.length >= 3) {
      tables.push(cardListToTable(pv, {
        title: 'a#video-title', url: 'a#video-title', channel: 'ytd-channel-name a', duration: 'ytd-thumbnail-overlay-time-status-renderer span, .ytd-thumbnail-overlay-time-status-renderer span', meta: '#metadata-line span'
      }, { tableType: 'yt-playlist' }));
    }
    // 3) Search results / channel videos
    const vr = Array.from(document.querySelectorAll('ytd-video-renderer, ytd-grid-video-renderer'));
    if (vr.length >= 3) {
      tables.push(cardListToTable(vr, {
        title: 'a#video-title', url: 'a#video-title', channel: 'ytd-channel-name a', duration: 'ytd-thumbnail-overlay-time-status-renderer span, .ytd-thumbnail-overlay-time-status-renderer span', meta: '#metadata-line span'
      }, { tableType: 'yt-videos' }));
    }
    // Score boost for YouTube-specific tables
    for (const t of tables) { t.site = 'youtube'; t.type = t.type || 'yt-table'; t.score = (t.score || 0) + 1200; }
    return { tables };
  } catch { return { tables: [] }; }
}

function cardListToTable(nodes, selectors, { tableType = 'cards' } = {}) {
  const headers = ['Title', 'Channel', 'Duration', 'Views', 'URL'];
  const rows = [];
  for (const n of nodes) {
    const get = (sel) => { try { return n.querySelector(sel); } catch { return null; } };
    const text = (el) => (el && el.textContent ? el.textContent.trim() : '');
    const anchor = get(selectors.title) || get('a#video-title');
    const urlEl = get(selectors.url) || anchor;
    const chanEl = get(selectors.channel) || get('ytd-channel-name a');
    const durEl = get(selectors.duration);
    const metaEls = Array.from(n.querySelectorAll(selectors.meta || '#metadata-line span')).map((x) => text(x)).filter(Boolean);
    const title = text(anchor);
    let url = urlEl ? urlEl.href || urlEl.getAttribute('href') : '';
    if (url && !/^https?:/i.test(url)) { try { url = new URL(url, location.href).href; } catch {} }
    const channel = text(chanEl);
    const duration = text(durEl);
    const views = (metaEls.find((m) => /view|görüntüleme|izlenme/i.test(m)) || '').trim();
    rows.push([title, channel, duration, views, url]);
  }
  const selector = 'ytd-cards';
  return { type: tableType, selector, headers, rows, objects: rows.map((r, i) => ({ Title: r[0], Channel: r[1], Duration: r[2], Views: r[3], URL: r[4], index: i+1 })) };
}

// Build a sandboxed HTML snapshot of a table preserving key styles
function getTableSnapshotHtml(selector) {
  const el = selector ? document.querySelector(selector) : null;
  const table = el && (el.tagName === 'TABLE' ? el : el.querySelector('table'));
  if (!table) throw new Error('Table not found');
  const clone = table.cloneNode(true);

  // Sanitize: remove script elements inside clone (unlikely, but safe)
  Array.from(clone.querySelectorAll('script')).forEach((s) => s.remove());

  // Inline essential computed styles for th/td (alignment, weight, colors)
  const applyInline = (node, from) => {
    try {
      const cs = getComputedStyle(from);
      const styles = [];
      const push = (k, v) => { if (v) styles.push(`${k}:${v}`); };
      push('text-align', cs.textAlign);
      push('font-weight', cs.fontWeight);
      push('color', cs.color);
      const bg = cs.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') push('background-color', bg);
      if (styles.length) node.setAttribute('style', (node.getAttribute('style') || '') + ';' + styles.join(';'));
    } catch {}
  };
  const origCells = table.querySelectorAll('th,td');
  const cloneCells = clone.querySelectorAll('th,td');
  for (let i = 0; i < Math.min(origCells.length, cloneCells.length); i++) applyInline(cloneCells[i], origCells[i]);

  // Absolute-ize image sources
  Array.from(clone.querySelectorAll('img[src]')).forEach((img) => {
    try { img.setAttribute('src', new URL(img.getAttribute('src'), location.href).href); } catch {}
  });

  const css = `
    :root{color-scheme:dark light}
    html,body{margin:0;padding:10px;background:#121212;color:#e8e8e8;font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, sans-serif}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #2a2a2a;padding:8px 10px}
    thead th{position:sticky;top:0;background:#101010;color:#c8ffea;}
    tbody tr:nth-child(odd){background:#161616}
  `;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${clone.outerHTML}</body></html>`;
  return html;
}
