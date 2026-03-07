# Input Checkbox Template

Magic's base template for checkbox.

## Available Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `magic` | The value of the `magic` or `[magic]` attribute. | `mgc.vt_IsActive` |
| **`rowId`** | The row ID binding (e.g., `row.rowId`), present only in table contexts. | `row.rowId` |
| `attrVisible` | The visibility binding (e.g. from `[style.visibility]`). | `mg.getVisible(mgc.vt_IsActive)` |
| `attrTooltip` | The tooltip binding (e.g. from `[matTooltip]`). | `mg.getTitle(mgc.vt_IsActive)` |
| `attrRequired` | The required state (static `true` or dynamic binding). | `true` or `mg.isRequired(...)` |
| `attrDisabled` | The disabled state binding. | `mg.checkIsReadOnly(...)` |

## Transformation

### Standard Usage (Form)

**Input (Magic HTML)**
```html
<div>
    <mat-checkbox 
        [magic]="mgc.V_Checkbox" 
        [style.visibility]="mg.getVisible(mgc.V_Checkbox)" 
        ...
    > 
        {{mg.getText(mgc.V_Checkbox)}} 
    </mat-checkbox>
</div>
```

**Output (Angular Material)**
```html
<mat-checkbox
    [magic]="mgc.V_Checkbox"
    [formControlName]="mgc.V_Checkbox"
    [style.visibility]="mg.getVisible(mgc.V_Checkbox)"
    ...
>
    {{mg.getText(mgc.V_Checkbox)}}
</mat-checkbox>
<mgError [magic]="mgc.V_Checkbox"> </mgError>
```

### Table Usage (Row Context)

When a `[rowId]` attribute is detected, the template switches to "Table Row Mode". This mode:
1.  Uses `@if (mg.isRowInRowEditing(row))` to toggle between edit and read-only mode.
2.  Passes `[rowId]` to all relevant elements (`mat-checkbox`, `mgError`).
3.  Includes `partials/table-readonly.ejs` for the read-only state.

**Output (Angular Material)**
```html
@if (mg.isRowInRowEditing(row)) {
    <mat-checkbox
        [magic]="mgc.V_Checkbox"
        [rowId]="row.rowId"
        ...
    >
        {{mg.getText(mgc.V_Checkbox)}}
    </mat-checkbox>
    <mgError [magic]="mgc.V_Checkbox" [rowId]="row.rowId"> </mgError>
} @else {
    <!-- Included via partials/table-readonly.ejs -->
    <span ...>
        {{ mg.getValue(mgc.V_Checkbox, row.rowId) }}
    </span>
}
```
