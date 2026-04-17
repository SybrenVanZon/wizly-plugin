
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Single source of truth for the default settings.
// Used by both exportSettings and patchSettings so they stay in sync.
export const DEFAULT_SETTINGS_CONTENT = `module.exports = {
    transformTag: {
        enable: true,
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        template: 'Changed by Wizly on {date} at {time}'
    },
    autoTransformOnCreate: false,
    autoTransformToast: true,
    typescript: {
        enableAstTransforms: false,
        autoTransformOnCreate: false,
        autoTransformComponentsOnCreate: false,
        convertConstructorToInject: false,
        magicModalDefaults: {},
        mergeImports: true,
        sortMagicGenCmpsHash: true,
        sortMagicGenComponents: false,
        sortImports: true,
        sortNgModuleImports: true
    },
    smartLabelMatcher: {
        enabled: false,
        labelPrefix: 'L_',
        controlPrefix: ['V_', 'P_']
    },
    smartTabMatcher: false,
    customSmartMatchers: []
};`;

export const DEFAULT_SETTINGS_OBJECT: Record<string, unknown> = {
    transformTag: {
        enable: true,
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        template: 'Changed by Wizly on {date} at {time}',
    },
    autoTransformOnCreate: false,
    autoTransformToast: true,
    typescript: {
        enableAstTransforms: false,
        autoTransformOnCreate: false,
        autoTransformComponentsOnCreate: false,
        convertConstructorToInject: false,
        magicModalDefaults: {},
        mergeImports: true,
        sortMagicGenCmpsHash: true,
        sortMagicGenComponents: false,
        sortImports: true,
        sortNgModuleImports: true,
    },
    smartLabelMatcher: {
        enabled: false,
        labelPrefix: 'L_',
        controlPrefix: ['V_', 'P_'],
    },
    smartTabMatcher: false,
    customSmartMatchers: [],
};

export interface RegexRule {
    name: string;
    description: string;
    regex: string;
    flags?: string;
    replacement?: string;
    templateFile?: string;
    active: boolean;
    activeWhen?: string;
    filePattern: string;
    useBalancedTag?: boolean;
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
    typescript?: {
        enableAstTransforms?: boolean;
        autoTransformOnCreate?: boolean;
        autoTransformComponentsOnCreate?: boolean;
        convertConstructorToInject?: boolean;
        magicModalDefaults?: {
            formName?: string;
            showTitleBar?: boolean;
            x?: number;
            y?: number;
            width?: string;
            height?: string;
            isCenteredToWindow?: boolean;
            shouldCloseOnBackgroundClick?: boolean;
            isResizable?: boolean;
            isMovable?: boolean;
        };
        mergeImports?: boolean;
        sortMagicGenCmpsHash?: boolean;
        sortMagicGenComponents?: boolean;
        sortImports?: boolean;
        sortNgModuleImports?: boolean;
    };
    smartLabelMatcher?: {
        enabled: boolean;
        labelPrefix: string | string[];
        controlPrefix: string | string[];
    };
    removeEmptyLinesAfterPrettier?: boolean;
    smartTabMatcher?: boolean;
    customSmartMatchers?: CustomSmartMatcher[];
};

export type SmartMatchOn = {
    matchPrefix?: string | string[];
    matchSuffix?: string | string[];
    controlPrefix?: string | string[];
    controlSuffix?: string | string[];
};

export type CustomSmartMatcher = {
    name: string;
    enabled: boolean;
    filePattern?: string;
    regex: RegExp | string;
    remove?: boolean;
    matchOn?: SmartMatchOn;
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
            const rawLabelPrefix = data.smartLabelMatcher.labelPrefix ?? 'L_';
            newSettings.smartLabelMatcher = {
                enabled: !!data.smartLabelMatcher.enabled,
                labelPrefix: Array.isArray(rawLabelPrefix) ? rawLabelPrefix.map(String) : String(rawLabelPrefix),
                controlPrefix: Array.isArray(rawControlPrefix) ? rawControlPrefix.map(String) : String(rawControlPrefix)
            };
        }

        if (data && typeof data.removeEmptyLinesAfterPrettier !== 'undefined') {
            newSettings.removeEmptyLinesAfterPrettier = !!data.removeEmptyLinesAfterPrettier;
        }

        if (data && typeof data.smartTabMatcher !== 'undefined') {
            newSettings.smartTabMatcher = !!data.smartTabMatcher;
        }

        if (data && data.typescript && typeof data.typescript === 'object') {
            const mm = (data.typescript as any).magicModalDefaults;
            newSettings.typescript = {
                enableAstTransforms: typeof data.typescript.enableAstTransforms === 'boolean'
                    ? data.typescript.enableAstTransforms
                    : undefined,
                autoTransformOnCreate: typeof data.typescript.autoTransformOnCreate === 'boolean'
                    ? data.typescript.autoTransformOnCreate
                    : undefined,
                autoTransformComponentsOnCreate: typeof data.typescript.autoTransformComponentsOnCreate === 'boolean'
                    ? data.typescript.autoTransformComponentsOnCreate
                    : undefined,
                convertConstructorToInject: typeof data.typescript.convertConstructorToInject === 'boolean'
                    ? data.typescript.convertConstructorToInject
                    : undefined,
                magicModalDefaults: mm && typeof mm === 'object' ? {
                    formName: typeof mm.formName === 'string' ? mm.formName : undefined,
                    showTitleBar: typeof mm.showTitleBar === 'boolean' ? mm.showTitleBar : undefined,
                    x: typeof mm.x === 'number' ? mm.x : undefined,
                    y: typeof mm.y === 'number' ? mm.y : undefined,
                    width: typeof mm.width === 'string' ? mm.width : undefined,
                    height: typeof mm.height === 'string' ? mm.height : undefined,
                    isCenteredToWindow: typeof mm.isCenteredToWindow === 'boolean' ? mm.isCenteredToWindow : undefined,
                    shouldCloseOnBackgroundClick: typeof mm.shouldCloseOnBackgroundClick === 'boolean' ? mm.shouldCloseOnBackgroundClick : undefined,
                    isResizable: typeof mm.isResizable === 'boolean' ? mm.isResizable : undefined,
                    isMovable: typeof mm.isMovable === 'boolean' ? mm.isMovable : undefined,
                } : undefined,
                mergeImports: typeof (data.typescript as any).mergeImports === 'boolean'
                    ? (data.typescript as any).mergeImports
                    : undefined,
                sortMagicGenCmpsHash: typeof (data.typescript as any).sortMagicGenCmpsHash === 'boolean'
                    ? (data.typescript as any).sortMagicGenCmpsHash
                    : undefined,
                sortMagicGenComponents: typeof (data.typescript as any).sortMagicGenComponents === 'boolean'
                    ? (data.typescript as any).sortMagicGenComponents
                    : undefined,
                sortImports: typeof data.typescript.sortImports === 'boolean'
                    ? data.typescript.sortImports
                    : undefined,
                sortNgModuleImports: typeof data.typescript.sortNgModuleImports === 'boolean'
                    ? data.typescript.sortNgModuleImports
                    : undefined,
            };
        }

        if (data && Array.isArray(data.customSmartMatchers)) {
            const sanitizeStringOrStringArray = (v: any): string | string[] | undefined => {
                if (typeof v === 'string') { return v; }
                if (Array.isArray(v)) { return v.map(String); }
                return undefined;
            };

            newSettings.customSmartMatchers = data.customSmartMatchers
                .filter((m: any) => m && typeof m === 'object')
                .map((m: any) => {
                    const matchOn = m.matchOn && typeof m.matchOn === 'object' ? m.matchOn : undefined;
                    const matchPrefix = sanitizeStringOrStringArray(matchOn?.matchPrefix);
                    const matchSuffix = sanitizeStringOrStringArray(matchOn?.matchSuffix);
                    const controlPrefix = sanitizeStringOrStringArray(matchOn?.controlPrefix);
                    const controlSuffix = sanitizeStringOrStringArray(matchOn?.controlSuffix);

                    const normalizedMatchOn = (matchPrefix || matchSuffix || controlPrefix || controlSuffix)
                        ? { matchPrefix, matchSuffix, controlPrefix, controlSuffix }
                        : undefined;

                    return {
                        name: String(m.name ?? 'matcher'),
                        enabled: !!m.enabled,
                        filePattern: typeof m.filePattern === 'string' ? m.filePattern : undefined,
                        regex: (m.regex instanceof RegExp || typeof m.regex === 'string') ? m.regex : String(m.regex ?? ''),
                        remove: typeof m.remove === 'boolean' ? m.remove : undefined,
                        matchOn: normalizedMatchOn,
                    } satisfies CustomSmartMatcher;
                })
                .filter((m: CustomSmartMatcher) => !!m.name && (m.regex instanceof RegExp || (typeof m.regex === 'string' && m.regex.trim().length > 0)));
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

export function sanitizeRules(rawRules: any[]): RegexRule[] {
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
                replacement: typeof r.replacement === 'string' ? r.replacement : undefined,
                templateFile: typeof r.templateFile === 'string' ? r.templateFile : undefined,
                active: r.active !== false,
                activeWhen: typeof r.activeWhen === 'string' ? r.activeWhen : undefined,
                filePattern: String(r.filePattern ?? '*.html'),
                useBalancedTag: r.useBalancedTag === true ? true : undefined
            };
        });
}
