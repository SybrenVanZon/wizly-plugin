# Angular Support

Wizly 0.5.0 adds Angular workspace commands for SCSS conversion, theme bundle generation, runtime settings, and setup verification.

## Included Commands

- [SCSS conversion](./angular/scss.md)
- [Angular Material theme generation](./angular/material-theme.md)
- [Blank theme bundle generation](./angular/blank-theme.md)
- [Runtime settings and theme sync](./angular/runtime-settings.md)

## Recommended Order

1. Run `Wizly: Convert Angular Project to SCSS`
2. Run `Wizly: Generate Angular Material Theme (SCSS)` or `Wizly: Generate Theme Bundle (Blank SCSS)`
3. Run `Wizly: Generate Theme Color Utilities (SCSS)` when you want utility classes
4. Run `Wizly: Setup Runtime Settings (Angular)`
5. Run `Wizly: Sync Runtime Themes (Angular)` after adding or renaming theme bundles
6. Run `Wizly: Check Angular Setup` to verify the complete flow
