# Convert to SCSS

This is one of the best early improvements you can make to a Magic-based Angular project.

## What SCSS Is

SCSS is a more structured way of writing styles for the browser. It builds on normal CSS, so the result is still regular CSS, but it gives you extra options to organize larger projects more cleanly.

You do not need to know all SCSS features to benefit from this setup. Teams can still write simple styles, while keeping a better structure for growth over time.

Compared with plain CSS, SCSS gives you some helpful extras such as:

- variables, so you can reuse colors, spacing, and other design choices more consistently
- mixins and functions, so you can avoid repeating the same style logic in many places
- a cleaner way to split styles into smaller files without losing overview

It is also good to know that SCSS is not what the browser finally receives. During the normal build process, SCSS is converted back into regular CSS.

Official site:

- [Sass / SCSS](https://sass-lang.com/)

## What Wizly Does

Run:

- `Wizly: Convert Angular Project to SCSS`

Wizly converts an Angular workspace from CSS to SCSS and prepares a clearer styling structure.

## What You Gain Above the Magic Baseline

Magic gives you generated front-end output, but it does not set up a modern SCSS structure for long-term maintenance.

Wizly adds that extra layer by:

- moving the project toward a single SCSS entry point
- creating a more maintainable folder structure for styles
- preparing the project for themes and better styling organization
- helping deal with `magic-styles.css` when it exists

## What the Command Changes

- Updates the Angular workspace to use SCSS
- Creates `src/scss/`
- Uses `src/scss/main.scss` as the main entry point
- Moves existing global style content into the SCSS structure
- Updates style references where needed

## Magic Styles Handling

If `magic-styles.css` exists next to `index.html`, Wizly can help in two different ways:

- `Delete`: removes `magic-styles.css`, removes the `<link>` tag from `index.html`, and cleans matching entries from `angular.json`
- `Convert`: moves the content into `src/scss/vendors/_magic-styles.scss`, wires it into `src/scss/main.scss`, removes the `<link>` tag, and deletes the original CSS file

## Why This Usually Comes Early

- Styling becomes easier to manage before you start deeper theming work
- Theme generation fits better on top of SCSS than on top of ad hoc CSS files
- It reduces the chance that styling grows in multiple unrelated places
- It makes it easier to reuse only the style parts you need from other packages, instead of including a full CSS library

## Important To Know

- You can still use normal CSS files in this setup if that is easier for the team
- SCSS mainly gives you more structure and flexibility on top of regular CSS
- This setup also makes it easier to cherry-pick only the style parts you need from other packages

## Related Wiki Pages

- [SCSS Structure](./SCSS-Structure.md)
- [CSS Requirements](./CSS-Requirements.md)

## Good Follow-Up Steps

- [PWA](./PWA.md)
- [Themes](./Themes.md)
- [Runtime Settings](./Runtime-Settings.md)
- [Shared Modules](./Shared-Modules.md)
