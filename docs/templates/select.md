# Select Template

Magic's base template for select.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.MySelect`). | `[magic]` |
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
            <mat-select 
                [magic]="mgc.MySelect"
                [style.visibility]="mg.getVisible(mgc.MySelect)"
            >
            </mat-select>
        </div>
    </mat-form-field>
</div>
```

**Output (Angular Material)**
```html
<mat-form-field [style.visibility]="mg.getVisible(mgc.MySelect)">
    <mat-label>Label</mat-label>
    <mat-select
        [magic]="mgc.MySelect"
        [formControlName]="mgc.MySelect"
    >
        @for (o of mg.getItemListValues(mgc.MySelect); track o) {
            <mat-option [value]="o.index">
                {{o.displayValue}}
            </mat-option>
        }
    </mat-select>
</mat-form-field>
<mgError [magic]="mgc.MySelect"> </mgError>
```

### Table Usage (Row Context)

When a `[rowId]` attribute is detected, the template switches to "Table Row Mode". This mode:
1.  Uses `@if (mg.isRowInRowEditing(row))` to toggle between edit and read-only mode.
2.  Passes `[rowId]` to all relevant elements (`mat-select`, `mgError`).
3.  Includes `partials/table-readonly.ejs` for the read-only state.

**Output (Angular Material)**
```html
@if (mg.isRowInRowEditing(row)) {
    <mat-form-field ...>
        <mat-select
            [magic]="mgc.MySelect"
            [rowId]="row.rowId"
            ...
        >
             @for (o of mg.getItemListValues(mgc.MySelect, row.rowId); track o) {
                 ...
             }
        </mat-select>
    </mat-form-field>
    <mgError [magic]="mgc.MySelect" [rowId]="row.rowId"> </mgError>
} @else {
    <!-- Included via partials/table-readonly.ejs -->
    <span ...>
        {{ mg.getValue(mgc.MySelect, row.rowId) }}
    </span>
}
```
