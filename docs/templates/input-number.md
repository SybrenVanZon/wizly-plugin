# Input - Number Template (`input-number.ejs`)

Magic's base template for number input.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.V_ControlName`). | `[magic]` |
| **`rowId`** | The row ID binding (e.g., `row.rowId`), present only in table contexts. | `[rowId]` |
| **`options`** | The options binding string (e.g. `mg.getNumericPicture(...)`). | `[options]`, `options` |
| **`zoom`** | `'true'` if a zoom button was detected. | sibling zoom `<button>` element |
| **`zoomIcon`** | The icon to use for the zoom button (default: `more_horiz`). | zoom button's `mat-icon` content |
| **`currencyMask`** | Always included for this template type. | _(always set)_ |
| **`attrVisible`** | Controls visibility. | `[style.visibility]` |
| **`attrTooltip`** | Tooltip text. | `[matTooltip]`, `matTooltip` |
| **`attrPlaceholder`** | Hint text (rendered as `<mat-hint>`). | `[placeholder]`, `placeholder` |
| **`attrDisabled`** | Disabled state. | `[disabled]`, `disabled` |

## Transformation

### Standard Usage (Form)

**Input (Magic HTML)**
```html
<div>
    <mat-form-field>
        <div>
            <input 
                matInput 
                currencyMask 
                [magic]="mgc.V_ControlName" 
                [options]="{...}"
                [style.visibility]="mg.getVisible(mgc.V_ControlName)"
            >
        </div>
    </mat-form-field>
    <!-- Optional Zoom Button -->
    <button [magic]="mgc.V_ControlName" ...>...</button>
</div>
```

**Output (Angular Material)**
```html
<mat-form-field [style.visibility]="mg.getVisible(mgc.V_ControlName)">
    <mat-label>Label</mat-label>
    <input 
        matInput 
        currencyMask 
        [magic]="mgc.V_ControlName" 
        [formControlName]="mgc.V_ControlName"
        [options]="{...}"
        mgFormat
    >
    
    <!-- Zoom button is transformed into a matSuffix button inside the form field -->
    <button mat-icon-button matSuffix ...>
        <mat-icon>more_horiz</mat-icon>
    </button>

    <mat-hint>Placeholder tekst</mat-hint>

    <mgError [magic]="mgc.V_ControlName" mgError></mgError>
</mat-form-field>
```

### Table Usage (Row Context)

When a `[rowId]` attribute is detected, the template switches to "Table Row Mode". This mode:
1.  Uses `@if (mg.isRowInRowEditing(row))` to toggle between edit and read-only mode.
2.  Passes `[rowId]` to all relevant elements (`input`, `button`, `mgError`).
3.  Includes `partials/table-readonly.ejs` for the read-only state.

**Output (Angular Material)**
```html
@if (mg.isRowInRowEditing(row)) {
    <mat-form-field ...>
        <input 
            matInput 
            currencyMask 
            [magic]="mgc.V_ControlName" 
            [rowId]="row.rowId"
            [formControlName]="mgc.V_ControlName"
            ...
        >
        ...
    </mat-form-field>
} @else {
    <!-- Included via partials/table-readonly.ejs -->
    <span ...>
        {{ mg.getValue(mgc.V_ControlName, row.rowId) }}
    </span>
}
```
