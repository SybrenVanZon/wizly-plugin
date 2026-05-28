import * as path from 'path';
import * as ts from 'typescript';

export type AngularImportPlacement = 'shared' | 'sharedMaterial' | 'local';

export type AngularImportRequirement = {
    name: string;
    from?: string;
    placement?: AngularImportPlacement;
};

export type AngularModuleTarget = {
    filePath: string;
    className: string;
};

export type AngularSyncSettings = {
    modules?: {
        shared?: AngularModuleTarget;
        sharedMaterial?: AngularModuleTarget;
    };
    magicGenLibModule?: {
        include?: string[];
        exclude?: string[];
    };
};

export function toPosixImportPath(p: string): string {
    return p.replace(/\\/g, '/');
}

export function toRelativeModuleImport(fromDir: string, targetFilePath: string): string {
    const rel = path.relative(fromDir, targetFilePath);
    const noExt = rel.replace(/\.[^.]+$/, '');
    const posix = toPosixImportPath(noExt);
    return posix.startsWith('.') ? posix : `./${posix}`;
}

export function mergeAndDedupeRequirements(reqs: AngularImportRequirement[]): AngularImportRequirement[] {
    const out: AngularImportRequirement[] = [];
    const seen = new Set<string>();
    for (const r of reqs) {
        if (!r || !r.name) { continue; }
        const key = `${r.placement ?? ''}::${r.from ?? ''}::${r.name}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(r);
    }
    return out;
}

export function partitionRequirements(reqs: AngularImportRequirement[]): {
    shared: AngularImportRequirement[];
    sharedMaterial: AngularImportRequirement[];
    local: AngularImportRequirement[];
} {
    const shared: AngularImportRequirement[] = [];
    const sharedMaterial: AngularImportRequirement[] = [];
    const local: AngularImportRequirement[] = [];

    for (const r of reqs) {
        const placement = r.placement ?? 'local';
        if (placement === 'shared') { shared.push(r); }
        else if (placement === 'sharedMaterial') { sharedMaterial.push(r); }
        else { local.push(r); }
    }

    return { shared, sharedMaterial, local };
}

export function getSharedModuleTemplate(opts: {
    sharedClassName: string;
    sharedMaterialClassName: string;
    sharedMaterialImportPath: string;
}): string {
    const { sharedClassName, sharedMaterialClassName, sharedMaterialImportPath } = opts;
    return [
        `import { CommonModule } from "@angular/common";`,
        `import { NgModule } from "@angular/core";`,
        `import { ${sharedMaterialClassName} } from "${sharedMaterialImportPath}";`,
        ``,
        `@NgModule({`,
        `  imports: [CommonModule, ${sharedMaterialClassName}],`,
        `  exports: [CommonModule, ${sharedMaterialClassName}]`,
        `})`,
        `export class ${sharedClassName} {}`,
        ``,
    ].join('\n');
}

export function getSharedMaterialModuleTemplate(opts: {
    className: string;
    materialImports: { name: string; from: string }[];
}): string {
    const { className, materialImports } = opts;
    const imports = materialImports
        .slice()
        .sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));

    const importLines = imports.map(i => `import { ${i.name} } from "${i.from}";`);
    const moduleNames = imports.map(i => i.name);
    const arr = moduleNames.length > 0 ? moduleNames.join(', ') : '';

    return [
        `import { NgModule } from "@angular/core";`,
        ...importLines,
        ``,
        `@NgModule({`,
        `  imports: [${arr}],`,
        `  exports: [${arr}]`,
        `})`,
        `export class ${className} {}`,
        ``,
    ].join('\n');
}

function sortNamedImportSpecifiers(named: ts.NamedImports): ts.NamedImports {
    const elements = [...named.elements];
    elements.sort((a, b) => {
        const aImported = (a.propertyName ?? a.name).text.toLowerCase();
        const bImported = (b.propertyName ?? b.name).text.toLowerCase();
        if (aImported !== bImported) { return aImported.localeCompare(bImported); }
        const aLocal = a.name.text.toLowerCase();
        const bLocal = b.name.text.toLowerCase();
        return aLocal.localeCompare(bLocal);
    });
    return ts.factory.updateNamedImports(named, elements);
}

export function ensureNamedImport(sourceFile: ts.SourceFile, moduleSpecifier: string, importName: string, importPath: string): ts.SourceFile {
    const statements = [...sourceFile.statements];
    const existing = statements.find(s => ts.isImportDeclaration(s)
        && ts.isStringLiteral(s.moduleSpecifier)
        && s.moduleSpecifier.text === moduleSpecifier) as ts.ImportDeclaration | undefined;

    if (existing) {
        const clause = existing.importClause;
        if (!clause) { return sourceFile; }
        const nb = clause.namedBindings;
        if (!nb || !ts.isNamedImports(nb)) { return sourceFile; }
        const has = nb.elements.some(e => e.name.text === importName);
        if (has) { return sourceFile; }
        const newElements = [...nb.elements, ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(importName))];
        const newNamed = sortNamedImportSpecifiers(ts.factory.updateNamedImports(nb, newElements));
        const newClause = ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name, newNamed);
        const newDecl = ts.factory.updateImportDeclaration(existing, existing.modifiers, newClause, existing.moduleSpecifier, existing.attributes);
        const idx = statements.indexOf(existing);
        statements[idx] = newDecl;
        return ts.factory.updateSourceFile(sourceFile, statements);
    }

    const decl = ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(false, undefined, ts.factory.createNamedImports([
            ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(importName))
        ])),
        ts.factory.createStringLiteral(importPath),
        undefined
    );

    return ts.factory.updateSourceFile(sourceFile, [decl, ...statements]);
}

export function ensureNgModuleImports(sourceFile: ts.SourceFile, importNames: string[]): ts.SourceFile {
    return ensureNgModuleArrayProperty(sourceFile, 'imports', importNames);
}

export function removeNgModuleImports(sourceFile: ts.SourceFile, importNames: string[]): ts.SourceFile {
    const remove = new Set(importNames);
    const transformerFactory = (ctx: ts.TransformationContext) => {
        const visit: ts.Visitor = (node) => {
            if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
                const call = node.expression;
                if (ts.isIdentifier(call.expression) && call.expression.text === 'NgModule' && call.arguments.length > 0) {
                    const arg0 = call.arguments[0];
                    if (ts.isObjectLiteralExpression(arg0)) {
                        const newProps = arg0.properties.map(p => {
                            if (!ts.isPropertyAssignment(p)) { return p; }
                            if (!ts.isIdentifier(p.name) || p.name.text !== 'imports') { return p; }
                            if (!ts.isArrayLiteralExpression(p.initializer)) { return p; }
                            const kept = p.initializer.elements.filter(e => !(ts.isIdentifier(e) && remove.has(e.text)));
                            const newArr = ts.factory.updateArrayLiteralExpression(p.initializer, kept);
                            return ts.factory.updatePropertyAssignment(p, p.name, newArr);
                        });
                        const newObj = ts.factory.updateObjectLiteralExpression(arg0, newProps);
                        const newCall = ts.factory.updateCallExpression(call, call.expression, call.typeArguments, [newObj, ...call.arguments.slice(1)]);
                        return ts.factory.updateDecorator(node, newCall);
                    }
                }
            }
            return ts.visitEachChild(node, visit, ctx);
        };
        return (rootNode: ts.SourceFile) => ts.visitNode(rootNode, visit) as ts.SourceFile;
    };
    return ts.transform(sourceFile, [transformerFactory]).transformed[0] as ts.SourceFile;
}

export function ensureNgModuleExports(sourceFile: ts.SourceFile, exportNames: string[]): ts.SourceFile {
    return ensureNgModuleArrayProperty(sourceFile, 'exports', exportNames);
}

export function ensureNgModuleArrayProperty(sourceFile: ts.SourceFile, propertyName: 'imports' | 'exports', names: string[]): ts.SourceFile {
    const wanted = new Set(names);
    const transformerFactory = (ctx: ts.TransformationContext) => {
        const visit: ts.Visitor = (node) => {
            if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
                const call = node.expression;
                if (ts.isIdentifier(call.expression) && call.expression.text === 'NgModule' && call.arguments.length > 0) {
                    const arg0 = call.arguments[0];
                    if (ts.isObjectLiteralExpression(arg0)) {
                        const newProps = arg0.properties.map(p => {
                            if (!ts.isPropertyAssignment(p)) { return p; }
                            if (!ts.isIdentifier(p.name) || p.name.text !== propertyName) { return p; }
                            if (!ts.isArrayLiteralExpression(p.initializer)) { return p; }
                            const els = [...p.initializer.elements];
                            const existingNames = new Set(
                                els
                                    .filter(e => ts.isIdentifier(e))
                                    .map(e => (e as ts.Identifier).text)
                            );
                            const toAdd = Array.from(wanted).filter(n => !existingNames.has(n));
                            if (toAdd.length === 0) { return p; }
                            const newEls = [...els, ...toAdd.map(n => ts.factory.createIdentifier(n))];
                            const newArr = ts.factory.updateArrayLiteralExpression(p.initializer, newEls);
                            return ts.factory.updatePropertyAssignment(p, p.name, newArr);
                        });
                        const newObj = ts.factory.updateObjectLiteralExpression(arg0, newProps);
                        const newCall = ts.factory.updateCallExpression(call, call.expression, call.typeArguments, [newObj, ...call.arguments.slice(1)]);
                        return ts.factory.updateDecorator(node, newCall);
                    }
                }
            }
            return ts.visitEachChild(node, visit, ctx);
        };
        return (rootNode: ts.SourceFile) => ts.visitNode(rootNode, visit) as ts.SourceFile;
    };
    return ts.transform(sourceFile, [transformerFactory]).transformed[0] as ts.SourceFile;
}

export function removeNamedImport(sourceFile: ts.SourceFile, moduleSpecifier: string, importNames: string[]): ts.SourceFile {
    const remove = new Set(importNames);
    const statements: ts.Statement[] = [];

    for (const st of sourceFile.statements) {
        if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== moduleSpecifier) {
            statements.push(st);
            continue;
        }

        const clause = st.importClause;
        if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
            statements.push(st);
            continue;
        }

        const kept = clause.namedBindings.elements.filter(el => !remove.has(el.name.text));
        if (kept.length === 0 && !clause.name) {
            continue;
        }
        const newNamed = ts.factory.updateNamedImports(clause.namedBindings, kept);
        const newClause = ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name, newNamed);
        statements.push(ts.factory.updateImportDeclaration(st, st.modifiers, newClause, st.moduleSpecifier, st.attributes));
    }

    return ts.factory.updateSourceFile(sourceFile, statements);
}
