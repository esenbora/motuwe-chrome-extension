# Repository Guidelines

## Project Structure & Module Organization
- Source lives in `src/`, grouped by feature. Shared helpers go in `src/lib` (or `src/common`) to avoid circular deps.
- Tests live in `tests/` mirroring `src/` (e.g., `src/auth/` → `tests/auth/`).
- Static assets: `assets/` or `public/`. Developer utilities: `scripts/`.
- Configuration stays at the repo root (e.g., `.editorconfig`, linters, `.env.example`).

## Build, Test, and Development Commands
- Install: use the project toolchain. Examples: `npm ci`, `pnpm i`, or `pip install -r requirements.txt`.
- Develop: run the local entrypoint. Examples: `npm run dev` or `python -m app`.
- Build: produce a production artifact. Examples: `npm run build` or `make build`.
- Test: run the full suite. Examples: `npm test`, `pytest -q`, or `pytest --cov` for coverage.
Tip: prefer commands defined in `package.json`, `Makefile`, or `pyproject.toml` if present.

## Coding Style & Naming Conventions
- Indentation: follow `.editorconfig`; otherwise 2 spaces for JS/TS, 4 spaces for Python.
- Naming: files/folders kebab-case (JS/TS) or snake_case (Python); classes in PascalCase; functions/vars in camelCase (JS/TS) or snake_case (Python).
- Formatting/Linting: use configured tools, e.g., `npm run lint`, `npm run format`, `ruff check .`, `black .`.

## Testing Guidelines
- Frameworks: Jest/Vitest for JS/TS; Pytest for Python.
- Structure: mirror `src/`; name tests `*.test.ts`/`*.spec.ts` or `test_*.py`.
- Coverage: target ≥ 80% on changed lines. Run locally with `npm test -- --coverage` or `pytest --cov`.

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits (e.g., `feat(auth): add token refresh on 401`).
- PRs: include a clear description, link issues (e.g., `Closes #123`), and screenshots for UI changes. Keep PRs small and focused; add migration/rollback notes when relevant.

## Security & Configuration Tips
- Never commit secrets. Use `.env` (git-ignored) and keep `.env.example` sanitized and current.
- Validate inputs at boundaries (HTTP, CLI, DB); log without leaking sensitive data.

