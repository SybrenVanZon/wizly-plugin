# Templates

Wizly uses EJS templates to generate HTML. Templates are the preferred customization layer when you want different markup without changing the rule logic itself.

## When To Use Templates

- You want different HTML output
- You want to keep the existing match logic
- You want project-specific component markup

## How To Start

1. Run `Wizly: Export Templates`
2. Edit the files in `.vswizly/templates/`
3. Commit only the templates your project actually overrides

## Related Commands

- `Wizly: Export Templates`
- `Wizly: Patch Templates`

## Detailed Reference

The full template reference stays in the repository docs:

- [docs/templates.md](https://github.com/SybrenVanZon/wizly-plugin/blob/main/docs/templates.md)
- [docs/template-variables.md](https://github.com/SybrenVanZon/wizly-plugin/blob/main/docs/template-variables.md)
- [docs/helpers.md](https://github.com/SybrenVanZon/wizly-plugin/blob/main/docs/helpers.md)
