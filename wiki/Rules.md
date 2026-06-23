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

## Rule Fields

- `name`: descriptive identifier of the rule
- `description`: short human-readable summary
- `regex`: pattern to match, as string or `RegExp`
- `flags`: regex flags when `regex` is a string
- `templateFile`: EJS template used for the replacement
- `active`: whether the rule is enabled
- `filePattern`: file filter such as `*.html` or `*.ts`
- `useBalancedTag`: stack-based opening/closing tag matching for nested elements

## Advanced Notes

- Named capture groups are supported, for example `(?<content>[\\s\\S]*?)`
- Wizly automatically applies `g` and `m` to replace operations
- Keep patterns intentionally narrow to avoid over-matching
- Use `useBalancedTag` when nested elements of the same type must be matched correctly

## How Replace Works

### EOF Marker

For replace operations, Wizly temporarily adds `~~WIZLY_EOF~~` at the end of the document during processing.

This helps match end-of-document structures reliably when Magic output does not end with a normal `</body>` tag.

Example:

```regex
</div>\s*~~WIZLY_EOF~~
```

### Named Groups

Example:

```json
{
  "regex": "<label>(?<content>[\\s\\S]*?)</label>",
  "replacement": "<span>$<content></span>"
}
```

### Regex Flags

- `g`: match all occurrences
- `m`: treat `^` and `$` as line-based anchors

## Export And Maintenance

- Export with `Wizly: Export Advanced Rules`
- Review changes after upgrades with `Wizly: Patch Rules`
