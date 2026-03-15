# Required CSS

This page documents the CSS that must be present in your project for Wizly-generated templates to render correctly.

## mgError

The `<mgError>` component needs to be displayed as a block-level element so it takes up the full width inside its `<mat-error>` wrapper.

```css
mgError {
  display: inline-block;
}
```

## Flex row (`d-flex flex-row`)

The flex-row template outputs Bootstrap utility classes. Either include Bootstrap in your project, or add the following custom CSS:

```css
.d-flex {
  display: flex;
}

.flex-row {
  flex-direction: row;
}
```

> If you already use Bootstrap, no additional CSS is needed for these classes.
