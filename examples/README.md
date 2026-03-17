# Wizly Examples

This directory shows before/after results based on the test fixtures in [`src/test/fixtures/`](../src/test/fixtures/).

---

## Smart Label Matcher

The `smartLabelMatcher` setting controls whether a `<label>` is matched to its corresponding field based on a shared name prefix (e.g. `L_` / `V_`) and merged into a `<mat-label>` inside the `<mat-form-field>`. The label does not need to be adjacent to the field — matching is purely by prefix.

The input HTML is the same for both cases below — only the setting differs.

### With `smartLabelMatcher` enabled

Label and field are matched by name prefix (`L_` / `V_`) and merged into a single `<mat-form-field>` block.

**Before** ([input-text-smart-label.html](../src/test/fixtures/input/input-text-smart-label.html)):
```html
<div style="display: flex; flex-direction: row">
    <label
        [magic]="mgc.L_ControlName"
        [style.visibility]="mg.getVisible(mgc.L_ControlName)"
        [matTooltip]="mg.getTitle(mgc.L_ControlName)"
        class="lable_overflow"
        [attr.disabled]="mg.isDisabled(mgc.L_ControlName )"
    >
        {{mg.getText(mgc.L_ControlName)}}
    </label>
    <div>
        <mat-form-field
            [style.visibility]="mg.getVisible(mgc.V_ControlName)"
            [matTooltip]="mg.getTitle(mgc.V_ControlName)"
        >
            <div>
                <input
                    matInput
                    [magic]="mgc.V_ControlName"
                    [required]="mg.getMustInput(mgc.V_ControlName)"
                    [type]="mg.getType(mgc.V_ControlName)"
                    [placeholder]="mg.getPlaceholder(mgc.V_ControlName)"
                    [formControlName]="mgc.V_ControlName"
                    mgFormat
                >
                <mgError [magic]=mgc.V_ControlName> </mgError>
            </div>
        </mat-form-field>
    </div>
</div>
```

**After** ([expected/input-text-smart-label.html](../src/test/fixtures/expected/input-text-smart-label.html)):
```html
<div class="d-flex flex-row">
  <mat-form-field
    [class.d-none]="mg.getVisible(mgc.V_ControlName) === 'hidden'"
    [matTooltip]="mg.getTitle(mgc.V_ControlName)"
  >
    <mat-label>{{ mg.getText(mgc.L_ControlName) }}</mat-label>

    <input
      matInput
      type="text"
      [magic]="mgc.V_ControlName"
      [formControlName]="mgc.V_ControlName"
      mgFormat
      [required]="mg.getMustInput(mgc.V_ControlName)"
    />

    <mat-hint>{{ mg.getPlaceholder(mgc.V_ControlName) }}</mat-hint>

    <mat-error>
      <mgError [magic]="mgc.V_ControlName"></mgError>
    </mat-error>
  </mat-form-field>
</div>
```

### Label above the field

Sometimes a label is placed in a separate row above the input rather than next to it. Wizly still matches them by prefix and merges them into the same `<mat-form-field>`.

**Before** ([input-text-label-above.html](../src/test/fixtures/input/input-text-label-above.html)):
```html
<div style="display: flex; flex-direction: row">
    <label
        [magic]="mgc.L_ControlName"
        [style.visibility]="mg.getVisible(mgc.L_ControlName)"
        [matTooltip]="mg.getTitle(mgc.L_ControlName)"
        class="lable_overflow"
        [attr.disabled]="mg.isDisabled(mgc.L_ControlName )"
    >
        {{mg.getText(mgc.L_ControlName)}}
    </label>
</div>
<div style="display: flex; flex-direction: row">
    <div>
        <mat-form-field
            [style.visibility]="mg.getVisible(mgc.V_ControlName)"
            [matTooltip]="mg.getTitle(mgc.V_ControlName)"
        >
            <div>
                <input
                    matInput
                    [magic]="mgc.V_ControlName"
                    [required]="mg.getMustInput(mgc.V_ControlName)"
                    [type]="mg.getType(mgc.V_ControlName)"
                    [placeholder]="mg.getPlaceholder(mgc.V_ControlName)"
                    [formControlName]="mgc.V_ControlName"
                    mgFormat
                >
                <mgError [magic]=mgc.V_ControlName> </mgError>
            </div>
        </mat-form-field>
    </div>
</div>
```

**After** ([expected/input-text-label-above.html](../src/test/fixtures/expected/input-text-label-above.html)):
```html
<div class="d-flex flex-row">
  <mat-form-field
    [class.d-none]="mg.getVisible(mgc.V_ControlName) === 'hidden'"
    [matTooltip]="mg.getTitle(mgc.V_ControlName)"
  >
    <mat-label>{{ mg.getText(mgc.L_ControlName) }}</mat-label>

    <input
      matInput
      type="text"
      [magic]="mgc.V_ControlName"
      [formControlName]="mgc.V_ControlName"
      mgFormat
      [required]="mg.getMustInput(mgc.V_ControlName)"
    />

    <mat-hint>{{ mg.getPlaceholder(mgc.V_ControlName) }}</mat-hint>

    <mat-error>
      <mgError [magic]="mgc.V_ControlName"></mgError>
    </mat-error>
  </mat-form-field>
</div>
```

---

### With `smartLabelMatcher` disabled

When no match is found, the label is rendered as a `<span>` instead of a `<label>`. This is intentional: a `<label>` element should always be associated with an input — using it standalone is semantically incorrect. A `<span>` is the safe fallback when the relationship cannot be determined.

**After** ([expected/input-text-no-label.html](../src/test/fixtures/expected/input-text-no-label.html)):
```html
<div class="d-flex flex-row">
  <span
    [class.d-none]="mg.getVisible(mgc.L_ControlName) === 'hidden'"
    [matTooltip]="mg.getTitle(mgc.L_ControlName)"
  >
    {{ mg.getText(mgc.L_ControlName) }}
  </span>

  <mat-form-field
    [class.d-none]="mg.getVisible(mgc.V_ControlName) === 'hidden'"
    [matTooltip]="mg.getTitle(mgc.V_ControlName)"
  >
    <input
      matInput
      type="text"
      [magic]="mgc.V_ControlName"
      [formControlName]="mgc.V_ControlName"
      mgFormat
      [required]="mg.getMustInput(mgc.V_ControlName)"
    />

    <mat-hint>{{ mg.getPlaceholder(mgc.V_ControlName) }}</mat-hint>

    <mat-error>
      <mgError [magic]="mgc.V_ControlName"></mgError>
    </mat-error>
  </mat-form-field>
</div>
```

---

## Smart Tab Matcher

The `smartTabMatcher` setting inlines tab page content directly inside each `<mat-tab>`. The original Magic xpa output uses separate `tab_content` divs that are shown or hidden via `display` toggling — bypassing Angular Material entirely. By moving the content inside `<mat-tab>`, the built-in Material animation plays when switching tabs and visibility is handled natively by the component.

**Before** ([input/tab-full.html](../src/test/fixtures/input/tab-full.html)):
```html
<div>
    <mat-tab-group
        [magic]="mgc.Tab1"
        (selectedTabChange)="task.mgOnTabSelectionChanged(mgc.Tab1, $event.index)"
        [selectedIndex]="mg.getTabSelectedIndex(mgc.Tab1)"
    >
        <mat-tab
            *ngFor="let o of mg.getItemListValues(mgc.Tab1)"
            [label]="mg.getTabpageText(mgc.Tab1, o.index)"
        >
        </mat-tab>
    </mat-tab-group>
    <div
        class="tab_content"
        [style.display]="mg.isTabPageLayerSelected(mgc.Tab1, 1) ? 'flex' : 'none' "
        style="flex-direction: column"
    >
        <div style="display: flex; flex-direction: row">
            <label [magic]="mgc.Label2" class="lable_overflow">
                {{mg.getText(mgc.Label2)}}
            </label>
        </div>
    </div>
    <div
        class="tab_content"
        [style.display]="mg.isTabPageLayerSelected(mgc.Tab1, 2) ? 'flex' : 'none' "
        style="flex-direction: column"
    >
        <div style="display: flex; flex-direction: row">
            <label [magic]="mgc.Label3" class="lable_overflow">
                {{mg.getText(mgc.Label3)}}
            </label>
        </div>
    </div>
</div>
```

**After** ([expected/tab-full.html](../src/test/fixtures/expected/tab-full.html)):
```html
<mat-tab-group
  [magic]="mgc.Tab1"
  (selectedTabChange)="task.mgOnTabSelectionChanged(mgc.Tab1, $event.index)"
  [selectedIndex]="mg.getTabSelectedIndex(mgc.Tab1)"
>
  <mat-tab [label]="mg.getTabpageText(mgc.Tab1, 0)">
    <div class="d-flex flex-row">
      <span>
        {{ mg.getText(mgc.Label2) }}
      </span>
    </div>
  </mat-tab>

  <mat-tab [label]="mg.getTabpageText(mgc.Tab1, 1)">
    <div class="d-flex flex-row">
      <span>
        {{ mg.getText(mgc.Label3) }}
      </span>
    </div>
  </mat-tab>
</mat-tab-group>
```

---

## Modern Angular Control Flow

Magic xpa generates `*ngFor` and `*ngIf` directives. Wizly converts these to the modern `@for` and `@if` block syntax introduced in Angular 17.

### Select (ngFor → @for)

**Before** ([input/select.html](../src/test/fixtures/input/select.html)):
```html
<div>
    <mat-form-field
        [style.visibility]="mg.getVisible(mgc.V_ControlName)"
        [matTooltip]="mg.getTitle(mgc.V_ControlName)"
    >
        <mat-select
            [magic]="mgc.V_ControlName"
            [formControlName]="mgc.V_ControlName"
            required
        >
            <mat-option
                *ngFor="let o of mg.getItemListValues(mgc.V_ControlName);"
                [value]="o.index"
            >
                {{o.displayValue}}
            </mat-option>
        </mat-select>
    </mat-form-field>
    <mgError [magic]=mgc.V_ControlName> </mgError>
</div>
```

**After** ([expected/select.html](../src/test/fixtures/expected/select.html)):
```html
<mat-form-field
  [class.d-none]="mg.getVisible(mgc.V_ControlName) === 'hidden'"
  [matTooltip]="mg.getTitle(mgc.V_ControlName)"
>
  <mat-select
    [magic]="mgc.V_ControlName"
    [formControlName]="mgc.V_ControlName"
    [required]="true"
  >
    @for (o of mg.getItemListValues(mgc.V_ControlName); track o) {
      <mat-option [value]="o.index">
        {{ o.displayValue }}
      </mat-option>
    }
  </mat-select>
</mat-form-field>
<mat-error>
  <mgError [magic]="mgc.V_ControlName"></mgError>
</mat-error>
```

### Date picker (ngIf → @if)

**Before** ([input/input-text-date.html](../src/test/fixtures/input/input-text-date.html)):
```html
<div>
    <mat-form-field
        [style.visibility]="mg.getVisible(mgc.V_ControlName)"
        [matTooltip]="mg.getTitle(mgc.V_ControlName)"
        [magic]="mgc.V_ControlName"
        [eventsOnly]=true
    >
        <input
            matInput
            [matDatepicker]="V_ControlName"
            [magic]="mgc.V_ControlName"
            [formControlName]="mgc.V_ControlName"
            [style.visibility]="mg.getVisible(mgc.V_ControlName)"
            [placeholder]="mg.getPlaceholder(mgc.V_ControlName)"
            mgFormat
        >
        <mat-datepicker-toggle
            matSuffix
            [for]="V_ControlName"
            *ngIf="!mg.checkIsReadOnly(mgc.V_ControlName)"
        >
        </mat-datepicker-toggle>
        <mat-datepicker #V_ControlName></mat-datepicker>
    </mat-form-field>
</div>
```

**After** ([expected/input-text-date.html](../src/test/fixtures/expected/input-text-date.html)):
```html
<mat-form-field
  [class.d-none]="mg.getVisible(mgc.V_ControlName) === 'hidden'"
  [matTooltip]="mg.getTitle(mgc.V_ControlName)"
>
  <input
    matInput
    [matDatepicker]="picker_V_ControlName"
    [magic]="mgc.V_ControlName"
    [formControlName]="mgc.V_ControlName"
    mgFormat
  />
  @if (!mg.checkIsReadOnly(mgc.V_ControlName)) {
    <mat-datepicker-toggle
      matSuffix
      [for]="picker_V_ControlName"
    ></mat-datepicker-toggle>
  }
  <mat-datepicker #picker_V_ControlName></mat-datepicker>

  <mat-hint>{{ mg.getPlaceholder(mgc.V_ControlName) }}</mat-hint>

  <mat-error>
    <mgError [magic]="mgc.V_ControlName"></mgError>
  </mat-error>
</mat-form-field>
```

---

## Subform

Magic xpa wraps a `<magic-subform>` in a `<mat-card>` and repeats the visibility binding on both elements. Wizly removes the unnecessary wrapper and keeps a single clean element.

**Before** ([input/subform.html](../src/test/fixtures/input/subform.html)):
```html
<mat-card [style.visibility]="mg.getVisible(mgc.Subform13)">
    <magic-subform
        [magic]="mgc.Subform13"
        [style.visibility]="mg.getVisible(mgc.Subform13)"
    >
    </magic-subform>
</mat-card>
```

**After** ([expected/subform.html](../src/test/fixtures/expected/subform.html)):
```html
<magic-subform
  [magic]="mgc.Subform13"
  [class.d-none]="mg.getVisible(mgc.Subform13) === 'hidden'"
></magic-subform>
```
