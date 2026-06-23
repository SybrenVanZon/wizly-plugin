# Using Smart Matcher Capture Groups in Templates

Custom smart matchers can extract elements from your source HTML before transformation begins. The captured data — including named regex capture groups — is available in templates via `getCustomMatch()`.

## How it works

1. The smart matcher runs before template rendering and removes matched elements from the source
2. Results are stored internally, keyed by matcher name and the `magic` value of the matched element
3. In any template, call `getCustomMatch(matcherName, magic)` to retrieve the captured groups for the current element

The return value is an object containing all named capture groups from the regex, or `null` if no match was found for this element.

---

## Example: Zoom button on a combobox

### Source HTML (Magic-generated)

```html
<mat-select [magic]="mgc.V_Combo" [formControlName]="mgc.V_Combo">
    ...
</mat-select>

<button
    mat-raised-button
    color="primary"
    [magic]="mgc.Btn_ComboZoom"
    [disabled]="mg.isDisabled(mgc.Btn_ComboZoom)"
>
    {{mg.getValue(mgc.Btn_ComboZoom)}}
</button>
```

The button belongs to the combobox but sits outside `<mat-form-field>`. The goal is to move it inside as a suffix icon button.

---

### Smart matcher configuration

Add the following to your `customSmartMatchers` in settings:

```json
{
    "name": "smartZoomMatcher",
    "enabled": true,
    "filePattern": "*.html",
    "regex": "/(?<button><button\\b[^>]*?(?:magic|\\[magic\\])=\"(?<magic>mgc\\.[^\"]+)\"[^>]*(?:\\[disabled\\]=\"(?<disabled>[^\"]+)\")?[^>]*>)(?<content>[\\s\\S]*?)<\\/button>/gm",
    "remove": true,
    "matchOn": {
        "matchSuffix": "Zoom",
        "matchPrefix": "Btn_",
        "controlPrefix": ["V_", "P_"]
    }
}
```

> **Note:** The `matchOn` rules ensure the button is only removed when a matching control (e.g. `V_Combo`) is present in the same file. The button's `magic` value must start with `Btn_` and end with `Zoom`.

**Named capture groups:**

| Group | Contains |
|---|---|
| `button` | The full opening `<button ...>` tag |
| `magic` | The magic value of the button, e.g. `mgc.Btn_ComboZoom` |
| `disabled` | The disabled binding expression, e.g. `mg.isDisabled(mgc.Btn_ComboZoom)` — or `undefined` if absent |
| `content` | The inner content of the button element |

---

### Modified `select.ejs`

```ejs
<% const zoomMatch = getCustomMatch('smartZoomMatcher', magic); %>
<% const zoomMagic = zoomMatch?.magic || ''; %>
<% const zoomDisabled = zoomMatch?.disabled || ''; %>

<% if (typeof rowId !== 'undefined' && rowId) { %>
    @if (mg.isRowInRowEditing(row)) {
<% } %>

<mat-form-field
    <% if (attrVisible) { %>[class.d-none]="<%= attrVisible %> === 'hidden'"<% } %>
    <% if (attrTooltip) { %>[matTooltip]="<%= attrTooltip %>"<% } %>
>
    <% if (typeof rowId === 'undefined' || !rowId) { %>
        <% if (getLabel(magic)) { %>
        <mat-label><%= getLabel(magic) %></mat-label>
        <% } %>
    <% } %>
    <mat-select
        [magic]="<%= magic %>"
        <% if (typeof rowId !== 'undefined' && rowId) { %>[rowId]="<%= rowId %>"<% } %>
        [formControlName]="<%= magic %>"
        <% if (attrRequired) { %>[required]="<%= attrRequired %>"<% } %>
        <% if (attrDisabled) { %>[disabled]="<%= attrDisabled %>"<% } %>
    >
        @for (o of mg.getItemListValues(<%= magicFuncParam %>); track o) {
            <mat-option [value]="o.index">
                {{o.displayValue}}
            </mat-option>
        }
    </mat-select>
    <% if (zoomMagic) { %>
    <button
        matSuffix
        mat-icon-button
        [magic]="<%= zoomMagic %>"
        <% if (zoomDisabled) { %>[disabled]="<%= zoomDisabled %>"<% } %>
    >
        <mat-icon><%= zoomIcon %></mat-icon>
    </button>
    <% } %>
    <% if (attrPlaceholder) { %>
    <mat-hint>{{ <%= attrPlaceholder %> }}</mat-hint>
    <% } %>
</mat-form-field>
<%- include('partials/mg-error') %>

<% if (typeof rowId !== 'undefined' && rowId) { %>
    } @else {
        <%- include('partials/table-readonly') %>
    }
<% } %>
```

**What the template does:**

- Calls `getCustomMatch('smartZoomMatcher', magic)` at the top — this looks up whether a zoom button was matched and removed for the current select's control ID
- Extracts `zoomMagic` and `zoomDisabled` from the result as local variables, defaulting to empty string if absent
- Wraps the button block in `<% if (zoomMagic) { %>` so it is only rendered when a matching button was actually found
- The `[disabled]` binding is only added when a disabled expression was captured

---

### Expected output

```html
<mat-form-field>
    <mat-label>Combo</mat-label>
    <mat-select [magic]="mgc.V_Combo" [formControlName]="mgc.V_Combo">
        @for (o of mg.getItemListValues(mgc.V_Combo); track o) {
            <mat-option [value]="o.index">{{o.displayValue}}</mat-option>
        }
    </mat-select>
    <button
        matSuffix
        mat-icon-button
        [magic]="mgc.Btn_ComboZoom"
        [disabled]="mg.isDisabled(mgc.Btn_ComboZoom)"
    >
        <mat-icon>search</mat-icon>
    </button>
</mat-form-field>
```

---

## Pattern summary

```ejs
<%
    // Retrieve all captured groups for this element; null if no match
    const match = getCustomMatch('matcherName', magic);

    // Extract individual groups with a safe fallback
    const myVar = match?.groupName || '';
%>

<% if (myVar) { %>
    <!-- Only rendered when the group was captured and non-empty -->
<% } %>
```

This pattern keeps template variable names under your control and avoids any risk of overwriting built-in variables like `magic`, `content`, or `attrDisabled`.
