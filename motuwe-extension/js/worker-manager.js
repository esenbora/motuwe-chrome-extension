// Web Worker manager for heavy processing tasks
class WorkerManager {
  constructor() {
    this.workers = new Map();
    this.workerPool = new Map();
    this.taskQueue = new Map();
    this.results = new Map();
    this.maxWorkers = navigator.hardwareConcurrency || 4;
    this.workerScripts = new Map();
    
    this.setupWorkerScripts();
  }

  // Setup worker scripts as data URLs
  setupWorkerScripts() {
    // Data processing worker
    this.workerScripts.set('data-processor', this.createDataProcessorScript());
    
    // Table analyzer worker
    this.workerScripts.set('table-analyzer', this.createTableAnalyzerScript());
    
    // Export generator worker
    this.workerScripts.set('export-generator', this.createExportGeneratorScript());
    
    // Selector evaluator worker
    this.workerScripts.set('selector-evaluator', this.createSelectorEvaluatorScript());
    
    // Data transformer worker
    this.workerScripts.set('data-transformer', this.createDataTransformerScript());
  }

  // Create data processing worker script
  createDataProcessorScript() {
    const script = `
      // Data processing worker
      class DataProcessor {
        constructor() {
          this.operations = {
            'clean': this.cleanData.bind(this),
            'filter': this.filterData.bind(this),
            'sort': this.sortData.bind(this),
            'deduplicate': this.deduplicateData.bind(this),
            'aggregate': this.aggregateData.bind(this),
            'parse': this.parseData.bind(this)
          };
        }

        async processData(data, operations) {
          let result = data;
          
          for (const operation of operations) {
            const handler = this.operations[operation.type];
            if (handler) {
              result = await handler(result, operation.options || {});
            }
          }
          
          return result;
        }

        cleanData(data, options) {
          const { removeEmpty = true, trimSpaces = true } = options;
          
          return data.map(row => {
            if (!Array.isArray(row)) return row;
            
            return row.map(cell => {
              if (cell === null || cell === undefined) return '';
              
              let cleaned = cell.toString();
              if (trimSpaces) cleaned = cleaned.trim();
              if (removeEmpty && cleaned === '') return null;
              
              return cleaned;
            }).filter(cell => !removeEmpty || cell !== null);
          }).filter(row => !removeEmpty || row.length > 0);
        }

        filterData(data, options) {
          const { column, condition, value, caseSensitive = false } = options;
          
          return data.filter((row, index) => {
            if (index === 0 && options.skipHeader) return true;
            
            const cellValue = row[column] || '';
            const compareValue = caseSensitive ? cellValue : cellValue.toLowerCase();
            const searchValue = caseSensitive ? value : value.toLowerCase();
            
            switch (condition) {
              case 'contains': return compareValue.includes(searchValue);
              case 'equals': return compareValue === searchValue;
              case 'startsWith': return compareValue.startsWith(searchValue);
              case 'endsWith': return compareValue.endsWith(searchValue);
              case 'greater': return parseFloat(cellValue) > parseFloat(searchValue);
              case 'less': return parseFloat(cellValue) < parseFloat(searchValue);
              case 'empty': return cellValue === '';
              case 'notEmpty': return cellValue !== '';
              default: return true;
            }
          });
        }

        sortData(data, options) {
          const { column, direction = 'asc', type = 'text', skipHeader = true } = options;
          
          const header = skipHeader && data.length > 0 ? data[0] : null;
          const dataRows = skipHeader ? data.slice(1) : data;
          
          dataRows.sort((a, b) => {
            const aVal = a[column] || '';
            const bVal = b[column] || '';
            
            let comparison = 0;
            
            if (type === 'number') {
              comparison = parseFloat(aVal) - parseFloat(bVal);
            } else if (type === 'date') {
              comparison = new Date(aVal) - new Date(bVal);
            } else {
              comparison = aVal.toString().localeCompare(bVal.toString());
            }
            
            return direction === 'desc' ? -comparison : comparison;
          });
          
          return header ? [header, ...dataRows] : dataRows;
        }

        deduplicateData(data, options) {
          const { keyColumns = 'all', keepFirst = true } = options;
          const seen = new Set();
          const result = [];
          
          for (const row of data) {
            const key = keyColumns === 'all' 
              ? JSON.stringify(row)
              : keyColumns.map(col => row[col] || '').join('|');
            
            if (!seen.has(key)) {
              seen.add(key);
              result.push(row);
            } else if (!keepFirst) {
              const existingIndex = result.findIndex(r => {
                const existingKey = keyColumns === 'all' 
                  ? JSON.stringify(r)
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

        aggregateData(data, options) {
          const { groupBy, aggregations, skipHeader = true } = options;
          
          const header = skipHeader && data.length > 0 ? data[0] : null;
          const dataRows = skipHeader ? data.slice(1) : data;
          
          const groups = new Map();
          
          // Group data
          dataRows.forEach(row => {
            const key = Array.isArray(groupBy) 
              ? groupBy.map(col => row[col] || '').join('|')
              : row[groupBy] || '';
            
            if (!groups.has(key)) {
              groups.set(key, []);
            }
            groups.get(key).push(row);
          });
          
          // Apply aggregations
          const result = [];
          groups.forEach((rows, key) => {
            const aggregatedRow = [];
            
            // Add grouping columns
            const keyParts = Array.isArray(groupBy) 
              ? key.split('|')
              : [key];
            aggregatedRow.push(...keyParts);
            
            // Apply aggregations
            aggregations.forEach(agg => {
              const values = rows.map(row => parseFloat(row[agg.column]) || 0);
              
              let result = 0;
              switch (agg.function) {
                case 'sum': result = values.reduce((a, b) => a + b, 0); break;
                case 'avg': result = values.reduce((a, b) => a + b, 0) / values.length; break;
                case 'count': result = rows.length; break;
                case 'min': result = Math.min(...values); break;
                case 'max': result = Math.max(...values); break;
                default: result = values[0];
              }
              
              aggregatedRow.push(result);
            });
            
            result.push(aggregatedRow);
          });
          
          return result;
        }

        parseData(data, options) {
          const { parsers = {} } = options;
          
          return data.map(row => {
            return row.map((cell, index) => {
              const parser = parsers[index];
              if (!parser) return cell;
              
              switch (parser.type) {
                case 'number':
                  const num = parseFloat(cell);
                  return isNaN(num) ? cell : num;
                case 'date':
                  const date = new Date(cell);
                  return isNaN(date.getTime()) ? cell : date.toISOString();
                case 'boolean':
                  return ['true', '1', 'yes', 'on'].includes(cell.toLowerCase());
                case 'json':
                  try { return JSON.parse(cell); } catch { return cell; }
                default:
                  return cell;
              }
            });
          });
        }
      }

      const processor = new DataProcessor();
      
      self.onmessage = async function(e) {
        const { taskId, data, operations } = e.data;
        
        try {
          const result = await processor.processData(data, operations);
          self.postMessage({
            taskId,
            success: true,
            result
          });
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `;

    return this.createWorkerURL(script);
  }

  // Create table analyzer worker script
  createTableAnalyzerScript() {
    const script = `
      class TableAnalyzer {
        analyzeTable(data) {
          if (!Array.isArray(data) || data.length === 0) {
            return { rows: 0, cols: 0, empty: true };
          }

          const analysis = {
            rows: data.length,
            cols: data[0] ? data[0].length : 0,
            empty: false,
            columns: [],
            statistics: {}
          };

          // Analyze each column
          for (let col = 0; col < analysis.cols; col++) {
            const columnData = data.map(row => row[col] || '');
            const columnAnalysis = this.analyzeColumn(columnData);
            analysis.columns.push(columnAnalysis);
          }

          // Overall statistics
          analysis.statistics = {
            totalCells: analysis.rows * analysis.cols,
            emptyCells: analysis.columns.reduce((sum, col) => sum + col.emptyCells, 0),
            dataTypes: this.getDataTypeDistribution(analysis.columns),
            patterns: this.findCommonPatterns(data)
          };

          return analysis;
        }

        analyzeColumn(columnData) {
          const analysis = {
            values: columnData.length,
            unique: new Set(columnData).size,
            emptyCells: columnData.filter(val => !val || val.toString().trim() === '').length,
            dataTypes: {},
            patterns: new Map(),
            statistics: {}
          };

          // Data type analysis
          const types = { string: 0, number: 0, date: 0, boolean: 0, url: 0, email: 0 };
          
          columnData.forEach(value => {
            if (!value || value.toString().trim() === '') return;
            
            const str = value.toString().trim();
            
            // Number detection
            if (!isNaN(parseFloat(str)) && isFinite(str)) {
              types.number++;
            }
            // Date detection
            else if (!isNaN(Date.parse(str))) {
              types.date++;
            }
            // Boolean detection
            else if (['true', 'false', '1', '0', 'yes', 'no'].includes(str.toLowerCase())) {
              types.boolean++;
            }
            // URL detection
            else if (str.match(/^https?:\/\//)) {
              types.url++;
            }
            // Email detection
            else if (str.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)) {
              types.email++;
            }
            // String (default)
            else {
              types.string++;
            }

            // Pattern analysis
            const pattern = this.getValuePattern(str);
            analysis.patterns.set(pattern, (analysis.patterns.get(pattern) || 0) + 1);
          });

          analysis.dataTypes = types;
          
          // Determine primary data type
          const maxType = Object.keys(types).reduce((a, b) => types[a] > types[b] ? a : b);
          analysis.primaryType = maxType;

          // Statistical analysis for numeric columns
          if (types.number > columnData.length * 0.5) {
            const numbers = columnData
              .filter(val => !isNaN(parseFloat(val)) && isFinite(val))
              .map(val => parseFloat(val));
            
            if (numbers.length > 0) {
              analysis.statistics = {
                min: Math.min(...numbers),
                max: Math.max(...numbers),
                avg: numbers.reduce((a, b) => a + b, 0) / numbers.length,
                sum: numbers.reduce((a, b) => a + b, 0)
              };
            }
          }

          return analysis;
        }

        getValuePattern(value) {
          return value
            .replace(/\\d/g, 'N')
            .replace(/[a-zA-Z]/g, 'A')
            .replace(/[^NA\\s]/g, 'S')
            .replace(/\\s+/g, ' ')
            .trim();
        }

        getDataTypeDistribution(columns) {
          const distribution = {};
          
          columns.forEach(col => {
            Object.keys(col.dataTypes).forEach(type => {
              distribution[type] = (distribution[type] || 0) + col.dataTypes[type];
            });
          });

          return distribution;
        }

        findCommonPatterns(data) {
          const patterns = new Map();
          
          data.forEach(row => {
            const rowPattern = row.map(cell => {
              if (!cell) return 'E'; // Empty
              const str = cell.toString().trim();
              if (str.length === 0) return 'E';
              if (!isNaN(parseFloat(str))) return 'N'; // Number
              if (str.match(/^\\d{4}-\\d{2}-\\d{2}/)) return 'D'; // Date
              if (str.length < 10) return 'S'; // Short text
              return 'L'; // Long text
            }).join('');
            
            patterns.set(rowPattern, (patterns.get(rowPattern) || 0) + 1);
          });

          // Return top patterns
          return Array.from(patterns.entries())
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([pattern, count]) => ({ pattern, count }));
        }
      }

      const analyzer = new TableAnalyzer();
      
      self.onmessage = function(e) {
        const { taskId, data } = e.data;
        
        try {
          const result = analyzer.analyzeTable(data);
          self.postMessage({
            taskId,
            success: true,
            result
          });
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `;

    return this.createWorkerURL(script);
  }

  // Create export generator worker script
  createExportGeneratorScript() {
    const script = `
      class ExportGenerator {
        generateCSV(data, options = {}) {
          const { delimiter = ',', quote = '"', lineEnding = '\\r\\n', includeBOM = true } = options;
          
          const csvRows = data.map(row => {
            return row.map(cell => {
              const cellStr = (cell || '').toString();
              const escaped = cellStr.replace(new RegExp(quote, 'g'), quote + quote);
              
              if (escaped.includes(delimiter) || escaped.includes(quote) || escaped.includes('\\n') || escaped.includes('\\r')) {
                return quote + escaped + quote;
              }
              
              return escaped;
            }).join(delimiter);
          });
          
          const csvContent = csvRows.join(lineEnding);
          return includeBOM ? '\\ufeff' + csvContent : csvContent;
        }

        generateJSON(data, options = {}) {
          const { format = 'array', headers = null } = options;
          
          if (format === 'objects' && headers) {
            return JSON.stringify(data.slice(1).map(row => {
              const obj = {};
              headers.forEach((header, index) => {
                obj[header] = row[index] || '';
              });
              return obj;
            }), null, 2);
          }
          
          return JSON.stringify(data, null, 2);
        }

        generateXML(data, options = {}) {
          const { rootElement = 'table', rowElement = 'row', headers = null } = options;
          
          let xml = '<?xml version="1.0" encoding="UTF-8"?>\\n';
          xml += \`<\${rootElement}>\\n\`;
          
          data.forEach((row, index) => {
            if (index === 0 && headers) return; // Skip header row if using headers
            
            xml += \`  <\${rowElement}>\\n\`;
            
            row.forEach((cell, cellIndex) => {
              const elementName = headers && headers[cellIndex] 
                ? headers[cellIndex].replace(/[^a-zA-Z0-9]/g, '_')
                : \`column_\${cellIndex}\`;
              const cellValue = this.escapeXML(cell || '');
              xml += \`    <\${elementName}>\${cellValue}</\${elementName}>\\n\`;
            });
            
            xml += \`  </\${rowElement}>\\n\`;
          });
          
          xml += \`</\${rootElement}>\`;
          return xml;
        }

        escapeXML(text) {
          return text.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        }

        generateHTML(data, options = {}) {
          const { title = 'Data Export', includeCSS = true, tableClass = 'data-table' } = options;
          
          let html = \`<!DOCTYPE html>
<html>
<head>
    <title>\${title}</title>
    <meta charset="UTF-8">
\`;
          
          if (includeCSS) {
            html += \`    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
    </style>
\`;
          }
          
          html += \`</head>
<body>
    <h1>\${title}</h1>
    <table class="\${tableClass}">
\`;
          
          data.forEach((row, index) => {
            const tag = index === 0 ? 'th' : 'td';
            html += '        <tr>';
            row.forEach(cell => {
              html += \`<\${tag}>\${this.escapeHTML(cell || '')}</\${tag}>\`;
            });
            html += '</tr>\\n';
          });
          
          html += \`    </table>
</body>
</html>\`;
          
          return html;
        }

        escapeHTML(text) {
          return text.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }
      }

      const generator = new ExportGenerator();
      
      self.onmessage = function(e) {
        const { taskId, data, format, options } = e.data;
        
        try {
          let result;
          
          switch (format) {
            case 'csv': result = generator.generateCSV(data, options); break;
            case 'json': result = generator.generateJSON(data, options); break;
            case 'xml': result = generator.generateXML(data, options); break;
            case 'html': result = generator.generateHTML(data, options); break;
            default: throw new Error(\`Unsupported format: \${format}\`);
          }
          
          self.postMessage({
            taskId,
            success: true,
            result
          });
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `;

    return this.createWorkerURL(script);
  }

  // Create selector evaluator worker script
  createSelectorEvaluatorScript() {
    const script = `
      class SelectorEvaluator {
        evaluateSelectors(htmlContent, selectors) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, 'text/html');
          const results = {};
          
          selectors.forEach(selector => {
            try {
              const elements = doc.querySelectorAll(selector.expression);
              results[selector.name] = {
                success: true,
                count: elements.length,
                elements: Array.from(elements).slice(0, 10).map(el => ({
                  tagName: el.tagName,
                  textContent: el.textContent.substring(0, 100),
                  attributes: this.getElementAttributes(el)
                }))
              };
            } catch (error) {
              results[selector.name] = {
                success: false,
                error: error.message
              };
            }
          });
          
          return results;
        }

        getElementAttributes(element) {
          const attrs = {};
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attrs[attr.name] = attr.value;
          }
          return attrs;
        }

        findOptimalSelectors(htmlContent, targetElements) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, 'text/html');
          const suggestions = [];
          
          targetElements.forEach(target => {
            const element = doc.querySelector(target.selector);
            if (element) {
              const selectors = this.generateSelectorsForElement(element, doc);
              suggestions.push({
                target: target.name,
                selectors: selectors
              });
            }
          });
          
          return suggestions;
        }

        generateSelectorsForElement(element, doc) {
          const selectors = [];
          
          // ID selector
          if (element.id) {
            selectors.push({
              type: 'id',
              selector: \`#\${element.id}\`,
              specificity: 100
            });
          }
          
          // Class selector
          if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              selectors.push({
                type: 'class',
                selector: \`.\${classes.join('.')}\`,
                specificity: classes.length * 10
              });
            }
          }
          
          // Attribute selectors
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            if (attr.name !== 'id' && attr.name !== 'class') {
              selectors.push({
                type: 'attribute',
                selector: \`[\${attr.name}="\${attr.value}"]\`,
                specificity: 10
              });
            }
          }
          
          // Path selector
          const path = this.getElementPath(element);
          selectors.push({
            type: 'path',
            selector: path,
            specificity: 1
          });
          
          return selectors.sort((a, b) => b.specificity - a.specificity);
        }

        getElementPath(element) {
          const path = [];
          let current = element;
          
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let selector = current.tagName.toLowerCase();
            
            if (current.id) {
              selector += \`#\${current.id}\`;
              path.unshift(selector);
              break;
            } else {
              const siblings = Array.from(current.parentNode?.children || [])
                .filter(sibling => sibling.tagName === current.tagName);
              
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += \`:nth-child(\${index})\`;
              }
              
              path.unshift(selector);
            }
            
            current = current.parentElement;
          }
          
          return path.join(' > ');
        }
      }

      const evaluator = new SelectorEvaluator();
      
      self.onmessage = function(e) {
        const { taskId, action, data } = e.data;
        
        try {
          let result;
          
          switch (action) {
            case 'evaluate':
              result = evaluator.evaluateSelectors(data.htmlContent, data.selectors);
              break;
            case 'optimize':
              result = evaluator.findOptimalSelectors(data.htmlContent, data.targetElements);
              break;
            default:
              throw new Error(\`Unknown action: \${action}\`);
          }
          
          self.postMessage({
            taskId,
            success: true,
            result
          });
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `;

    return this.createWorkerURL(script);
  }

  // Create data transformer worker script
  createDataTransformerScript() {
    const script = `
      class DataTransformerWorker {
        constructor() {
          this.transformations = {
            'split': this.splitColumns.bind(this),
            'merge': this.mergeColumns.bind(this),
            'extract': this.extractData.bind(this),
            'normalize': this.normalizeData.bind(this),
            'validate': this.validateData.bind(this)
          };
        }

        async transform(data, transformationPipeline) {
          let result = data;
          
          for (const transformation of transformationPipeline) {
            const handler = this.transformations[transformation.type];
            if (handler) {
              result = await handler(result, transformation.options);
            }
          }
          
          return result;
        }

        splitColumns(data, options) {
          const { column, delimiter = ',', maxSplits = -1 } = options;
          
          return data.map(row => {
            if (!row[column]) return row;
            
            const parts = maxSplits > 0 
              ? row[column].split(delimiter, maxSplits + 1)
              : row[column].split(delimiter);
            
            const newRow = [...row];
            newRow.splice(column, 1, ...parts);
            
            return newRow;
          });
        }

        mergeColumns(data, options) {
          const { columns, separator = ' ', targetColumn } = options;
          
          return data.map(row => {
            const mergedValue = columns.map(col => row[col] || '').join(separator);
            
            if (targetColumn !== undefined) {
              const newRow = [...row];
              newRow[targetColumn] = mergedValue;
              return newRow;
            } else {
              return [...row, mergedValue];
            }
          });
        }

        extractData(data, options) {
          const { pattern, column, extractType = 'regex' } = options;
          
          return data.map(row => {
            if (!row[column]) return row;
            
            let extracted = '';
            const cellValue = row[column].toString();
            
            switch (extractType) {
              case 'regex':
                const match = cellValue.match(new RegExp(pattern));
                extracted = match ? match[0] : '';
                break;
              case 'numbers':
                const numbers = cellValue.match(/\\d+\\.?\\d*/g);
                extracted = numbers ? numbers.join(', ') : '';
                break;
              case 'urls':
                const urls = cellValue.match(/https?:\\/\\/[^\\s]+/g);
                extracted = urls ? urls.join(', ') : '';
                break;
              case 'emails':
                const emails = cellValue.match(/[^\\s@]+@[^\\s@]+\\.[^\\s@]+/g);
                extracted = emails ? emails.join(', ') : '';
                break;
            }
            
            const newRow = [...row];
            newRow[column] = extracted;
            return newRow;
          });
        }

        normalizeData(data, options) {
          const { column, normalizationType } = options;
          
          return data.map(row => {
            if (!row[column]) return row;
            
            let normalized = row[column].toString();
            
            switch (normalizationType) {
              case 'uppercase':
                normalized = normalized.toUpperCase();
                break;
              case 'lowercase':
                normalized = normalized.toLowerCase();
                break;
              case 'title':
                normalized = normalized.replace(/\\w\\S*/g, (txt) => 
                  txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
                break;
              case 'trim':
                normalized = normalized.trim();
                break;
              case 'removeSpaces':
                normalized = normalized.replace(/\\s+/g, ' ');
                break;
            }
            
            const newRow = [...row];
            newRow[column] = normalized;
            return newRow;
          });
        }

        validateData(data, options) {
          const { rules } = options;
          const validationResults = [];
          
          data.forEach((row, rowIndex) => {
            const rowErrors = [];
            
            rules.forEach(rule => {
              const { column, type, required, pattern, min, max } = rule;
              const value = row[column];
              
              // Required check
              if (required && (!value || value.toString().trim() === '')) {
                rowErrors.push(\`Column \${column} is required\`);
                return;
              }
              
              if (!value) return; // Skip validation if not required and empty
              
              // Type validation
              switch (type) {
                case 'number':
                  if (isNaN(parseFloat(value))) {
                    rowErrors.push(\`Column \${column} must be a number\`);
                  }
                  break;
                case 'email':
                  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {
                    rowErrors.push(\`Column \${column} must be a valid email\`);
                  }
                  break;
                case 'url':
                  try { new URL(value); } catch {
                    rowErrors.push(\`Column \${column} must be a valid URL\`);
                  }
                  break;
              }
              
              // Pattern validation
              if (pattern && !new RegExp(pattern).test(value)) {
                rowErrors.push(\`Column \${column} does not match required pattern\`);
              }
              
              // Min/max validation
              if (type === 'number') {
                const numValue = parseFloat(value);
                if (min !== undefined && numValue < min) {
                  rowErrors.push(\`Column \${column} must be at least \${min}\`);
                }
                if (max !== undefined && numValue > max) {
                  rowErrors.push(\`Column \${column} must be at most \${max}\`);
                }
              } else if (typeof value === 'string') {
                if (min !== undefined && value.length < min) {
                  rowErrors.push(\`Column \${column} must be at least \${min} characters\`);
                }
                if (max !== undefined && value.length > max) {
                  rowErrors.push(\`Column \${column} must be at most \${max} characters\`);
                }
              }
            });
            
            validationResults.push({
              row: rowIndex,
              valid: rowErrors.length === 0,
              errors: rowErrors
            });
          });
          
          return {
            data,
            validation: validationResults,
            summary: {
              total: data.length,
              valid: validationResults.filter(r => r.valid).length,
              invalid: validationResults.filter(r => !r.valid).length
            }
          };
        }
      }

      const transformer = new DataTransformerWorker();
      
      self.onmessage = async function(e) {
        const { taskId, data, transformations } = e.data;
        
        try {
          const result = await transformer.transform(data, transformations);
          self.postMessage({
            taskId,
            success: true,
            result
          });
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `;

    return this.createWorkerURL(script);
  }

  // Create worker URL from script
  createWorkerURL(script) {
    const blob = new Blob([script], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  // Create worker instance
  async createWorker(type, pooled = true) {
    if (!this.workerScripts.has(type)) {
      throw new Error(`Unknown worker type: ${type}`);
    }

    const scriptURL = this.workerScripts.get(type);
    
    if (pooled) {
      // Get from pool or create new
      if (!this.workerPool.has(type)) {
        this.workerPool.set(type, []);
      }
      
      const pool = this.workerPool.get(type);
      
      if (pool.length > 0) {
        return pool.pop();
      }
      
      if (this.getTotalWorkers() >= this.maxWorkers) {
        throw new Error('Maximum number of workers reached');
      }
    }

    const worker = new Worker(scriptURL);
    const workerId = this.generateWorkerId();
    
    const workerInstance = {
      id: workerId,
      type,
      worker,
      busy: false,
      created: Date.now(),
      tasksCompleted: 0
    };

    this.workers.set(workerId, workerInstance);
    
    return workerInstance;
  }

  // Execute task in worker
  async executeTask(type, taskData, options = {}) {
    const { timeout = 30000, pooled = true } = options;
    
    const workerInstance = await this.createWorker(type, pooled);
    const taskId = this.generateTaskId();
    
    workerInstance.busy = true;
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.returnWorker(workerInstance);
        reject(new Error(`Task timeout after ${timeout}ms`));
      }, timeout);

      const handleMessage = (event) => {
        const { taskId: responseTaskId, success, result, error } = event.data;
        
        if (responseTaskId === taskId) {
          clearTimeout(timeoutId);
          workerInstance.worker.removeEventListener('message', handleMessage);
          workerInstance.tasksCompleted++;
          
          this.returnWorker(workerInstance);
          
          if (success) {
            resolve(result);
          } else {
            reject(new Error(error));
          }
        }
      };

      workerInstance.worker.addEventListener('message', handleMessage);
      workerInstance.worker.postMessage({ taskId, ...taskData });
    });
  }

  // Return worker to pool or terminate
  returnWorker(workerInstance) {
    workerInstance.busy = false;
    
    const pool = this.workerPool.get(workerInstance.type);
    if (pool && pool.length < Math.ceil(this.maxWorkers / 2)) {
      pool.push(workerInstance);
    } else {
      this.terminateWorker(workerInstance.id);
    }
  }

  // Terminate worker
  terminateWorker(workerId) {
    const workerInstance = this.workers.get(workerId);
    if (workerInstance) {
      workerInstance.worker.terminate();
      this.workers.delete(workerId);
    }
  }

  // High-level processing methods
  async processData(data, operations, options = {}) {
    return await this.executeTask('data-processor', { data, operations }, options);
  }

  async analyzeTable(data, options = {}) {
    return await this.executeTask('table-analyzer', { data }, options);
  }

  async generateExport(data, format, exportOptions = {}, workerOptions = {}) {
    return await this.executeTask('export-generator', { data, format, options: exportOptions }, workerOptions);
  }

  async evaluateSelectors(htmlContent, selectors, options = {}) {
    return await this.executeTask('selector-evaluator', { 
      action: 'evaluate', 
      data: { htmlContent, selectors } 
    }, options);
  }

  async transformData(data, transformations, options = {}) {
    return await this.executeTask('data-transformer', { data, transformations }, options);
  }

  // Batch processing
  async processBatch(items, processor, batchSize = 100, options = {}) {
    const results = [];
    const batches = [];
    
    // Split into batches
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    // Process batches
    const promises = batches.map(async (batch, index) => {
      try {
        const result = await processor(batch, index);
        return { index, result, success: true };
      } catch (error) {
        return { index, error: error.message, success: false };
      }
    });

    const batchResults = await Promise.all(promises);
    
    // Combine results in order
    batchResults.sort((a, b) => a.index - b.index);
    
    return batchResults.map(batch => batch.result || batch.error);
  }

  // Parallel processing
  async processParallel(tasks, maxConcurrency = null) {
    const concurrency = maxConcurrency || this.maxWorkers;
    const results = [];
    const executing = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const promise = this.executeTask(task.type, task.data, task.options)
        .then(result => ({ index: i, result, success: true }))
        .catch(error => ({ index: i, error: error.message, success: false }));

      results.push(promise);
      
      if (results.length >= concurrency) {
        executing.push(Promise.race(results));
        await Promise.race(results);
      }
    }

    const allResults = await Promise.all(results);
    allResults.sort((a, b) => a.index - b.index);
    
    return allResults;
  }

  // Worker statistics and management
  getWorkerStats() {
    const stats = {
      total: this.workers.size,
      busy: Array.from(this.workers.values()).filter(w => w.busy).length,
      pools: {}
    };

    this.workerPool.forEach((pool, type) => {
      stats.pools[type] = pool.length;
    });

    return stats;
  }

  getTotalWorkers() {
    return this.workers.size;
  }

  // Cleanup methods
  terminateAllWorkers() {
    this.workers.forEach((workerInstance) => {
      workerInstance.worker.terminate();
    });
    
    this.workers.clear();
    this.workerPool.clear();
    
    // Revoke object URLs
    this.workerScripts.forEach((url) => {
      URL.revokeObjectURL(url);
    });
  }

  terminateIdleWorkers(maxIdleTime = 60000) {
    const now = Date.now();
    const toTerminate = [];
    
    this.workers.forEach((workerInstance, workerId) => {
      if (!workerInstance.busy && (now - workerInstance.created) > maxIdleTime) {
        toTerminate.push(workerId);
      }
    });
    
    toTerminate.forEach(workerId => this.terminateWorker(workerId));
  }

  // Utility methods
  generateWorkerId() {
    return 'worker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  generateTaskId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.WorkerManager = WorkerManager;
}