// iframe content scraping support
class IframeScraper {
  constructor() {
    this.iframes = new Map();
    this.crossOriginIframes = new Set();
    this.sandboxedIframes = new Set();
    this.messagePorts = new Map();
  }

  // Scan for iframes on the page
  scanIframes() {
    const iframes = document.querySelectorAll('iframe');
    const results = [];

    iframes.forEach((iframe, index) => {
      const info = this.analyzeIframe(iframe, index);
      results.push(info);
      this.iframes.set(index, {
        element: iframe,
        info: info,
        accessible: info.accessible,
        tables: []
      });
    });

    return results;
  }

  // Analyze iframe accessibility and properties
  analyzeIframe(iframe, index) {
    const src = iframe.src || iframe.getAttribute('data-src') || '';
    const sandbox = iframe.getAttribute('sandbox');
    const crossOrigin = this.isCrossOrigin(src);
    
    let accessible = false;
    let reason = '';

    // Check if iframe is accessible
    try {
      if (crossOrigin) {
        accessible = false;
        reason = 'Cross-origin restriction';
        this.crossOriginIframes.add(index);
      } else if (sandbox && !sandbox.includes('allow-same-origin')) {
        accessible = false;
        reason = 'Sandboxed without same-origin';
        this.sandboxedIframes.add(index);
      } else {
        // Try to access content
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          accessible = true;
          reason = 'Accessible';
        } else {
          accessible = false;
          reason = 'Content not accessible';
        }
      }
    } catch (error) {
      accessible = false;
      reason = 'Security restriction';
    }

    return {
      index,
      src,
      title: iframe.title || iframe.name || `iframe-${index}`,
      sandbox,
      crossOrigin,
      accessible,
      reason,
      width: iframe.width || iframe.offsetWidth,
      height: iframe.height || iframe.offsetHeight,
      visible: this.isIframeVisible(iframe)
    };
  }

  // Check if iframe is from cross-origin
  isCrossOrigin(src) {
    if (!src) return false;
    
    try {
      const url = new URL(src, window.location.href);
      return url.origin !== window.location.origin;
    } catch (e) {
      return false;
    }
  }

  // Check if iframe is visible
  isIframeVisible(iframe) {
    const rect = iframe.getBoundingClientRect();
    const style = window.getComputedStyle(iframe);
    
    return rect.width > 0 && 
           rect.height > 0 && 
           style.display !== 'none' && 
           style.visibility !== 'hidden';
  }

  // Scan tables in accessible iframes
  async scanTablesInIframes(options = {}) {
    const results = [];
    
    for (const [index, iframeData] of this.iframes) {
      if (!iframeData.accessible) {
        // Try alternative methods for inaccessible iframes
        const altResult = await this.scanInaccessibleIframe(iframeData, options);
        if (altResult) {
          results.push({
            iframeIndex: index,
            iframeInfo: iframeData.info,
            tables: altResult.tables,
            method: altResult.method
          });
        }
        continue;
      }

      try {
        const tables = await this.scanTablesInAccessibleIframe(iframeData, options);
        if (tables.length > 0) {
          results.push({
            iframeIndex: index,
            iframeInfo: iframeData.info,
            tables: tables,
            method: 'direct'
          });
        }
      } catch (error) {
        console.warn(`Failed to scan tables in iframe ${index}:`, error);
      }
    }

    return results;
  }

  // Scan tables in accessible iframe
  async scanTablesInAccessibleIframe(iframeData, options) {
    const iframe = iframeData.element;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    
    if (!doc) return [];

    const tables = doc.querySelectorAll('table');
    const results = [];

    tables.forEach((table, tableIndex) => {
      const tableInfo = this.analyzeIframeTable(table, tableIndex, doc);
      if (tableInfo.rows > 0 && tableInfo.cols > 0) {
        results.push(tableInfo);
      }
    });

    return results;
  }

  // Analyze table in iframe
  analyzeIframeTable(table, index, doc) {
    const rows = table.querySelectorAll('tr');
    
    if (!rows.length) return { rows: 0, cols: 0 };

    // Get table title
    let title = this.getIframeTableTitle(table, index, doc);
    
    // Analyze structure
    const cols = this.getIframeColumnCount(table);
    const sampleData = this.extractIframeSampleData(table, 3);
    
    return {
      index,
      title,
      rows: rows.length,
      cols,
      element: table,
      sampleData,
      hasHeader: this.hasIframeHeader(table),
      iframe: true
    };
  }

  getIframeTableTitle(table, index, doc) {
    // Check for caption
    const caption = table.querySelector('caption');
    if (caption) return caption.textContent.trim();

    // Check preceding elements
    let prev = table.previousElementSibling;
    while (prev) {
      if (/^h[1-6]$/i.test(prev.tagName)) {
        return prev.textContent.trim();
      }
      if (prev.offsetHeight > 0) break;
      prev = prev.previousElementSibling;
    }

    // Check document title as fallback
    const docTitle = doc.title;
    if (docTitle) {
      return `${docTitle} - Table ${index + 1}`;
    }

    return `iframe Table ${index + 1}`;
  }

  getIframeColumnCount(table) {
    let maxCols = 0;
    const rows = table.querySelectorAll('tr');
    
    rows.forEach(row => {
      let colCount = 0;
      const cells = row.querySelectorAll('td, th');
      
      cells.forEach(cell => {
        const colspan = parseInt(cell.getAttribute('colspan')) || 1;
        colCount += colspan;
      });
      
      maxCols = Math.max(maxCols, colCount);
    });
    
    return maxCols;
  }

  hasIframeHeader(table) {
    const firstRow = table.querySelector('tr');
    if (!firstRow) return false;
    
    const headerCells = firstRow.querySelectorAll('th');
    return headerCells.length > 0;
  }

  extractIframeSampleData(table, maxRows = 3) {
    const rows = table.querySelectorAll('tr');
    const data = [];
    const maxCols = this.getIframeColumnCount(table);
    
    for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
      const row = rows[i];
      const rowData = new Array(maxCols).fill('');
      const cells = row.querySelectorAll('td, th');
      
      let cellIndex = 0;
      cells.forEach(cell => {
        const colspan = parseInt(cell.getAttribute('colspan')) || 1;
        const text = this.cleanIframeCellText(cell.textContent);
        
        for (let j = 0; j < colspan && cellIndex < maxCols; j++) {
          rowData[cellIndex] = text;
          cellIndex++;
        }
      });
      
      data.push(rowData);
    }
    
    return data;
  }

  cleanIframeCellText(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  // Handle inaccessible iframes with alternative methods
  async scanInaccessibleIframe(iframeData, options) {
    const { element, info } = iframeData;
    
    // Method 1: PostMessage API
    if (this.crossOriginIframes.has(info.index)) {
      try {
        const postMessageResult = await this.tryPostMessage(element, info);
        if (postMessageResult) {
          return { tables: postMessageResult, method: 'postMessage' };
        }
      } catch (error) {
        console.warn('PostMessage method failed:', error);
      }
    }

    // Method 2: Injection via content script
    try {
      const injectionResult = await this.tryContentScriptInjection(element, info);
      if (injectionResult) {
        return { tables: injectionResult, method: 'injection' };
      }
    } catch (error) {
      console.warn('Injection method failed:', error);
    }

    // Method 3: Proxy/fetch for same-origin or accessible content
    if (!info.crossOrigin && element.src) {
      try {
        const fetchResult = await this.tryFetchMethod(element.src, info);
        if (fetchResult) {
          return { tables: fetchResult, method: 'fetch' };
        }
      } catch (error) {
        console.warn('Fetch method failed:', error);
      }
    }

    return null;
  }

  // Try PostMessage communication with iframe
  async tryPostMessage(iframe, info) {
    return new Promise((resolve) => {
      const messageId = `motuwe_scan_${Date.now()}`;
      const timeout = setTimeout(() => resolve(null), 5000);

      const handleMessage = (event) => {
        if (event.data.id === messageId && event.data.type === 'motuwe_tables') {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
          resolve(event.data.tables);
        }
      };

      window.addEventListener('message', handleMessage);
      
      // Send scan request to iframe
      iframe.contentWindow.postMessage({
        type: 'motuwe_scan_request',
        id: messageId
      }, '*');
    });
  }

  // Try content script injection
  async tryContentScriptInjection(iframe, info) {
    // This would require additional permissions and setup
    // For now, return null as this needs extension-level handling
    return null;
  }

  // Try fetch method for same-origin content
  async tryFetchMethod(url, info) {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const tables = doc.querySelectorAll('table');
      const results = [];

      tables.forEach((table, index) => {
        const tableInfo = this.analyzeIframeTable(table, index, doc);
        if (tableInfo.rows > 0 && tableInfo.cols > 0) {
          results.push(tableInfo);
        }
      });

      return results;
    } catch (error) {
      console.warn('Fetch method error:', error);
      return null;
    }
  }

  // Scrape data from iframe table
  async scrapeIframeTable(iframeIndex, tableIndex, options = {}) {
    const iframeData = this.iframes.get(iframeIndex);
    if (!iframeData) {
      throw new Error(`iframe ${iframeIndex} not found`);
    }

    if (!iframeData.accessible) {
      return this.scrapeInaccessibleIframeTable(iframeData, tableIndex, options);
    }

    const iframe = iframeData.element;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    
    if (!doc) {
      throw new Error('iframe document not accessible');
    }

    const tables = doc.querySelectorAll('table');
    const table = tables[tableIndex];
    
    if (!table) {
      throw new Error(`Table ${tableIndex} not found in iframe`);
    }

    return this.extractIframeTableData(table, options);
  }

  // Extract full data from iframe table
  extractIframeTableData(table, options) {
    const rows = table.querySelectorAll('tr');
    const data = [];
    const maxCols = this.getIframeColumnCount(table);

    rows.forEach(row => {
      const rowData = new Array(maxCols).fill('');
      const cells = row.querySelectorAll('td, th');
      
      let cellIndex = 0;
      cells.forEach(cell => {
        const colspan = parseInt(cell.getAttribute('colspan')) || 1;
        const text = this.cleanIframeCellText(cell.textContent);
        
        for (let j = 0; j < colspan && cellIndex < maxCols; j++) {
          rowData[cellIndex] = text;
          cellIndex++;
        }
      });
      
      data.push(rowData);
    });

    return data;
  }

  // Handle scraping from inaccessible iframes
  async scrapeInaccessibleIframeTable(iframeData, tableIndex, options) {
    // Use the same alternative methods as scanning
    const result = await this.scanInaccessibleIframe(iframeData, options);
    if (result && result.tables[tableIndex]) {
      // Return placeholder data or attempt to get full data via alternative methods
      return result.tables[tableIndex].sampleData || [];
    }
    
    throw new Error('Cannot access iframe table data');
  }

  // Setup PostMessage listener for iframe communication
  setupPostMessageListener() {
    // This should be injected into potential iframe content
    const script = `
      (function() {
        if (window.motuweIframeListener) return;
        window.motuveIframeListener = true;
        
        window.addEventListener('message', function(event) {
          if (event.data.type === 'motuwe_scan_request') {
            try {
              const tables = [];
              const tableElements = document.querySelectorAll('table');
              
              tableElements.forEach((table, index) => {
                const rows = table.querySelectorAll('tr');
                if (rows.length === 0) return;
                
                const cols = Math.max(...Array.from(rows).map(row => 
                  row.querySelectorAll('td, th').length
                ));
                
                const sampleData = [];
                for (let i = 0; i < Math.min(3, rows.length); i++) {
                  const row = rows[i];
                  const rowData = [];
                  const cells = row.querySelectorAll('td, th');
                  
                  cells.forEach(cell => {
                    rowData.push(cell.textContent.trim());
                  });
                  
                  sampleData.push(rowData);
                }
                
                tables.push({
                  index,
                  title: document.title + ' - Table ' + (index + 1),
                  rows: rows.length,
                  cols,
                  sampleData,
                  iframe: true
                });
              });
              
              event.source.postMessage({
                type: 'motuwe_tables',
                id: event.data.id,
                tables: tables
              }, event.origin);
            } catch (error) {
              event.source.postMessage({
                type: 'motuwe_error',
                id: event.data.id,
                error: error.message
              }, event.origin);
            }
          }
        });
      })();
    `;

    return script;
  }

  // Inject listener script into iframe (if possible)
  injectListenerScript(iframe) {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return false;

      const script = doc.createElement('script');
      script.textContent = this.setupPostMessageListener();
      doc.head.appendChild(script);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Get iframe statistics
  getIframeStats() {
    return {
      total: this.iframes.size,
      accessible: Array.from(this.iframes.values()).filter(data => data.accessible).length,
      crossOrigin: this.crossOriginIframes.size,
      sandboxed: this.sandboxedIframes.size
    };
  }

  // Clear iframe data
  clear() {
    this.iframes.clear();
    this.crossOriginIframes.clear();
    this.sandboxedIframes.clear();
    this.messagePorts.clear();
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.IframeScraper = IframeScraper;
}