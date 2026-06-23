# Shared Modules

This page is mainly for larger Angular projects where many Magic-generated modules already exist.

## What Wizly Does

Run:

- `Wizly: Sync Shared Modules (Angular)`

## What You Gain Above the Magic Baseline

Magic can generate many module files, but it does not automatically organize shared Angular and Material dependencies in a central, maintainable way.

Wizly adds that extra layer by:

- creating shared module files when they do not exist yet
- updating generated `magic.gen.lib.module.ts` files to use those shared modules
- reducing repeated imports and registrations
- helping keep a larger project more consistent over time

## When This Is Worth Doing

- You already have multiple generated modules
- Shared Angular or Material dependencies are being repeated across the project
- You want a more centralized module setup
- You want less manual maintenance after regeneration

## Important Note

This is usually more valuable in an existing or growing project than on day one of a small prototype.

## Project Configuration

Typical configuration in `.vswizly/wizly.config.js`:

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

Rules can declare required Angular modules so Wizly can keep SharedMaterialModule in sync.

Example:

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
