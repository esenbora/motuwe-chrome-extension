// Content script for dynamic table scraping
class MotuweContentScript {
  constructor() {
    this.tables = [];
    this.isScanning = false;
    this.mutationObserver = null;
    this.settings = {};
    this.tableSelector = null;
    this.selectorEngine = new SelectorEngine();
    this.excelExporter = new ExcelExporter();
    this.dataTransformer = new DataTransformer();
    this.iframeScraper = new IframeScraper();
    this.authManager = new AuthManager();
    this.wsManager = new WebSocketManager();
    this.storage = new StorageManager();
    this.workerManager = new WorkerManager();
    this.templateManager = null;
    this.historyManager = null;
    
    this.initialize();
  }

  async initialize() {
    await this.loadSettings();
    await this.selectorEngine.loadFromStorage();
    
    // Initialize managers that depend on storage
    this.templateManager = new TemplateManager(this.storage);
    this.historyManager = new HistoryManager(this.storage);
    
    this.setupMessageListener();
    this.initializeMutationObserver();
    this.initializeTableSelector();
    
    // Initial scan
    this.scanForTables();
  }

  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
      this.settings = response.settings || {};
    } catch (error) {
      console.warn('Failed to load settings:', error);
      this.settings = {};
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });
  }

  async handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'ping':
        sendResponse({ success: true });
        break;
        
      case 'scanTables':
        const tables = await this.scanForTables(request.options);
        sendResponse({ tables });
        break;

      case 'scrapeTable':
        const data = await this.scrapeTable(request.tableIndex, request.options);
        sendResponse({ data });
        break;

      case 'activateSelector':
        this.tableSelector.activate();
        sendResponse({ success: true });
        break;

      case 'deactivateSelector':
        this.tableSelector.deactivate();
        sendResponse({ success: true });
        break;

      case 'evaluateSelector':
        const validation = this.selectorEngine.validateSelector(request.selector);
        sendResponse({ validation });
        break;

      case 'findTablesBySelector':
        const foundTables = await this.findTablesBySelector(request.selector, request.options);
        sendResponse({ tables: foundTables });
        break;

      case 'saveCustomSelector':
        this.selectorEngine.saveSelector(request.name, request.selector, request.description);
        sendResponse({ success: true });
        break;

      case 'getSavedSelectors':
        const selectors = this.selectorEngine.listSavedSelectors();
        sendResponse({ selectors });
        break;

      case 'generateSelector':
        const element = request.elementXPath ? 
          this.selectorEngine.evaluateXPath(request.elementXPath)[0] : 
          document.querySelector(request.elementCSS);
        if (element) {
          const xpath = this.selectorEngine.generateXPath(element);
          const css = this.selectorEngine.generateCSS(element);
          sendResponse({ xpath, css });
        } else {
          sendResponse({ error: 'Element not found' });
        }
        break;

      case 'exportToExcel':
        await this.handleExcelExport(request.data, request.filename, request.options);
        sendResponse({ success: true });
        break;

      case 'transformData':
        const transformedData = await this.dataTransformer.transformData(request.data, request.transformations);
        sendResponse({ data: transformedData });
        break;

      case 'applyPreset':
        const presetData = await this.dataTransformer.applyPreset(request.data, request.preset);
        sendResponse({ data: presetData });
        break;

      case 'getTransformationPresets':
        const presets = this.dataTransformer.getAvailablePresets();
        sendResponse({ presets });
        break;

      case 'scanIframes':
        const iframes = this.iframeScraper.scanIframes();
        sendResponse({ iframes });
        break;

      case 'scanIframeTables':
        const iframeTablesResult = await this.iframeScraper.scanTablesInIframes(request.options);
        sendResponse({ iframeTables: iframeTablesResult });
        break;

      case 'scrapeIframeTable':
        const iframeData = await this.iframeScraper.scrapeIframeTable(
          request.iframeIndex, 
          request.tableIndex, 
          request.options
        );
        sendResponse({ data: iframeData });
        break;

      case 'authenticate':
        const authMethod = this.authManager.authMethods.get(request.method);
        if (!authMethod) {
          sendResponse({ success: false, error: `Unknown auth method: ${request.method}` });
          break;
        }
        try {
          const authResult = await authMethod.handler(request.config);
          sendResponse(authResult);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getAuthSessions':
        const sessions = this.authManager.getAllSessions();
        sendResponse({ sessions });
        break;

      case 'removeAuthSession':
        this.authManager.removeSession(request.sessionId);
        sendResponse({ success: true });
        break;

      case 'authenticatedFetch':
        const authenticatedResult = await this.performAuthenticatedRequest(
          request.sessionId,
          request.url,
          request.options
        );
        sendResponse(authenticatedResult);
        break;

      case 'createWebSocket':
        try {
          const wsResult = await this.wsManager.createConnection(request.config);
          sendResponse(wsResult);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'sendWebSocketMessage':
        try {
          this.wsManager.sendMessage(request.connectionName, request.message);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'closeWebSocket':
        this.wsManager.closeConnection(request.connectionName);
        sendResponse({ success: true });
        break;

      case 'getWebSocketStatus':
        const wsStatus = request.connectionName 
          ? this.wsManager.getConnectionStatus(request.connectionName)
          : this.wsManager.getAllConnections();
        sendResponse({ status: wsStatus });
        break;

      case 'subscribeWebSocket':
        const subscription = this.wsManager.subscribe(
          request.connectionName,
          request.eventType,
          (data) => {
            // Send update back to popup/background
            chrome.runtime.sendMessage({
              type: 'websocket_event',
              connectionName: request.connectionName,
              eventType: request.eventType,
              data: data
            });
          }
        );
        sendResponse({ success: true, subscriptionId: Date.now() });
        break;

      case 'startTableMonitoring':
        try {
          const monitoring = await this.wsManager.startTableMonitoring(
            request.connectionName,
            request.config
          );
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'saveTable':
        try {
          const tableId = await this.storage.saveTable(request.data, request.metadata);
          sendResponse({ success: true, tableId });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getStoredTables':
        try {
          const tables = request.url 
            ? await this.storage.getTablesByUrl(request.url, request.limit)
            : await this.storage.getRecentTables(request.limit);
          sendResponse({ tables });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getStorageStats':
        try {
          const stats = await this.storage.getStorageStats();
          sendResponse({ stats });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getHistory':
        try {
          const history = await this.storage.getHistory(request.limit);
          sendResponse({ history });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'saveToCache':
        try {
          await this.storage.setCache(request.key, request.data, request.ttl);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getFromCache':
        try {
          const data = await this.storage.getCache(request.key);
          sendResponse({ data });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'processDataInWorker':
        try {
          const result = await this.workerManager.processData(request.data, request.operations);
          sendResponse({ success: true, result });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'analyzeTableInWorker':
        try {
          const analysis = await this.workerManager.analyzeTable(request.data);
          sendResponse({ success: true, analysis });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'generateExportInWorker':
        try {
          const exportData = await this.workerManager.generateExport(
            request.data, 
            request.format, 
            request.options
          );
          sendResponse({ success: true, exportData });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getWorkerStats':
        const workerStats = this.workerManager.getWorkerStats();
        sendResponse({ stats: workerStats });
        break;

      // Template Management
      case 'getTemplatesForDomain':
        try {
          const templates = await this.templateManager.findTemplatesForDomain(request.domain);
          sendResponse({ success: true, templates });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getTemplatesByCategory':
        try {
          const templates = await this.templateManager.findTemplatesByCategory(request.category);
          sendResponse({ success: true, templates });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'applyTemplate':
        try {
          const result = await this.templateManager.applyTemplate(request.templateId, request.options);
          if (result.success) {
            await this.historyManager.recordTemplateUsage(request.templateId, result.templateName, result);
          }
          sendResponse({ success: true, result });
        } catch (error) {
          await this.historyManager.recordError(error, { action: 'applyTemplate', templateId: request.templateId });
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'testTemplate':
        try {
          const testResult = await this.templateManager.testTemplate(request.templateId, request.options);
          sendResponse({ success: true, testResult });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getAllTemplates':
        try {
          const templates = await this.templateManager.getAllTemplates();
          sendResponse({ success: true, templates });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'createTemplate':
        try {
          const templateId = await this.templateManager.createTemplate(request.templateData);
          await this.historyManager.recordAction('template_created', { templateId, name: request.templateData.name });
          sendResponse({ success: true, templateId });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'deleteTemplate':
        try {
          await this.templateManager.deleteTemplate(request.templateId);
          await this.historyManager.recordAction('template_deleted', { templateId: request.templateId });
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      // History Management
      case 'getCurrentSession':
        const currentSession = this.historyManager.getCurrentSession();
        sendResponse({ success: true, session: currentSession });
        break;

      case 'getSessionHistory':
        try {
          const history = await this.historyManager.getSessionHistory(request.options);
          sendResponse({ success: true, history });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getActionHistory':
        try {
          const actions = await this.historyManager.getActionHistory(request.options);
          sendResponse({ success: true, actions });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getSessionStats':
        try {
          const stats = await this.historyManager.getSessionStats(request.sessionId);
          sendResponse({ success: true, stats });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getOverallStats':
        try {
          const stats = await this.historyManager.getOverallStats();
          sendResponse({ success: true, stats });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'saveSession':
        try {
          const sessionId = await this.historyManager.saveSession(request.name, request.description);
          sendResponse({ success: true, sessionId });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'loadSession':
        try {
          const session = await this.historyManager.loadSession(request.sessionId);
          sendResponse({ success: true, session });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'deleteSession':
        try {
          await this.historyManager.deleteSession(request.sessionId);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'exportSessionData':
        try {
          const data = await this.historyManager.exportSessionData(request.sessionId, request.format);
          sendResponse({ success: true, data });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'pageUpdated':
        if (this.settings.autoDetectChanges) {
          setTimeout(() => this.scanForTables(), 1000);
        }
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  }

  initializeMutationObserver() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'TABLE' || node.querySelector('table')) {
                shouldRescan = true;
              }
            }
          });
        }
      });

      if (shouldRescan && !this.isScanning) {
        setTimeout(() => this.scanForTables(), 500);
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async scanForTables(options = {}) {
    if (this.isScanning) return this.tables;
    
    this.isScanning = true;
    
    try {
      // Wait for dynamic content if enabled
      if (this.settings.waitForDynamic || options.waitForDynamic) {
        await this.waitForDynamicContent(options.timeout);
      }

      let tableElements;
      
      // Use custom selector if provided
      if (options.customSelector) {
        try {
          tableElements = this.selectorEngine.findTables(options.customSelector, {
            includeHidden: this.settings.includeHiddenTables || options.includeHidden,
            minRows: options.minRows,
            minCols: options.minCols,
            containsText: options.containsText,
            excludeAttributes: options.excludeAttributes
          });
          this.selectorEngine.addToHistory(options.customSelector, 'manual');
        } catch (error) {
          throw new Error(`Custom selector failed: ${error.message}`);
        }
      } else {
        // Look for both regular tables and div-based tables
        const regularTables = Array.from(document.querySelectorAll('table'));
        const divTables = this.findDivBasedTables();
        tableElements = [...regularTables, ...divTables];
      }
      
      const tables = [];
      
      Array.from(tableElements).forEach((table, index) => {
        if (!options.customSelector && !this.isTableVisible(table) && !this.settings.includeHiddenTables) {
          return;
        }

        const tableInfo = this.analyzeTable(table, index);
        if (tableInfo.rows > 0 && tableInfo.cols > 0) {
          tables.push(tableInfo);
        }
      });

      // Include iframe tables if enabled
      if (options.includeIframes || this.settings.includeIframes) {
        try {
          const iframeResults = await this.iframeScraper.scanTablesInIframes(options);
          iframeResults.forEach(iframeResult => {
            iframeResult.tables.forEach(table => {
              table.fromIframe = true;
              table.iframeIndex = iframeResult.iframeIndex;
              table.iframeInfo = iframeResult.iframeInfo;
              table.index = tables.length; // Reassign index
              tables.push(table);
            });
          });
        } catch (error) {
          console.warn('iframe scanning failed:', error);
        }
      }

      this.tables = tables;
      
      // Save to history
      try {
        await this.storage.addToHistory({
          url: window.location.href,
          timestamp: Date.now(),
          tableCount: tables.length,
          success: true,
          selector: options.customSelector,
          includeIframes: !!options.includeIframes
        });
      } catch (error) {
        console.warn('Failed to save scan to history:', error);
      }
      
      return tables;
    } finally {
      this.isScanning = false;
    }
  }

  async findTablesBySelector(selector, options = {}) {
    try {
      const tableElements = this.selectorEngine.findTables(selector, options);
      const tables = [];

      tableElements.forEach((table, index) => {
        const tableInfo = this.analyzeTable(table, index);
        if (tableInfo.rows > 0 && tableInfo.cols > 0) {
          tables.push(tableInfo);
        }
      });

      this.selectorEngine.addToHistory(selector, 'api');
      return tables;
    } catch (error) {
      throw new Error(`Selector search failed: ${error.message}`);
    }
  }

  async waitForDynamicContent(timeout = 5000) {
    const startTime = Date.now();
    let lastTableCount = document.querySelectorAll('table').length;
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const currentTableCount = document.querySelectorAll('table').length;
        const elapsed = Date.now() - startTime;
        
        if (elapsed >= timeout) {
          clearInterval(checkInterval);
          resolve();
          return;
        }

        if (currentTableCount !== lastTableCount) {
          lastTableCount = currentTableCount;
          return; // Keep waiting if tables are still being added
        }

        // Check if network is idle
        if (this.isNetworkIdle()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);
    });
  }

  isNetworkIdle() {
    // Simple network idle detection
    const images = document.querySelectorAll('img');
    const scripts = document.querySelectorAll('script');
    
    for (let img of images) {
      if (!img.complete) return false;
    }
    
    return true;
  }

  isTableVisible(table) {
    const style = window.getComputedStyle(table);
    const rect = table.getBoundingClientRect();
    
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           rect.width > 0 && 
           rect.height > 0;
  }

  analyzeTable(table, index) {
    // Check if it's a regular table or div-based table
    if (table.tagName === 'TABLE') {
      const rows = table.querySelectorAll('tr');
      const firstRow = rows[0];
      
      if (!firstRow) return { rows: 0, cols: 0 };

      // Get table title
      let title = this.getTableTitle(table, index);
      
      // Analyze structure
      const cols = this.getColumnCount(table);
      const sampleData = this.extractSampleData(table, 3);
      
      return {
        index,
        title,
        rows: rows.length,
        cols,
        element: table,
        sampleData,
        hasHeader: this.hasHeader(table),
        type: 'table'
      };
    } else {
      // Handle div-based tables
      return this.analyzeDivTable(table, index);
    }
  }

  analyzeDivTable(element, index) {
    // Find row elements
    const rows = this.getDivTableRows(element);
    
    if (rows.length === 0) return { rows: 0, cols: 0 };

    // Get table title
    let title = this.getTableTitle(element, index);
    
    // Analyze structure
    const cols = this.getDivTableColumnCount(element, rows);
    const sampleData = this.extractDivTableSampleData(element, rows, 3);
    
    return {
      index,
      title,
      rows: rows.length,
      cols,
      element,
      sampleData,
      hasHeader: this.hasDivTableHeader(element, rows),
      type: 'div-table'
    };
  }

  getDivTableRows(element) {
    // Try different row patterns
    let rows = element.querySelectorAll(':scope > .row, :scope > [class*="row"]');
    
    if (rows.length === 0) {
      rows = element.querySelectorAll(':scope > div');
    }
    
    if (rows.length === 0) {
      rows = element.querySelectorAll(':scope > li');
    }
    
    if (rows.length === 0) {
      rows = element.querySelectorAll(':scope > article');
    }
    
    // For Transfermarkt specific structure
    if (rows.length === 0 && element.tagName === 'TBODY') {
      rows = element.querySelectorAll('tr');
    }
    
    return Array.from(rows);
  }

  getDivTableColumnCount(element, rows) {
    if (rows.length === 0) return 0;
    
    // Check first data row (might skip header)
    const dataRow = rows[1] || rows[0];
    const cells = dataRow.querySelectorAll(':scope > div, :scope > span, :scope > td');
    
    return cells.length;
  }

  extractDivTableSampleData(element, rows, maxRows) {
    const sampleData = [];
    const limit = Math.min(maxRows, rows.length);
    
    for (let i = 0; i < limit; i++) {
      const row = rows[i];
      const cells = row.querySelectorAll(':scope > div, :scope > span, :scope > td, :scope > *');
      const rowData = Array.from(cells).map(cell => this.cleanCellText(cell.textContent));
      
      if (rowData.length > 0) {
        sampleData.push(rowData);
      }
    }
    
    return sampleData;
  }

  hasDivTableHeader(element, rows) {
    if (rows.length === 0) return false;
    
    const firstRow = rows[0];
    
    // Check if first row has different styling or structure
    return firstRow.className.includes('header') || 
           firstRow.className.includes('head') ||
           firstRow.querySelector('th') !== null ||
           firstRow.style.fontWeight === 'bold';
  }

  getTableTitle(table, index) {
    // Check for caption
    const caption = table.querySelector('caption');
    if (caption) return caption.textContent.trim();

    // Check preceding elements
    let prev = table.previousElementSibling;
    while (prev) {
      if (/^h[1-6]$/i.test(prev.tagName)) {
        return prev.textContent.trim();
      }
      if (prev.offsetHeight > 0) break; // Stop at first visible element
      prev = prev.previousElementSibling;
    }

    // Check aria-label or title
    const ariaLabel = table.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    const titleAttr = table.getAttribute('title');
    if (titleAttr) return titleAttr;

    return `Table ${index + 1}`;
  }

  getColumnCount(table) {
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

  hasHeader(table) {
    const firstRow = table.querySelector('tr');
    if (!firstRow) return false;
    
    const headerCells = firstRow.querySelectorAll('th');
    return headerCells.length > 0;
  }

  extractSampleData(table, maxRows = 3) {
    const rows = table.querySelectorAll('tr');
    const data = [];
    const maxCols = this.getColumnCount(table);
    
    for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
      const row = rows[i];
      const rowData = new Array(maxCols).fill('');
      const cells = row.querySelectorAll('td, th');
      
      let cellIndex = 0;
      cells.forEach(cell => {
        const colspan = parseInt(cell.getAttribute('colspan')) || 1;
        const text = this.cleanCellText(cell.textContent);
        
        for (let j = 0; j < colspan && cellIndex < maxCols; j++) {
          rowData[cellIndex] = text;
          cellIndex++;
        }
      });
      
      data.push(rowData);
    }
    
    return data;
  }

  async scrapeTable(tableIndex, options = {}) {
    const tableInfo = this.tables[tableIndex];
    if (!tableInfo) {
      throw new Error('Table not found');
    }

    // Handle iframe tables
    if (tableInfo.fromIframe) {
      return await this.iframeScraper.scrapeIframeTable(
        tableInfo.iframeIndex,
        tableInfo.originalIndex || 0,
        options
      );
    }

    // Handle regular tables
    if (!tableInfo.element) {
      throw new Error('Table element not found');
    }

    const element = tableInfo.element;
    let data = [];

    // Check if it's a regular table or div-based table
    if (tableInfo.type === 'div-table' || element.tagName !== 'TABLE') {
      data = await this.scrapeDivTable(element, options);
    } else {
      const rows = element.querySelectorAll('tr');
      const maxCols = this.getColumnCount(element);

      // Handle infinite scroll or pagination
      if (options.loadAllData) {
        await this.loadAllTableData(element);
      }

      rows.forEach(row => {
        const rowData = new Array(maxCols).fill('');
        const cells = row.querySelectorAll('td, th');
        
        let cellIndex = 0;
        cells.forEach(cell => {
          const colspan = parseInt(cell.getAttribute('colspan')) || 1;
          const text = this.cleanCellText(cell.textContent);
          
          for (let j = 0; j < colspan && cellIndex < maxCols; j++) {
            rowData[cellIndex] = text;
            cellIndex++;
          }
        });
        
        data.push(rowData);
      });
    }

    // Record scraping in history
    if (this.historyManager && data.length > 0) {
      const selector = this.generateSelectorForTable(element);
      await this.historyManager.recordTableScraping(data, selector, options);
    }

    return data;
  }

  async scrapeDivTable(element, options = {}) {
    // Use intelligent table detection for all sites
    const tableType = this.detectTableType(element);
    const rawData = this.scrapeTableByType(element, tableType, options);
    return this.applyDataCleaning(rawData, tableType, options);
    
    const data = [];
    const rows = this.getDivTableRows(element);
    
    // Determine max columns
    let maxCols = 0;
    rows.forEach(row => {
      const cells = row.querySelectorAll(':scope > div, :scope > span, :scope > td, :scope > *');
      maxCols = Math.max(maxCols, cells.length);
    });
    
    // Extract data from each row
    rows.forEach(row => {
      const rowData = new Array(maxCols).fill('');
      const cells = row.querySelectorAll(':scope > div, :scope > span, :scope > td, :scope > *');
      
      cells.forEach((cell, index) => {
        if (index < maxCols) {
          rowData[index] = this.cleanCellText(cell.textContent);
        }
      });
      
      // Only add non-empty rows
      if (rowData.some(cell => cell.trim() !== '')) {
        data.push(rowData);
      }
    });
    
    return data;
  }

  // Universal table detection method
  isTableLike(element) {
    return element.tagName === 'TABLE' || 
           element.classList.contains('table') ||
           element.classList.contains('data-table') ||
           element.classList.contains('grid') ||
           element.classList.contains('list') ||
           element.querySelector('thead, tbody') ||
           element.querySelector('th, td') ||
           element.getAttribute('role') === 'table' ||
           this.hasTableStructure(element);
  }

  hasTableStructure(element) {
    // Check if element has a table-like structure
    const rows = element.querySelectorAll('[role="row"], .row, .table-row, tr');
    if (rows.length < 2) return false;
    
    const firstRow = rows[0];
    const cells = firstRow.querySelectorAll('[role="cell"], [role="columnheader"], .cell, td, th');
    return cells.length > 1;
  }

  // Universal table type detection for any website
  detectTableType(element) {
    const url = window.location.href.toLowerCase();
    const elementClasses = Array.from(element.classList).join(' ').toLowerCase();
    const elementText = element.textContent.toLowerCase();
    
    // Detect common table patterns across websites
    
    // Financial/Stock tables
    if (elementClasses.includes('stock') || elementClasses.includes('financial') || 
        elementText.includes('price') || elementText.includes('symbol') || elementText.includes('volume')) {
      return 'financial';
    }
    
    // E-commerce product tables
    if (elementClasses.includes('product') || elementClasses.includes('price') ||
        elementText.includes('add to cart') || elementText.includes('buy now')) {
      return 'ecommerce';
    }
    
    // Sports/Statistics tables
    if (elementClasses.includes('stats') || elementClasses.includes('score') || elementClasses.includes('player') ||
        elementText.includes('goals') || elementText.includes('points') || elementText.includes('ranking')) {
      return 'sports';
    }
    
    // Data/Analytics tables  
    if (elementClasses.includes('data') || elementClasses.includes('analytics') || elementClasses.includes('metrics') ||
        elementText.includes('analytics') || elementText.includes('report')) {
      return 'analytics';
    }
    
    // News/Content tables
    if (elementClasses.includes('article') || elementClasses.includes('news') || elementClasses.includes('post') ||
        elementText.includes('author') || elementText.includes('published')) {
      return 'content';
    }
    
    // Admin/Database tables
    if (elementClasses.includes('admin') || elementClasses.includes('database') || elementClasses.includes('records') ||
        url.includes('admin') || url.includes('dashboard')) {
      return 'admin';
    }
    
    // Responsive tables
    if (elementClasses.includes('responsive') || elementClasses.includes('mobile')) {
      return 'responsive';
    }
    
    // Generic data tables
    if (elementClasses.includes('table') || elementClasses.includes('grid') || elementClasses.includes('list')) {
      return 'data';
    }
    
    return 'generic';
  }

  // Universal table scraping based on detected type
  scrapeTableByType(element, tableType, options = {}) {
    switch (tableType) {
      case 'financial':
        return this.scrapeFinancialTable(element, options);
      case 'ecommerce':
        return this.scrapeEcommerceTable(element, options);
      case 'sports':
        return this.scrapeSportsTable(element, options);
      case 'analytics':
        return this.scrapeAnalyticsTable(element, options);
      case 'content':
        return this.scrapeContentTable(element, options);
      case 'admin':
        return this.scrapeAdminTable(element, options);
      case 'responsive':
        return this.scrapeResponsiveTable(element, options);
      case 'data':
        return this.scrapeDataTable(element, options);
      default:
        return this.scrapeGenericTable(element, options);
    }
  }

  // Apply universal data cleaning based on table type
  applyDataCleaning(data, tableType, options = {}) {
    switch (tableType) {
      case 'financial':
        return this.cleanFinancialData(data);
      case 'ecommerce':
        return this.cleanEcommerceData(data);
      case 'sports':
        return this.cleanSportsData(data);
      case 'analytics':
        return this.cleanAnalyticsData(data);
      case 'content':
        return this.cleanContentData(data);
      default:
        return this.cleanGenericData(data);
    }
  }

  // Universal table scraping methods
  scrapeGenericTable(element, options = {}) {
    const data = [];
    let rows;
    
    // Try different row selection strategies
    if (element.tagName === 'TABLE') {
      rows = element.querySelectorAll('tbody tr, tr');
    } else {
      // For div-based tables
      rows = this.getDivTableRows(element);
    }
    
    // Extract header if present
    const headerRow = element.querySelector('thead tr, .table-header, [class*="header"]');
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll('th, td, .cell, [class*="cell"]');
      if (headerCells.length > 0) {
        const headerData = Array.from(headerCells).map(cell => this.cleanCellText(cell.textContent));
        data.push(headerData);
      }
    }
    
    // Process data rows
    Array.from(rows).forEach(row => {
      if (!row.textContent.trim()) return;
      
      const cells = row.querySelectorAll('td, th, .cell, [class*="cell"]');
      if (cells.length > 0) {
        const rowData = Array.from(cells).map(cell => {
          let text = this.cleanCellText(cell.textContent);
          
          // Extract links if requested
          if (options.includeLinks) {
            const link = cell.querySelector('a');
            if (link && link.href) {
              text += ` {${link.href}}`;
            }
          }
          
          // Extract images if requested
          if (options.includeImages) {
            const img = cell.querySelector('img');
            if (img && img.alt) {
              text += ` [${img.alt}]`;
            }
          }
          
          return text;
        });
        
        if (rowData.some(cell => cell.trim() !== '')) {
          data.push(rowData);
        }
      }
    });
    
    return data;
  }

  // Specialized scraping methods that extend the generic approach
  scrapeFinancialTable(element, options = {}) {
    return this.scrapeGenericTable(element, { ...options, extractNumbers: true });
  }

  scrapeEcommerceTable(element, options = {}) {
    return this.scrapeGenericTable(element, { ...options, extractPrices: true, includeLinks: true });
  }

  scrapeSportsTable(element, options = {}) {
    return this.scrapeGenericTable(element, { ...options, extractNumbers: true, includeImages: true });
  }

  scrapeAnalyticsTable(element, options = {}) {
    return this.scrapeGenericTable(element, { ...options, extractNumbers: true, extractDates: true });
  }

  scrapeContentTable(element, options = {}) {
    return this.scrapeGenericTable(element, { ...options, includeLinks: true, extractDates: true });
  }

  scrapeAdminTable(element, options = {}) {
    return this.scrapeGenericTable(element, { ...options, preserveFormatting: true });
  }

  scrapeResponsiveTable(element, options = {}) {
    return this.scrapeGenericTable(element, options);
  }

  scrapeDataTable(element, options = {}) {
    return this.scrapeGenericTable(element, options);
  }

  // Universal data cleaning methods
  cleanGenericData(data) {
    return data.map(row => {
      return row.map(cell => {
        // Basic cleaning: trim whitespace, normalize spaces
        return cell.replace(/\s+/g, ' ').trim();
      });
    }).filter(row => row.some(cell => cell.length > 0));
  }

  cleanFinancialData(data) {
    return data.map((row, index) => {
      if (index === 0) return row; // Keep headers
      return row.map(cell => {
        // Clean financial data: preserve currency symbols and numbers
        if (/[$€£¥₹]|\d+[.,]\d+|\d+[KMB]/.test(cell)) {
          return cell.replace(/[^\d.,€$£¥₹KMB%-]/g, '');
        }
        return this.cleanCellText(cell);
      });
    });
  }

  cleanEcommerceData(data) {
    return data.map((row, index) => {
      if (index === 0) return row;
      return row.map(cell => {
        // Clean product data: preserve prices and ratings
        if (cell.includes('$') || cell.includes('€') || cell.includes('★')) {
          return cell;
        }
        return this.cleanCellText(cell);
      });
    });
  }

  cleanSportsData(data) {
    return data.map((row, index) => {
      if (index === 0) return row;
      return row.map(cell => {
        // Clean sports data: preserve numbers and basic formatting
        let cleaned = cell;
        // Remove extra brackets but preserve essential info
        if (cleaned.includes('[') && !cleaned.includes('Flag:')) {
          cleaned = cleaned.replace(/\[.*?\]/g, '').trim();
        }
        return this.cleanCellText(cleaned);
      });
    });
  }

  cleanAnalyticsData(data) {
    return data.map((row, index) => {
      if (index === 0) return row;
      return row.map(cell => {
        // Clean analytics data: preserve percentages and metrics
        if (/%|\d+[.,]\d+/.test(cell)) {
          return cell.replace(/[^\d.,%-]/g, '');
        }
        return this.cleanCellText(cell);
      });
    });
  }

  cleanContentData(data) {
    return data.map(row => {
      return row.map(cell => {
        // Clean content data: preserve basic formatting
        return this.cleanCellText(cell);
      });
    });
  }

  async loadAllTableData(table) {
    // Check for pagination or "load more" buttons near the table
    const container = table.closest('[data-pagination], .table-container, .data-table') || table.parentElement;
    const loadMoreBtn = container.querySelector('[data-load-more], .load-more, .show-more, button:contains("More")');
    
    if (loadMoreBtn && loadMoreBtn.offsetHeight > 0) {
      let previousRowCount = table.querySelectorAll('tr').length;
      
      while (loadMoreBtn && loadMoreBtn.offsetHeight > 0) {
        loadMoreBtn.click();
        await this.waitForNewRows(table, previousRowCount);
        previousRowCount = table.querySelectorAll('tr').length;
        
        // Safety break
        if (previousRowCount > 10000) break;
      }
    }

    // Handle infinite scroll
    await this.handleInfiniteScroll(table);
  }

  async waitForNewRows(table, previousCount, timeout = 3000) {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const currentCount = table.querySelectorAll('tr').length;
        const elapsed = Date.now() - startTime;
        
        if (currentCount > previousCount || elapsed >= timeout) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  async handleInfiniteScroll(table) {
    const container = table.closest('[data-scroll], .scrollable') || 
                     document.querySelector('.table-container, .data-container') || 
                     window;
    
    let previousRowCount = table.querySelectorAll('tr').length;
    let unchangedCount = 0;
    
    while (unchangedCount < 3) {
      // Scroll to bottom
      if (container === window) {
        window.scrollTo(0, document.body.scrollHeight);
      } else {
        container.scrollTop = container.scrollHeight;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const currentRowCount = table.querySelectorAll('tr').length;
      if (currentRowCount === previousRowCount) {
        unchangedCount++;
      } else {
        unchangedCount = 0;
        previousRowCount = currentRowCount;
      }
      
      // Safety break
      if (previousRowCount > 10000) break;
    }
  }

  cleanCellText(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  async handleExcelExport(data, filename, options = {}) {
    try {
      await this.excelExporter.exportToExcel(data, {
        filename: filename || 'table_data.xlsx',
        sheetName: options.sheetName || 'Table Data',
        includeHeaders: options.includeHeaders !== false,
        autoWidth: options.autoWidth !== false,
        formatting: {
          headerStyle: {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4CAF50" } },
            alignment: { horizontal: "center", vertical: "center" }
          },
          cellStyle: {
            alignment: { vertical: "top", wrapText: true }
          },
          borderStyle: {
            top: { style: "thin", color: { rgb: "CCCCCC" } },
            bottom: { style: "thin", color: { rgb: "CCCCCC" } },
            left: { style: "thin", color: { rgb: "CCCCCC" } },
            right: { style: "thin", color: { rgb: "CCCCCC" } }
          },
          ...options.formatting
        }
      });
    } catch (error) {
      console.error('Excel export failed:', error);
      throw error;
    }
  }

  async performAuthenticatedRequest(sessionId, url, options = {}) {
    try {
      // Apply authentication to request
      const authenticatedOptions = await this.authManager.applyAuth(sessionId, {
        ...options,
        url
      });

      // Make the request
      const response = await fetch(authenticatedOptions.url || url, {
        ...authenticatedOptions,
        url: undefined // Remove url from fetch options
      });

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: await this.parseResponse(response, options.responseType)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async parseResponse(response, responseType = 'text') {
    switch (responseType) {
      case 'json':
        return await response.json();
      case 'blob':
        return await response.blob();
      case 'arrayBuffer':
        return await response.arrayBuffer();
      case 'formData':
        return await response.formData();
      default:
        return await response.text();
    }
  }

  initializeTableSelector() {
    this.tableSelector = new TableSelector();
  }

  // Find div-based tables (responsive tables)
  findDivBasedTables() {
    const divTables = [];
    
    // Universal patterns for div-based tables across all websites
    const divTableSelectors = [
      // Generic responsive table patterns
      'div.responsive-table',
      '.table-responsive table',
      '.table-responsive',
      '[class*="responsive-table"]',
      '[role="table"]',
      '[class*="data-table"]:not(table)',
      '[class*="datatable"]:not(table)',
      '.table-container > div:not(table)',
      '.table-wrapper > div:not(table)',
      '[class*="grid-table"]',
      '[class*="flex-table"]',
      
      // Common table-like structures
      '.items',
      '.list-table',
      '.data-grid',
      '.grid-view',
      '.table-view',
      '.list-view table',
      '.data-list table',
      
      // Framework-specific patterns
      // Bootstrap
      '.table-responsive .table',
      '[class*="table-"]',
      
      // Material Design
      '.mat-table',
      '.mdc-data-table',
      
      // React/Vue patterns
      '[class*="Table"]',
      '[class*="DataTable"]',
      '[class*="data-grid"]',
      
      // E-commerce patterns
      '.product-table',
      '.price-table',
      '.comparison-table',
      '[class*="product-grid"] table',
      
      // Financial/Analytics patterns
      '.stock-table',
      '.financial-table',
      '.analytics-table',
      '.metrics-table',
      '.report-table',
      
      // Content/News patterns
      '.article-table',
      '.news-table',
      '.content-table',
      '.post-table',
      
      // Admin/Dashboard patterns
      '.admin-table',
      '.dashboard-table',
      '.data-table',
      '.records-table',
      
      // Sports/Statistics patterns (including TransferMarkt)
      '.stats-table',
      '.league-table',
      '.player-table',
      '.team-table',
      '.match-table',
      '.results-table',
      
      // General responsive table patterns
      '[role="table"]',
      '[class*="data-table"]:not(table)',
      '[class*="datatable"]:not(table)',
      '.table-container > div:not(table)',
      '.table-wrapper > div:not(table)',
      '[class*="grid-table"]',
      '[class*="flex-table"]',
      
      // Sports/stats sites patterns
      '.stats-table:not(table)',
      '.player-stats',
      '.league-table:not(table)',
      '.standings:not(table)',
      
      // Row-based structures that look like tables
      'div[class*="row"][class*="header"] ~ div[class*="row"]',
      '.list-row',
      '.data-row'
    ];
    
    divTableSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          // Check if this looks like a table structure
          if (this.isDivTable(element)) {
            divTables.push(element);
          }
        });
      } catch (e) {
        // Skip invalid selectors
      }
    });
    
    // Also check for structures with repeating patterns
    const potentialContainers = document.querySelectorAll('div[class*="container"], div[class*="wrapper"], div[class*="list"]');
    potentialContainers.forEach(container => {
      if (this.hasTableLikeStructure(container)) {
        divTables.push(container);
      }
    });
    
    // Remove duplicates and nested elements
    return this.filterUniqueElements(divTables);
  }
  
  // Check if a div element has table-like structure
  isDivTable(element) {
    // Skip if it's actually a table
    if (element.tagName === 'TABLE') return false;
    
    // Check for row-like children
    const children = element.children;
    if (children.length < 2) return false; // Need at least header + 1 data row
    
    // Check if children have consistent structure
    const firstChildClasses = children[0].className;
    let consistentStructure = 0;
    
    for (let i = 1; i < Math.min(children.length, 5); i++) {
      const child = children[i];
      // Check if children have similar class patterns or tag names
      if (child.children.length > 0 && 
          (child.className.includes('row') || 
           child.className.includes('item') ||
           child.className.includes('entry') ||
           child.children.length === children[0].children.length)) {
        consistentStructure++;
      }
    }
    
    return consistentStructure >= 1;
  }
  
  // Check if container has table-like repeating structure
  hasTableLikeStructure(container) {
    const rows = container.querySelectorAll(':scope > div, :scope > li, :scope > article');
    if (rows.length < 2) return false;
    
    // Check if rows have consistent number of "cells"
    const cellCounts = [];
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const cells = rows[i].querySelectorAll(':scope > div, :scope > span, :scope > td');
      cellCounts.push(cells.length);
    }
    
    // Check if most rows have the same number of cells
    const mostCommon = cellCounts.sort((a,b) => 
      cellCounts.filter(v => v === a).length - cellCounts.filter(v => v === b).length
    ).pop();
    
    const consistency = cellCounts.filter(count => count === mostCommon).length / cellCounts.length;
    return consistency > 0.6 && mostCommon > 1;
  }
  
  // Filter to keep only unique top-level elements
  filterUniqueElements(elements) {
    const unique = [];
    const seen = new Set();
    
    elements.forEach(element => {
      // Skip if we've seen this element
      if (seen.has(element)) return;
      
      // Skip if this element is contained within another element in our list
      let isNested = false;
      for (const other of elements) {
        if (other !== element && other.contains(element)) {
          isNested = true;
          break;
        }
      }
      
      if (!isNested) {
        unique.push(element);
        seen.add(element);
      }
    });
    
    return unique;
  }

  // Generate a CSS selector for a table element
  generateSelectorForTable(table) {
    if (table.id) {
      return `#${table.id}`;
    }
    
    if (table.className) {
      const classes = table.className.trim().split(/\s+/).filter(cls => cls);
      if (classes.length > 0) {
        return `table.${classes.join('.')}`;
      }
    }

    // Try to find a unique parent selector
    let selector = 'table';
    let parent = table.parentElement;
    
    while (parent && parent !== document.body) {
      if (parent.id) {
        selector = `#${parent.id} ${selector}`;
        break;
      }
      
      if (parent.className) {
        const classes = parent.className.trim().split(/\s+/).filter(cls => cls);
        if (classes.length > 0) {
          selector = `.${classes[0]} ${selector}`;
          break;
        }
      }
      
      parent = parent.parentElement;
    }

    // Add nth-child if needed for uniqueness
    const similarTables = document.querySelectorAll(selector);
    if (similarTables.length > 1) {
      const index = Array.from(similarTables).indexOf(table);
      if (index >= 0) {
        selector += `:nth-child(${index + 1})`;
      }
    }

    return selector;
  }
}

// Visual table selector class
class TableSelector {
  constructor() {
    this.isActive = false;
    this.highlightedElement = null;
    this.overlay = null;
    this.onTableSelected = null;
  }

  activate(callback) {
    if (this.isActive) return;
    
    this.isActive = true;
    this.onTableSelected = callback;
    this.createOverlay();
    this.addEventListeners();
    document.body.style.cursor = 'crosshair';
  }

  deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.removeEventListeners();
    this.removeOverlay();
    this.clearHighlight();
    document.body.style.cursor = '';
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'motuwe-selector-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 999999;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.1);
    `;
    document.body.appendChild(this.overlay);
  }

  removeOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  addEventListeners() {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleEscape = this.handleEscape.bind(this);
    
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleEscape);
  }

  removeEventListeners() {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleEscape);
  }

  handleMouseMove(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const table = element?.closest('table');
    
    if (table !== this.highlightedElement) {
      this.clearHighlight();
      if (table) {
        this.highlightTable(table);
      }
    }
  }

  handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (this.highlightedElement) {
      const tables = Array.from(document.querySelectorAll('table'));
      const index = tables.indexOf(this.highlightedElement);
      
      if (this.onTableSelected) {
        this.onTableSelected(index);
      }
    }
    
    this.deactivate();
  }

  handleEscape(event) {
    if (event.key === 'Escape') {
      this.deactivate();
    }
  }

  highlightTable(table) {
    this.highlightedElement = table;
    table.style.outline = '3px solid #4CAF50';
    table.style.outlineOffset = '2px';
    table.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
  }

  clearHighlight() {
    if (this.highlightedElement) {
      this.highlightedElement.style.outline = '';
      this.highlightedElement.style.outlineOffset = '';
      this.highlightedElement.style.backgroundColor = '';
      this.highlightedElement = null;
    }
  }
}

// Initialize content script
window.motuweContent = new MotuweContentScript();
window.motuweSelector = window.motuweContent.tableSelector;