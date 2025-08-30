// Template system for common scraping patterns
class TemplateManager {
  constructor(storage) {
    this.storage = storage;
    this.builtInTemplates = new Map();
    this.customTemplates = new Map();
    
    this.setupBuiltInTemplates();
  }

  // Setup built-in templates for common sites/patterns
  setupBuiltInTemplates() {
    // Sports/Statistics template (universal for all sports sites)
    this.builtInTemplates.set('sports', {
      name: 'Sports & Statistics Tables',
      description: 'Universal template for sports data, player stats, league tables, and match results',
      category: 'sports',
      domains: ['transfermarkt.com', 'espn.com', 'bbc.com/sport', 'goal.com', 'skysports.com', 'premierleague.com'],
      selectors: {
        primary: [
          // Generic sports table selectors
          '.stats-table',
          '.league-table',
          '.player-table',
          '.team-table',
          '.match-table',
          '.results-table',
          '.standings-table',
          '.scores-table',
          
          // Responsive sports tables
          'div.responsive-table',
          '.table-responsive',
          '[class*="responsive-table"]',
          
          // Common sports data containers
          '.items',
          '.data-grid',
          '.grid-view',
          '.table-view',
          
          // Performance and analytics
          '.performance-grid table',
          '.analytics-table',
          '.metrics-table'
        ],
        fallback: [
          // Universal fallback selectors
          'table:has(.stats)',
          'table:has(.score)',
          'table:has(.player)',
          'table:has(.team)',
          'div:has(th)',
          '.table-container table',
          'tbody tr',
          'div[class*="table"]',
          'table[class*="data"]',
          '[role="table"]'
        ]
      },
      dataMapping: {
        dynamic: true,
        headerRow: true,
        customExtraction: true
      },
      transformations: [
        { type: 'cleanData', options: { trimSpaces: true, removeEmpty: false } },
        { type: 'extractNumbers', options: { format: 'first' } },
        { type: 'extractUrls', options: { preserveText: true } }
      ],
      validation: [
        { column: 0, required: true, minLength: 1 }
      ],
      specialHandling: {
        skipEmptyRows: true,
        extractImages: true,
        extractLinks: true,
        handleFlags: true,
        handleMarketValues: true
      }
    });

    // E-commerce product tables
    this.builtInTemplates.set('ecommerce-products', {
      name: 'E-commerce Products',
      description: 'Template for scraping product listings from e-commerce sites',
      category: 'ecommerce',
      domains: ['amazon.com', 'ebay.com', 'etsy.com', 'shopify.com'],
      selectors: {
        primary: [
          'table.product-table',
          '.product-list table',
          '[data-testid="product-table"]',
          '.items-table'
        ],
        fallback: [
          'table:has(.product)',
          'table:has(.price)',
          'table:has(.item-name)'
        ]
      },
      dataMapping: {
        columns: [
          { name: 'product_name', selectors: ['td:has(.product-name)', 'td:first-child', '.title'] },
          { name: 'price', selectors: ['td:has(.price)', '.price', '[data-price]'] },
          { name: 'rating', selectors: ['.rating', '.stars', '[data-rating]'] },
          { name: 'availability', selectors: ['.stock', '.availability', '.in-stock'] }
        ]
      },
      transformations: [
        { type: 'extractNumbers', column: 1, options: { format: 'first' } },
        { type: 'cleanData', options: { trimSpaces: true, removeEmpty: false } }
      ],
      validation: [
        { column: 0, required: true, minLength: 1 },
        { column: 1, type: 'number', min: 0 }
      ]
    });

    // Financial data tables
    this.builtInTemplates.set('financial-data', {
      name: 'Financial Data Tables',
      description: 'Template for financial data, stock tables, and market data',
      category: 'finance',
      domains: ['yahoo.com', 'bloomberg.com', 'marketwatch.com', 'investing.com'],
      selectors: {
        primary: [
          'table.financial-table',
          '.stock-table table',
          '[data-module="FinanceTable"]',
          '.market-data table'
        ],
        fallback: [
          'table:has(th:contains("Symbol"))',
          'table:has(th:contains("Price"))',
          'table:has(.ticker)'
        ]
      },
      dataMapping: {
        columns: [
          { name: 'symbol', selectors: ['td:first-child', '.symbol', '.ticker'] },
          { name: 'price', selectors: ['.price', '.last-price', '[data-field="regularMarketPrice"]'] },
          { name: 'change', selectors: ['.change', '.price-change'] },
          { name: 'volume', selectors: ['.volume', '[data-field="regularMarketVolume"]'] }
        ]
      },
      transformations: [
        { type: 'extractNumbers', column: 1, options: { format: 'first' } },
        { type: 'extractNumbers', column: 2, options: { format: 'first' } },
        { type: 'extractNumbers', column: 3, options: { format: 'first' } }
      ],
      authentication: {
        required: false,
        type: 'cookies'
      }
    });

    // Social media stats
    this.builtInTemplates.set('social-media', {
      name: 'Social Media Statistics',
      description: 'Template for social media statistics and engagement data',
      category: 'social',
      domains: ['twitter.com', 'facebook.com', 'instagram.com', 'linkedin.com'],
      selectors: {
        primary: [
          '.stats-table table',
          '[data-testid="analytics-table"]',
          '.metrics-table'
        ],
        fallback: [
          'table:has(.followers)',
          'table:has(.likes)',
          'table:has(.engagement)'
        ]
      },
      dataMapping: {
        columns: [
          { name: 'metric', selectors: ['td:first-child', '.metric-name'] },
          { name: 'value', selectors: ['.metric-value', '.count', '.number'] },
          { name: 'change', selectors: ['.change', '.trend', '.delta'] }
        ]
      },
      authentication: {
        required: true,
        type: 'oauth2',
        scope: 'read:stats'
      }
    });

    // CRM/Business data
    this.builtInTemplates.set('crm-data', {
      name: 'CRM and Business Data',
      description: 'Template for CRM systems, customer data, and business metrics',
      category: 'business',
      domains: ['salesforce.com', 'hubspot.com', 'pipedrive.com', 'zoho.com'],
      selectors: {
        primary: [
          '.crm-table table',
          '[data-testid="data-table"]',
          '.list-table table',
          '.records-table'
        ],
        fallback: [
          'table.listView',
          'table:has(.customer)',
          'table:has(.contact)'
        ]
      },
      dataMapping: {
        columns: [
          { name: 'name', selectors: ['.name', '.customer-name', '.contact-name'] },
          { name: 'email', selectors: ['.email', '.contact-email'] },
          { name: 'phone', selectors: ['.phone', '.contact-phone'] },
          { name: 'status', selectors: ['.status', '.stage', '.deal-status'] }
        ]
      },
      transformations: [
        { type: 'extractUrls', column: 1, options: { type: 'emails' } },
        { type: 'normalizeText', column: 0, options: { toTitleCase: true } }
      ],
      authentication: {
        required: true,
        type: 'bearer'
      }
    });

    // News and content tables
    this.builtInTemplates.set('news-content', {
      name: 'News and Content Tables',
      description: 'Template for news articles, blog posts, and content listings',
      category: 'content',
      domains: ['reddit.com', 'hackernews.com', 'medium.com'],
      selectors: {
        primary: [
          '.content-table table',
          '.articles-table',
          '[data-testid="posts-table"]'
        ],
        fallback: [
          'table:has(.title)',
          'table:has(.post)',
          'table:has(.article)'
        ]
      },
      dataMapping: {
        columns: [
          { name: 'title', selectors: ['.title', '.headline', '.post-title'] },
          { name: 'author', selectors: ['.author', '.by', '.username'] },
          { name: 'date', selectors: ['.date', '.published', '.timestamp'] },
          { name: 'score', selectors: ['.score', '.points', '.votes'] }
        ]
      },
      transformations: [
        { type: 'extractDates', column: 2, options: { format: 'iso' } },
        { type: 'extractNumbers', column: 3, options: { format: 'first' } }
      ]
    });

    // Analytics and reporting
    this.builtInTemplates.set('analytics', {
      name: 'Analytics and Reporting',
      description: 'Template for web analytics, reporting dashboards, and metrics',
      category: 'analytics',
      domains: ['analytics.google.com', 'mixpanel.com', 'amplitude.com'],
      selectors: {
        primary: [
          '.analytics-table table',
          '[data-testid="metrics-table"]',
          '.report-table'
        ],
        fallback: [
          'table:has(.metric)',
          'table:has(.pageviews)',
          'table:has(.sessions)'
        ]
      },
      dataMapping: {
        columns: [
          { name: 'dimension', selectors: ['td:first-child', '.dimension'] },
          { name: 'sessions', selectors: ['.sessions', '.visits'] },
          { name: 'pageviews', selectors: ['.pageviews', '.views'] },
          { name: 'bounce_rate', selectors: ['.bounce-rate', '.bounce'] }
        ]
      },
      transformations: [
        { type: 'extractNumbers', column: 1, options: { format: 'first' } },
        { type: 'extractNumbers', column: 2, options: { format: 'first' } },
        { type: 'extractNumbers', column: 3, options: { format: 'first' } }
      ],
      authentication: {
        required: true,
        type: 'oauth2'
      }
    });

    // Database/Admin tables
    this.builtInTemplates.set('database-admin', {
      name: 'Database and Admin Tables',
      description: 'Template for database management interfaces and admin panels',
      category: 'admin',
      domains: ['phpmyadmin', 'adminer.org', 'mongodb.com'],
      selectors: {
        primary: [
          '.database-table table',
          '.admin-table table',
          '[data-table="results"]'
        ],
        fallback: [
          'table.data',
          'table.results',
          'table:has(.record)'
        ]
      },
      dataMapping: {
        dynamic: true, // Columns determined at runtime
        headerRow: true
      },
      transformations: [
        { type: 'detectDataTypes', options: { addTypeRow: false } },
        { type: 'cleanData', options: { trimSpaces: true } }
      ],
      authentication: {
        required: true,
        type: 'form'
      }
    });
  }

  // Get template by ID
  async getTemplate(templateId) {
    // Check built-in templates first
    if (this.builtInTemplates.has(templateId)) {
      return {
        id: templateId,
        builtin: true,
        ...this.builtInTemplates.get(templateId)
      };
    }

    // Check custom templates
    if (this.storage) {
      const customTemplate = await this.storage.getTemplate(templateId);
      if (customTemplate) {
        return {
          id: customTemplate.id,
          builtin: false,
          ...customTemplate
        };
      }
    }

    return null;
  }

  // Find templates for current domain
  async findTemplatesForDomain(domain) {
    const templates = [];
    
    // Check built-in templates
    this.builtInTemplates.forEach((template, id) => {
      if (this.domainMatches(domain, template.domains || [])) {
        templates.push({
          id,
          builtin: true,
          ...template,
          matchScore: this.calculateDomainMatch(domain, template.domains || [])
        });
      }
    });

    // Check custom templates
    if (this.storage) {
      const customTemplates = await this.storage.getTemplatesByDomain(domain);
      customTemplates.forEach(template => {
        templates.push({
          id: template.id,
          builtin: false,
          ...template,
          matchScore: 1.0 // Exact domain match for custom templates
        });
      });
    }

    // Sort by match score
    return templates.sort((a, b) => b.matchScore - a.matchScore);
  }

  // Find templates by category
  async findTemplatesByCategory(category) {
    const templates = [];
    
    // Built-in templates
    this.builtInTemplates.forEach((template, id) => {
      if (template.category === category) {
        templates.push({
          id,
          builtin: true,
          ...template
        });
      }
    });

    // Custom templates
    if (this.storage) {
      const customTemplates = await this.storage.getTemplatesByCategory(category);
      customTemplates.forEach(template => {
        templates.push({
          id: template.id,
          builtin: false,
          ...template
        });
      });
    }

    return templates;
  }

  // Apply template to current page
  async applyTemplate(templateId, options = {}) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const result = {
      templateId,
      templateName: template.name,
      success: false,
      tables: [],
      errors: []
    };

    try {
      // Find tables using template selectors
      const tables = await this.findTablesWithTemplate(template, options);
      
      if (tables.length === 0) {
        result.errors.push('No tables found matching template selectors');
        return result;
      }

      // Process each table found
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        
        try {
          // Extract data
          const data = await this.extractTableData(table.element);
          
          // Apply data mapping if defined
          let mappedData = data;
          if (template.dataMapping) {
            mappedData = await this.applyDataMapping(data, template.dataMapping);
          }

          // Apply transformations
          if (template.transformations && template.transformations.length > 0) {
            mappedData = await this.applyTransformations(mappedData, template.transformations);
          }

          // Validate data
          const validation = template.validation 
            ? await this.validateData(mappedData, template.validation)
            : { valid: true, errors: [] };

          result.tables.push({
            index: i,
            selector: table.selector,
            originalData: data,
            processedData: mappedData,
            validation,
            metadata: {
              rows: mappedData.length,
              cols: mappedData[0]?.length || 0,
              template: templateId
            }
          });
        } catch (error) {
          result.errors.push(`Table ${i}: ${error.message}`);
        }
      }

      result.success = result.tables.length > 0;
      
    } catch (error) {
      result.errors.push(`Template application failed: ${error.message}`);
    }

    return result;
  }

  // Find tables using template selectors
  async findTablesWithTemplate(template, options = {}) {
    const foundTables = [];
    
    // Try primary selectors first
    for (const selector of template.selectors.primary || []) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element, index) => {
        if (element.tagName === 'TABLE') {
          foundTables.push({ element, selector, priority: 'primary' });
        } else {
          // Look for tables within the selected element
          const nestedTables = element.querySelectorAll('table');
          nestedTables.forEach(table => {
            foundTables.push({ element: table, selector, priority: 'primary' });
          });
        }
      });
    }

    // If no primary matches, try fallback selectors
    if (foundTables.length === 0 && template.selectors.fallback) {
      for (const selector of template.selectors.fallback) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element, index) => {
          if (element.tagName === 'TABLE') {
            foundTables.push({ element, selector, priority: 'fallback' });
          } else {
            const nestedTables = element.querySelectorAll('table');
            nestedTables.forEach(table => {
              foundTables.push({ element: table, selector, priority: 'fallback' });
            });
          }
        });
      }
    }

    // Remove duplicates based on element reference
    const uniqueTables = [];
    const seenElements = new Set();
    
    foundTables.forEach(table => {
      if (!seenElements.has(table.element)) {
        seenElements.add(table.element);
        uniqueTables.push(table);
      }
    });

    return uniqueTables;
  }

  // Extract table data
  async extractTableData(tableElement) {
    const rows = tableElement.querySelectorAll('tr');
    const data = [];
    
    rows.forEach(row => {
      const rowData = [];
      const cells = row.querySelectorAll('td, th');
      
      cells.forEach(cell => {
        rowData.push(cell.textContent.trim());
      });
      
      if (rowData.length > 0) {
        data.push(rowData);
      }
    });

    return data;
  }

  // Apply data mapping
  async applyDataMapping(data, mapping) {
    if (mapping.dynamic) {
      // Dynamic mapping - use data as-is but apply header detection
      return mapping.headerRow && data.length > 0 ? data : data;
    }

    if (!mapping.columns) {
      return data;
    }

    // Column-based mapping
    const mappedData = [];
    const headerRow = mapping.columns.map(col => col.name);
    mappedData.push(headerRow);

    // Process data rows (skip original header if present)
    const startIndex = mapping.headerRow ? 1 : 0;
    
    for (let i = startIndex; i < data.length; i++) {
      const row = data[i];
      const mappedRow = [];
      
      mapping.columns.forEach((colMapping, colIndex) => {
        // Use original column index or try to find by selector
        let cellValue = row[colIndex] || '';
        
        // If selectors are provided, try to find better match
        if (colMapping.selectors && row.length > colIndex) {
          // This would require access to the actual DOM element
          // For now, use the original cell value
          cellValue = row[colIndex] || '';
        }
        
        mappedRow.push(cellValue);
      });
      
      mappedData.push(mappedRow);
    }

    return mappedData;
  }

  // Apply transformations
  async applyTransformations(data, transformations) {
    let result = data;
    
    // Use worker manager if available
    if (window.WorkerManager) {
      const workerManager = new WorkerManager();
      try {
        result = await workerManager.transformData(result, transformations);
      } catch (error) {
        console.warn('Worker transformation failed, falling back to sync:', error);
        result = await this.applyTransformationsSync(result, transformations);
      }
    } else {
      result = await this.applyTransformationsSync(result, transformations);
    }

    return result;
  }

  // Synchronous transformations fallback
  async applyTransformationsSync(data, transformations) {
    let result = [...data.map(row => [...row])]; // Deep copy
    
    for (const transformation of transformations) {
      switch (transformation.type) {
        case 'extractNumbers':
          result = this.extractNumbers(result, transformation.options);
          break;
        case 'extractDates':
          result = this.extractDates(result, transformation.options);
          break;
        case 'cleanData':
          result = this.cleanData(result, transformation.options);
          break;
        case 'normalizeText':
          result = this.normalizeText(result, transformation.options);
          break;
        // Add more transformation types as needed
      }
    }

    return result;
  }

  // Simple transformation implementations
  extractNumbers(data, options) {
    const { column, format = 'first' } = options;
    
    return data.map(row => {
      if (column !== undefined && row[column]) {
        const numbers = row[column].toString().match(/\d+\.?\d*/g) || [];
        if (numbers.length > 0) {
          switch (format) {
            case 'first': row[column] = parseFloat(numbers[0]); break;
            case 'sum': row[column] = numbers.reduce((sum, n) => sum + parseFloat(n), 0); break;
            case 'all': row[column] = numbers.join(', '); break;
          }
        }
      }
      return row;
    });
  }

  extractDates(data, options) {
    const { column, format = 'iso' } = options;
    
    return data.map(row => {
      if (column !== undefined && row[column]) {
        const date = new Date(row[column]);
        if (!isNaN(date.getTime())) {
          switch (format) {
            case 'iso': row[column] = date.toISOString().split('T')[0]; break;
            case 'us': row[column] = date.toLocaleDateString('en-US'); break;
            case 'timestamp': row[column] = date.getTime(); break;
          }
        }
      }
      return row;
    });
  }

  cleanData(data, options) {
    const { trimSpaces = true, removeEmpty = false } = options;
    
    return data.map(row => {
      return row.map(cell => {
        let cleaned = cell;
        if (trimSpaces) cleaned = cleaned.toString().trim();
        return cleaned;
      });
    }).filter(row => !removeEmpty || row.some(cell => cell && cell.toString().trim() !== ''));
  }

  normalizeText(data, options) {
    const { column, toTitleCase = false, toLowerCase = false } = options;
    
    return data.map(row => {
      if (column !== undefined && row[column]) {
        let text = row[column].toString();
        
        if (toLowerCase) text = text.toLowerCase();
        if (toTitleCase) {
          text = text.replace(/\w\S*/g, (txt) => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        }
        
        row[column] = text;
      }
      return row;
    });
  }


  // Validate data
  async validateData(data, validationRules) {
    const errors = [];
    
    data.forEach((row, rowIndex) => {
      validationRules.forEach(rule => {
        const { column, required, type, minLength, maxLength, min, max, pattern } = rule;
        const value = row[column];
        
        // Required validation
        if (required && (!value || value.toString().trim() === '')) {
          errors.push(`Row ${rowIndex}, Column ${column}: Required field is empty`);
          return;
        }
        
        if (!value) return; // Skip other validations if empty and not required
        
        // Type validation
        switch (type) {
          case 'number':
            if (isNaN(parseFloat(value))) {
              errors.push(`Row ${rowIndex}, Column ${column}: Must be a number`);
            }
            break;
          case 'email':
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              errors.push(`Row ${rowIndex}, Column ${column}: Invalid email format`);
            }
            break;
        }
        
        // Length validation
        const strValue = value.toString();
        if (minLength && strValue.length < minLength) {
          errors.push(`Row ${rowIndex}, Column ${column}: Too short (min ${minLength})`);
        }
        if (maxLength && strValue.length > maxLength) {
          errors.push(`Row ${rowIndex}, Column ${column}: Too long (max ${maxLength})`);
        }
        
        // Numeric range validation
        if (type === 'number') {
          const numValue = parseFloat(value);
          if (min !== undefined && numValue < min) {
            errors.push(`Row ${rowIndex}, Column ${column}: Below minimum (${min})`);
          }
          if (max !== undefined && numValue > max) {
            errors.push(`Row ${rowIndex}, Column ${column}: Above maximum (${max})`);
          }
        }
        
        // Pattern validation
        if (pattern && !new RegExp(pattern).test(strValue)) {
          errors.push(`Row ${rowIndex}, Column ${column}: Does not match required pattern`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Create custom template
  async createTemplate(templateData) {
    if (!this.storage) {
      throw new Error('Storage not available for saving custom templates');
    }

    const template = {
      ...templateData,
      created: Date.now(),
      builtin: false,
      used: 0
    };

    const templateId = await this.storage.saveTemplate(template);
    return templateId;
  }

  // Update template
  async updateTemplate(templateId, updates) {
    if (!this.storage) {
      throw new Error('Storage not available');
    }

    const template = await this.storage.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const updatedTemplate = {
      ...template,
      ...updates,
      modified: Date.now()
    };

    await this.storage.put(this.storage.stores.templates, updatedTemplate);
    return updatedTemplate;
  }

  // Delete custom template
  async deleteTemplate(templateId) {
    if (!this.storage) {
      throw new Error('Storage not available');
    }

    await this.storage.delete(this.storage.stores.templates, templateId);
  }

  // Get all templates
  async getAllTemplates() {
    const templates = [];
    
    // Built-in templates
    this.builtInTemplates.forEach((template, id) => {
      templates.push({
        id,
        builtin: true,
        ...template
      });
    });

    // Custom templates
    if (this.storage) {
      const customTemplates = await this.storage.getAll(this.storage.stores.templates);
      customTemplates.forEach(template => {
        templates.push({
          id: template.id,
          builtin: false,
          ...template
        });
      });
    }

    return templates;
  }

  // Get template categories
  getCategories() {
    const categories = new Set();
    
    this.builtInTemplates.forEach(template => {
      if (template.category) {
        categories.add(template.category);
      }
    });

    return Array.from(categories).sort();
  }

  // Test template on current page
  async testTemplate(templateId, options = {}) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const testResult = {
      templateId,
      templateName: template.name,
      domain: window.location.hostname,
      url: window.location.href,
      timestamp: Date.now(),
      results: {
        selectorMatches: [],
        tablesFound: 0,
        sampleData: null,
        errors: []
      }
    };

    try {
      // Test selectors
      const selectorResults = await this.testSelectors(template.selectors);
      testResult.results.selectorMatches = selectorResults;
      
      // Find tables
      const tables = await this.findTablesWithTemplate(template, options);
      testResult.results.tablesFound = tables.length;
      
      // Extract sample data from first table
      if (tables.length > 0) {
        const sampleData = await this.extractTableData(tables[0].element);
        testResult.results.sampleData = sampleData.slice(0, 5); // First 5 rows
      }
      
    } catch (error) {
      testResult.results.errors.push(error.message);
    }

    return testResult;
  }

  // Test selectors
  async testSelectors(selectors) {
    const results = [];
    
    // Test primary selectors
    if (selectors.primary) {
      for (const selector of selectors.primary) {
        try {
          const elements = document.querySelectorAll(selector);
          results.push({
            selector,
            type: 'primary',
            matches: elements.length,
            success: elements.length > 0
          });
        } catch (error) {
          results.push({
            selector,
            type: 'primary',
            matches: 0,
            success: false,
            error: error.message
          });
        }
      }
    }

    // Test fallback selectors
    if (selectors.fallback) {
      for (const selector of selectors.fallback) {
        try {
          const elements = document.querySelectorAll(selector);
          results.push({
            selector,
            type: 'fallback',
            matches: elements.length,
            success: elements.length > 0
          });
        } catch (error) {
          results.push({
            selector,
            type: 'fallback',
            matches: 0,
            success: false,
            error: error.message
          });
        }
      }
    }

    return results;
  }

  // Utility methods
  domainMatches(currentDomain, templateDomains) {
    return templateDomains.some(domain => {
      return currentDomain.includes(domain) || domain.includes(currentDomain);
    });
  }

  calculateDomainMatch(currentDomain, templateDomains) {
    let bestMatch = 0;
    
    templateDomains.forEach(domain => {
      if (currentDomain === domain) {
        bestMatch = Math.max(bestMatch, 1.0);
      } else if (currentDomain.includes(domain)) {
        bestMatch = Math.max(bestMatch, 0.8);
      } else if (domain.includes(currentDomain)) {
        bestMatch = Math.max(bestMatch, 0.6);
      }
    });

    return bestMatch;
  }

  // Export template
  exportTemplate(templateId) {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    return {
      version: '1.0',
      exported: Date.now(),
      template: template
    };
  }

  // Import template
  async importTemplate(templateData) {
    if (!templateData.template) {
      throw new Error('Invalid template data');
    }

    const template = templateData.template;
    delete template.id; // Remove existing ID
    delete template.created;
    delete template.used;

    return await this.createTemplate(template);
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.TemplateManager = TemplateManager;
}