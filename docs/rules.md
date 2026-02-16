# Wizly Rules & Rationale

This document expands on the bundled default rules included with Wizly. These rules target common patterns in Magic xpa Web Client output to improve semantic HTML, framework compatibility, and maintainability.

## Notes

- Rules execute in order (top to bottom). Later rules run on the output of earlier rules.
- Regex patterns are kept intentionally narrow to avoid over‑matching.
- Consider adjusting or disabling rules to fit your project conventions.

## Rule Fields

- `name`: descriptive identifier of the rule; appears in logs and messages.
- `description`: short human‑readable summary of what the rule does.
- `regex`: pattern to match. Use a string (with optional `flags`) or a `RegExp` literal. Named groups are supported (e.g., `(?<content>[\s\S]*?)`).
- `flags`: regex flags when `regex` is a string (Wizly applies `g` and `m` by default to all replacements).
- `replacement`: replacement text; supports named group references via `$<groupName>`. Use an empty string to remove matched content.
- `active`: enable or disable the rule (`true`/`false`).
- `replaceAfterBeautify`: set `true` to perform replacement after Prettier formatting; `false` applies before formatting.
- `filePattern`: glob‑like file name filter (e.g., `*.html`, `*.ts`). Supports `*` and `?`, matched case‑insensitively.

## Advanced Fields in Rules

In addition to the essentials shown in the README (`name`, `regex`, `replacement`, `active`, `filePattern`), rules support:

- `description`: human‑readable summary of the rule.
- `flags`: regex flags to apply when `regex` is a string (Wizly also applies `g` and `m` by default).
- `replaceAfterBeautify`: set `true` to perform replacement after Prettier formatting.

## Examples

See `examples/` for concrete before/after samples. The main README also shows a compact illustration.

## How Replace Works

### EOF Marker for Replace Operations

For replace actions, Wizly temporarily adds a `~~WIZLY_EOF~~` marker at the end
of the document during processing. Magic‑generated HTML typically ends with a
closing `</div>` instead of `</body>`, which makes it harder to detect the end
with regex. This marker:

- Enables end‑of‑document detection so regex can match reliably at the end
- Is removed automatically after all operations
- Requires no manual action

Example usage in a pattern (Magic output typically ends with a closing `</div>`):
```regex
</div>\s*~~WIZLY_EOF~~
```

This pattern can reliably match the closing container `</div>` even when it’s at the
very end of the document.

### Named Groups in Regex

Wizly supports named groups in regex patterns for readable and maintainable
replacements:

Syntax:
- Pattern: `(?<groupName>pattern)`
- Replacement: `$<groupName>`

Examples:

Named groups (single line):
```json
{
  "regex": "<label>\\s*(?<content>.*)\\s</label>",
  "replacement": "<span>$<content></span>"
}
```

Named groups (multiline content):
```json
{
  "regex": "<label>(?<content>[\\s\\S]*?)</label>",
  "replacement": "<span>$<content></span>"
}
```

For multiline content, use `[\\s\\S]*?` instead of `.*` to match across line breaks.

### Regex Flags

Wizly automatically applies the following regex flags to all replace operations:

- `g` (global): Matches all occurrences in the text, not just the first one
- `m` (multiline): `^` and `$` match the start/end of each line, not just the entire string

These flags are applied automatically, so you don't need to specify them in your regex patterns.