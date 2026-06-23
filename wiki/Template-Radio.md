# Input Radio Template

Magic's base template for radio group.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.vt_Gender`). | `[magic]` |
| **`rowId`** | The row ID binding (e.g., `row.rowId`), present only in table contexts. | `[rowId]` |
| **`attrVisible`** | Controls visibility. | `[style.visibility]` |
| **`attrTooltip`** | Tooltip text. | `[matTooltip]`, `matTooltip` |
| **`attrRequired`** | Required state (static or dynamic). | `[required]`, `required` |
| **`attrDisabled`** | Disabled state. | `[disabled]`, `disabled` |

## Transformation

### Standard Usage (Form)

**Input (Magic HTML)**
```html
<div>
    <mat-form-field>
        <div>
            <input 
                type="radio"
                [magic]="mgc.vt_Gender"
                [style.visibility]="mg.getVisible(mgc.vt_Gender)"
            >
        </div>
    </mat-form-field>
</div>
```

**Output (Angular Material)**
```html
<mat-radio-group
    [magic]="mgc.vt_Gender"
    [formControlName]="mgc.vt_Gender"
    [style.visibility]="mg.getVisible(mgc.vt_Gender)"
>
    @for (o of mg.getItemListValues(mgc.vt_Gender); track o) {
        <mat-radio-button [value]="o.index">
            {{o.displayValue}}
        </mat-radio-button>
    }
</mat-radio-group>
<mgError [magic]="mgc.vt_Gender"> </mgError>
```

### Table Usage (Row Context)

When a `[rowId]` attribute is detected, the template switches to "Table Row Mode". This mode:
1.  Uses `@if (mg.isRowInRowEditing(row))` to toggle between edit and read-only mode.
2.  Passes `[rowId]` to all relevant elements (`mat-radio-group`, `mgError`).
3.  Includes `partials/table-readonly.ejs` for the read-only state.

**Output (Angular Material)**
```html
@if (mg.isRowInRowEditing(row)) {
    <mat-radio-group
        [magic]="mgc.vt_Gender"
        [rowId]="row.rowId"
        ...
    >
        @for (o of mg.getItemListValues(mgc.vt_Gender, row.rowId); track o) {
            ...
        }
    </mat-radio-group>
    <mgError [magic]="mgc.vt_Gender" [rowId]="row.rowId"> </mgError>
} @else {
    <!-- Included via partials/table-readonly.ejs -->
    <span ...>
        {{ mg.getValue(mgc.vt_Gender, row.rowId) }}
    </span>
}
```
