# Theme Bundle (Blank SCSS)

Command: `Wizly: Generate Theme Bundle (Blank SCSS)`

Generates a blank theme bundle under `src/scss/themes/` and adds it to `angular.json` as a separate CSS bundle (`inject: false`).

Use this when you want to manage theming yourself (custom UI framework, custom tokens), but still want the same multi-theme build pipeline as the Angular Material theme command.

## Requirements

- The Angular workspace must be able to build SCSS (Sass support, i.e. `sass` installed)
