# Configuration

Wizly has two configuration layers:

- VS Code settings for editor-level behavior.
- `.vswizly/wizly.config.js` for project-level settings you want to keep in version control.

## Recommended Team Setup

1. Run `Wizly: Export Settings`
2. Commit `.vswizly/wizly.config.js`
3. Keep team defaults in that file
4. Keep personal editor choices in VS Code settings

## Good First Settings

- `wizly.autoTransformOnCreate`
- `wizly.autoTransformToast`
- `wizly.smartLabelMatcher.enabled`
- `wizly.typescript.enableAstTransforms`
- `wizly.typescript.autoTransformOnCreate`
- `wizly.typescript.autoTransformComponentsOnCreate`

## Notes

- If no project config exists, Wizly falls back to built-in defaults.
- Exported settings can be compared with later defaults by using `Wizly: Patch Settings`.
- Template overrides live in `.vswizly/templates/`.
- Exported rules live in `.vswizly/wizly.rules.js`.

## Related Pages

- [Getting Started](./Getting-Started.md)
- [Templates](./Templates.md)
- [Rules](./Rules.md)
- [TypeScript](./TypeScript.md)
