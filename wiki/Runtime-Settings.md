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

## Minimal `settings.json`

```json
{
  "themeMode": "multi",
  "defaultThemePreference": "system",
  "defaultTheme": "acme-light.css",
  "themes": [
    { "name": "Acme", "href": "acme-light.css", "mode": "light" },
    { "name": "Acme", "href": "acme-dark.css", "mode": "dark" }
  ]
}
```

## Theme Modes

- `single`: always uses one default theme
- `multi`: allows multiple selectable themes
- `hostbased`: chooses the theme from `window.location.hostname`

Example for `hostbased`:

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

In this setup, the app checks the current host name and loads the matching theme. If no host matches, it falls back to `defaultTheme`.

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
  "themeMode": "single",
  "defaultThemePreference": "system",
  "defaultTheme": "acme-light.css",
  "themes": [
    { "name": "Acme", "href": "acme-light.css", "mode": "light" },
    { "name": "Acme", "href": "acme-dark.css", "mode": "dark" }
  ]
}
```

This gives you a cleaner result:

- the theme selector shows one logical theme name instead of separate `Acme Light` and `Acme Dark` entries
- the mode toggle can switch between the matching light and dark files inside that same theme family
- `defaultTheme` still points to a real CSS file, but Wizly can treat that file as the starting point for the family

## CSS Hooks

The runtime loader sets attributes on `<html>` such as:

- `data-wizly-mode`
- `data-theme-mode`
- `data-color-scheme`

It also updates `document.documentElement.style.colorScheme`.

## Optional UI Components

Wizly can optionally scaffold:

- `wizly-theme-selector.component.ts`
- `wizly-mode-toggle.component.ts`

If Angular Material is installed, Material-based UI is generated; otherwise plain HTML equivalents are used.

When that Material-based mode toggle is generated, Wizly can also offer to add the Material Icons stylesheet to `index.html`, because the toggle uses `<mat-icon>`.
It also creates `wizly-material-form-field.defaults.ts`, so label mode and appearance can be changed in one central place instead of per generated template.
If your SCSS base file exists, Wizly also adds a basic `mat-form-field { width: 100%; }` rule there so generated Material fields behave more like full-width business form controls by default.

These components can override the defaults at runtime:

- the theme selector is mainly useful with `themeMode: "multi"` and stores the selected theme in local storage under `wizly.themeHref`
- the preference toggle stores the selected theme preference in local storage under `wizly.themePreference`

That means `defaultTheme` and `defaultThemePreference` act as the starting values or fallback values, while the user's later choice can be remembered for the next visit.

## How To Use The UI Components

After `Wizly: Setup Runtime Settings (Angular)`, Wizly creates the runtime UI components in one of these folders:

- `src/app/wizly/`
- `src/app/core/wizly/` when your project already uses a `core/` folder

The selectors are:

- `<wizly-theme-selector></wizly-theme-selector>`
- `<wizly-mode-toggle></wizly-mode-toggle>`

If Angular Material is installed, Wizly also creates:

- `wizly-material-form-field.defaults.ts`

That file is registered through `MAT_FORM_FIELD_DEFAULT_OPTIONS` and becomes the central place for settings such as:

- `appearance`
- `floatLabel`

The width rule stays in SCSS instead of that provider, because full width is a layout/CSS concern rather than an Angular Material option.

### Standalone Angular Example

If your page or shell component is standalone, import the Wizly components there and place them in your template.

Example:

```ts
import { Component } from '@angular/core';
import { WizlyModeToggleComponent } from './wizly/wizly-mode-toggle.component';
import { WizlyThemeSelectorComponent } from './wizly/wizly-theme-selector.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [WizlyThemeSelectorComponent, WizlyModeToggleComponent],
  templateUrl: './shell.component.html'
})
export class ShellComponent {}
```

```html
<wizly-theme-selector></wizly-theme-selector>
<wizly-mode-toggle></wizly-mode-toggle>
```

If your project uses `src/app/core/wizly/` instead, change the import path accordingly.

### NgModule Example

If your project still uses `AppModule` or another Angular module, import the standalone Wizly components in that module.

Example:

```ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { WizlyModeToggleComponent } from './wizly/wizly-mode-toggle.component';
import { WizlyThemeSelectorComponent } from './wizly/wizly-theme-selector.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    WizlyThemeSelectorComponent,
    WizlyModeToggleComponent
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
```

Then place the selectors where you want them to appear, for example in your top bar, login page, or settings page.

### Important Notes

- The theme selector only becomes interactive when `themeMode` is set to `multi`
- The mode toggle works with `light`, `dark`, and `system`
- If related theme files share the same `name` and define `mode: "light"` / `mode: "dark"`, the mode toggle can switch between those files automatically
- When Angular Material is present and the Material-based toggle is used, make sure the Material Icons stylesheet is available; `Wizly: Setup Runtime Settings (Angular)` can offer to add it for you
- When Angular Material is present, `Wizly: Setup Runtime Settings (Angular)` also scaffolds a central form-field defaults file so you can adjust label behavior in one place
- When Angular Material is present and `_base.scss` exists, Wizly can also add a central `mat-form-field { width: 100%; }` rule there
- The runtime loader still sets the HTML hooks and `color-scheme`, so your own CSS can react to them as well
- `Wizly: Setup Runtime Settings (Angular)` wires up the settings service and startup loading, but you still choose where these UI components appear in your application
