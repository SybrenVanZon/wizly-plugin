# Wizly Templates

Wizly uses **EJS (Embedded JavaScript)** for transforming HTML. This allows you to create flexible templates with JavaScript logic (if/else conditions, loops, variable manipulation) to generate clean Angular/Material code.

## EJS Syntax Basics

Understanding the difference between the tags is crucial for generating correct HTML:

### `<%= variable %>` (Escaped Output)
Use this for **attributes** or **plain text**.
*   **What it does:** Prints the value of the variable, but escapes special HTML characters (like `<` becomes `&lt;`).
*   **Why:** Prevents XSS and ensures attributes are valid.
*   **Example:** `id="<%= magic %>"` becomes `id="mgc.vt_1"`

### `<%- variable %>` (Unescaped Output)
Use this for **HTML content** (like nested components).
*   **What it does:** Prints the value exactly as is, without escaping.
*   **Why:** Essential when inserting other HTML blocks (like the content of a form field) into the template.
*   **Example:** `<%- content %>` renders the actual input fields inside your form.

### `<% code %>` (Scriptlet)
Use this for **logic** (JavaScript code).
*   **What it does:** Executes JavaScript code but prints nothing to the output.
*   **Why:** For `if` conditions, `for` loops, or defining variables.
*   **Example:**
    ```ejs
    <% if (isRequired) { %>
        <mat-error>This field is required</mat-error>
    <% } %>
    ```

---

## Available Helper Functions

See [Template Helper Functions](helpers.md) for detailed documentation on `getLabel(magicId)`, `include()`, and other available helpers.

---

## Component Templates
Templates that transform full Magic components/structures:
*   [Page](templates/page.md)
*   [Subform](templates/subform.md)
*   [Tab](templates/tab.md)
*   [Label](templates/label.md)
*   [Button](templates/button.md)
*   [Checkbox](templates/checkbox.md)
*   [Radio](templates/radio.md)
*   [Select](templates/select.md)
*   [Editable Combo](templates/editable-combo.md)
*   [Input - Autocomplete](templates/input-autocomplete.md)
*   [Input - Date](templates/input-date.md)
*   [Input - Number](templates/input-number.md)
*   [Input - Text](templates/input-text.md)
*   [Input - Time](templates/input-time.md)

## Utility Templates
Templates that transform specific attributes or common styles across any element:
*   [Flex Row](templates/flex-row.md)

---

## Customizing Templates
You can override any default template by placing a file with the same name in your workspace's `.vswizly/templates/` directory.

See the specific documentation for each component template in this folder.
