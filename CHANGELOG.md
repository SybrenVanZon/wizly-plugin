# Changelog

All notable changes in this project are documented in this file.
This project follows the conventions of Keep a Changelog and Semantic Versioning.

## [0.2.0] - 2026-02-28

### Added
- **Refactor to templates**: Aligned with Magic development flow, reducing regex exposure for users.
- **New Configuration Structure**:
  - Settings moved to `.vswizly/wizly.config.js`.
  - Templates moved to `.vswizly/templates/`.
  - Advanced rules moved to `.vswizly/wizly.rules.js`.
- **New Commands**:
  - `Wizly: Export Settings & Templates`: Generates the standard configuration structure.
  - `Wizly: Export Advanced Rules`: Exports the underlying regex rules for power users.
- **New Templates**:
  - `Page`, `Subforms`, `Labels`, `Flex Row`, `Visibility`.
- **Documentation**: Comprehensive docs for all new templates and helper functions.
- **Smart Label Matcher**: Automatically label files based on their content using regex patterns
  - Support for `magic` attribute with `mgc.` prefix (e.g. `magic="mgc.lbl_foo"`)
  - Support for Angular-style `[magic]` binding syntax
  - Robust regex-based extraction of control names from `mgc.` strings

### Fixed
- **Untitled Files**: Wizly now works on unsaved/untitled files by detecting the language ID.
- **Regex Reliability**: Improved regex for nested structures and matching end-of-file.
- Config export issue: New configuration now takes effect immediately after exporting `.vswizly.js` without requiring VS Code restart
- Repeated transformation bug: Fixed issue where files with existing Wizly comments would be transformed again due to date/time placeholder matching any text

### Breaking Changes
- **Configuration Location**: `.vswizly.js` in the root is deprecated. Please use the new `.vswizly/` folder structure. A warning will be shown if the old file is detected.

### Added
- **Smart Label Matcher**: New feature to automatically convert labels to Material Design labels within form fields
  - Configurable via `.vswizly.js` with `enabled`, `labelPrefix`, `controlPrefix`, and `wrapper` settings
  - Finds labels with magic attributes matching `labelPrefix` and corresponding controls with `controlPrefix`
  - Automatically removes labels and inserts wrapped content inside `<mat-form-field>` elements
  - Executed before Prettier to ensure proper positioning

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