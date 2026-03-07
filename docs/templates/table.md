# Table Template (`table.ejs`)

Magic's base template for tables (native HTML table with Material directives).

## Available Variables

| Variable | Description |
| :--- | :--- |
| **`attrVisible`** | Controls visibility. |
| **`attrTooltip`** | Tooltip text. |
| **`content`** | The inner HTML of the table (the columns). |

## Row-Level FormGroup
By default, Magic applies the `[formGroup]` binding inside each cell (per column). This template optimizes the structure by moving the binding up to the `<tr mat-row>` element. This ensures that each row has its own form group context, allowing for inline editing within cells without needing extra wrapper `<div>` elements in each cell.

## Transformation

**Input (Magic HTML)**
```html
<div 
    class="example-container mat-elevation-z8 Table37TableContainerProps" 
    [style.visibility]="mg.getVisible(mgc.Table37)" 
    [matTooltip]="mg.getTitle(mgc.Table37)" 
> 
    <mat-table ...> 
        <ng-container [matColumnDef]="mgc.Column38">...</ng-container>
        <ng-container [matColumnDef]="mgc.Column40">...</ng-container>
        ...
        <mat-header-row ...></mat-header-row> 
        <mat-row ...></mat-row> 
    </mat-table> 
    <mat-paginator ...></mat-paginator> 
</div>
```

**Output (Native Table)**
```html
<table 
    mat-table 
    [dataSource]="dataSource" 
    matSort 
    (matSortChange)="tableService.sortData($event)"
    [style.visibility]="mg.getVisible(mgc.Table37)"
    [matTooltip]="mg.getTitle(mgc.Table37)"
>
    
    <!-- Columns are injected here -->
    <ng-container matColumnDef="mgc.Column38">...</ng-container>
    <ng-container matColumnDef="mgc.Column40">...</ng-container>

    <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
    <tr mat-row *matRowDef="let row; columns: displayedColumns;"
        [formGroup]="mg.getFormGroupByRow(row.rowId)"
        [ngClass]="{ 'selected': selection.isSelected(row)}"
        (click)="tableService.selectRow(row.rowId)">
    </tr>
</table>

<mat-paginator 
    [pageSize]="10" 
    [pageSizeOptions]="[5, 10, 20]" 
    (page)="tableService.mgOnPaginateChange($event)"
    [style.visibility]="mg.getVisible(mgc.Table37)"
>
</mat-paginator>
```
