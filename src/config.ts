
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface RegexRule {
    name: string;
    description: string;
    regex: string;
    flags?: string;
    replacement?: string;
    templateFile?: string;
    active: boolean;
    replaceAfterBeautify: boolean;
    filePattern: string;
}

export interface Mode {
    name: string;
    rules: RegexRule[];
    active: boolean;
}

export type WizlySettings = {
    transformTag: {
        enable: boolean;
        dateFormat: string;
        timeFormat: string;
        template?: string;
    };
    zoomIcon: string;
    autoTransformOnCreate?: boolean;
    autoTransformToast?: boolean;
    smartLabelMatcher?: {
        enabled: boolean;
        labelPrefix: string;
        controlPrefix: string[];
    };
    removeEmptyLinesAfterPrettier?: boolean;
};

let cachedModes: Mode[] | null = null;
let cachedSettings: Partial<WizlySettings> | null = null;

export function refreshModes(): void {
    cachedModes = null;
    cachedSettings = null;
}

export function getCachedSettings(): Partial<WizlySettings> | null {
    return cachedSettings;
}

export function getModes(): Mode[] {
    if (cachedModes) {
        return cachedModes;
    }
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const root = workspaceFolder.uri.fsPath;
        const configDir = path.join(root, '.vswizly');
        
        const rulesPath = path.join(configDir, 'wizly.rules.js');
        if (fs.existsSync(rulesPath)) {
            const loaded = loadModesFromConfigSync(rulesPath);
            if (loaded && loaded.length > 0) {
                cachedModes = loaded;
            }
        }

        const settingsPath = path.join(configDir, 'wizly.config.js');
        if (fs.existsSync(settingsPath)) {
            loadSettingsFromConfigSync(settingsPath);
        }

        if (!cachedModes) {
            const legacyPath = path.join(root, '.vswizly.js');
            if (fs.existsSync(legacyPath)) {
                const loaded = loadModesFromConfigSync(legacyPath);
                if (loaded && loaded.length > 0) {
                    cachedModes = loaded;
                }
                loadSettingsFromConfigSync(legacyPath);
            }
        }
    }

    if (cachedModes) {
        return cachedModes;
    }

    try {
        // Adjust path for extension root relative to 'dist' or 'src'
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

    const modes: Mode[] = getDefaultModes();
    cachedModes = modes;
    return modes;
}

export function getDefaultModes(): Mode[] {
    try {
        const defaultsPath = path.join(__dirname, '..', 'default.rules.js');
        if (fs.existsSync(defaultsPath)) {
            delete require.cache[require.resolve(defaultsPath)];
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

function loadSettingsFromConfigSync(filePath: string) {
    try {
        if (!fs.existsSync(filePath)){ return; };
        
        const ext = path.extname(filePath).toLowerCase();
        let data: any;
        if (ext === '.js' || ext === '.cjs') {
            delete require.cache[require.resolve(filePath)]; // Force reload
            const mod = require(filePath);
            data = mod && mod.default ? mod.default : mod;
        } else {
            const raw = fs.readFileSync(filePath, 'utf8');
            data = JSON.parse(raw);
        }

        const s = (data && data.transformTag) ? data.transformTag : null;
        const autoCreate = (data && typeof data.autoTransformOnCreate !== 'undefined') ? !!data.autoTransformOnCreate : undefined;
        const autoToast = (data && typeof data.autoTransformToast !== 'undefined') ? !!data.autoTransformToast : undefined;
        
        const current = cachedSettings || {};
        const newSettings: any = { ...current };

        if (s || typeof autoCreate !== 'undefined' || typeof autoToast !== 'undefined') {
            newSettings.transformTag = s ? {
                enable: s.enable ?? undefined,
                dateFormat: s.dateFormat ?? undefined,
                timeFormat: s.timeFormat ?? undefined,
                template: s.template ?? undefined,
            } : newSettings.transformTag;
            
            if (typeof autoCreate !== 'undefined'){ newSettings.autoTransformOnCreate = autoCreate; }
            if (typeof autoToast !== 'undefined'){ newSettings.autoTransformToast = autoToast; }
        }

        if (data && data.smartLabelMatcher) {
            const rawControlPrefix = data.smartLabelMatcher.controlPrefix ?? ['V_', 'P_'];
            newSettings.smartLabelMatcher = {
                enabled: !!data.smartLabelMatcher.enabled,
                labelPrefix: String(data.smartLabelMatcher.labelPrefix ?? 'L_'),
                controlPrefix: Array.isArray(rawControlPrefix) ? rawControlPrefix.map(String) : [String(rawControlPrefix)]
            };
        }

        if (data && typeof data.removeEmptyLinesAfterPrettier !== 'undefined') {
            newSettings.removeEmptyLinesAfterPrettier = !!data.removeEmptyLinesAfterPrettier;
        }

        cachedSettings = newSettings;
    } catch (err) {
        console.error(`Failed to load Wizly settings from ${filePath}:`, err);
    }
}

function loadModesFromConfigSync(filePath: string): Mode[] | null {
    try {
        const ext = path.extname(filePath).toLowerCase();
        let data: any;
        if (ext === '.js' || ext === '.cjs') {
            delete require.cache[require.resolve(filePath)]; // Force reload
            const mod = require(filePath);
            data = mod && mod.default ? mod.default : mod;
        } else {
            const raw = fs.readFileSync(filePath, 'utf8');
            data = JSON.parse(raw);
        }

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
                templateFile: typeof r.templateFile === 'string' ? r.templateFile : undefined,
                active: r.active !== false,
                replaceAfterBeautify: !!r.replaceAfterBeautify,
                filePattern: String(r.filePattern ?? '*.html')
            };
        });
}
