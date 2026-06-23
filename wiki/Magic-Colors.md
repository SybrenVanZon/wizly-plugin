# Magic Colors

If you already maintain a Magic color file, Wizly can import that file into SCSS so you can keep working with the same Magic color numbers inside your Angular project.

## Why This Is Useful

- You can keep the Magic color numbering that your team already knows.
- You do not need to manually copy Magic colors into SCSS.
- You can generate CSS classes such as `magic-color-7` directly from the Magic color file.

## Why This Matters In Magic Web Client

For Magic developers, there is an important difference between older Magic usage and Magic xpa Web Client:

- in Magic xpa Web Client, the normal color property is not supported
- if you convert a program from, for example, Online to Web, you no longer have that direct color setting

What you can do in Web Client is use a custom property instead.

That custom property can return a Magic color number through an expression. In Angular, you can then read that custom property and bind it to a CSS class.

In practice, that value often arrives in Angular as a string. For color classes that is fine, because `'magic-color-' + '7'` still becomes `magic-color-7`.

Typical idea:

```html
[class]="'magic-color-' + mg.getCustomProperty(controlId, 'ColorNumber', rowId)"
```

Or with the full helper signature:

```ts
mg.getCustomProperty(controlId: string, propertyName: string, rowId?: string)
```

This gives you a practical bridge:

- Magic decides which color number belongs to the control
- Angular reads that number through `mg.getCustomProperty(...)`
- the generated `magic-color-*` classes apply the matching text color and optional background color

This means that if you convert a project from Online or RIA to Web Client, you can still keep using the existing Magic color file through this custom property approach.

## Command

- `Wizly: Import Magic Color File (SCSS)`

## What The Command Creates

The command reads a Magic color file and creates:

- `src/scss/vars/_magic-colors.scss`
- `src/scss/base/_magic-color-utilities.scss`

It also adds `@use './base/magic-color-utilities';` to `src/scss/main.scss` when that import is not there yet.

## How Numbering Works

In Magic, the color setting works with a number, not with a color name.

That also matters when a color is driven by an expression:

- the expression returns a color number
- not a color name

When a program is converted to Web Client, the normal color property disappears. If you previously used expressions for colors, those expressions can remain as unused logic unless you expose the result through a custom property instead.

Because Magic itself passes color numbers, Wizly keeps that same numbering model in the generated classes.

Wizly therefore keeps the file order as the class number:

- first row becomes `magic-color-1`
- second row becomes `magic-color-2`
- seventh row becomes `magic-color-7`

## How Color Values Are Interpreted

Wizly handles two common value types from a Magic color file:

- normal color values such as `00FF0080`, which are converted to regular CSS colors like `#ff0080`
- Magic system color values such as `FFFFFFF7`, which are treated as Windows system colors and mapped to CSS system colors or close fallback values

If the first flag column is `1`, Wizly treats the background as transparent and does not generate a `background-color` rule for that class.

## Example Input

```text
Window's Default,FFFFFFF7,FFFFFFFA,6,0
Control's Default,FFFFFFF7,FFFFFFFA,6,0
MDI Frame ,FFFFFFF7,FFFFFFF3,6,0
NewInactiveRowHighlight,FFFFFFEE,FFFFFFF0,6,10000
white_green,00FFFFFF,0000FF00,0,0
ButtonTextRed,00C8C8C8,00C08000,0,0
PurpleTransparent,00FF0080,00FFFFFF,1,0
```

## Example Output

The generated utilities file will contain classes like:

```scss
.magic-color-5 {
  color: magic.$magic-color-5-foreground;
  background-color: magic.$magic-color-5-background;
}

.magic-color-7 {
  color: magic.$magic-color-7-foreground;
}
```

In this example, `magic-color-7` only sets the text color because the Magic row is marked as transparent.

## Using Custom Properties In Angular

If your Magic program stores a color number in a custom property, you can use that number directly in Angular.

For example:

```html
<div [class]="'magic-color-' + mg.getCustomProperty(mgc.SomeControl, 'ColorNumber')">
  ...
</div>
```

This is especially useful because Web Client does not support the normal Magic color property, while a custom property still gives you a clean way to pass the color number from Magic into the Angular front end.

Even though the color itself is a number in Magic, the custom property value can still be returned as a string in Angular. That is not a problem for this approach.

For example, if the custom property returns `"7"`, the binding still becomes:

```html
class="magic-color-7"
```

## Why Use CSS Classes Instead Of Runtime Style Functions

For Wizly, the class-based approach is usually a better fit than reading a color through a JavaScript helper and applying it directly as an inline style.

Why this is usually better:

- Magic itself does not really work with CSS classes or CSS style names, so it is clearer to keep Magic responsible only for the color number
- Angular and SCSS are better at styling through reusable classes and variables
- the final styling stays in CSS, where front-end developers normally expect it
- you can change or extend styling later without changing the Magic expression itself
- the generated classes can apply both text color and background color in one place

So the practical split becomes:

- Magic decides which color number should be used
- Angular reads that value from a custom property
- CSS classes decide how that color should look in the browser

## Notes On System Colors

The first default colors in a Magic color file often point to Magic or Windows system colors instead of fixed RGB values.

Wizly keeps those rows and maps them to CSS-friendly values so the numbering still matches Magic.

That means you do not need to skip the first default colors just because they are not plain hex values.

## Related Pages

- [Convert to SCSS](./Convert-to-SCSS.md)
- [Theme Color Utilities](./Theme-Color-Utilities.md)
- [Angular](./Angular.md)
