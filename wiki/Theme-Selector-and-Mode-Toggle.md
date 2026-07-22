# Theme Selector and Mode Toggle

This page explains the runtime UI that Wizly can scaffold for theme selection and light/dark/system preference switching.

It also shows how to build your own custom UI on top of the generated Wizly runtime settings service.

## What Wizly Can Generate

When you run `Wizly: Setup Runtime Settings (Angular)`, Wizly can scaffold:

- `components/wizly-theme-selector.component.ts`
- `components/wizly-theme-mode-toggle.component.ts`
- `wizly-material-form-field.defaults.ts` when Angular Material is installed

These are not separate commands. They are optional helpers that belong to the runtime settings setup.

## Generated Locations

After `Wizly: Setup Runtime Settings (Angular)`, Wizly creates the runtime UI components in one of these folders:

- `src/app/wizly/components/`
- `src/app/core/wizly/components/` when your project already uses a `core/` folder

The selectors are:

- `<wiz-theme-selector></wiz-theme-selector>`
- `<wiz-theme-mode-toggle></wiz-theme-mode-toggle>`

## What The Built-In Components Do

The built-in components are reference implementations for the generated runtime settings service.

- The theme selector is mainly useful with `themeMode: "multi"`, or with `themeMode: "hostbased"` when a host has more than one theme.
- The mode toggle works with `light`, `dark`, and `system`.
- If related theme files share the same `name` and define `mode: "light"` / `mode: "dark"`, the mode toggle can switch between those files automatically.

If Angular Material is installed, Material-based UI is generated. Otherwise plain HTML equivalents are used.

When the Material-based mode toggle is generated, Wizly can also offer to add the Material Icons stylesheet to `index.html`, because the toggle uses `<mat-icon>`.

## Material Defaults Helper

If Angular Material is installed, Wizly also creates:

- `wizly-material-form-field.defaults.ts`

That file is registered through `MAT_FORM_FIELD_DEFAULT_OPTIONS` and becomes the central place for settings such as:

- `appearance`
- `floatLabel`

If your SCSS base file exists, Wizly also adds a basic `mat-form-field { width: 100%; }` rule there so generated Material fields behave more like full-width business form controls by default.

## How To Use The Built-In Components

### Standalone Angular Example

If your page or shell component is standalone, import the Wizly components there and place them in your template.

```ts
import { Component } from '@angular/core';
import { WizlyThemeModeToggleComponent } from './wizly/components/wizly-theme-mode-toggle.component';
import { WizlyThemeSelectorComponent } from './wizly/components/wizly-theme-selector.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [WizlyThemeSelectorComponent, WizlyThemeModeToggleComponent],
  templateUrl: './shell.component.html'
})
export class ShellComponent {}
```

```html
<wiz-theme-selector></wiz-theme-selector>
<wiz-theme-mode-toggle></wiz-theme-mode-toggle>
```

If your project uses `src/app/core/wizly/` instead, change the import path accordingly.

### NgModule Example

If your project still uses `AppModule` or another Angular module, import the standalone Wizly components in that module.

```ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { WizlyThemeModeToggleComponent } from './wizly/components/wizly-theme-mode-toggle.component';
import { WizlyThemeSelectorComponent } from './wizly/components/wizly-theme-selector.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    WizlyThemeSelectorComponent,
    WizlyThemeModeToggleComponent
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
```

Then place the selectors where you want them to appear, for example in your top bar, login page, or settings page.

## Build Your Own Custom UI

You do not have to use the generated `<wiz-theme-selector>` or `<wiz-theme-mode-toggle>` components.

You can inject the generated `WizlySettingsService` and build your own dropdown, buttons, chips, menu, toolbar, or completely custom layout.

Useful service members include:

- `state$`
- `getState()`
- `getSelectableThemes()`
- `getActiveThemeSelection()`
- `canUserSwitchTheme()`
- `canUserSwitchMode()`
- `setTheme(selection)`
- `setMode(mode)`
- `getValue(key, fallback)` — reads your own custom values from `settings.json` (see [Runtime Settings](./Runtime-Settings.md#custom-values-and-host-overrides))

The service state also exposes values such as:

- `themeMode`
- `themes`
- `defaultTheme`
- `activeThemeHref`
- `mode`
- `colorScheme`

### Custom Example

```ts
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { map } from 'rxjs/operators';
import { WizlySettingsService } from './wizly/wizly-settings.service';

@Component({
  selector: 'app-theme-tools',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" (click)="setMode('light')">Light</button>
    <button type="button" (click)="setMode('dark')">Dark</button>
    <button type="button" (click)="setMode('system')">System</button>

    <select *ngIf="canSwitch$ | async" [value]="(activeTheme$ | async) ?? ''" (change)="setTheme($any($event.target).value)">
      <option *ngFor="let t of (themes$ | async)" [value]="t.key">{{ t.name }}</option>
    </select>
  `
})
export class ThemeToolsComponent {
  private readonly settings = inject(WizlySettingsService);

  readonly themes$ = this.settings.state$.pipe(map(() => this.settings.getSelectableThemes()));
  readonly activeTheme$ = this.settings.state$.pipe(map(() => this.settings.getActiveThemeSelection()));
  readonly canSwitch$ = this.settings.state$.pipe(map(() => this.settings.canUserSwitchTheme()));

  setTheme(selection: string) {
    this.settings.setTheme(selection);
  }

  setMode(mode: 'light' | 'dark' | 'system') {
    this.settings.setMode(mode);
  }
}
```

### Hiding The Selector When There Is Nothing To Switch

`getSelectableThemes()` is already scoped to what the current visitor can actually pick from — for `themeMode: "hostbased"` it only returns the current host's themes, so it works the same way whether a host has one theme or several.

`canUserSwitchTheme()` tells you whether that list has more than one real choice: `true` for `themeMode: "multi"`, and for `themeMode: "hostbased"` only when the current host itself has more than one theme. The generated `<wiz-theme-selector>` wraps its whole template in `*ngIf="canSwitch$ | async"` so the control disappears completely (not just becomes disabled) when there is nothing to switch to — for example a `hostbased` host with a single theme, or `themeMode: "single"`. Do the same in your own UI: gate the selector's container element behind `canSwitch$ | async`, as shown above, instead of only disabling the `<select>`.

## CSS And DOM Hooks

The runtime loader also updates HTML-level hooks, so your own CSS or JavaScript can react without directly using the generated components:

- `data-wizly-mode`
- `data-theme-mode`
- `data-color-scheme`

It also updates `document.documentElement.style.colorScheme`.

## Important Notes

- The theme selector becomes interactive when `themeMode` is `multi`, or when `themeMode` is `hostbased` and the current host has more than one theme (see [Runtime Settings](./Runtime-Settings.md#hostbased-with-multiple-themes-per-host)).
- The user's selected theme is stored in local storage under `wizly.themeHref`.
- The user's selected mode is stored in local storage under `wizly.themePreference`.
- `defaultTheme` and `defaultThemePreference` act as the starting values or fallback values.
- `Wizly: Setup Runtime Settings (Angular)` wires up the settings service and startup loading, but you still choose where these UI components appear in your application.
