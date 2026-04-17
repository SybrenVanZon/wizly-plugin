
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as ejs from 'ejs';
import * as prettier from 'prettier';
import * as ts from 'typescript';
import { CustomSmartMatcher, SmartMatchOn, WizlySettings, getModes, getCachedSettings } from './config';
import { 
    LabelMap, 
    escapeForRegex, 
    resolveCommentStyle, 
    formatDateTime, 
    resolveControlName,
    resolveTemplatePath,
    isHtmlFile,
    matchesFilePattern,
    extractBalancedTag
} from './utils';

export type TabPageContent = Record<string, (string | null)[]>;

type CustomSmartMatchRecord = Record<string, string>;
type CustomSmartMatchesByKey = Record<string, CustomSmartMatchRecord | CustomSmartMatchRecord[]>;
type CustomSmartMatches = Record<string, CustomSmartMatchesByKey>;

function normalizeStringArray(v: string | string[] | undefined, fallback: string[] = []): string[] {
    if (typeof v === 'string') { return [v]; }
    if (Array.isArray(v)) { return v.map(String); }
    return fallback;
}

function parseRegexInput(v: RegExp | string): RegExp | null {
    if (v instanceof RegExp) { return v; }
    if (typeof v !== 'string') { return null; }
    const s = v.trim();
    if (!s) { return null; }
    if (s.startsWith('/') && s.lastIndexOf('/') > 0) {
        const lastSlash = s.lastIndexOf('/');
        const body = s.slice(1, lastSlash);
        const flags = s.slice(lastSlash + 1);
        try {
            return new RegExp(body, flags || 'gm');
        } catch {
            return null;
        }
    }
    try {
        return new RegExp(s, 'gm');
    } catch {
        return null;
    }
}

function normalizeMagicExpression(value: string): string {
    return String(value ?? '').replace(/\s+/g, '');
}

function findMagicBindingsInCompactText(compactText: string, magicPattern: string): string[] {
    const pattern = normalizeMagicExpression(magicPattern);
    const isWildcardSuffix = pattern.endsWith('*');
    const prefix = isWildcardSuffix ? pattern.slice(0, -1) : pattern;

    const out = new Set<string>();
    const re = /(?:\bmagic|\[magic\])=(["'])(?<val>[^"']*)\1/gm;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(compactText)) !== null) {
        const groups: any = (m as any).groups ?? {};
        const val = groups && groups.val ? normalizeMagicExpression(String(groups.val)) : '';
        if (!val) {
            if (m[0].length === 0) { re.lastIndex++; }
            continue;
        }
        if (isWildcardSuffix) {
            if (prefix && val.startsWith(prefix)) {
                out.add(val);
            }
        } else if (val === prefix) {
            out.add(val);
        }
        if (m[0].length === 0) { re.lastIndex++; }
    }
    return Array.from(out);
}

function resolveSmartMatchOn(
    originalMagicRaw: string,
    matchOn: SmartMatchOn | undefined,
    settings: WizlySettings
): { originalMagic: string; targetMatched: boolean; hasTargetRules: boolean; controlCandidates: string[] } {
    const originalMagic = normalizeMagicExpression(originalMagicRaw);

    if (!matchOn) {
        return { originalMagic, targetMatched: true, hasTargetRules: false, controlCandidates: [] };
    }

    const hasMgc = originalMagic.includes('mgc.');
    const after = hasMgc ? (originalMagic.split('mgc.')[1] ?? '') : originalMagic;
    const prefix = hasMgc ? 'mgc.' : '';

    const controlPrefixFallback = settings?.smartLabelMatcher?.controlPrefix ?? ['V_', 'P_'];
    const controlPrefixes = normalizeStringArray(matchOn.controlPrefix ?? (controlPrefixFallback as any), []);
    const controlSuffixes = normalizeStringArray(matchOn.controlSuffix, ['']);

    const buildKeys = (base: string): string[] => {
        const cp = controlPrefixes.length > 0 ? controlPrefixes : [''];
        const cs = controlSuffixes.length > 0 ? controlSuffixes : [''];
        const out: string[] = [];
        for (const p of cp) {
            for (const s of cs) {
                out.push(`${prefix}${p}${base}${s}`);
            }
        }
        return out;
    };

    const targetPrefixes = normalizeStringArray(matchOn.matchPrefix, []);
    const targetSuffixes = normalizeStringArray(matchOn.matchSuffix, []);
    const hasTargetRules = targetPrefixes.length > 0 || targetSuffixes.length > 0;

    if (!hasTargetRules) {
        return { originalMagic, targetMatched: true, hasTargetRules: false, controlCandidates: [] };
    }

    const bases = new Set<string>();

    const prefixesToTry = targetPrefixes.length > 0 ? targetPrefixes : [''];
    const suffixesToTry = targetSuffixes.length > 0 ? targetSuffixes : [''];
    for (const tp of prefixesToTry) {
        for (const ts of suffixesToTry) {
            const p = tp ?? '';
            const s = ts ?? '';
            if (p && !after.startsWith(p)) { continue; }
            if (s && !after.endsWith(s)) { continue; }
            if (after.length < p.length + s.length) { continue; }
            bases.add(after.slice(p.length, after.length - s.length));
        }
    }

    const outCandidates = new Set<string>();
    for (const base of bases) {
        buildKeys(base).forEach(k => outCandidates.add(k));
    }

    return {
        originalMagic,
        targetMatched: bases.size > 0,
        hasTargetRules: true,
        controlCandidates: Array.from(outCandidates)
    };
}

function cleanMagicForCompare(str: string, settings: WizlySettings): string {
    let cleanStr = String(str ?? '');
    const m = settings?.smartLabelMatcher;
    if (m && m.enabled) {
        const labelPrefixes = normalizeStringArray(m.labelPrefix ?? 'L_', ['L_']);
        for (const lp of labelPrefixes) {
            if (!lp) { continue; }
            cleanStr = cleanStr.replace(new RegExp(`^mgc\\.${escapeForRegex(lp)}`), '');
        }
    }
    cleanStr = cleanStr.replace(/^mgc\./, '');
    return cleanStr;
}

function isTypeScriptFile(filePath: string | undefined): boolean {
    if (!filePath) { return false; }
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.ts' || ext === '.tsx';
}

function shouldApplyTypeScriptAstTransforms(text: string, filePath: string | undefined, tsSettings: WizlySettings['typescript'] | undefined): boolean {
    if (!isTypeScriptFile(filePath)) { return false; }
    if (!tsSettings?.enableAstTransforms) { return false; }
    const fileName = filePath ? path.basename(filePath).toLowerCase() : '';
    if (fileName === 'magic.gen.lib.module.ts' || fileName.endsWith('.g.ts')) {
        return true;
    }
    return /@NgModule\s*\(/.test(text)
        || /@Component\s*\(/.test(text)
        || /\bextends\s+TaskBaseMagicComponent\b/.test(text)
        || /\bextends\s+[A-Za-z0-9_]*MagicComponent\b/.test(text)
        || /\bmagicProviders\b/.test(text)
        || /(\.mg\.controls\.g\b)/.test(text)
        || /\bmagicGenComponents\b/.test(text)
        || /\bmagicGenCmpsHash\b/.test(text);
}

function sortImportSpecifiers(node: ts.ImportDeclaration): ts.ImportDeclaration {
    const clause = node.importClause;
    if (!clause) { return node; }
    const named = clause.namedBindings;
    if (!named || !ts.isNamedImports(named)) { return node; }

    const elements = [...named.elements];
    elements.sort((a, b) => {
        const aImported = (a.propertyName ?? a.name).text.toLowerCase();
        const bImported = (b.propertyName ?? b.name).text.toLowerCase();
        if (aImported !== bImported) { return aImported.localeCompare(bImported); }
        const aLocal = a.name.text.toLowerCase();
        const bLocal = b.name.text.toLowerCase();
        return aLocal.localeCompare(bLocal);
    });

    const newNamed = ts.factory.updateNamedImports(named, elements);
    const newClause = ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name, newNamed);
    return ts.factory.updateImportDeclaration(
        node,
        node.modifiers,
        newClause,
        node.moduleSpecifier,
        node.attributes
    );
}

function sortImportsWithTypeScriptAst(text: string, filePath: string | undefined, tsSettings: WizlySettings['typescript'] | undefined): string {
    const sortImports = tsSettings?.sortImports ?? true;
    const fileName = filePath ? path.basename(filePath).toLowerCase() : '';
    const sortNgModuleImports = (tsSettings?.sortNgModuleImports ?? true) && fileName === 'magic.gen.lib.module.ts';
    const convertCtorToInject = tsSettings?.convertConstructorToInject ?? false;
    const magicModalDefaults = tsSettings?.magicModalDefaults;
    const hasMagicModalDefaults = !!magicModalDefaults && typeof magicModalDefaults === 'object' && Object.keys(magicModalDefaults).length > 0;

    if (!sortImports && !sortNgModuleImports && !convertCtorToInject && !hasMagicModalDefaults) { return text; }

    const sourceFile = ts.createSourceFile(filePath ?? 'virtual.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const statements = [...sourceFile.statements];

    const importDecls: ts.ImportDeclaration[] = [];
    const otherStatements: ts.Statement[] = [];
    for (const st of statements) {
        if (ts.isImportDeclaration(st)) {
            importDecls.push(st);
        } else {
            otherStatements.push(st);
        }
    }

    const normalizedImports = sortImports
        ? importDecls.map(sortImportSpecifiers)
        : [...importDecls];

    if (sortImports) {
        const importClauseSortKey = (node: ts.ImportDeclaration): string => {
            const clause = node.importClause;
            if (!clause) { return ''; }
            const parts: string[] = [];
            if (clause.isTypeOnly) { parts.push('type'); }
            if (clause.name) { parts.push(`default:${clause.name.text.toLowerCase()}`); }
            const nb = clause.namedBindings;
            if (nb) {
                if (ts.isNamespaceImport(nb)) {
                    parts.push(`ns:${nb.name.text.toLowerCase()}`);
                } else if (ts.isNamedImports(nb)) {
                    const names = nb.elements
                        .map(el => (el.propertyName ?? el.name).text.toLowerCase())
                        .join(',');
                    parts.push(`named:${names}`);
                }
            }
            return parts.join('|');
        };

        normalizedImports.sort((a, b) => {
            const aSpec = ts.isStringLiteral(a.moduleSpecifier) ? a.moduleSpecifier.text.toLowerCase() : '';
            const bSpec = ts.isStringLiteral(b.moduleSpecifier) ? b.moduleSpecifier.text.toLowerCase() : '';
            if (aSpec !== bSpec) { return aSpec.localeCompare(bSpec); }

            const aHasClause = a.importClause ? 1 : 0;
            const bHasClause = b.importClause ? 1 : 0;
            if (aHasClause !== bHasClause) { return bHasClause - aHasClause; }

            const aKey = importClauseSortKey(a);
            const bKey = importClauseSortKey(b);
            if (aKey !== bKey) { return aKey.localeCompare(bKey); }

            return 0;
        });
    }

    let newSourceFile = ts.factory.updateSourceFile(sourceFile, [...normalizedImports, ...otherStatements]);

    if (sortNgModuleImports) {
        const fullText = sourceFile.getFullText();
        const isImportsPropName = (name: ts.PropertyName): boolean => {
            if (ts.isIdentifier(name)) { return name.text === 'imports'; }
            if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) { return name.text === 'imports'; }
            return false;
        };

        const cloneExpr = <T extends ts.Expression>(expr: T): T => {
            const cloner = (ts.factory as any).cloneNode as ((n: ts.Node) => ts.Node) | undefined;
            if (cloner) {
                return cloner(expr) as T;
            }
            return ts.setTextRange(expr, { pos: -1, end: -1 }) as T;
        };

        const parseLeadingComments = (node: ts.Node): ts.SynthesizedComment[] => {
            const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart()) ?? [];
            if (ranges.length === 0) { return []; }
            return ranges.map(r => {
                const raw = fullText.slice(r.pos, r.end);
                const text = r.kind === ts.SyntaxKind.SingleLineCommentTrivia
                    ? raw.replace(/^\/\//, '')
                    : raw.replace(/^\/\*/, '').replace(/\*\/$/, '');
                return {
                    kind: r.kind,
                    text,
                    hasTrailingNewLine: true
                } as ts.SynthesizedComment;
            });
        };

        const keyPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
        const normalizeKey = (expr: ts.Expression): string => {
            const raw = keyPrinter.printNode(ts.EmitHint.Unspecified, expr, sourceFile);
            return raw.replace(/\s+/g, '').toLowerCase();
        };

        const sortArrayWithCommentSections = (arr: ts.ArrayLiteralExpression): ts.ArrayLiteralExpression => {
            type Segment = { headerComments: ts.SynthesizedComment[]; elements: ts.Expression[] };
            const segments: Segment[] = [];
            let current: Segment = { headerComments: [], elements: [] };

            for (const el of arr.elements) {
                const header = parseLeadingComments(el);
                if (header.length > 0) {
                    if (current.elements.length > 0) {
                        segments.push(current);
                        current = { headerComments: header, elements: [] };
                    } else if (current.headerComments.length === 0) {
                        current.headerComments = header;
                    } else {
                        current.headerComments = [...current.headerComments, ...header];
                    }
                }
                current.elements.push(cloneExpr(el));
            }
            segments.push(current);

            const outElements: ts.Expression[] = [];
            for (const seg of segments) {
                const sorted = [...seg.elements].sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)));
                if (sorted.length > 0 && seg.headerComments.length > 0) {
                    ts.setSyntheticLeadingComments(sorted[0], seg.headerComments);
                }
                outElements.push(...sorted);
            }

            return ts.factory.updateArrayLiteralExpression(arr, outElements);
        };

        const transformerFactory = (ctx: ts.TransformationContext) => {
            const visit: ts.Visitor = (node) => {
                if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
                    const call = node.expression;
                    const callee = call.expression;
                    const isNgModule = ts.isIdentifier(callee) && callee.text === 'NgModule';
                    if (isNgModule && call.arguments.length > 0) {
                        const arg0 = call.arguments[0];
                        if (ts.isObjectLiteralExpression(arg0)) {
                            const newProps = arg0.properties.map(p => {
                                if (!ts.isPropertyAssignment(p) || !isImportsPropName(p.name)) {
                                    return p;
                                }
                                if (!ts.isArrayLiteralExpression(p.initializer)) {
                                    return p;
                                }
                                const newArr = sortArrayWithCommentSections(p.initializer);
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

        const transformed = ts.transform(newSourceFile, [transformerFactory]).transformed[0];
        newSourceFile = transformed as ts.SourceFile;
    }

    if (convertCtorToInject) {
        const fullText = sourceFile.getFullText();
        let didConvertCtor = false;

        const ensureInjectImport = (sf: ts.SourceFile): ts.SourceFile => {
            const updatedStatements = [...sf.statements];
            const existing = updatedStatements.find(st => ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text === '@angular/core') as ts.ImportDeclaration | undefined;
            if (existing) {
                const clause = existing.importClause;
                if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
                    return sf;
                }
                const names = clause.namedBindings.elements.map(e => e.name.text);
                if (names.includes('inject')) {
                    return sf;
                }
                const newElements = [...clause.namedBindings.elements, ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('inject'))];
                const newNamed = ts.factory.updateNamedImports(clause.namedBindings, newElements);
                const newClause = ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name, newNamed);
                const newDecl = ts.factory.updateImportDeclaration(existing, existing.modifiers, newClause, existing.moduleSpecifier, existing.attributes);
                const idx = updatedStatements.indexOf(existing);
                updatedStatements[idx] = newDecl;
                return ts.factory.updateSourceFile(sf, updatedStatements);
            }

            const injectImport = ts.factory.createImportDeclaration(
                undefined,
                ts.factory.createImportClause(false, undefined, ts.factory.createNamedImports([
                    ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('inject'))
                ])),
                ts.factory.createStringLiteral('@angular/core'),
                undefined
            );
            return ts.factory.updateSourceFile(sf, [injectImport, ...updatedStatements]);
        };

        const isEmptyCtorBody = (ctor: ts.ConstructorDeclaration): boolean => {
            if (!ctor.body) { return true; }
            return ctor.body.statements.length === 0;
        };

        const tokenFromTypeNode = (tn: ts.TypeNode | undefined): ts.Expression | null => {
            if (!tn) { return null; }
            if (ts.isTypeReferenceNode(tn)) {
                const tname = tn.typeName;
                if (ts.isIdentifier(tname)) { return ts.factory.createIdentifier(tname.text); }
                if (ts.isQualifiedName(tname)) {
                    const left = tname.left;
                    const right = tname.right;
                    if (ts.isIdentifier(left) && ts.isIdentifier(right)) {
                        return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier(left.text), right.text);
                    }
                }
            }
            return null;
        };

        const getParamAccessModifiers = (mods: readonly ts.ModifierLike[] | undefined): ts.Modifier[] => {
            if (!mods) { return []; }
            return mods
                .filter(m =>
                    m.kind === ts.SyntaxKind.PrivateKeyword
                    || m.kind === ts.SyntaxKind.ProtectedKeyword
                    || m.kind === ts.SyntaxKind.PublicKeyword
                    || m.kind === ts.SyntaxKind.ReadonlyKeyword
                )
                .map(m => m as ts.Modifier);
        };

        const ctorTransformerFactory = (ctx: ts.TransformationContext) => {
            const visit: ts.Visitor = (node) => {
                if (!ts.isClassDeclaration(node) || !node.members) {
                    return ts.visitEachChild(node, visit, ctx);
                }

                const ctor = node.members.find(m => ts.isConstructorDeclaration(m)) as ts.ConstructorDeclaration | undefined;
                if (!ctor) { return node; }
                if (!isEmptyCtorBody(ctor)) { return node; }

                const injectableParams = ctor.parameters
                    .filter(p => (p.modifiers?.some(m =>
                        m.kind === ts.SyntaxKind.PrivateKeyword
                        || m.kind === ts.SyntaxKind.ProtectedKeyword
                        || m.kind === ts.SyntaxKind.PublicKeyword
                    ) ?? false))
                    .filter(p => !p.questionToken && !p.initializer)
                    .filter(p => ts.isIdentifier(p.name))
                    .map(p => {
                        const name = (p.name as ts.Identifier).text;
                        const token = tokenFromTypeNode(p.type);
                        if (!token) { return null; }
                        const modifiers = getParamAccessModifiers(p.modifiers);
                        const initializer = ts.factory.createCallExpression(
                            ts.factory.createIdentifier('inject'),
                            undefined,
                            [token]
                        );
                        const prop = ts.factory.createPropertyDeclaration(
                            modifiers.length > 0 ? modifiers : undefined,
                            name,
                            undefined,
                            p.type,
                            initializer
                        );
                        const leading = ts.getLeadingCommentRanges(fullText, p.getFullStart()) ?? [];
                        if (leading.length > 0) {
                            const first = leading[0];
                            const raw = fullText.slice(first.pos, first.end);
                            const text = raw.replace(/^\/\//, '').replace(/^\/\*/, '').replace(/\*\/$/, '');
                            ts.setSyntheticLeadingComments(prop, [{
                                kind: first.kind,
                                text,
                                hasTrailingNewLine: true
                            } as ts.SynthesizedComment]);
                        }
                        return prop;
                    })
                    .filter((p): p is ts.PropertyDeclaration => !!p);

                if (injectableParams.length === 0) { return node; }
                didConvertCtor = true;

                const newMembers: ts.ClassElement[] = [];
                for (const m of node.members) {
                    if (ts.isConstructorDeclaration(m)) {
                        continue;
                    }
                    newMembers.push(m);
                }

                const insertIndex = newMembers.findIndex(m => ts.isPropertyDeclaration(m) || ts.isMethodDeclaration(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m));
                if (insertIndex === -1) {
                    newMembers.push(...injectableParams);
                } else {
                    newMembers.splice(insertIndex, 0, ...injectableParams);
                }

                return ts.factory.updateClassDeclaration(
                    node,
                    node.modifiers,
                    node.name,
                    node.typeParameters,
                    node.heritageClauses,
                    newMembers
                );
            };
            return (rootNode: ts.SourceFile) => ts.visitNode(rootNode, visit) as ts.SourceFile;
        };

        const transformed = ts.transform(newSourceFile, [ctorTransformerFactory]).transformed[0] as ts.SourceFile;
        newSourceFile = didConvertCtor ? ensureInjectImport(transformed) : transformed;
    }

    if (hasMagicModalDefaults) {
        const fullText = sourceFile.getFullText();
        const keepMarker = 'WIZLY:KEEP';

        const hasKeepComment = (node: ts.Node): boolean => {
            const ranges = [
                ...(ts.getLeadingCommentRanges(fullText, node.getFullStart()) ?? []),
                ...(ts.getTrailingCommentRanges(fullText, node.getEnd()) ?? []),
            ];
            for (const r of ranges) {
                const raw = fullText.slice(r.pos, r.end);
                if (raw.includes(keepMarker)) { return true; }
            }
            return false;
        };

        const isTargetModalProp = (nameText: string): boolean => {
            return nameText === 'showTitleBar'
                || nameText === 'shouldCloseOnBackgroundClick'
                || nameText === 'isResizable'
                || nameText === 'isMovable';
        };

        const desiredBool = (nameText: string): boolean | undefined => {
            if (!magicModalDefaults) { return undefined; }
            const v = (magicModalDefaults as any)[nameText];
            return typeof v === 'boolean' ? v : undefined;
        };

        const modalTransformerFactory = (ctx: ts.TransformationContext) => {
            const visit: ts.Visitor = (node) => {
                if (!ts.isClassDeclaration(node)) {
                    return ts.visitEachChild(node, visit, ctx);
                }

                const implementsMagicModal = (node.heritageClauses ?? [])
                    .some(h => h.token === ts.SyntaxKind.ImplementsKeyword
                        && h.types.some(t => t.expression && t.expression.getText(sourceFile) === 'MagicModalInterface'));

                if (!implementsMagicModal) {
                    return ts.visitEachChild(node, visit, ctx);
                }

                const newMembers = node.members.map(m => {
                    if (!ts.isPropertyDeclaration(m)) { return m; }
                    if (!m.name || !ts.isIdentifier(m.name)) { return m; }
                    const nameText = m.name.text;
                    if (!isTargetModalProp(nameText)) { return m; }
                    if (hasKeepComment(m)) { return m; }

                    const desired = desiredBool(nameText);
                    if (typeof desired === 'undefined') { return m; }

                    const init = m.initializer;
                    if (!init || init.kind !== ts.SyntaxKind.TrueKeyword) {
                        return m;
                    }
                    if (desired === true) { return m; }

                    return ts.factory.updatePropertyDeclaration(
                        m,
                        m.modifiers,
                        m.name,
                        m.questionToken,
                        m.type,
                        desired ? ts.factory.createTrue() : ts.factory.createFalse()
                    );
                });

                return ts.factory.updateClassDeclaration(
                    node,
                    node.modifiers,
                    node.name,
                    node.typeParameters,
                    node.heritageClauses,
                    newMembers
                );
            };
            return (rootNode: ts.SourceFile) => ts.visitNode(rootNode, visit) as ts.SourceFile;
        };

        newSourceFile = ts.transform(newSourceFile, [modalTransformerFactory]).transformed[0] as ts.SourceFile;
    }

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
    const printed = printer.printFile(newSourceFile);
    return printed.endsWith('\n') ? printed : printed + '\n';
}

export function extractCustomSmartMatchesAndRemove(
    textOriginal: string,
    settings: WizlySettings,
    filePath?: string
): { matches: CustomSmartMatches, text: string } {
    const matchers = (settings.customSmartMatchers ?? []) as CustomSmartMatcher[];
    if (!Array.isArray(matchers) || matchers.length === 0) {
        return { matches: {}, text: textOriginal };
    }

    let text = textOriginal;
    const matches: CustomSmartMatches = {};

    for (const matcher of matchers) {
        if (!matcher || !matcher.enabled) { continue; }
        if (filePath && matcher.filePattern && !matchesFilePattern(filePath, matcher.filePattern)) {
            continue;
        }

        const parsed = parseRegexInput(matcher.regex);
        if (!parsed) { continue; }

        const mergedFlags = Array.from(new Set((parsed.flags + 'gm').split(''))).join('');
        const re = new RegExp(parsed.source, mergedFlags);

        const removals: { start: number; end: number }[] = [];
        const compactText = text.replace(/\s+/g, '');
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            const groups: any = (m as any).groups ?? {};
            const magic = groups && groups.magic ? normalizeMagicExpression(String(groups.magic)) : '';
            if (!magic) {
                if (m[0].length === 0) { re.lastIndex++; }
                continue;
            }

            const record: CustomSmartMatchRecord = {};
            for (const [k, v] of Object.entries(groups)) {
                if (typeof v === 'string') {
                    record[k] = v;
                } else if (v !== null && typeof v !== 'undefined') {
                    record[k] = String(v);
                }
            }
            record.magic = magic;

            const {
                originalMagic,
                targetMatched,
                hasTargetRules,
                controlCandidates
            } = resolveSmartMatchOn(magic, matcher.matchOn, settings);

            let storageKeys: string[] = [originalMagic];
            let removeAllowed = !matcher.matchOn;

            if (matcher.matchOn) {
                if (!hasTargetRules || !targetMatched || controlCandidates.length === 0) {
                    removeAllowed = false;
                } else {
                    const resolvedControls = new Set<string>();
                    for (const c of controlCandidates) {
                        findMagicBindingsInCompactText(compactText, c).forEach(v => resolvedControls.add(v));
                    }
                    const existingControls = Array.from(resolvedControls);
                    if (existingControls.length > 0) {
                        storageKeys = existingControls;
                        removeAllowed = true;
                    } else {
                        removeAllowed = false;
                    }
                }
            }

            if (!matches[matcher.name]) {
                matches[matcher.name] = {};
            }
            for (const key of storageKeys) {
                const existing = matches[matcher.name][key];
                if (!existing) {
                    matches[matcher.name][key] = record;
                } else if (Array.isArray(existing)) {
                    existing.push(record);
                } else {
                    matches[matcher.name][key] = [existing, record];
                }
            }

            if (matcher.remove && removeAllowed) {
                removals.push({ start: m.index, end: m.index + m[0].length });
            }

            if (m[0].length === 0) { re.lastIndex++; }
        }

        if (matcher.remove && removals.length > 0) {
            for (let i = removals.length - 1; i >= 0; i--) {
                const { start, end } = removals[i];
                text = text.slice(0, start) + text.slice(end);
            }
        }
    }

    return { matches, text };
}

export function extractTabContentAndRemove(textOriginal: string): { tabPageContent: TabPageContent, text: string } {
    const tabPageContent: TabPageContent = {};
    const results: { start: number, end: number, magicName: string, tabIndex: number, innerContent: string }[] = [];

    // Find all <div class="tab_content" ...> blocks and extract their inner content
    let searchPos = 0;
    while (true) {
        // Find next div with tab_content class
        const startMatch = /(<div\b[^>]*\bclass="[^"]*\btab_content\b[^"]*"[^>]*>)/gm;
        startMatch.lastIndex = searchPos;
        const found = startMatch.exec(textOriginal);
        if (!found) { break; }

        const openTagStart = found.index;
        const openTagEnd = found.index + found[0].length;

        // Extract magic name and tab index from [style.display] binding
        // e.g. isTabPageLayerSelected(mgc.Tab1, 2)
        const layerMatch = /isTabPageLayerSelected\(mgc\.(\w+),\s*(\d+)\)/.exec(found[0]);
        if (!layerMatch) {
            searchPos = openTagEnd;
            continue;
        }
        const magicName = layerMatch[1];
        const tabIndex = parseInt(layerMatch[2], 10);

        // Stack-based: find the matching closing </div>
        let depth = 1;
        let pos = openTagEnd;
        while (depth > 0 && pos < textOriginal.length) {
            const nextOpen = textOriginal.indexOf('<div', pos);
            const nextClose = textOriginal.indexOf('</div>', pos);
            if (nextClose === -1) { break; }

            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth++;
                pos = nextOpen + 4;
            } else {
                depth--;
                if (depth === 0) {
                    const blockEnd = nextClose + 6; // length of '</div>'
                    const innerContent = textOriginal.slice(openTagEnd, nextClose).trim();
                    results.push({ start: openTagStart, end: blockEnd, magicName, tabIndex, innerContent });
                    searchPos = blockEnd;
                } else {
                    pos = nextClose + 6;
                }
            }
        }
        if (depth > 0) {
            searchPos = openTagEnd;
        }
    }

    // Build tabPageContent and remove blocks from text (process in reverse to preserve indices)
    let text = textOriginal;
    for (let i = results.length - 1; i >= 0; i--) {
        const { start, end, magicName, tabIndex, innerContent } = results[i];
        if (!tabPageContent[magicName]) {
            tabPageContent[magicName] = [];
        }
        tabPageContent[magicName][tabIndex - 1] = innerContent;
        text = text.slice(0, start) + text.slice(end);
    }

    // Remove empty divs left behind after removal
    for (let i = 0; i < 3; i++) {
        const oldText = text;
        text = text.replace(/<div\b[^>]*>\s*<\/div>/gmi, '');
        if (text === oldText) { break; }
    }

    return { tabPageContent, text };
}

export function extractLabelAndRemove(textOriginal: string, settings: WizlySettings): { map: LabelMap, text: string } {
    const m = settings.smartLabelMatcher;
    if (!m || !m.enabled) {
        return { map: {}, text: textOriginal };
    }
    const map: LabelMap = {};
    
    // Replace and build map simultaneously
    // We only want to extract the label content and remove the <label> tag itself.
    // We leave the surrounding divs intact (they will be cleaned up later if empty).

    const labelPrefixes = normalizeStringArray(m.labelPrefix ?? 'L_', ['L_']);
    const controlPrefixes = normalizeStringArray((m.controlPrefix ?? ['V_', 'P_']) as any, ['V_', 'P_']);
    const labelPrefixAlt = labelPrefixes.map(escapeForRegex).join('|');

    const reLabel = new RegExp(
        `<label\\s+(?:[^>]*?\\s+)?(?:magic|\\[magic\\])="(?<magic>mgc\\.(?:${labelPrefixAlt})([^"]*?))"[\\s\\S]*?>\\s*` +
        `(?<content>[\\s\\S]*?)\\s*` +
        `<\\/label>`,
        'gm'
    );

    let text = textOriginal.replace(reLabel, (fullMatch, ...args) => {
        const groups = args.length > 0 && typeof args[args.length - 1] === 'object' ? args[args.length - 1] : {};
        const idFull = groups.magic || '';
        const id = resolveControlName(idFull, settings);
        const content = (groups.content || '').trim();

        if (id && content) {
            const hasMatchingControl = controlPrefixes.some((prefix: string) => {
                const controlMagic = `mgc.${prefix}${id}`;
                return textOriginal.includes(controlMagic);
            });
            if (hasMatchingControl) {
                map[id] = content;
                return ''; // Remove the label tag completely
            }
        }
        return fullMatch;
    });

    // Post-processing: Remove empty divs that might have been left behind
    // e.g. <div ...> </div> (where label used to be)
    // We loop a few times to handle nested empty divs
    for (let i = 0; i < 3; i++) {
        const oldText = text;
        text = text.replace(/<div\b[^>]*>\s*<\/div>/gmi, '');
        if (text === oldText){ break; }; // No more changes
    }

    return { map, text };
}

function applySmartLabelPlaceholders(text: string, labels: LabelMap, settings: WizlySettings): string {
    const m = settings.smartLabelMatcher;
    if (!m || !m.enabled) {
        return text;
    }
    const re = /\{wizly\.smartLabel\[(?<magic>[^\]]+)\]\}/gm;
    return text.replace(re, (_full, _p1, _offset, _str, groups: any) => {
        const magic = (groups && groups.magic) ? String(groups.magic) : '';
        const cn = resolveControlName(magic, settings);
        if (!cn) {
            return '';
        }
        const content = labels[cn];
        if (!content) {
            return '';
        }
        return content;
    });
}

function hasTransformTag(text: string, filePath: string | undefined, template?: string): boolean {
    const style = resolveCommentStyle(filePath);
    if (template) {
        const tplEsc = escapeForRegex(template);
        const datePattern = '\\d{4}-\\d{2}-\\d{2}'; // YYYY-MM-DD
        const timePattern = '\\d{2}:\\d{2}'; // HH:mm
        const tplRegexBody = tplEsc
            .replace(/\\{date\\}/g, datePattern)
            .replace(/\\{time\\}/g, timePattern);
        const styleWrapped: Record<'line' | 'block' | 'html', RegExp> = {
            line: new RegExp('^\\s*\/\/\\s*' + tplRegexBody + '\\s*$', 'm'),
            block: new RegExp('^\\s*\/\\*\\s*' + tplRegexBody + '\\s*\\*\/', 'm'),
            html: new RegExp('^\\s*<!--\\s*' + tplRegexBody + '\\s*-->', 'm'),
        };
        return styleWrapped[style].test(text);
    } else {
        const patterns: Record<'line' | 'block' | 'html', RegExp> = {
            line: /^\s*\/\/\s*Wizly\s+transformed:\s*\d{4}-\d{2}-\d{2}\s+at\s+\d{2}:\d{2}/m,
            block: /^\s*\/\*\s*Wizly\s+transformed:\s*\d{4}-\d{2}-\d{2}\s+at\s+\d{2}:\d{2}[\s\S]*?\*\//m,
            html: /^\s*<!--\s*Wizly\s+transformed:\s*\d{4}-\d{2}-\d{2}\s+at\s+\d{2}:\d{2}/m,
        };
        return patterns[style].test(text);
    }
}

// Prefer workspace-installed Prettier when available; otherwise fall back to bundled Prettier
async function loadPrettier(): Promise<any> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    try {
        if (workspaceRoot) {
            // Try resolving Prettier from the workspace (user-installed)
            try {
                // Resolve using workspace paths to prefer local dependency
                const resolvedPath = require.resolve('prettier', { paths: [workspaceRoot] });
                const mod = await import(resolvedPath);
                return (mod as any).default ?? mod;
            } catch (err) {
                // Ignore resolution errors and continue to fallbacks
            }
        }
        // Try dynamic import from our packaged node_modules (ESM-friendly)
        const mod = await import('prettier');
        return (mod as any).default ?? mod;
    } catch (err) {
        // Final fallback: the statically imported namespace
        return (prettier as any);
    }
}

export async function transformText(text: string, filePath?: string, options?: { modes?: any[], settings?: Partial<WizlySettings> }): Promise<string> {
    const modes = options?.modes || getModes();
    const cachedSettings = options?.settings || getCachedSettings();

    const settings: WizlySettings = {
        transformTag: {
            enable: (cachedSettings?.transformTag?.enable ?? vscode.workspace.getConfiguration('wizly').get<boolean>('transformTag.enable', false)) as boolean,
            dateFormat: (cachedSettings?.transformTag?.dateFormat ?? vscode.workspace.getConfiguration('wizly').get<string>('transformTag.dateFormat', 'YYYY-MM-DD')) as string,
            timeFormat: (cachedSettings?.transformTag?.timeFormat ?? vscode.workspace.getConfiguration('wizly').get<string>('transformTag.timeFormat', 'HH:mm')) as string,
            template: (cachedSettings?.transformTag?.template ?? vscode.workspace.getConfiguration('wizly').get<string>('transformTag.template')) as string | undefined,
        },
        zoomIcon: (cachedSettings?.zoomIcon ?? vscode.workspace.getConfiguration('wizly').get<string>('zoomIcon', 'search')) as string,
        typescript: cachedSettings?.typescript ?? vscode.workspace.getConfiguration('wizly').get('typescript'),
        smartLabelMatcher: cachedSettings?.smartLabelMatcher ?? vscode.workspace.getConfiguration('wizly').get('smartLabelMatcher'),
        removeEmptyLinesAfterPrettier: cachedSettings?.removeEmptyLinesAfterPrettier ?? vscode.workspace.getConfiguration('wizly').get<boolean>('removeEmptyLinesAfterPrettier', false),
        smartTabMatcher: cachedSettings?.smartTabMatcher ?? vscode.workspace.getConfiguration('wizly').get<boolean>('smartTabMatcher', false),
        customSmartMatchers: cachedSettings?.customSmartMatchers ?? vscode.workspace.getConfiguration('wizly').get('customSmartMatchers'),
    };

    // Use provided settings or fallback to VS Code config
    const tagEnabled = settings.transformTag.enable;
    const template = settings.transformTag.template;

    if (tagEnabled && filePath && hasTransformTag(text, filePath, template)) {
        return text;
    }

    const isHtml = isHtmlFile(filePath);
    const { map: labelMap, text: textWithoutLabels } = isHtml
        ? extractLabelAndRemove(text, settings)
        : { map: {} as LabelMap, text };
    const { tabPageContent, text: textWithoutTabContent } = (isHtml && settings.smartTabMatcher)
        ? extractTabContentAndRemove(textWithoutLabels)
        : { tabPageContent: {}, text: textWithoutLabels };
    const { matches: customSmartMatches, text: textWithoutCustom } = extractCustomSmartMatchesAndRemove(textWithoutTabContent, settings, filePath);
    let newText = textWithoutCustom;
    
    const eofMarker = '~~WIZLY_EOF~~';
    if (!newText.endsWith(eofMarker)) {
        newText += eofMarker;
    }
    
    modes.forEach((mode: any) => {
        if (!mode.active) { return; }
        mode.rules.forEach((rule: any) => {
            if (!rule.active) { return; }
            
            if (filePath && rule.filePattern && !matchesFilePattern(filePath, rule.filePattern)) {
                return;
            }

            if (rule.activeWhen) {
                const settingValue = (settings as any)[rule.activeWhen];
                if (!settingValue) { return; }
            }
            
            try {
                    const re = new RegExp(rule.regex, rule.flags ?? "gm");
                    let usedTemplate = false;

                    if (rule.templateFile && rule.useBalancedTag) {
                        const tplPath = resolveTemplatePath(rule.templateFile);
                        if (tplPath) {
                            usedTemplate = true;
                            const templateContent = fs.readFileSync(tplPath, 'utf8');

                            const renderBalancedMatch = (_matchStart: number, openingTag: string, fullElement: string): string => {
                                const content = fullElement.slice(openingTag.length, fullElement.lastIndexOf(`</`));
                                const groups = (new RegExp(rule.regex, rule.flags ?? 'gm')).exec(openingTag)?.groups ?? {};
                                const data: any = { ...groups, content };
                                const allGroupAttrs = openingTag;

                                data.zoomIcon = settings.zoomIcon || 'search';
                                data.tabPageContent = Object.keys(tabPageContent).length > 0 ? tabPageContent : null;
                                data.customSmartMatches = Object.keys(customSmartMatches).length > 0 ? customSmartMatches : null;
                                data.getCustomMatch = (name: string, magic: string) => {
                                    if (!name || !magic) { return null; }
                                    const bucket = (customSmartMatches as any)[name];
                                    if (!bucket) { return null; }
                                    return bucket[magic] ?? null;
                                };
                                data.getLabel = (magic: string) => {
                                    if (!settings) { return null; }
                                    const cn = resolveControlName(magic, settings);
                                    return cn ? labelMap[cn] : null;
                                };
                                data.getAttribute = (attrString: string, attrName: string) => {
                                    if (!attrString || !attrName) { return null; }
                                    const esc = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const attrRe = new RegExp(`${esc}\\s*=\\s*"([^"]*)"`, 'i');
                                    const m = attrRe.exec(attrString);
                                    return m ? m[1] : null;
                                };
                                const findAttr = (keys: string[], ...sources: (string | undefined)[]) => {
                                    for (const source of sources) {
                                        if (!source) { continue; }
                                        for (const key of keys) {
                                            const val = data.getAttribute(source, key);
                                            if (val) { return val; }
                                        }
                                    }
                                    return null;
                                };
                                data.magic = data.magic ?? findAttr(['[magic]', 'magic'], allGroupAttrs);
                                data.rowId = findAttr(['[rowId]'], allGroupAttrs);
                                data.magicFuncParam = data.rowId ? `${data.magic}, ${data.rowId}` : data.magic;
                                data.attrVisible = findAttr(['[style.visibility]'], allGroupAttrs);
                                data.ngIf = findAttr(['*ngIf'], allGroupAttrs);
                                data.attrTooltip = findAttr(['[matTooltip]', 'matTooltip'], allGroupAttrs);

                                if (!data.zoom && data.magic && (customSmartMatches as any).smartZoomMatcher) {
                                    const zm = (customSmartMatches as any).smartZoomMatcher[data.magic];
                                    if (zm) {
                                        data.zoom = true;
                                        const rec = Array.isArray(zm) ? zm[0] : zm;
                                        data.zoomContent = rec && typeof rec === 'object' ? (rec.content ?? null) : null;
                                    }
                                }

                                data.startsWith = (str: string, prefix: string) => cleanMagicForCompare(str, settings).startsWith(prefix);
                                data.endsWith = (str: string, suffix: string) => cleanMagicForCompare(str, settings).endsWith(suffix);
                                data.includes = (str: string, substr: string) => cleanMagicForCompare(str, settings).includes(substr);
                                data.include = (templateName: string, includeData?: any) => {
                                    const resolvedName = templateName.endsWith('.ejs') ? templateName : `${templateName}.ejs`;
                                    const includeTplPath = resolveTemplatePath(resolvedName);
                                    if (!includeTplPath) { return `<!-- Template not found: ${resolvedName} -->`; }
                                    const incContent = fs.readFileSync(includeTplPath, 'utf8');
                                    const extensionTemplatesDir = path.join(__dirname, '..', 'templates');
                                    return ejs.render(incContent, { ...data, ...includeData }, { filename: includeTplPath, views: [extensionTemplatesDir] });
                                };

                                try {
                                    const extensionTemplatesDir = path.join(__dirname, '..', 'templates');
                                    return ejs.render(templateContent, data, { filename: tplPath, views: [extensionTemplatesDir] });
                                } catch (err) {
                                    console.error(`EJS render error for rule ${rule.name}:`, err);
                                    vscode.window.showErrorMessage(`Template render error in ${rule.name}: ${err}`);
                                    return fullElement;
                                }
                            };

                            // Collect all matches, process right-to-left so inner elements are handled before outer
                            const matches: { index: number; openingTag: string; fullElement: string }[] = [];
                            re.lastIndex = 0;
                            let match: RegExpExecArray | null;
                            while ((match = re.exec(newText)) !== null) {
                                const openingTag = match[0];
                                const fullElement = extractBalancedTag(newText, match.index);
                                if (fullElement) {
                                    matches.push({ index: match.index, openingTag, fullElement });
                                    re.lastIndex = match.index + openingTag.length;
                                }
                            }
                            for (let i = matches.length - 1; i >= 0; i--) {
                                const { index, openingTag } = matches[i];
                                const currentFullElement = extractBalancedTag(newText, index);
                                if (!currentFullElement) { continue; }
                                const rendered = renderBalancedMatch(index, openingTag, currentFullElement);
                                newText = newText.slice(0, index) + rendered + newText.slice(index + currentFullElement.length);
                            }
                        }
                    }

                    if (rule.templateFile && !rule.useBalancedTag) {
                        const tplPath = resolveTemplatePath(rule.templateFile);
                        if (tplPath) {
                            usedTemplate = true;
                            const templateContent = fs.readFileSync(tplPath, 'utf8');
                            newText = newText.replace(re, (...args: any[]) => {
                                const groups = args.length > 2 && typeof args[args.length - 1] === 'object' ? args[args.length - 1] : {};
                                const data: any = { ...groups };
                                for (let i = 0; i < args.length - 2; i++) {
                                    if (typeof args[i] === 'string') {
                                        data[`p${i}`] = args[i];
                                    }
                                }

                                data.zoomIcon = settings.zoomIcon || 'search';
                                data.tabPageContent = Object.keys(tabPageContent).length > 0 ? tabPageContent : null;
                                data.customSmartMatches = Object.keys(customSmartMatches).length > 0 ? customSmartMatches : null;
                                data.getCustomMatch = (name: string, magic: string) => {
                                    if (!name || !magic) { return null; }
                                    const bucket = (customSmartMatches as any)[name];
                                    if (!bucket) { return null; }
                                    return bucket[magic] ?? null;
                                };

                                data.getLabel = (magic: string) => {
                                    if (!settings){ return null; };
                                    const cn = resolveControlName(magic, settings);
                                    return cn ? labelMap[cn] : null;
                                };

                                data.getAttribute = (attrString: string, attrName: string) => {
                                    if (!attrString || !attrName) { return null; }
                                    const esc = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const re = new RegExp(`${esc}\\s*=\\s*"([^"]*)"`, 'i');
                                    const m = re.exec(attrString);
                                    return m ? m[1] : null;
                                };

                                const findAttr = (keys: string[], ...sources: (string | undefined)[]) => {
                                    for (const source of sources) {
                                        if (!source) { continue; }
                                        for (const key of keys) {
                                            const val = data.getAttribute(source, key);
                                            if (val) { return val; }
                                        }
                                    }
                                    return null;
                                };

                                data.zoomButtonAttrs = (data.zoomButtonAttrs || '') + (data.zoomButtonAttrsBefore || '') + ' ' + (data.zoomButtonAttrsAfter || '');
                                const hasNamedGroups = typeof args[args.length - 1] === 'object';
                                const captureGroupEnd = hasNamedGroups ? args.length - 3 : args.length - 2;
                                const contentValues = new Set(
                                    Object.entries(groups)
                                        .filter(([key]) => key === 'content')
                                        .map(([, v]) => v)
                                        .filter((v): v is string => typeof v === 'string')
                                );
                                const allGroupAttrs = args.slice(1, captureGroupEnd)
                                    .filter((v): v is string => typeof v === 'string' && !contentValues.has(v))
                                    .join(' ');

                                data.magic = data.magic ?? findAttr(['[magic]', 'magic'], allGroupAttrs);
                                data.rowId = findAttr(['[rowId]'], allGroupAttrs);

                                data.magicFuncParam = data.rowId ? `${data.magic}, ${data.rowId}` : data.magic;

                                data.attrVisible = findAttr(['[style.visibility]'], allGroupAttrs);
                                data.ngIf = findAttr(['*ngIf'], allGroupAttrs);
                                data.attrTooltip = findAttr(['[matTooltip]', 'matTooltip'], allGroupAttrs);
                                data.attrPlaceholder = findAttr(['[placeholder]', 'placeholder'], allGroupAttrs);
                                data.attrDisabled = findAttr(['[disabled]', 'disabled'], allGroupAttrs);

                                const typeMatch = allGroupAttrs.match(/type=["']([^"']*)["']/i);
                                data.inputType = typeMatch ? typeMatch[1] : 'text';
                                
                                const dynReq = findAttr(['[required]'], allGroupAttrs);
                                data.attrRequired = dynReq ? dynReq : (/\brequired\b/i.test(allGroupAttrs) ? 'true' : null);

                                data.options = findAttr(['[options]'], allGroupAttrs);

                                if (!data.zoom && data.magic && (customSmartMatches as any).smartZoomMatcher) {
                                    const zm = (customSmartMatches as any).smartZoomMatcher[data.magic];
                                    if (zm) {
                                        data.zoom = true;
                                        const rec = Array.isArray(zm) ? zm[0] : zm;
                                        data.zoomContent = rec && typeof rec === 'object' ? (rec.content ?? null) : null;
                                    }
                                }

                                data.startsWith = (str: string, prefix: string) => cleanMagicForCompare(str, settings).startsWith(prefix);
                                data.endsWith = (str: string, suffix: string) => cleanMagicForCompare(str, settings).endsWith(suffix);
                                data.includes = (str: string, substr: string) => cleanMagicForCompare(str, settings).includes(substr);

                                data.include = (templateName: string, includeData?: any) => {
                                    const resolvedName = templateName.endsWith('.ejs') ? templateName : `${templateName}.ejs`;
                                    const includeTplPath = resolveTemplatePath(resolvedName);
                                    if (!includeTplPath) {
                                        return `<!-- Template not found: ${resolvedName} -->`;
                                    }
                                    const content = fs.readFileSync(includeTplPath, 'utf8');
                                    const mergedData = {
                                        ...data,
                                        ...includeData
                                    };
                                    const extensionTemplatesDir = path.join(__dirname, '..', 'templates');
                                    return ejs.render(content, mergedData, { filename: includeTplPath, views: [extensionTemplatesDir] });
                                };

                                try {
                                    const extensionTemplatesDir = path.join(__dirname, '..', 'templates');
                                    return ejs.render(templateContent, data, { filename: tplPath, views: [extensionTemplatesDir] });
                                } catch (err) {
                                    console.error(`EJS render error for rule ${rule.name}:`, err);
                                    vscode.window.showErrorMessage(`Template render error in ${rule.name}: ${err}`);
                                    return args[0];
                                }
                            });
                        }
                    }

                    if (!usedTemplate) {
                        if (rule.replacement !== undefined) {
                            newText = newText.replace(re, rule.replacement);
                        } else if (rule.templateFile) {
                            vscode.window.showErrorMessage(`Wizly: Template not found: ${rule.templateFile} (Rule: ${rule.name})`);
                        }
                    }
            } catch (error) {
                console.error(`Error applying rule "${rule.description}": ${error}`);
            }
        });
    });
    
    if (isHtml) {
        newText = applySmartLabelPlaceholders(newText, labelMap, settings);
    }
    newText = newText.replace(eofMarker, '');

    if (shouldApplyTypeScriptAstTransforms(newText, filePath, settings.typescript)) {
        try {
            newText = sortImportsWithTypeScriptAst(newText, filePath, settings.typescript);
        } catch {
        }
    }

    newText = await formatWithPrettier(newText, filePath, settings);

    if (tagEnabled && filePath) {
        const style = resolveCommentStyle(filePath);
        const now = new Date();
        const dateTime = formatDateTime(now, settings.transformTag.dateFormat, settings.transformTag.timeFormat);
        const tpl = template || `Changed by Wizly on {date} at {time}`;
        const tagContent = tpl
            .replace(/\{date\}/g, dateTime.split(' ')[0])
            .replace(/\{time\}/g, dateTime.split(' ')[1] || '');
        const commentMap: Record<typeof style, string> = {
            html: `<!-- ${tagContent} -->`,
            block: `/* ${tagContent} */`,
            line: `// ${tagContent}`,
        };
        newText = commentMap[style] + '\n' + newText;
    }

    return newText;
}

async function formatWithPrettier(text: string, filePath?: string, settings?: WizlySettings): Promise<string> {
    try {
        const p = await loadPrettier();
        let resolvedConfig: any = {};
        if (filePath) {
            try {
                const cfg = await p.resolveConfig(filePath);
                if (cfg) {
                    resolvedConfig = cfg;
                }
            } catch (e) {
            }
        }

        const ext = filePath ? path.extname(filePath).toLowerCase() : '';
        const parser =
            ext === '.html' || ext === '.htm' || ext === '.xhtml'
                ? 'angular'
                : ext === '.ts' || ext === '.tsx'
                    ? 'typescript'
                    : ext === '.js' || ext === '.jsx'
                        ? 'babel'
                        : ext === '.json'
                            ? 'json'
                            : ext === '.css'
                                ? 'css'
                                : ext === '.scss'
                                    ? 'scss'
                                    : ext === '.less'
                                        ? 'less'
                                        : 'angular';

        const plugins: any[] = [];
        if (parser === 'angular') {
            try {
                const mod = await import('prettier/plugins/html');
                const htmlPlugin = (mod as any).default ?? mod;
                plugins.push(htmlPlugin);
            } catch {
            }
        } else if (parser === 'typescript' || parser === 'babel') {
            try {
                const mod = await import('prettier/plugins/typescript');
                const tsPlugin = (mod as any).default ?? mod;
                plugins.push(tsPlugin);
            } catch {
            }
        }

        const defaultOptions = {
            parser,
            printWidth: 80,
            tabWidth: 2,
            singleQuote: false,
            trailingComma: 'none',
            htmlWhitespaceSensitivity: 'ignore',
        } as const;

        const finalOptions: any = {
            ...defaultOptions,
            ...resolvedConfig,
            filepath: filePath ?? 'virtual.html',
            ...(plugins.length > 0 ? { plugins: [...(resolvedConfig.plugins ?? []), ...plugins] } : {}),
        };

        let newText = await p.format(text, finalOptions);

        if (settings?.removeEmptyLinesAfterPrettier) {
            newText = newText.replace(/^[ \t]*\r?\n/gm, "");
        }

        return newText;
    } catch (error) {
        vscode.window.showWarningMessage(`Prettier formatting failed: ${error}`);
        return text;
    }
}
