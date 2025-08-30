// Popup interface controller
class MotuwePopup {
  constructor() {
    this.tables = [];
    this.selectedTable = null;
    this.currentTab = null;
    
    this.initialize();
  }

  async initialize() {
    await this.getCurrentTab();
    this.setupEventListeners();
    this.updatePageInfo();
    await this.loadSettings();
  }

  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tab;
  }

  setupEventListeners() {
    // Scan button
    document.getElementById('scanBtn').addEventListener('click', () => {
      this.scanTables();
    });

    // Visual selector button
    document.getElementById('selectBtn').addEventListener('click', () => {
      this.activateVisualSelector();
    });

    // Options toggle
    document.getElementById('optionsBtn').addEventListener('click', () => {
      this.toggleOptions();
    });

    // Custom selector toggle
    document.getElementById('selectorBtn').addEventListener('click', () => {
      this.toggleSelectorPanel();
    });

    // Selector validation
    document.getElementById('validateBtn').addEventListener('click', () => {
      this.validateSelector();
    });

    // Apply custom selector
    document.getElementById('applySelectorBtn').addEventListener('click', () => {
      this.applySelectorScan();
    });

    // Save selector
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveCustomSelector();
    });

    // Saved selector change
    document.getElementById('savedSelectors').addEventListener('change', (e) => {
      if (e.target.value) {
        document.getElementById('customSelector').value = e.target.value;
      }
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportData();
    });

    // Preview button
    document.getElementById('previewBtn').addEventListener('click', () => {
      this.previewData();
    });

    // Timeout range
    document.getElementById('timeoutRange').addEventListener('input', (e) => {
      document.getElementById('timeoutValue').textContent = e.target.value;
    });

    // Load saved selectors
    this.loadSavedSelectors();

    // Auto-scan when popup opens if on a valid page
    if (this.currentTab && this.currentTab.url && !this.currentTab.url.startsWith('chrome://')) {
      setTimeout(() => this.scanTables(), 500);
    }
  }

  updatePageInfo() {
    if (this.currentTab) {
      const url = new URL(this.currentTab.url);
      document.getElementById('pageInfo').textContent = url.hostname;
    }
  }

  async ensureContentScriptInjected() {
    try {
      // Try to ping the content script
      await chrome.tabs.sendMessage(this.currentTab.id, { action: 'ping' });
    } catch (error) {
      // Content script not injected, inject it now
      const scripts = [
        'js/selector-engine.js',
        'js/excel-export.js',
        'js/data-transformer.js',
        'js/iframe-scraper.js',
        'js/auth-manager.js',
        'js/websocket-manager.js',
        'js/storage-manager.js',
        'js/worker-manager.js',
        'js/template-manager.js',
        'js/history-manager.js',
        'js/content.js'
      ];

      // Inject all required scripts in order
      for (const script of scripts) {
        await chrome.scripting.executeScript({
          target: { tabId: this.currentTab.id },
          files: [script]
        });
      }

      // Also inject CSS
      await chrome.scripting.insertCSS({
        target: { tabId: this.currentTab.id },
        files: ['css/content.css']
      });

      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
      const settings = response.settings;
      
      if (settings.waitForDynamic !== undefined) {
        document.getElementById('waitDynamic').checked = settings.waitForDynamic;
      }
      if (settings.includeHiddenTables !== undefined) {
        document.getElementById('includeHidden').checked = settings.includeHiddenTables;
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  }

  toggleOptions() {
    const options = document.getElementById('scanOptions');
    options.classList.toggle('show');
  }

  setStatus(message, type = '') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
  }

  setLoading(isLoading, message = '') {
    const scanBtn = document.getElementById('scanBtn');
    const status = document.getElementById('status');
    
    if (isLoading) {
      scanBtn.disabled = true;
      scanBtn.textContent = 'Scanning...';
      status.innerHTML = `<div class="loading"></div>${message || 'Scanning for tables...'}`;
    } else {
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan Tables';
    }
  }

  async scanTables() {
    if (!this.currentTab) return;

    this.setLoading(true);

    try {
      // First, ensure content script is injected
      await this.ensureContentScriptInjected();

      const options = {
        waitForDynamic: document.getElementById('waitDynamic').checked,
        includeHidden: document.getElementById('includeHidden').checked,
        includeIframes: document.getElementById('includeIframes').checked,
        timeout: parseInt(document.getElementById('timeoutRange').value) * 1000
      };

      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'scanTables',
        options
      });

      if (response.error) {
        throw new Error(response.error);
      }

      this.tables = response.tables || [];
      this.displayTables();
      this.setStatus(`Found ${this.tables.length} table(s)`, 'success');

    } catch (error) {
      this.setStatus(`Scan failed: ${error.message}`, 'error');
      this.tables = [];
      this.displayTables();
    } finally {
      this.setLoading(false);
    }
  }

  displayTables() {
    const container = document.getElementById('tablesContainer');
    const noTables = document.getElementById('noTables');
    
    if (this.tables.length === 0) {
      container.innerHTML = '';
      container.appendChild(noTables);
      this.hideExportSection();
      return;
    }

    noTables.style.display = 'none';
    container.innerHTML = '';

    this.tables.forEach((table, index) => {
      const tableElement = this.createTableElement(table, index);
      container.appendChild(tableElement);
    });
  }

  createTableElement(table, index) {
    const div = document.createElement('div');
    div.className = 'table-item';
    div.dataset.index = index;

    const title = document.createElement('div');
    title.className = 'table-title';
    title.textContent = table.title;

    const info = document.createElement('div');
    info.className = 'table-info';
    let infoText = `${table.rows} rows × ${table.cols} columns`;
    if (table.fromIframe) {
      infoText += ` [from iframe: ${table.iframeInfo?.title || 'unnamed'}]`;
    }
    info.textContent = infoText;

    const preview = document.createElement('div');
    preview.className = 'table-preview';
    
    if (table.sampleData && table.sampleData.length > 0) {
      // Create proper HTML table preview
      const previewTable = document.createElement('table');
      previewTable.style.width = '100%';
      previewTable.style.fontSize = '10px';
      previewTable.style.borderCollapse = 'collapse';
      
      // Add header row if available
      const firstRow = table.sampleData[0];
      if (firstRow && firstRow.length > 0) {
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        firstRow.forEach((cell, index) => {
          const th = document.createElement('th');
          
          // Handle empty headers
          if (!cell || cell.toString().trim() === '') {
            th.textContent = `Col ${index + 1}`;
            th.style.fontStyle = 'italic';
            th.style.color = '#888';
          } else {
            const cellText = cell.toString();
            th.textContent = cellText.length > 15 ? cellText.substring(0, 15) + '...' : cellText;
            th.style.color = '#4CAF50';
          }
          
          th.style.padding = '4px 6px';
          th.style.border = '1px solid #404040';
          th.style.background = '#2d2d2d';
          th.style.fontSize = '8px';
          th.style.fontWeight = 'bold';
          th.style.textAlign = 'left';
          th.style.maxWidth = '100px';
          th.style.overflow = 'hidden';
          th.style.whiteSpace = 'nowrap';
          th.style.textOverflow = 'ellipsis';
          headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        previewTable.appendChild(thead);
      }
      
      // Add data rows (max 3 rows for preview)
      const tbody = document.createElement('tbody');
      const dataRows = table.sampleData.slice(1, 4); // Skip header, show max 3 rows
      
      dataRows.forEach(rowData => {
        const tr = document.createElement('tr');
        
        rowData.forEach(cell => {
          const td = document.createElement('td');
          
          // Handle empty/null values
          if (!cell || cell.toString().trim() === '') {
            td.textContent = '—';
            td.style.color = '#666';
            td.style.fontStyle = 'italic';
          } else {
            const cellText = cell.toString();
            td.textContent = cellText.length > 20 ? cellText.substring(0, 20) + '...' : cellText;
            td.style.color = '#ddd';
          }
          
          td.style.padding = '4px 6px';
          td.style.border = '1px solid #404040';
          td.style.fontSize = '8px';
          td.style.maxWidth = '100px';
          td.style.overflow = 'hidden';
          td.style.whiteSpace = 'nowrap';
          td.style.textOverflow = 'ellipsis';
          tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
      });
      
      previewTable.appendChild(tbody);
      preview.appendChild(previewTable);
      
      // Add row count indicator
      const rowCount = document.createElement('div');
      rowCount.className = 'row-count';
      const totalRows = table.rows || table.sampleData.length - 1; // Subtract header row
      rowCount.textContent = `${totalRows} rows, ${firstRow.length} columns`;
      preview.appendChild(rowCount);
      
    } else {
      preview.textContent = 'No preview available';
      preview.style.color = '#666';
      preview.style.fontStyle = 'italic';
      preview.style.textAlign = 'center';
      preview.style.padding = '20px';
    }

    div.appendChild(title);
    div.appendChild(info);
    div.appendChild(preview);

    div.addEventListener('click', () => {
      this.selectTable(index);
    });

    return div;
  }

  selectTable(index) {
    // Update UI selection
    document.querySelectorAll('.table-item').forEach((item, i) => {
      item.classList.toggle('selected', i === index);
    });

    this.selectedTable = index;
    this.showExportSection();
    this.setStatus(`Selected: ${this.tables[index].title}`, 'success');
  }

  showExportSection() {
    document.getElementById('exportSection').classList.add('show');
  }

  hideExportSection() {
    document.getElementById('exportSection').classList.remove('show');
  }

  async activateVisualSelector() {
    if (!this.currentTab) return;

    try {
      // First inject the selector
      await chrome.runtime.sendMessage({ action: 'injectTableSelector' });
      
      // Then activate it
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'activateSelector'
      });

      this.setStatus('Click on a table to select it', 'success');
      
      // Close popup to allow table selection
      window.close();

    } catch (error) {
      this.setStatus(`Visual selector failed: ${error.message}`, 'error');
    }
  }

  async exportData() {
    if (this.selectedTable === null || !this.tables[this.selectedTable]) {
      this.setStatus('Please select a table first', 'error');
      return;
    }

    this.setLoading(true, 'Extracting table data...');

    try {
      // Get full table data
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'scrapeTable',
        tableIndex: this.selectedTable,
        options: {
          loadAllData: true
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const data = response.data;
      const format = document.querySelector('input[name="format"]:checked').value;
      const table = this.tables[this.selectedTable];
      const filename = this.sanitizeFilename(table.title);

      // Handle Excel export differently
      if (format === 'xlsx') {
        await chrome.tabs.sendMessage(this.currentTab.id, {
          action: 'exportToExcel',
          data: data,
          filename: `${filename}.xlsx`,
          options: {
            sheetName: table.title || 'Table Data',
            includeHeaders: true,
            autoWidth: true
          }
        });
      } else {
        // Send to background for CSV/JSON export
        await chrome.runtime.sendMessage({
          action: 'exportData',
          data: data,
          format: format,
          filename: filename
        });
      }

      this.setStatus(`Exported ${data.length} rows as ${format.toUpperCase()}`, 'success');

    } catch (error) {
      this.setStatus(`Export failed: ${error.message}`, 'error');
    } finally {
      this.setLoading(false);
    }
  }

  async previewData() {
    if (this.selectedTable === null || !this.tables[this.selectedTable]) {
      this.setStatus('Please select a table first', 'error');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'scrapeTable',
        tableIndex: this.selectedTable,
        options: {
          loadAllData: false // Just get current data for preview
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Open preview in new tab
      const data = response.data;
      const previewHtml = this.generatePreviewHtml(data, this.tables[this.selectedTable].title);
      
      const blob = new Blob([previewHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      chrome.tabs.create({ url: url });

    } catch (error) {
      this.setStatus(`Preview failed: ${error.message}`, 'error');
    }
  }

  generatePreviewHtml(data, title) {
    const tableRows = data.map((row, index) => {
      const tag = index === 0 ? 'th' : 'td';
      const cells = row.map(cell => `<${tag}>${this.escapeHtml(cell || '')}</${tag}>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Table Preview: ${this.escapeHtml(title)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow-x: auto;
        }
        h1 {
            color: #333;
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
            min-width: 100px;
        }
        th {
            background-color: #4CAF50;
            color: white;
            font-weight: 600;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .info {
            color: #666;
            font-size: 14px;
            margin-bottom: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${this.escapeHtml(title)}</h1>
        <div class="info">${data.length} rows × ${data[0]?.length || 0} columns</div>
        <table>
            ${tableRows}
        </table>
    </div>
</body>
</html>`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }

  toggleSelectorPanel() {
    const panel = document.getElementById('selectorPanel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    
    // Hide options panel if selector panel is shown
    if (!isVisible) {
      document.getElementById('scanOptions').classList.remove('show');
    }
  }

  async loadSavedSelectors() {
    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getSavedSelectors'
      });

      const select = document.getElementById('savedSelectors');
      
      // Clear existing options except the first
      select.innerHTML = '<option value="">Select a saved selector...</option>';
      
      // Add common selectors
      const commonSelectors = [
        { name: 'All Tables', selector: 'table' },
        { name: 'Data Tables', selector: 'table[class*="data"], .data-table table' },
        { name: 'Grid Tables', selector: 'table[class*="grid"], .grid table' },
        { name: 'Tables with Headers', selector: 'table:has(th)' },
        { name: 'Large Tables (XPath)', selector: '//table[count(.//tr) > 10]' }
      ];

      commonSelectors.forEach(item => {
        const option = document.createElement('option');
        option.value = item.selector;
        option.textContent = item.name;
        select.appendChild(option);
      });

      // Add saved custom selectors
      if (response.selectors && response.selectors.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '--- Custom Selectors ---';
        select.appendChild(separator);

        response.selectors.forEach(item => {
          const option = document.createElement('option');
          option.value = item.selector;
          option.textContent = item.name;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.warn('Failed to load saved selectors:', error);
    }
  }

  async validateSelector() {
    const selector = document.getElementById('customSelector').value.trim();
    const resultDiv = document.getElementById('validationResult');

    if (!selector) {
      this.showValidationResult('Please enter a selector', false);
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'evaluateSelector',
        selector: selector
      });

      const validation = response.validation;

      if (validation.valid) {
        const message = `Valid! Found ${validation.elementCount} elements, ${validation.tableCount} tables`;
        this.showValidationResult(message, true);
      } else {
        this.showValidationResult(`Invalid: ${validation.error}`, false);
      }
    } catch (error) {
      this.showValidationResult(`Validation failed: ${error.message}`, false);
    }
  }

  showValidationResult(message, isSuccess) {
    const resultDiv = document.getElementById('validationResult');
    resultDiv.textContent = message;
    resultDiv.className = `validation-result ${isSuccess ? 'success' : 'error'}`;
    resultDiv.style.display = 'block';

    // Hide after 5 seconds
    setTimeout(() => {
      resultDiv.style.display = 'none';
    }, 5000);
  }

  async applySelectorScan() {
    const selector = document.getElementById('customSelector').value.trim();

    if (!selector) {
      this.setStatus('Please enter a selector', 'error');
      return;
    }

    this.setLoading(true, 'Scanning with custom selector...');

    try {
      const options = {
        customSelector: selector,
        waitForDynamic: document.getElementById('waitDynamic').checked,
        includeHidden: document.getElementById('includeHidden').checked,
        timeout: parseInt(document.getElementById('timeoutRange').value) * 1000
      };

      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'scanTables',
        options
      });

      if (response.error) {
        throw new Error(response.error);
      }

      this.tables = response.tables || [];
      this.displayTables();
      this.setStatus(`Found ${this.tables.length} table(s) using custom selector`, 'success');

      // Hide selector panel after successful scan
      document.getElementById('selectorPanel').style.display = 'none';

    } catch (error) {
      this.setStatus(`Selector scan failed: ${error.message}`, 'error');
      this.tables = [];
      this.displayTables();
    } finally {
      this.setLoading(false);
    }
  }

  async saveCustomSelector() {
    const selector = document.getElementById('customSelector').value.trim();

    if (!selector) {
      this.setStatus('Please enter a selector to save', 'error');
      return;
    }

    const name = prompt('Enter a name for this selector:');
    if (!name) return;

    const description = prompt('Enter a description (optional):') || '';

    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'saveCustomSelector',
        name: name,
        selector: selector,
        description: description
      });

      this.setStatus(`Selector "${name}" saved successfully`, 'success');
      this.loadSavedSelectors(); // Refresh the saved selectors list

    } catch (error) {
      this.setStatus(`Failed to save selector: ${error.message}`, 'error');
    }
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MotuwePopup();
});