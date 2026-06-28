
import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import * as fs from 'fs';
import { refreshModes, getModes, getCachedSettings, DEFAULT_SETTINGS_CONTENT } from './config';
import { transformText } from './transformer';
import { patchTemplates, patchRules, patchSettings } from './patcher';

let outputChannel: vscode.OutputChannel | null = null;
const EXTENSION_VERSION_STATE_KEY = 'wizly.extensionVersion';

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Wizly');
    }
    return outputChannel;
}

type ReleaseNotesInfo = {
    version: string;
    previousVersion?: string;
    relativePath: string;
    summaryMarkdown: string;
};

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getReleaseNotesFilePath(context: vscode.ExtensionContext, version: string): string {
    return path.join(context.extension.extensionPath, 'release-notes', `${version}.md`);
}

function getChangelogFilePath(context: vscode.ExtensionContext): string {
    return path.join(context.extension.extensionPath, 'CHANGELOG.md');
}

function findReleaseNotesFilePath(context: vscode.ExtensionContext, version: string): string | undefined {
    const candidates = [version];
    const baseVersion = version.replace(/-rc\d+$/i, '');
    if (baseVersion && baseVersion !== version) {
        candidates.push(baseVersion);
    }

    for (const candidate of candidates) {
        const filePath = getReleaseNotesFilePath(context, candidate);
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }

    return undefined;
}

function renderInlineMarkdownToHtml(text: string): string {
    let html = escapeHtml(text);
    html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|file:\/\/)[^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return html;
}

function renderMarkdownExcerptToHtml(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const htmlParts: string[] = [];
    let paragraphLines: string[] = [];
    let listItems: string[] = [];
    let codeLines: string[] = [];
    let inCodeBlock = false;

    const flushParagraph = () => {
        if (paragraphLines.length === 0) { return; }
        htmlParts.push(`<p>${renderInlineMarkdownToHtml(paragraphLines.join(' '))}</p>`);
        paragraphLines = [];
    };

    const flushList = () => {
        if (listItems.length === 0) { return; }
        htmlParts.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join('')}</ul>`);
        listItems = [];
    };

    const flushCodeBlock = () => {
        if (codeLines.length === 0) { return; }
        htmlParts.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
    };

    for (const line of lines) {
        const trimmed = line.trim();

        if (/^```/.test(trimmed)) {
            flushParagraph();
            flushList();
            if (inCodeBlock) {
                flushCodeBlock();
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        if (!trimmed) {
            flushParagraph();
            flushList();
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
        if (headingMatch) {
            flushParagraph();
            flushList();
            const level = Math.min(3, headingMatch[1].length);
            htmlParts.push(`<h${level}>${renderInlineMarkdownToHtml(headingMatch[2].trim())}</h${level}>`);
            continue;
        }

        const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
        if (listMatch) {
            flushParagraph();
            listItems.push(renderInlineMarkdownToHtml(listMatch[1].trim()));
            continue;
        }

        paragraphLines.push(trimmed);
    }

    flushParagraph();
    flushList();
    flushCodeBlock();

    return htmlParts.join('\n');
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openChangelogForVersion(context: vscode.ExtensionContext, version: string): Promise<void> {
    const changelogPath = getChangelogFilePath(context);
    const doc = await vscode.workspace.openTextDocument(changelogPath);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const lines = doc.getText().split(/\r?\n/);
    const candidates = [version];
    const baseVersion = version.replace(/-rc\d+$/i, '');
    if (baseVersion && baseVersion !== version) {
        candidates.push(baseVersion);
    }

    for (const candidate of candidates) {
        const pattern = new RegExp(`^## \\[${escapeRegExp(candidate)}\\]\\b`);
        const lineIndex = lines.findIndex(line => pattern.test(line));
        if (lineIndex >= 0) {
            const position = new vscode.Position(lineIndex, 0);
            const range = new vscode.Range(position, position);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
            return;
        }
    }
}

async function showReleaseNotesPanel(context: vscode.ExtensionContext, notes: ReleaseNotesInfo): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'wizlyReleaseNotes',
        `Wizly: What's New in ${notes.version}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: false }
    );
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fromText = notes.previousVersion
        ? `Wizly updated from ${escapeHtml(notes.previousVersion)} to ${escapeHtml(notes.version)}.`
        : `Wizly updated to ${escapeHtml(notes.version)}.`;
    const summaryHtml = renderMarkdownExcerptToHtml(notes.summaryMarkdown);

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wizly Release Notes</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; line-height: 1.55; }
    h1, h2, h3 { margin: 0 0 12px; line-height: 1.25; }
    p { margin: 0 0 12px; }
    ul { margin: 0 0 16px 18px; padding: 0; }
    li { margin: 0 0 8px; }
    code { font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.12)); padding: 2px 4px; border-radius: 4px; }
    pre { overflow-x: auto; padding: 12px; border-radius: 8px; background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.12)); }
    a { color: var(--vscode-textLink-foreground); }
    .eyebrow { color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
    .shell { max-width: 860px; margin: 0 auto; }
    .card { border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.2)); border-radius: 10px; padding: 18px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 18px; }
    .button-row { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    button { padding: 8px 14px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 6px; cursor: pointer; }
    #openButton { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    #dismissButton { color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); background: var(--vscode-button-secondaryBackground, transparent); }
  </style>
</head>
<body>
  <div class="shell">
    <div class="eyebrow">${fromText}</div>
    <div class="card">
      ${summaryHtml}
      <div class="button-row">
        <button id="openButton" type="button">Open Changelog</button>
        <button id="dismissButton" type="button">Close</button>
      </div>
      <div class="meta">Summary source: ${escapeHtml(notes.relativePath)}</div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('openButton')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'openChangelog' });
    });
    document.getElementById('dismissButton')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'dismiss' });
    });
  </script>
</body>
</html>`;

    const messageSubscription = panel.webview.onDidReceiveMessage(async (message) => {
        if (message?.command === 'openChangelog') {
            await openChangelogForVersion(context, notes.version);
            return;
        }

        if (message?.command === 'dismiss') {
            panel.dispose();
        }
    });

    panel.onDidDispose(() => {
        messageSubscription.dispose();
    });

    context.subscriptions.push(panel);
}

async function maybeShowReleaseNotesForExtensionUpdate(context: vscode.ExtensionContext): Promise<void> {
    try {
        const currentVersionRaw = context.extension.packageJSON?.version;
        const currentVersion = typeof currentVersionRaw === 'string' ? currentVersionRaw.trim() : '';
        if (!currentVersion) { return; }

        const previousVersion = context.globalState.get<string>(EXTENSION_VERSION_STATE_KEY);
        if (previousVersion === currentVersion) { return; }

        await context.globalState.update(EXTENSION_VERSION_STATE_KEY, currentVersion);
        if (!previousVersion) { return; }

        const releaseNotesPath = findReleaseNotesFilePath(context, currentVersion);
        if (!releaseNotesPath) { return; }

        const summaryMarkdown = fs.readFileSync(releaseNotesPath, 'utf8').replace(/\r\n/g, '\n').trim()
            || `# Wizly ${currentVersion}\n\nSee \`CHANGELOG.md\` for the full list of changes.`;

        await showReleaseNotesPanel(context, {
            version: currentVersion,
            previousVersion,
            relativePath: path.relative(context.extension.extensionPath, releaseNotesPath).replace(/\\/g, '/'),
            summaryMarkdown
        });
    } catch (error) {
        getOutputChannel().appendLine(`Wizly: Failed to show release notes. ${error instanceof Error ? error.message : String(error)}`);
    }
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

export function activate(context: vscode.ExtensionContext) {
    // Register commands
    const transformDisposable = vscode.commands.registerCommand('wizly.transformCurrentFile', transformCurrentFile);
    const transformUncommittedDisposable = vscode.commands.registerCommand('wizly.transformUncommittedFiles', transformUncommittedFiles);
    
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

    context.subscriptions.push(transformDisposable);
    context.subscriptions.push(transformUncommittedDisposable);
    context.subscriptions.push(exportSettingsDisposable);
    context.subscriptions.push(exportTemplatesDisposable);
    context.subscriptions.push(exportRulesDisposable);
    context.subscriptions.push(patchTemplatesDisposable);
    context.subscriptions.push(patchRulesDisposable);
    context.subscriptions.push(patchSettingsDisposable);

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
    void maybeShowReleaseNotesForExtensionUpdate(context);

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
}

export function deactivate() {}
