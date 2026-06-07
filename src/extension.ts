
import * as vscode from 'vscode';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import { PNG } from 'pngjs';
import { refreshModes, getModes, getCachedSettings, DEFAULT_SETTINGS_CONTENT } from './config';
import { transformText } from './transformer';
import { patchTemplates, patchRules, patchSettings } from './patcher';
import { AngularImportRequirement, AngularSyncSettings, ensureNamedImport, ensureNgModuleExports, ensureNgModuleImports, getSharedMaterialModuleTemplate, getSharedModuleTemplate, mergeAndDedupeRequirements, partitionRequirements, removeNamedImport, removeNgModuleImports, toRelativeModuleImport } from './angular-sync';
import * as ts from 'typescript';

let outputChannel: vscode.OutputChannel | null = null;
function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Wizly');
    }
    return outputChannel;
}

// Get uncommitted files from Git
function getUncommittedFiles(): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            reject(new Error('No workspace folder found'));
            return;
        }

        const allFiles: string[] = [];
        let remaining = folders.length;

        folders.forEach(folder => {
            const cwd = folder.uri.fsPath;
            const gitDir = path.join(cwd, '.git');
            // Skip non-git folders
            if (!fs.existsSync(gitDir)) {
                if (--remaining === 0) {
                    resolve(allFiles);
                }
                return;
            }

            exec('git status --porcelain', { cwd }, (error, stdout) => {
                if (!error) {
                    const files = stdout
                        .split('\n')
                        .filter(line => line.trim())
                        .map(line => {
                            // Git status format: XY filename
                            // We want modified (M), added (A), or untracked (??) files
                            const status = line.substring(0, 2);
                            const filename = line.substring(3).trim();
                            return { status, filename };
                        })
                        .filter(({ status }) => {
                            // Include modified, added, or untracked files
                            const isRelevantStatus = status.includes('M') || status.includes('A') || status.includes('??');
                            return isRelevantStatus;
                        })
                        .map(({ filename }) => path.resolve(cwd, filename));

                    allFiles.push(...files);
                }

                if (--remaining === 0) {
                    resolve(allFiles);
                }
            });
        });
    });
}

// Transform all uncommitted files
async function transformUncommittedFiles() {
    try {
        const files = await getUncommittedFiles();
        
        if (files.length === 0) {
            vscode.window.showInformationMessage('No uncommitted files found.');
            return;
        }

        let processedCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Transforming uncommitted files',
            cancellable: false
        }, async (progress) => {
            const increment = 100 / files.length;
            
            for (const filePath of files) {
                try {
                    const uri = vscode.Uri.file(filePath);
                    const document = await vscode.workspace.openTextDocument(uri);
                    const originalText = document.getText();
                    
                    // Apply transformations (filtered by file pattern)
                    const transformedText = await transformText(originalText, filePath);
                    
                    // Only write if content changed
                    if (transformedText !== originalText) {
                        const edit = new vscode.WorkspaceEdit();
                        const fullRange = new vscode.Range(
                            document.positionAt(0),
                            document.positionAt(originalText.length)
                        );
                        edit.replace(uri, fullRange, transformedText);
                        await vscode.workspace.applyEdit(edit);

                        // Save the file (skip files without extension)
                        if (path.extname(filePath)) {
                            await document.save();
                        }
                    }
                    
                    processedCount++;
                    progress.report({ 
                        increment, 
                        message: `Processed ${processedCount}/${files.length}: ${path.basename(filePath)}` 
                    });
                    
                } catch (error) {
                    errorCount++;
                    const errorMsg = `${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`;
                    errors.push(errorMsg);
                    console.error(`Error transforming ${filePath}:`, error);
                }
            }
        });

        // Show results
        if (errorCount === 0) {
            vscode.window.showInformationMessage(`Successfully transformed ${processedCount} files.`);
        } else {
            const message = `Transformed ${processedCount} files with ${errorCount} errors. Check output for details.`;
            vscode.window.showWarningMessage(message);
            
            // Log errors to output channel
            const channel = getOutputChannel();
            channel.appendLine('Transformation errors:');
            errors.forEach(error => channel.appendLine(`- ${error}`));
            channel.show();
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to get uncommitted files: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Command to transform the current file
async function transformCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { 
        vscode.window.showErrorMessage('No active editor found');
        return; 
    }

    const doc = editor.document;
    const text = doc.getText();

    // If file is untitled, try to determine extension from languageId
    let filePath = doc.fileName;
    if (doc.isUntitled) {
        if (doc.languageId === 'html') {
            filePath = 'untitled.html';
        } else if (doc.languageId === 'javascript') {
            filePath = 'untitled.js';
        } else if (doc.languageId === 'typescript') {
            filePath = 'untitled.ts';
        } else if (doc.languageId === 'css') {
            filePath = 'untitled.css';
        } else if (doc.languageId === 'scss') {
            filePath = 'untitled.scss';
        } else if (doc.languageId === 'less') {
            filePath = 'untitled.less';
        }
    }

    try {
        // Use the shared transformText function with file path for pattern matching
        const newText = await transformText(text, filePath);

        const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(text.length)
        );

        if (newText === text) {
            vscode.window.showInformationMessage('Wizly: File already transformed, skipped.');
            return;
        }

        // Apply the transformed text
        await editor.edit((editBuilder: vscode.TextEditorEdit) => {
            editBuilder.replace(fullRange, newText);
        });

        // Move cursor to the beginning of the document
        const newPosition = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(new vscode.Range(newPosition, newPosition));

        if (!doc.isUntitled && path.extname(filePath)) {
            await doc.save();
        }
        vscode.window.showInformationMessage('HTML transformation completed!');
    } catch (error) {
        vscode.window.showErrorMessage(`Error during transformation: ${error}`);
    }
}

async function convertAngularProjectToScss() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Wizly: Please open a folder first.');
        return;
    }

    const excludeGlob = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.vs/**,**/.vscode/**}';
    const candidates: Array<{ folder: vscode.WorkspaceFolder; angularJsonUri: vscode.Uri }> = [];

    for (const folder of workspaceFolders) {
        const found = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/angular.json'), excludeGlob);
        for (const angularJsonUri of found) {
            candidates.push({ folder, angularJsonUri });
        }
    }

    if (candidates.length === 0) {
        vscode.window.showErrorMessage('Wizly: No angular.json found in the workspace.');
        return;
    }

    const toDisplayPath = (candidate: { folder: vscode.WorkspaceFolder; angularJsonUri: vscode.Uri }) => {
        const rel = path.relative(candidate.folder.uri.fsPath, candidate.angularJsonUri.fsPath);
        return `${candidate.folder.name}: ${rel}`;
    };

    let chosen = candidates[0];
    if (candidates.length > 1) {
        const picked = await vscode.window.showQuickPick(
            candidates.map((c, i) => ({
                label: toDisplayPath(c),
                description: path.dirname(c.angularJsonUri.fsPath),
                index: i
            })),
            { title: 'Wizly: Choose Angular workspace (angular.json)' }
        );
        if (!picked) { return; }
        chosen = candidates[picked.index];
    }

    const workspaceRoot = path.dirname(chosen.angularJsonUri.fsPath);
    const angularJsonPath = chosen.angularJsonUri.fsPath;
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        vscode.window.showErrorMessage(`Wizly: Could not find package.json next to angular.json (${packageJsonPath}).`);
        return;
    }

    const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    const writeJson = (filePath: string, value: any) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

    const packageJson = readJson<any>(packageJsonPath);
    const angularJson = readJson<any>(angularJsonPath);

    const hasSass = !!(packageJson?.dependencies?.sass || packageJson?.devDependencies?.sass);

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const getTargets = (proj: any) => (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
    const getOptions = (proj: any, targetName: string) => {
        const targets = getTargets(proj);
        const target = targets?.[targetName];
        const options = target?.options;
        return options && typeof options === 'object' ? options : undefined;
    };

    const collectStyleEntries = (styles: any): string[] => {
        if (!Array.isArray(styles)) { return []; }
        const out: string[] = [];
        for (const s of styles) {
            if (typeof s === 'string') {
                out.push(s);
            } else if (s && typeof s === 'object' && typeof (s as any).input === 'string') {
                out.push((s as any).input);
            }
        }
        return out;
    };

    let hasAnyStylesCssRef = false;
    let hasAnyStylesScssRef = false;
    for (const name of Object.keys(projects)) {
        const proj = projects[name];
        const buildOptions = getOptions(proj, 'build');
        const testOptions = getOptions(proj, 'test');
        for (const p of collectStyleEntries(buildOptions?.styles)) {
            const normalized = p.replace(/\\/g, '/');
            if (normalized.includes('styles.css')) { hasAnyStylesCssRef = true; }
            if (normalized.includes('scss/main.scss')) { hasAnyStylesScssRef = true; }
        }
        for (const p of collectStyleEntries(testOptions?.styles)) {
            const normalized = p.replace(/\\/g, '/');
            if (normalized.includes('styles.css')) { hasAnyStylesCssRef = true; }
            if (normalized.includes('scss/main.scss')) { hasAnyStylesScssRef = true; }
        }
    }

    const rootSchematicsStyle = angularJson?.schematics?.['@schematics/angular:component']?.style;
    const isSchematicsScss = rootSchematicsStyle === 'scss';

    const srcDir = path.join(workspaceRoot, 'src');
    const mainScssPath = path.join(srcDir, 'scss', 'main.scss');
    const alreadyConfigured = isSchematicsScss || hasAnyStylesScssRef || fs.existsSync(mainScssPath);
    if (alreadyConfigured) {
        vscode.window.showErrorMessage('Wizly: This Angular workspace already appears to be configured for SCSS.');
        return;
    }

    const gitMarkerPath = path.join(workspaceRoot, '.git');
    if (!fs.existsSync(gitMarkerPath)) {
        const proceed = await vscode.window.showWarningMessage(
            'Wizly: This folder does not appear to be a Git repository (.git not found). This conversion changes many files and cannot be automatically undone. Do you want to continue?',
            { modal: true },
            'Yes',
            'No'
        );
        if (proceed !== 'Yes') { return; }
    }

    packageJson.devDependencies = packageJson.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
    if (!packageJson.dependencies?.sass && !packageJson.devDependencies?.sass) {
        packageJson.devDependencies.sass = '^1.78.0';
    }
    writeJson(packageJsonPath, packageJson);

    const ensureSchematicsScss = (obj: any) => {
        obj.schematics = obj.schematics && typeof obj.schematics === 'object' ? obj.schematics : {};
        const current = obj.schematics['@schematics/angular:component'];
        if (current && typeof current === 'object') {
            obj.schematics['@schematics/angular:component'] = { ...current, style: 'scss' };
        } else {
            obj.schematics['@schematics/angular:component'] = { style: 'scss' };
        }
    };

    const normalizeStyleRef = (p: string) => p.replace(/\\/g, '/');

    const updateStylesArray = (styles: any): boolean => {
        if (!Array.isArray(styles)) { return false; }
        let changed = false;
        for (let i = 0; i < styles.length; i++) {
            const s = styles[i];
            if (typeof s === 'string') {
                const normalized = normalizeStyleRef(s);
                if (normalized.endsWith('styles.css') || normalized.endsWith('styles.scss')) {
                    const suffixLen = normalized.endsWith('styles.css') ? 'styles.css'.length : 'styles.scss'.length;
                    styles[i] = s.slice(0, s.length - suffixLen) + 'scss/main.scss';
                    changed = true;
                }
            } else if (s && typeof s === 'object' && typeof (s as any).input === 'string') {
                const input = (s as any).input as string;
                const normalized = normalizeStyleRef(input);
                if (normalized.endsWith('styles.css') || normalized.endsWith('styles.scss')) {
                    const suffixLen = normalized.endsWith('styles.css') ? 'styles.css'.length : 'styles.scss'.length;
                    (s as any).input = input.slice(0, input.length - suffixLen) + 'scss/main.scss';
                    changed = true;
                }
            }
        }
        return changed;
    };

    const ensureScssOptions = (options: any) => {
        if (!options || typeof options !== 'object') { return; }
        updateStylesArray((options as any).styles);
        (options as any).inlineStyleLanguage = 'scss';
        (options as any).stylePreprocessorOptions = (options as any).stylePreprocessorOptions && typeof (options as any).stylePreprocessorOptions === 'object'
            ? (options as any).stylePreprocessorOptions
            : {};
        const spo = (options as any).stylePreprocessorOptions;
        spo.includePaths = Array.isArray(spo.includePaths) ? spo.includePaths : [];
        if (!spo.includePaths.includes('src/scss')) {
            spo.includePaths.push('src/scss');
        }
    };

    ensureSchematicsScss(angularJson);
    for (const name of Object.keys(projects)) {
        const proj = projects[name];
        ensureSchematicsScss(proj);
        const targets = getTargets(proj);
        if (targets?.build?.options) { ensureScssOptions(targets.build.options); }
        if (targets?.test?.options) { ensureScssOptions(targets.test.options); }
    }
    writeJson(angularJsonPath, angularJson);

    const scssDir = path.join(srcDir, 'scss');
    if (!fs.existsSync(scssDir)) {
        fs.mkdirSync(scssDir, { recursive: true });
    }

    const ensureFile = (filePath: string, content: string) => {
        if (fs.existsSync(filePath)) { return; }
        fs.writeFileSync(filePath, content, 'utf8');
    };

    const ensureDir = (dirPath: string) => {
        if (fs.existsSync(dirPath)) { return; }
        fs.mkdirSync(dirPath, { recursive: true });
    };

    const sevenOneDirs = ['abstracts', 'base', 'components', 'layout', 'pages', 'themes', 'vendors'];
    for (const d of sevenOneDirs) {
        ensureDir(path.join(scssDir, d));
    }

    const legacyStyleEntryPath = path.join(scssDir, 'style.scss');
    const mainEntryPath = path.join(scssDir, 'main.scss');
    if (fs.existsSync(legacyStyleEntryPath) && !fs.existsSync(mainEntryPath)) {
        fs.renameSync(legacyStyleEntryPath, mainEntryPath);
    }

    ensureFile(path.join(scssDir, 'abstracts', '_tokens.scss'), `$font-family-base: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;\n$color-text: #0f172a;\n$color-bg: #ffffff;\n`);
    ensureFile(path.join(scssDir, 'abstracts', '_mixins.scss'), ``);
    ensureFile(path.join(scssDir, 'base', '_base.scss'), `@use '../abstracts/tokens' as *;\n\nhtml,\nbody {\n  height: 100%;\n}\n\nbody {\n  margin: 0;\n  font-family: $font-family-base;\n  color: $color-text;\n  background: $color-bg;\n}\n`);
    ensureFile(mainEntryPath, `@use './abstracts/tokens' as *;\n@use './base/base';\n`);

    const stylesCssPath = path.join(srcDir, 'styles.css');
    const stylesScssPath = path.join(srcDir, 'styles.scss');
    const moveGlobalStylesIntoMain = (sourcePath: string) => {
        if (!fs.existsSync(sourcePath)) { return; }
        const original = fs.readFileSync(sourcePath, 'utf8');
        if (!original.trim()) { return; }
        let content = original;
        content = content.replace(/^[^\S\r\n]*@use\s+(['"])\.\/scss\/main\1\s*;?[^\S\r\n]*(\r?\n)?/gmi, '');
        content = content.replace(/^[^\S\r\n]*@use\s+(['"])\.\/scss\/style\1\s*;?[^\S\r\n]*(\r?\n)?/gmi, '');
        content = content.replace(/^[^\S\r\n]*@use\s+(['"])scss\/main\1\s*;?[^\S\r\n]*(\r?\n)?/gmi, '');
        content = content.replace(/^[^\S\r\n]*@use\s+(['"])scss\/style\1\s*;?[^\S\r\n]*(\r?\n)?/gmi, '');
        content = content.trim();
        if (!content) { return; }
        const currentMain = fs.existsSync(mainEntryPath) ? fs.readFileSync(mainEntryPath, 'utf8') : '';
        if (currentMain.includes(content)) { return; }
        fs.writeFileSync(mainEntryPath, `${currentMain.trimEnd()}\n\n${content}\n`, 'utf8');
    };

    if (fs.existsSync(stylesCssPath)) {
        moveGlobalStylesIntoMain(stylesCssPath);
        try { fs.unlinkSync(stylesCssPath); } catch { }
    }
    if (fs.existsSync(stylesScssPath)) {
        moveGlobalStylesIntoMain(stylesScssPath);
        try { fs.unlinkSync(stylesScssPath); } catch { }
    }

    const componentTsFiles = await vscode.workspace.findFiles('**/*.component.ts', excludeGlob);
    const renamePairs: Array<{ cssAbs: string; scssAbs: string }> = [];
    for (const uri of componentTsFiles) {
        const filePath = uri.fsPath;
        if (!filePath.startsWith(workspaceRoot + path.sep)) { continue; }
        const before = fs.readFileSync(filePath, 'utf8');
        let after = before;

        const replaceStyleUrl = (text: string) => {
            return text.replace(/\bstyleUrl\s*:\s*(["'])(?<p>[^"']+?)\1/gm, (full, quote, _p, _offset, _str, groups: any) => {
                const p = String(groups?.p ?? '');
                if (!p.endsWith('.css')) { return full; }
                const scssRel = p.slice(0, -'.css'.length) + '.scss';
                const cssAbs = path.resolve(path.dirname(filePath), p);
                const scssAbs = path.resolve(path.dirname(filePath), scssRel);
                renamePairs.push({ cssAbs, scssAbs });
                return `styleUrl: ${quote}${scssRel}${quote}`;
            });
        };

        const replaceStyleUrls = (text: string) => {
            return text.replace(/\bstyleUrls\s*:\s*\[(?<inner>[\s\S]*?)\]/gm, (full, _inner, _offset, _str, groups: any) => {
                const inner = String(groups?.inner ?? '');
                const replacedInner = inner.replace(/(["'])(?<p>[^"']+?)\1/gm, (m, quote, _p2, _o2, _s2, g2: any) => {
                    const p = String(g2?.p ?? '');
                    if (!p.endsWith('.css')) { return m; }
                    const scssRel = p.slice(0, -'.css'.length) + '.scss';
                    const cssAbs = path.resolve(path.dirname(filePath), p);
                    const scssAbs = path.resolve(path.dirname(filePath), scssRel);
                    renamePairs.push({ cssAbs, scssAbs });
                    return `${quote}${scssRel}${quote}`;
                });
                if (replacedInner === inner) { return full; }
                return full.replace(inner, replacedInner);
            });
        };

        after = replaceStyleUrl(after);
        after = replaceStyleUrls(after);

        if (after !== before) {
            fs.writeFileSync(filePath, after, 'utf8');
        }
    }

    for (const pair of renamePairs) {
        if (!fs.existsSync(pair.cssAbs)) { continue; }
        if (fs.existsSync(pair.scssAbs)) { continue; }
        try {
            fs.renameSync(pair.cssAbs, pair.scssAbs);
        } catch (err) {
            vscode.window.showErrorMessage(`Wizly: Failed to rename component stylesheet: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
    }

    const indexFiles = await vscode.workspace.findFiles('**/index.html', excludeGlob);
    const magicCandidates: Array<{ indexUri: vscode.Uri; cssPath: string }> = [];
    for (const indexUri of indexFiles) {
        if (!indexUri.fsPath.startsWith(workspaceRoot + path.sep)) { continue; }
        const cssPath = path.join(path.dirname(indexUri.fsPath), 'magic-styles.css');
        if (fs.existsSync(cssPath)) {
            magicCandidates.push({ indexUri, cssPath });
        }
    }

    const removeMagicLinkTag = (indexPath: string) => {
        const before = fs.readFileSync(indexPath, 'utf8');
        const after = before.replace(/^[^\S\r\n]*<link\b[^>]*magic-styles\.css[^>]*>\s*(\r?\n)?/gmi, '');
        if (after !== before) {
            fs.writeFileSync(indexPath, after, 'utf8');
        }
    };

    const removeMissingMagicStylesFromOptions = (options: any): boolean => {
        if (!options || typeof options !== 'object') { return false; }
        const styles = (options as any).styles;
        if (!Array.isArray(styles)) { return false; }
        const beforeLen = styles.length;
        const keep = (entry: any): boolean => {
            const p = typeof entry === 'string'
                ? entry
                : entry && typeof entry === 'object' && typeof (entry as any).input === 'string'
                    ? (entry as any).input
                    : undefined;
            if (typeof p !== 'string') { return true; }
            const normalized = normalizeStyleRef(p).toLowerCase();
            const isMagicStyle = normalized.endsWith('magic-styles.css') || normalized.endsWith('magic-styles.scss');
            if (!isMagicStyle) { return true; }
            const abs = path.isAbsolute(p) ? p : path.resolve(workspaceRoot, p);
            return fs.existsSync(abs);
        };
        (options as any).styles = styles.filter(keep);
        return (options as any).styles.length !== beforeLen;
    };

    const removeMissingMagicStylesFromAngularJson = (): boolean => {
        let changed = false;
        for (const name of Object.keys(projects)) {
            const proj = projects[name];
            const targets = getTargets(proj);
            if (targets?.build?.options) { changed = removeMissingMagicStylesFromOptions(targets.build.options) || changed; }
            if (targets?.test?.options) { changed = removeMissingMagicStylesFromOptions(targets.test.options) || changed; }
        }
        return changed;
    };

    const cleanupMagicStyleReferencesAfterDelete = () => {
        const changed = removeMissingMagicStylesFromAngularJson();
        if (changed) {
            writeJson(angularJsonPath, angularJson);
        }
    };

    if (magicCandidates.length > 0) {
        const toRel = (p: string) => path.relative(workspaceRoot, p);
        let magicChosen = magicCandidates[0];
        if (magicCandidates.length > 1) {
            const picked = await vscode.window.showQuickPick(
                magicCandidates.map((c, i) => ({
                    label: toRel(c.indexUri.fsPath),
                    description: path.dirname(c.indexUri.fsPath),
                    index: i
                })),
                { title: 'Wizly: Choose Magic project (index.html)' }
            );
            if (picked) {
                magicChosen = magicCandidates[picked.index];
            }
        }

        const action = await vscode.window.showQuickPick(
            [
                {
                    label: 'No (delete)',
                    description: 'Deletes magic-styles.css and removes the <link> from index.html (if present).',
                    id: 'delete'
                },
                {
                    label: 'Yes (convert to SCSS)',
                    description: 'Moves the contents into src/scss/vendors/_magic-styles.scss and deletes magic-styles.css.',
                    id: 'convert'
                }
            ],
            { title: 'Wizly: Should magic-styles.css be kept?' }
        );

        if (action?.id === 'delete') {
            try {
                fs.unlinkSync(magicChosen.cssPath);
            } catch (err) {
                vscode.window.showErrorMessage(`Wizly: Failed to remove magic-styles.css: ${err instanceof Error ? err.message : String(err)}`);
                return;
            }
            removeMagicLinkTag(magicChosen.indexUri.fsPath);
            cleanupMagicStyleReferencesAfterDelete();
        } else if (action?.id === 'convert') {
            const magicScssPath = path.join(scssDir, 'vendors', '_magic-styles.scss');
            if (fs.existsSync(magicScssPath)) {
                const overwrite = await vscode.window.showWarningMessage(
                    'Wizly: src/scss/vendors/_magic-styles.scss already exists. Overwrite?',
                    'Overwrite',
                    'Keep'
                );
                if (overwrite === 'Overwrite') {
                    const css = fs.readFileSync(magicChosen.cssPath, 'utf8');
                    fs.writeFileSync(magicScssPath, css, 'utf8');
                }
            } else {
                const css = fs.readFileSync(magicChosen.cssPath, 'utf8');
                fs.writeFileSync(magicScssPath, css, 'utf8');
            }

            const styleEntryPath = path.join(scssDir, 'main.scss');
            if (fs.existsSync(styleEntryPath)) {
                const current = fs.readFileSync(styleEntryPath, 'utf8');
                if (!current.includes(`./vendors/magic-styles`) && !current.includes(`vendors/magic-styles`) && !current.includes(`magic-styles`)) {
                    fs.writeFileSync(styleEntryPath, `${current.trimEnd()}\n@use './vendors/magic-styles';\n`, 'utf8');
                }
            }

            removeMagicLinkTag(magicChosen.indexUri.fsPath);
            try {
                fs.unlinkSync(magicChosen.cssPath);
            } catch (err) {
                vscode.window.showErrorMessage(`Wizly: Failed to remove magic-styles.css: ${err instanceof Error ? err.message : String(err)}`);
                return;
            }
        }
    }

    const doc = await vscode.workspace.openTextDocument(mainEntryPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage('Wizly: Converted Angular workspace to SCSS (updated angular.json + package.json + src styles).');
}

async function convertAngularProjectToPwa() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Wizly: Please open a folder first.');
        return;
    }

    const excludeGlob = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.vs/**,**/.vscode/**}';
    const candidates: Array<{ folder: vscode.WorkspaceFolder; angularJsonUri: vscode.Uri }> = [];

    for (const folder of workspaceFolders) {
        const found = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/angular.json'), excludeGlob);
        for (const angularJsonUri of found) {
            candidates.push({ folder, angularJsonUri });
        }
    }

    if (candidates.length === 0) {
        vscode.window.showErrorMessage('Wizly: No angular.json found in the workspace.');
        return;
    }

    const toDisplayPath = (candidate: { folder: vscode.WorkspaceFolder; angularJsonUri: vscode.Uri }) => {
        const rel = path.relative(candidate.folder.uri.fsPath, candidate.angularJsonUri.fsPath);
        return `${candidate.folder.name}: ${rel}`;
    };

    let chosen = candidates[0];
    if (candidates.length > 1) {
        const picked = await vscode.window.showQuickPick(
            candidates.map((c, i) => ({
                label: toDisplayPath(c),
                description: path.dirname(c.angularJsonUri.fsPath),
                index: i
            })),
            { title: 'Wizly: Choose Angular workspace (angular.json)' }
        );
        if (!picked) { return; }
        chosen = candidates[picked.index];
    }

    const workspaceRoot = path.dirname(chosen.angularJsonUri.fsPath);
    const angularJsonPath = chosen.angularJsonUri.fsPath;
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        vscode.window.showErrorMessage(`Wizly: Could not find package.json next to angular.json (${packageJsonPath}).`);
        return;
    }

    const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    const angularJson = readJson<any>(angularJsonPath);
    const packageJson = readJson<any>(packageJsonPath);

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const defaultProjectName = typeof angularJson?.defaultProject === 'string' ? angularJson.defaultProject : undefined;

    const isAppProject = (proj: any) => {
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && builder.includes('application');
    };

    const appProjectNames = Object.keys(projects).filter(name => isAppProject(projects[name]));
    if (appProjectNames.length === 0) {
        vscode.window.showErrorMessage('Wizly: No Angular application projects found in angular.json.');
        return;
    }

    let projectName = defaultProjectName && appProjectNames.includes(defaultProjectName) ? defaultProjectName : appProjectNames[0];
    if (appProjectNames.length > 1) {
        const picked = await vscode.window.showQuickPick(
            appProjectNames.map(name => ({
                label: name,
                description: name === defaultProjectName ? 'defaultProject' : undefined
            })),
            { title: 'Wizly: Choose Angular project to enable PWA for' }
        );
        if (!picked) { return; }
        projectName = picked.label;
    }

    const hasServiceWorkerDep = !!(packageJson?.dependencies?.['@angular/service-worker'] || packageJson?.devDependencies?.['@angular/service-worker']);
    const ngswConfigPath = path.join(workspaceRoot, 'ngsw-config.json');
    const manifestPath = path.join(workspaceRoot, 'src', 'manifest.webmanifest');
    if (hasServiceWorkerDep || fs.existsSync(ngswConfigPath) || fs.existsSync(manifestPath)) {
        vscode.window.showErrorMessage('Wizly: This Angular workspace already appears to have PWA support configured.');
        return;
    }

    const gitMarkerPath = path.join(workspaceRoot, '.git');
    if (!fs.existsSync(gitMarkerPath)) {
        const proceed = await vscode.window.showWarningMessage(
            'Wizly: This folder does not appear to be a Git repository (.git not found). This conversion changes many files and cannot be automatically undone. Do you want to continue?',
            { modal: true },
            'Yes',
            'No'
        );
        if (proceed !== 'Yes') { return; }
    }

    const hasFile = (name: string) => fs.existsSync(path.join(workspaceRoot, name));
    const pkgManager = hasFile('pnpm-lock.yaml') ? 'pnpm'
        : hasFile('yarn.lock') ? 'yarn'
            : 'npm';

    const getInstalledPackageVersionFromNodeModules = (name: string): string | undefined => {
        const pkgJsonPath = path.join(workspaceRoot, 'node_modules', ...name.split('/'), 'package.json');
        if (!fs.existsSync(pkgJsonPath)) { return undefined; }
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as any;
            return typeof pkg?.version === 'string' ? pkg.version : undefined;
        } catch {
            return undefined;
        }
    };

    const getInstalledPackageVersionFromPackageLock = (name: string): string | undefined => {
        const packageLockPath = path.join(workspaceRoot, 'package-lock.json');
        if (!fs.existsSync(packageLockPath)) { return undefined; }
        try {
            const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8')) as any;
            const v1 = lock?.dependencies?.[name]?.version;
            if (typeof v1 === 'string') { return v1; }
            const v2 = lock?.packages?.[`node_modules/${name}`]?.version;
            if (typeof v2 === 'string') { return v2; }
            return undefined;
        } catch {
            return undefined;
        }
    };

    const angularCoreVersion = getInstalledPackageVersionFromPackageLock('@angular/core')
        ?? getInstalledPackageVersionFromNodeModules('@angular/core');

    if (!angularCoreVersion) {
        vscode.window.showErrorMessage('Wizly: Could not determine the installed @angular/core version (package-lock.json or node_modules). Run npm install first, then try again.');
        return;
    }

    const angularCoreSpecifier = typeof packageJson?.dependencies?.['@angular/core'] === 'string'
        ? (packageJson.dependencies['@angular/core'] as string)
        : typeof packageJson?.devDependencies?.['@angular/core'] === 'string'
            ? (packageJson.devDependencies['@angular/core'] as string)
            : undefined;

    const pwaSpecifier = `@angular/pwa@${angularCoreVersion}`;

    const hasPwaMarkers = fs.existsSync(ngswConfigPath) || fs.existsSync(manifestPath) || hasServiceWorkerDep;
    const installedServiceWorkerVersion = getInstalledPackageVersionFromPackageLock('@angular/service-worker')
        ?? getInstalledPackageVersionFromNodeModules('@angular/service-worker');

    if (hasPwaMarkers && installedServiceWorkerVersion) {
        vscode.window.showErrorMessage('Wizly: This Angular workspace already appears to have PWA support configured.');
        return;
    }

    const setServiceWorkerSpecifierInPackageJson = (specifier: string) => {
        const pkgPath = packageJsonPath;
        if (!fs.existsSync(pkgPath)) { return; }
        const pkg = readJson<any>(pkgPath);
        const deps = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {};
        const devDeps = pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {};

        if (typeof deps['@angular/service-worker'] === 'string') {
            deps['@angular/service-worker'] = specifier;
        } else if (typeof devDeps['@angular/service-worker'] === 'string') {
            devDeps['@angular/service-worker'] = specifier;
        } else {
            const coreInDeps = typeof deps['@angular/core'] === 'string';
            const coreInDevDeps = typeof devDeps['@angular/core'] === 'string';
            if (coreInDeps) {
                deps['@angular/service-worker'] = specifier;
            } else if (coreInDevDeps) {
                devDeps['@angular/service-worker'] = specifier;
            } else {
                deps['@angular/service-worker'] = specifier;
            }
        }
        pkg.dependencies = deps;
        pkg.devDependencies = devDeps;
        fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    };

    const cmd = pkgManager === 'pnpm'
        ? `pnpm exec ng add ${pwaSpecifier} --project "${projectName}" --skip-confirmation`
        : pkgManager === 'yarn'
            ? `yarn ng add ${pwaSpecifier} --project "${projectName}" --skip-confirmation`
            : `npx ng add ${pwaSpecifier} --project "${projectName}" --skip-confirmation`;

    const preInstallServiceWorkerCmd = pkgManager === 'pnpm'
        ? `pnpm add @angular/service-worker@${angularCoreVersion} --save-exact`
        : pkgManager === 'yarn'
            ? `yarn add @angular/service-worker@${angularCoreVersion} --exact`
            : `npm install @angular/service-worker@${angularCoreVersion} --save --save-exact`;

    const channel = getOutputChannel();
    channel.show(true);
    channel.appendLine(`Wizly: Enabling PWA for Angular project "${projectName}"...`);
    channel.appendLine(`Wizly: Pre-installing @angular/service-worker@${angularCoreVersion} to avoid npm ERESOLVE...`);
    channel.appendLine(`Wizly: Running: ${preInstallServiceWorkerCmd}`);
    channel.appendLine(`Wizly: Running: ${cmd}`);

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Wizly: Convert Angular Project to PWA (${projectName})`,
                cancellable: false
            },
            async () => {
                await new Promise<void>((resolve, reject) => {
                    const child = spawn(preInstallServiceWorkerCmd, [], { cwd: workspaceRoot, shell: true, env: process.env });
                    child.stdout.on('data', (d) => channel.append(String(d)));
                    child.stderr.on('data', (d) => channel.append(String(d)));
                    child.on('error', reject);
                    child.on('close', (code) => {
                        if (code === 0) { resolve(); }
                        else { reject(new Error(`Pre-install failed with exit code ${code}`)); }
                    });
                });

                if (!hasPwaMarkers) {
                    await new Promise<void>((resolve, reject) => {
                        const child = spawn(cmd, [], { cwd: workspaceRoot, shell: true, env: process.env });
                        child.stdout.on('data', (d) => channel.append(String(d)));
                        child.stderr.on('data', (d) => channel.append(String(d)));
                        child.on('error', reject);
                        child.on('close', (code) => {
                            if (code === 0) { resolve(); }
                            else { reject(new Error(`Command failed with exit code ${code}`)); }
                        });
                    });
                }

                if (angularCoreSpecifier) {
                    setServiceWorkerSpecifierInPackageJson(angularCoreSpecifier);
                }
            }
        );
    } catch (err) {
        vscode.window.showErrorMessage(`Wizly: Failed to enable PWA. ${err instanceof Error ? err.message : String(err)}. Check the Wizly output for details.`);
        return;
    }

    const addUpdateHandling = await vscode.window.showQuickPick(
        [
            {
                label: 'Yes (add update prompt service)',
                description: 'Creates src/app/pwa-update.service.ts and wires it into AppComponent to prompt on new versions.',
                id: 'yes'
            },
            {
                label: 'No',
                description: 'Only enable PWA via Angular CLI.',
                id: 'no'
            }
        ],
        { title: 'Wizly: Add PWA update handling (check + prompt + reload)?' }
    );

    const addPwaUpdateHandling = async (): Promise<string | undefined> => {
        const proj = projects?.[projectName];
        const sourceRoot = typeof proj?.sourceRoot === 'string' ? proj.sourceRoot : 'src';
        const appDir = path.join(workspaceRoot, sourceRoot, 'app');
        if (!fs.existsSync(appDir)) {
            vscode.window.showWarningMessage(`Wizly: Could not find ${path.relative(workspaceRoot, appDir)}. Skipping update handling scaffolding.`);
            return undefined;
        }

        const servicePath = path.join(appDir, 'pwa-update.service.ts');
        if (!fs.existsSync(servicePath)) {
            const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
            const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
            const hasMaterial = typeof deps['@angular/material'] === 'string'
                || typeof devDeps['@angular/material'] === 'string'
                || fs.existsSync(path.join(workspaceRoot, 'node_modules', '@angular', 'material', 'package.json'));

            const serviceContent = hasMaterial
                ? `import { Component, inject, Injectable, Injector } from '@angular/core';\nimport { SwUpdate, VersionReadyEvent } from '@angular/service-worker';\nimport { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';\nimport { firstValueFrom } from 'rxjs';\nimport { filter, take } from 'rxjs/operators';\n\nexport type PwaUpdateMode = 'prompt' | 'silent';\n\nexport type PwaUpdateOptions = {\n    checkIntervalMs?: number;\n    mode?: PwaUpdateMode;\n    prompt?: (message: string) => boolean | Promise<boolean>;\n};\n\n@Component({\n    selector: 'wizly-pwa-update-dialog',\n    standalone: true,\n    template: ` + "`" + `<h2 style="margin: 0 0 12px">Update available</h2>\n<p style="margin: 0 0 16px">{{ data.message }}</p>\n<div style="display: flex; gap: 8px; justify-content: flex-end">\n  <button type="button" (click)="close(false)">Later</button>\n  <button type="button" (click)="close(true)">Reload</button>\n</div>\n` + "`" + `\n})\nexport class PwaUpdateDialogComponent {\n    readonly data = inject<{ message: string }>(MAT_DIALOG_DATA);\n    private readonly dialogRef = inject(MatDialogRef<PwaUpdateDialogComponent, boolean>);\n\n    close(value: boolean) {\n        this.dialogRef.close(value);\n    }\n}\n\n@Injectable({ providedIn: 'root' })\nexport class PwaUpdateService {\n    private readonly swUpdate = inject(SwUpdate);\n    private readonly injector = inject(Injector);\n\n    init(options?: PwaUpdateOptions) {\n        if (!this.swUpdate.isEnabled) { return; }\n\n        this.swUpdate.versionUpdates\n            .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))\n            .subscribe(() => {\n                void this.handleVersionReady(options);\n            });\n\n        const intervalMs = options?.checkIntervalMs ?? 10 * 60_000;\n        setInterval(() => this.swUpdate.checkForUpdate(), intervalMs);\n    }\n\n    private async handleVersionReady(options?: PwaUpdateOptions) {\n        const mode: PwaUpdateMode = options?.mode ?? 'prompt';\n        if (mode === 'silent') {\n            await this.swUpdate.activateUpdate();\n            location.reload();\n            return;\n        }\n\n        const message = 'A new version is available. Reload now?';\n        const shouldReload = await this.promptReload(message, options);\n        if (shouldReload) {\n            await this.swUpdate.activateUpdate();\n            location.reload();\n        }\n    }\n\n    private async promptReload(message: string, options?: PwaUpdateOptions): Promise<boolean> {\n        if (options?.prompt) {\n            return await options.prompt(message);\n        }\n\n        const dialog = this.injector.get(MatDialog, null as any);\n        if (dialog) {\n            const ref = dialog.open(PwaUpdateDialogComponent, {\n                data: { message },\n                disableClose: true,\n                width: '420px'\n            });\n            const result = await firstValueFrom(ref.afterClosed().pipe(take(1)));\n            return result === true;\n        }\n\n        return confirm(message);\n    }\n}\n`
                : `import { inject, Injectable } from '@angular/core';\nimport { SwUpdate, VersionReadyEvent } from '@angular/service-worker';\nimport { filter } from 'rxjs/operators';\n\nexport type PwaUpdateMode = 'prompt' | 'silent';\n\nexport type PwaUpdateOptions = {\n    checkIntervalMs?: number;\n    mode?: PwaUpdateMode;\n    prompt?: (message: string) => boolean | Promise<boolean>;\n};\n\n@Injectable({ providedIn: 'root' })\nexport class PwaUpdateService {\n    private readonly swUpdate = inject(SwUpdate);\n\n    init(options?: PwaUpdateOptions) {\n        if (!this.swUpdate.isEnabled) { return; }\n\n        this.swUpdate.versionUpdates\n            .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))\n            .subscribe(() => {\n                void this.handleVersionReady(options);\n            });\n\n        const intervalMs = options?.checkIntervalMs ?? 10 * 60_000;\n        setInterval(() => this.swUpdate.checkForUpdate(), intervalMs);\n    }\n\n    private async handleVersionReady(options?: PwaUpdateOptions) {\n        const mode: PwaUpdateMode = options?.mode ?? 'prompt';\n        if (mode === 'silent') {\n            await this.swUpdate.activateUpdate();\n            location.reload();\n            return;\n        }\n\n        const message = 'A new version is available. Reload now?';\n        const shouldReload = options?.prompt ? await options.prompt(message) : confirm(message);\n        if (shouldReload) {\n            await this.swUpdate.activateUpdate();\n            location.reload();\n        }\n    }\n}\n`;
            fs.writeFileSync(servicePath, serviceContent, 'utf8');
        }

        const appComponentCandidates = await vscode.workspace.findFiles('**/app.component.ts', excludeGlob);
        const sourceRootAbs = path.join(workspaceRoot, sourceRoot) + path.sep;
        const scoped = appComponentCandidates
            .map(u => u.fsPath)
            .filter(p => p.startsWith(sourceRootAbs))
            .sort((a, b) => a.length - b.length);

        const appComponentPath = scoped[0];
        if (!appComponentPath || !fs.existsSync(appComponentPath)) {
            vscode.window.showWarningMessage('Wizly: Could not find app.component.ts to wire update handling. Created pwa-update.service.ts only.');
            return servicePath;
        }

        const before = fs.readFileSync(appComponentPath, 'utf8');
        let after = before;

        if (!after.includes(`'./pwa-update.service'`) && !after.includes(`"./pwa-update.service"`)) {
            const importLine = `import { PwaUpdateService } from './pwa-update.service';\n`;
            const importMatches = [...after.matchAll(/^[^\S\r\n]*import\s+[\s\S]*?;\s*(\r?\n)/gm)];
            if (importMatches.length > 0) {
                const last = importMatches[importMatches.length - 1];
                const insertAt = (last.index ?? 0) + last[0].length;
                after = after.slice(0, insertAt) + importLine + after.slice(insertAt);
            } else {
                after = importLine + after;
            }
        }

        const ensureInitCallInConstructorBody = (text: string): string => {
            if (text.includes('this.pwaUpdateService.init(') || text.includes('this.pwaUpdateService.init();')) { return text; }
            return text.replace(/\bconstructor\s*\([^)]*\)\s*\{\s*/m, (m) => `${m}\n        this.pwaUpdateService.init();\n`);
        };

        if (/\bconstructor\s*\(/m.test(after)) {
            if (!/\bpwaUpdateService\s*:\s*PwaUpdateService\b/m.test(after)) {
                after = after.replace(/\bconstructor\s*\((?<params>[^)]*)\)/m, (full, _params, _offset, _str, groups: any) => {
                    const params = String(groups?.params ?? '');
                    const trimmed = params.trim();
                    const addition = `private readonly pwaUpdateService: PwaUpdateService`;
                    if (!trimmed) {
                        return `constructor(${addition})`;
                    }
                    if (trimmed.includes('PwaUpdateService')) {
                        return full;
                    }
                    return `constructor(${params}, ${addition})`;
                });
            }
            after = ensureInitCallInConstructorBody(after);
        } else if (/export\s+class\s+AppComponent\b/.test(after)) {
            const ctor = `\n    constructor(private readonly pwaUpdateService: PwaUpdateService) {\n        this.pwaUpdateService.init();\n    }\n`;
            after = after.replace(/(export\s+class\s+AppComponent\b[^{]*\{)/m, `$1${ctor}`);
        } else {
            vscode.window.showWarningMessage('Wizly: Could not safely wire update handling into AppComponent. Created pwa-update.service.ts only.');
            if (after !== before) {
                fs.writeFileSync(appComponentPath, after, 'utf8');
            }
            return servicePath;
        }

        if (after !== before) {
            fs.writeFileSync(appComponentPath, after, 'utf8');
        }

        return appComponentPath;
    };

    const updateHandlingDocToOpen = addUpdateHandling?.id === 'yes'
        ? await addPwaUpdateHandling()
        : undefined;

    const docToOpen = fs.existsSync(manifestPath)
        ? manifestPath
        : fs.existsSync(ngswConfigPath)
            ? ngswConfigPath
            : undefined;

    const effectiveDocToOpen = updateHandlingDocToOpen ?? docToOpen;
    if (effectiveDocToOpen) {
        const doc = await vscode.workspace.openTextDocument(effectiveDocToOpen);
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    vscode.window.showInformationMessage(`Wizly: Enabled PWA support for "${projectName}".`);
}

async function generatePwaIconsFromActiveImage() {
    const getActiveFileUri = (): vscode.Uri | undefined => {
        const uri = vscode.window.activeTextEditor?.document?.uri;
        if (uri && uri.scheme === 'file') { return uri; }
        const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const input: any = tab?.input;
        const tabUri: vscode.Uri | undefined = input?.uri;
        if (tabUri && tabUri.scheme === 'file') { return tabUri; }
        return undefined;
    };

    const activeUri = getActiveFileUri();
    if (!activeUri) {
        vscode.window.showErrorMessage('Wizly: Open the source icon image first, then run this command.');
        return;
    }

    const sourcePath = activeUri.fsPath;
    if (path.extname(sourcePath).toLowerCase() !== '.png') {
        vscode.window.showErrorMessage('Wizly: The active file must be a .png image.');
        return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Wizly: The active image must be inside an open workspace folder.');
        return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const srcRoot = path.join(workspaceRoot, 'src');
    const manifestPath = path.join(srcRoot, 'manifest.webmanifest');
    const ngswConfigPath = path.join(workspaceRoot, 'ngsw-config.json');

    if (!fs.existsSync(manifestPath) || !fs.existsSync(ngswConfigPath)) {
        vscode.window.showErrorMessage('Wizly: This workspace does not appear to be a PWA (manifest.webmanifest or ngsw-config.json not found).');
        return;
    }

    let manifest: any;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
        vscode.window.showErrorMessage(`Wizly: Failed to read ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }

    const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
    const parsedIcons: Array<{ size: number; src: string }> = [];
    for (const icon of icons) {
        const src = typeof icon?.src === 'string' ? icon.src : undefined;
        const sizes = typeof icon?.sizes === 'string' ? icon.sizes : undefined;
        if (!src || !sizes) { continue; }
        if (/^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) { continue; }
        for (const token of sizes.split(/\s+/g).filter(Boolean)) {
            const m = token.match(/^(?<w>\d+)x(?<h>\d+)$/i);
            const w = m?.groups?.w ? Number(m.groups.w) : NaN;
            const h = m?.groups?.h ? Number(m.groups.h) : NaN;
            if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) { continue; }
            if (w !== h) { continue; }
            parsedIcons.push({ size: w, src });
        }
    }

    const uniqueKey = (p: { size: number; src: string }) => `${p.size}::${p.src}`;
    const unique = new Map<string, { size: number; src: string }>();
    for (const p of parsedIcons) {
        unique.set(uniqueKey(p), p);
    }
    const iconTargets = [...unique.values()].sort((a, b) => a.size - b.size || a.src.localeCompare(b.src));
    if (iconTargets.length === 0) {
        vscode.window.showErrorMessage('Wizly: No local square icon targets found in src/manifest.webmanifest (icons[].src + icons[].sizes).');
        return;
    }

    let srcPng: PNG;
    try {
        const buf = fs.readFileSync(sourcePath);
        srcPng = PNG.sync.read(buf);
    } catch (err) {
        vscode.window.showErrorMessage(`Wizly: Failed to read PNG: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }

    const faviconSizes = [16, 32, 48];
    const maxIconSize = Math.max(
        ...iconTargets.map(t => t.size),
        ...faviconSizes
    );

    if (srcPng.width < maxIconSize || srcPng.height < maxIconSize) {
        vscode.window.showErrorMessage(`Wizly: The active image is too small (${srcPng.width}x${srcPng.height}). It must be at least ${maxIconSize}x${maxIconSize}.`);
        return;
    }

    const writeMode = await vscode.window.showQuickPick(
        [
            {
                label: 'Overwrite existing files',
                description: 'Regenerates icon files even if they already exist.',
                id: 'overwrite'
            },
            {
                label: 'Skip existing files',
                description: 'Only creates missing icon files.',
                id: 'skip'
            }
        ],
        { title: 'Wizly: Generate PWA icons and favicon' }
    );
    if (!writeMode) { return; }

    const overwrite = writeMode.id === 'overwrite';

    const resizeRgbaBilinear = (src: Buffer, srcW: number, srcH: number, dstW: number, dstH: number): Buffer => {
        const dst = Buffer.alloc(dstW * dstH * 4);
        const scaleX = srcW / dstW;
        const scaleY = srcH / dstH;

        const idx = (x: number, y: number, w: number) => (y * w + x) * 4;

        for (let y = 0; y < dstH; y++) {
            const srcY = (y + 0.5) * scaleY - 0.5;
            const y0 = Math.max(0, Math.floor(srcY));
            const y1 = Math.min(srcH - 1, y0 + 1);
            const wy = srcY - y0;

            for (let x = 0; x < dstW; x++) {
                const srcX = (x + 0.5) * scaleX - 0.5;
                const x0 = Math.max(0, Math.floor(srcX));
                const x1 = Math.min(srcW - 1, x0 + 1);
                const wx = srcX - x0;

                const i00 = idx(x0, y0, srcW);
                const i10 = idx(x1, y0, srcW);
                const i01 = idx(x0, y1, srcW);
                const i11 = idx(x1, y1, srcW);

                const w00 = (1 - wx) * (1 - wy);
                const w10 = wx * (1 - wy);
                const w01 = (1 - wx) * wy;
                const w11 = wx * wy;

                const di = idx(x, y, dstW);
                for (let c = 0; c < 4; c++) {
                    const v = src[i00 + c] * w00 + src[i10 + c] * w10 + src[i01 + c] * w01 + src[i11 + c] * w11;
                    dst[di + c] = Math.max(0, Math.min(255, Math.round(v)));
                }
            }
        }

        return dst;
    };

    const toPngBuffer = (rgba: Buffer, size: number): Buffer => {
        const p = new PNG({ width: size, height: size });
        p.data = rgba;
        return PNG.sync.write(p);
    };

    const ensureDir = (dirPath: string) => {
        if (fs.existsSync(dirPath)) { return; }
        fs.mkdirSync(dirPath, { recursive: true });
    };

    let written = 0;
    let skipped = 0;
    const warnings: string[] = [];

    for (const target of iconTargets) {
        const destAbs = path.resolve(path.dirname(manifestPath), target.src);
        ensureDir(path.dirname(destAbs));
        if (!overwrite && fs.existsSync(destAbs)) {
            skipped++;
            continue;
        }
        try {
            const rgba = resizeRgbaBilinear(srcPng.data as any, srcPng.width, srcPng.height, target.size, target.size);
            const out = toPngBuffer(rgba, target.size);
            fs.writeFileSync(destAbs, out);
            written++;
        } catch (err) {
            warnings.push(`${path.relative(workspaceRoot, destAbs)}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    const buildIco = (images: Array<{ size: number; png: Buffer }>): Buffer => {
        const count = images.length;
        const headerSize = 6 + 16 * count;
        const dir = Buffer.alloc(headerSize);

        dir.writeUInt16LE(0, 0);
        dir.writeUInt16LE(1, 2);
        dir.writeUInt16LE(count, 4);

        let offset = headerSize;
        for (let i = 0; i < images.length; i++) {
            const { size, png } = images[i];
            const entryOffset = 6 + i * 16;
            dir.writeUInt8(size === 256 ? 0 : size, entryOffset + 0);
            dir.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
            dir.writeUInt8(0, entryOffset + 2);
            dir.writeUInt8(0, entryOffset + 3);
            dir.writeUInt16LE(1, entryOffset + 4);
            dir.writeUInt16LE(32, entryOffset + 6);
            dir.writeUInt32LE(png.length, entryOffset + 8);
            dir.writeUInt32LE(offset, entryOffset + 12);
            offset += png.length;
        }

        return Buffer.concat([dir, ...images.map(i => i.png)]);
    };

    const faviconAbs = path.join(srcRoot, 'favicon.ico');
    if (overwrite || !fs.existsSync(faviconAbs)) {
        try {
            const icoPngs = faviconSizes.map(size => {
                const rgba = resizeRgbaBilinear(srcPng.data as any, srcPng.width, srcPng.height, size, size);
                return { size, png: toPngBuffer(rgba, size) };
            });
            const ico = buildIco(icoPngs);
            fs.writeFileSync(faviconAbs, ico);
            written++;
        } catch (err) {
            warnings.push(`${path.relative(workspaceRoot, faviconAbs)}: ${err instanceof Error ? err.message : String(err)}`);
        }
    } else {
        skipped++;
    }

    if (warnings.length > 0) {
        const channel = getOutputChannel();
        channel.show(true);
        channel.appendLine('Wizly: PWA icon generation warnings:');
        for (const w of warnings) { channel.appendLine(`- ${w}`); }
    }

    const message = `Wizly: Generated PWA icons from ${path.basename(sourcePath)}. Written: ${written}, skipped: ${skipped}.`;
    if (warnings.length > 0) {
        vscode.window.showWarningMessage(message);
    } else {
        vscode.window.showInformationMessage(message);
    }
}

async function generateAngularMaterialThemeScss() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Wizly: Please open a folder first.');
        return;
    }

    const themeNameRaw = await vscode.window.showInputBox({
        title: 'Wizly: Theme name',
        prompt: 'Enter a theme name (e.g. acme, client-a, demo)',
        validateInput: (value) => {
            const v = value.trim();
            if (!v) { return 'Theme name is required.'; }
            if (!/^[a-zA-Z0-9][a-zA-Z0-9-_]*$/.test(v)) {
                return 'Use letters, numbers, hyphen and underscore only.';
            }
            return undefined;
        }
    });
    if (!themeNameRaw) { return; }
    const themeName = themeNameRaw.trim();

    const modePick = await vscode.window.showQuickPick(
        [
            { label: 'Light', description: 'Generates a light Angular Material theme.', id: 'light' },
            { label: 'Dark', description: 'Generates a dark Angular Material theme.', id: 'dark' }
        ],
        { title: 'Wizly: Theme mode' }
    );
    if (!modePick) { return; }
    const mode = modePick.id as 'light' | 'dark';

    const suffixPick = await vscode.window.showQuickPick(
        [
            { label: 'Yes (recommended)', description: `File/bundle will include "-${mode}" suffix.`, id: 'yes' },
            { label: 'No', description: 'File/bundle will not include the mode suffix.', id: 'no' }
        ],
        { title: 'Wizly: Include light/dark suffix in file and bundle name?' }
    );
    if (!suffixPick) { return; }
    const includeModeSuffix = suffixPick.id === 'yes';

    const readHex = (label: string) => {
        return vscode.window.showInputBox({
            title: `Wizly: ${label} color`,
            prompt: 'Enter a hex color (#RRGGBB)',
            validateInput: (value) => {
                const v = value.trim();
                if (!/^#?[0-9a-fA-F]{6}$/.test(v)) { return 'Use hex like #3f51b5.'; }
                return undefined;
            }
        });
    };

    const primaryHexRaw = await readHex('Primary');
    if (!primaryHexRaw) { return; }
    const secondaryHexRaw = await readHex('Secondary');
    if (!secondaryHexRaw) { return; }

    const warnPick = await vscode.window.showQuickPick(
        [
            { label: 'Default (Material red)', description: 'Uses the built-in mat.$red-palette for warn.', id: 'default' },
            { label: 'Custom', description: 'Provide a custom hex color for warn.', id: 'custom' }
        ],
        { title: 'Wizly: Warn/Error color' }
    );
    if (!warnPick) { return; }

    const warnHexRaw = warnPick.id === 'custom' ? await readHex('Warn/Error') : undefined;
    if (warnPick.id === 'custom' && !warnHexRaw) { return; }

    const normalizeHex = (hex: string) => {
        const v = hex.trim();
        const h = v.startsWith('#') ? v.slice(1) : v;
        return `#${h.toLowerCase()}`;
    };

    const primaryHex = normalizeHex(primaryHexRaw);
    const secondaryHex = normalizeHex(secondaryHexRaw);
    const warnHex = warnHexRaw ? normalizeHex(warnHexRaw) : undefined;

    const excludeGlob = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.vs/**,**/.vscode/**}';
    const candidates: Array<{ folder: vscode.WorkspaceFolder; angularJsonUri: vscode.Uri }> = [];
    for (const folder of workspaceFolders) {
        const found = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/angular.json'), excludeGlob);
        for (const angularJsonUri of found) {
            candidates.push({ folder, angularJsonUri });
        }
    }
    if (candidates.length === 0) {
        vscode.window.showErrorMessage('Wizly: No angular.json found in the workspace.');
        return;
    }

    const toDisplayPath = (candidate: { folder: vscode.WorkspaceFolder; angularJsonUri: vscode.Uri }) => {
        const rel = path.relative(candidate.folder.uri.fsPath, candidate.angularJsonUri.fsPath);
        return `${candidate.folder.name}: ${rel}`;
    };

    let chosen = candidates[0];
    if (candidates.length > 1) {
        const picked = await vscode.window.showQuickPick(
            candidates.map((c, i) => ({
                label: toDisplayPath(c),
                description: path.dirname(c.angularJsonUri.fsPath),
                index: i
            })),
            { title: 'Wizly: Choose Angular workspace (angular.json)' }
        );
        if (!picked) { return; }
        chosen = candidates[picked.index];
    }

    const workspaceRoot = path.dirname(chosen.angularJsonUri.fsPath);
    const angularJsonPath = chosen.angularJsonUri.fsPath;
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        vscode.window.showErrorMessage(`Wizly: Could not find package.json next to angular.json (${packageJsonPath}).`);
        return;
    }

    const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    const writeJson = (filePath: string, value: any) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    const angularJson = readJson<any>(angularJsonPath);
    const packageJson = readJson<any>(packageJsonPath);

    const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
    const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
    const hasMaterial = typeof deps['@angular/material'] === 'string'
        || typeof devDeps['@angular/material'] === 'string'
        || fs.existsSync(path.join(workspaceRoot, 'node_modules', '@angular', 'material', 'package.json'));
    if (!hasMaterial) {
        vscode.window.showErrorMessage('Wizly: @angular/material was not found in this workspace. Install Angular Material first, then try again.');
        return;
    }

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const defaultProjectName = typeof angularJson?.defaultProject === 'string' ? angularJson.defaultProject : undefined;

    const isAppProject = (proj: any) => {
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && (builder.includes(':application') || builder.includes(':browser') || builder.includes('application') || builder.includes('browser'));
    };

    const appProjectNames = Object.keys(projects).filter(name => isAppProject(projects[name]));
    if (appProjectNames.length === 0) {
        vscode.window.showErrorMessage('Wizly: No Angular application projects found in angular.json.');
        return;
    }

    let projectName = defaultProjectName && appProjectNames.includes(defaultProjectName) ? defaultProjectName : appProjectNames[0];
    if (appProjectNames.length > 1) {
        const picked = await vscode.window.showQuickPick(
            appProjectNames.map(name => ({
                label: name,
                description: name === defaultProjectName ? 'defaultProject' : undefined
            })),
            { title: 'Wizly: Choose Angular project to add the theme bundle to' }
        );
        if (!picked) { return; }
        projectName = picked.label;
    }

    const themeBase = includeModeSuffix ? `${themeName}-${mode}` : themeName;
    const themeFileName = `${themeBase}.theme.scss`;
    const themeRelPath = `src/scss/themes/${themeFileName}`.replace(/\\/g, '/');
    const themeAbsPath = path.join(workspaceRoot, 'src', 'scss', 'themes', themeFileName);

    if (fs.existsSync(themeAbsPath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `Wizly: ${themeRelPath} already exists. Overwrite?`,
            'Overwrite',
            'Cancel'
        );
        if (overwrite !== 'Overwrite') { return; }
    }

    const parseRgb = (hex: string) => {
        const h = hex.replace('#', '');
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return { r, g, b };
    };

    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

    const mix = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) => {
        return {
            r: clamp(a.r + (b.r - a.r) * t),
            g: clamp(a.g + (b.g - a.g) * t),
            b: clamp(a.b + (b.b - a.b) * t),
        };
    };

    const rgbToHex = (rgb: { r: number; g: number; b: number }) => `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;

    const relativeLuminance = (rgb: { r: number; g: number; b: number }) => {
        const toLinear = (c: number) => {
            const s = c / 255;
            return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const r = toLinear(rgb.r);
        const g = toLinear(rgb.g);
        const b = toLinear(rgb.b);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const contrastText = (hex: string) => {
        const lum = relativeLuminance(parseRgb(hex));
        return lum > 0.5 ? '#000000' : '#ffffff';
    };

    const buildPalette = (baseHex: string) => {
        const base = parseRgb(baseHex);
        const white = { r: 255, g: 255, b: 255 };
        const black = { r: 0, g: 0, b: 0 };
        const tints: Record<number, string> = {
            50: rgbToHex(mix(base, white, 0.92)),
            100: rgbToHex(mix(base, white, 0.80)),
            200: rgbToHex(mix(base, white, 0.65)),
            300: rgbToHex(mix(base, white, 0.50)),
            400: rgbToHex(mix(base, white, 0.30)),
            500: rgbToHex(base),
            600: rgbToHex(mix(base, black, 0.12)),
            700: rgbToHex(mix(base, black, 0.24)),
            800: rgbToHex(mix(base, black, 0.36)),
            900: rgbToHex(mix(base, black, 0.50)),
        };
        const accents: Record<string, string> = {
            A100: tints[200],
            A200: tints[500],
            A400: tints[700],
            A700: tints[800],
        };
        const contrast: Record<string, string> = {};
        for (const k of Object.keys(tints)) {
            contrast[k] = contrastText((tints as any)[k]);
        }
        for (const k of Object.keys(accents)) {
            contrast[k] = contrastText((accents as any)[k]);
        }
        return { tints, accents, contrast };
    };

    const primaryPalette = buildPalette(primaryHex);
    const secondaryPalette = buildPalette(secondaryHex);
    const warnPalette = warnHex ? buildPalette(warnHex) : undefined;

    const toScssMap = (entries: Record<string | number, string>, indent: string) => {
        const keys = Object.keys(entries);
        const lines: string[] = [];
        for (const k of keys) {
            lines.push(`${indent}${k}: ${(entries as any)[k]},`);
        }
        return lines.join('\n');
    };

    const primaryMap = `(\n${toScssMap(primaryPalette.tints, '    ')}\n${toScssMap(primaryPalette.accents, '    ')}\n    contrast: (\n${toScssMap(primaryPalette.contrast, '      ')}\n    ),\n)`;
    const secondaryMap = `(\n${toScssMap(secondaryPalette.tints, '    ')}\n${toScssMap(secondaryPalette.accents, '    ')}\n    contrast: (\n${toScssMap(secondaryPalette.contrast, '      ')}\n    ),\n)`;
    const warnMap = warnPalette
        ? `(\n${toScssMap(warnPalette.tints, '    ')}\n${toScssMap(warnPalette.accents, '    ')}\n    contrast: (\n${toScssMap(warnPalette.contrast, '      ')}\n    ),\n)`
        : undefined;

    const themeVarName = themeBase.replace(/[^a-zA-Z0-9]/g, '_');
    const themeScss = `@use '@angular/material' as mat;\n\n$${themeVarName}_primary_palette: ${primaryMap};\n$${themeVarName}_secondary_palette: ${secondaryMap};\n${warnPick.id === 'custom' ? `$${themeVarName}_warn_palette: ${warnMap};\n` : ''}\n$${themeVarName}_primary: mat.define-palette($${themeVarName}_primary_palette, 500);\n$${themeVarName}_secondary: mat.define-palette($${themeVarName}_secondary_palette, A200, A100, A400);\n$${themeVarName}_warn: ${warnPick.id === 'custom' ? `mat.define-palette($${themeVarName}_warn_palette, 500)` : `mat.define-palette(mat.$red-palette)`};\n\n$${themeVarName}_theme: mat.define-${mode}-theme((\n  color: (\n    primary: $${themeVarName}_primary,\n    accent: $${themeVarName}_secondary,\n    warn: $${themeVarName}_warn,\n  ),\n));\n\n@include mat.all-component-colors($${themeVarName}_theme);\n`;

    const themesDir = path.dirname(themeAbsPath);
    if (!fs.existsSync(themesDir)) {
        fs.mkdirSync(themesDir, { recursive: true });
    }
    fs.writeFileSync(themeAbsPath, themeScss, 'utf8');

    const getTargets = (proj: any) => (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
    const targets = getTargets(projects[projectName]);
    const buildOptions = targets?.build?.options && typeof targets.build.options === 'object' ? targets.build.options : undefined;
    if (!buildOptions) {
        vscode.window.showWarningMessage(`Wizly: Could not find build options for project "${projectName}". Theme file was created, but angular.json was not updated.`);
    } else {
        buildOptions.styles = Array.isArray(buildOptions.styles) ? buildOptions.styles : [];
        const styles = buildOptions.styles as any[];
        const already = styles.some((s) => {
            if (typeof s === 'string') { return s.replace(/\\/g, '/') === themeRelPath; }
            if (s && typeof s === 'object' && typeof s.input === 'string') { return String(s.input).replace(/\\/g, '/') === themeRelPath; }
            return false;
        });

        if (!already) {
            styles.push({
                input: themeRelPath,
                bundleName: themeBase,
                inject: false
            });
            writeJson(angularJsonPath, angularJson);
        }
    }

    const doc = await vscode.workspace.openTextDocument(themeAbsPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage(`Wizly: Generated Angular Material theme: ${themeRelPath}`);
}

export function activate(context: vscode.ExtensionContext) {
    // Register commands
    const transformDisposable = vscode.commands.registerCommand('wizly.transformCurrentFile', transformCurrentFile);
    const transformUncommittedDisposable = vscode.commands.registerCommand('wizly.transformUncommittedFiles', transformUncommittedFiles);
    const convertAngularProjectToScssDisposable = vscode.commands.registerCommand('wizly.convertAngularProjectToScss', convertAngularProjectToScss);
    const convertAngularProjectToPwaDisposable = vscode.commands.registerCommand('wizly.convertAngularProjectToPwa', convertAngularProjectToPwa);
    const generatePwaIconsFromImageDisposable = vscode.commands.registerCommand('wizly.generatePwaIconsFromImage', generatePwaIconsFromActiveImage);
    const generateAngularMaterialThemeScssDisposable = vscode.commands.registerCommand('wizly.generateAngularMaterialThemeScss', generateAngularMaterialThemeScss);
    
    const exportSettingsDisposable = vscode.commands.registerCommand('wizly.exportSettings', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Wizly: Please open a folder first.');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const configDir = path.join(rootPath, '.vswizly');

        try {
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir);
            }

            const configPath = path.join(configDir, 'wizly.config.js');
            if (!fs.existsSync(configPath)) {
                fs.writeFileSync(configPath, DEFAULT_SETTINGS_CONTENT, 'utf8');
                vscode.window.showInformationMessage(`Wizly: Created default config at ${configPath}`);
            } else {
                vscode.window.showWarningMessage(`Wizly: Config file already exists at ${configPath}`);
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Wizly: Failed to export settings: ${err}`);
        }
    });

    const exportTemplatesDisposable = vscode.commands.registerCommand('wizly.exportTemplates', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Wizly: Please open a folder first.');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const configDir = path.join(rootPath, '.vswizly');

        try {
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir);
            }

            const templatesDir = path.join(configDir, 'templates');
            if (!fs.existsSync(templatesDir)) {
                fs.mkdirSync(templatesDir);
            }

            const extTemplatesDir = path.join(__dirname, '..', 'templates');
            if (fs.existsSync(extTemplatesDir)) {
                let copiedCount = 0;
                const copyDir = (srcDir: string, destDir: string) => {
                    if (!fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir, { recursive: true });
                    }
                    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
                        const src = path.join(srcDir, entry.name);
                        const dest = path.join(destDir, entry.name);
                        if (entry.isDirectory()) {
                            copyDir(src, dest);
                        } else if (entry.name.endsWith('.ejs') && !fs.existsSync(dest)) {
                            fs.copyFileSync(src, dest);
                            copiedCount++;
                        }
                    }
                };
                copyDir(extTemplatesDir, templatesDir);
                if (copiedCount > 0) {
                    vscode.window.showInformationMessage(`Wizly: Exported ${copiedCount} templates to ${templatesDir}`);
                } else {
                    vscode.window.showInformationMessage(`Wizly: All templates already exist in ${templatesDir}`);
                }
            } else {
                vscode.window.showErrorMessage('Wizly: Could not find internal templates folder.');
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Wizly: Failed to export templates: ${err}`);
        }
    });

    const exportRulesDisposable = vscode.commands.registerCommand('wizly.exportRules', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Wizly: Please open a folder first.');
            return;
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        const configDir = path.join(rootPath, '.vswizly');
        const rulesPath = path.join(configDir, 'wizly.rules.js');
        
        try {
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir);
            }
            
            if (fs.existsSync(rulesPath)) {
                const answer = await vscode.window.showWarningMessage(
                    `Wizly: Rules file already exists at ${rulesPath}. Overwrite?`,
                    'Yes', 'No'
                );
                if (answer !== 'Yes') { return; }
            }
            
            // Read default rules from extension
            const defaultRulesPath = path.join(__dirname, '..', 'default.rules.js');
            if (fs.existsSync(defaultRulesPath)) {
                const content = fs.readFileSync(defaultRulesPath, 'utf8');
                fs.writeFileSync(rulesPath, content, 'utf8');
                vscode.window.showInformationMessage(`Wizly: Exported advanced rules to ${rulesPath}`);
            } else {
                vscode.window.showErrorMessage('Wizly: Could not find internal default rules file.');
            }
            
        } catch (err) {
            vscode.window.showErrorMessage(`Wizly: Failed to export rules: ${err}`);
        }
    });

    const patchTemplatesDisposable = vscode.commands.registerCommand('wizly.patchTemplates', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Wizly: Please open a folder first.');
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const configDir = path.join(rootPath, '.vswizly');
        const extDir = path.join(__dirname, '..');
        await patchTemplates(extDir, configDir);
    });

    const patchRulesDisposable = vscode.commands.registerCommand('wizly.patchRules', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Wizly: Please open a folder first.');
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const configDir = path.join(rootPath, '.vswizly');
        const extDir = path.join(__dirname, '..');
        await patchRules(extDir, configDir);
    });

    const patchSettingsDisposable = vscode.commands.registerCommand('wizly.patchSettings', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Wizly: Please open a folder first.');
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const configDir = path.join(rootPath, '.vswizly');
        await patchSettings(configDir);
    });

    const syncSharedModulesDisposable = vscode.commands.registerCommand('wizly.syncSharedModules', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('Wizly: Please open a folder first.');
            return;
        }

        const gitMarkerPath = path.join(workspaceRoot, '.git');
        if (!fs.existsSync(gitMarkerPath)) {
            const proceed = await vscode.window.showWarningMessage(
                'Wizly: This folder does not appear to be a Git repository (.git not found). This command updates files and cannot be automatically undone. Do you want to continue?',
                { modal: true },
                'Yes',
                'No'
            );
            if (proceed !== 'Yes') { return; }
        }

        const cached = getCachedSettings() ?? {};
        const angularConfig = (cached as any).angular ?? vscode.workspace.getConfiguration('wizly').get<any>('angular');
        const angular: AngularSyncSettings = angularConfig && typeof angularConfig === 'object'
            ? angularConfig
            : {};

        const sharedTarget = angular.modules?.shared ?? { filePath: 'src/app/shared/shared.module.ts', className: 'SharedModule' };
        const sharedMaterialTarget = angular.modules?.sharedMaterial ?? { filePath: 'src/app/shared/material/material.module.ts', className: 'SharedMaterialModule' };
        const includePatterns = angular.magicGenLibModule?.include ?? ['**/magic.gen.lib.module.ts'];
        const excludePatterns = angular.magicGenLibModule?.exclude ?? ['**/node_modules/**', '**/dist/**', '**/out/**'];
        const excludeGlob = excludePatterns.length > 1 ? `{${excludePatterns.join(',')}}` : excludePatterns[0];

        const sharedAbs = path.isAbsolute(sharedTarget.filePath) ? sharedTarget.filePath : path.join(workspaceRoot, sharedTarget.filePath);
        const sharedMaterialAbs = path.isAbsolute(sharedMaterialTarget.filePath) ? sharedMaterialTarget.filePath : path.join(workspaceRoot, sharedMaterialTarget.filePath);

        const modes = getModes();
        const ruleReqs: AngularImportRequirement[] = [];
        for (const mode of modes) {
            if (!mode.active) { continue; }
            for (const rule of mode.rules) {
                if (!rule.active) { continue; }
                const ngImports = (rule as any).requires?.ngModuleImports;
                if (!Array.isArray(ngImports)) { continue; }
                for (const item of ngImports) {
                    if (typeof item === 'string') {
                        ruleReqs.push({ name: item, placement: 'local' });
                    } else if (item && typeof item === 'object') {
                        ruleReqs.push({
                            name: String((item as any).name ?? ''),
                            from: typeof (item as any).from === 'string' ? (item as any).from : undefined,
                            placement: (item as any).placement === 'shared' || (item as any).placement === 'sharedMaterial' || (item as any).placement === 'local'
                                ? (item as any).placement
                                : undefined,
                        });
                    }
                }
            }
        }

        const magicFiles: vscode.Uri[] = [];
        for (const inc of includePatterns) {
            const found = await vscode.workspace.findFiles(inc, excludeGlob);
            for (const f of found) { magicFiles.push(f); }
        }
        const uniqueMagic = Array.from(new Set(magicFiles.map(u => u.fsPath))).map(p => vscode.Uri.file(p));
        if (uniqueMagic.length === 0) {
            vscode.window.showWarningMessage('Wizly: No Magic module files found (magic.gen.lib.module.ts). Nothing to sync.');
            return;
        }

        const allReqs = mergeAndDedupeRequirements(ruleReqs);
        const partitions = partitionRequirements(allReqs);
        const materialSpecsFromRules = partitions.sharedMaterial
            .filter(r => !!r.from)
            .map(r => ({ name: r.name, from: r.from as string }));

        const inferMaterialSpecsFromMagic = (): { name: string; from: string }[] => {
            const wantedPrefixes = ['@angular/material/', '@angular/cdk/', '@magic-xpa/angular-material-core'];
            const pairs: Array<{ name: string; from: string }> = [];

            for (const uri of uniqueMagic) {
                const text = fs.readFileSync(uri.fsPath, 'utf8');
                const sf = ts.createSourceFile(uri.fsPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
                for (const st of sf.statements) {
                    if (!ts.isImportDeclaration(st)) { continue; }
                    if (!ts.isStringLiteral(st.moduleSpecifier)) { continue; }
                    const from = st.moduleSpecifier.text;
                    if (!wantedPrefixes.some(p => from === p || from.startsWith(p))) { continue; }
                    const clause = st.importClause;
                    const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings : undefined;
                    if (!named) { continue; }
                    for (const el of named.elements) {
                        const name = el.name.text;
                        if (!name.endsWith('Module')) { continue; }
                        pairs.push({ name, from });
                    }
                }
            }

            const deduped = new Map<string, { name: string; from: string }>();
            for (const p of pairs) {
                deduped.set(`${p.from}::${p.name}`, p);
            }
            return [...deduped.values()].sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
        };

        const materialSpecs = materialSpecsFromRules.length > 0 ? materialSpecsFromRules : inferMaterialSpecsFromMagic();
        const hasExistingSharedMaterialModule = fs.existsSync(sharedMaterialAbs);
        const shouldUseSharedMaterialModule = materialSpecs.length > 0 || hasExistingSharedMaterialModule;
        if (!shouldUseSharedMaterialModule) {
            vscode.window.showWarningMessage(
                "Wizly: No Angular Material imports found to move to SharedMaterialModule. Nothing to sync. If you want to drive this explicitly, export advanced rules and add requires.ngModuleImports entries with placement: 'sharedMaterial'."
            );
            return;
        }

        const loadPrettier = async (): Promise<any> => {
            try {
                const resolvedPath = require.resolve('prettier', { paths: [workspaceRoot] });
                const mod = await import(resolvedPath);
                return (mod as any).default ?? mod;
            } catch {
                const mod = await import('prettier');
                return (mod as any).default ?? mod;
            }
        };

        const formatTs = async (code: string, filePath: string) => {
            const p = await loadPrettier();
            const resolvedConfig = await p.resolveConfig(filePath).catch(() => null);
            const plugins: any[] = [];
            try {
                const mod = await import('prettier/plugins/typescript');
                plugins.push((mod as any).default ?? mod);
            } catch {
            }
            return p.format(code, {
                parser: 'typescript',
                filepath: filePath,
                printWidth: 80,
                tabWidth: 2,
                singleQuote: false,
                trailingComma: 'none',
                ...(resolvedConfig ?? {}),
                ...(plugins.length > 0 ? { plugins: [...((resolvedConfig as any)?.plugins ?? []), ...plugins] } : {}),
            });
        };

        const ensureDir = (filePath: string) => {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        };

        const updateModuleFile = async (filePath: string, className: string, neededModules: { name: string; from: string }[], extraImports?: { name: string; from: string }[]) => {
            ensureDir(filePath);
            const exists = fs.existsSync(filePath);
            let text = exists ? fs.readFileSync(filePath, 'utf8') : '';
            if (!text.trim()) {
                const tpl = extraImports
                    ? getSharedModuleTemplate({
                        sharedClassName: className,
                        sharedMaterialClassName: extraImports[0].name,
                        sharedMaterialImportPath: extraImports[0].from,
                    })
                    : getSharedMaterialModuleTemplate({ className, materialImports: neededModules });
                fs.writeFileSync(filePath, await formatTs(tpl, filePath), 'utf8');
                return;
            }

            const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
            let next = sf;

            if (extraImports && extraImports.length > 0) {
                for (const imp of extraImports) {
                    next = ensureNamedImport(next, imp.from, imp.name, imp.from);
                }
                next = ensureNamedImport(next, '@angular/common', 'CommonModule', '@angular/common');
                next = ensureNamedImport(next, '@angular/core', 'NgModule', '@angular/core');
                next = ensureNgModuleImports(next, ['CommonModule', ...extraImports.map(i => i.name)]);
                next = ensureNgModuleExports(next, ['CommonModule', ...extraImports.map(i => i.name)]);
            } else {
                next = ensureNamedImport(next, '@angular/core', 'NgModule', '@angular/core');
                for (const imp of neededModules) {
                    next = ensureNamedImport(next, imp.from, imp.name, imp.from);
                }
                const names = neededModules.map(m => m.name);
                next = ensureNgModuleImports(next, names);
                next = ensureNgModuleExports(next, names);
            }

            const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
            const printed = printer.printFile(next as any);
            fs.writeFileSync(filePath, await formatTs(printed, filePath), 'utf8');
        };

        const sharedMaterialRelFromShared = toRelativeModuleImport(path.dirname(sharedAbs), sharedMaterialAbs);
        await updateModuleFile(sharedMaterialAbs, sharedMaterialTarget.className, materialSpecs);
        await updateModuleFile(sharedAbs, sharedTarget.className, [], [{ name: sharedMaterialTarget.className, from: sharedMaterialRelFromShared }]);

        const sharedImportName = sharedTarget.className;
        const sharedMaterialImportName = sharedMaterialTarget.className;

        for (const uri of uniqueMagic) {
            const filePath = uri.fsPath;
            const original = fs.readFileSync(filePath, 'utf8');
            const sf = ts.createSourceFile(filePath, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
            let next = sf;

            const sharedRel = toRelativeModuleImport(path.dirname(filePath), sharedAbs);
            const sharedMatRel = toRelativeModuleImport(path.dirname(filePath), sharedMaterialAbs);
            next = ensureNamedImport(next, '@angular/core', 'NgModule', '@angular/core');
            next = ensureNamedImport(next, sharedRel, sharedImportName, sharedRel);
            next = ensureNgModuleImports(next, [sharedImportName]);
            next = removeNamedImport(next, sharedMatRel, [sharedMaterialImportName]);
            next = removeNgModuleImports(next, [sharedMaterialImportName]);

            // Prune moved sharedMaterial imports from magic.gen.lib.module.ts to avoid duplicates.
            for (const m of materialSpecs) {
                next = removeNamedImport(next, m.from, [m.name]);
            }
            next = removeNgModuleImports(next, materialSpecs.map(m => m.name));

            const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
            const printed = printer.printFile(next as any);
            const formatted = await formatTs(printed, filePath);
            if (formatted.trim() !== original.trim()) {
                fs.writeFileSync(filePath, formatted, 'utf8');
            }
        }

        vscode.window.showInformationMessage(`Wizly: Synced shared modules. Updated ${uniqueMagic.length} Magic module file(s).`);
    });

    context.subscriptions.push(transformDisposable);
    context.subscriptions.push(transformUncommittedDisposable);
    context.subscriptions.push(convertAngularProjectToScssDisposable);
    context.subscriptions.push(convertAngularProjectToPwaDisposable);
    context.subscriptions.push(generatePwaIconsFromImageDisposable);
    context.subscriptions.push(generateAngularMaterialThemeScssDisposable);
    context.subscriptions.push(exportSettingsDisposable);
    context.subscriptions.push(exportTemplatesDisposable);
    context.subscriptions.push(exportRulesDisposable);
    context.subscriptions.push(patchTemplatesDisposable);
    context.subscriptions.push(patchRulesDisposable);
    context.subscriptions.push(patchSettingsDisposable);
    context.subscriptions.push(syncSharedModulesDisposable);

    // Status bar
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'wizly.openConfig';
    context.subscriptions.push(statusBarItem);

    const updateStatusBar = () => {
        const modes = getModes();
        const ruleCount = modes.reduce((sum, m) => sum + (m.active ? m.rules.filter(r => r.active).length : 0), 0);
        const configSource = modes.length > 0 && modes[0].name !== 'Defaults' ? modes[0].name : 'defaults';
        statusBarItem.text = `$(wand) Wizly: ${ruleCount} rules`;
        statusBarItem.tooltip = `Wizly — ${ruleCount} active rules (${configSource})\nClick to open config`;
        statusBarItem.show();
    };

    const openConfigDisposable = vscode.commands.registerCommand('wizly.openConfig', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) { return; }
        const candidates = [
            path.join(workspaceRoot, '.vswizly', 'wizly.rules.js'),
            path.join(workspaceRoot, '.vswizly', 'wizly.config.js'),
            path.join(workspaceRoot, '.vswizly.js'),
        ];
        for (const filePath of candidates) {
            if (fs.existsSync(filePath)) {
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc);
                return;
            }
        }
        vscode.window.showInformationMessage('Wizly: No config file found. Use "Wizly: Export Settings" to create one.');
    });
    context.subscriptions.push(openConfigDisposable);

    updateStatusBar();

    // File watcher to clear cache on config change
    const watcher = vscode.workspace.createFileSystemWatcher('**/.vswizly/*.js');
    watcher.onDidChange(() => { refreshModes(); updateStatusBar(); });
    watcher.onDidCreate(() => { refreshModes(); updateStatusBar(); });
    watcher.onDidDelete(() => { refreshModes(); updateStatusBar(); });
    context.subscriptions.push(watcher);

    // Also watch legacy .vswizly.js
    const legacyWatcher = vscode.workspace.createFileSystemWatcher('**/.vswizly.js');
    legacyWatcher.onDidChange(() => { refreshModes(); updateStatusBar(); });
    legacyWatcher.onDidCreate(() => { refreshModes(); updateStatusBar(); });
    legacyWatcher.onDidDelete(() => { refreshModes(); updateStatusBar(); });
    context.subscriptions.push(legacyWatcher);

    // Auto-transform newly created or externally recreated HTML files
    const htmlWatcher = vscode.workspace.createFileSystemWatcher('**/*.html');

    const autoTransformFile = async (uri: vscode.Uri) => {
        const settings = getCachedSettings();
        const autoTransform = settings?.autoTransformOnCreate
            ?? vscode.workspace.getConfiguration('wizly').get<boolean>('autoTransformOnCreate', false);
        if (!autoTransform) { return; }

        const filePath = uri.fsPath;
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const originalText = document.getText();
            const transformedText = await transformText(originalText, filePath);

            if (transformedText !== originalText) {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(originalText.length)
                );
                edit.replace(uri, fullRange, transformedText);
                await vscode.workspace.applyEdit(edit);
                if (path.extname(filePath)) {
                    await document.save();
                }

                const showToast = getCachedSettings()?.autoTransformToast
                    ?? vscode.workspace.getConfiguration('wizly').get<boolean>('autoTransformToast', true);
                if (showToast) {
                    vscode.window.showInformationMessage(`Wizly: Auto-transformed ${path.basename(filePath)}`);
                }
            }
        } catch (error) {
            console.error(`Wizly: Failed to auto-transform ${filePath}:`, error);
        }
    };

    htmlWatcher.onDidCreate(autoTransformFile);

    // Also handle files that are externally recreated (e.g. overwritten by a generator).
    // Only runs when transformTag is enabled — the transform tag acts as an idempotency guard,
    // so re-running on an already-transformed file is a safe no-op.
    htmlWatcher.onDidChange(async (uri) => {
        const settings = getCachedSettings();
        const tagEnabled = settings?.transformTag?.enable
            ?? vscode.workspace.getConfiguration('wizly').get<boolean>('transformTag.enable', false);
        if (!tagEnabled) { return; }
        await autoTransformFile(uri);
    });

    context.subscriptions.push(htmlWatcher);

    // Auto-transform newly created TypeScript files (Magic-generated helpers/modules/components)
    const tsWatcher = vscode.workspace.createFileSystemWatcher('**/*.ts');

    const autoTransformTypeScriptFile = async (uri: vscode.Uri) => {
        const settings = getCachedSettings();
        const tsConfig = (settings as any)?.typescript
            ?? vscode.workspace.getConfiguration('wizly').get<any>('typescript');
        const autoTransformTs = !!tsConfig?.autoTransformOnCreate;
        const autoTransformComponents = !!tsConfig?.autoTransformComponentsOnCreate;
        if (!autoTransformTs && !autoTransformComponents) { return; }

        const filePath = uri.fsPath;
        const fileName = path.basename(filePath).toLowerCase();
        const isMagicHelperTs = fileName === 'magic.gen.lib.module.ts' || fileName.endsWith('.g.ts');
        const isComponentFile = fileName.endsWith('.component.ts');
        if (!isMagicHelperTs && !isComponentFile) { return; }

        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const originalText = document.getText();
            if (!isMagicHelperTs && isComponentFile) {
                if (!autoTransformComponents) { return; }
                const looksLikeMagicComponent = /\bextends\s+TaskBaseMagicComponent\b/.test(originalText)
                    || /\bextends\s+[A-Za-z0-9_]*MagicComponent\b/.test(originalText)
                    || /\bmagicProviders\b/.test(originalText)
                    || /(\.mg\.controls\.g\b)/.test(originalText);
                if (!looksLikeMagicComponent) { return; }
            } else {
                if (!autoTransformTs) { return; }
            }
            const transformedText = await transformText(originalText, filePath);

            if (transformedText !== originalText) {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(originalText.length)
                );
                edit.replace(uri, fullRange, transformedText);
                await vscode.workspace.applyEdit(edit);
                if (path.extname(filePath)) {
                    await document.save();
                }

                const showToast = getCachedSettings()?.autoTransformToast
                    ?? vscode.workspace.getConfiguration('wizly').get<boolean>('autoTransformToast', true);
                if (showToast) {
                    vscode.window.showInformationMessage(`Wizly: Auto-transformed ${path.basename(filePath)}`);
                }
            }
        } catch (error) {
            console.error(`Wizly: Failed to auto-transform ${filePath}:`, error);
        }
    };

    tsWatcher.onDidCreate(autoTransformTypeScriptFile);

    tsWatcher.onDidChange(async (uri) => {
        const settings = getCachedSettings();
        const tagEnabled = settings?.transformTag?.enable
            ?? vscode.workspace.getConfiguration('wizly').get<boolean>('transformTag.enable', false);
        if (!tagEnabled) { return; }
        await autoTransformTypeScriptFile(uri);
    });

    context.subscriptions.push(tsWatcher);
}

export function deactivate() {}
