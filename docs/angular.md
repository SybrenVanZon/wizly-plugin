# Angular Support

Wizly can help keep Angular module imports in sync for Magic-generated projects.

## Angular Workspace Utilities

### Convert Angular Project to SCSS

Command: `Wizly: Convert Angular Project to SCSS`

Converts an Angular workspace from CSS to SCSS. It updates `package.json`, patches `angular.json`, updates component `styleUrl(s)` references, scaffolds `src/scss/`, and moves any existing `src/styles.css`/`src/styles.scss` content into `src/scss/main.scss` (then removes `src/styles.*`).

Wizly uses a 7-1 SCSS folder structure under `src/scss/` and uses `src/scss/main.scss` as the single entry point. See [css.md](file:///c:/PROJECTS/wizly-plugin/wizly/docs/css.md).

If a `magic-styles.css` file is found next to an `index.html`, Wizly asks whether it should be kept:

- **Delete**: deletes `magic-styles.css`, removes the `<link>` tag from `index.html`, and removes missing `magic-styles.*` entries from `angular.json` if present
- **Convert**: moves the contents to `src/scss/vendors/_magic-styles.scss`, wires it into `src/scss/main.scss` via `@use './vendors/magic-styles';`, removes the `<link>` tag from `index.html`, and deletes `magic-styles.css`

### Convert Angular Project to PWA

Command: `Wizly: Convert Angular Project to PWA`

Enables PWA support by running Angular CLI’s PWA schematic (`ng add @angular/pwa`) for the selected Angular application project.

After running this command, these are the most common places to customise branding:

- **Icons**: `src/assets/icons/` (the files referenced by `src/manifest.webmanifest`)
- **PWA colors**: `src/manifest.webmanifest` (`theme_color` and `background_color`)
- **Browser UI theme color**: `src/index.html` (`<meta name="theme-color" ...>`)

#### Service Worker Update Handling

Angular’s service worker updates are downloaded in the background, but your app typically needs to decide when to refresh to activate the new version.

The safest baseline is:

- Call `checkForUpdate()` periodically
- When a new version is ready, prompt the user to reload

Wizly can optionally scaffold a small update helper during PWA conversion:

- Creates `src/app/pwa-update.service.ts`
- Tries to wire it into `AppComponent` (constructor injection + `init()` call)
- If Angular Material is available, the default prompt uses `MatDialog`; otherwise it falls back to `confirm()`

Example (works in Angular apps where `@angular/service-worker` is installed and enabled in production builds):

```ts
import { inject, Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);

  init() {
    if (!this.swUpdate.isEnabled) { return; }

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        const shouldReload = confirm('A new version is available. Reload now?');
        if (shouldReload) {
          location.reload();
        }
      });

    setInterval(() => this.swUpdate.checkForUpdate(), 60_000);
  }
}
```

Wire it in early in app startup (e.g. `AppComponent` constructor, or your `main.ts` bootstrap flow) and ensure it is not executed in SSR contexts.

To switch behaviour:

- **Prompt mode** (default): `this.pwaUpdateService.init()` (or `init({ mode: 'prompt' })`)
- **Silent mode** (auto-reload on update): `this.pwaUpdateService.init({ mode: 'silent' })`
- **Force browser confirm** (even when Material is installed): `this.pwaUpdateService.init({ prompt: (m) => confirm(m) })`

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
