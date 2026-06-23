# Table Column Template (`table-column.ejs`)

Magic's base template for table columns (native HTML).

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID of the column (e.g., `mgc.Column38`). | `[magic]` |
| **`content`** | The inner content of the cell (inputs, labels, buttons). | _(inner HTML)_ |

## Transformation

**Input (Magic HTML)**
```html
<ng-container [magic]="mgc.Column38" [matColumnDef]="mgc.Column38">
    <mat-header-cell *matHeaderCellDef>
        {{mg.getText(mgc.Column38)}}
    </mat-header-cell>
    <mat-cell *matCellDef="let row" magicMark="magicTableRowContainer">
        <!-- Cell content -->
        <div style="display: flex; flex-direction: row" *ngIf="mg.ifRowCreated(row)">
             <div [formGroup]="mg.getFormGroupByRow(row.rowId)">
                 <input [magic]="mgc.V_Input" ...>
             </div>
        </div>
    </mat-cell>
</ng-container>
```

**Output (Native Column)**
```html
<ng-container matColumnDef="mgc.Column38">
    <th mat-header-cell *matHeaderCellDef> {{mg.getText(mgc.Column38)}} </th>
    <td mat-cell *matCellDef="let row">
        <!-- Cleaned cell content -->
        <input [magic]="mgc.V_Input" ...>
    </td>
</ng-container>
```
