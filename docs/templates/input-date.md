# Input - Date Template (`input-date.ejs`)

Magic's base template for date input.

## Available Variables

| Variable | Description |
| :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.V_Date`). |
| **`rowId`** | The row ID binding (e.g., `row.rowId`), present only in table contexts. |
| **`attrVisible`** | Controls visibility. |
| **`attrTooltip`** | Tooltip text. |
| **`attrPlaceholder`** | Placeholder text. |
| **`attrDisabled`** | Disabled state. |
| **`attrRequired`** | Extracted static or dynamic required attribute. |

## Transformation

### Standard Usage (Form)

**Input (Magic HTML)**
```html
<div>
    <mat-form-field>
        <input 
            matInput 
            [matDatepicker]="picker" 
            [magic]="mgc.V_Date"
            [style.visibility]="mg.getVisible(mgc.V_Date)"
        >
        <mat-datepicker-toggle matSuffix [for]="picker"></mat-datepicker-toggle>
        <mat-datepicker #picker></mat-datepicker>
    </mat-form-field>
</div>
```

**Output (Angular Material)**
```html
<mat-form-field [style.visibility]="mg.getVisible(mgc.V_Date)">
    <mat-label>Label</mat-label>
    <input 
        matInput 
        [matDatepicker]="picker_V_Date"
        [magic]="mgc.V_Date"
        [formControlName]="mgc.V_Date"
        mgFormat
    >
    <mat-datepicker-toggle matSuffix [for]="picker_V_Date"></mat-datepicker-toggle>
    <mat-datepicker #picker_V_Date></mat-datepicker>
    <mgError [magic]="mgc.V_Date" mgError></mgError>
</mat-form-field>
```

### Table Usage (Row Context)

When a `[rowId]` attribute is detected, the template switches to "Table Row Mode". This mode:
1.  Uses `@if (mg.isRowInRowEditing(row))` to toggle between edit and read-only mode.
2.  Passes `[rowId]` to all relevant elements (`input`, `mgError`).
3.  Includes `partials/table-readonly.ejs` for the read-only state.

**Output (Angular Material)**
```html
@if (mg.isRowInRowEditing(row)) {
    <mat-form-field ...>
        <input 
            matInput 
            [magic]="mgc.V_Date" 
            [rowId]="row.rowId"
            [matDatepicker]="picker_V_Date"
            ...
        >
        <mat-datepicker-toggle matSuffix [for]="picker_V_Date"></mat-datepicker-toggle>
        <mat-datepicker #picker_V_Date></mat-datepicker>
        <mgError [magic]="mgc.V_Date" [rowId]="row.rowId" mgError></mgError>
    </mat-form-field>
} @else {
    <!-- Included via partials/table-readonly.ejs -->
    <span ...>
        {{ mg.getValue(mgc.V_Date, row.rowId) }}
    </span>
}
```
