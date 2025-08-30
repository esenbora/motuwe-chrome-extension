// Options page controller
class MotuweOptions {
  constructor() {
    this.defaultSettings = {
      waitForDynamic: true,
      waitTimeout: 5000,
      includeHiddenTables: false,
      autoDetectChanges: true,
      exportFormat: 'csv',
      csvEncoding: 'utf8',
      autoLoadAll: true,
      theme: 'dark',
      showAdvanced: false,
      maxTableSize: 10000,
      processingDelay: 100
    };

    this.initialize();
  }

  async initialize() {
    this.setupEventListeners();
    await this.loadSettings();
    this.updateRangeValues();
  }

  setupEventListeners() {
    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', () => {
      this.resetSettings();
    });

    // Range input updates
    document.getElementById('waitTimeout').addEventListener('input', (e) => {
      document.getElementById('waitTimeoutValue').textContent = e.target.value + 's';
    });

    document.getElementById('maxTableSize').addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      const displayValue = value === 0 ? '∞' : (value >= 1000 ? (value / 1000) + 'k' : value);
      document.getElementById('maxTableSizeValue').textContent = displayValue;
    });

    document.getElementById('processingDelay').addEventListener('input', (e) => {
      document.getElementById('processingDelayValue').textContent = e.target.value + 'ms';
    });
  }

  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
      const settings = { ...this.defaultSettings, ...response.settings };
      
      this.populateForm(settings);
      
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showStatus('Failed to load settings', 'error');
    }
  }

  populateForm(settings) {
    // Checkboxes
    document.getElementById('waitForDynamic').checked = settings.waitForDynamic;
    document.getElementById('includeHiddenTables').checked = settings.includeHiddenTables;
    document.getElementById('autoDetectChanges').checked = settings.autoDetectChanges;
    document.getElementById('autoLoadAll').checked = settings.autoLoadAll;
    document.getElementById('showAdvanced').checked = settings.showAdvanced;

    // Selects
    document.getElementById('exportFormat').value = settings.exportFormat;
    document.getElementById('csvEncoding').value = settings.csvEncoding;
    document.getElementById('theme').value = settings.theme;

    // Ranges
    document.getElementById('waitTimeout').value = settings.waitTimeout / 1000;
    document.getElementById('maxTableSize').value = settings.maxTableSize;
    document.getElementById('processingDelay').value = settings.processingDelay;
  }

  updateRangeValues() {
    // Update range value displays
    const waitTimeout = document.getElementById('waitTimeout');
    document.getElementById('waitTimeoutValue').textContent = waitTimeout.value + 's';

    const maxTableSize = document.getElementById('maxTableSize');
    const sizeValue = parseInt(maxTableSize.value);
    const sizeDisplay = sizeValue === 0 ? '∞' : (sizeValue >= 1000 ? (sizeValue / 1000) + 'k' : sizeValue);
    document.getElementById('maxTableSizeValue').textContent = sizeDisplay;

    const processingDelay = document.getElementById('processingDelay');
    document.getElementById('processingDelayValue').textContent = processingDelay.value + 'ms';
  }

  async saveSettings() {
    try {
      const settings = this.collectFormData();
      
      await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: settings
      });

      this.showStatus('Settings saved successfully!', 'success');
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showStatus('Failed to save settings', 'error');
    }
  }

  collectFormData() {
    return {
      waitForDynamic: document.getElementById('waitForDynamic').checked,
      waitTimeout: parseInt(document.getElementById('waitTimeout').value) * 1000,
      includeHiddenTables: document.getElementById('includeHiddenTables').checked,
      autoDetectChanges: document.getElementById('autoDetectChanges').checked,
      exportFormat: document.getElementById('exportFormat').value,
      csvEncoding: document.getElementById('csvEncoding').value,
      autoLoadAll: document.getElementById('autoLoadAll').checked,
      theme: document.getElementById('theme').value,
      showAdvanced: document.getElementById('showAdvanced').checked,
      maxTableSize: parseInt(document.getElementById('maxTableSize').value),
      processingDelay: parseInt(document.getElementById('processingDelay').value)
    };
  }

  async resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to their defaults?')) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: this.defaultSettings
      });

      this.populateForm(this.defaultSettings);
      this.updateRangeValues();
      this.showStatus('Settings reset to defaults', 'success');
      
    } catch (error) {
      console.error('Failed to reset settings:', error);
      this.showStatus('Failed to reset settings', 'error');
    }
  }

  showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';

    // Hide status after 3 seconds
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  }
}

// Initialize options page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MotuweOptions();
});