# PWA (Angular)

## Enable PWA

Command: `Wizly: Convert Angular Project to PWA`

Enables PWA support by running Angular CLI’s PWA schematic (`ng add @angular/pwa`) for the selected Angular application project.

After running this command, these are the most common places to customise branding:

- **Icons**: `src/assets/icons/` (the files referenced by `src/manifest.webmanifest`)
- **PWA colors**: `src/manifest.webmanifest` (`theme_color` and `background_color`)
- **Browser UI theme color**: `src/index.html` (`<meta name="theme-color" ...>`)

## Service worker update handling

Angular’s service worker updates are downloaded in the background, but your app typically needs to decide when to refresh to activate the new version.

Wizly can optionally scaffold a small update helper during PWA conversion:

- Creates `src/app/pwa-update.service.ts`
- Tries to wire it into `AppComponent` (uses `inject(PwaUpdateService)` + `init()` call)
- If Angular Material is available, the default prompt uses `MatDialog`; otherwise it falls back to `confirm()`

To switch behaviour:

- **Prompt mode** (default): `this.pwaUpdateService.init()` (or `init({ mode: 'prompt' })`)
- **Silent mode** (auto-reload on update): `this.pwaUpdateService.init({ mode: 'silent' })`
- **Force browser confirm** (even when Material is installed): `this.pwaUpdateService.init({ prompt: (m) => confirm(m) })`

## Generate icons and favicon

Command: `Wizly: Generate PWA Icons & Favicon (from Active Image)`

Generates the icon set from a single source PNG:

- Only runs when the active editor/tab is the source PNG
- Only runs when the workspace looks like a PWA (requires `ngsw-config.json` and a manifest file: `public/manifest.webmanifest` or `src/manifest.webmanifest`)
- Reads icon sizes and file paths from the manifest (`icons[].src` + `icons[].sizes`)
- Writes the matching PNG files (typically under `src/assets/icons/`)
- Writes `src/favicon.ico` (16/32/48)

The source PNG must be at least as large as the biggest icon size in your manifest (commonly 512×512 or 1024×1024).
