# SCSS Conversion (Angular)

Command: `Wizly: Convert Angular Project to SCSS`

Converts an Angular workspace from CSS to SCSS. It updates `package.json`, patches `angular.json`, updates component `styleUrl(s)` references, scaffolds `src/scss/`, and moves any existing `src/styles.css` / `src/styles.scss` content into `src/scss/main.scss` (then removes `src/styles.*`).

Wizly uses a 7-1 SCSS folder structure under `src/scss/` and uses `src/scss/main.scss` as the single entry point. See [css.md](../css.md).

## Magic styles handling

If a `magic-styles.css` file is found next to an `index.html`, Wizly asks whether it should be kept:

- **Delete**: deletes `magic-styles.css`, removes the `<link>` tag from `index.html`, and removes missing `magic-styles.*` entries from `angular.json` if present
- **Convert**: moves the contents to `src/scss/vendors/_magic-styles.scss`, wires it into `src/scss/main.scss` via `@use './vendors/magic-styles';`, removes the `<link>` tag from `index.html`, and deletes `magic-styles.css`
