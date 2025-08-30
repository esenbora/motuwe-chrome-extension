// Advanced data transformation tools
class DataTransformer {
  constructor() {
    this.transformations = new Map();
    this.presets = this.getTransformationPresets();
  }

  // Apply transformation pipeline to data
  async transformData(data, transformations = []) {
    if (!Array.isArray(data) || data.length === 0) {
      return data;
    }

    let result = this.deepClone(data);

    for (const transformation of transformations) {
      try {
        result = await this.applyTransformation(result, transformation);
      } catch (error) {
        console.error(`Transformation failed: ${transformation.type}`, error);
        throw new Error(`Transformation '${transformation.type}' failed: ${error.message}`);
      }
    }

    return result;
  }

  // Apply single transformation
  async applyTransformation(data, transformation) {
    const { type, options = {} } = transformation;

    switch (type) {
      case 'filterColumns':
        return this.filterColumns(data, options);
      
      case 'filterRows':
        return this.filterRows(data, options);
      
      case 'sortRows':
        return this.sortRows(data, options);
      
      case 'cleanData':
        return this.cleanData(data, options);
      
      case 'normalizeText':
        return this.normalizeText(data, options);
      
      case 'extractNumbers':
        return this.extractNumbers(data, options);
      
      case 'extractDates':
        return this.extractDates(data, options);
      
      case 'extractUrls':
        return this.extractUrls(data, options);
      
      case 'splitColumns':
        return this.splitColumns(data, options);
      
      case 'mergeColumns':
        return this.mergeColumns(data, options);
      
      case 'addCalculatedColumn':
        return this.addCalculatedColumn(data, options);
      
      case 'pivotTable':
        return this.pivotTable(data, options);
      
      case 'aggregateData':
        return this.aggregateData(data, options);
      
      case 'deduplicateRows':
        return this.deduplicateRows(data, options);
      
      case 'fillMissingValues':
        return this.fillMissingValues(data, options);
      
      case 'detectDataTypes':
        return this.detectDataTypes(data, options);

      case 'customTransform':
        return this.customTransform(data, options);
      
      default:
        throw new Error(`Unknown transformation type: ${type}`);
    }
  }

  // Filter columns
  filterColumns(data, options) {
    const { include = [], exclude = [], indices = [] } = options;
    
    if (data.length === 0) return data;

    let columnIndices;
    
    if (indices.length > 0) {
      columnIndices = indices;
    } else if (include.length > 0) {
      columnIndices = include.map(name => {
        const index = data[0].findIndex(cell => 
          cell && cell.toString().toLowerCase().includes(name.toLowerCase())
        );
        return index !== -1 ? index : null;
      }).filter(index => index !== null);
    } else if (exclude.length > 0) {
      const excludeIndices = exclude.map(name => {
        return data[0].findIndex(cell => 
          cell && cell.toString().toLowerCase().includes(name.toLowerCase())
        );
      }).filter(index => index !== -1);
      
      columnIndices = data[0].map((_, index) => index)
        .filter(index => !excludeIndices.includes(index));
    } else {
      return data;
    }

    return data.map(row => 
      columnIndices.map(index => row[index] || '')
    );
  }

  // Filter rows
  filterRows(data, options) {
    const { 
      condition = 'contains',
      column = 0,
      value = '',
      caseSensitive = false,
      skipHeader = true 
    } = options;

    if (data.length === 0) return data;

    const result = [];
    const startIndex = skipHeader ? 1 : 0;
    
    // Keep header if skipping it
    if (skipHeader && data.length > 0) {
      result.push(data[0]);
    }

    for (let i = startIndex; i < data.length; i++) {
      const row = data[i];
      const cellValue = row[column] || '';
      const compareValue = caseSensitive ? cellValue : cellValue.toLowerCase();
      const searchValue = caseSensitive ? value : value.toLowerCase();

      let keep = false;

      switch (condition) {
        case 'contains':
          keep = compareValue.includes(searchValue);
          break;
        case 'equals':
          keep = compareValue === searchValue;
          break;
        case 'startsWith':
          keep = compareValue.startsWith(searchValue);
          break;
        case 'endsWith':
          keep = compareValue.endsWith(searchValue);
          break;
        case 'regex':
          try {
            const regex = new RegExp(value, caseSensitive ? 'g' : 'gi');
            keep = regex.test(cellValue);
          } catch (e) {
            keep = false;
          }
          break;
        case 'empty':
          keep = !cellValue || cellValue.trim() === '';
          break;
        case 'notEmpty':
          keep = cellValue && cellValue.trim() !== '';
          break;
        case 'number':
          keep = !isNaN(parseFloat(cellValue));
          break;
        case 'greaterThan':
          keep = parseFloat(cellValue) > parseFloat(searchValue);
          break;
        case 'lessThan':
          keep = parseFloat(cellValue) < parseFloat(searchValue);
          break;
      }

      if (keep) {
        result.push(row);
      }
    }

    return result;
  }

  // Sort rows
  sortRows(data, options) {
    const { column = 0, direction = 'asc', skipHeader = true, dataType = 'auto' } = options;
    
    if (data.length <= 1) return data;

    const result = [...data];
    const startIndex = skipHeader ? 1 : 0;
    const header = skipHeader ? result.shift() : null;

    const dataRows = result.slice(startIndex);
    
    dataRows.sort((a, b) => {
      const aVal = a[column] || '';
      const bVal = b[column] || '';

      let comparison = 0;

      switch (dataType) {
        case 'number':
          comparison = parseFloat(aVal) - parseFloat(bVal);
          break;
        case 'date':
          comparison = new Date(aVal) - new Date(bVal);
          break;
        case 'text':
        default:
          comparison = aVal.toString().localeCompare(bVal.toString());
      }

      return direction === 'desc' ? -comparison : comparison;
    });

    if (header) {
      dataRows.unshift(header);
    }

    return dataRows;
  }

  // Clean data
  cleanData(data, options) {
    const {
      trimWhitespace = true,
      removeEmptyRows = true,
      removeEmptyColumns = true,
      normalizeSpacing = true,
      removeDuplicateSpaces = true
    } = options;

    let result = data.map(row => [...row]);

    // Trim whitespace and normalize spacing
    if (trimWhitespace || normalizeSpacing || removeDuplicateSpaces) {
      result = result.map(row =>
        row.map(cell => {
          let cleaned = cell ? cell.toString() : '';
          
          if (trimWhitespace) {
            cleaned = cleaned.trim();
          }
          
          if (removeDuplicateSpaces) {
            cleaned = cleaned.replace(/\s+/g, ' ');
          }
          
          return cleaned;
        })
      );
    }

    // Remove empty rows
    if (removeEmptyRows) {
      result = result.filter(row =>
        row.some(cell => cell && cell.toString().trim() !== '')
      );
    }

    // Remove empty columns
    if (removeEmptyColumns && result.length > 0) {
      const nonEmptyColumns = [];
      
      for (let col = 0; col < result[0].length; col++) {
        const hasData = result.some(row =>
          row[col] && row[col].toString().trim() !== ''
        );
        
        if (hasData) {
          nonEmptyColumns.push(col);
        }
      }
      
      result = result.map(row =>
        nonEmptyColumns.map(col => row[col] || '')
      );
    }

    return result;
  }

  // Normalize text
  normalizeText(data, options) {
    const {
      toLowerCase = false,
      toUpperCase = false,
      toTitleCase = false,
      removeSpecialChars = false,
      replacePatterns = []
    } = options;

    return data.map(row =>
      row.map(cell => {
        let text = cell ? cell.toString() : '';

        if (toLowerCase) text = text.toLowerCase();
        if (toUpperCase) text = text.toUpperCase();
        if (toTitleCase) text = text.replace(/\w\S*/g, (txt) => 
          txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
        
        if (removeSpecialChars) {
          text = text.replace(/[^\w\s]/g, '');
        }

        // Apply custom replacements
        replacePatterns.forEach(({ pattern, replacement }) => {
          try {
            const regex = new RegExp(pattern, 'g');
            text = text.replace(regex, replacement);
          } catch (e) {
            console.warn('Invalid regex pattern:', pattern);
          }
        });

        return text;
      })
    );
  }

  // Extract numbers
  extractNumbers(data, options) {
    const { columns = 'all', keepOriginal = false, format = 'decimal' } = options;

    return data.map(row =>
      row.map((cell, index) => {
        if (columns !== 'all' && !columns.includes(index)) {
          return cell;
        }

        const text = cell ? cell.toString() : '';
        const numbers = text.match(/\d+\.?\d*/g);
        
        if (!numbers) return keepOriginal ? cell : '';

        let extracted;
        switch (format) {
          case 'integer':
            extracted = numbers.map(n => parseInt(n)).join(', ');
            break;
          case 'decimal':
            extracted = numbers.map(n => parseFloat(n)).join(', ');
            break;
          case 'first':
            extracted = parseFloat(numbers[0]);
            break;
          case 'sum':
            extracted = numbers.reduce((sum, n) => sum + parseFloat(n), 0);
            break;
          default:
            extracted = numbers.join(', ');
        }

        return keepOriginal ? `${cell} [${extracted}]` : extracted;
      })
    );
  }

  // Extract dates
  extractDates(data, options) {
    const { columns = 'all', format = 'iso', keepOriginal = false } = options;

    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{4}/g,
      /\d{4}-\d{2}-\d{2}/g,
      /\d{1,2}-\d{1,2}-\d{4}/g,
      /\b\w+ \d{1,2}, \d{4}\b/g
    ];

    return data.map(row =>
      row.map((cell, index) => {
        if (columns !== 'all' && !columns.includes(index)) {
          return cell;
        }

        const text = cell ? cell.toString() : '';
        let dates = [];

        datePatterns.forEach(pattern => {
          const matches = text.match(pattern);
          if (matches) {
            dates.push(...matches);
          }
        });

        if (dates.length === 0) return keepOriginal ? cell : '';

        const formatted = dates.map(dateStr => {
          const date = new Date(dateStr);
          if (isNaN(date)) return dateStr;

          switch (format) {
            case 'iso':
              return date.toISOString().split('T')[0];
            case 'us':
              return date.toLocaleDateString('en-US');
            case 'timestamp':
              return date.getTime();
            default:
              return dateStr;
          }
        });

        const result = formatted.join(', ');
        return keepOriginal ? `${cell} [${result}]` : result;
      })
    );
  }

  // Extract URLs
  extractUrls(data, options) {
    const { columns = 'all', keepOriginal = false, type = 'all' } = options;

    const urlPattern = /https?:\/\/[^\s]+/g;
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

    return data.map(row =>
      row.map((cell, index) => {
        if (columns !== 'all' && !columns.includes(index)) {
          return cell;
        }

        const text = cell ? cell.toString() : '';
        let extracted = [];

        if (type === 'all' || type === 'urls') {
          const urls = text.match(urlPattern) || [];
          extracted.push(...urls);
        }

        if (type === 'all' || type === 'emails') {
          const emails = text.match(emailPattern) || [];
          extracted.push(...emails);
        }

        const result = extracted.join(', ');
        return keepOriginal ? `${cell} [${result}]` : result;
      })
    );
  }

  // Split columns
  splitColumns(data, options) {
    const { column = 0, delimiter = ',', maxSplits = -1, keepOriginal = false } = options;

    return data.map(row => {
      const cell = row[column] || '';
      const parts = maxSplits > 0 
        ? cell.split(delimiter, maxSplits + 1)
        : cell.split(delimiter);

      const newRow = [...row];
      
      if (keepOriginal) {
        newRow.splice(column + 1, 0, ...parts);
      } else {
        newRow.splice(column, 1, ...parts);
      }

      return newRow;
    });
  }

  // Merge columns
  mergeColumns(data, options) {
    const { columns = [], separator = ' ', targetColumn = null } = options;

    return data.map(row => {
      const mergedValue = columns.map(col => row[col] || '').join(separator);
      const newRow = [...row];

      if (targetColumn !== null) {
        newRow[targetColumn] = mergedValue;
      } else {
        newRow.push(mergedValue);
      }

      return newRow;
    });
  }

  // Add calculated column
  addCalculatedColumn(data, options) {
    const { formula, columnName = 'Calculated' } = options;

    if (data.length === 0) return data;

    // Add column header
    const result = [...data];
    if (result.length > 0) {
      result[0] = [...result[0], columnName];
    }

    // Apply formula to each row
    for (let i = 1; i < result.length; i++) {
      const row = result[i];
      try {
        const calculated = this.evaluateFormula(formula, row, i);
        result[i] = [...row, calculated];
      } catch (error) {
        result[i] = [...row, 'ERROR'];
      }
    }

    return result;
  }

  // Simple formula evaluator
  evaluateFormula(formula, row, rowIndex) {
    // Replace cell references (A1, B2, etc.)
    let expression = formula.replace(/\$?([A-Z]+)\$?(\d+)/g, (match, col, rowNum) => {
      const colIndex = this.columnLetterToIndex(col);
      const targetRow = parseInt(rowNum) - 1;
      
      if (targetRow === rowIndex && row[colIndex] !== undefined) {
        const value = row[colIndex];
        return isNaN(value) ? `"${value}"` : value;
      }
      
      return '0';
    });

    // Replace column references (COL1, COL2, etc.)
    expression = expression.replace(/COL(\d+)/g, (match, colNum) => {
      const colIndex = parseInt(colNum) - 1;
      const value = row[colIndex] || '';
      return isNaN(value) ? `"${value}"` : value;
    });

    // Simple math evaluation (be careful with eval!)
    try {
      // Only allow basic math operations
      if (/^[\d\s+\-*/.()]+$/.test(expression)) {
        return Function(`"use strict"; return (${expression})`)();
      } else {
        return 'INVALID';
      }
    } catch (e) {
      return 'ERROR';
    }
  }

  // Deduplicate rows
  deduplicateRows(data, options) {
    const { keyColumns = 'all', keepFirst = true } = options;
    
    if (data.length === 0) return data;

    const seen = new Set();
    const result = [];

    for (const row of data) {
      const key = keyColumns === 'all' 
        ? row.join('|')
        : keyColumns.map(col => row[col] || '').join('|');

      if (!seen.has(key)) {
        seen.add(key);
        result.push(row);
      } else if (!keepFirst) {
        // Replace with latest if keepFirst is false
        const existingIndex = result.findIndex(r => {
          const existingKey = keyColumns === 'all' 
            ? r.join('|')
            : keyColumns.map(col => r[col] || '').join('|');
          return existingKey === key;
        });
        
        if (existingIndex !== -1) {
          result[existingIndex] = row;
        }
      }
    }

    return result;
  }

  // Fill missing values
  fillMissingValues(data, options) {
    const { method = 'forward', value = '', columns = 'all' } = options;

    return data.map((row, rowIndex) =>
      row.map((cell, colIndex) => {
        if (columns !== 'all' && !columns.includes(colIndex)) {
          return cell;
        }

        if (cell === null || cell === undefined || cell === '') {
          switch (method) {
            case 'constant':
              return value;
            case 'forward':
              // Use previous row's value
              for (let i = rowIndex - 1; i >= 0; i--) {
                if (data[i][colIndex] !== null && data[i][colIndex] !== undefined && data[i][colIndex] !== '') {
                  return data[i][colIndex];
                }
              }
              return value;
            case 'backward':
              // Use next row's value
              for (let i = rowIndex + 1; i < data.length; i++) {
                if (data[i][colIndex] !== null && data[i][colIndex] !== undefined && data[i][colIndex] !== '') {
                  return data[i][colIndex];
                }
              }
              return value;
            default:
              return value;
          }
        }
        
        return cell;
      })
    );
  }

  // Detect data types
  detectDataTypes(data, options) {
    const { addTypeRow = true, skipHeader = true } = options;

    if (data.length === 0) return data;

    const startIndex = skipHeader ? 1 : 0;
    const types = [];

    // Analyze each column
    for (let col = 0; col < data[0].length; col++) {
      const values = [];
      
      for (let row = startIndex; row < Math.min(data.length, startIndex + 100); row++) {
        const value = data[row][col];
        if (value !== null && value !== undefined && value !== '') {
          values.push(value.toString());
        }
      }

      types.push(this.detectColumnType(values));
    }

    if (addTypeRow) {
      const typeRow = types.map(type => `[${type}]`);
      const result = [...data];
      result.splice(skipHeader ? 1 : 0, 0, typeRow);
      return result;
    }

    return data;
  }

  detectColumnType(values) {
    if (values.length === 0) return 'unknown';

    let numberCount = 0;
    let dateCount = 0;
    let urlCount = 0;
    let emailCount = 0;

    values.forEach(value => {
      if (!isNaN(parseFloat(value)) && isFinite(value)) {
        numberCount++;
      }
      if (!isNaN(Date.parse(value))) {
        dateCount++;
      }
      if (/^https?:\/\//.test(value)) {
        urlCount++;
      }
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        emailCount++;
      }
    });

    const total = values.length;
    
    if (numberCount / total > 0.8) return 'number';
    if (dateCount / total > 0.8) return 'date';
    if (urlCount / total > 0.8) return 'url';
    if (emailCount / total > 0.8) return 'email';
    
    return 'text';
  }

  // Custom transformation with user function
  customTransform(data, options) {
    const { code, safeMode = true } = options;

    if (safeMode) {
      // Only allow basic operations
      const allowedPattern = /^[a-zA-Z0-9\s+\-*/.()[\],'"=<>!&|?:;{}]+$/;
      if (!allowedPattern.test(code)) {
        throw new Error('Custom transformation contains unsafe code');
      }
    }

    try {
      const transformFunction = Function('data', 'row', 'cell', 'index', code);
      
      return data.map((row, rowIndex) => 
        row.map((cell, cellIndex) => {
          try {
            return transformFunction(data, row, cell, { row: rowIndex, col: cellIndex });
          } catch (e) {
            return cell; // Return original on error
          }
        })
      );
    } catch (error) {
      throw new Error(`Custom transformation failed: ${error.message}`);
    }
  }

  // Helper methods
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  columnLetterToIndex(letter) {
    let result = 0;
    for (let i = 0; i < letter.length; i++) {
      result = result * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return result - 1;
  }

  // Get transformation presets
  getTransformationPresets() {
    return {
      'clean-basic': [
        { type: 'cleanData', options: { trimWhitespace: true, removeEmptyRows: true } }
      ],
      'extract-numbers': [
        { type: 'extractNumbers', options: { format: 'decimal', keepOriginal: false } }
      ],
      'extract-emails': [
        { type: 'extractUrls', options: { type: 'emails', keepOriginal: false } }
      ],
      'normalize-text': [
        { type: 'normalizeText', options: { toLowerCase: true, removeSpecialChars: false } }
      ],
      'remove-duplicates': [
        { type: 'deduplicateRows', options: { keepFirst: true } }
      ],
      'sort-first-column': [
        { type: 'sortRows', options: { column: 0, direction: 'asc', dataType: 'auto' } }
      ]
    };
  }

  // Apply preset transformation
  async applyPreset(data, presetName) {
    const preset = this.presets[presetName];
    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}`);
    }
    
    return this.transformData(data, preset);
  }

  // Get available presets
  getAvailablePresets() {
    return Object.keys(this.presets);
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.DataTransformer = DataTransformer;
}