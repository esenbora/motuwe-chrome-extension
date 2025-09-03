# Repository Guidelines

## Project Structure & Module Organization
- Electron app at repo root: `main.js`, `index.html`, `package.json`.
- Chrome extension in `motuwe-extension/`: `manifest.json`, `background.js`, `content.js`, `popup.{html,js}`, `css/`, `images/`, and focused modules under `motuwe-extension/js/` (e.g., `storage-manager.js`).
- Developer utilities in `scripts/`. Config/docs (e.g., `.gitignore`, `LICENSE`, `README.md`) at root.
- Add tests under `tests/`, mirroring source layout (e.g., `tests/motuwe-extension/js/storage-manager.test.js`).

## Build, Test, and Development Commands
- Install: `npm install` (Node 16+).
- Develop (Electron): `npm start` — launches the desktop app.
- Package (Electron): `npm run dist` (installers via electron-builder), `npm run pack` (unpacked dirs), `npm run build` (alias).
- Develop (Extension): Chrome → `chrome://extensions` → Enable Developer Mode → Load unpacked → select `motuwe-extension/`.
- Tests: once configured, `npm test` for unit tests; add Playwright/Spectron scripts for E2E.

## Coding Style & Naming Conventions
- Indentation: 2 spaces (JavaScript).
- Naming: files/folders `kebab-case`; classes `PascalCase`; functions/variables `camelCase`.
- Structure: Electron code stays at root; extension logic in `motuwe-extension/js/` as small, single-purpose modules.
- Formatting/Linting: prefer ESLint + Prettier if adding; match existing style. Example file: `motuwe-extension/js/page-scraper.js`.

## Testing Guidelines
- Frameworks: Jest for pure JS utilities; Playwright or Spectron for Electron E2E.
- Conventions: name tests `*.test.js`; mirror source tree under `tests/`.
- Coverage: target ≥80% on changed lines. Mock browser/Electron APIs where feasible.
- Run: `npm test` (add Jest config and script when introducing tests).

## Commit & Pull Request Guidelines
- Commits: use Conventional Commits. Examples:
  - `feat(extension): add iframe scraping`
  - `fix(app): handle CSV escaping`
- PRs: include a clear summary, linked issues (e.g., `Closes #123`), and screenshots/GIFs for UI changes (Electron window, extension popup/options). Note any permission changes in `manifest.json` and migration steps.

## Security & Configuration Tips
- Never commit secrets or API keys.
- Request minimal extension permissions; sanitize and validate scraped content.
- Avoid logging sensitive data; follow least-privilege for Electron and extension APIs.
