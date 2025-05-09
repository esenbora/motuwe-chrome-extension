const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#1e1e1e'
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

function cleanCell(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function processTable($, table) {
    const rows = [];
    const $rows = $(table).find('tr');
    
    // Önce tüm sütun sayısını bul
    let maxColumns = 0;
    $rows.each((i, row) => {
        const colCount = $(row).find('td, th').length;
        maxColumns = Math.max(maxColumns, colCount);
    });

    // Her satırı işle
    $rows.each((i, row) => {
        const rowData = new Array(maxColumns).fill(''); // Boş hücreleri doldur
        $(row).find('td, th').each((j, cell) => {
            const $cell = $(cell);
            
            // colspan ve rowspan kontrolü
            const colspan = parseInt($cell.attr('colspan')) || 1;
            const content = cleanCell($cell.text());
            
            // Boş hücre kontrolü
            if (content.trim() !== '') {
                // colspan varsa birden fazla hücreye yaz
                for (let k = 0; k < colspan; k++) {
                    rowData[j + k] = content;
                }
            }
        });
        rows.push(rowData);
    });

    return rows;
}

ipcMain.handle('detect-tables', async (event, url) => {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        const $ = cheerio.load(response.data);
        const tables = [];
        
        $('table').each((index, element) => {
            // Tablo başlığını bul
            let title = '';
            const prevElement = $(element).prev();
            if (prevElement.is('h1, h2, h3, h4, h5, h6')) {
                title = prevElement.text().trim();
            } else if ($(element).find('caption').length > 0) {
                title = $(element).find('caption').first().text().trim();
            } else {
                // Sayfadaki diğer başlıkları kontrol et
                let $header = $(element).prevAll('h1, h2, h3, h4, h5, h6').first();
                if ($header.length > 0) {
                    title = $header.text().trim();
                }
            }
            
            const data = processTable($, element);
            
            if (data.length > 0 && data[0].length > 0) {
                // İlk 5 satırı al (başlık + 4 veri satırı)
                const previewData = data.slice(0, Math.min(5, data.length));
                tables.push({
                    index,
                    title: title || `Tablo ${index + 1}`,
                    data: previewData,
                    totalRows: data.length
                });
            }
        });
        
        return tables;
    } catch (error) {
        console.error('Error fetching tables:', error);
        throw error;
    }
});

ipcMain.handle('scrape-table', async (event, url, tableIndex) => {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        const $ = cheerio.load(response.data);
        const tables = $('table');
        const selectedTable = tables.eq(tableIndex);
        
        return processTable($, selectedTable);
    } catch (error) {
        console.error('Error scraping table:', error);
        throw error;
    }
});

ipcMain.handle('export-data', async (event, data, format) => {
    const options = {
        title: 'Save File',
        defaultPath: `table_data.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }]
    };

    const { filePath } = await dialog.showSaveDialog(options);
    
    if (filePath) {
        if (format === 'json') {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        } else if (format === 'csv') {
            // CSV için özel formatlama
            const csvContent = data.map(row => {
                return row.map(cell => {
                    // Hücrede virgül, çift tırnak veya yeni satır varsa özel işle
                    const escaped = cell.replace(/"/g, '""');
                    if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
                        return `"${escaped}"`;
                    }
                    return escaped;
                }).join(',');
            }).join('\r\n');
            
            // UTF-8 BOM ekle (Excel uyumluluğu için)
            const BOM = '\ufeff';
            await fs.writeFile(filePath, BOM + csvContent, 'utf8');
        }
        return true;
    }
    return false;
});

function displayTablePreviews(tables) {
    const container = document.getElementById('tablePreviewsContainer');
    container.innerHTML = '';
    
    tables.forEach((table, index) => {
        const previewDiv = document.createElement('div');
        previewDiv.className = 'table-preview';
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'table-title';
        titleDiv.textContent = table.title;
        previewDiv.appendChild(titleDiv);
        
        // İlk 5 satırı al (başlık + 4 veri satırı)
        const previewData = table.data.slice(0, Math.min(5, table.data.length));
        if (table.data.length > 5) {
            // Eğer daha fazla satır varsa, bunu belirt
            const remainingRows = table.data.length - 5;
            const infoDiv = document.createElement('div');
            infoDiv.className = 'table-info';
            infoDiv.textContent = `ve ${remainingRows} satır daha...`;
            previewDiv.appendChild(createTableElement(previewData));
            previewDiv.appendChild(infoDiv);
        } else {
            previewDiv.appendChild(createTableElement(previewData));
        }
        
        const selectButton = document.createElement('button');
        selectButton.textContent = 'Bu Tabloyu Seç';
        selectButton.onclick = () => selectTable(index);
        previewDiv.appendChild(selectButton);
        
        container.appendChild(previewDiv);
    });
}
