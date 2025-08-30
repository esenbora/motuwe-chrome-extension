// IndexedDB storage manager for local data persistence
class StorageManager {
  constructor() {
    this.dbName = 'MotuweDB';
    this.dbVersion = 1;
    this.db = null;
    this.stores = {
      tables: 'tables',
      sessions: 'sessions',
      selectors: 'selectors',
      templates: 'templates',
      history: 'history',
      cache: 'cache',
      exports: 'exports',
      settings: 'settings'
    };
    
    this.initPromise = this.initialize();
  }

  // Initialize IndexedDB
  async initialize() {
    try {
      this.db = await this.openDatabase();
      return true;
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);
      throw new Error(`Storage initialization failed: ${error.message}`);
    }
  }

  // Open IndexedDB database
  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        this.createStores(db, event.oldVersion);
      };
    });
  }

  // Create object stores
  createStores(db, oldVersion) {
    // Tables store - for scraped table data
    if (!db.objectStoreNames.contains(this.stores.tables)) {
      const tablesStore = db.createObjectStore(this.stores.tables, { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      tablesStore.createIndex('url', 'url', { unique: false });
      tablesStore.createIndex('title', 'title', { unique: false });
      tablesStore.createIndex('timestamp', 'timestamp', { unique: false });
      tablesStore.createIndex('hash', 'hash', { unique: false });
    }

    // Sessions store - for authentication and scraping sessions
    if (!db.objectStoreNames.contains(this.stores.sessions)) {
      const sessionsStore = db.createObjectStore(this.stores.sessions, { 
        keyPath: 'id' 
      });
      sessionsStore.createIndex('type', 'type', { unique: false });
      sessionsStore.createIndex('domain', 'domain', { unique: false });
      sessionsStore.createIndex('created', 'created', { unique: false });
      sessionsStore.createIndex('active', 'active', { unique: false });
    }

    // Selectors store - for custom selectors
    if (!db.objectStoreNames.contains(this.stores.selectors)) {
      const selectorsStore = db.createObjectStore(this.stores.selectors, { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      selectorsStore.createIndex('name', 'name', { unique: true });
      selectorsStore.createIndex('type', 'type', { unique: false });
      selectorsStore.createIndex('domain', 'domain', { unique: false });
      selectorsStore.createIndex('used', 'used', { unique: false });
    }

    // Templates store - for scraping templates
    if (!db.objectStoreNames.contains(this.stores.templates)) {
      const templatesStore = db.createObjectStore(this.stores.templates, { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      templatesStore.createIndex('name', 'name', { unique: true });
      templatesStore.createIndex('domain', 'domain', { unique: false });
      templatesStore.createIndex('category', 'category', { unique: false });
      templatesStore.createIndex('created', 'created', { unique: false });
    }

    // History store - for scraping history
    if (!db.objectStoreNames.contains(this.stores.history)) {
      const historyStore = db.createObjectStore(this.stores.history, { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      historyStore.createIndex('url', 'url', { unique: false });
      historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      historyStore.createIndex('success', 'success', { unique: false });
      historyStore.createIndex('tableCount', 'tableCount', { unique: false });
    }

    // Cache store - for temporary data caching
    if (!db.objectStoreNames.contains(this.stores.cache)) {
      const cacheStore = db.createObjectStore(this.stores.cache, { 
        keyPath: 'key' 
      });
      cacheStore.createIndex('expires', 'expires', { unique: false });
      cacheStore.createIndex('type', 'type', { unique: false });
    }

    // Exports store - for export metadata
    if (!db.objectStoreNames.contains(this.stores.exports)) {
      const exportsStore = db.createObjectStore(this.stores.exports, { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      exportsStore.createIndex('filename', 'filename', { unique: false });
      exportsStore.createIndex('format', 'format', { unique: false });
      exportsStore.createIndex('created', 'created', { unique: false });
      exportsStore.createIndex('tableId', 'tableId', { unique: false });
    }

    // Settings store - for user preferences
    if (!db.objectStoreNames.contains(this.stores.settings)) {
      const settingsStore = db.createObjectStore(this.stores.settings, { 
        keyPath: 'key' 
      });
      settingsStore.createIndex('category', 'category', { unique: false });
    }
  }

  // Generic CRUD operations
  async add(storeName, data) {
    await this.initPromise;
    
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    // Add timestamp if not present
    if (!data.timestamp && storeName !== this.stores.settings) {
      data.timestamp = Date.now();
    }
    
    return new Promise((resolve, reject) => {
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    await this.initPromise;
    
    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, data) {
    await this.initPromise;
    
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    // Update timestamp
    if (!data.timestamp && storeName !== this.stores.settings) {
      data.timestamp = Date.now();
    }
    
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    await this.initPromise;
    
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName, limit = null) {
    await this.initPromise;
    
    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = limit ? store.getAll(null, limit) : store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async query(storeName, indexName, value, limit = null) {
    await this.initPromise;
    
    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    
    return new Promise((resolve, reject) => {
      const request = limit ? index.getAll(value, limit) : index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName, indexName = null, value = null) {
    await this.initPromise;
    
    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const target = indexName ? store.index(indexName) : store;
    
    return new Promise((resolve, reject) => {
      const request = value ? target.count(value) : target.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Specialized table operations
  async saveTable(tableData, metadata = {}) {
    const tableRecord = {
      data: tableData,
      url: window.location.href,
      title: metadata.title || document.title,
      rows: tableData.length,
      cols: tableData[0]?.length || 0,
      hash: this.generateDataHash(tableData),
      selector: metadata.selector,
      transformations: metadata.transformations || [],
      ...metadata
    };

    return await this.add(this.stores.tables, tableRecord);
  }

  async getTable(id) {
    return await this.get(this.stores.tables, id);
  }

  async getTablesByUrl(url, limit = 10) {
    return await this.query(this.stores.tables, 'url', url, limit);
  }

  async getRecentTables(limit = 20) {
    await this.initPromise;
    
    const transaction = this.db.transaction([this.stores.tables], 'readonly');
    const store = transaction.objectStore(this.stores.tables);
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const results = [];
      const request = index.openCursor(null, 'prev');
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async findSimilarTables(dataHash, limit = 5) {
    return await this.query(this.stores.tables, 'hash', dataHash, limit);
  }

  // Session management
  async saveSession(sessionData) {
    const sessionRecord = {
      id: sessionData.id || this.generateId(),
      ...sessionData,
      created: sessionData.created || Date.now(),
      active: true
    };

    return await this.put(this.stores.sessions, sessionRecord);
  }

  async getSession(id) {
    return await this.get(this.stores.sessions, id);
  }

  async getActiveSessions() {
    return await this.query(this.stores.sessions, 'active', true);
  }

  async deactivateSession(id) {
    const session = await this.getSession(id);
    if (session) {
      session.active = false;
      session.deactivated = Date.now();
      await this.put(this.stores.sessions, session);
    }
  }

  // Selector management
  async saveSelector(selector) {
    const selectorRecord = {
      ...selector,
      used: selector.used || 0,
      lastUsed: selector.lastUsed || null
    };

    return await this.add(this.stores.selectors, selectorRecord);
  }

  async getSelector(id) {
    return await this.get(this.stores.selectors, id);
  }

  async getSelectorByName(name) {
    const selectors = await this.query(this.stores.selectors, 'name', name, 1);
    return selectors[0] || null;
  }

  async getSelectorsByDomain(domain, limit = 10) {
    return await this.query(this.stores.selectors, 'domain', domain, limit);
  }

  async incrementSelectorUsage(id) {
    const selector = await this.getSelector(id);
    if (selector) {
      selector.used = (selector.used || 0) + 1;
      selector.lastUsed = Date.now();
      await this.put(this.stores.selectors, selector);
    }
  }

  // Template management
  async saveTemplate(template) {
    return await this.add(this.stores.templates, template);
  }

  async getTemplate(id) {
    return await this.get(this.stores.templates, id);
  }

  async getTemplatesByCategory(category, limit = 20) {
    return await this.query(this.stores.templates, 'category', category, limit);
  }

  async getTemplatesByDomain(domain, limit = 10) {
    return await this.query(this.stores.templates, 'domain', domain, limit);
  }

  // History management
  async addToHistory(historyEntry) {
    return await this.add(this.stores.history, historyEntry);
  }

  async getHistory(limit = 50) {
    await this.initPromise;
    
    const transaction = this.db.transaction([this.stores.history], 'readonly');
    const store = transaction.objectStore(this.stores.history);
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const results = [];
      const request = index.openCursor(null, 'prev');
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async getHistoryByUrl(url, limit = 10) {
    return await this.query(this.stores.history, 'url', url, limit);
  }

  async getSuccessfulHistory(limit = 20) {
    return await this.query(this.stores.history, 'success', true, limit);
  }

  // Cache management
  async setCache(key, data, ttl = 3600000) { // 1 hour default TTL
    const cacheRecord = {
      key,
      data,
      expires: Date.now() + ttl,
      type: typeof data,
      size: JSON.stringify(data).length
    };

    return await this.put(this.stores.cache, cacheRecord);
  }

  async getCache(key) {
    const cached = await this.get(this.stores.cache, key);
    
    if (!cached) return null;
    
    // Check if expired
    if (cached.expires < Date.now()) {
      await this.delete(this.stores.cache, key);
      return null;
    }
    
    return cached.data;
  }

  async clearExpiredCache() {
    await this.initPromise;
    
    const transaction = this.db.transaction([this.stores.cache], 'readwrite');
    const store = transaction.objectStore(this.stores.cache);
    const index = store.index('expires');
    
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const request = index.openCursor(IDBKeyRange.upperBound(now));
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // Export tracking
  async saveExport(exportData) {
    const exportRecord = {
      ...exportData,
      created: Date.now()
    };

    return await this.add(this.stores.exports, exportRecord);
  }

  async getExportHistory(limit = 30) {
    await this.initPromise;
    
    const transaction = this.db.transaction([this.stores.exports], 'readonly');
    const store = transaction.objectStore(this.stores.exports);
    const index = store.index('created');
    
    return new Promise((resolve, reject) => {
      const results = [];
      const request = index.openCursor(null, 'prev');
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // Settings management
  async setSetting(key, value, category = 'general') {
    const settingRecord = {
      key,
      value,
      category,
      modified: Date.now()
    };

    return await this.put(this.stores.settings, settingRecord);
  }

  async getSetting(key, defaultValue = null) {
    const setting = await this.get(this.stores.settings, key);
    return setting ? setting.value : defaultValue;
  }

  async getSettings(category = null) {
    if (category) {
      const settings = await this.query(this.stores.settings, 'category', category);
      const result = {};
      settings.forEach(setting => {
        result[setting.key] = setting.value;
      });
      return result;
    } else {
      const allSettings = await this.getAll(this.stores.settings);
      const result = {};
      allSettings.forEach(setting => {
        result[setting.key] = setting.value;
      });
      return result;
    }
  }

  // Data analysis and statistics
  async getStorageStats() {
    const stats = {};
    
    for (const [name, storeName] of Object.entries(this.stores)) {
      stats[name] = await this.count(storeName);
    }

    // Calculate storage size estimate
    const estimates = await Promise.all(
      Object.values(this.stores).map(async (storeName) => {
        const items = await this.getAll(storeName, 10); // Sample
        const avgSize = items.reduce((sum, item) => 
          sum + JSON.stringify(item).length, 0) / items.length || 0;
        return avgSize * stats[Object.keys(this.stores).find(key => 
          this.stores[key] === storeName)];
      })
    );

    stats.estimatedSize = estimates.reduce((sum, size) => sum + size, 0);
    stats.estimatedSizeMB = (stats.estimatedSize / (1024 * 1024)).toFixed(2);

    return stats;
  }

  async getMostUsedSelectors(limit = 10) {
    await this.initPromise;
    
    const transaction = this.db.transaction([this.stores.selectors], 'readonly');
    const store = transaction.objectStore(this.stores.selectors);
    const index = store.index('used');
    
    return new Promise((resolve, reject) => {
      const results = [];
      const request = index.openCursor(null, 'prev');
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // Maintenance operations
  async cleanupOldData(daysOld = 30) {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    
    // Cleanup old history
    await this.deleteOldRecords(this.stores.history, 'timestamp', cutoffTime);
    
    // Cleanup old cache
    await this.clearExpiredCache();
    
    // Cleanup old exports metadata (keep data, just metadata)
    await this.deleteOldRecords(this.stores.exports, 'created', cutoffTime);
  }

  async deleteOldRecords(storeName, indexName, cutoffTime) {
    await this.initPromise;
    
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async backup(storeName = null) {
    const stores = storeName ? [storeName] : Object.values(this.stores);
    const backup = {};
    
    for (const store of stores) {
      backup[store] = await this.getAll(store);
    }
    
    return {
      version: this.dbVersion,
      timestamp: Date.now(),
      data: backup
    };
  }

  async restore(backupData) {
    if (!backupData.data) {
      throw new Error('Invalid backup data');
    }
    
    for (const [storeName, records] of Object.entries(backupData.data)) {
      if (Object.values(this.stores).includes(storeName)) {
        // Clear existing data
        await this.clearStore(storeName);
        
        // Restore records
        for (const record of records) {
          await this.add(storeName, record);
        }
      }
    }
  }

  async clearStore(storeName) {
    await this.initPromise;
    
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Utility methods
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  generateDataHash(data) {
    const str = JSON.stringify(data);
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}