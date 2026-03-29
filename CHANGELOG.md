# Changelog

All notable changes in this project are documented in this file.
This project follows the conventions of Keep a Changelog and Semantic Versioning.

## [0.3.0] - 2026-03-29

### Added
- **`customSmartMatchers`**: New optional setting for user-defined matchers that extract blocks using regex named capture groups (requires a `magic` group). Supports prefix/suffix mapping via `matchOn` and optional removal via `remove`.

### Changed
- **`mat-card-title` via `getLabel()`**: The card template now renders the `mat-card-title` using the `getLabel()` helper function, enabling smart-matched labels for card titles.
- **`smartLabelMatcher.labelPrefix`**: Now supports a string or an array of strings.
- **`smartLabelMatcher.controlPrefix`**: Now also supports a single string in addition to an array (consistent with `labelPrefix`).

### Fixed
- **Auto-save skipped for untitled buffers**: The save after transformation is now also skipped for untitled (unsaved) documents, not just for files without an extension.
- **`resolveControlName` with multiple label prefixes**: Control name resolution now correctly iterates over all configured label prefixes when `labelPrefix` is an array.

## [0.2.3] - 2026-03-25

### Added
- **Auto-transform on external file change**: HTML files that are externally recreated (e.g. by a build tool) are now automatically re-transformed when the transform tag is present. Uses an `onDidChange` watcher; idempotency is guaranteed by the transform tag.

## [0.2.2] - 2026-03-23

### Fixed
- **Tab label undefined check**: The `[label]` binding in the `smartTabMatcher` path now uses `(mg.getItemListValues(...) || []).length ? ... : ''` to prevent console errors and the Angular NG8107 warning about optional chaining on non-nullable types.

## [0.2.1] - 2026-03-23

### Fixed
- **Auto-save skipped for extensionless files**: Transforms are still applied, but files without an extension are no longer automatically saved afterwards.
- **Regex greedy opening tags**: Replaced `[\s\S]*?>` with `\b[^>]*>` for all opening tag patterns in `default.rules.js`. This prevents rules from accidentally matching across element boundaries or matching similarly named tags (e.g. `<mat-card-content>` being matched by the `mat-card` pattern). Affected rules: Button, Image, Tab, Subforms, Card, Labels, Checkbox, Select, Selectionlist, Radio.

## [0.2.0] - 2026-03-15

### Added
- **Refactor to templates**: Aligned with Magic development flow, reducing regex exposure for users.
- **New Configuration Structure**:
  - Settings moved to `.vswizly/wizly.config.js`.
  - Templates moved to `.vswizly/templates/`.
  - Advanced rules moved to `.vswizly/wizly.rules.js`.
- **New Commands**:
  - `Wizly: Export Settings`: Generates the project configuration file (`.vswizly/wizly.config.js`).
  - `Wizly: Export Templates`: Copies the default templates to `.vswizly/templates/`.
  - `Wizly: Export Advanced Rules`: Exports the underlying regex rules for power users.
- **Documentation**: Comprehensive docs for all templates and helper functions.
- **Smart Label Matcher**: Automatically label files based on their content using regex patterns
  - Support for `magic` attribute with `mgc.` prefix (e.g. `magic="mgc.lbl_foo"`)
- **Smart Tab Matcher**: New `smartTabMatcher` setting that extracts content from `div.tab_content` blocks and places it inside the correct `<mat-tab>` elements. Required for Angular Material tab animations to work correctly.
- **`useBalancedTag` rule option**: Rules can now set `useBalancedTag: true` to use a stack-based parser instead of regex for finding the closing tag. This correctly handles nested elements of the same type (e.g. `<mat-card>` inside `<mat-card>`). The `Card` rule now uses this option.
- **Status bar**: Shows the active rule count and config source. Click to open the configuration file directly.
- **`mgError` partial**: All `mgError` components are now wrapped in `<mat-error>` for correct Material Design validation styling. Introduced a reusable `mg-error` EJS partial.
- **Zoom button icon**: New `zoomIcon` setting to configure the icon used in zoom buttons.

### Changed
- **Visibility via CSS class**: Templates now use `[class.d-none]="... === 'hidden'"` instead of `[style.visibility]="..."`. Add `.d-none { display: none !important; }` to your project CSS (or use Bootstrap).
- **`replaceAfterBeautify` removed**: The `replaceAfterBeautify` rule property has been removed. Transformation tag insertion now always runs before Prettier formatting.
- **Input templates consolidated**: Input type templates have been unified for simpler maintenance.
- **`magicFuncParam` introduced**: Templates now use a unified `magicFuncParam` variable that combines the `magic` attribute and optional `rowId` into a single function parameter (e.g. `mg.getValue(magic, rowId)`).

### Fixed
- **Untitled Files**: Wizly now works on unsaved/untitled files by detecting the language ID.
- **Regex Reliability**: Improved regex for nested structures and matching end-of-file.
- Config export issue: New configuration now takes effect immediately after exporting `.vswizly.js` without requiring VS Code restart
- Repeated transformation bug: Fixed issue where files with existing Wizly comments would be transformed again due to date/time placeholder matching any text
- **No-op transformation**: Transformation is now skipped entirely when the output is identical to the input, preventing unnecessary cursor resets and completion messages.
- **`sanitizeRules` crash**: Fixed a crash when a rule had an undefined `replacement` value.

### Breaking Changes
- **Configuration Location**: `.vswizly.js` in the root is deprecated. Please use the new `.vswizly/` folder structure. A warning will be shown if the old file is detected.

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
