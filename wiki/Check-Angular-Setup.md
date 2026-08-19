# Check Angular Setup

`Wizly: Check Angular Setup (Report)` opens a read-only report about your Angular workspace. It never changes files. Use it after you have run the setup commands, or whenever something in the theming or Magic setup behaves unexpectedly.

## What The Report Covers

The report is one list of findings with a severity:

- **Error** — something is broken or will break.
- **Warning** — it works today, but it depends on luck or on another package.
- **Info** — context, or a check that could not run.
- **Success** — this part looks correct.

The findings are grouped by theme in the list:

1. Sass and Angular Material availability
2. The Wizly SCSS structure (`src/scss/main.scss` and how it is wired into `angular.json`)
3. Theme bundles, color utilities, and how a theme becomes active
4. Runtime settings (`settings.json`, the settings service, Material form-field defaults)
5. Magic dependency findings (see below)

## Declared Or Only Installed

For `sass` and `@angular/material` the report separates two different things:

- **Declared** — the package is listed in your `package.json`.
- **Installed** — the package exists in `node_modules`, which can also mean it only comes along with something else.

A package that is only installed transitively works right up until the package that pulled it in changes. `sass`, for example, comes along with `@angular-devkit/build-angular`. If you renamed your `.css` files to `.scss` by hand instead of running `Wizly: Convert Angular Project to SCSS`, your build depends on that transitive copy. The report warns about that instead of reporting a false success.

## Magic Dependency Findings

Magic xpa packages pin each other exactly. `@magic-xpa/utils` is an exact peer of `@magic-xpa/gui`, so a mixed set is not a small mismatch — it is a broken install waiting to happen.

Wizly does not check for one specific Magic version. A hardcoded target version would be out of date on the day it ships. Instead the report checks five rules that stay correct for every future Magic release.

### 1. All `@magic-xpa/*` packages on the same version — error

Every `@magic-xpa/*` entry in `dependencies` and `devDependencies` must be on the same version. Wizly lists the entries it found so you can see which one is out of line.

### 2. No `^` or `~` on `@magic-xpa/*` — warning

Pin the exact version. A caret looks harmless but crosses Magic releases that require a different Angular major. See the example below.

### 3. `@magic-xpa/cli` in `devDependencies` only — warning

The CLI is a build-time tool. Magic's own generated `package.json` has listed it twice — with a caret in `dependencies` and an exact pin in `devDependencies`. npm happens to resolve that to the exact dev pin, but another package manager, or removing the dev entry, can give you a different version.

### 4. Imported Magic packages must be declared — warning

Wizly scans your source root for `@magic-xpa/*` imports and compares that with your `package.json`. `utils`, `engine` and `angular-material-core` are the usual ones that are missing: Magic's generated code imports them directly but does not always declare them. They resolve today because another Magic package pulls them in.

### 5. Angular must satisfy what Magic peers on — error

Wizly reads the installed `@magic-xpa/angular` from `node_modules`, takes its `peerDependencies` range for `@angular/core`, and compares it with the `@angular/core` that is actually installed. This is the rule that catches an Angular major jump without Wizly needing to know which Magic versions exist.

## Why Exact Pins Matter

A real example from the npm registry:

| Magic package version | Peers on `@angular/core` |
| --- | --- |
| `4.1200.0` (Magic 4.12.0) | `^19.1.3` |
| `4.1201.0` (Magic 4.12.1) | `^19.1.3` |
| `4.1202.0` (Magic 4.12.2) | `^21.1.4` |

So `4.12.0 -> 4.12.1` is a plain version bump, but `4.12.1 -> 4.12.2` is an Angular 19 to Angular 21 jump.

Now look at what a caret does. `^4.1201.0` installs the newest `4.x` release, which is `4.1202.0`. One `npm install` on a fresh machine, and an Angular 19 project silently pulls in a Magic build that expects Angular 21. Nothing in your own code changed.

With an exact pin, `4.1201.0` stays `4.1201.0`.

## What This Report Does Not Do

- It does not change `package.json`. Every Magic dependency finding is report-only in this version. Writing pins back, moving `@magic-xpa/cli`, and proposing a target Magic version are planned for `Wizly: Upgrade Assistant`.
- It cannot see which Magic Studio version generated your code. The generated files carry no version stamp, so the check only knows what `package.json` and `node_modules` say. Changing `@magic-xpa/*` versions without regenerating from the matching Studio version stays your own risk.
- It cannot check the Angular peer rule without `node_modules`. Run `npm install` first, otherwise that finding reports that it could not run.

## Fixing The Common Findings

```jsonc
{
  "dependencies": {
    "@magic-xpa/angular": "4.1201.0",
    "@magic-xpa/angular-material-core": "4.1201.0",
    "@magic-xpa/engine": "4.1201.0",
    "@magic-xpa/gui": "4.1201.0",
    "@magic-xpa/utils": "4.1201.0"
  },
  "devDependencies": {
    "@magic-xpa/cli": "4.1201.0"
  }
}
```

- One version for the whole scope.
- No `^` and no `~`.
- `@magic-xpa/cli` only under `devDependencies`.
- Every package your code imports is in the list.

After editing `package.json`, run `npm install` and run the report again.

## Related Pages

- [Commands](./Commands.md)
- [Angular](./Angular.md)
- [Convert to SCSS](./Convert-to-SCSS.md)
- [Runtime Settings](./Runtime-Settings.md)
