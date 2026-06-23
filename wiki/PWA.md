# PWA

This page is for teams that want the Angular application to behave more like a modern installable web app.

## What Wizly Does

Main commands:

- `Wizly: Convert Angular Project to PWA`
- `Wizly: Generate PWA Icons & Favicon (from Active Image)`

## What You Gain Above the Magic Baseline

Magic generates the application front end, but it does not automatically give you a branded Progressive Web App setup.

Wizly adds that extra layer by:

- enabling Angular PWA support
- helping generate the icon set from one source image
- preparing the app for install-style behavior
- giving you a better starting point for service worker update handling
- making it easier to cache static application files locally

## When This Is Worth Doing

- You want app icons and favicon managed in a structured way
- You want installable web app behavior
- You want a stronger app-like experience in the browser
- You want to improve branding without manual icon work per size
- You want to reduce repeated downloads of static files
- You want to reduce requests to the server
- You want less separate cache setup on the webserver for these static files
- You want users to launch the application from a desktop or start-screen icon

## What the Commands Affect

- PWA support in the Angular project
- Manifest-linked icons
- `favicon.ico`
- Optional service worker update helper

## Why This Can Help Magic Web Client Projects

For Magic Web Client, you normally run `Prepare for Deployment` inside Magic.

That step generates XML files for each web program in `public/assets/cache/`. The Web Client needs these files in addition to the ECF.

When a program changes, the hash in the matching XML file name also changes. Those generated cache files are therefore good candidates to include in the PWA cache strategy.

When these files are cached locally through the PWA setup:

- the app can feel faster after the first cache cycle
- the generated XML files in `public/assets/cache/` no longer need to be downloaded every time
- the browser can reuse cached files locally
- the number of requests to the server can go down
- you rely less on separate cache behavior configured on the webserver

## Recommended Build Order

For Magic Web Client projects, the order matters.

Recommended flow:

1. In Magic xpa, run `Web => Prepare for Deployment`
2. Confirm the generated XML cache files are present in `public/assets/cache/`
3. Build the Angular application after that
4. Publish or serve the production build
5. Test service worker registration, caching and update behavior

This is important because the service worker can only cache files that are actually part of the built and served application.

If you prepare the Magic deployment after the Angular build, the latest XML cache files may not be included in the build output and may therefore be missing from the PWA cache flow.

## Install-Like Experience

With a PWA setup and proper icons, users can install the application more like an app.

That can mean:

- an icon on the desktop
- an icon on the start screen
- a more direct way to launch the application without first opening the browser and typing the URL

## What the PWA Command Does

`Wizly: Convert Angular Project to PWA` runs Angular CLI's PWA setup for the selected Angular application project.

The most common follow-up customization points are:

- `src/assets/icons/`
- `src/manifest.webmanifest`
- `src/index.html`

## Service Worker Update Handling

Wizly can optionally scaffold a small update helper during PWA conversion.

That helper can:

- create `src/app/pwa-update.service.ts`
- try to wire the service into `AppComponent`
- use `MatDialog` when Angular Material is available
- fall back to `confirm()` when it is not

What the popup does:

- it detects when a new version of the app is available
- the new version is downloaded in the background while the current version keeps running
- it shows a message when the new version is ready
- it lets the user choose between reloading now or waiting until later
- if the user confirms, the new version is activated and the app reloads

In practice, this means users can keep working on the current version until the updated files are already available locally.

For some Magic Web Client projects, this can also affect the login flow. If a user logs in before the update check is handled, a forced reload can mean logging in again.

Some teams therefore choose to:

- check for an update very early during app startup
- block or delay the login flow until that first update decision is done
- only continue to the normal Web Client login after the app version is settled

That startup strategy is project-specific and is not something Wizly configures automatically, but it is a useful design choice to consider when Web Client login should happen only once.

## Testing Note

PWA behavior is usually not something you test properly in normal local development mode.

Important to know:

- service worker behavior is meant for production builds
- `localhost` is normally allowed for service worker testing, even though it is not a public HTTPS site
- in practice, you should still test this from a production build served as static files
- HTTPS is still the normal requirement for real deployments and broader PWA scenarios
- local development through a normal dev server can give a misleading picture of caching and update behavior

So the practical rule is:

- use `localhost` for your first production-build PWA tests
- use a real HTTPS deployment when you want to validate more production-like behavior, device installs or final rollout behavior

## Generate Icons and Favicon

`Wizly: Generate PWA Icons & Favicon (from Active Image)` uses one source PNG and generates the icon files defined in the manifest.

Requirements:

- the active editor must be the source PNG
- the workspace must already look like a PWA project
- the source PNG must be at least as large as the biggest icon size in the manifest

## Good Follow-Up Steps

- [Themes](./Themes.md)
- [Runtime Settings](./Runtime-Settings.md)
- [Shared Modules](./Shared-Modules.md)
