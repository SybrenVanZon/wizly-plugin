# Template Helper Functions

Wizly provides several helper functions that you can use within your EJS templates to perform common string operations on Magic attributes.

These helpers are particularly useful for conditional logic based on control names or other attributes.

## String Helpers

All string helpers automatically handle "Smart Label" prefixes if configured. They will strip the `mgc.` prefix and any configured label prefix before performing the check.

### `startsWith(string, prefix)`

Checks if the string starts with the specified prefix.

**Usage:**
```ejs
<% if (startsWith(magic, 'TA_')) { %>
  <!-- Logic for Text Areas starting with TA_ -->
<% } %>
```

**Example:**
If `magic` is `mgc.V_TA_Description` and Smart Label is configured with `V_` prefix:
1. `mgc.` is removed.
2. `V_` is removed.
3. Check if `TA_Description` starts with `TA_`. -> `true`

### `endsWith(string, suffix)`

Checks if the string ends with the specified suffix.

**Usage:**
```ejs
<% if (endsWith(magic, '_ID')) { %>
  <!-- Logic for ID fields -->
<% } %>
```

### `includes(string, substring)`

Checks if the string contains the specified substring.

**Usage:**
```ejs
<% if (includes(magic, 'Save')) { %>
  <!-- Logic for submit button with save icon -->
<% } %>
```

## Other Helpers

### `getLabel(magic)`

Retrieves the label text associated with the given magic control name, if available.

**Note:** A standalone `<label>` is only removed when a matching control is found (based on `labelPrefix` / `controlPrefix`). If no match is found, the label is kept.

**Usage:**
```ejs
<mat-label><%= getLabel(magic) %></mat-label>
```

### Configuration
You can customize the prefixes in your `.vswizly/wizly.config.js` file. `labelPrefix` can be a string or an array of strings. `controlPrefix` can be a string or an array of strings.

```javascript
module.exports = {
  smartLabelMatcher: {
    enabled: true,
    labelPrefix: ["L_", "LBL_"],
    controlPrefix: ["V_", "P_"]
  }
};
```

### Matching Logic
The matcher strips the prefixes to find the common "base name".

| Control Name (`magic`) | Label (`[magic]`) | Match? | Base Name |
| :--- | :--- | :--- | :--- |
| `mgc.V_FirstName` | `mgc.L_FirstName` | ✅ Yes | `FirstName` |
| `mgc.V_Email` | `mgc.L_EmailAddress` | ❌ No | - |
| `mgc.P_Phone` | `mgc.L_Phone` | ✅ Yes | `Phone` |

## Custom Smart Matchers

Custom smart matchers let you extract additional blocks (like zoom buttons) into a key-value store based on a regex with named capture groups.

### `getCustomMatch(name, magic)`

Returns the stored match record for a given matcher name and `magic` (or `null` if none exists).

**Stored data**
- All named capture groups are stored as strings.
- The regex must include a named group `magic`.

### Configuration (`customSmartMatchers`)

```javascript
module.exports = {
  customSmartMatchers: [
    {
      name: "smartZoomMatcher",
      enabled: false,
      filePattern: "*.html",
      regex: /(?<button><button\b[^>]*?(?:magic|\[magic\])="(?<magic>mgc\.[^"]+)"[^>]*>)(?<content>[\s\S]*?)<\/button>/gm,
      remove: true,
      matchOn: {
        targetPrefix: "Z_",
        controlPrefix: ["V_", "P_"],
        controlSuffix: ""
      }
    }
  ]
};
```

**Notes**
- `targetPrefix` and `targetSuffix` can be combined. If you provide both, both must match.
- By default, the control check is exact. Example: `mgc.V_Combo` does not match `mgc.V_ComboBox`.
- If you want `mgc.V_Combo` to match any control that starts with it (like `mgc.V_ComboBox`), set `controlSuffix: "*"`.

### `getAttribute(regexGroup, attributeName)`

Extracts the value of a specific attribute from a raw attribute string (regex capture group).

**Usage:**
```ejs
<% const min = getAttribute(input, 'style'); %>
<% if (style) { %>
  [style]="<%= style %>"
<% } %>
```

### `include(templateName, data)`

Allows you to include other templates within an EJS template and pass custom variables to them.

*   `templateName`: The name of the template file (e.g., `'custom-card.ejs'`).
*   `data`: (Optional) An object containing your own variables to pass to the included template.

**Usage:**
This is useful for creating reusable components where you want to pass specific data (like titles, icons, or IDs) that isn't automatically available from the Magic context.

**Example:**
In your main template:
```ejs
<!-- Pass custom variables 'title' and 'icon' to the card template -->
<%- include('custom-card.ejs', { title: 'Customer Details', icon: 'person' }) %>
```

In `custom-card.ejs`:
```html
<mat-card>
    <mat-card-header>
        <mat-icon><%= icon %></mat-icon> <!-- Uses the passed 'icon' variable -->
        <mat-card-title><%= title %></mat-card-title> <!-- Uses the passed 'title' variable -->
    </mat-card-header>
    <mat-card-content>
        ...
    </mat-card-content>
</mat-card>
```

The included template will have access to:
1.  **Your Custom Variables**: Any properties you define in the `data` object (e.g., `title`, `icon`).
2.  **Parent Variables**: All standard variables from the parent template (e.g., `magic`, `attrVisible`) are also inherited automatically.
