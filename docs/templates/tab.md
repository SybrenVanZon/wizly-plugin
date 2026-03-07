# Tab Template (`tab.ejs`)

Magic's base template for tab group.

## Available Variables

| Variable | Description |
| :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.Tab14`). |
| **`content`** | The original content following the tab group (usually `div`s with `tab_content` class). |
| **`attrVisible`** | Controls visibility. |
| **`attrTooltip`** | Tooltip text. |

## Transformation

**Input (Magic HTML)**
```html
<div>
    <mat-tab-group [magic]="mgc.Tab14" ...>
        ...
    </mat-tab-group>
    <!-- Tab content divs follow here -->
    <div class="tab_content" ...>...</div>
</div>
```

**Output (Angular Material)**
```html
<mat-tab-group
    [magic]="mgc.Tab14"
    (selectedTabChange)="task.mgOnTabSelectionChanged(mgc.Tab14, $event.index)"
    [selectedIndex]="mg.getTabSelectedIndex(mgc.Tab14)"
    [style.visibility]="mg.getVisible(mgc.Tab14)"
>
    @for(o of mg.getItemListValues(mgc.Tab14); track o) {
        <mat-tab [label]="mg.getTabpageText(mgc.Tab14, o.index)">
        </mat-tab>
    }
</mat-tab-group>

<!-- Original content is preserved below -->
<div class="tab_content" ...>
    ...
</div>
<mgError [magic]="mgc.Tab14"> </mgError>
```
