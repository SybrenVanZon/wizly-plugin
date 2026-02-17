# Changelog

All notable changes in this project are documented in this file.
This project follows the conventions of Keep a Changelog and Semantic Versioning.

## [0.1.1] - 2026-02-17

### Fixed
- Extension activation hang resolved by packaging Prettier correctly and passing a `filepath` to Prettier 3.

### Changed
- Prefer workspace‑installed `prettier` when available; fall back to bundled Prettier otherwise.
- Respect workspace Prettier configuration via `resolveConfig` and merge with safe defaults.
- Removed explicit `onCommand` activation events in favor of VS Code’s auto‑generated command activation (keeps `workspaceContains:.vswizly.js`).
- Updated README with a “Prettier Integration” section clarifying behavior and configuration precedence.

---
Keep releases concise: for each new version include only relevant Added/Changed/Removed/Fixes.

All notable changes to the "wizly" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0] - 2026-02-15

Initial release.

### Added
- Export command generates `.vswizly.js` intended for version control so teams share the same rules.
- Project configuration via `.vswizly.js` takes precedence over VS Code settings.
- Optional `autoTransformOnCreate`: automatically transform new `.html` files.
- Optional `autoTransformToast`: info notification after auto‑transform, configurable via project config.
- File watcher for new HTML files.