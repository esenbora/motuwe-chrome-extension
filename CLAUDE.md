# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Motuwe is an Electron desktop application for scraping HTML tables from web pages. It uses Cheerio for HTML parsing and provides a dark-themed UI for previewing and exporting table data.

## Commands

```bash
# Install dependencies
npm install

# Run the application in development
npm start

# Build for current platform
npm run build

# Build distributable packages
npm run dist

# Build for all platforms
npm run dist
```

## Architecture

### Main Process (main.js)
- Electron main process handling window creation and IPC communication
- Core scraping logic using axios and cheerio
- Three main IPC handlers:
  - `detect-tables`: Fetches page and identifies all tables with previews (main.js:76-124)
  - `scrape-table`: Extracts complete data from a specific table (main.js:126-145)
  - `export-data`: Handles CSV/JSON export with proper formatting (main.js:147-179)

### Renderer Process (index.html)
- Single-page UI with inline JavaScript
- Manages table detection, selection, and export workflow
- Real-time logging system for user feedback

### Key Technical Details
- Table processing handles colspan attributes and empty cells (main.js:41-74)
- CSV export includes UTF-8 BOM for Excel compatibility (main.js:173)
- User-Agent headers configured to avoid scraping blocks (main.js:79-83)
- Dark theme with responsive grid layout for table previews