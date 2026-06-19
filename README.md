<p align="center">
  <img src="images/icon.png" alt="Wizly logo" width="128">
</p>

# Wizly

Wizly is a VS Code extension that post-processes Magic xpa Web Client output. It helps teams standardize generated HTML and TypeScript with shared settings, templates, and advanced rules.

## What It Does

- Transforms generated HTML with configurable regex-based processing
- Supports shared project configuration through `.vswizly/wizly.config.js`
- Can auto-transform new files
- Lets teams export and override templates
- Includes patch commands to review changes after upgrades
- Adds optional TypeScript cleanup for Magic-generated files
- Includes Angular helper commands for SCSS, PWA, theming, runtime settings, and module syncing

## Quick Start

For the recommended setup flow and the order in which to use Wizly commands, see:

- [Getting Started](https://github.com/SybrenVanZon/wizly-plugin/wiki/Getting-Started)

## Documentation

Detailed documentation now lives in the GitHub Wiki:

- Wiki home: [GitHub Wiki](https://github.com/SybrenVanZon/wizly-plugin/wiki)
- First-time setup: [Getting Started](https://github.com/SybrenVanZon/wizly-plugin/wiki/Getting-Started)
- Command overview: [Commands](https://github.com/SybrenVanZon/wizly-plugin/wiki/Commands)
- Configuration: [Configuration](https://github.com/SybrenVanZon/wizly-plugin/wiki/Configuration)
- Angular helpers: [Angular](https://github.com/SybrenVanZon/wizly-plugin/wiki/Angular)
- TypeScript support: [TypeScript](https://github.com/SybrenVanZon/wizly-plugin/wiki/TypeScript)
- Templates: [Templates](https://github.com/SybrenVanZon/wizly-plugin/wiki/Templates)
- Rules: [Rules](https://github.com/SybrenVanZon/wizly-plugin/wiki/Rules)
- Patching: [Patching](https://github.com/SybrenVanZon/wizly-plugin/wiki/Patching)

Repository docs in `docs/` remain available as source/reference documentation.

## Requirements

- VS Code `1.109.0+`

## Development

- `npm ci`
- `npm run check-types`
- `npm run lint`
- `npm test`

## Contributing

Feedback and ideas are welcome via [GitHub Issues](https://github.com/SybrenVanZon/wizly-plugin/issues).

## License

MIT. See `LICENSE`.
