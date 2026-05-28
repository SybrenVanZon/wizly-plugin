# Angular Support

Wizly can help keep Angular module imports in sync for Magic-generated projects.

## Angular Workspace Utilities

### Convert Angular Project to SCSS

Command: `Wizly: Convert Angular Project to SCSS`

Converts an Angular workspace from CSS to SCSS. It updates `package.json`, patches `angular.json`, updates component `styleUrl(s)` references, scaffolds `src/scss/`, and migrates `src/styles.css` to `src/styles.scss`.

### Convert Angular Project to PWA

Command: `Wizly: Convert Angular Project to PWA`

Enables PWA support by running Angular CLI’s PWA schematic (`ng add @angular/pwa`) for the selected Angular application project.

After running this command, these are the most common places to customise branding:

- **Icons**: `src/assets/icons/` (the files referenced by `src/manifest.webmanifest`)
- **PWA colors**: `src/manifest.webmanifest` (`theme_color` and `background_color`)
- **Browser UI theme color**: `src/index.html` (`<meta name="theme-color" ...>`)

## Sync Shared Modules Command

Command: `Wizly: Sync Shared Modules (Angular)`

This command is meant for existing codebases where Magic-generated modules already exist. It:

- Ensures your SharedModule and SharedMaterialModule files exist (creates them if missing)
- Updates existing `magic.gen.lib.module.ts` files (across lazy loaded folders) to import and include the shared modules
- Removes moved `sharedMaterial` module imports from `magic.gen.lib.module.ts` to avoid duplicate imports/registrations

## Project Configuration

Configure module locations in `.vswizly/wizly.config.js` (recommended, can be version-controlled):

```js
module.exports = {
  angular: {
    modules: {
      shared: {
        filePath: "src/app/shared/shared.module.ts",
        className: "SharedModule"
      },
      sharedMaterial: {
        filePath: "src/app/shared/material/material.module.ts",
        className: "SharedMaterialModule"
      }
    },
    magicGenLibModule: {
      include: ["src/app/**/magic.gen.lib.module.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"]
    }
  }
};
```

## Rule-Driven Requirements

Rules can optionally declare required Angular modules (kept close to the rule). Wizly reads these to populate SharedMaterialModule exports.

```js
{
  name: "useMatTooltip",
  filePattern: "*.html",
  active: true,
  regex: /matTooltip/gm,
  replacement: "matTooltip",
  requires: {
    ngModuleImports: [
      { name: "MatTooltipModule", from: "@angular/material/tooltip", placement: "sharedMaterial" }
    ]
  }
}
```
