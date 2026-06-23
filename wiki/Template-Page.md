# Page Template (`page.ejs`)

Magic's base template for page.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID of the page container. | `[magic]` |
| **`content`** | The inner HTML content of the page (all child elements). | _(inner HTML)_ |

## Transformation

**Input (Magic HTML)**
```html
<div novalidate [formGroup]="screenFormGroup">
    <div [magic]="mgc.page_123">
        <!-- Content of the page (inputs, buttons, etc.) -->
        ...
    </div>
</div>
```

**Output (Angular Form)**
```html
<form novalidate [formGroup]="screenFormGroup" [magic]="mgc.page_123">
    <!-- Content of the page (inputs, buttons, etc.) -->
    ...
</form>
```
