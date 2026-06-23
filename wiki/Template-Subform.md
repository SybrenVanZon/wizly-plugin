# Subform Template (`subform.ejs`)

Magic's base template for subform.

## Available Variables

| Variable | Description | Source Attributes Searched |
| :--- | :--- | :--- |
| **`content`** | The full `<magic-subform>` element string captured from the source. | _(inner HTML)_ |

## Transformation

**Input (Magic HTML)**
```html
<mat-card>
    <magic-subform [magic]="mgc.Subform1" ...></magic-subform>
</mat-card>
```

**Output (Cleaned)**
```html
<magic-subform [magic]="mgc.Subform1" ...></magic-subform>
```
*(Just outputs the inner `<magic-subform>` content, removing the wrapping `mat-card`.)*
