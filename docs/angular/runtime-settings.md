# Runtime Settings and Theme Loader (Angular)

Commands:

- `Wizly: Setup Runtime Settings (Angular)`
- `Wizly: Sync Runtime Themes (Angular)`

## What this is for

This feature scaffolds a runtime-loaded `settings/settings.json` and an Angular initializer (`APP_INITIALIZER`) that loads it on startup and applies a theme CSS file by injecting a `<link id="wizly-theme" rel="stylesheet">` into `<head>`.

This is meant to support:

- Switching themes without rebuilding the Angular app
- Multi-theme setups (separate theme CSS bundles via `inject: false`)
- Host-based defaults (multi-tenant) via `window.location.hostname`

## settings.json schema (minimal)

```json
{
  "themeMode": "multi",
  "defaultMode": "system",
  "defaultTheme": "acme-light.css",
  "themes": [
    { "name": "Acme Light", "href": "acme-light.css" },
    { "name": "Acme Dark", "href": "acme-dark.css" }
  ]
}
```

## defaultMode: system

`defaultMode: "system"` means the app follows the OS/browser preference using `prefers-color-scheme`. When the user switches their OS between light/dark and the active mode is `system`, the CSS hook updates automatically.

## themeMode

- `single`: always uses `defaultTheme` (no theme selection UI)
- `multi`: allows selecting a theme and stores it in localStorage (`wizly.themeHref`)
- `hostbased`: selects a theme based on `window.location.hostname` (theme selection UI is typically not used)

For `hostbased`, set `host` on the theme entry:

```json
{
  "themeMode": "hostbased",
  "defaultTheme": "customer-a.css",
  "themes": [
    { "name": "Customer A", "href": "customer-a.css", "host": "a.example.com" },
    { "name": "Customer B", "href": "customer-b.css", "host": "b.example.com" }
  ]
}
```

## Cache busting

The loader fetches `settings/settings.json?v=<time>` to ensure changes to the file are picked up immediately without hard refreshes.

## CSS hooks

The loader sets dataset attributes on `<html>`:

- `data-wizly-mode`: `system | light | dark`
- `data-theme-mode`: `system | light | dark`
- `data-color-scheme`: `light | dark`

It also sets `document.documentElement.style.colorScheme` to `light` or `dark`.

## UI components (optional)

`Wizly: Setup Runtime Settings (Angular)` can scaffold these optional standalone components under `src/app/wizly/` (or `src/app/core/wizly/` if your project already has a `src/app/core/` folder):

- `wizly-theme-selector.component.ts` (theme dropdown, only useful for `themeMode: "multi"`)
- `wizly-mode-toggle.component.ts` (system/light/dark toggle)

If Angular Material is installed, Wizly scaffolds Material-based UI; otherwise it scaffolds plain HTML equivalents.

## Sync runtime themes

`Wizly: Sync Runtime Themes (Angular)` scans `angular.json` for style entries with:

- `inject: false`
- `bundleName: "..."` (so the output is `<bundleName>.css`)

It then merges those into `settings.json -> themes[]` (without removing existing entries).
