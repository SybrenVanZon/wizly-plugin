
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as ejs from 'ejs';
import * as prettier from 'prettier';
import { WizlySettings, getModes, getCachedSettings } from './config';
import { 
    LabelMap, 
    escapeForRegex, 
    resolveCommentStyle, 
    formatDateTime, 
    resolveControlName,
    resolveTemplatePath,
    isHtmlFile,
    matchesFilePattern
} from './utils';

export function extractLabelAndRemove(textOriginal: string, settings: WizlySettings): { map: LabelMap, text: string } {
    const m = settings.smartLabelMatcher;
    if (!m || !m.enabled) {
        return { map: {}, text: textOriginal };
    }
    const map: LabelMap = {};
    
    // Replace and build map simultaneously
    // We only want to extract the label content and remove the <label> tag itself.
    // We leave the surrounding divs intact (they will be cleaned up later if empty).

    const reLabel = new RegExp(
        `<label\\s+(?:[^>]*?\\s+)?(?:magic|\\[magic\\])="(?<magic>mgc\\.${escapeForRegex(m.labelPrefix)}([^"]*?))"[\\s\\S]*?>\\s*` +
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
            map[id] = content;
            return ''; // Remove the label tag completely
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
        zoomIcon: (cachedSettings?.zoomIcon ?? vscode.workspace.getConfiguration('wizly').get<string>('zoomIcon', 'more_horiz')) as string,
        smartLabelMatcher: cachedSettings?.smartLabelMatcher ?? vscode.workspace.getConfiguration('wizly').get('smartLabelMatcher'),
        removeEmptyLinesAfterPrettier: cachedSettings?.removeEmptyLinesAfterPrettier ?? vscode.workspace.getConfiguration('wizly').get<boolean>('removeEmptyLinesAfterPrettier', false),
    };

    // Use provided settings or fallback to VS Code config
    const tagEnabled = settings.transformTag.enable;
    const template = settings.transformTag.template;

    if (tagEnabled && filePath && isHtmlFile(filePath) && hasTransformTag(text, filePath, template)) {
        return text;
    }

    const { map: labelMap, text: textWithoutLabels } = extractLabelAndRemove(text, settings);
    let newText = textWithoutLabels;
    
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
            
            try {
                    const re = new RegExp(rule.regex, rule.flags ?? "gm");
                    let usedTemplate = false;

                    if (rule.templateFile) {
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

                                data.zoomIcon = settings.zoomIcon || 'more_horiz';

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

                                const inputAttrs = (data.inputAttrs || '') + (data.inputAttrsBefore || '') + ' ' + (data.inputAttrsAfter || '');
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
                                data.attrVisible = findAttr(['[style.visibility]'], allGroupAttrs);
                                data.ngIf = findAttr(['*ngIf'], allGroupAttrs);
                                data.attrTooltip = findAttr(['[matTooltip]', 'matTooltip'], allGroupAttrs);
                                data.attrPlaceholder = findAttr(['[placeholder]', 'placeholder'], allGroupAttrs);
                                data.attrDisabled = findAttr(['[disabled]', 'disabled'], allGroupAttrs);

                                const typeMatch = allGroupAttrs.match(/type="([^"]*)"/i);
                                data.inputType = typeMatch ? typeMatch[1] : 'text';
                                
                                const dynReq = findAttr(['[required]'], allGroupAttrs);
                                data.attrRequired = dynReq ? dynReq : (/\brequired\b/i.test(allGroupAttrs) ? 'true' : null);

                                data.options = findAttr(['[options]'], allGroupAttrs);


                                data.startsWith = (str: string, prefix: string) => {
                                    let cleanStr = str;
                                    const m = settings?.smartLabelMatcher;
                                    if (m && m.enabled && m.labelPrefix) {
                                        cleanStr = cleanStr.replace(new RegExp(`^mgc\\.${escapeForRegex(m.labelPrefix)}`), '');
                                    }
                                    cleanStr = cleanStr.replace(/^mgc\./, '');
                                    return cleanStr.startsWith(prefix);
                                };

                                data.endsWith = (str: string, suffix: string) => {
                                    let cleanStr = str;
                                    const m = settings?.smartLabelMatcher;
                                    if (m && m.enabled && m.labelPrefix) {
                                        cleanStr = cleanStr.replace(new RegExp(`^mgc\\.${escapeForRegex(m.labelPrefix)}`), '');
                                    }
                                    cleanStr = cleanStr.replace(/^mgc\./, '');
                                    return cleanStr.endsWith(suffix);
                                };

                                data.includes = (str: string, substr: string) => {
                                    let cleanStr = str;
                                    const m = settings?.smartLabelMatcher;
                                    if (m && m.enabled && m.labelPrefix) {
                                        cleanStr = cleanStr.replace(new RegExp(`^mgc\\.${escapeForRegex(m.labelPrefix)}`), '');
                                    }
                                    cleanStr = cleanStr.replace(/^mgc\./, '');
                                    return cleanStr.includes(substr);
                                };

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
    
    newText = applySmartLabelPlaceholders(newText, labelMap, settings);
    newText = newText.replace(eofMarker, '');

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

        let htmlPlugin: any;
        try {
            const mod = await import('prettier/plugins/html');
            htmlPlugin = (mod as any).default ?? mod;
        } catch {
            // plugin not available; prettier may auto-discover it
        }

        const defaultOptions = {
            parser: 'angular',
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
            ...(htmlPlugin ? { plugins: [...(resolvedConfig.plugins ?? []), htmlPlugin] } : {}),
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
