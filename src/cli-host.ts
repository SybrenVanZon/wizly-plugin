import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Host } from './host';

/** Where a `wizly.*` setting can come from outside the editor, most specific first. */
export interface SettingsSource {
    kind: 'workspace' | 'user' | 'defaults';
    path: string;
    /** `false` when the file was looked for and not used — missing, skipped, or unreadable. */
    used: boolean;
    note?: string;
}

export interface Message {
    level: 'error' | 'warning' | 'info';
    text: string;
}

export interface CliHostOptions {
    root: string;
    /** The extension root, where `package.json` declares the setting defaults. */
    extensionRoot: string;
    /** `false` to leave the user's VS Code settings out; a path to read that file instead. */
    userSettings?: false | string;
}

/**
 * The CLI's host: the editor's settings order without the editor.
 *
 * VS Code resolves a `wizly.*` setting as workspace over user over the defaults in the
 * extension's `package.json`, and `.wizly/wizly.config.js` overrides all of them (that last part
 * lives in `config.ts`, so it applies here unchanged). All three are files on disk, so the CLI
 * reads them itself. What it cannot know is which editor flavour or profile a developer uses, so
 * it reads plain VS Code's default profile unless told otherwise, and reports every source it
 * used — a result that differs between two machines can then be traced.
 */
export function createCliHost(options: CliHostOptions): { host: Host; sources: SettingsSource[]; messages: Message[] } {
    const sources: SettingsSource[] = [];
    const layers: Record<string, unknown>[] = [];

    const workspacePath = path.join(options.root, '.vscode', 'settings.json');
    layers.push(readSettingsFile(workspacePath, 'workspace', sources));

    if (options.userSettings === false) {
        sources.push({ kind: 'user', path: defaultUserSettingsPath(), used: false, note: 'skipped (--no-user-settings)' });
    } else {
        layers.push(readSettingsFile(options.userSettings ?? defaultUserSettingsPath(), 'user', sources));
    }

    const packagePath = path.join(options.extensionRoot, 'package.json');
    layers.push(readDefaults(packagePath, sources));

    const messages: Message[] = [];
    const host: Host = {
        workspaceRoot: () => options.root,
        getSetting: <T>(key: string, fallback?: T) => {
            for (const layer of layers) {
                const value = lookup(layer, key);
                if (value !== undefined) {
                    return value as T;
                }
            }
            return fallback;
        },
        showError: (text) => messages.push({ level: 'error', text }),
        showWarning: (text) => messages.push({ level: 'warning', text }),
        showInfo: (text) => messages.push({ level: 'info', text }),
    };
    return { host, sources, messages };
}

/** Plain VS Code's user settings file, per platform. */
export function defaultUserSettingsPath(): string {
    const home = os.homedir();
    switch (process.platform) {
        case 'win32':
            return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json');
        case 'darwin':
            return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
        default:
            return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'Code', 'User', 'settings.json');
    }
}

/** The `wizly.*` entries of a VS Code settings file, with the prefix removed. */
function readSettingsFile(file: string, kind: 'workspace' | 'user', sources: SettingsSource[]): Record<string, unknown> {
    if (!fs.existsSync(file)) {
        sources.push({ kind, path: file, used: false, note: 'not found' });
        return {};
    }
    try {
        const all = JSON.parse(stripJsonc(fs.readFileSync(file, 'utf8'))) as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(all ?? {})) {
            if (key.startsWith('wizly.')) {
                out[key.slice('wizly.'.length)] = value;
            }
        }
        sources.push({ kind, path: file, used: true, note: `${Object.keys(out).length} wizly.* settings` });
        return out;
    } catch (err) {
        sources.push({ kind, path: file, used: false, note: `unreadable: ${err instanceof Error ? err.message : String(err)}` });
        return {};
    }
}

function readDefaults(packagePath: string, sources: SettingsSource[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const configs = ([] as any[]).concat(pkg?.contributes?.configuration ?? []);
        for (const config of configs) {
            for (const [key, spec] of Object.entries<any>(config?.properties ?? {})) {
                if (key.startsWith('wizly.') && spec && 'default' in spec) {
                    out[key.slice('wizly.'.length)] = spec.default;
                }
            }
        }
        sources.push({ kind: 'defaults', path: packagePath, used: true });
    } catch (err) {
        sources.push({ kind: 'defaults', path: packagePath, used: false, note: `unreadable: ${err instanceof Error ? err.message : String(err)}` });
    }
    return out;
}

/**
 * `get('transformTag.enable')` the way VS Code answers it: the flat key if a file sets it, else
 * the property inside the object setting `transformTag`.
 */
function lookup(layer: Record<string, unknown>, key: string): unknown {
    if (key in layer) {
        return layer[key];
    }
    const parts = key.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
        const head = parts.slice(0, i).join('.');
        if (head in layer) {
            let value: unknown = layer[head];
            for (const part of parts.slice(i)) {
                value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
            }
            if (value !== undefined) {
                return value;
            }
        }
    }
    return undefined;
}

/** JSON with comments and trailing commas, as VS Code writes its settings files. */
export function stripJsonc(text: string): string {
    let out = '';
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];
        if (inString) {
            out += c;
            if (c === '\\') {
                out += next ?? '';
                i++;
            } else if (c === '"') {
                inString = false;
            }
        } else if (c === '"') {
            inString = true;
            out += c;
        } else if (c === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n') {
                i++;
            }
            out += '\n';
        } else if (c === '/' && next === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
                i++;
            }
            i++;
        } else if (c === ',' && /^\s*[}\]]/.test(text.slice(i + 1))) {
            // A trailing comma, outside a string: drop it.
        } else {
            out += c;
        }
    }
    return out;
}
