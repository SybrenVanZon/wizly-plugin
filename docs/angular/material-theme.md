# Angular Material Theme (SCSS)

Command: `Wizly: Generate Angular Material Theme (SCSS)`

Generates a custom Angular Material theme under `src/scss/themes/` from a theme name and hex colors.

## What it generates

- A theme file under `src/scss/themes/` (optionally with `-light` / `-dark` suffix)
- An Angular Material theme using `@use '@angular/material' as mat;`
- A full palette (50..900 + A hues) per base color by deriving tints/shades from a single provided hex color (used as the 500 hue)

## angular.json integration

Wizly updates `angular.json` so the theme is built as a separate CSS bundle:

- `inject: false` so it is not automatically included
- `bundleName` equals the generated theme name (optionally including `-light` / `-dark`)

This is meant as a foundation for multi-theme setups.

## Loading the theme (manual)

Add the generated CSS file to `src/index.html`:

```html
<link rel="stylesheet" href="acme-light.css" />
```

The output file name matches `bundleName` (with `.css`).

## Requirements

- Angular Material must be installed (`@angular/material`)
- The Angular workspace must be able to build SCSS (Sass support, i.e. `sass` installed)
