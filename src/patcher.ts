
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DEFAULT_SETTINGS_CONTENT, DEFAULT_SETTINGS_OBJECT } from './config';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireFresh<T>(filePath: string): T {
    try {
        delete require.cache[require.resolve(filePath)];
    } catch {
        // resolve may fail; proceed anyway
    }
    return require(filePath) as T;
}

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
}

/** Write content to a temp file and return its URI (read-only in diff) */
function writeTempFile(name: string, content: string): vscode.Uri {
    const tmpDir = path.join(os.tmpdir(), 'wizly-patch');
    ensureDir(tmpDir);
    const tmpPath = path.join(tmpDir, name);
    fs.writeFileSync(tmpPath, content, 'utf8');
    return vscode.Uri.file(tmpPath);
}

// ─── Patch Templates ─────────────────────────────────────────────────────────

type TemplateStatus = 'new' | 'modified' | 'same';

interface TemplateEntry {
    relativePath: string;
    systemPath: string;
    userPath: string;
    status: TemplateStatus;
}

function scanTemplates(extDir: string, configDir: string): TemplateEntry[] {
    const sysTemplatesDir = path.join(extDir, 'templates');
    const userTemplatesDir = path.join(configDir, 'templates');
    const results: TemplateEntry[] = [];

    function scan(srcDir: string, relDir: string) {
        if (!fs.existsSync(srcDir)) { return; }
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
            const rel = relDir ? path.join(relDir, entry.name) : entry.name;
            if (entry.isDirectory()) {
                scan(path.join(srcDir, entry.name), rel);
            } else if (entry.name.endsWith('.ejs')) {
                const systemPath = path.join(srcDir, entry.name);
                const userPath = path.join(userTemplatesDir, rel);
                let status: TemplateStatus;
                if (!fs.existsSync(userPath)) {
                    status = 'new';
                } else {
                    const sysCont = fs.readFileSync(systemPath, 'utf8');
                    const userCont = fs.readFileSync(userPath, 'utf8');
                    status = sysCont === userCont ? 'same' : 'modified';
                }
                results.push({ relativePath: rel, systemPath, userPath, status });
            }
        }
    }

    scan(sysTemplatesDir, '');
    return results;
}

type TemplateQuickPickItem = vscode.QuickPickItem & { entry?: TemplateEntry };

export async function patchTemplates(extDir: string, configDir: string): Promise<void> {
    const userTemplatesDir = path.join(configDir, 'templates');
    if (!fs.existsSync(userTemplatesDir)) {
        const answer = await vscode.window.showWarningMessage(
            'Wizly: No exported templates found. Run "Export Templates" first.',
            'Export Templates'
        );
        if (answer === 'Export Templates') {
            await vscode.commands.executeCommand('wizly.exportTemplates');
        }
        return;
    }

    const all = scanTemplates(extDir, configDir);
    const changed = all.filter(e => e.status !== 'same');

    if (changed.length === 0) {
        vscode.window.showInformationMessage('Wizly: All exported templates are up to date.');
        return;
    }

    const newEntries = changed.filter(e => e.status === 'new');
    const modifiedEntries = changed.filter(e => e.status === 'modified');

    const qp = vscode.window.createQuickPick<TemplateQuickPickItem>();
    qp.title = `Wizly: Patch Templates — ${changed.length} change(s)`;
    qp.placeholder = 'Select a template to view diff; use the inline buttons to add/update individually';
    qp.canSelectMany = false;
    qp.matchOnDescription = true;

    const buildItems = (entries: TemplateEntry[]): TemplateQuickPickItem[] => {
        const items: TemplateQuickPickItem[] = [];

        if (newEntries.length > 0) {
            items.push({
                label: 'New templates',
                kind: vscode.QuickPickItemKind.Separator,
            });
            for (const e of entries.filter(x => x.status === 'new')) {
                items.push({
                    label: `$(new-file) ${e.relativePath}`,
                    description: 'new in system — not yet in your export',
                    buttons: [
                        { iconPath: new vscode.ThemeIcon('add'), tooltip: 'Add to your templates' },
                    ],
                    entry: e,
                });
            }
        }

        if (modifiedEntries.length > 0) {
            items.push({
                label: 'Modified templates',
                kind: vscode.QuickPickItemKind.Separator,
            });
            for (const e of entries.filter(x => x.status === 'modified')) {
                items.push({
                    label: `$(diff) ${e.relativePath}`,
                    description: 'system version differs from your export',
                    buttons: [
                        { iconPath: new vscode.ThemeIcon('diff'), tooltip: 'View diff' },
                        { iconPath: new vscode.ThemeIcon('cloud-download'), tooltip: 'Overwrite with system version' },
                    ],
                    entry: e,
                });
            }
        }

        return items;
    };

    let currentEntries = [...changed];
    qp.items = buildItems(currentEntries);

    const removeEntry = (entry: TemplateEntry) => {
        currentEntries = currentEntries.filter(e => e !== entry);
        if (currentEntries.length === 0) {
            qp.hide();
            vscode.window.showInformationMessage('Wizly: All template changes applied.');
        } else {
            qp.items = buildItems(currentEntries);
        }
    };

    const applyEntry = (entry: TemplateEntry) => {
        ensureDir(path.dirname(entry.userPath));
        fs.copyFileSync(entry.systemPath, entry.userPath);
        vscode.window.showInformationMessage(`Wizly: Updated ${entry.relativePath}`);
        removeEntry(entry);
    };

    const viewDiff = async (entry: TemplateEntry) => {
        await vscode.commands.executeCommand(
            'vscode.diff',
            vscode.Uri.file(entry.systemPath),
            vscode.Uri.file(entry.userPath),
            `${path.basename(entry.relativePath)}: System ↔ Yours`,
            { preview: true }
        );
    };

    qp.onDidTriggerItemButton(async ({ item, button }) => {
        if (!item.entry) { return; }
        if (button.tooltip === 'Add to your templates') {
            applyEntry(item.entry);
        } else if (button.tooltip === 'View diff') {
            await viewDiff(item.entry);
        } else if (button.tooltip === 'Overwrite with system version') {
            const confirm = await vscode.window.showWarningMessage(
                `Overwrite your ${item.entry.relativePath} with the system version?`,
                { modal: true },
                'Overwrite'
            );
            if (confirm === 'Overwrite') {
                applyEntry(item.entry);
            }
        }
    });

    qp.onDidAccept(async () => {
        const [selected] = qp.selectedItems;
        if (!selected?.entry) { return; }
        if (selected.entry.status === 'new') {
            applyEntry(selected.entry);
        } else {
            await viewDiff(selected.entry);
        }
    });

    qp.show();
}

// ─── Patch Rules ─────────────────────────────────────────────────────────────

interface RuleCompareResult {
    newRules: string[];      // names of rules in system but not in user file
    modifiedRules: string[]; // names of rules that differ
    removedRules: string[];  // names of rules in user file but not in system
}

function compareRules(systemRules: { name: string }[], userRules: { name: string }[]): RuleCompareResult {
    const sysNames = new Set(systemRules.map(r => r.name));
    const userNames = new Set(userRules.map(r => r.name));

    const newRules = [...sysNames].filter(n => !userNames.has(n));
    const removedRules = [...userNames].filter(n => !sysNames.has(n));

    // For modified: compare serialized form of matching rules
    const modifiedRules: string[] = [];
    for (const sysRule of systemRules) {
        const userRule = userRules.find(r => r.name === sysRule.name);
        if (userRule) {
            const serialize = (r: Record<string, unknown>) =>
                JSON.stringify(r, (_k, v) => v instanceof RegExp ? v.toString() : v);
            if (serialize(sysRule as Record<string, unknown>) !== serialize(userRule as Record<string, unknown>)) {
                modifiedRules.push(sysRule.name);
            }
        }
    }

    return { newRules, modifiedRules, removedRules };
}

export async function patchRules(extDir: string, configDir: string): Promise<void> {
    const userRulesPath = path.join(configDir, 'wizly.rules.js');
    if (!fs.existsSync(userRulesPath)) {
        const answer = await vscode.window.showWarningMessage(
            'Wizly: No exported rules file found. Run "Export Advanced Rules" first.',
            'Export Rules'
        );
        if (answer === 'Export Rules') {
            await vscode.commands.executeCommand('wizly.exportRules');
        }
        return;
    }

    const systemRulesPath = path.join(extDir, 'default.rules.js');
    if (!fs.existsSync(systemRulesPath)) {
        vscode.window.showErrorMessage('Wizly: Cannot find internal default.rules.js');
        return;
    }

    let systemRules: { name: string }[];
    let userRules: { name: string }[];
    try {
        const sysMod = requireFresh<{ rules: { name: string }[] }>(systemRulesPath);
        systemRules = sysMod.rules ?? [];
        const userMod = requireFresh<{ rules: { name: string }[] }>(userRulesPath);
        userRules = userMod.rules ?? Array.isArray(userMod) ? (userMod as unknown as { name: string }[]) : [];
    } catch (err) {
        vscode.window.showErrorMessage(`Wizly: Failed to load rules for comparison: ${err}`);
        return;
    }

    const { newRules, modifiedRules, removedRules } = compareRules(systemRules, userRules);
    const totalChanges = newRules.length + modifiedRules.length;

    if (totalChanges === 0 && removedRules.length === 0) {
        vscode.window.showInformationMessage('Wizly: Your rules file is up to date with the system defaults.');
        return;
    }

    const lines: string[] = [];
    if (newRules.length > 0) {
        lines.push(`**${newRules.length} new** rule(s) in system: ${newRules.join(', ')}`);
    }
    if (modifiedRules.length > 0) {
        lines.push(`**${modifiedRules.length} modified** rule(s): ${modifiedRules.join(', ')}`);
    }
    if (removedRules.length > 0) {
        lines.push(`${removedRules.length} rule(s) only in your file (custom): ${removedRules.join(', ')}`);
    }

    const summary = [
        newRules.length > 0 ? `${newRules.length} new` : '',
        modifiedRules.length > 0 ? `${modifiedRules.length} modified` : '',
        removedRules.length > 0 ? `${removedRules.length} custom (yours only)` : '',
    ].filter(Boolean).join(', ');

    const answer = await vscode.window.showInformationMessage(
        `Wizly: Rules diff — ${summary}.\n${lines.join('\n')}`,
        'View Diff'
    );

    if (answer === 'View Diff') {
        await vscode.commands.executeCommand(
            'vscode.diff',
            vscode.Uri.file(systemRulesPath),
            vscode.Uri.file(userRulesPath),
            'wizly.rules.js: System defaults ↔ Yours',
            { preview: true }
        );
    }
}

// ─── Patch Settings ──────────────────────────────────────────────────────────

/**
 * Recursively find keys that exist in `defaults` but are missing in `user`.
 * Returns dot-notated paths, e.g. ["transformTag.newProp", "newTopKey"].
 */
function findMissingKeys(
    defaults: Record<string, unknown>,
    user: Record<string, unknown>,
    prefix = ''
): string[] {
    const missing: string[] = [];
    for (const key of Object.keys(defaults)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (!(key in user)) {
            missing.push(fullKey);
        } else {
            const dVal = defaults[key];
            const uVal = user[key];
            if (
                typeof dVal === 'object' && dVal !== null && !Array.isArray(dVal) &&
                typeof uVal === 'object' && uVal !== null && !Array.isArray(uVal)
            ) {
                missing.push(...findMissingKeys(
                    dVal as Record<string, unknown>,
                    uVal as Record<string, unknown>,
                    fullKey
                ));
            }
        }
    }
    return missing;
}

export async function patchSettings(configDir: string): Promise<void> {
    const userConfigPath = path.join(configDir, 'wizly.config.js');
    if (!fs.existsSync(userConfigPath)) {
        const answer = await vscode.window.showWarningMessage(
            'Wizly: No exported settings file found. Run "Export Settings" first.',
            'Export Settings'
        );
        if (answer === 'Export Settings') {
            await vscode.commands.executeCommand('wizly.exportSettings');
        }
        return;
    }

    let userConfig: Record<string, unknown>;
    try {
        const mod = requireFresh<Record<string, unknown>>(userConfigPath);
        userConfig = (mod && (mod as { default?: unknown }).default)
            ? (mod as { default: Record<string, unknown> }).default
            : mod;
    } catch (err) {
        vscode.window.showErrorMessage(`Wizly: Failed to load your settings: ${err}`);
        return;
    }

    const missingKeys = findMissingKeys(DEFAULT_SETTINGS_OBJECT, userConfig);

    const description = missingKeys.length === 0
        ? 'All default setting keys are present in your config.'
        : `Missing keys: ${missingKeys.join(', ')}`;

    const answer = await vscode.window.showInformationMessage(
        `Wizly: Settings patch — ${description}`,
        'View Diff'
    );

    if (answer === 'View Diff') {
        const tmpUri = writeTempFile('wizly.config.default.js', DEFAULT_SETTINGS_CONTENT);
        await vscode.commands.executeCommand(
            'vscode.diff',
            tmpUri,
            vscode.Uri.file(userConfigPath),
            'wizly.config.js: System defaults ↔ Yours',
            { preview: true }
        );
    }
}
