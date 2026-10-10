# AGENTS.md

This file provides guidance to AI coding agents — Claude Code, Codex, Copilot, Gemini CLI and others — when working with code in this repository. It is the one source: `CLAUDE.md` imports it, so every agent reads the same rules.

## What This Is

Wizly is a VS Code extension that post-processes Magic xpa Web Client-generated HTML files. It applies configurable regex rules with EJS template rendering to fix structural issues, switch UI frameworks, and automate repetitive transformations.

## Commands

```bash
npm run compile        # Type check + lint + build (development, with source maps)
npm run watch          # Continuous development build (esbuild + tsc in parallel)
npm run package        # Production build (minified, no source maps)
npm run vsix           # Create .vsix package for distribution
npm run check-types    # TypeScript type checking only
node dist/cli.js help  # The CLI, after a compile (see wiki/CLI.md)
npm run lint           # ESLint only
npm run pretest        # Compile TypeScript (required before running tests)
npm test               # Run tests via vscode-test (requires display on Linux: xvfb-run -a npm test)
```

## Architecture

### Core Files

- **[src/extension.ts](src/extension.ts)** — VS Code entry point. Registers commands (`Transform Current File`, `Transform Uncommitted Files`, export commands), file watchers for auto-transform on create, status bar, and progress UI.
- **[src/transformer.ts](src/transformer.ts)** — Core engine. Applies regex rules sequentially, renders EJS templates, runs smart matchers (label, tab, custom), calls Prettier.
- **[src/config.ts](src/config.ts)** — Loads and caches project config from `.wizly/wizly.config.js` (or `.vswizly/` in a project from before 0.7.0, or legacy `.vswizly.js`; the folder is chosen in [src/project-config.ts](src/project-config.ts)), or falls back to `default.rules.js`. Manages modes.
- **[src/utils.ts](src/utils.ts)** — File matching, template path resolution, control name extraction, balanced tag extraction, comment style detection.
- **[src/cli.ts](src/cli.ts)** — The command line. Every command is one entry in `COMMANDS`; help, `commands --json` and anything generated for agents come from that entry, so add or change a command there and nowhere else. Never prompt: a choice is a flag. [src/cli-host.ts](src/cli-host.ts) resolves `wizly.*` settings from files in the editor's order.
- **[src/file-selection.ts](src/file-selection.ts)** — Which files a run transforms: the uncommitted ones per git, files under a folder, and only those an active rule's `filePattern` matches. `Transform All Uncommitted Files` and `wizly transform` both use it, so they cannot pick different files.
- **[src/host.ts](src/host.ts)** — The `Host` interface: workspace root, `wizly.*` settings, user messages. `transformer.ts`, `config.ts` and `utils.ts` reach the outside world only through it, so they do not import `vscode`; keep it that way. [src/vscode-host.ts](src/vscode-host.ts) is the extension's implementation, set in `activate()`; the tests set their own.
- **[default.rules.js](default.rules.js)** — Built-in transformation rules, exported to users who run the export command.

### Transformation Pipeline

1. Config is loaded from `.wizly/wizly.config.js` (project-level, version-controlled; `.vswizly/` as fallback)
2. Rules are applied in order — each rule has a `regex`, optional `templateFile` or `replace` string
3. Rules with `templateFile` render EJS templates; `useBalancedTag: true` extracts the full matched element before rendering
4. Smart matchers run after regex: `smartLabelMatcher` (associates labels with controls), `smartTabMatcher` (aligns tab headers), custom matchers
5. Prettier formats the output

### Templates

Templates live in [`templates/`](templates/) as `.ejs` files. All templates receive these helper functions:
- `getLabel(magic)` — smart-matched label for a control
- `getCustomMatch(matcherName, magic)` — capture groups from custom matchers
- `getAttribute(magic, attr)`, `startsWith`, `endsWith`, `includes`, `include` (partial inclusion)

The `card.ejs` template uses `useBalancedTag: true` (see `default.rules.js`). Input templates in `templates/inputs/` and shared partials in `templates/partials/`.

### Tests

Tests are in [src/test/suite/standalone.test.ts](src/test/suite/standalone.test.ts) and use fixture files:
- **[src/test/fixtures/input/](src/test/fixtures/input/)** — Raw HTML input files, or folders containing `raw.html` + optional `settings.js` + optional `.vswizly/templates/` overrides (kept on the old name on purpose: it covers the fallback)
- **[src/test/fixtures/expected/](src/test/fixtures/expected/)** — Expected transformed output

Each fixture file/folder name becomes a test case. Folder-based tests allow per-test settings overrides.

### Build

esbuild bundles `src/extension.ts` → `dist/extension.js` and `src/cli.ts` → `dist/cli.js` (the `bin` in `package.json`). The CLI bundle must never import `vscode`, directly or through anything it imports. The dependencies `vscode`, `prettier`, and `ejs` are marked external (not bundled). TypeScript compiles to `out/` for test execution.

## SCSS Structure (7-1)

Every SCSS file Wizly generates follows the [7-1 architecture](https://sass-guidelin.es/#architecture) under `<sourceRoot>/scss/`, with `main.scss` as the only entry point. `Wizly: Convert Angular Project to SCSS` creates these folders: `abstracts`, `base`, `components`, `layout`, `pages`, `themes`, `vendors`.

- Sass tools with no CSS output (variables, maps, functions, mixins) go in `abstracts/`.
- Global classes and utilities that do produce CSS go in `base/`.
- Theme bundles go in `themes/`, third-party styles go in `vendors/`.
- Do not add new top-level folders. `main.scss` only composes partials through `@use`.

## Wiki

User documentation lives in [`wiki/`](wiki/). [`.github/workflows/wiki.yml`](.github/workflows/wiki.yml) syncs it to the GitHub wiki on every push to `main` that touches `wiki/**` or `README.md`. `docs/` is the older reference for rules, templates and helpers.

When a feature adds or changes a wiki page:
- Link a new page from `_Sidebar.md`, `Home.md`, `Angular.md` (for Angular features), `Getting-Started.md` and the related pages' "Related Pages" lists, not only the sidebar. Add the command to `Commands.md` with a link to its page.
- Add the version's "Focus" block to `Home.md` and the page link to the README "Documentation" list.
- Check every claim against the code: output paths, prerequisites and error messages, overwrite prompts, and scan limits. Generated SCSS examples must match the renderer output, including `@use` lines.
- Any SCSS file a command generates must be listed in `SCSS-Structure.md` under its 7-1 folder.
- Use relative links (`./Page-Name.md`, optionally with `#anchor`) inside `wiki/`, and full wiki URLs in `README.md`. The wiki workflow strips `./` and `.md` on publish, so keep exactly this form.

## Project Config Format

Users configure the extension via `.wizly/wizly.config.js` in their workspace (`.vswizly/` in projects from before 0.7.0 — read and written as long as no `.wizly/` exists):
```js
module.exports = {
  modes: { /* named sets of rules */ },
  settings: { /* VS Code setting overrides */ }
};
```

Rules reference templates relative to the project's `templates/` (in `.wizly/` or `.vswizly/`) first, then the extension's bundled `templates/`.

## Brand Colors

Use these when styling anything Wizly-branded (webviews, buttons, badges) instead of guessing from the logo:

| Use | Hex |
| --- | --- |
| Logo Background (Marketplace banner / video backdrop) | `#100c3d` |
| Background Dark | `#241C57` |
| Background Mid | `#2E276A` |
| Shadow | `#433893` |
| Primary | `#5950A1` |
| Highlight | `#6559A6` |
| Secondary Accent | `#8B7AE6` |
| Sparkles / Accent | `#C9B7FF` |
| White | `#FFFFFF` |
