# Label Template (`label.ejs`)

Magic's base template for label.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`magic`** | The Magic ID of the label (not used in default template, but available). | `[magic]` |
| **`content`** | The inner text/HTML of the label. | _(inner HTML)_ |

## Transformation

**Input (Magic HTML)**
```html
<label [magic]="mgc.lbl_Name">
    Name:
</label>
```

**Output (HTML)**
```html
<span>Name:</span>
```
