# Button Template (`button.ejs`)

Magic's base template for buttons.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.V_BtnControlName`). | `[magic]` |
| **`rowId`** | The row ID binding (e.g., `row.rowId`), present only in table contexts. | `[rowId]` |
| **`ngIf`** | Conditional rendering expression. | `*ngIf` |
| **`attrVisible`** | Controls visibility. | `[style.visibility]` |
| **`attrTooltip`** | Tooltip text. | `[matTooltip]`, `matTooltip` |
| **`attrDisabled`** | Disabled state. | `[disabled]`, `disabled` |

## Transformation

**Input (Magic HTML)**
```html
<button 
    mat-raised-button 
    color="primary" 
    [magic]="mgc.V_BtnControlName" 
    [style.visibility]="mg.getVisible(mgc.V_BtnControlName)" 
    [matTooltip]="mg.getTitle(mgc.V_BtnControlName)" 
    [disabled]="mg.isDisabled(mgc.V_BtnControlName )" 
> 
    {{mg.getValue(mgc.V_BtnControlName)}} 
</button>
```

**Output (Angular Material)**
```html
<button 
    mat-raised-button 
    color="primary" 
    [magic]="mgc.V_BtnControlName" 
    [style.visibility]="mg.getVisible(mgc.V_BtnControlName)" 
    [matTooltip]="mg.getTitle(mgc.V_BtnControlName)" 
    [disabled]="mg.isDisabled(mgc.V_BtnControlName )" 
> 
    {{mg.getValue(mgc.V_BtnControlName)}} 
</button>
```
