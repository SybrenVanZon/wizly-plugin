
import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import * as fs from 'fs';
import { refreshModes, getModes, getCachedSettings, DEFAULT_SETTINGS_CONTENT } from './config';
import { transformText } from './transformer';
import { patchTemplates, patchRules, patchSettings } from './patcher';

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
