// Advanced selector engine for XPath and CSS selectors
class SelectorEngine {
  constructor() {
    this.customSelectors = new Map();
    this.selectorHistory = [];
  }

  // Evaluate XPath expression
  evaluateXPath(xpath, contextNode = document) {
    try {
      const result = document.evaluate(
        xpath,
        contextNode,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const elements = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        elements.push(result.snapshotItem(i));
      }
      
      return elements;
    } catch (error) {
      throw new Error(`Invalid XPath expression: ${error.message}`);
    }
  }

  // Evaluate CSS selector
  evaluateCSS(selector, contextNode = document) {
    try {
      return Array.from(contextNode.querySelectorAll(selector));
    } catch (error) {
      throw new Error(`Invalid CSS selector: ${error.message}`);
    }
  }

  // Smart selector that handles both XPath and CSS
  evaluate(selector, contextNode = document) {
    if (!selector || typeof selector !== 'string') {
      throw new Error('Selector must be a non-empty string');
    }

    selector = selector.trim();

    // Detect XPath (starts with / or // or contains XPath functions)
    const isXPath = selector.startsWith('/') || 
                    selector.startsWith('//') ||
                    /\b(text|contains|position|last|count|ancestor|descendant|following|preceding)\s*\(/.test(selector);

    if (isXPath) {
      return this.evaluateXPath(selector, contextNode);
    } else {
      return this.evaluateCSS(selector, contextNode);
    }
  }

  // Find tables using advanced selectors
  findTables(selector, options = {}) {
    try {
      let elements = this.evaluate(selector);
      
      // Filter to only table elements or elements containing tables
      const tables = [];
      
      elements.forEach(element => {
        if (element.tagName === 'TABLE') {
          tables.push(element);
        } else {
          // Look for tables within the selected element
          const nestedTables = element.querySelectorAll('table');
          tables.push(...Array.from(nestedTables));
        }
      });

      // Apply additional filters
      return this.filterTables(tables, options);
    } catch (error) {
      throw new Error(`Selector evaluation failed: ${error.message}`);
    }
  }

  // Filter tables based on options
  filterTables(tables, options) {
    return tables.filter(table => {
      // Minimum row count
      if (options.minRows) {
        const rows = table.querySelectorAll('tr');
        if (rows.length < options.minRows) return false;
      }

      // Minimum column count
      if (options.minCols) {
        const firstRow = table.querySelector('tr');
        if (!firstRow) return false;
        const cells = firstRow.querySelectorAll('td, th');
        if (cells.length < options.minCols) return false;
      }

      // Visibility check
      if (!options.includeHidden) {
        const style = window.getComputedStyle(table);
        const rect = table.getBoundingClientRect();
        if (style.display === 'none' || 
            style.visibility === 'hidden' || 
            rect.width === 0 || 
            rect.height === 0) {
          return false;
        }
      }

      // Text content filter
      if (options.containsText) {
        const text = table.textContent.toLowerCase();
        const searchText = options.containsText.toLowerCase();
        if (!text.includes(searchText)) return false;
      }

      // Exclude tables with specific attributes
      if (options.excludeAttributes) {
        for (const attr of options.excludeAttributes) {
          if (table.hasAttribute(attr)) return false;
        }
      }

      return true;
    });
  }

  // Generate XPath for an element
  generateXPath(element) {
    if (!element || element === document) return '';
    
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts = [];
    let current = element;

    while (current && current !== document) {
      const tagName = current.tagName.toLowerCase();
      const siblings = Array.from(current.parentNode?.children || [])
        .filter(sibling => sibling.tagName === current.tagName);

      if (siblings.length === 1) {
        parts.unshift(tagName);
      } else {
        const index = siblings.indexOf(current) + 1;
        parts.unshift(`${tagName}[${index}]`);
      }

      current = current.parentNode;
    }

    return '/' + parts.join('/');
  }

  // Generate CSS selector for an element
  generateCSS(element) {
    if (!element || element === document) return '';

    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const parts = [];
    let current = element;

    while (current && current !== document) {
      let selector = current.tagName.toLowerCase();

      // Add class names if available
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/)
          .filter(cls => cls.length > 0)
          .map(cls => `.${CSS.escape(cls)}`)
          .join('');
        if (classes) {
          selector += classes;
        }
      }

      // Add nth-child if needed for uniqueness
      const siblings = Array.from(current.parentNode?.children || [])
        .filter(sibling => sibling.tagName === current.tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }

      parts.unshift(selector);

      // Check if selector is unique
      try {
        const testSelector = parts.join(' > ');
        if (document.querySelectorAll(testSelector).length === 1) {
          break;
        }
      } catch (e) {
        // Continue building selector
      }

      current = current.parentNode;
    }

    return parts.join(' > ');
  }

  // Save custom selector with name
  saveSelector(name, selector, description = '') {
    this.customSelectors.set(name, {
      selector,
      description,
      created: new Date(),
      used: 0
    });
    this.saveToStorage();
  }

  // Get saved selector
  getSavedSelector(name) {
    return this.customSelectors.get(name);
  }

  // List all saved selectors
  listSavedSelectors() {
    return Array.from(this.customSelectors.entries()).map(([name, data]) => ({
      name,
      ...data
    }));
  }

  // Delete saved selector
  deleteSavedSelector(name) {
    const deleted = this.customSelectors.delete(name);
    if (deleted) {
      this.saveToStorage();
    }
    return deleted;
  }

  // Add to selector history
  addToHistory(selector, type = 'auto') {
    this.selectorHistory.unshift({
      selector,
      type,
      timestamp: new Date(),
      success: true
    });

    // Keep only last 50 entries
    if (this.selectorHistory.length > 50) {
      this.selectorHistory = this.selectorHistory.slice(0, 50);
    }

    this.saveToStorage();
  }

  // Get selector history
  getHistory() {
    return this.selectorHistory;
  }

  // Validate selector
  validateSelector(selector) {
    try {
      const elements = this.evaluate(selector);
      return {
        valid: true,
        elementCount: elements.length,
        tableCount: elements.filter(el => 
          el.tagName === 'TABLE' || el.querySelector('table')
        ).length
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Generate common table selectors
  generateCommonSelectors() {
    return [
      {
        name: 'All Tables',
        selector: 'table',
        description: 'Select all table elements'
      },
      {
        name: 'Data Tables',
        selector: 'table[class*="data"], table[id*="data"], .data-table table',
        description: 'Tables with data-related class names'
      },
      {
        name: 'Grid Tables',
        selector: 'table[class*="grid"], .grid table, [role="grid"] table',
        description: 'Tables with grid-related attributes'
      },
      {
        name: 'Tables with Headers',
        selector: 'table:has(th), table:has(thead)',
        description: 'Tables containing header cells'
      },
      {
        name: 'Large Tables',
        selector: '//table[count(.//tr) > 10]',
        description: 'Tables with more than 10 rows (XPath)'
      },
      {
        name: 'Visible Tables',
        selector: 'table:not([style*="display: none"]):not([hidden])',
        description: 'Only visible tables'
      }
    ];
  }

  // Save selectors to chrome storage
  async saveToStorage() {
    try {
      await chrome.storage.local.set({
        motuweCustomSelectors: Array.from(this.customSelectors.entries()),
        motuweSelectorHistory: this.selectorHistory
      });
    } catch (error) {
      console.warn('Failed to save selectors to storage:', error);
    }
  }

  // Load selectors from chrome storage
  async loadFromStorage() {
    try {
      const result = await chrome.storage.local.get([
        'motuweCustomSelectors',
        'motuweSelectorHistory'
      ]);

      if (result.motuweCustomSelectors) {
        this.customSelectors = new Map(result.motuweCustomSelectors);
      }

      if (result.motuweSelectorHistory) {
        this.selectorHistory = result.motuweSelectorHistory;
      }
    } catch (error) {
      console.warn('Failed to load selectors from storage:', error);
    }
  }
}

// Export for use in content script
window.SelectorEngine = SelectorEngine;