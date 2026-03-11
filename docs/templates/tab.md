# Tab Template (`tab.ejs`)

Magic's base template for tab group.

## Available Variables

| Variable | Description |
| :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.Tab14`). |
| **`attrVisible`** | Controls visibility. |
| **`attrTooltip`** | Tooltip text. |
| **`tabPageContent`** | Object with tab content per Magic tab group (see [smartTabMatcher](#smarttabmatcher)). |

## Transformation

**Input (Magic HTML)**
```html
<div>
    <mat-tab-group [magic]="mgc.Tab14" ...>
        <mat-tab *ngFor="let o of mg.getItemListValues(mgc.Tab14)" [label]="mg.getTabpageText(mgc.Tab14, o.index)">
        </mat-tab>
    </mat-tab-group>
    <div class="tab_content" [style.display]="mg.isTabPageLayerSelected(mgc.Tab14, 1) ? 'flex' : 'none'" style="flex-direction: column">
        <!-- content of tab 1 -->
    </div>
    <div class="tab_content" [style.display]="mg.isTabPageLayerSelected(mgc.Tab14, 2) ? 'flex' : 'none'" style="flex-direction: column">
        <!-- content of tab 2 -->
    </div>
</div>
```

**Output without `smartTabMatcher` (default)**
```html
<mat-tab-group
    [magic]="mgc.Tab14"
    (selectedTabChange)="task.mgOnTabSelectionChanged(mgc.Tab14, $event.index)"
    [selectedIndex]="mg.getTabSelectedIndex(mgc.Tab14)"
>
    @for(o of mg.getItemListValues(mgc.Tab14); track o) {
        <mat-tab [label]="mg.getTabpageText(mgc.Tab14, o.index)">
        </mat-tab>
    }
</mat-tab-group>
```

**Output with `smartTabMatcher: true`**
```html
<mat-tab-group
    [magic]="mgc.Tab14"
    (selectedTabChange)="task.mgOnTabSelectionChanged(mgc.Tab14, $event.index)"
    [selectedIndex]="mg.getTabSelectedIndex(mgc.Tab14)"
>
    <mat-tab [label]="mg.getTabpageText(mgc.Tab14, 1)">
        <!-- content of tab 1 -->
    </mat-tab>
    <mat-tab [label]="mg.getTabpageText(mgc.Tab14, 2)">
        <!-- content of tab 2 -->
    </mat-tab>
</mat-tab-group>
```

## `smartTabMatcher`

When enabled in `wizly.config.js`, the transformer extracts each `div.tab_content` block from the HTML
and places its inner content inside the corresponding `mat-tab`. This is required for Angular Material
tab animations to work correctly.

```js
// wizly.config.js
module.exports = {
    smartTabMatcher: true,
    // ...
};
```

The tab index is determined by the `isTabPageLayerSelected(mgc.TabX, N)` binding on the `div.tab_content`.
Content is matched 1-based (Magic convention): tab index 1 maps to the first `mat-tab`, etc.

The `div.tab_content` blocks are removed from the HTML before any rules are applied, so the
inner content passes through all transformation rules (label extraction, etc.) as normal.

> **Note:** When `smartTabMatcher` is active, each `mat-tab` is generated statically (one per tab page).
> The dynamic `@for` loop is only used when no tab content is available.
> If `getItemListValues` conditionally excludes tabs at runtime, those tabs will still appear in the
> generated output — this is a known limitation to address in a future version.
