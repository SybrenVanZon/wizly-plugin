# Tab Template (`tab.ejs`)

Magic's base template for tab group.

## Why this template is structured this way

Magic Tab Controls work with an **Items List** (all possible tab pages) and a **Display List** (which tab indexes should be shown at runtime).

The Magic Web Client typically generates a single HTML “source” that already reflects the Display List filtering: tabs that should not be shown are omitted from the rendered `<mat-tab>` headers. However, the tab page content (layers) is still associated with the original tab indexes.

This mismatch can occur even without Wizly. It is a known Magic Web Client issue: when the generated tab headers are already filtered, the remaining tabs get renumbered by the UI, while the tab page content is still tied to the original tab indexes.

When `smartTabMatcher` is enabled, Wizly extracts each `div.tab_content` layer and injects it into the corresponding `<mat-tab>` by index. If some tabs were omitted in the generated tab headers, Angular Material renumbers the remaining tabs, and the header index no longer matches the content index. The result is that tab headers and tab content can become misaligned (content “shifts”).

The fix in the default template is: always generate the full set of possible tabs (based on extracted tab content), and then conditionally render each tab based on a Wizly-controlled “display list”. This preserves a stable tab index ↔ content mapping.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID (e.g., `mgc.Tab14`). | `[magic]` |
| **`attrVisible`** | Controls visibility. | `[style.visibility]` |
| **`attrTooltip`** | Tooltip text. | `[matTooltip]`, `matTooltip` |
| **`tabPageContent`** | Object with tab content per Magic tab group (see [smartTabMatcher](#smarttabmatcher)). | _(extracted by smartTabMatcher)_ |

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
@let Tab14Raw = mg.getCustomProperty(mgc.Tab14, "WizlyActiveTabIndexes") || "";
@let Tab14Wrapped = "," + Tab14Raw + ",";
<mat-tab-group
    [magic]="mgc.Tab14"
    (selectedTabChange)="task.mgOnTabSelectionChanged(mgc.Tab14, $event.index)"
    [selectedIndex]="mg.getTabSelectedIndex(mgc.Tab14)"
>
    @if(!Tab14Raw || Tab14Wrapped.includes("," + 0 + ",")) {
        <mat-tab
            [label]="
                (mg.getItemListValues(mgc.Tab14) || []).length
                    ? mg.getTabpageText(mgc.Tab14, 0)
                    : ''
            "
        >
            <!-- content of tab 0 -->
        </mat-tab>
    }
    @if(!Tab14Raw || Tab14Wrapped.includes("," + 1 + ",")) {
        <mat-tab
            [label]="
                (mg.getItemListValues(mgc.Tab14) || []).length
                    ? mg.getTabpageText(mgc.Tab14, 1)
                    : ''
            "
        >
            <!-- content of tab 1 -->
        </mat-tab>
    }
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
Content is matched 0-based in Wizly's output: the first extracted tab page maps to index `0`, then `1`, etc.

The `div.tab_content` blocks are removed from the HTML before any rules are applied, so the
inner content passes through all transformation rules (label extraction, etc.) as normal.

## `WizlyActiveTabIndexes` (optional)

You can set a custom property on the tab-group: `WizlyActiveTabIndexes`.

- Value: a comma-separated string of indexes starting from `0` (e.g. `1,2`). Treat this as the Wizly equivalent of Magic’s Tab Control “Display List”.
- Behavior:
  - Empty/undefined: all tabs are rendered.
  - Provided: only indexes present in the string are rendered (and only that content is present in the DOM).

The template wraps the string as `"," + raw + ","` so checks like `includes(",1,")` avoid false positives (e.g. `1` should not match inside `10`).

This intentionally does not use Magic’s “Visible Layers List”. The goal is to re-apply the Display List concept at template time, after all possible tabs have been generated, so Angular Material indexes and injected content cannot drift apart.

## Angular version compatibility

The default templates use Angular control flow (`@for`, `@if`, `@let`) and are intended for Angular 17+.

### Fallback template for Angular 16 and below

If you cannot use `@let` yet, you can achieve the same behavior with `*ngIf` (not pretty, but workable). Conceptually it’s identical; you just repeat the `mg.getCustomProperty(...)` call.

```html
<mat-tab-group
    [magic]="mgc.Tab14"
    (selectedTabChange)="task.mgOnTabSelectionChanged(mgc.Tab14, $event.index)"
    [selectedIndex]="mg.getTabSelectedIndex(mgc.Tab14)"
>
    <mat-tab
        *ngIf="
            !mg.getCustomProperty(mgc.Tab14, 'WizlyActiveTabIndexes') ||
            (',' + (mg.getCustomProperty(mgc.Tab14, 'WizlyActiveTabIndexes') || '') + ',').includes(',0,')
        "
        [label]="(mg.getItemListValues(mgc.Tab14) || []).length ? mg.getTabpageText(mgc.Tab14, 0) : ''"
    >
        <!-- content of tab 0 -->
    </mat-tab>
</mat-tab-group>
```
