# SCSS (Sass) Structure

Wizly’s `Convert Angular Project to SCSS` command scaffolds a SCSS structure based on the **7-1 architecture** described here:
https://sass-guidelin.es/#architecture

## Why SCSS (Sass) Instead of Plain CSS

SCSS helps keep styles maintainable as a project grows:

- **Better structure at scale**: you can split styles into many partials and compose them through a single entry point (`main.scss`).
- **Design tokens and reuse**: variables/tokens, mixins, and functions reduce duplication and keep design changes consistent.
- **Cleaner layering**: the 7-1 folders make it clearer where a change belongs (base vs component vs layout), which reduces “mystery CSS”.
- **Works with Angular tooling**: Angular supports Sass out of the box once `sass` is installed and the workspace is configured.

### Cherry-Picking Vendor CSS (Example: Bootstrap Grid Only)

Sometimes you want a small part of a CSS framework (like Bootstrap’s grid) without pulling in the entire framework. The recommended approach is:

- Keep third-party code in `src/scss/vendors/`.
- Import it from `src/scss/main.scss` (or from a dedicated vendor aggregator file in `vendors/`).
- Prefer official “partial” entry points from the vendor package when they exist.

Example (Bootstrap grid only), assuming Bootstrap is installed:

```scss
// src/scss/main.scss
@use './abstracts/tokens' as *;
@use './base/base';

@use './vendors/bootstrap-grid';
```

```scss
// src/scss/vendors/_bootstrap-grid.scss
@import "bootstrap/scss/functions";
@import "bootstrap/scss/variables";
@import "bootstrap/scss/maps";
@import "bootstrap/scss/mixins";
@import "bootstrap/scss/utilities";

@import "bootstrap/scss/reboot";
@import "bootstrap/scss/containers";
@import "bootstrap/scss/grid";
```

Notes:

- Keep vendor imports isolated so they’re easy to remove/replace later.
- If you only need a couple of utilities (`d-flex`, `flex-row`, etc.), consider adding tiny project-local styles in `base/` instead of importing a full vendor bundle.

## Entry Point

- `src/scss/main.scss`: the single SCSS entry point. This file should only compose/forward other partials.
- `angular.json -> projects -> <project> -> (build|test) -> options -> styles`: Wizly points this to `src/scss/main.scss`.

## Folder Map (7-1)

- `src/scss/abstracts/`: Sass tools with no CSS output by themselves.
  - Examples: variables/tokens, mixins, functions.
- `src/scss/base/`: project-wide base styles.
  - Examples: resets/normalize, typography, global element defaults.
- `src/scss/components/`: small, reusable UI pieces.
  - Examples: buttons, form controls, cards, chips (component-level styles).
- `src/scss/layout/`: structural layout styles.
  - Examples: grid, header/footer, navigation, page layout wrappers.
- `src/scss/pages/`: page-specific styles.
  - Examples: `home`, `login`, `dashboard` overrides.
- `src/scss/themes/`: theme definitions/overrides.
  - Examples: light/dark theme variable sets, theme-specific component tweaks.
- `src/scss/vendors/`: third-party styles (treated as external).
  - Example: `vendors/_magic-styles.scss` when you choose to convert `magic-styles.css`.

## Magic Styles

When the converter detects `magic-styles.css`, you can choose:

- **Delete**: removes `magic-styles.css` (and the `<link>` in `index.html` if present).
- **Convert to SCSS**: writes `src/scss/vendors/_magic-styles.scss` and adds `@use './vendors/magic-styles';` to `src/scss/main.scss`.
