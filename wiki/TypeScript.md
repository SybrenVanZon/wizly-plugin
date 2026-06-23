# TypeScript

Wizly can also tidy Magic-generated TypeScript files so generated diffs become smaller and more consistent.

## Main Use Cases

- Sort imports
- Merge duplicate imports
- Sort `@NgModule({ imports: [...] })`
- Apply safe constructor-to-`inject()` conversion
- Keep generated component lists ordered

## Recommended Start

1. Enable `wizly.typescript.enableAstTransforms`
2. Test on a small sample of generated files
3. Enable auto-transform settings only after the output matches your project expectations

## Related Settings

- `wizly.typescript.enableAstTransforms`
- `wizly.typescript.autoTransformOnCreate`
- `wizly.typescript.autoTransformComponentsOnCreate`
- `wizly.typescript.convertConstructorToInject`
- `wizly.typescript.mergeImports`
- `wizly.typescript.sortImports`
- `wizly.typescript.sortNgModuleImports`

## What Gets Processed

- `magic.gen.lib.module.ts`
- `*.g.ts`
- component TypeScript files that extend Magic base components
- files that contain typical Magic Angular patterns such as `@NgModule`, `magicProviders`, or `*.mg.controls.g`

## AST Transforms

AST means Abstract Syntax Tree. Wizly parses the TypeScript structure instead of using plain text replacements, which makes these transforms safer for code structure.

- `enableAstTransforms`: master switch
- `mergeImports`: merges duplicate imports from the same module
- `sortImports`: sorts top-level imports and named imports
- `sortNgModuleImports`: sorts `@NgModule({ imports: [...] })` entries per section

## Auto Transform On File Creation

- `autoTransformOnCreate`: for new helper and module files such as `magic.gen.lib.module.ts` and `*.g.ts`
- `autoTransformComponentsOnCreate`: for new generated component files

## Constructor To `inject()`

`convertConstructorToInject` converts empty constructor dependency injection into `inject()` field initializers.

Example:

```ts
constructor(private readonly foo: FooService) {}
```

becomes:

```ts
private readonly foo: FooService = inject(FooService);
```

This only applies when the constructor body is empty and requires Angular 14+.

## Magic Overlay Defaults

Wizly can apply project defaults to common overlay flags such as:

- `showTitleBar`
- `shouldCloseOnBackgroundClick`
- `isResizable`
- `isMovable`

Behavior:

- Only applies to classes that implement `MagicModalInterface`
- Only overwrites fields that still match the Magic default
- Can be skipped per field with `WIZLY:KEEP`

## Magic Component List Sorting

- `sortMagicGenCmpsHash`: sorts keys inside `magicGenCmpsHash`
- `sortMagicGenComponents`: sorts the `magicGenComponents` array

## Notes

- Prettier does not sort imports by default; Wizly handles that in AST transforms
- Wizly keeps these changes scoped to Magic-like generated files to avoid touching the wider TypeScript codebase
