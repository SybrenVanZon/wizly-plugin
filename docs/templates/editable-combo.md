# Editable Combo Template

Magic's base template for editable combo box.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.MyCombo`). | `[magic]` |
| **`rowId`** | The row ID binding (e.g., `row.rowId`), present only in table contexts. | `[rowId]` |
| **`attrVisible`** | Controls visibility. | `[style.visibility]` |
| **`attrTooltip`** | Tooltip text. | `[matTooltip]`, `matTooltip` |
| **`attrRequired`** | Required state (static or dynamic). | `[required]`, `required` |
| **`attrPlaceholder`** | Placeholder text. | `[placeholder]`, `placeholder` |
| **`attrDisabled`** | Disabled state. | `[disabled]`, `disabled` |

## Transformation

### Standard Usage (Form)

**Input (Magic HTML)**
```html
<div>
    <mat-form-field>
        <div>
            <input 
                [matAutocomplete]="auto" 
                [magic]="mgc.MyCombo"
                [style.visibility]="mg.getVisible(mgc.MyCombo)"
            >
            <mat-autocomplete #auto="matAutocomplete">...</mat-autocomplete>
        </div>
    </mat-form-field>
</div>
```

**Output (Angular Material)**
```html
<editable-combo
    [magic]="mgc.MyCombo"
    [formControlName]="mgc.MyCombo"
    [style.visibility]="mg.getVisible(mgc.MyCombo)"
    ...
>
</editable-combo>
<mgError [magic]="mgc.MyCombo"> </mgError>
```

### Table Usage (Row Context)

When a `[rowId]` attribute is detected, the template switches to "Table Row Mode". This mode:
1.  Uses `@if (mg.isRowInRowEditing(row))` to toggle between edit and read-only mode.
2.  Passes `[rowId]` to all relevant elements (`editable-combo`, `mgError`).
3.  Includes `partials/table-readonly.ejs` for the read-only state.

**Output (Angular Material)**
```html
@if (mg.isRowInRowEditing(row)) {
    <editable-combo
        [magic]="mgc.MyCombo"
        [rowId]="row.rowId"
        ...
    >
    </editable-combo>
    <mgError [magic]="mgc.MyCombo" [rowId]="row.rowId"> </mgError>
} @else {
    <!-- Included via partials/table-readonly.ejs -->
    <span ...>
        {{ mg.getValue(mgc.MyCombo, row.rowId) }}
    </span>
}
```
