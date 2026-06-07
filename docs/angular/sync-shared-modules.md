# Sync Shared Modules (Angular)

Command: `Wizly: Sync Shared Modules (Angular)`

This command is meant for existing codebases where Magic-generated modules already exist. It:

- Ensures your SharedModule and SharedMaterialModule files exist (creates them if missing)
- Updates existing `magic.gen.lib.module.ts` files (across lazy loaded folders) to import and include the shared modules
- Removes moved `sharedMaterial` module imports from `magic.gen.lib.module.ts` to avoid duplicate imports/registrations

## Project configuration

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

## Rule-driven requirements

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
