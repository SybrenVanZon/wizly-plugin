# Runtime Settings

This page is useful when you want the application to switch themes at runtime, use a different theme based on the host or URL, or load runtime settings from a file instead of hard-coding them.

## What Wizly Does

Main commands:

- `Wizly: Setup Runtime Settings (Angular)`
- `Wizly: Sync Runtime Themes (Angular)`

## What You Gain Above the Magic Baseline

Magic generates the application front end, but it does not give you a built-in runtime theme loading strategy.

Wizly adds that extra layer by:

- loading theme settings from a runtime configuration file
- allowing theme switching at runtime
- supporting multiple themes in one deployment
- making host-based theme selection easier

## When This Is Worth Doing

- You want theme switching in a running app
- You want to switch between light, dark, and system preference at runtime
- You want a different theme based on the host or URL
- You want to load settings from a runtime configuration file

If you only want one fixed theme with no runtime switching, you do not need this flow. In that case, a fixed theme link in `index.html` can also be a valid end state.

## Recommended Order Inside This Topic

1. Start with [Themes](./Themes.md) if you still need to generate theme bundles.
2. Run `Wizly: Setup Runtime Settings (Angular)`.
3. Run `Wizly: Sync Runtime Themes (Angular)` after you add or change theme bundles.

## What This Sets Up

- `public/settings/settings.json` in newer Angular setups
- `assets/settings/settings.json` in older Angular-style setups
- an Angular initializer that loads runtime settings at startup
- a theme stylesheet link in `<head>`

In practice, this means Wizly wires up an `APP_INITIALIZER` flow that loads the runtime settings file before the application finishes bootstrapping, and injects or updates a `<link id="wizly-theme" rel="stylesheet">` element in `<head>` for the active theme bundle.

## Included UI Options

`Wizly: Setup Runtime Settings (Angular)` can also scaffold the user interface for working with these runtime settings.

This can include:

- a theme selector component
- a dark/light/system preference toggle component
- a central Material form-field defaults file when Angular Material is present

These are included as part of the runtime settings setup. They are not separate commands.

For the generated selector/toggle components and the custom-UI approach on top of `WizlySettingsService`, see [Theme Selector and Mode Toggle](./Theme-Selector-and-Mode-Toggle.md).

### One Central Place For Form-Field Style

When Angular Material is detected, Wizly generates `wizly-material-form-field.defaults.ts`:

```typescript
import { MatFormFieldDefaultOptions } from '@angular/material/form-field';

export const wizlyMatFormFieldDefaults: MatFormFieldDefaultOptions = {
    appearance: 'fill',
    floatLabel: 'auto'
};
```

This is registered once as a provider (`MAT_FORM_FIELD_DEFAULT_OPTIONS`) in `app.config.ts` / `app.module.ts`, and applies to every `<mat-form-field>` in the application — inputs, selects, autocompletes, and anything else Wizly generates. You never need to set an appearance or float-label option per field.

To change the look of every field at once, edit this one file. For example, to switch from the filled look to the outlined Material style:

```typescript
export const wizlyMatFormFieldDefaults: MatFormFieldDefaultOptions = {
    appearance: 'outline',
    floatLabel: 'auto'
};
```

`Wizly: Check Angular Setup (Report)` verifies that this file exists and is wired into your providers whenever Angular Material is present.

## Minimal `settings.json`

All Wizly-managed runtime settings live under a `wizly` key, so `settings.json` can also hold your own application config (see [Custom Values](#custom-values-and-host-overrides) below) without name clashes.

```json
{
  "wizly": {
    "themeMode": "multi",
    "defaultThemePreference": "system",
    "defaultTheme": "acme-light.css",
    "themes": [
      { "name": "Acme", "href": "acme-light.css", "mode": "light" },
      { "name": "Acme", "href": "acme-dark.css", "mode": "dark" }
    ]
  },
  "custom": {},
  "hostOverrides": {}
}
```

## Theme Modes

- `single`: always uses one default theme
- `multi`: allows multiple selectable themes
- `hostbased`: chooses the theme from `window.location.hostname`

Switching between modes is a matter of editing `wizly.themeMode` and the surrounding fields directly in `settings.json` — no command is needed to flip the mode itself.

`single`:

```json
{
  "wizly": {
    "themeMode": "single",
    "defaultThemePreference": "system",
    "defaultTheme": "acme-light.css",
    "themes": [
      { "name": "Acme", "href": "acme-light.css", "mode": "light" },
      { "name": "Acme", "href": "acme-dark.css", "mode": "dark" }
    ]
  }
}
```

`multi` (adds a theme selector the user can switch, stored in `localStorage`):

```json
{
  "wizly": {
    "themeMode": "multi",
    "defaultThemePreference": "system",
    "defaultTheme": "acme-light.css",
    "themes": [
      { "name": "Acme", "href": "acme-light.css", "mode": "light" },
      { "name": "Acme", "href": "acme-dark.css", "mode": "dark" },
      { "name": "Contoso", "href": "contoso-light.css", "mode": "light" },
      { "name": "Contoso", "href": "contoso-dark.css", "mode": "dark" }
    ]
  }
}
```

`hostbased` (selects a theme from `window.location.hostname`; each theme needs a `host`):

```json
{
  "wizly": {
    "themeMode": "hostbased",
    "defaultTheme": "customer-a.css",
    "themes": [
      { "name": "Customer A", "href": "customer-a.css", "host": "a.example.com" },
      { "name": "Customer B", "href": "customer-b.css", "host": "b.example.com" }
    ]
  }
}
```

In this setup, the app checks the current host name and loads the matching theme. If no host matches, it falls back to `defaultTheme`. Going back from `hostbased` to `single`/`multi` is safe — the leftover `host` fields on each theme are simply ignored when `themeMode` is not `hostbased`.

`host` also accepts an array, so one theme entry can serve several hosts without duplicating it per host:

```json
{ "name": "Shared", "href": "shared.css", "host": ["a.example.com", "b.example.com"] }
```

### `hostbased` With Multiple Themes Per Host

A host can have more than one theme. The theme selector then becomes interactive automatically, but only shows and switches between the themes for the current host — visitors on one host never see another host's themes in the dropdown:

```json
{
  "wizly": {
    "themeMode": "hostbased",
    "defaultTheme": "customer-a-light.css",
    "themes": [
      { "name": "Customer A", "href": "customer-a-light.css", "mode": "light", "host": "a.example.com" },
      { "name": "Customer A", "href": "customer-a-dark.css", "mode": "dark", "host": "a.example.com" },
      { "name": "Customer A Contrast", "href": "customer-a-contrast.css", "host": "a.example.com" },
      { "name": "Customer B", "href": "customer-b.css", "host": "b.example.com" }
    ]
  }
}
```

On `a.example.com`, the selector offers "Customer A" (with its light/dark mode toggle) and "Customer A Contrast". On `b.example.com`, only "Customer B" is offered, and the selector is hidden entirely because there is nothing else to switch to for that host (see [Hiding The Selector When There Is Nothing To Switch](#hiding-the-selector-when-there-is-nothing-to-switch)). The selected theme is remembered per host automatically — it is stored in `localStorage`, which is already scoped per origin/hostname by the browser.

### Picking A Default When A Host Has Multiple Themes

The top-level `wizly.defaultTheme` is a single href, shared across all hosts — it only acts as a host's default when that href happens to belong to that host's themes. When a host has multiple themes, mark the one that should be the starting theme with `"default": true` instead of relying on `wizly.defaultTheme` or array order:

```json
{
  "wizly": {
    "themeMode": "hostbased",
    "themes": [
      { "name": "Customer A", "href": "customer-a-light.css", "mode": "light", "host": "a.example.com", "default": true },
      { "name": "Customer A", "href": "customer-a-dark.css", "mode": "dark", "host": "a.example.com" },
      { "name": "Customer B", "href": "customer-b-dark.css", "mode": "dark", "host": "b.example.com", "default": true },
      { "name": "Customer B", "href": "customer-b-light.css", "mode": "light", "host": "b.example.com" }
    ]
  }
}
```

Resolution order per host is: the visitor's previously stored choice (`localStorage`, if it still belongs to that host) → the theme marked `"default": true` for that host → `wizly.defaultTheme` if it happens to belong to that host → the first theme listed for that host. `Wizly: Check Angular Setup (Report)` warns when a host has more than one theme but no explicit default, since that means the outcome silently depends on array order.

## `defaultThemePreference`

Supported values:

- `light`: always start with the light preference
- `dark`: always start with the dark preference
- `system`: follow the browser or OS light/dark preference

With `defaultThemePreference: "system"`, the app updates automatically when that system preference changes.

## Cache Busting

The runtime loader fetches `settings/settings.json` with a cache-busting query string so updates are picked up immediately without requiring a hard refresh.

## Theme Families

When you have both a light and dark variant of the same theme, it is recommended to keep the same `name` and add a `mode` key.

Example:

```json
{
  "wizly": {
    "themeMode": "single",
    "defaultThemePreference": "system",
    "defaultTheme": "acme-light.css",
    "themes": [
      { "name": "Acme", "href": "acme-light.css", "mode": "light" },
      { "name": "Acme", "href": "acme-dark.css", "mode": "dark" }
    ]
  }
}
```

This gives you a cleaner result:

- the theme selector shows one logical theme name instead of separate `Acme Light` and `Acme Dark` entries
- the mode toggle can switch between the matching light and dark files inside that same theme family
- `defaultTheme` still points to a real CSS file, but Wizly can treat that file as the starting point for the family

## Custom Values and Host Overrides

`settings.json` is also a convenient place to keep your own runtime-configurable application values — for example a logo URL or an API endpoint that differs per deployment. These live outside the `wizly` key so they never collide with Wizly's own fields:

```json
{
  "wizly": { "themeMode": "single", "defaultTheme": "acme-light.css", "themes": [] },
  "custom": {
    "logoUrl": "/assets/logo-default.svg",
    "apiEndpoint": "https://api.default.com",
    "branding": { "primaryColor": "#1a2b3c", "supportEmail": "support@default.com" }
  },
  "hostOverrides": {
    "clienta.example.com": {
      "logoUrl": "/assets/logo-clienta.svg",
      "branding": { "primaryColor": "#a31f34" }
    },
    "clientb.example.com": {
      "apiEndpoint": "https://api.clientb.com"
    }
  }
}
```

Read values through the generated `WizlySettingsService`:

```typescript
const logoUrl = this.settings.getValue<string>('logoUrl', '/assets/logo-default.svg');
const branding = this.settings.getValue<{ primaryColor: string; supportEmail: string }>('branding');
```

`getValue()` resolves in this order:

1. Look up `hostOverrides[window.location.hostname]`.
2. Fall back to the base value under `custom`.
3. Fall back to the `fallback` argument you pass in.

If a value is a plain object (like `branding` above), the host override is **deep-merged** on top of the base object — you only need to specify the keys that differ for that host (`primaryColor` above), not the whole object. Arrays and primitive values (strings, numbers, booleans) are replaced wholesale by the override, not merged.

`Wizly: Sync Runtime Themes (Angular)` only touches `wizly.themes`/`wizly.defaultTheme` — it never rewrites `custom` or `hostOverrides`, so your own values are safe across re-syncs.

## CSS Hooks

The runtime loader sets attributes on `<html>` such as:

- `data-wizly-mode`
- `data-theme-mode`
- `data-color-scheme`

It also updates `document.documentElement.style.colorScheme`.

### Important Notes

- The theme selector and mode toggle are documented separately in [Theme Selector and Mode Toggle](./Theme-Selector-and-Mode-Toggle.md).
- The runtime loader still sets the HTML hooks and `color-scheme`, so your own CSS can react to them as well
- `Wizly: Setup Runtime Settings (Angular)` wires up the settings service and startup loading, but you still choose where your own theme UI appears in the application
