// Excel export functionality using SheetJS (xlsx.js)
class ExcelExporter {
  constructor() {
    this.sheetJS = null;
    this.loaded = false;
    this.loadPromise = this.loadSheetJS();
  }

  async loadSheetJS() {
    if (this.loaded) return;

    try {
      // Load SheetJS from CDN
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
      
      await new Promise((resolve, reject) => {
        script.onload = () => {
          this.sheetJS = window.XLSX;
          this.loaded = true;
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });

    } catch (error) {
      console.error('Failed to load SheetJS:', error);
      throw new Error('Excel export library failed to load');
    }
  }

  async exportToExcel(data, options = {}) {
    await this.loadPromise;
    
    if (!this.loaded || !this.sheetJS) {
      throw new Error('Excel export library not available');
    }

    const {
      filename = 'table_data.xlsx',
      sheetName = 'Sheet1',
      includeHeaders = true,
      autoWidth = true,
      formatting = {}
    } = options;

    try {
      // Create a new workbook
      const workbook = this.sheetJS.utils.book_new();

      // Convert data to worksheet
      const worksheet = this.createWorksheet(data, {
        includeHeaders,
        autoWidth,
        formatting
      });

      // Add worksheet to workbook
      this.sheetJS.utils.book_append_sheet(workbook, worksheet, sheetName);

      // Generate Excel file
      const excelBuffer = this.sheetJS.write(workbook, {
        bookType: 'xlsx',
        type: 'array'
      });

      // Create and download file
      await this.downloadExcelFile(excelBuffer, filename);
      
      return true;
    } catch (error) {
      console.error('Excel export failed:', error);
      throw new Error(`Excel export failed: ${error.message}`);
    }
  }

  createWorksheet(data, options) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No data to export');
    }

    const { includeHeaders, autoWidth, formatting } = options;
    
    // Create worksheet from array of arrays
    const worksheet = this.sheetJS.utils.aoa_to_sheet(data);

    // Apply formatting
    this.applyFormatting(worksheet, data, formatting);

    // Auto-size columns
    if (autoWidth) {
      this.autoSizeColumns(worksheet, data);
    }

    // Apply header formatting
    if (includeHeaders && data.length > 0) {
      this.formatHeaders(worksheet, data[0].length);
    }

    return worksheet;
  }

  applyFormatting(worksheet, data, formatting) {
    const {
      headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4CAF50" } },
        alignment: { horizontal: "center", vertical: "center" }
      },
      cellStyle = {
        alignment: { vertical: "top", wrapText: true }
      },
      borderStyle = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    } = formatting;

    const range = this.sheetJS.utils.decode_range(worksheet['!ref']);

    // Apply styles to all cells
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = this.sheetJS.utils.encode_cell({ r: row, c: col });
        
        if (!worksheet[cellAddress]) continue;

        // Apply border to all cells
        worksheet[cellAddress].s = {
          ...worksheet[cellAddress].s,
          border: borderStyle
        };

        // Apply header style to first row
        if (row === 0) {
          worksheet[cellAddress].s = {
            ...worksheet[cellAddress].s,
            ...headerStyle
          };
        } else {
          // Apply cell style to data rows
          worksheet[cellAddress].s = {
            ...worksheet[cellAddress].s,
            ...cellStyle
          };
        }

        // Auto-detect and format data types
        this.formatCellByType(worksheet[cellAddress]);
      }
    }
  }

  formatCellByType(cell) {
    if (!cell || !cell.v) return;

    const value = cell.v.toString();

    // Date detection
    if (this.isDate(value)) {
      cell.t = 'd';
      cell.z = 'mm/dd/yyyy';
    }
    // Number detection
    else if (this.isNumber(value)) {
      cell.t = 'n';
      cell.v = parseFloat(value);
      
      // Currency detection
      if (value.includes('$') || value.includes('€') || value.includes('£')) {
        cell.z = '"$"#,##0.00';
      }
      // Percentage detection
      else if (value.includes('%')) {
        cell.z = '0.00%';
        cell.v = cell.v / 100;
      }
      // Large numbers
      else if (Math.abs(cell.v) >= 1000) {
        cell.z = '#,##0.00';
      }
    }
    // URL detection
    else if (this.isURL(value)) {
      cell.l = { Target: value, Tooltip: value };
    }
  }

  isDate(value) {
    // Simple date patterns
    const datePatterns = [
      /^\d{1,2}\/\d{1,2}\/\d{4}$/,
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{1,2}-\d{1,2}-\d{4}$/
    ];
    
    return datePatterns.some(pattern => pattern.test(value)) && 
           !isNaN(Date.parse(value));
  }

  isNumber(value) {
    // Remove common non-numeric characters
    const cleaned = value.replace(/[$€£,%\s]/g, '');
    return !isNaN(cleaned) && !isNaN(parseFloat(cleaned));
  }

  isURL(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return value.startsWith('http://') || value.startsWith('https://');
    }
  }

  autoSizeColumns(worksheet, data) {
    const columnWidths = [];

    // Calculate max width for each column
    data.forEach(row => {
      row.forEach((cell, colIndex) => {
        const cellValue = cell ? cell.toString() : '';
        const width = Math.min(Math.max(cellValue.length, 10), 50); // Min 10, Max 50
        columnWidths[colIndex] = Math.max(columnWidths[colIndex] || 0, width);
      });
    });

    // Apply column widths
    worksheet['!cols'] = columnWidths.map(width => ({ width }));
  }

  formatHeaders(worksheet, columnCount) {
    // Freeze first row
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };

    // Add filter to headers
    const range = this.sheetJS.utils.decode_range(worksheet['!ref']);
    worksheet['!autofilter'] = {
      ref: `A1:${this.sheetJS.utils.encode_col(columnCount - 1)}1`
    };
  }

  async downloadExcelFile(buffer, filename) {
    // Create blob and download
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = URL.createObjectURL(blob);
    
    // Use Chrome downloads API if available (extension context)
    if (typeof chrome !== 'undefined' && chrome.downloads) {
      await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });
    } else {
      // Fallback to direct download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Multi-sheet export
  async exportMultipleSheets(sheets, filename = 'multi_sheet_export.xlsx') {
    await this.loadPromise;
    
    if (!this.loaded || !this.sheetJS) {
      throw new Error('Excel export library not available');
    }

    try {
      const workbook = this.sheetJS.utils.book_new();

      sheets.forEach(({ name, data, options = {} }) => {
        const worksheet = this.createWorksheet(data, options);
        this.sheetJS.utils.book_append_sheet(workbook, worksheet, name);
      });

      const excelBuffer = this.sheetJS.write(workbook, {
        bookType: 'xlsx',
        type: 'array'
      });

      await this.downloadExcelFile(excelBuffer, filename);
      return true;
    } catch (error) {
      console.error('Multi-sheet Excel export failed:', error);
      throw new Error(`Multi-sheet export failed: ${error.message}`);
    }
  }

  // Export with charts (basic implementation)
  async exportWithChart(data, chartOptions, filename = 'chart_export.xlsx') {
    // This would require additional libraries for chart generation
    // For now, just export the data with a note about chart functionality
    const chartNote = [
      ['Chart Data Export'],
      ['Note: Chart visualization requires Excel to generate charts from this data'],
      [''],
      ...data
    ];

    return this.exportToExcel(chartNote, { filename });
  }

  // Template-based export
  async exportWithTemplate(data, templateConfig, filename = 'template_export.xlsx') {
    const {
      title = 'Data Export',
      subtitle = '',
      headers = [],
      footers = [],
      styling = {}
    } = templateConfig;

    // Build structured data with template
    const exportData = [];
    
    // Add title
    if (title) {
      exportData.push([title]);
      exportData.push([]); // Empty row
    }

    // Add subtitle
    if (subtitle) {
      exportData.push([subtitle]);
      exportData.push([]); // Empty row
    }

    // Add custom headers
    headers.forEach(header => {
      exportData.push(Array.isArray(header) ? header : [header]);
    });

    if (headers.length > 0) {
      exportData.push([]); // Empty row
    }

    // Add main data
    exportData.push(...data);

    // Add footers
    if (footers.length > 0) {
      exportData.push([]); // Empty row
      footers.forEach(footer => {
        exportData.push(Array.isArray(footer) ? footer : [footer]);
      });
    }

    return this.exportToExcel(exportData, {
      filename,
      formatting: styling
    });
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.ExcelExporter = ExcelExporter;
}