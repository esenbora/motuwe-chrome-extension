// Background service worker for Motuwe extension
class MotuweBackground {
  constructor() {
    this.initializeExtension();
  }

  initializeExtension() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.setDefaultSettings();
      }
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle tab updates for dynamic content detection
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.notifyContentScript(tabId);
      }
    });
  }

  async setDefaultSettings() {
    const defaultSettings = {
      waitForDynamic: true,
      waitTimeout: 5000,
      includeHiddenTables: false,
      autoDetectChanges: true,
      exportFormat: 'csv',
      theme: 'dark'
    };

    await chrome.storage.sync.set({ motuweSettings: defaultSettings });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'exportData':
          if (request.format === 'xlsx') {
            // For Excel, delegate to content script
            sendResponse({ useContentScript: true });
          } else {
            await this.handleExport(request.data, request.format, request.filename);
            sendResponse({ success: true });
          }
          break;

        case 'getSettings':
          const settings = await this.getSettings();
          sendResponse({ settings });
          break;

        case 'saveSettings':
          await chrome.storage.sync.set({ motuweSettings: request.settings });
          sendResponse({ success: true });
          break;

        case 'injectTableSelector':
          await this.injectTableSelector(sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'removeTableSelector':
          await this.removeTableSelector(sender.tab.id);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  async getSettings() {
    const result = await chrome.storage.sync.get('motuweSettings');
    return result.motuweSettings || {};
  }

  async handleExport(data, format, filename) {
    let content, mimeType;
    
    switch (format) {
      case 'csv':
        content = this.convertToCSV(data);
        mimeType = 'text/csv';
        break;
      case 'json':
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        break;
      case 'xlsx':
        content = await this.convertToExcel(data);
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      default:
        throw new Error('Unsupported format');
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: url,
      filename: `${filename}.${format}`,
      saveAs: true
    });
  }

  convertToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) return '';
    
    const csvRows = data.map(row => {
      return row.map(cell => {
        const escaped = String(cell || '').replace(/"/g, '""');
        return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') 
          ? `"${escaped}"` 
          : escaped;
      }).join(',');
    });
    
    return '\ufeff' + csvRows.join('\r\n'); // UTF-8 BOM for Excel
  }

  async convertToExcel(data) {
    // For background script, we'll use a simpler approach
    // The full Excel export is handled in the content script
    return this.convertToCSV(data);
  }

  async injectTableSelector(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.motuweSelector) {
          window.motuweSelector.activate();
        }
      }
    });
  }

  async removeTableSelector(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.motuweSelector) {
          window.motuweSelector.deactivate();
        }
      }
    });
  }

  async notifyContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'pageUpdated' });
    } catch (error) {
      // Tab might not have content script injected yet
    }
  }
}

// Initialize background service
new MotuweBackground();