// History and session management system
class HistoryManager {
  constructor(storage) {
    this.storage = storage;
    this.currentSession = null;
    this.sessionStartTime = null;
    
    this.initializeSession();
  }

  // Initialize new session
  async initializeSession() {
    this.sessionStartTime = Date.now();
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: this.sessionStartTime,
      url: window.location.href,
      domain: window.location.hostname,
      userAgent: navigator.userAgent,
      actions: [],
      scrapedTables: [],
      exports: [],
      errors: [],
      templates: [],
      status: 'active'
    };

    // Save session
    if (this.storage) {
      await this.storage.put(this.storage.stores.sessions, this.currentSession);
    }

    // Clean up old sessions periodically
    this.cleanupOldSessions();
  }

  // Generate unique session ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Record user action
  async recordAction(actionType, data = {}) {
    if (!this.currentSession) return;

    const action = {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: actionType,
      timestamp: Date.now(),
      data: data,
      url: window.location.href
    };

    this.currentSession.actions.push(action);
    await this.updateSession();

    // Also save to history for quick access
    if (this.storage) {
      await this.storage.put(this.storage.stores.history, {
        id: action.id,
        sessionId: this.currentSession.id,
        type: actionType,
        timestamp: action.timestamp,
        url: action.url,
        data: data
      });
    }
  }

  // Record table scraping
  async recordTableScraping(tableData, selector, options = {}) {
    if (!this.currentSession) return;

    const scrapingRecord = {
      id: `scrape_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      selector: selector,
      options: options,
      tableData: {
        rows: tableData.length,
        cols: tableData[0]?.length || 0,
        preview: tableData.slice(0, 3), // First 3 rows for preview
        hash: this.hashTableData(tableData)
      },
      url: window.location.href,
      success: true
    };

    this.currentSession.scrapedTables.push(scrapingRecord);
    await this.updateSession();
    await this.recordAction('table_scraped', {
      tableId: scrapingRecord.id,
      selector: selector,
      rows: scrapingRecord.tableData.rows,
      cols: scrapingRecord.tableData.cols
    });
  }

  // Record export
  async recordExport(exportData, format, filename) {
    if (!this.currentSession) return;

    const exportRecord = {
      id: `export_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      format: format,
      filename: filename,
      size: exportData.length,
      url: window.location.href,
      success: true
    };

    this.currentSession.exports.push(exportRecord);
    await this.updateSession();
    await this.recordAction('data_exported', {
      exportId: exportRecord.id,
      format: format,
      filename: filename,
      size: exportRecord.size
    });
  }

  // Record error
  async recordError(error, context = {}) {
    if (!this.currentSession) return;

    const errorRecord = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      message: error.message || error,
      stack: error.stack,
      context: context,
      url: window.location.href
    };

    this.currentSession.errors.push(errorRecord);
    await this.updateSession();
    await this.recordAction('error_occurred', {
      errorId: errorRecord.id,
      message: errorRecord.message,
      context: context
    });
  }

  // Record template usage
  async recordTemplateUsage(templateId, templateName, result) {
    if (!this.currentSession) return;

    const templateRecord = {
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      templateId: templateId,
      templateName: templateName,
      success: result.success,
      tablesFound: result.tables?.length || 0,
      errors: result.errors || [],
      url: window.location.href
    };

    this.currentSession.templates.push(templateRecord);
    await this.updateSession();
    await this.recordAction('template_used', {
      templateId: templateId,
      templateName: templateName,
      success: result.success,
      tablesFound: templateRecord.tablesFound
    });
  }

  // Update current session
  async updateSession() {
    if (!this.currentSession || !this.storage) return;

    this.currentSession.lastUpdated = Date.now();
    this.currentSession.duration = Date.now() - this.sessionStartTime;
    
    await this.storage.put(this.storage.stores.sessions, this.currentSession);
  }

  // End current session
  async endSession() {
    if (!this.currentSession) return;

    this.currentSession.status = 'ended';
    this.currentSession.endTime = Date.now();
    this.currentSession.duration = Date.now() - this.sessionStartTime;
    
    await this.updateSession();
    await this.recordAction('session_ended', {
      duration: this.currentSession.duration,
      actions: this.currentSession.actions.length,
      tables: this.currentSession.scrapedTables.length,
      exports: this.currentSession.exports.length
    });

    this.currentSession = null;
  }

  // Save current state as named session
  async saveSession(name, description = '') {
    if (!this.currentSession || !this.storage) {
      throw new Error('No active session to save');
    }

    const savedSession = {
      ...this.currentSession,
      id: `saved_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name,
      description: description,
      originalSessionId: this.currentSession.id,
      savedAt: Date.now(),
      type: 'saved'
    };

    await this.storage.put(this.storage.stores.sessions, savedSession);
    await this.recordAction('session_saved', {
      savedSessionId: savedSession.id,
      name: name
    });

    return savedSession.id;
  }

  // Load saved session
  async loadSession(sessionId) {
    if (!this.storage) {
      throw new Error('Storage not available');
    }

    const session = await this.storage.get(this.storage.stores.sessions, sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Create a copy for restoration
    const restoredSession = {
      ...session,
      id: this.generateSessionId(),
      startTime: Date.now(),
      status: 'restored',
      restoredFrom: sessionId,
      originalActions: [...session.actions],
      actions: []
    };

    // End current session if exists
    if (this.currentSession) {
      await this.endSession();
    }

    // Start restored session
    this.currentSession = restoredSession;
    this.sessionStartTime = Date.now();
    
    await this.updateSession();
    await this.recordAction('session_restored', {
      originalSessionId: sessionId,
      name: session.name
    });

    return restoredSession;
  }

  // Get session history
  async getSessionHistory(options = {}) {
    if (!this.storage) {
      return [];
    }

    const {
      limit = 50,
      offset = 0,
      domain = null,
      type = null,
      startDate = null,
      endDate = null
    } = options;

    let sessions = await this.storage.getAll(this.storage.stores.sessions);
    
    // Apply filters
    if (domain) {
      sessions = sessions.filter(s => s.domain === domain);
    }
    
    if (type) {
      sessions = sessions.filter(s => s.type === type || (type === 'regular' && !s.type));
    }
    
    if (startDate) {
      sessions = sessions.filter(s => s.startTime >= startDate);
    }
    
    if (endDate) {
      sessions = sessions.filter(s => s.startTime <= endDate);
    }

    // Sort by start time (newest first)
    sessions.sort((a, b) => b.startTime - a.startTime);

    // Apply pagination
    return sessions.slice(offset, offset + limit);
  }

  // Get action history
  async getActionHistory(options = {}) {
    if (!this.storage) {
      return [];
    }

    const {
      limit = 100,
      offset = 0,
      actionType = null,
      sessionId = null,
      startDate = null,
      endDate = null
    } = options;

    let actions = await this.storage.getAll(this.storage.stores.history);
    
    // Apply filters
    if (actionType) {
      actions = actions.filter(a => a.type === actionType);
    }
    
    if (sessionId) {
      actions = actions.filter(a => a.sessionId === sessionId);
    }
    
    if (startDate) {
      actions = actions.filter(a => a.timestamp >= startDate);
    }
    
    if (endDate) {
      actions = actions.filter(a => a.timestamp <= endDate);
    }

    // Sort by timestamp (newest first)
    actions.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    return actions.slice(offset, offset + limit);
  }

  // Get session statistics
  async getSessionStats(sessionId = null) {
    if (!this.storage) {
      return null;
    }

    const session = sessionId 
      ? await this.storage.get(this.storage.stores.sessions, sessionId)
      : this.currentSession;
    
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      name: session.name,
      duration: session.duration || (Date.now() - session.startTime),
      url: session.url,
      domain: session.domain,
      status: session.status,
      
      // Counts
      totalActions: session.actions.length,
      scrapedTables: session.scrapedTables.length,
      exports: session.exports.length,
      errors: session.errors.length,
      templatesUsed: session.templates.length,
      
      // Action breakdown
      actionTypes: this.getActionTypeBreakdown(session.actions),
      
      // Success rate
      successfulScrapes: session.scrapedTables.filter(t => t.success).length,
      failedScrapes: session.scrapedTables.filter(t => !t.success).length,
      
      // Export formats
      exportFormats: this.getExportFormatBreakdown(session.exports),
      
      // Most used templates
      templateUsage: this.getTemplateUsageBreakdown(session.templates),
      
      timestamps: {
        started: session.startTime,
        ended: session.endTime,
        lastUpdated: session.lastUpdated
      }
    };
  }

  // Get overall statistics
  async getOverallStats() {
    if (!this.storage) {
      return null;
    }

    const sessions = await this.storage.getAll(this.storage.stores.sessions);
    const actions = await this.storage.getAll(this.storage.stores.history);

    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalTables = sessions.reduce((sum, s) => sum + s.scrapedTables.length, 0);
    const totalExports = sessions.reduce((sum, s) => sum + s.exports.length, 0);
    const totalErrors = sessions.reduce((sum, s) => sum + s.errors.length, 0);

    // Domain breakdown
    const domainStats = {};
    sessions.forEach(session => {
      domainStats[session.domain] = (domainStats[session.domain] || 0) + 1;
    });

    // Most active time periods
    const hourlyActivity = new Array(24).fill(0);
    actions.forEach(action => {
      const hour = new Date(action.timestamp).getHours();
      hourlyActivity[hour]++;
    });

    return {
      sessions: {
        total: sessions.length,
        active: sessions.filter(s => s.status === 'active').length,
        saved: sessions.filter(s => s.type === 'saved').length,
        avgDuration: sessions.length ? totalDuration / sessions.length : 0
      },
      
      scraping: {
        totalTables: totalTables,
        totalExports: totalExports,
        totalErrors: totalErrors,
        successRate: totalTables ? ((totalTables - totalErrors) / totalTables * 100) : 0
      },
      
      activity: {
        totalActions: actions.length,
        actionTypes: this.getActionTypeBreakdown(actions),
        hourlyActivity: hourlyActivity
      },
      
      domains: domainStats,
      
      period: {
        firstSession: sessions.length ? Math.min(...sessions.map(s => s.startTime)) : null,
        lastSession: sessions.length ? Math.max(...sessions.map(s => s.startTime)) : null,
        totalDuration: totalDuration
      }
    };
  }

  // Delete session
  async deleteSession(sessionId) {
    if (!this.storage) {
      throw new Error('Storage not available');
    }

    // Delete session
    await this.storage.delete(this.storage.stores.sessions, sessionId);
    
    // Delete related history entries
    const actions = await this.storage.getAll(this.storage.stores.history);
    const sessionActions = actions.filter(a => a.sessionId === sessionId);
    
    for (const action of sessionActions) {
      await this.storage.delete(this.storage.stores.history, action.id);
    }
  }

  // Clean up old sessions
  async cleanupOldSessions() {
    if (!this.storage) return;

    const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
    const sessions = await this.storage.getAll(this.storage.stores.sessions);
    
    const oldSessions = sessions.filter(session => 
      session.startTime < cutoffTime && 
      session.type !== 'saved' && 
      session.status !== 'active'
    );

    for (const session of oldSessions) {
      await this.deleteSession(session.id);
    }

    // Also cleanup old history entries
    const actions = await this.storage.getAll(this.storage.stores.history);
    const oldActions = actions.filter(action => action.timestamp < cutoffTime);
    
    for (const action of oldActions) {
      await this.storage.delete(this.storage.stores.history, action.id);
    }
  }

  // Export session data
  async exportSessionData(sessionId, format = 'json') {
    if (!this.storage) {
      throw new Error('Storage not available');
    }

    const session = await this.storage.get(this.storage.stores.sessions, sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sessionData = {
      session: session,
      stats: await this.getSessionStats(sessionId)
    };

    switch (format) {
      case 'json':
        return JSON.stringify(sessionData, null, 2);
      
      case 'csv':
        return this.sessionToCSV(session);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Utility methods
  getActionTypeBreakdown(actions) {
    const breakdown = {};
    actions.forEach(action => {
      breakdown[action.type] = (breakdown[action.type] || 0) + 1;
    });
    return breakdown;
  }

  getExportFormatBreakdown(exports) {
    const breakdown = {};
    exports.forEach(exp => {
      breakdown[exp.format] = (breakdown[exp.format] || 0) + 1;
    });
    return breakdown;
  }

  getTemplateUsageBreakdown(templates) {
    const breakdown = {};
    templates.forEach(template => {
      const key = `${template.templateName} (${template.templateId})`;
      breakdown[key] = (breakdown[key] || 0) + 1;
    });
    return breakdown;
  }

  hashTableData(data) {
    // Simple hash for table data comparison
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  sessionToCSV(session) {
    const rows = [
      ['Type', 'Timestamp', 'Action', 'Details'],
      ['Session', session.startTime, 'Started', `URL: ${session.url}`]
    ];

    session.actions.forEach(action => {
      rows.push([
        'Action',
        action.timestamp,
        action.type,
        JSON.stringify(action.data)
      ]);
    });

    session.scrapedTables.forEach(table => {
      rows.push([
        'Table',
        table.timestamp,
        'Scraped',
        `Selector: ${table.selector}, Rows: ${table.tableData.rows}`
      ]);
    });

    session.exports.forEach(exp => {
      rows.push([
        'Export',
        exp.timestamp,
        'Exported',
        `Format: ${exp.format}, File: ${exp.filename}`
      ]);
    });

    if (session.endTime) {
      rows.push(['Session', session.endTime, 'Ended', `Duration: ${session.duration}ms`]);
    }

    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  // Get current session info
  getCurrentSession() {
    return this.currentSession;
  }

  // Resume session on page navigation
  async resumeSession(sessionId) {
    if (!this.storage) return;

    const session = await this.storage.get(this.storage.stores.sessions, sessionId);
    if (session && session.status === 'active') {
      this.currentSession = session;
      this.sessionStartTime = session.startTime;
      
      await this.recordAction('session_resumed', {
        previousUrl: session.url,
        newUrl: window.location.href
      });
      
      // Update URL for current page
      this.currentSession.url = window.location.href;
      await this.updateSession();
    }
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.HistoryManager = HistoryManager;
}