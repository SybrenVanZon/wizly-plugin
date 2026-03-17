# Template Variables

Overview of all variables available in Wizly EJS templates.

## Common Variables

These variables are available in most component templates:

| Variable | Type | Description |
| :--- | :--- | :--- |
| `magic` | `string` | The Magic control name (e.g., `mgc.MyControl`). |
| `rowId` | `string \| undefined` | The row ID binding (e.g., `row.rowId`). Only present in table/row contexts. |
| `magicFuncParam` | `string` | Shorthand for passing to function calls: equals `magic` when no `rowId`, or `magic, rowId` when `rowId` is present. Use instead of the verbose inline EJS conditional. |
| `attrVisible` | `string \| undefined` | Value for `[style.visibility]` binding. |
| `attrTooltip` | `string \| undefined` | Value for `[matTooltip]` binding. |
| `attrDisabled` | `string \| undefined` | Value for `[disabled]` binding. |
| `attrRequired` | `string \| undefined` | Value for `[required]` binding. |
| `attrPlaceholder` | `string \| undefined` | Value for `[placeholder]` or `placeholder` attribute. |

## Input-specific Variables

| Variable | Type | Description | Templates |
| :--- | :--- | :--- | :--- |
| `zoom` | `boolean \| undefined` | Whether a zoom button should be rendered. | input-text, input-number, input-autocomplete |
| `zoomIcon` | `string` | Icon name for the zoom button (e.g., `zoom_in`). | input-text, input-number, input-autocomplete |
| `inputType` | `string` | HTML input type (e.g., `text`, `email`). | input-autocomplete |
| `options` | `string \| undefined` | Options binding for number formatting (e.g., `mgc.MyOptions`). | input-number |

## Content Variables

| Variable | Type | Description | Templates |
| :--- | :--- | :--- | :--- |
| `content` | `string` | Inner HTML content (unescaped via `<%-`). | page, subform, tab, flex-row |

## Helper Functions

| Function | Description |
| :--- | :--- |
| `getLabel(magic)` | Returns the label text for a control. Returns `undefined` if no label is found. |

## Usage Notes

### `magicFuncParam`

Use `<%= magicFuncParam %>` whenever passing `magic` (+ optional `rowId`) to a function call in the template output. This replaces the verbose pattern:

```ejs
<%# Before %>
mg.getItemListValues(<%= magic %><% if (typeof rowId !== 'undefined' && rowId) { %>, <%= rowId %><% } %>)

<%# After %>
mg.getItemListValues(<%= magicFuncParam %>)
```

### `rowId` presence check

For attribute bindings (not function params), the existing inline check is still used:

```ejs
<% if (typeof rowId !== 'undefined' && rowId) { %>[rowId]="<%= rowId %>"<% } %>
```

---

## Per-template Variables

See the individual template docs for the exact set of variables each template uses:

- [Button](templates/button.md)
- [Checkbox](templates/checkbox.md)
- [Editable Combo](templates/editable-combo.md)
- [Input - Autocomplete](templates/input-autocomplete.md)
- [Input - Date](templates/input-date.md)
- [Input - Number](templates/input-number.md)
- [Input - Text](templates/input-text.md)
- [Input - Time](templates/input-time.md)
- [Label](templates/label.md)
- [Page](templates/page.md)
- [Radio](templates/radio.md)
- [Select](templates/select.md)
- [Selection List](templates/selectionlist.md)
- [Subform](templates/subform.md)
- [Tab](templates/tab.md)
- [Table](templates/table.md)
