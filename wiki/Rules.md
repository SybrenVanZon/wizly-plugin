# Rules

Rules are the advanced processing layer in Wizly. They are useful when settings and templates are not enough.

## What Rules Control

- Regex matching
- File targeting
- Replacement templates
- Rule order
- Optional balanced-tag handling for nested structures

## Recommended Usage

1. Start with the built-in defaults
2. Export rules only when you really need custom processing
3. Keep patterns narrow
4. Validate changes on a small set of generated files first

## Important Behavior

- Rules run top to bottom.
- Later rules work on the output of earlier rules.
- Order matters.

## Export And Maintenance

- Export with `Wizly: Export Advanced Rules`
- Review changes after upgrades with `Wizly: Patch Rules`

## Detailed Reference

The full rule reference stays in the repository docs:

- [docs/rules.md](https://github.com/SybrenVanZon/wizly-plugin/blob/main/docs/rules.md)
