# Motuwe Browser Extension

A powerful browser extension for scraping HTML tables from web pages with support for dynamic content, infinite scroll, and advanced export options.

## Features

### Core Functionality
- **Smart Table Detection**: Automatically finds and analyzes all tables on any webpage
- **Dynamic Content Support**: Waits for JavaScript-loaded tables and handles async content
- **Visual Table Selector**: Click-to-select interface for precise table targeting
- **Multiple Export Formats**: CSV, JSON, and Excel (XLSX) with proper encoding
- **Real-time Preview**: See table data before exporting

### Advanced Scraping
- **Infinite Scroll Handling**: Automatically loads all data from paginated tables
- **Hidden Table Support**: Option to include tables not currently visible
- **Colspan/Rowspan Processing**: Proper handling of complex table structures
- **Mutation Observer**: Auto-detects when new tables are added to pages
- **Performance Controls**: Configurable limits and delays for large datasets

### User Experience
- **Dark/Light Themes**: Matches system preferences or manual selection
- **Responsive Design**: Works on all screen sizes
- **Progress Indicators**: Real-time feedback during scraping operations
- **Error Handling**: Graceful handling of failed operations with clear messages
- **Settings Persistence**: All preferences saved across browser sessions

## Installation

### From Source
1. Clone or download the `motuwe-extension` folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `motuwe-extension` folder
5. The extension will appear in your browser toolbar

### From Chrome Web Store
*Coming soon - extension will be published after testing phase*

## Usage

### Basic Scraping
1. Navigate to any webpage with tables
2. Click the Motuwe extension icon in your browser toolbar
3. Click "Scan Tables" to detect all tables on the page
4. Select a table from the preview list
5. Choose your export format and click "Export Selected"

### Visual Selection
1. Click "Visual Select" in the popup
2. Move your mouse over tables on the page (they will highlight)
3. Click on the table you want to scrape
4. The table will be automatically selected in the popup

### Dynamic Content
For pages with JavaScript-loaded tables:
1. Enable "Wait for dynamic content" in options
2. Adjust timeout if needed (default: 5 seconds)
3. The extension will automatically wait for content to load

### Advanced Options
Access the options page by:
- Right-clicking the extension icon → "Options"
- Or clicking the gear icon in the popup

## Configuration

### Scraping Settings
- **Wait for Dynamic Content**: Handles JavaScript-loaded tables
- **Wait Timeout**: Maximum time to wait for dynamic content
- **Include Hidden Tables**: Process tables not currently visible
- **Auto-detect Changes**: Monitor page for new tables

### Export Settings
- **Default Format**: Choose between CSV, JSON, or Excel
- **CSV Encoding**: UTF-8 with BOM (recommended for Excel)
- **Auto-load All Data**: Automatically handle pagination

### Performance Settings
- **Max Table Size**: Limit processing for very large tables
- **Processing Delay**: Reduce CPU usage with delays between operations

## Technical Details

### Architecture
- **Manifest V3**: Uses latest Chrome extension standards
- **Service Worker**: Background processing and export handling
- **Content Scripts**: Page interaction and table analysis
- **Options Page**: Full configuration interface

### Browser Support
- **Chrome**: 88+ (Manifest V3 support)
- **Edge**: 88+ (Chromium-based)
- **Firefox**: Planned for future release
- **Safari**: Planned for future release

### Permissions
- **activeTab**: Access current tab content for table scanning
- **storage**: Save user preferences and settings
- **downloads**: Export files to user's download folder
- **scripting**: Inject content scripts for table interaction

## Development

### Project Structure
```
motuwe-extension/
├── manifest.json          # Extension configuration
├── popup.html             # Main interface
├── options.html           # Settings page
├── js/
│   ├── background.js      # Service worker
│   ├── content.js         # Content script
│   ├── popup.js           # Popup controller
│   └── options.js         # Options controller
├── css/
│   ├── content.css        # Content script styles
│   └── inject.css         # Injectable styles
└── images/                # Extension icons
```

### Building from Source
No build process required - the extension runs directly from source files.

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on various websites
5. Submit a pull request

## Troubleshooting

### Tables Not Detected
- Enable "Wait for dynamic content" for JavaScript-loaded tables
- Increase timeout if tables load slowly
- Check if tables are hidden or in iframes

### Export Issues
- Ensure popup blockers allow downloads
- Check browser download settings
- Try different export formats if one fails

### Performance Problems
- Reduce max table size in settings
- Increase processing delay for large tables
- Disable auto-detect changes on heavy sites

## Privacy & Security

- **No Data Collection**: Extension processes data locally only
- **No Network Requests**: All processing happens in your browser
- **No Tracking**: No analytics or user behavior monitoring
- **Open Source**: Full source code available for inspection

## License

MIT License - See LICENSE file for details

## Support

- **Issues**: Report bugs via GitHub issues
- **Feature Requests**: Submit enhancement ideas
- **Documentation**: Check wiki for detailed guides
- **Community**: Join discussions in GitHub Discussions

---

Built with ❤️ for data analysts, researchers, and web scraping enthusiasts.