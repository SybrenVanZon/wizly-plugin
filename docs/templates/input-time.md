# Input - Time Template (`input-time.ejs`)

Magic's base template for time input.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.V_Time`). | `[magic]` |
| **`rowId`** | The row ID binding (e.g., `row.rowId`), present only in table contexts. | `[rowId]` |
| **`attrVisible`** | Controls visibility. | `[style.visibility]` |
| **`attrTooltip`** | Tooltip text. | `[matTooltip]`, `matTooltip` |
| **`attrPlaceholder`** | Placeholder text. | `[placeholder]`, `placeholder` |
| **`attrDisabled`** | Disabled state. | `[disabled]`, `disabled` |
| **`attrRequired`** | Required state (static or dynamic). | `[required]`, `required` |

## Transformation

### Standard Usage (Form)

**Input (Magic HTML)**
```html
<div>
    <mat-form-field>
        <input 
            matInput 
            type="time" 
            [magic]="mgc.V_Time"
            [style.visibility]="mg.getVisible(mgc.V_Time)"
        >
    </mat-form-field>
</div>
```

**Output (Angular Material)**
```html
<mat-form-field [style.visibility]="mg.getVisible(mgc.V_Time)">
    <mat-label>Label</mat-label>
    <input 
        matInput 
        [matTimepicker]="picker_V_Time"
        [magic]="mgc.V_Time"
        [formControlName]="mgc.V_Time"
        mgFormat
    >
    <mat-timepicker-toggle matSuffix [for]="picker_V_Time">
        <mat-icon matDatepickerToggleIcon>access_time</mat-icon>
    </mat-timepicker-toggle>
    <mat-timepicker #picker_V_Time></mat-timepicker>
    <mgError [magic]="mgc.V_Time" mgError></mgError>
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
            [magic]="mgc.V_Time" 
            [rowId]="row.rowId"
            [matTimepicker]="picker_V_Time"
            ...
        >
        <mat-timepicker-toggle matSuffix [for]="picker_V_Time">...</mat-timepicker-toggle>
        <mat-timepicker #picker_V_Time></mat-timepicker>
        <mgError [magic]="mgc.V_Time" [rowId]="row.rowId" mgError></mgError>
    </mat-form-field>
} @else {
    <!-- Included via partials/table-readonly.ejs -->
    <span ...>
        {{ mg.getValue(mgc.V_Time, row.rowId) }}
    </span>
}
```
