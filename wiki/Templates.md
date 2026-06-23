# Templates

Wizly uses EJS templates to generate HTML. Templates are the preferred customization layer when you want different markup without changing the rule logic itself.

## When To Use Templates

- You want different HTML output
- You want to keep the existing match logic
- You want project-specific component markup

## EJS Basics

### `<%= variable %>`

Use this for attributes or plain text.

- Prints the value with HTML escaping
- Useful for safe text and attribute output

### `<%- variable %>`

Use this for HTML content.

- Prints the value without escaping
- Useful for nested transformed content such as `content`

### `<% code %>`

Use this for logic.

- Runs JavaScript without printing output
- Useful for `if`, loops, and local variables

## How To Start

1. Run `Wizly: Export Templates`
2. Edit the files in `.vswizly/templates/`
3. Commit only the templates your project actually overrides

## Template Building Blocks

- [Template Variables](./Template-Variables.md)
- [Template Helper Functions](./Template-Helpers.md)
- [Smart Matcher Capture Groups](./Smart-Matcher-Capture-Groups.md)

## Component Templates

- [Template Page](./Template-Page.md)
- [Template Card](./Template-Card.md)
- [Template Subform](./Template-Subform.md)
- [Template Tab](./Template-Tab.md)
- [Template Label](./Template-Label.md)
- [Template Button](./Template-Button.md)
- [Template Checkbox](./Template-Checkbox.md)
- [Template Radio](./Template-Radio.md)
- [Template Select](./Template-Select.md)
- [Template Editable Combo](./Template-Editable-Combo.md)
- [Template Input Autocomplete](./Template-Input-Autocomplete.md)
- [Template Input Date](./Template-Input-Date.md)
- [Template Input Number](./Template-Input-Number.md)
- [Template Input Text](./Template-Input-Text.md)
- [Template Input Time](./Template-Input-Time.md)
- [Template Table](./Template-Table.md)
- [Template Table Column](./Template-Table-Column.md)

## Utility Templates

- [Template Flex Row](./Template-Flex-Row.md)

## Customizing Templates

- Override built-in templates by placing files with the same name in `.vswizly/templates/`
- Exported templates only affect the files you actually override
- After upgrades, use `Wizly: Patch Templates` to review changes

## Related Commands

- `Wizly: Export Templates`
- `Wizly: Patch Templates`
