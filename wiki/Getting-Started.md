# Getting Started

This page lists a practical first-time setup flow for teams that want to improve a Magic-generated Angular front end step by step, without diving into technical customization too early.

## Recommended Order

### 1. Install Wizly

Install the extension from the Visual Studio Code Marketplace and open the project you want to work on.

### 2. Transform One File First

Start with one representative generated file and run:

- `Wizly: Transform Current File`

This lets you see the baseline value of Wizly before you start changing project-wide settings.

### 3. Move the Angular Project to SCSS

If the project still relies mainly on CSS, SCSS is usually the first structural improvement to make.

Run:

- `Wizly: Convert Angular Project to SCSS`

Why this comes early:

- It gives you a cleaner styling structure than the default Magic setup.
- It creates a more maintainable base for themes and styling conventions.
- It makes it easier to reuse only the style parts you need from other packages, instead of including a full CSS library.
- Other front-end improvements usually become easier after this step.

Important to know:

- You can still use normal CSS files in this setup if that is easier for the team.
- SCSS mainly gives you more structure and flexibility on top of regular CSS.

See [Convert to SCSS](./Convert-to-SCSS.md).

### 4. Add Themes If Branding Matters

If you need customer branding, light/dark mode, or different theme bundles, start with themes after SCSS.

Magic already ships with a standard Material Design theme, so if you want something different from that baseline, this is usually the best route.

Typical commands:

- `Wizly: Generate Angular Material Theme (SCSS)`
- `Wizly: Generate Theme Bundle (Blank SCSS)`

Why this is useful:

- It gives you a cleaner branding story than editing generated output by hand.
- It supports multi-theme setups.
- It prepares the project for runtime switching later on.

See [Themes](./Themes.md).

If you only want one fixed theme without runtime switching, Wizly can now offer to activate the first generated single light/dark theme in `index.html`. If you skip that, you can still activate it later by linking the CSS manually or by using runtime settings with `themeMode: "single"`.

### 5. Add Runtime Settings If Theme Switching Or Per-Environment Settings Matter

If you want the running application to choose themes dynamically, add runtime settings after the theme bundles exist.

Typical commands:

- `Wizly: Setup Runtime Settings (Angular)`
- `Wizly: Sync Runtime Themes (Angular)`

This setup can also scaffold the theme selector and the dark/light/system mode toggle. These are included through the runtime settings command, not through separate commands.

Why this is useful:

- It allows theme switching at runtime.
- It lets you deploy the same source with different themes based on the host or URL.

See [Runtime Settings](./Runtime-Settings.md).

### 6. Verify The Angular Setup

After the SCSS, theme, and runtime flow is in place, run:

- `Wizly: Check Angular Setup`

This gives you a quick report of whether the expected SCSS, theme, and runtime markers look consistent.

### 7. Roll Out to More Files

When the structure looks good, run:

- `Wizly: Transform All Uncommitted Files`

This is a safe way to broaden adoption without immediately touching every generated file in the project.

### 8. Export Settings for Team-Wide Defaults

Only after the functional flow feels right, export the project config:

- `Wizly: Export Settings`

This creates `.vswizly/wizly.config.js` so you can version shared defaults for the team.

Useful starting points:

- `smartLabelMatcher.enabled`
- `autoTransformOnCreate`

### 9. Export Templates Only If You Need Different Markup

Run:

- `Wizly: Export Templates`

Do this when the built-in output is close, but not exactly what your project needs.

### 10. Use Patch Commands After Upgrades

After updating Wizly, compare your exported files with the latest built-in defaults:

- `Wizly: Patch Settings`
- `Wizly: Patch Templates`
- `Wizly: Patch Rules`

This keeps your project customizations intact while still letting you adopt improvements from newer releases.

## Next Pages

- [Convert to SCSS](./Convert-to-SCSS.md)
- [Themes](./Themes.md)
- [Runtime Settings](./Runtime-Settings.md)
- [Theme Color Utilities](./Theme-Color-Utilities.md)
- [Angular](./Angular.md)
