
import * as vscode from 'vscode';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import * as fs from 'fs';
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
            if (normalized.includes('styles.scss')) { hasAnyStylesScssRef = true; }
        }
        for (const p of collectStyleEntries(testOptions?.styles)) {
            const normalized = p.replace(/\\/g, '/');
            if (normalized.includes('styles.css')) { hasAnyStylesCssRef = true; }
            if (normalized.includes('styles.scss')) { hasAnyStylesScssRef = true; }
        }
    }

    const rootSchematicsStyle = angularJson?.schematics?.['@schematics/angular:component']?.style;
    const isSchematicsScss = rootSchematicsStyle === 'scss';

    const srcDir = path.join(workspaceRoot, 'src');
    const stylesScssPath = path.join(srcDir, 'styles.scss');
    const alreadyConfigured = isSchematicsScss || hasAnyStylesScssRef || fs.existsSync(stylesScssPath);
    if (alreadyConfigured) {
        vscode.window.showErrorMessage('Wizly: This Angular workspace already appears to be configured for SCSS.');
        return;
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
                if (normalized.endsWith('styles.css')) {
                    styles[i] = s.slice(0, s.length - 'styles.css'.length) + 'styles.scss';
                    changed = true;
                }
            } else if (s && typeof s === 'object' && typeof (s as any).input === 'string') {
                const input = (s as any).input as string;
                const normalized = normalizeStyleRef(input);
                if (normalized.endsWith('styles.css')) {
                    (s as any).input = input.slice(0, input.length - 'styles.css'.length) + 'styles.scss';
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

    ensureFile(path.join(scssDir, '_tokens.scss'), `$font-family-base: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;\n$color-text: #0f172a;\n$color-bg: #ffffff;\n`);
    ensureFile(path.join(scssDir, '_mixins.scss'), ``);
    ensureFile(path.join(scssDir, '_base.scss'), `@use './tokens' as *;\n\nhtml,\nbody {\n  height: 100%;\n}\n\nbody {\n  margin: 0;\n  font-family: $font-family-base;\n  color: $color-text;\n  background: $color-bg;\n}\n`);
    ensureFile(path.join(scssDir, 'style.scss'), `@use './tokens' as *;\n@use './base';\n`);

    const stylesCssPath = path.join(srcDir, 'styles.css');
    if (fs.existsSync(stylesCssPath) && !fs.existsSync(stylesScssPath)) {
        fs.renameSync(stylesCssPath, stylesScssPath);
    }
    if (!fs.existsSync(stylesScssPath)) {
        fs.writeFileSync(stylesScssPath, `@use './scss/style';\n`, 'utf8');
    } else {
        const current = fs.readFileSync(stylesScssPath, 'utf8');
        if (!current.includes(`./scss/style`) && !current.includes(`scss/style`)) {
            fs.writeFileSync(stylesScssPath, `@use './scss/style';\n${current}`, 'utf8');
        }
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
                    description: 'Moves the contents into src/scss/_magic-styles.scss and deletes magic-styles.css.',
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
        } else if (action?.id === 'convert') {
            const magicScssPath = path.join(scssDir, '_magic-styles.scss');
            if (fs.existsSync(magicScssPath)) {
                const overwrite = await vscode.window.showWarningMessage(
                    'Wizly: src/scss/_magic-styles.scss already exists. Overwrite?',
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

            const styleEntryPath = path.join(scssDir, 'style.scss');
            if (fs.existsSync(styleEntryPath)) {
                const current = fs.readFileSync(styleEntryPath, 'utf8');
                if (!current.includes(`./magic-styles`) && !current.includes(`magic-styles`)) {
                    fs.writeFileSync(styleEntryPath, `${current.trimEnd()}\n@use './magic-styles';\n`, 'utf8');
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

    const doc = await vscode.workspace.openTextDocument(stylesScssPath);
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

    const hasFile = (name: string) => fs.existsSync(path.join(workspaceRoot, name));
    const pkgManager = hasFile('pnpm-lock.yaml') ? 'pnpm'
        : hasFile('yarn.lock') ? 'yarn'
            : 'npm';

    const cmd = pkgManager === 'pnpm'
        ? `pnpm exec ng add @angular/pwa --project "${projectName}" --skip-confirmation`
        : pkgManager === 'yarn'
            ? `yarn ng add @angular/pwa --project "${projectName}" --skip-confirmation`
            : `npx ng add @angular/pwa --project "${projectName}" --skip-confirmation`;

    const channel = getOutputChannel();
    channel.show(true);
    channel.appendLine(`Wizly: Enabling PWA for Angular project "${projectName}"...`);
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
        );
    } catch (err) {
        vscode.window.showErrorMessage(`Wizly: Failed to enable PWA. ${err instanceof Error ? err.message : String(err)}. Check the Wizly output for details.`);
        return;
    }

    const docToOpen = fs.existsSync(manifestPath)
        ? manifestPath
        : fs.existsSync(ngswConfigPath)
            ? ngswConfigPath
            : undefined;

    if (docToOpen) {
        const doc = await vscode.workspace.openTextDocument(docToOpen);
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    vscode.window.showInformationMessage(`Wizly: Enabled PWA support for "${projectName}".`);
}

export function activate(context: vscode.ExtensionContext) {
    // Register commands
    const transformDisposable = vscode.commands.registerCommand('wizly.transformCurrentFile', transformCurrentFile);
    const transformUncommittedDisposable = vscode.commands.registerCommand('wizly.transformUncommittedFiles', transformUncommittedFiles);
    const convertAngularProjectToScssDisposable = vscode.commands.registerCommand('wizly.convertAngularProjectToScss', convertAngularProjectToScss);
    const convertAngularProjectToPwaDisposable = vscode.commands.registerCommand('wizly.convertAngularProjectToPwa', convertAngularProjectToPwa);
    
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

        const allReqs = mergeAndDedupeRequirements(ruleReqs);
        const partitions = partitionRequirements(allReqs);
        const materialSpecs = partitions.sharedMaterial
            .filter(r => !!r.from)
            .map(r => ({ name: r.name, from: r.from as string }));

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

        const magicFiles: vscode.Uri[] = [];
        for (const inc of includePatterns) {
            const found = await vscode.workspace.findFiles(inc, excludeGlob);
            for (const f of found) { magicFiles.push(f); }
        }
        const uniqueMagic = Array.from(new Set(magicFiles.map(u => u.fsPath))).map(p => vscode.Uri.file(p));

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
            next = ensureNamedImport(next, sharedMatRel, sharedMaterialImportName, sharedMatRel);
            next = ensureNgModuleImports(next, [sharedImportName, sharedMaterialImportName]);

            // Prune moved sharedMaterial imports from magic.gen.lib.module.ts to avoid duplicates.
            const movedToShared = partitions.sharedMaterial.filter(r => !!r.from);
            for (const m of movedToShared) {
                next = removeNamedImport(next, m.from as string, [m.name]);
            }
            next = removeNgModuleImports(next, movedToShared.map(m => m.name));

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
