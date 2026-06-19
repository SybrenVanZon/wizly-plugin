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

## Detailed Reference

- [docs/typescript.md](https://github.com/SybrenVanZon/wizly-plugin/blob/main/docs/typescript.md)
