// src/extension.ts
import * as vscode from 'vscode';
import * as prettier from 'prettier';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface RegexRule {
    name: string;
    description: string;
    regex: string;
    flags?: string;
    replacement?: string;
    active: boolean;
    replaceAfterBeautify: boolean;
    filePattern: string;
}

interface Mode {
    name: string;
    rules: RegexRule[];
    active: boolean;
}

// Global variable to store modes
let cachedModes: Mode[] | null = null;
type WizlySettings = {
    transformTag: {
        enable: boolean;
        dateFormat: string;
        timeFormat: string;
        template?: string;
    };
    autoTransformOnCreate?: boolean;
    autoTransformToast?: boolean;
};
let cachedSettings: Partial<WizlySettings> | null = null;

// --- Transform Tag helpers ---
function resolveCommentStyle(filePath?: string): 'line' | 'block' | 'html' {
    const ext = filePath ? path.extname(filePath).toLowerCase() : '';
    if (ext === '.html' || ext === '.htm' || ext === '.xhtml') { return 'html'; }
    if (ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less') { return 'block'; }
    // Default to line for common code files
    return 'line';
}

function formatDateTime(date: Date, dateFormat: string, timeFormat: string): string {
    const YYYY = String(date.getFullYear());
    const YY = YYYY.slice(-2);
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');

    const formattedDate = dateFormat
        .replace(/YYYY/g, YYYY)
        .replace(/YY/g, YY)
        .replace(/MM/g, MM)
        .replace(/DD/g, DD);

    const formattedTime = timeFormat
        .replace(/HH/g, HH)
        .replace(/mm/g, mm)
        .replace(/ss/g, ss);

    return `${formattedDate} ${formattedTime}`.trim();
}

function escapeForRegex(text: string): string {
    // Escape regex special characters in a plain string
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTransformTag(filePath: string | undefined, dateFormat: string, timeFormat: string, template?: string): string {
    const style = resolveCommentStyle(filePath);
    const stamp = formatDateTime(new Date(), dateFormat, timeFormat);
    const content = template
        ? template.replace(/\{date\}/g, stamp.split(' ')[0]).replace(/\{time\}/g, stamp.split(' ')[1] || '')
        : `Wizly transformed: ${stamp}`;
    switch (style) {
        case 'html':
            return `<!-- ${content} -->`;
        case 'block':
            return `/* ${content} */`;
        default:
            return `// ${content}`;
    }
}

function hasTransformTag(text: string, filePath: string | undefined, template?: string): boolean {
    const style = resolveCommentStyle(filePath);
    if (template) {
        const tplEsc = escapeForRegex(template);
        const tplRegexBody = tplEsc
            .replace(/\{date\}/g, '.+')
            .replace(/\{time\}/g, '.+');
        const styleWrapped: Record<'line' | 'block' | 'html', RegExp> = {
            line: new RegExp('^\\s*\/\/\\s*' + tplRegexBody + '\\s*$', 'm'),
            block: new RegExp('^\\s*\/\\*\\s*' + tplRegexBody + '\\s*\\*\/', 'm'),
            html: new RegExp('^\\s*<!--\\s*' + tplRegexBody + '\\s*-->', 'm'),
        };
        return styleWrapped[style].test(text);
    } else {
        const patterns: Record<'line' | 'block' | 'html', RegExp> = {
            line: /^\s*\/\/\s*Wizly\s+transformed:/m,
            block: /^\s*\/\*\s*Wizly\s+transformed:[\s\S]*?\*\//m,
            html: /^\s*<!--\s*Wizly\s+transformed:/m,
        };
        return patterns[style].test(text);
    }
}

function isHtmlFile(filePath: string | undefined): boolean {
    if (!filePath) { return false; }
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.html' || ext === '.htm' || ext === '.xhtml';
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

    try {
        // Use the shared transformText function with file path for pattern matching
        const newText = await transformText(text, doc.fileName);

        const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(text.length)
        );

        // Apply the transformed text
        await editor.edit((editBuilder: vscode.TextEditorEdit) => {
            editBuilder.replace(fullRange, newText);
        });
        
        // Move cursor to the beginning of the document
        const newPosition = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(new vscode.Range(newPosition, newPosition));
        
        vscode.window.showInformationMessage('HTML transformation completed!');
    } catch (error) {
        vscode.window.showErrorMessage(`Error during transformation: ${error}`);
    }
}

async function formatWithPrettier(text: string): Promise<string> {
    try {
        let newText = await prettier.format(text, {
            parser: 'html',
            printWidth: 80,
            tabWidth: 2,
            singleQuote: false,
            trailingComma: 'none',
            htmlWhitespaceSensitivity: 'ignore',
        });
        
        const modes = getModes();
        
        // Apply regex replacements after beautify (replaceAfterBeautify: true)
        modes.forEach(mode => {
            if (!mode.active) { return; }
            mode.rules.forEach(rule => {
                if (!rule.active) { return; }
                try {
                    if (rule.replaceAfterBeautify) {
                        // Original regex replace functionality with global and multiline flags
                        const re = new RegExp(rule.regex, rule.flags ?? "gm");
                        newText = newText.replace(re, rule.replacement || '');
                    }
                } catch (error) {
                    console.error(`Error applying rule "${rule.description}": ${error}`);
                }
            });
        });
        
        return newText;
    } catch (error) {
        vscode.window.showWarningMessage(`Prettier formatting failed: ${error}`);
        return text; // Return original text if formatting fails
    }
}

function getModes(): Mode[] {
    if (cachedModes) {
        return cachedModes;
    }
    
    // Try to load modes from a workspace config file (preferred)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const root = workspaceFolder.uri.fsPath;
        const candidates = [
            path.join(root, '.vswizly.js'),
            path.join(root, '.vswizly.cjs'),
            path.join(root, '.vswizly.json'),
            path.join(root, '.vswizly')
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                const loaded = loadModesFromConfigSync(candidate);
                if (loaded && loaded.length > 0) {
                    cachedModes = loaded;
                    return loaded;
                }
            }
        }
    }

    // Try internal JS default rules file first
    try {
        const defaultsPath = path.join(__dirname, '..', 'default.rules.js');
        if (fs.existsSync(defaultsPath)) {
            const mod = require(defaultsPath);
            const data = mod && mod.default ? mod.default : mod;
            if (Array.isArray(data)) {
                const modes = [{ name: 'Defaults', active: true, rules: sanitizeRules(data) }];
                cachedModes = modes;
                return modes;
            }
            if (data && Array.isArray(data.rules)) {
                const modes = [{ name: 'Defaults', active: true, rules: sanitizeRules(data.rules) }];
                cachedModes = modes;
                return modes;
            }
        }
    } catch (err) {
        console.error('Failed to load internal default rules JS:', err);
    }

    // Fallback to VS Code settings or inline defaults
    const config = vscode.workspace.getConfiguration("wizly");
    const rules = config.get<RegexRule[]>("rules");
    const modes: Mode[] = rules && rules.length > 0
        ? [{ name: 'Config', active: true, rules: sanitizeRules(rules) }]
        : getDefaultModes();
    cachedModes = modes;
    return modes;
}

function getDefaultModes(): Mode[] {
    try {
        const defaultsPath = path.join(__dirname, '..', 'default.rules.js');
        if (fs.existsSync(defaultsPath)) {
            const mod = require(defaultsPath);
            const data = mod && mod.default ? mod.default : mod;
            if (Array.isArray(data)) {
                return [{ name: 'Defaults', active: true, rules: sanitizeRules(data) }];
            }
            if (data && Array.isArray(data.rules)) {
                return [{ name: 'Defaults', active: true, rules: sanitizeRules(data.rules) }];
            }
        }
    } catch (err) {
        console.error('Failed to load internal default rules JS:', err);
    }
    return [{ name: 'Defaults', active: true, rules: [] }];
}

function refreshModes(): void {
    cachedModes = null;
    cachedSettings = null;
}

// Load modes from a JSON config file synchronously
function loadModesFromConfigSync(filePath: string): Mode[] | null {
    try {
        const ext = path.extname(filePath).toLowerCase();
        let data: any;
        if (ext === '.js' || ext === '.cjs') {
            const mod = require(filePath);
            data = mod && mod.default ? mod.default : mod;
        } else {
            const raw = fs.readFileSync(filePath, 'utf8');
            data = JSON.parse(raw);
        }

        // Capture optional settings from config (top-level `transformTag` and auto flags)
        const s = (data && data.transformTag) ? data.transformTag : null;
        const autoCreate = (data && typeof data.autoTransformOnCreate !== 'undefined') ? !!data.autoTransformOnCreate : undefined;
        const autoToast = (data && typeof data.autoTransformToast !== 'undefined') ? !!data.autoTransformToast : undefined;
        if (s || typeof autoCreate !== 'undefined' || typeof autoToast !== 'undefined') {
            cachedSettings = {
                transformTag: s ? {
                    enable: s.enable ?? undefined,
                    dateFormat: s.dateFormat ?? undefined,
                    timeFormat: s.timeFormat ?? undefined,
                    template: s.template ?? undefined,
                } : cachedSettings?.transformTag,
                autoTransformOnCreate: autoCreate,
                autoTransformToast: autoToast,
            };
        }

        // Accept flexible shapes: {rules: [...]}, or an array of rules
        if (Array.isArray(data)) {
            return [{ name: 'Config', active: true, rules: sanitizeRules(data) }];
        }
        if (data && Array.isArray(data.rules)) {
            return [{ name: String(data.name ?? 'Config'), active: true, rules: sanitizeRules(data.rules) }];
        }
        return null;
    } catch (err) {
        console.error(`Failed to load Wizly config from ${filePath}:`, err);
        return null;
    }
}

// Ensure rules have the required shape and types
function sanitizeRules(rawRules: any[]): RegexRule[] {
    return (rawRules || [])
        .filter(r => r && typeof r.regex !== 'undefined')
        .map(r => {
            let regexStr = '';
            let flagsStr: string | undefined;
            if (r.regex instanceof RegExp) {
                regexStr = r.regex.source;
                const userFlags = r.regex.flags || '';
                const merged = new Set((userFlags + 'gm').split(''));
                flagsStr = Array.from(merged).join('');
            } else {
                regexStr = String(r.regex);
                flagsStr = undefined;
            }
            return {
                name: String(r.name ?? 'Rule'),
                description: String(r.description ?? ''),
                regex: regexStr,
                flags: flagsStr,
                replacement: typeof r.replacement === 'string' ? r.replacement : '',
                active: r.active !== false,
                replaceAfterBeautify: !!r.replaceAfterBeautify,
                filePattern: String(r.filePattern ?? '*.html')
            };
        });
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
                if (--remaining === 0) { resolve(allFiles); }
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
                        
                        // Save the file
                        await document.save();
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
            const outputChannel = vscode.window.createOutputChannel('Wizly');
            outputChannel.appendLine('Transformation errors:');
            errors.forEach(error => outputChannel.appendLine(`- ${error}`));
            outputChannel.show();
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to get uncommitted files: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to transform text (extracted from transformCurrentFile)
// Helper function to check if file matches pattern
function matchesFilePattern(filePath: string, pattern: string): boolean {
    const fileName = path.basename(filePath);
    // Convert glob pattern to regex
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(fileName);
}

async function transformText(text: string, filePath?: string): Promise<string> {
    // Ensure modes and config are loaded first, so cachedSettings is populated
    const modes = getModes();

    // Read tag configuration from config file if present, otherwise VS Code settings
    const vsConfig = vscode.workspace.getConfiguration('wizly');
    const merged: WizlySettings = {
        transformTag: {
            enable: (cachedSettings?.transformTag?.enable ?? vsConfig.get<boolean>('transformTag.enable', false)) as boolean,
            dateFormat: (cachedSettings?.transformTag?.dateFormat ?? vsConfig.get<string>('transformTag.dateFormat', 'YYYY-MM-DD')) as string,
            timeFormat: (cachedSettings?.transformTag?.timeFormat ?? vsConfig.get<string>('transformTag.timeFormat', 'HH:mm')) as string,
            template: (cachedSettings?.transformTag?.template ?? vsConfig.get<string>('transformTag.template')) as string | undefined,
        }
    };
    const tagEnabled = merged.transformTag.enable;
    const dateFormat = merged.transformTag.dateFormat;
    const timeFormat = merged.transformTag.timeFormat;
    const template = merged.transformTag.template;

    // Skip transformation entirely if tag exists and feature enabled (HTML-only)
    if (tagEnabled && filePath && isHtmlFile(filePath) && hasTransformTag(text, filePath, template)) {
        return text;
    }

    // modes already loaded above to populate cachedSettings
    let newText = text;
    
    // Add EOF marker
    const eofMarker = '~~WIZLY_EOF~~';
    if (!newText.endsWith(eofMarker)) {
        newText += eofMarker;
    }
    
    // Apply regex replacements before beautify (replaceAfterBeautify: false)
    modes.forEach(mode => {
        if (!mode.active) { return; }
        mode.rules.forEach(rule => {
            if (!rule.active) { return; }
            
            // Filter by file pattern if filePath is provided
            if (filePath && rule.filePattern && !matchesFilePattern(filePath, rule.filePattern)) {
                return;
            }
            
            try {
                if (!rule.replaceAfterBeautify) {
                    const re = new RegExp(rule.regex, rule.flags ?? "gm");
                    newText = newText.replace(re, rule.replacement || '');
                }
            } catch (error) {
                console.error(`Error applying rule "${rule.description}": ${error}`);
            }
        });
    });
    
    // Remove the EOF marker
    newText = newText.replace(eofMarker, '');
    
    // Apply Prettier formatting
    newText = await formatWithPrettier(newText);
    
    // Clean up any trailing whitespace
    newText = newText.replace(/\s+$/g, '');

    // Prepend the tag when enabled and not already tagged (auto style by file)
    if (tagEnabled && filePath) {
        const alreadyTagged = hasTransformTag(text, filePath, template);
        if (!alreadyTagged) {
            const tagLine = buildTransformTag(filePath, dateFormat, timeFormat, template);
            newText = `${tagLine}\n${newText}`;
        }
    }
    
    return newText;
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('wizly.transformCurrentFile', transformCurrentFile),
        vscode.commands.registerCommand('wizly.transformUncommittedFiles', transformUncommittedFiles),
        vscode.commands.registerCommand('wizly.exportDefaultConfig', exportDefaultConfig)
    );

    // Watch for .vswizly config changes and refresh modes (multi-root aware)
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        for (const folder of folders) {
            const pattern = new vscode.RelativePattern(folder, '.vswizly*');
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            watcher.onDidChange(() => refreshModes());
            watcher.onDidCreate(() => refreshModes());
            watcher.onDidDelete(() => refreshModes());
            context.subscriptions.push(watcher);
        }
    }

    // Optional: Auto-transform newly created HTML files when enabled
    if (folders && folders.length > 0) {
        for (const folder of folders) {
            const htmlPattern = new vscode.RelativePattern(folder, '**/*.{html,htm,xhtml}');
            const createWatcher = vscode.workspace.createFileSystemWatcher(htmlPattern);
            createWatcher.onDidCreate(async (uri) => {
                try {
                    // Ensure config is loaded to populate cachedSettings
                    getModes();
                    const cfg = vscode.workspace.getConfiguration('wizly');
                    const enabled = (cachedSettings?.autoTransformOnCreate ?? cfg.get<boolean>('autoTransformOnCreate', false)) as boolean;
                    if (!enabled) { return; }

                    if (!isHtmlFile(uri.fsPath)) { return; }

                    const doc = await vscode.workspace.openTextDocument(uri);
                    const original = doc.getText();
                    const transformed = await transformText(original, uri.fsPath);

                    if (transformed === original) { return; }

                    const edit = new vscode.WorkspaceEdit();
                    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(original.length));
                    edit.replace(uri, fullRange, transformed);
                    await vscode.workspace.applyEdit(edit);
                    await doc.save();

                    const toast = !!cachedSettings?.autoTransformToast;
                    if (toast) {
                        const rel = folders?.[0] ? path.relative(folders[0].uri.fsPath, uri.fsPath) : uri.fsPath;
                        vscode.window.showInformationMessage(`Wizly: auto-transformed new file: ${rel}`);
                    }
                } catch (err) {
                    console.warn('Auto-transform on create failed:', err);
                }
            });
            context.subscriptions.push(createWatcher);
        }
    }
}

export function deactivate() {}

// Export the built-in default rules to a `.vswizly.js` in the workspace root.
// Fails if the file already exists; does not overwrite.
async function exportDefaultConfig() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found. Open a folder to export the config.');
        return;
    }

    const targetPath = path.join(workspaceFolder.uri.fsPath, '.vswizly.js');
    if (fs.existsSync(targetPath)) {
        vscode.window.showErrorMessage('`.vswizly.js` already exists. Aborting export to avoid overwriting.');
        return;
    }

    try {
        // Flatten and export a single rules array in JavaScript format with RegExp literals.
        const defaults = getDefaultModes();
        const allRules = defaults.flatMap(m => m.rules);

        const esc = (s: string) => JSON.stringify(s);
        const lines: string[] = [];
        lines.push('module.exports = {');
        // Include autoTransformOnCreate default (false)
        lines.push('  autoTransformOnCreate: false,');
        // Include autoTransformToast default (true)
        lines.push('  autoTransformToast: true,');
        // Place transformTag before rules for readability
        lines.push('  transformTag: {');
        lines.push('    enable: true,');
        lines.push('    style: "auto",');
        lines.push('    dateFormat: "YYYY-MM-DD",');
        lines.push('    timeFormat: "HH:mm",');
        lines.push('    template: "Changed by Wizly on {date} at {time}"');
        lines.push('  },');
        lines.push('  rules: [');
        for (const r of allRules) {
            const flags = (r.flags && r.flags.trim()) ? r.flags.trim() : 'gm';
            const pattern = r.regex; // Already sanitized source pattern
            const regexLiteral = `/${pattern}/${flags}`;

            lines.push('    {');
            lines.push(`      name: ${esc(r.name)},`);
            lines.push(`      description: ${esc(r.description)},`);
            lines.push(`      regex: ${regexLiteral},`);
            lines.push(`      replacement: ${esc(r.replacement ?? '')},`);
            lines.push(`      active: ${r.active},`);
            lines.push(`      replaceAfterBeautify: ${r.replaceAfterBeautify},`);
            lines.push(`      filePattern: ${esc(r.filePattern)},`);
            lines.push('    },');
        }
        lines.push('  ],');
        lines.push('};');

        fs.writeFileSync(targetPath, lines.join('\n') + '\n', 'utf8');

        vscode.window.showInformationMessage('Exported default Wizly rules to `.vswizly.js`.');
        refreshModes();
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to export default config: ${err instanceof Error ? err.message : String(err)}`);
    }
}
