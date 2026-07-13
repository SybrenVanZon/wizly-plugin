<p align="center">
  <img src="images/wizly-text.png" alt="Wizly" width="320">
</p>

Wizly is a VS Code extension that post-processes Magic xpa Web Client output. It helps teams standardize generated HTML with shared settings, templates, and advanced rules, and adds Angular helper commands for SCSS conversion, theming, and runtime settings.

## What It Does

- Transforms generated HTML with configurable regex-based processing
- Supports shared project configuration through `.vswizly/wizly.config.js`
- Can auto-transform new files
- Lets teams export and override templates
- Includes patch commands to review changes after upgrades
- Includes Angular helper commands for SCSS conversion, Material/blank theme generation, theme color utilities, and runtime settings

## Quick Start

For the recommended setup flow and the order in which to use Wizly commands, see:

- [Getting Started](https://github.com/SybrenVanZon/wizly-plugin/wiki/Getting-Started)

## Documentation

Detailed documentation lives in the GitHub Wiki:

- Wiki home: [GitHub Wiki](https://github.com/SybrenVanZon/wizly-plugin/wiki)
- First-time setup: [Getting Started](https://github.com/SybrenVanZon/wizly-plugin/wiki/Getting-Started)
- Command overview: [Commands](https://github.com/SybrenVanZon/wizly-plugin/wiki/Commands)
- Angular helpers: [Angular](https://github.com/SybrenVanZon/wizly-plugin/wiki/Angular)
- Themes: [Themes](https://github.com/SybrenVanZon/wizly-plugin/wiki/Themes)
- Runtime settings: [Runtime Settings](https://github.com/SybrenVanZon/wizly-plugin/wiki/Runtime-Settings)
- Convert to SCSS: [Convert to SCSS](https://github.com/SybrenVanZon/wizly-plugin/wiki/Convert-to-SCSS)
- Theme color utilities: [Theme Color Utilities](https://github.com/SybrenVanZon/wizly-plugin/wiki/Theme-Color-Utilities)

Repository docs in `docs/` remain available as source/reference documentation for rule fields, templates, and helper functions.

## Requirements

- VS Code `1.109.0+`

## Development

- `npm ci`
- `npm run check-types`
- `npm run lint`
- `npm test`

## Contributing

Feedback and ideas are welcome via [GitHub Issues](https://github.com/SybrenVanZon/wizly-plugin/issues).

## Disclaimer

This extension is not affiliated with or endorsed by Magic xpa or Magic Software Enterprises. All trademarks are the property of their respective owners.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.

## License

MIT. See `LICENSE`.
