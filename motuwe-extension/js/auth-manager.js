// Authentication and session management
class AuthManager {
  constructor() {
    this.sessions = new Map();
    this.authMethods = new Map();
    this.cookieStore = new Map();
    this.oauthConfigs = new Map();
    
    this.setupAuthMethods();
  }

  // Setup supported authentication methods
  setupAuthMethods() {
    this.authMethods.set('cookies', {
      name: 'Cookie Authentication',
      handler: this.handleCookieAuth.bind(this),
      supports: ['session', 'persistent']
    });

    this.authMethods.set('basic', {
      name: 'Basic Authentication', 
      handler: this.handleBasicAuth.bind(this),
      supports: ['credentials']
    });

    this.authMethods.set('bearer', {
      name: 'Bearer Token',
      handler: this.handleBearerAuth.bind(this),
      supports: ['token']
    });

    this.authMethods.set('oauth2', {
      name: 'OAuth 2.0',
      handler: this.handleOAuth2.bind(this),
      supports: ['authorization_code', 'client_credentials']
    });

    this.authMethods.set('form', {
      name: 'Form Authentication',
      handler: this.handleFormAuth.bind(this),
      supports: ['login_form']
    });

    this.authMethods.set('api_key', {
      name: 'API Key',
      handler: this.handleApiKeyAuth.bind(this),
      supports: ['header', 'query', 'body']
    });
  }

  // Cookie-based authentication
  async handleCookieAuth(config) {
    const { domain, cookies, persistent = true } = config;
    
    try {
      // Get existing cookies for domain
      const existingCookies = await this.getCookiesForDomain(domain);
      
      // Set new cookies
      if (cookies && Array.isArray(cookies)) {
        for (const cookie of cookies) {
          await this.setCookie(domain, cookie, persistent);
        }
      }

      // Store session info
      const sessionId = this.generateSessionId();
      this.sessions.set(sessionId, {
        domain,
        method: 'cookies',
        cookies: cookies || existingCookies,
        created: Date.now(),
        persistent
      });

      return {
        success: true,
        sessionId,
        method: 'cookies',
        cookieCount: (cookies || existingCookies).length
      };
    } catch (error) {
      throw new Error(`Cookie authentication failed: ${error.message}`);
    }
  }

  // Basic authentication
  async handleBasicAuth(config) {
    const { username, password, realm } = config;
    
    if (!username || !password) {
      throw new Error('Username and password required for basic auth');
    }

    const credentials = btoa(`${username}:${password}`);
    const sessionId = this.generateSessionId();
    
    this.sessions.set(sessionId, {
      method: 'basic',
      credentials,
      realm,
      created: Date.now()
    });

    return {
      success: true,
      sessionId,
      method: 'basic',
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    };
  }

  // Bearer token authentication
  async handleBearerAuth(config) {
    const { token, tokenType = 'Bearer' } = config;
    
    if (!token) {
      throw new Error('Token required for bearer auth');
    }

    const sessionId = this.generateSessionId();
    
    this.sessions.set(sessionId, {
      method: 'bearer',
      token,
      tokenType,
      created: Date.now()
    });

    return {
      success: true,
      sessionId,
      method: 'bearer',
      headers: {
        'Authorization': `${tokenType} ${token}`
      }
    };
  }

  // OAuth 2.0 authentication
  async handleOAuth2(config) {
    const { 
      clientId, 
      clientSecret, 
      redirectUri, 
      authUrl, 
      tokenUrl, 
      scope = '', 
      grantType = 'authorization_code' 
    } = config;

    if (!clientId || !authUrl || !tokenUrl) {
      throw new Error('Client ID, auth URL, and token URL required for OAuth 2.0');
    }

    const sessionId = this.generateSessionId();
    const state = this.generateState();

    // Store OAuth config
    this.oauthConfigs.set(sessionId, {
      ...config,
      state,
      created: Date.now()
    });

    if (grantType === 'authorization_code') {
      return this.handleAuthorizationCodeFlow(sessionId, config, state);
    } else if (grantType === 'client_credentials') {
      return this.handleClientCredentialsFlow(sessionId, config);
    } else {
      throw new Error(`Unsupported grant type: ${grantType}`);
    }
  }

  // Authorization code flow
  async handleAuthorizationCodeFlow(sessionId, config, state) {
    const { clientId, redirectUri, authUrl, scope } = config;
    
    const authParams = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope,
      state: state
    });

    const authUrlWithParams = `${authUrl}?${authParams.toString()}`;

    // Create and open auth window
    const authWindow = await this.createAuthWindow(authUrlWithParams, redirectUri);
    
    try {
      const authResult = await this.waitForAuthCallback(authWindow, redirectUri, state);
      
      if (authResult.error) {
        throw new Error(`OAuth error: ${authResult.error_description || authResult.error}`);
      }

      // Exchange code for token
      const tokenResult = await this.exchangeCodeForToken(sessionId, authResult.code, config);
      
      this.sessions.set(sessionId, {
        method: 'oauth2',
        grantType: 'authorization_code',
        accessToken: tokenResult.access_token,
        refreshToken: tokenResult.refresh_token,
        tokenType: tokenResult.token_type || 'Bearer',
        expiresAt: Date.now() + (tokenResult.expires_in * 1000),
        scope: tokenResult.scope || scope,
        created: Date.now()
      });

      return {
        success: true,
        sessionId,
        method: 'oauth2',
        tokenType: tokenResult.token_type || 'Bearer',
        expiresIn: tokenResult.expires_in
      };
    } finally {
      if (authWindow && !authWindow.closed) {
        authWindow.close();
      }
    }
  }

  // Client credentials flow
  async handleClientCredentialsFlow(sessionId, config) {
    const { clientId, clientSecret, tokenUrl, scope } = config;
    
    const tokenParams = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: scope || ''
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: tokenParams.toString()
      });

      if (!response.ok) {
        throw new Error(`Token request failed: ${response.statusText}`);
      }

      const tokenResult = await response.json();
      
      if (tokenResult.error) {
        throw new Error(`Token error: ${tokenResult.error_description || tokenResult.error}`);
      }

      this.sessions.set(sessionId, {
        method: 'oauth2',
        grantType: 'client_credentials',
        accessToken: tokenResult.access_token,
        tokenType: tokenResult.token_type || 'Bearer',
        expiresAt: Date.now() + (tokenResult.expires_in * 1000),
        scope: tokenResult.scope || scope,
        created: Date.now()
      });

      return {
        success: true,
        sessionId,
        method: 'oauth2',
        tokenType: tokenResult.token_type || 'Bearer',
        expiresIn: tokenResult.expires_in
      };
    } catch (error) {
      throw new Error(`Client credentials flow failed: ${error.message}`);
    }
  }

  // Form-based authentication
  async handleFormAuth(config) {
    const { 
      loginUrl, 
      usernameField = 'username', 
      passwordField = 'password', 
      username, 
      password,
      additionalFields = {},
      successIndicator,
      method = 'POST'
    } = config;

    if (!loginUrl || !username || !password) {
      throw new Error('Login URL, username, and password required for form auth');
    }

    const formData = new FormData();
    formData.append(usernameField, username);
    formData.append(passwordField, password);
    
    // Add additional fields
    Object.entries(additionalFields).forEach(([key, value]) => {
      formData.append(key, value);
    });

    try {
      const response = await fetch(loginUrl, {
        method,
        body: formData,
        credentials: 'include' // Important for cookies
      });

      if (!response.ok) {
        throw new Error(`Login request failed: ${response.statusText}`);
      }

      const responseText = await response.text();
      
      // Check for success indicator
      let loginSuccess = false;
      if (successIndicator) {
        loginSuccess = responseText.includes(successIndicator);
      } else {
        // Default: assume success if no error indicators
        loginSuccess = !responseText.toLowerCase().includes('error') && 
                     !responseText.toLowerCase().includes('invalid') &&
                     !responseText.toLowerCase().includes('failed');
      }

      if (!loginSuccess) {
        throw new Error('Login appears to have failed based on response content');
      }

      const sessionId = this.generateSessionId();
      const cookies = await this.getCookiesForUrl(loginUrl);

      this.sessions.set(sessionId, {
        method: 'form',
        loginUrl,
        cookies,
        created: Date.now()
      });

      return {
        success: true,
        sessionId,
        method: 'form',
        cookieCount: cookies.length
      };
    } catch (error) {
      throw new Error(`Form authentication failed: ${error.message}`);
    }
  }

  // API Key authentication
  async handleApiKeyAuth(config) {
    const { 
      apiKey, 
      keyName = 'X-API-Key', 
      location = 'header', // 'header', 'query', or 'body'
      paramName 
    } = config;

    if (!apiKey) {
      throw new Error('API key required');
    }

    const sessionId = this.generateSessionId();
    const keyParam = paramName || keyName;

    let authData = {};
    switch (location) {
      case 'header':
        authData.headers = { [keyParam]: apiKey };
        break;
      case 'query':
        authData.queryParams = { [keyParam]: apiKey };
        break;
      case 'body':
        authData.bodyParams = { [keyParam]: apiKey };
        break;
      default:
        throw new Error(`Invalid API key location: ${location}`);
    }

    this.sessions.set(sessionId, {
      method: 'api_key',
      location,
      keyName: keyParam,
      apiKey,
      ...authData,
      created: Date.now()
    });

    return {
      success: true,
      sessionId,
      method: 'api_key',
      location,
      ...authData
    };
  }

  // Get authentication headers for a session
  getAuthHeaders(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return {};

    switch (session.method) {
      case 'basic':
        return { 'Authorization': `Basic ${session.credentials}` };
      
      case 'bearer':
        return { 'Authorization': `${session.tokenType} ${session.token}` };
      
      case 'oauth2':
        if (this.isTokenExpired(session)) {
          // Token expired, need refresh
          return null;
        }
        return { 'Authorization': `${session.tokenType} ${session.accessToken}` };
      
      case 'api_key':
        return session.headers || {};
      
      default:
        return {};
    }
  }

  // Apply authentication to fetch request
  async applyAuth(sessionId, requestOptions = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Handle token refresh if needed
    if (session.method === 'oauth2' && this.isTokenExpired(session)) {
      await this.refreshToken(sessionId);
    }

    const authHeaders = this.getAuthHeaders(sessionId);
    if (authHeaders === null) {
      throw new Error('Authentication token expired and refresh failed');
    }

    // Merge headers
    requestOptions.headers = {
      ...requestOptions.headers,
      ...authHeaders
    };

    // Handle API key in query params
    if (session.method === 'api_key' && session.location === 'query') {
      const url = new URL(requestOptions.url || window.location.href);
      Object.entries(session.queryParams || {}).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
      requestOptions.url = url.toString();
    }

    // Handle API key in body
    if (session.method === 'api_key' && session.location === 'body') {
      if (requestOptions.body instanceof FormData) {
        Object.entries(session.bodyParams || {}).forEach(([key, value]) => {
          requestOptions.body.append(key, value);
        });
      } else if (typeof requestOptions.body === 'string') {
        try {
          const bodyObj = JSON.parse(requestOptions.body);
          Object.assign(bodyObj, session.bodyParams);
          requestOptions.body = JSON.stringify(bodyObj);
        } catch (e) {
          // Not JSON, skip body modification
        }
      }
    }

    // Include cookies for cookie-based auth
    if (session.method === 'cookies' || session.method === 'form') {
      requestOptions.credentials = 'include';
    }

    return requestOptions;
  }

  // Cookie management
  async getCookiesForDomain(domain) {
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      return new Promise((resolve) => {
        chrome.cookies.getAll({ domain }, (cookies) => {
          resolve(cookies || []);
        });
      });
    } else {
      // Fallback for environments without chrome.cookies
      return this.cookieStore.get(domain) || [];
    }
  }

  async getCookiesForUrl(url) {
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      return new Promise((resolve) => {
        chrome.cookies.getAll({ url }, (cookies) => {
          resolve(cookies || []);
        });
      });
    } else {
      const domain = new URL(url).hostname;
      return this.cookieStore.get(domain) || [];
    }
  }

  async setCookie(domain, cookie, persistent = true) {
    const cookieDetails = {
      url: `https://${domain}`,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || domain,
      path: cookie.path || '/',
      secure: cookie.secure !== false,
      httpOnly: cookie.httpOnly || false,
      sameSite: cookie.sameSite || 'lax'
    };

    if (persistent && cookie.expirationDate) {
      cookieDetails.expirationDate = cookie.expirationDate;
    }

    if (typeof chrome !== 'undefined' && chrome.cookies) {
      return new Promise((resolve, reject) => {
        chrome.cookies.set(cookieDetails, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    } else {
      // Fallback storage
      const domainCookies = this.cookieStore.get(domain) || [];
      domainCookies.push(cookieDetails);
      this.cookieStore.set(domain, domainCookies);
      return cookieDetails;
    }
  }

  // OAuth helper methods
  createAuthWindow(authUrl, redirectUri) {
    const width = 500;
    const height = 600;
    const left = (screen.width / 2) - (width / 2);
    const top = (screen.height / 2) - (height / 2);

    return window.open(
      authUrl,
      'oauth_window',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  }

  waitForAuthCallback(authWindow, redirectUri, state) {
    return new Promise((resolve, reject) => {
      const checkClosed = setInterval(() => {
        if (authWindow.closed) {
          clearInterval(checkClosed);
          reject(new Error('OAuth window was closed'));
        }

        try {
          const currentUrl = authWindow.location.href;
          
          if (currentUrl.startsWith(redirectUri)) {
            clearInterval(checkClosed);
            
            const url = new URL(currentUrl);
            const params = Object.fromEntries(url.searchParams.entries());
            
            // Verify state parameter
            if (params.state !== state) {
              reject(new Error('Invalid state parameter'));
              return;
            }

            resolve(params);
          }
        } catch (e) {
          // Cross-origin error, window hasn't redirected yet
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkClosed);
        if (!authWindow.closed) {
          authWindow.close();
        }
        reject(new Error('OAuth timeout'));
      }, 300000);
    });
  }

  async exchangeCodeForToken(sessionId, code, config) {
    const { clientId, clientSecret, tokenUrl, redirectUri } = config;
    
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: tokenParams.toString()
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  // Token management
  isTokenExpired(session) {
    if (!session.expiresAt) return false;
    return Date.now() >= session.expiresAt - 60000; // 1 minute buffer
  }

  async refreshToken(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.refreshToken) {
      throw new Error('Cannot refresh token: no refresh token available');
    }

    const config = this.oauthConfigs.get(sessionId);
    if (!config) {
      throw new Error('OAuth configuration not found');
    }

    const refreshParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: session.refreshToken
    });

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: refreshParams.toString()
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const tokenResult = await response.json();
      
      // Update session with new token
      session.accessToken = tokenResult.access_token;
      session.expiresAt = Date.now() + (tokenResult.expires_in * 1000);
      
      if (tokenResult.refresh_token) {
        session.refreshToken = tokenResult.refresh_token;
      }

      this.sessions.set(sessionId, session);
      
      return tokenResult;
    } catch (error) {
      // Remove expired session
      this.sessions.delete(sessionId);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  // Session management
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getAllSessions() {
    return Array.from(this.sessions.entries()).map(([id, session]) => ({
      id,
      method: session.method,
      created: session.created,
      domain: session.domain,
      expired: session.expiresAt ? Date.now() > session.expiresAt : false
    }));
  }

  removeSession(sessionId) {
    this.sessions.delete(sessionId);
    this.oauthConfigs.delete(sessionId);
  }

  clearExpiredSessions() {
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt && Date.now() > session.expiresAt) {
        this.removeSession(sessionId);
      }
    }
  }

  // Utility methods
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  generateState() {
    return Math.random().toString(36).substr(2, 15) + Date.now().toString(36);
  }

  getSupportedMethods() {
    return Array.from(this.authMethods.entries()).map(([key, method]) => ({
      key,
      name: method.name,
      supports: method.supports
    }));
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.AuthManager = AuthManager;
}