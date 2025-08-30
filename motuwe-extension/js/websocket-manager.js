// WebSocket manager for real-time data scraping
class WebSocketManager {
  constructor() {
    this.connections = new Map();
    this.subscriptions = new Map();
    this.messageHandlers = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    
    this.setupDefaultHandlers();
  }

  // Setup default message handlers
  setupDefaultHandlers() {
    this.messageHandlers.set('table_update', this.handleTableUpdate.bind(this));
    this.messageHandlers.set('data_change', this.handleDataChange.bind(this));
    this.messageHandlers.set('page_update', this.handlePageUpdate.bind(this));
    this.messageHandlers.set('auth_required', this.handleAuthRequired.bind(this));
    this.messageHandlers.set('error', this.handleError.bind(this));
  }

  // Create WebSocket connection
  async createConnection(config) {
    const {
      url,
      name = `ws_${Date.now()}`,
      protocols = [],
      headers = {},
      auth = null,
      reconnect = true,
      heartbeat = true,
      heartbeatInterval = 30000
    } = config;

    if (this.connections.has(name)) {
      throw new Error(`Connection '${name}' already exists`);
    }

    try {
      // Apply authentication if provided
      let connectionUrl = url;
      if (auth && auth.type === 'query') {
        const urlObj = new URL(url);
        Object.entries(auth.params || {}).forEach(([key, value]) => {
          urlObj.searchParams.set(key, value);
        });
        connectionUrl = urlObj.toString();
      }

      const ws = new WebSocket(connectionUrl, protocols);
      
      const connection = {
        ws,
        url: connectionUrl,
        name,
        config,
        status: 'connecting',
        connected: false,
        lastActivity: Date.now(),
        subscriptions: new Set(),
        messageQueue: [],
        heartbeatTimer: null,
        reconnectTimer: null,
        statistics: {
          messagesReceived: 0,
          messagesSent: 0,
          reconnections: 0,
          errors: 0
        }
      };

      this.setupConnectionEvents(connection);
      this.connections.set(name, connection);

      // Wait for connection to be established
      await this.waitForConnection(connection);
      
      // Setup heartbeat if enabled
      if (heartbeat) {
        this.setupHeartbeat(connection, heartbeatInterval);
      }

      return {
        name,
        status: 'connected',
        url: connectionUrl
      };
    } catch (error) {
      throw new Error(`Failed to create WebSocket connection: ${error.message}`);
    }
  }

  // Setup connection event handlers
  setupConnectionEvents(connection) {
    const { ws, name, config } = connection;

    ws.onopen = () => {
      connection.status = 'connected';
      connection.connected = true;
      connection.lastActivity = Date.now();
      this.reconnectAttempts.set(name, 0);

      // Apply authentication if required
      if (config.auth && config.auth.type === 'message') {
        this.sendMessage(name, config.auth.message);
      }

      // Send queued messages
      this.flushMessageQueue(connection);

      // Notify subscribers
      this.notifySubscribers(name, 'connection', { status: 'connected' });
    };

    ws.onmessage = (event) => {
      connection.lastActivity = Date.now();
      connection.statistics.messagesReceived++;
      
      try {
        const data = this.parseMessage(event.data);
        this.handleMessage(name, data);
      } catch (error) {
        console.error(`Failed to parse WebSocket message for ${name}:`, error);
        connection.statistics.errors++;
      }
    };

    ws.onclose = (event) => {
      connection.status = 'disconnected';
      connection.connected = false;
      
      if (connection.heartbeatTimer) {
        clearInterval(connection.heartbeatTimer);
        connection.heartbeatTimer = null;
      }

      // Attempt reconnection if enabled
      if (config.reconnect && !event.wasClean) {
        this.attemptReconnection(connection);
      }

      this.notifySubscribers(name, 'connection', { 
        status: 'disconnected',
        code: event.code,
        reason: event.reason
      });
    };

    ws.onerror = (error) => {
      connection.statistics.errors++;
      console.error(`WebSocket error for ${name}:`, error);
      
      this.notifySubscribers(name, 'error', { 
        error: 'WebSocket error occurred' 
      });
    };
  }

  // Wait for WebSocket connection to be established
  waitForConnection(connection, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkConnection = () => {
        if (connection.connected) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Connection timeout'));
        } else if (connection.status === 'disconnected') {
          reject(new Error('Connection failed'));
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  // Setup heartbeat mechanism
  setupHeartbeat(connection, interval) {
    connection.heartbeatTimer = setInterval(() => {
      if (connection.connected) {
        const heartbeatMessage = connection.config.heartbeatMessage || 
          { type: 'ping', timestamp: Date.now() };
        
        this.sendMessage(connection.name, heartbeatMessage);
      }
    }, interval);
  }

  // Flush queued messages
  flushMessageQueue(connection) {
    while (connection.messageQueue.length > 0) {
      const message = connection.messageQueue.shift();
      connection.ws.send(message);
      connection.statistics.messagesSent++;
    }
  }

  // Parse incoming message
  parseMessage(data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      // Return as plain text if not JSON
      return { type: 'text', data: data };
    }
  }

  // Handle incoming message
  handleMessage(connectionName, message) {
    const messageType = message.type || 'unknown';
    
    // Call specific handler if exists
    const handler = this.messageHandlers.get(messageType);
    if (handler) {
      handler(connectionName, message);
    }

    // Notify subscribers
    this.notifySubscribers(connectionName, 'message', message);
  }

  // Send message through WebSocket
  sendMessage(connectionName, message) {
    const connection = this.connections.get(connectionName);
    if (!connection) {
      throw new Error(`Connection '${connectionName}' not found`);
    }

    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

    if (connection.connected) {
      connection.ws.send(messageStr);
      connection.statistics.messagesSent++;
    } else {
      // Queue message for when connection is restored
      connection.messageQueue.push(messageStr);
    }
  }

  // Subscribe to WebSocket events
  subscribe(connectionName, eventType, callback) {
    const subscriptionKey = `${connectionName}:${eventType}`;
    
    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
    }
    
    this.subscriptions.get(subscriptionKey).add(callback);

    // Add to connection's subscription list
    const connection = this.connections.get(connectionName);
    if (connection) {
      connection.subscriptions.add(subscriptionKey);
    }

    return {
      unsubscribe: () => {
        const callbacks = this.subscriptions.get(subscriptionKey);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            this.subscriptions.delete(subscriptionKey);
          }
        }
      }
    };
  }

  // Notify subscribers
  notifySubscribers(connectionName, eventType, data) {
    const subscriptionKey = `${connectionName}:${eventType}`;
    const callbacks = this.subscriptions.get(subscriptionKey);
    
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data, connectionName, eventType);
        } catch (error) {
          console.error('Subscription callback error:', error);
        }
      });
    }
  }

  // Attempt to reconnect
  async attemptReconnection(connection) {
    const { name, config } = connection;
    const attempts = this.reconnectAttempts.get(name) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      this.notifySubscribers(name, 'connection', { 
        status: 'failed',
        reason: 'Max reconnection attempts reached'
      });
      return;
    }

    this.reconnectAttempts.set(name, attempts + 1);
    connection.statistics.reconnections++;

    const delay = this.reconnectDelay * Math.pow(2, attempts); // Exponential backoff
    
    connection.reconnectTimer = setTimeout(async () => {
      try {
        this.notifySubscribers(name, 'connection', { 
          status: 'reconnecting',
          attempt: attempts + 1
        });

        // Create new WebSocket with same config
        const ws = new WebSocket(connection.url, config.protocols || []);
        connection.ws = ws;
        connection.status = 'connecting';
        
        this.setupConnectionEvents(connection);
        await this.waitForConnection(connection);
        
      } catch (error) {
        console.error(`Reconnection attempt ${attempts + 1} failed for ${name}:`, error);
        this.attemptReconnection(connection);
      }
    }, delay);
  }

  // Default message handlers
  handleTableUpdate(connectionName, message) {
    // Handle table update messages
    const { tableId, action, data } = message;
    
    if (action === 'insert') {
      this.notifyTableChange(connectionName, 'row_added', { tableId, data });
    } else if (action === 'update') {
      this.notifyTableChange(connectionName, 'row_updated', { tableId, data });
    } else if (action === 'delete') {
      this.notifyTableChange(connectionName, 'row_deleted', { tableId, data });
    }
  }

  handleDataChange(connectionName, message) {
    // Handle general data change notifications
    this.notifyTableChange(connectionName, 'data_changed', message.data);
  }

  handlePageUpdate(connectionName, message) {
    // Handle page update notifications
    this.notifySubscribers(connectionName, 'page_update', message.data);
  }

  handleAuthRequired(connectionName, message) {
    // Handle authentication required messages
    this.notifySubscribers(connectionName, 'auth_required', message.data);
  }

  handleError(connectionName, message) {
    // Handle error messages
    const connection = this.connections.get(connectionName);
    if (connection) {
      connection.statistics.errors++;
    }
    
    this.notifySubscribers(connectionName, 'error', message.data);
  }

  // Notify table changes
  notifyTableChange(connectionName, changeType, data) {
    this.notifySubscribers(connectionName, 'table_change', {
      type: changeType,
      data: data,
      timestamp: Date.now()
    });
  }

  // Real-time table monitoring
  async startTableMonitoring(connectionName, config) {
    const {
      tableSelector,
      monitoringMode = 'changes', // 'changes', 'polling', 'stream'
      pollInterval = 5000,
      filters = {}
    } = config;

    const connection = this.connections.get(connectionName);
    if (!connection) {
      throw new Error(`Connection '${connectionName}' not found`);
    }

    // Subscribe to table-related messages
    this.subscribe(connectionName, 'table_change', (data) => {
      this.handleTableMonitoringUpdate(connectionName, data);
    });

    // Send monitoring start message
    this.sendMessage(connectionName, {
      type: 'start_monitoring',
      tableSelector,
      mode: monitoringMode,
      pollInterval,
      filters
    });

    return {
      stop: () => this.stopTableMonitoring(connectionName)
    };
  }

  stopTableMonitoring(connectionName) {
    this.sendMessage(connectionName, {
      type: 'stop_monitoring'
    });
  }

  handleTableMonitoringUpdate(connectionName, data) {
    // Process real-time table updates
    const { type, data: updateData, timestamp } = data;
    
    // Emit custom event for extension components
    const event = new CustomEvent('motuwe_table_update', {
      detail: { connectionName, type, data: updateData, timestamp }
    });
    
    document.dispatchEvent(event);
  }

  // Stream data processing
  async startDataStream(connectionName, config) {
    const {
      streamType = 'table_rows',
      batchSize = 100,
      transformer = null
    } = config;

    const dataBuffer = [];
    let batchProcessor = null;

    const subscription = this.subscribe(connectionName, 'message', (message) => {
      if (message.type === streamType) {
        let data = message.data;
        
        // Apply transformer if provided
        if (transformer && typeof transformer === 'function') {
          try {
            data = transformer(data);
          } catch (error) {
            console.error('Data transformer error:', error);
            return;
          }
        }

        dataBuffer.push(data);

        // Process batch when full
        if (dataBuffer.length >= batchSize) {
          this.processBatch(connectionName, [...dataBuffer], streamType);
          dataBuffer.length = 0; // Clear buffer
        }
      }
    });

    // Process remaining data periodically
    batchProcessor = setInterval(() => {
      if (dataBuffer.length > 0) {
        this.processBatch(connectionName, [...dataBuffer], streamType);
        dataBuffer.length = 0;
      }
    }, 5000);

    return {
      stop: () => {
        subscription.unsubscribe();
        if (batchProcessor) {
          clearInterval(batchProcessor);
        }
      }
    };
  }

  processBatch(connectionName, batch, streamType) {
    // Emit batch processed event
    const event = new CustomEvent('motuwe_batch_processed', {
      detail: { connectionName, batch, streamType, size: batch.length }
    });
    
    document.dispatchEvent(event);
  }

  // Connection management
  closeConnection(connectionName) {
    const connection = this.connections.get(connectionName);
    if (!connection) return;

    // Clean up timers
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
    }
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
    }

    // Close WebSocket
    connection.ws.close(1000, 'Normal closure');

    // Clean up subscriptions
    connection.subscriptions.forEach(subscriptionKey => {
      this.subscriptions.delete(subscriptionKey);
    });

    // Remove connection
    this.connections.delete(connectionName);
    this.reconnectAttempts.delete(connectionName);
  }

  // Get connection status
  getConnectionStatus(connectionName) {
    const connection = this.connections.get(connectionName);
    if (!connection) return null;

    return {
      name: connectionName,
      status: connection.status,
      connected: connection.connected,
      url: connection.url,
      lastActivity: connection.lastActivity,
      statistics: { ...connection.statistics },
      subscriptionCount: connection.subscriptions.size
    };
  }

  // Get all connections
  getAllConnections() {
    return Array.from(this.connections.keys()).map(name => 
      this.getConnectionStatus(name)
    );
  }

  // Custom message handler registration
  registerMessageHandler(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
  }

  unregisterMessageHandler(messageType) {
    this.messageHandlers.delete(messageType);
  }

  // Utility methods
  isConnected(connectionName) {
    const connection = this.connections.get(connectionName);
    return connection ? connection.connected : false;
  }

  getMessageQueue(connectionName) {
    const connection = this.connections.get(connectionName);
    return connection ? [...connection.messageQueue] : [];
  }

  clearMessageQueue(connectionName) {
    const connection = this.connections.get(connectionName);
    if (connection) {
      connection.messageQueue.length = 0;
    }
  }

  // Clean up all connections
  destroy() {
    for (const connectionName of this.connections.keys()) {
      this.closeConnection(connectionName);
    }
    
    this.subscriptions.clear();
    this.messageHandlers.clear();
    this.reconnectAttempts.clear();
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.WebSocketManager = WebSocketManager;
}