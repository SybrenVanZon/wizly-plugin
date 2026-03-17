# Input - Text Template (`input-text.ejs`)

Magic's base template for text input.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.V_ControlName`). | `[magic]` |
| **`rowId`** | The row ID binding (e.g., `row.rowId`), present only in table contexts. | `[rowId]` |
| **`type`** | Input type (`text` or `password`). | `[type]`, `type` |
| **`zoom`** | `'true'` if a zoom button was detected. | sibling zoom `<button>` element |
| **`attrVisible`** | Controls visibility. | `[style.visibility]` |
| **`attrTooltip`** | Tooltip text. | `[matTooltip]`, `matTooltip` |
| **`attrPlaceholder`** | Hint text (rendered as `<mat-hint>`). | `[placeholder]`, `placeholder` |
| **`attrDisabled`** | Disabled state. | `[disabled]`, `disabled` |
| **`required`** | Required attribute. | `required`, `[required]` |
| **`readonly`** | Readonly attribute. | `readonly`, `[readonly]` |

## Transformation

### Standard Usage (Form)

**Input (Magic HTML)**
```html
<div style="display: flex; flex-direction: row"> 
    <label 
        [magic]="mgc.L_ControlName" 
        [style.visibility]="mg.getVisible(mgc.L_ControlName)" 
        ...
    > 
        {{mg.getText(mgc.L_ControlName)}} 
    </label> 
    <div> 
        <mat-form-field 
            [style.visibility]="mg.getVisible(mgc.V_ControlName)" 
            ...
        > 
            <div> 
                <input 
                    matInput 
                    [magic]="mgc.V_ControlName" 
                    [placeholder]="mg.getPlaceholder(mgc.V_ControlName)" 
                    ...
                > 
                <mgError [magic]=mgc.V_ControlName> </mgError> 
            </div> 
        </mat-form-field> 
    </div> 
</div>
```

**Output (Angular Material)**
```html
<div class="d-flex flex-row">
  <span>{{mg.getText(mgc.L_ControlName)}}</span>

  <mat-form-field
    [style.visibility]="mg.getVisible(mgc.V_ControlName)"
    [matTooltip]="mg.getTitle(mgc.V_ControlName)"
  >
    <input
      matInput
      type="text"
      [magic]="mgc.V_ControlName"
      [placeholder]="mg.getPlaceholder(mgc.V_ControlName)"
      [formControlName]="mgc.V_ControlName"
      mgFormat
    />

    <mgError [magic]="mgc.V_ControlName" mgError></mgError>
  </mat-form-field>
</div>
```

### Table Usage (Row Context)

When a `[rowId]` attribute is detected, the template switches to "Table Row Mode". This mode:
1.  Uses `@if (mg.isRowInRowEditing(row))` to toggle between edit and read-only mode.
2.  Passes `[rowId]` to all relevant elements (`input`, `button`, `mgError`).
3.  Includes `partials/table-readonly.ejs` for the read-only state.

**Input (Magic HTML in Table)**
```html
<div [formGroup]="mg.getFormGroupByRow(row.rowId)">
    <div>
        <mat-form-field ...>
             <div>
                 <input 
                     [magic]="mgc.V_Input" 
                     [rowId]="row.rowId" 
                     ...
                 >
                 <mgError [magic]="mgc.V_Input" [rowId]="row.rowId"></mgError>
             </div>
        </mat-form-field>
        <label ... [rowId]="row.rowId">...</label>
    </div>
</div>
```

**Output (Angular Material)**
```html
@if (mg.isRowInRowEditing(row)) {
    <mat-form-field ...>
        <input 
            matInput 
            [magic]="mgc.V_Input" 
            [rowId]="row.rowId"
            [formControlName]="mgc.V_Input"
            mgFormat
        >
        <mgError [magic]="mgc.V_Input" [rowId]="row.rowId" mgError></mgError>
    </mat-form-field>
} @else {
    <!-- Included via partials/table-readonly.ejs -->
    <span ...>
        {{ mg.getValue(mgc.V_Input, row.rowId) }}
    </span>
}
```
