# Angular

Wizly includes a focused set of Angular workspace commands for SCSS conversion, theming, runtime settings, and setup verification.

## Start With These Pages

- [Convert to SCSS](./Convert-to-SCSS.md)
- [Themes](./Themes.md)
- [Theme Color Utilities](./Theme-Color-Utilities.md)
- [Magic Colors](./Magic-Colors.md)
- [Runtime Settings](./Runtime-Settings.md)
- [PWA](./PWA.md)

## Supporting Reference

- [SCSS Structure](./SCSS-Structure.md)
- [CSS Requirements](./CSS-Requirements.md)
- [Check Angular Setup](./Check-Angular-Setup.md)
- [Commands](./Commands.md)

## Available Angular Helpers

- Check whether SCSS, theme bundles, runtime settings, PWA markers, Magic dependencies, and related Angular configuration look consistent
- Convert a workspace from CSS to SCSS
- Scaffold Angular Material theme files
- Scaffold blank theme bundles
- Generate theme color utility classes based on public Material theme variables
- Import a Magic `.eng` color file as SCSS (`magic-color-*` classes and `magic.fg()` / `magic.bg()`)
- Set up runtime settings
- Sync runtime themes
- Enable PWA support, with an optional update prompt
- Generate PWA icons and favicon from one image

## Recommended Order

1. `Wizly: Convert Angular Project to SCSS`
2. `Wizly: Generate Angular Material Theme (SCSS)` or `Wizly: Generate Theme Bundle (Blank SCSS)`
3. `Wizly: Generate Theme Color Utilities (SCSS)` if you want reusable global palette classes, and `Wizly: Import Magic Color File (SCSS)` if you want to keep using your Magic color numbers
4. `Wizly: Setup Runtime Settings (Angular)`
5. `Wizly: Sync Runtime Themes (Angular)`
6. `Wizly: Convert Angular Project to PWA` and `Wizly: Generate PWA Icons & Favicon (from Active Image)` if you want an installable app
7. `Wizly: Check Angular Setup (Report)` when you want a health check of the completed setup, including your `@magic-xpa/*` dependencies
