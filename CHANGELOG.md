# Changelog

All notable changes in this project are documented in this file.
This project follows the conventions of Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added
- **In-app release notes on update**: Wizly can now show a short popup summary after an extension update when `release-notes/<version>.md` exists, with a button that opens `CHANGELOG.md` for the full list of changes.
- **`Wizly: Convert Angular Project to SCSS`**: New command to convert an Angular workspace from CSS to SCSS (adds `sass`, updates `angular.json`, updates component `styleUrl(s)` references, scaffolds `src/scss/` with a 7-1 structure, switches global styles to `src/scss/main.scss`, and moves any existing `src/styles.css` / `src/styles.scss` content into `src/scss/main.scss` (then removes `src/styles.*`)). Includes Magic `magic-styles.css` prompt/handling: asks “Should magic-styles.css be kept?” and either deletes it (and cleans up missing references in `angular.json`) or converts it into `src/scss/vendors/_magic-styles.scss` and wires it into `src/scss/main.scss`.
- **`Wizly: Sync Shared Modules (Angular)`**: New command to keep Angular module imports in sync for Magic-generated projects. Ensures SharedModule / SharedMaterialModule exist, updates `magic.gen.lib.module.ts` files to include them, and removes moved sharedMaterial imports to avoid duplicates.
- **`Wizly: Convert Angular Project to PWA`**: New command to enable PWA support for an Angular project by running `ng add @angular/pwa` (adds service worker + manifest scaffolding and updates Angular configuration). Optionally scaffolds a small update helper (`src/app/pwa-update.service.ts`) and wires it into `AppComponent` to periodically check for updates and prompt for reload.
- **`Wizly: Generate PWA Icons & Favicon (from Active Image)`**: New command to generate PWA icons from the active PNG. Reads icon sizes/paths from your PWA manifest (`public/manifest.webmanifest` or `src/manifest.webmanifest`) and writes the matching PNG files plus `src/favicon.ico` (16/32/48). Refuses to run when the active image is too small.
- **`Wizly: Generate Angular Material Theme (SCSS)`**: New command to generate a custom Angular Material theme under `src/scss/themes/` from a theme name and hex colors. It generates a palette from each base color and updates `angular.json` to build the theme as a separate CSS bundle (`inject: false`). Requires SCSS/Sass support in the Angular workspace (i.e. `sass` installed).
- **`Wizly: Generate Theme Bundle (Blank SCSS)`**: New command to generate a blank theme bundle under `src/scss/themes/` and add it to `angular.json` as a separate CSS bundle (`inject: false`). Requires SCSS/Sass support in the Angular workspace (i.e. `sass` installed).
- **`Wizly: Import Magic Color File (SCSS)`**: New command to import a Magic color file into `src/scss/vars/_magic-colors.scss` and `src/scss/base/_magic-color-utilities.scss`. The generated classes keep Magic's row numbering (for example `magic-color-7`), map Magic or Windows system colors to CSS-friendly values, and skip `background-color` when the imported row is marked as transparent.
- **`Wizly: Check Angular Setup`**: New command to inspect a chosen Angular workspace/project and open a markdown report covering the main Wizly-related setup signals, including SCSS, theme bundles, Material utility classes, runtime settings, PWA markers, and shared module presence.
- **`Wizly: Upgrade Assistant`**: New command that scans the current project after a Wizly update, opens a short markdown report, and offers the most relevant follow-up actions directly, such as `Patch Settings`, `Patch Templates`, `Patch Rules`, and `Check Angular Setup`.
- **`Wizly: Setup Runtime Settings (Angular)`**: New command to scaffold a runtime-loaded `settings.json` (served from `/settings/settings.json`) and wire an Angular initializer that fetches it with cache busting and applies the active theme at app startup. Also scaffolds optional theme/mode UI components (Material-based when available, otherwise plain HTML) under `src/app/wizly/` (or `src/app/core/wizly/` if `core/` exists).
- **`Wizly: Sync Runtime Themes (Angular)`**: New command to scan `angular.json` for theme bundles (`inject: false` + `bundleName`) and merge them into `settings.json -> themes[]`.
- **Patch commands**: Added `Wizly: Patch Templates`, `Wizly: Patch Rules`, and `Wizly: Patch Settings` to compare your exported project files against the current built-in defaults and selectively adopt updates via VS Code’s diff view.
- **Note on exported config**: If you have exported rules/templates/settings into your project, new functionality may require running the relevant patch command(s) (especially `Wizly: Patch Rules`) to pick up updated defaults.

### Changed
- **PWA conversion budgets**: `Wizly: Convert Angular Project to PWA` now relaxes Angular CLI's default `initial` production budget from `500kb/1mb` to `3mb/5mb` when those untouched defaults would otherwise block Magic-sized production builds during the first PWA test run.
- **Theme color utilities**: `Wizly: Generate Theme Color Utilities (SCSS)` now also generates `mat-border-*` and `mat-fill-*` helpers next to the existing `mat-bg-*` and `mat-text-*` classes.
- **Post-command feedback**: Key Angular setup commands now show clearer success messages with created files and the most logical next step.
- **Runtime theme grouping**: Runtime settings and theme sync now recognize `-light` / `-dark` bundle pairs as one logical theme family, can store an optional `mode` per theme entry, and generate selector/toggle helpers that work with grouped theme variants more naturally.
- **Material Icons prompt**: `Wizly: Setup Runtime Settings (Angular)` now checks whether Angular Material is present and can offer to add the Material Icons stylesheet to `index.html` when the generated mode toggle uses `<mat-icon>`.
- **Central Material label mode**: `Wizly: Setup Runtime Settings (Angular)` now scaffolds a central `wizly-material-form-field.defaults.ts` file and registers it through `MAT_FORM_FIELD_DEFAULT_OPTIONS`, so Material label behavior and appearance can be controlled in one place.
- **Central Material field width**: Wizly now uses a central `mat-form-field { width: 100%; }` base rule for SCSS projects and `Wizly: Setup Runtime Settings (Angular)` can add that rule to an existing `_base.scss` when Angular Material is present.

## [0.3.1] - 2026-04-12

### Fixed
- **Tab index/content shifting with hidden tabs**: Updated the default `tab.ejs` (smartTabMatcher path) to support `WizlyActiveTabIndexes`, keeping tab headers and injected tab content aligned even when some tabs are omitted by Magic’s Display List filtering.

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
