# TypeScript Support (Magic)

Wizly can also post-process Magic-generated TypeScript files. This is optional and is designed to reduce noise in generated diffs while keeping behavior unchanged.

## What Gets Processed

TypeScript transforms apply only when `wizly.typescript.enableAstTransforms` is enabled and the file looks like Magic output:

- `magic.gen.lib.module.ts`
- `*.g.ts` (e.g. `component-list.g.ts`, `*.mg.controls.g.ts`)
- `*.component.ts` files that extend `*MagicComponent` / `TaskBaseMagicComponent` (for auto-transform on create)
- Files containing typical Magic patterns (`@NgModule`, `@Component`, `magicProviders`, `*.mg.controls.g`)

## Settings

All TypeScript settings live under `wizly.typescript` in VS Code settings.

### AST Transforms

AST means Abstract Syntax Tree: instead of doing plain text find/replace, Wizly parses the TypeScript into a tree of language nodes (imports, decorators, arrays, class members) and edits those nodes. This is more reliable than regex for TypeScript because it preserves structure and avoids accidental matches inside strings/comments.

- `enableAstTransforms` (default: `false`)
  - Master switch. When disabled, Wizly still formats TS with Prettier, but does not apply AST-based changes.
- `sortImports` (default: `true`)
  - Sort top-level `import ... from "..."` statements and named imports.
- `sortNgModuleImports` (default: `true`)
  - Sort entries inside `@NgModule({ imports: [...] })` alphabetically per comment section (only for `magic.gen.lib.module.ts`).

### Auto Transform (on file creation)

- `autoTransformOnCreate` (default: `false`)
  - Auto-transform new Magic helper/module files (`magic.gen.lib.module.ts`, `*.g.ts`).
- `autoTransformComponentsOnCreate` (default: `false`)
  - Auto-transform new Magic component TS files (`*.component.ts`) when they match Magic patterns.

### Constructor → inject()

- `convertConstructorToInject` (default: `false`)
  - Converts empty constructor DI like:

    ```ts
    constructor(private readonly foo: FooService) {}
    ```

    to:

    ```ts
    private readonly foo: FooService = inject(FooService);
    ```

  - Only applies when the constructor body is empty (safe transform).
  - Requires Angular 14+ (the `inject()` API was introduced in Angular 14).

### Magic Overlay Defaults

Magic overlay components often include repeated static modal flags (e.g. `isResizable`, `isMovable`). Wizly can apply project defaults to these flags so you don’t have to edit every generated file.

- `magicModalDefaults` (default: `{}`)
  - Supported keys:
    - `showTitleBar`
    - `shouldCloseOnBackgroundClick`
    - `isResizable`
    - `isMovable`
  - Behavior:
    - Only applies to classes that `implements MagicModalInterface`
    - Only overwrites fields when they still match Magic defaults (`= true`)
    - Per-field opt-out is supported via `WIZLY:KEEP` comment

Example:

```js
// settings.json
{
  "wizly.typescript.enableAstTransforms": true,
  "wizly.typescript.magicModalDefaults": {
    "showTitleBar": false,
    "shouldCloseOnBackgroundClick": false,
    "isResizable": false,
    "isMovable": false
  }
}
```

Opt-out example:

```ts
private static readonly shouldCloseOnBackgroundClick: boolean = true; // WIZLY:KEEP
```

## Notes

- Prettier does not sort imports by default; that is handled by Wizly’s TypeScript AST transforms.
- Wizly keeps changes scoped to Magic-like generated files to avoid reformatting your whole TypeScript codebase.
