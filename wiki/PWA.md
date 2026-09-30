# PWA

This page is for teams that want the Angular application to behave more like an installable app: an icon on the desktop or start screen, static files cached in the browser, and a clear moment for users to switch to a new version.

## Commands

- `Wizly: Convert Angular Project to PWA`
- `Wizly: Generate PWA Icons & Favicon (from Active Image)`

## What You Gain Above The Magic Baseline

Magic generates the application front end, but not a Progressive Web App setup. Wizly adds that layer:

- it enables Angular PWA support for the selected project
- it generates the whole icon set and `favicon.ico` from one source image
- it can add a small service that asks users to reload when a new version is ready
- it raises Angular's default production budget, which Magic-sized bundles almost always exceed

## Why This Can Help Magic Web Client Projects

With a PWA, the browser keeps static application files in a local cache. After the first visit:

- the app can start faster
- fewer requests go to the server
- you rely less on cache settings on the webserver
- users can launch the app from an icon without typing the URL

For Magic Web Client, you normally run `Prepare for Deployment` inside Magic. That step generates an XML file per web program in `public/assets/cache/`. The Web Client needs these files next to the ECF. When a program changes, the hash in its file name changes too, so these files are good candidates for the PWA cache.

Angular's default `ngsw-config.json` does not cache `.xml` files, and Wizly does not change that file. To cache them, add an asset group yourself:

```json
{
  "name": "magic-cache",
  "installMode": "lazy",
  "updateMode": "prefetch",
  "resources": {
    "files": ["/assets/cache/**"]
  }
}
```

Add this object to the `assetGroups` array in `ngsw-config.json`.

## Before You Start

`Wizly: Convert Angular Project to PWA` stops with a message when:

- there is no `angular.json` in the workspace, or no `package.json` next to it
- `angular.json` has no application project
- the project already looks like a PWA: `@angular/service-worker` is in `package.json`, or `ngsw-config.json` or a `manifest.webmanifest` exists
- the installed `@angular/core` version cannot be read from `package-lock.json` or `node_modules`. Run `npm install` first.

When the workspace has more than one `angular.json` or application project, Wizly asks which one to use.

The command changes several files and runs Angular CLI. When the folder is not a Git repository, Wizly asks before it continues. Commit your work first, so you can see and undo every change.

## What The Convert Command Does

1. It installs `@angular/service-worker` on exactly the installed `@angular/core` version. This avoids an npm `ERESOLVE` error during the next step.
2. It runs `ng add @angular/pwa` on the installed Angular CLI version, for the selected project. Wizly uses npm, pnpm or yarn, depending on the lock file it finds.
3. It sets `@angular/service-worker` in `package.json` to the same version range as `@angular/core`, so both move together on the next upgrade.
4. It raises the `initial` budget in `angular.json` from `500kb` / `1mb` to `3mb` / `5mb`. Wizly only changes that exact Angular default, in `build.options` and in configurations whose name contains `prod`. A budget you chose yourself stays as it is.

The output of every step is shown in the Wizly output channel.

Angular CLI then creates the PWA files. In a current Angular project these are:

- `ngsw-config.json`
- `public/manifest.webmanifest`
- `public/icons/`

It also adds the service worker to your app configuration and links the manifest in `src/index.html`.

## Service Worker Update Handling

After the conversion, Wizly asks whether to add update handling. When you choose yes, Wizly:

- creates `src/app/pwa-update.service.ts` (an existing file is left alone)
- adds the service to `AppComponent` in `app.component.ts`, with `inject(PwaUpdateService)` and an `init()` call in the constructor
- uses a `MatDialog` for the question when Angular Material is installed, and the browser's `confirm()` when it is not

When Wizly cannot find `app.component.ts` or the `AppComponent` class, it only creates the service and shows a warning. Add the `init()` call yourself in that case.

What happens for the user:

- every 10 minutes, the app checks whether a new version exists
- the new version downloads in the background, while the user keeps working
- when it is ready, the user sees "A new version is available. Reload now?"
- `Reload` (or `OK` in the browser dialog) activates the new version and reloads the app. `Later` (or `Cancel`) keeps the current version for now.

You can change this behavior through `init()`:

```ts
// Default: ask the user
this.pwaUpdateService.init();

// Reload automatically when a new version is ready
this.pwaUpdateService.init({ mode: 'silent' });

// Check every minute instead of every 10 minutes
this.pwaUpdateService.init({ checkIntervalMs: 60_000 });

// Use your own question, for example the browser confirm even when Material is installed
this.pwaUpdateService.init({ prompt: (message) => confirm(message) });
```

### Updates And The Magic Login

A reload after login can mean the user has to log in again. Some teams therefore check for an update very early during startup, and only continue to the Web Client login when that decision is made. That strategy depends on the project, and Wizly does not configure it for you.

## Generate Icons And Favicon

`Wizly: Generate PWA Icons & Favicon (from Active Image)` creates every icon from one source PNG.

Before you start:

- open the source PNG in VS Code, so it is the active tab
- the PNG must be inside the Angular project folder that you opened in VS Code. Wizly treats that folder as the project root.
- the project must already be a PWA: `ngsw-config.json` and a `manifest.webmanifest` in `public/`, `src/` or `src/public/`
- the PNG must be at least as large as the largest icon in the manifest. Angular's default manifest goes up to `512x512`.

What the command does:

- it reads `icons[].src` and `icons[].sizes` from the manifest. Only local, square icons are generated. URLs and `data:` icons are skipped.
- it writes each icon to the path in the manifest, next to the manifest. For a manifest in `public/`, that is `public/icons/`.
- it writes `favicon.ico` with 16, 32 and 48 pixel images. An existing `favicon.ico` in `public/` or `src/` keeps its place. Without one, the Angular version decides: Angular 18 and newer use `public/`, older versions use `src/`. When the version cannot be read from `node_modules` or `package.json`, Wizly uses `public/` if that folder exists.
- it asks whether to overwrite existing files or only create missing ones

Use a square source image. A non-square image is stretched to a square.

## Recommended Build Order

For Magic Web Client projects, the order matters:

1. In Magic xpa, run `Web => Prepare for Deployment`.
2. Check that the generated XML files are in `public/assets/cache/`.
3. Build the Angular application.
4. Publish or serve the production build.
5. Test service worker registration, caching and updates.

The service worker only caches files that are part of the build output. If you run `Prepare for Deployment` after the Angular build, the newest XML files are missing from the cache.

## Testing

The service worker only runs in a production build. `ng serve` does not register it, so a normal development session tells you nothing about caching or updates.

- For a first test, serve the production build as static files on `localhost`. Browsers allow service workers on `localhost` without HTTPS.
- For real deployments, installs on devices, and the final rollout, use HTTPS.
- In Chrome or Edge, open DevTools → Application → Service workers to see the registered worker and its cache.

## Material Icons Without Internet

A PWA can start without a network connection, but a `<link>` to `fonts.googleapis.com` in `src/index.html` cannot. Without a connection, Material icons then show up as their text name, for example `home`.

Wizly does not change this for you. To host the icon font yourself:

1. Install the font as a package:

   ```text
   npm install material-icons
   ```

2. Add the CSS of the package to `styles` in `angular.json`, next to your existing styles:

   ```json
   "styles": [
     "node_modules/material-icons/iconfont/material-icons.css",
     "src/scss/main.scss"
   ]
   ```

3. Remove the `<link>` to `fonts.googleapis.com/icon?family=Material+Icons` from `src/index.html`.

4. Build the application. The font files are now part of the build output. Angular's default `ngsw-config.json` caches font files only the first time they are used (the `assets` group is `lazy`). Do you want them offline right after the first visit? Then add `"/**/*.(woff|woff2)"` to the `files` of the `app` group, which is downloaded in advance (`prefetch`).

Check the `material-icons` package documentation for other icon styles, such as outlined or round.

## Related Pages

- [Commands](./Commands.md)
- [Angular](./Angular.md)
- [Getting Started](./Getting-Started.md)
- [Check Angular Setup](./Check-Angular-Setup.md)
- [Themes](./Themes.md)
- [Runtime Settings](./Runtime-Settings.md)
