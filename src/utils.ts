
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { WizlySettings } from './config';

export type LabelMap = Record<string, string>;

export function escapeForRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolveCommentStyle(filePath?: string): 'line' | 'block' | 'html' {
    const ext = filePath ? path.extname(filePath).toLowerCase() : '';
    if (ext === '.html' || ext === '.htm' || ext === '.xhtml') {
        return 'html';
    }
    if (ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less') {
        return 'block';
    }
    // Default to line for common code files
    return 'line';
}

export function formatDateTime(date: Date, dateFormat: string, timeFormat: string): string {
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

export function isHtmlFile(filePath: string | undefined): boolean {
    if (!filePath) {
        return false;
    }
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.html' || ext === '.htm' || ext === '.xhtml';
}

export function matchesFilePattern(filePath: string, pattern: string): boolean {
    const fileName = path.basename(filePath);
    // Convert glob pattern to regex
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(fileName);
}

export function resolveTemplatePath(templateFile: string): string | null {
    // 1. Try workspace .vswizly/templates/
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        const workspaceTemplate = path.join(workspaceRoot, '.vswizly', 'templates', templateFile);
        if (fs.existsSync(workspaceTemplate)) {
            return workspaceTemplate;
        }
    }

    // 2. Try extension templates/
    // Adjust path for extension root relative to 'dist' or 'src'
    // Assuming this file is in src/ or dist/, we need to go up one level
    // In tests (out/utils.js), __dirname is .../out
    // In prod (dist/extension.js), __dirname is .../dist
    const extensionTemplate = path.join(__dirname, '..', 'templates', templateFile);
    
    // console.log(`Looking for template at: ${extensionTemplate}`);
    
    if (fs.existsSync(extensionTemplate)) {
        return extensionTemplate;
    }
    
    // Fallback for tests running in out/test/suite context?
    // No, utils.js is in out/
    
    throw new Error(`Template not found: ${templateFile} (looked at ${extensionTemplate})`);
}

export function resolveControlName(magicParam: string, settings: WizlySettings): string | null {
    const m = settings.smartLabelMatcher;
    if (!m || !m.enabled) {
        return null;
    }
    const s = magicParam.trim();
    const controlPrefixes = Array.isArray(m.controlPrefix) ? m.controlPrefix : [m.controlPrefix];
    const hasMgc = s.includes('mgc.');
    if (hasMgc) {
        const after = s.split('mgc.')[1] ?? '';
        let id = '';
        if (after.startsWith(m.labelPrefix)) {
            id = after.slice(m.labelPrefix.length);
        } else {
            for (const prefix of controlPrefixes) {
                if (after.startsWith(prefix)) {
                    id = after.slice(prefix.length);
                    break;
                }
            }
        }
        // Clean up any trailing quotes if present (e.g. from magic="...")
        return id ? id.replace(/["'].*$/, '') : null;
    } else {
        if (s.startsWith(m.labelPrefix)) {
            return s.replace(m.labelPrefix, '');
        }
        for (const prefix of controlPrefixes) {
            if (s.startsWith(prefix)) {
                return s.slice(prefix.length);
            }
        }
        return null;
    }
}

export function extractBalancedTag(text: string, startIndex: number): string | null {
    const openTagMatch = text.slice(startIndex).match(/^<(\w+)(?:\s|>)/);
    if (!openTagMatch) {
        return null;
    }
    const tagName = openTagMatch[1];
    let depth = 0;
    let i = startIndex;
    const len = text.length;

    while (i < len) {
        // Find next tag start
        const nextTag = text.indexOf('<', i);
        if (nextTag === -1) {
            break;
        }

        // Check for closing tag first
        if (text.startsWith(`</${tagName}>`, nextTag)) {
            depth--;
            i = nextTag + tagName.length + 3; // </tag> length
            if (depth === 0) {
                return text.slice(startIndex, i);
            }
            continue;
        }

        // Check for opening tag
        const tagCheck = text.slice(nextTag);
        const match = tagCheck.match(new RegExp(`^<${tagName}(?:\\s|>)`));
        if (match) {
            depth++;
            i = nextTag + match[0].length;
            continue;
        }

        i = nextTag + 1;
    }
    
    return null;
}
