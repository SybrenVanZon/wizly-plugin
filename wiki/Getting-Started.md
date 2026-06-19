# Getting Started

This page lists the recommended first-time setup flow for a team that wants to start using Wizly in a controlled way.

## Recommended Order

### 1. Install Wizly

Install the extension from the Visual Studio Code Marketplace and open the project you want to work on.

### 2. Export Settings

Run:

- `Wizly: Export Settings`

This creates `.vswizly/wizly.config.js` in the workspace so your team can version shared behavior.

### 3. Configure Shared Defaults

Open `.vswizly/wizly.config.js` and decide which project-level features should be enabled first.

Common starting points:

- `smartLabelMatcher.enabled`
- `autoTransformOnCreate`
- `typescript.enableAstTransforms`

Use VS Code settings for editor-level preferences and `.vswizly/wizly.config.js` for team-wide project defaults.

### 4. Transform a Single File First

Run:

- `Wizly: Transform Current File`

Start with one representative generated file so you can validate the output before rolling the setup out more broadly.

### 5. Transform Existing Changed Files

Run:

- `Wizly: Transform All Uncommitted Files`

This is the safest next step when you already have generated files in Git and want to update only the files that are already part of your current change set.

### 6. Export Templates Only If You Need Custom Markup

Run:

- `Wizly: Export Templates`

Do this when the built-in HTML output is close, but not exactly what your project needs.

### 7. Export Advanced Rules Only If You Need Custom Processing

Run:

- `Wizly: Export Advanced Rules`

Only use this when templates and settings are not enough. Rules are powerful, but they are also the most advanced customization layer.

### 8. Use Patch Commands After Upgrades

After updating Wizly, compare your exported files with the latest built-in defaults:

- `Wizly: Patch Settings`
- `Wizly: Patch Templates`
- `Wizly: Patch Rules`

This keeps your project customizations intact while still letting you adopt improvements from newer releases.

## Angular-Specific Order

If you also use the Angular helper commands, this sequence is usually the most practical:

1. `Wizly: Convert Angular Project to SCSS`
2. `Wizly: Convert Angular Project to PWA`
3. `Wizly: Generate PWA Icons & Favicon (from Active Image)`
4. `Wizly: Generate Angular Material Theme (SCSS)` or `Wizly: Generate Theme Bundle (Blank SCSS)`
5. `Wizly: Setup Runtime Settings (Angular)`
6. `Wizly: Sync Runtime Themes (Angular)`
7. `Wizly: Sync Shared Modules (Angular)`

## Next Pages

- [Commands](./Commands.md)
- [Configuration](./Configuration.md)
- [Patching](./Patching.md)
