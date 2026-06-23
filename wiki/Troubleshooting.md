# Troubleshooting

This page collects the most common problems you can run into while working with Wizly and Angular output from Magic xpa Web Client.

## A Command Says You Must Open A Folder First

Symptoms:

- you run a Wizly command
- Wizly says that you must open a folder first

Most common causes:

- no project folder is open in VS Code
- you opened only a single file instead of the project folder
- the current window is not the workspace where your generated files live

What to do:

1. Open the project folder in VS Code
2. Make sure this is the folder that contains your Magic and Angular output
3. Run the command again

## Angular Setup Looks Wrong

Symptoms:

- SCSS was generated but styling does not behave as expected
- runtime settings exist but are not picked up
- theme bundles were created but theme switching does not work

What to do first:

1. Run `Wizly: Check Angular Setup`
2. Read the report and fix the reported warnings or errors

This is usually faster than guessing whether the problem sits in:

- `angular.json`
- `main.scss`
- generated theme bundles
- `settings/settings.json`
- shared module wiring

## Theme Bundle Was Generated But Not Applied

Important:

- generating a theme bundle only creates the file and adds it to `angular.json`
- it does not automatically become the active theme

Typical fix:

- if you want one fixed theme, load it manually
- if you want runtime theme switching, continue with [Runtime Settings](./Runtime-Settings.md)

Also check:

- the bundle exists in `angular.json`
- the generated bundle uses `inject: false`
- the matching `href` appears in `settings.json` when you use runtime themes

## Material Utility Classes Do Nothing

Examples:

- `mat-bg-primary-400`
- `mat-text-secondary-700`

These classes depend on public Wizly Material theme variables such as `--wizly-mat-primary-400`.

If the class seems to do nothing, usually one of these is true:

- no Wizly Material theme is active
- the utility file was generated but not imported into `main.scss`
- runtime theme switching points to the wrong theme bundle

What to do:

1. Run `Wizly: Check Angular Setup`
2. Confirm that `_mat-color-utilities.scss` is imported in `main.scss`
3. Confirm that a Wizly Material theme bundle is active
4. If you use runtime themes, run `Wizly: Sync Runtime Themes (Angular)`

## Runtime Settings Are Not Loaded

Symptoms:

- theme switching UI is present but nothing changes
- the configured default theme is ignored
- host-based theme selection does not match what you expect

Check these items:

- `settings/settings.json` exists
- `angular.json` copies the `settings` folder to `/settings`
- the theme `href` values in `settings.json` match the generated bundle names
- `defaultTheme` points to one of the configured `href` values
- `themeMode` is valid: `single`, `multi`, or `hostbased`
- `defaultThemePreference` is valid: `light`, `dark`, or `system`

If you use `hostbased`, also check:

- each theme entry has a `host`
- the host matches `window.location.hostname`

## Magic Colors Do Not Show Up

Important background:

- Magic xpa Web Client does not support the normal color property the same way older Magic client types do
- the usual approach is to pass a color number through a custom property
- Angular then reads that custom property and maps it to a class such as `magic-color-7`

What to check:

1. Confirm that `Wizly: Import Magic Color File (SCSS)` was run
2. Confirm that `_magic-color-utilities.scss` is part of your SCSS setup
3. Confirm that your Angular binding produces a class like `magic-color-7`
4. Confirm that the custom property returns the color number you expect

Important nuance:

- in Magic the color is conceptually a number
- in Angular the custom property value may still arrive as a string
- that is fine as long as the final class name becomes `magic-color-7`

Typical binding:

```html
[class]="'magic-color-' + mg.getCustomProperty(controlId, 'ColorNumber', rowId)"
```

## System Colors Look Different Than Expected

Magic color files can contain Windows system colors, not only fixed RGB values.

Examples:

- `FFFFFFF7`
- `FFFFFFFA`

Wizly maps those values to CSS system colors or close fallback values so they remain usable in the browser.

That means:

- the numbering still matches Magic
- the browser result stays usable
- the exact visual result may still differ from the original Windows desktop look

## PWA Does Not Work Locally

This is expected in many local test situations.

Important points:

- service workers mainly behave correctly in production mode
- HTTPS is normally required
- local development can give a misleading result

If PWA behavior looks wrong:

1. build or serve the app in a production-like setup
2. use HTTPS
3. test the installed or cached behavior there

See also [PWA](./PWA.md).

## After Updating Wizly

Use this order:

1. Run `Wizly: Upgrade Assistant`
2. Review `Patch Settings`, `Patch Templates`, and `Patch Rules` if they are relevant
3. Run `Wizly: Check Angular Setup` for Angular projects
4. Test the parts that depend on themes, runtime settings, templates, rules, and Magic colors

See also [Patching](./Patching.md).
