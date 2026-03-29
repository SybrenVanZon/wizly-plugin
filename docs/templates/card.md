# Using the Card Template

The `card.ejs` template transforms `<mat-card>` elements created by Magic Group elements. It provides access to helper functions for working with smart labels and custom matchers.

## Available Variables and Functions

### `getLabel(magic)`

Retrieves the smart-matched label for a card based on its `magic` value. Requires `smartLabelMatcher` to be enabled in settings.

**Returns:** Label text (string) or `null` if no label is found

**Example:**
```ejs
<% const cardLabel = getLabel(magic); %>
<% if (cardLabel) { %>
    <mat-card-title><%= cardLabel %></mat-card-title>
<% } %>
```

### `getCustomMatch(matcherName, magic)`

Retrieves custom smart matcher results (capture groups) for an element. Requires a custom smart matcher to be configured.

**Parameters:**
- `matcherName` (string): The name of the custom matcher
- `magic` (string): The magic value of the element

**Returns:** Object with all named capture groups, or `null` if no match was found

**Example:**
```ejs
<% const customData = getCustomMatch('myCustomMatcher', magic); %>
<% if (customData) { %>
    <div class="custom-header">
        <%= customData.title %>
    </div>
<% } %>
```

---

## Example: Card with Smart Label

### Configuration

Enable smart label matching in your settings:

```json
{
    "smartLabelMatcher": {
        "enabled": true,
        "labelPrefix": "L_",
        "controlPrefix": "V_"
    }
}
```

### Source HTML

```html
<label [magic]="mgc.L_Details">Customer Details</label>
<mat-card [magic]="mgc.V_Details">
    <div>Card content here</div>
</mat-card>
```

### Default Template (card.ejs)

```ejs
<% const cardLabel = getLabel(magic); %>
<mat-card
    [magic]="<%= magic %>"
    <% if (attrVisible) { %>[class.d-none]="<%= attrVisible %> === 'hidden'"<% } %>
    <% if (attrTooltip) { %>[matTooltip]="<%= attrTooltip %>"<% } %>
>
    <% if (cardLabel) { %>
    <mat-card-header>
        <mat-card-title><%= cardLabel %></mat-card-title>
    </mat-card-header>
    <% } %>
    <mat-card-content>
        <%- content %>
    </mat-card-content>
</mat-card>
```

### Output

```html
<mat-card [magic]="mgc.V_Details">
    <mat-card-header>
        <mat-card-title>Customer Details</mat-card-title>
    </mat-card-header>
    <mat-card-content>
        <div>Card content here</div>
    </mat-card-content>
</mat-card>
```

---

## Available Attributes

The following attributes are automatically extracted from the `<mat-card>` opening tag:

| Attribute | Variable | Description |
|---|---|---|
| `[style.visibility]` | `attrVisible` | CSS visibility binding |
| `[matTooltip]` | `attrTooltip` | Tooltip content |
| `[magic]` or `magic` | `magic` | Magic control ID |

---

## See Also

- [Smart Matcher Capture Groups](./smart-matcher-capture-groups.md) for advanced custom matcher examples
- [Helpers Documentation](./helpers.md) for other template utilities
