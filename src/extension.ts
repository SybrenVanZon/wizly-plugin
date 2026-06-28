
import * as vscode from 'vscode';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import { PNG } from 'pngjs';
import { refreshModes, getModes, getCachedSettings, DEFAULT_SETTINGS_CONTENT } from './config';
import { transformText } from './transformer';
import { patchTemplates, patchRules, patchSettings } from './patcher';
import { AngularImportRequirement, AngularSyncSettings, ensureNamedImport, ensureNgModuleExports, ensureNgModuleImports, getSharedMaterialModuleTemplate, getSharedModuleTemplate, mergeAndDedupeRequirements, partitionRequirements, removeNamedImport, removeNgModuleImports, toRelativeModuleImport } from './angular-sync';
import { analyzeAngularSetup, renderAngularSetupReportMarkdown } from './angular-check';
import { parseMagicColorFile, renderMagicColorUtilitiesScss, renderMagicColorVarsScss } from './magic-colors';
import { renderAllMaterialUtilityClasses } from './material-utilities';
import { detectRuntimeThemeFromBundleName } from './runtime-themes';
import { analyzeUpgradeAssistant, renderUpgradeAssistantReportMarkdown, UpgradeAssistantActionId } from './upgrade-assistant';
import * as ts from 'typescript';

let outputChannel: vscode.OutputChannel | null = null;
const EXTENSION_VERSION_STATE_KEY = 'wizly.extensionVersion';
function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Wizly');
    }
    return outputChannel;
}

function normalizeHex(hex: string): string {
    const v = hex.trim();
    const h = v.startsWith('#') ? v.slice(1) : v;
    return `#${h.toLowerCase()}`;
}

function isHexColor(value: string): boolean {
    return /^#?[0-9a-fA-F]{6}$/.test(value.trim());
}

function parseRgb(hex: string) {
    const h = normalizeHex(hex).slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
}

function toHexChannel(n: number): string {
    return n.toString(16).padStart(2, '0');
}

function clampColorChannel(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function mixRgb(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
    return {
        r: clampColorChannel(a.r + (b.r - a.r) * t),
        g: clampColorChannel(a.g + (b.g - a.g) * t),
        b: clampColorChannel(a.b + (b.b - a.b) * t),
    };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
    return `#${toHexChannel(rgb.r)}${toHexChannel(rgb.g)}${toHexChannel(rgb.b)}`;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
    const toLinear = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastTextColor(hex: string): '#000000' | '#ffffff' {
    const lum = relativeLuminance(parseRgb(hex));
    return lum > 0.5 ? '#000000' : '#ffffff';
}

function buildThemePalette(baseHex: string) {
    const base = parseRgb(baseHex);
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    const tints: Record<number, string> = {
        50: rgbToHex(mixRgb(base, white, 0.92)),
        100: rgbToHex(mixRgb(base, white, 0.80)),
        200: rgbToHex(mixRgb(base, white, 0.65)),
        300: rgbToHex(mixRgb(base, white, 0.50)),
        400: rgbToHex(mixRgb(base, white, 0.30)),
        500: rgbToHex(base),
        600: rgbToHex(mixRgb(base, black, 0.12)),
        700: rgbToHex(mixRgb(base, black, 0.24)),
        800: rgbToHex(mixRgb(base, black, 0.36)),
        900: rgbToHex(mixRgb(base, black, 0.50)),
    };
    const accents: Record<string, string> = {
        A100: tints[200],
        A200: tints[500],
        A400: tints[700],
        A700: tints[800],
    };
    const contrast: Record<string, string> = {};
    for (const k of Object.keys(tints)) {
        contrast[k] = contrastTextColor((tints as any)[k]);
    }
    for (const k of Object.keys(accents)) {
        contrast[k] = contrastTextColor((accents as any)[k]);
    }
    return { tints, accents, contrast };
}

function getThemePaletteKeys(palette: ReturnType<typeof buildThemePalette>): string[] {
    return [...Object.keys(palette.tints), ...Object.keys(palette.accents)];
}

function renderMaterialCssVariables(groupName: string, palette: ReturnType<typeof buildThemePalette>, indent = '  '): string {
    const lines: string[] = [];
    lines.push(`${indent}--wizly-mat-${groupName}: ${(palette.tints as any)['500']};`);
    lines.push(`${indent}--wizly-mat-on-${groupName}: ${palette.contrast['500']};`);
    for (const key of getThemePaletteKeys(palette)) {
        const color = (palette.tints as any)[key] ?? (palette.accents as any)[key];
        const contrast = palette.contrast[key];
        lines.push(`${indent}--wizly-mat-${groupName}-${key}: ${color};`);
        lines.push(`${indent}--wizly-mat-on-${groupName}-${key}: ${contrast};`);
    }
    return lines.join('\n');
}

function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string {
    return path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/');
}

function resolveRuntimeSettingsPaths(workspaceRoot: string, proj: any, sourceRoot: string): { settingsDirAbs: string; settingsPathAbs: string; assetsInputRel: string; locationLabel: 'public' | 'assets' } {
    const projectRootRel = typeof proj?.root === 'string' ? proj.root : '';
    const projectRootAbs = path.join(workspaceRoot, projectRootRel);
    const publicDirAbs = path.join(projectRootAbs, 'public');
    const hasPublicDir = fs.existsSync(publicDirAbs) && fs.statSync(publicDirAbs).isDirectory();
    if (hasPublicDir) {
        return {
            settingsDirAbs: path.join(publicDirAbs, 'settings'),
            settingsPathAbs: path.join(publicDirAbs, 'settings', 'settings.json'),
            assetsInputRel: path.join(projectRootRel, 'public', 'settings').replace(/\\/g, '/'),
            locationLabel: 'public'
        };
    }

    const assetsDirAbs = path.join(workspaceRoot, sourceRoot, 'assets');
    return {
        settingsDirAbs: path.join(assetsDirAbs, 'settings'),
        settingsPathAbs: path.join(assetsDirAbs, 'settings', 'settings.json'),
        assetsInputRel: `${sourceRoot.replace(/\\/g, '/')}/assets/settings`,
        locationLabel: 'assets'
    };
}

function findExistingRuntimeSettingsPath(workspaceRoot: string, proj: any, sourceRoot: string): string | undefined {
    const preferred = resolveRuntimeSettingsPaths(workspaceRoot, proj, sourceRoot).settingsPathAbs;
    const publicCandidate = path.join(workspaceRoot, typeof proj?.root === 'string' ? proj.root : '', 'public', 'settings', 'settings.json');
    const assetsCandidate = path.join(workspaceRoot, sourceRoot, 'assets', 'settings', 'settings.json');
    const paths = [...new Set([preferred, publicCandidate, assetsCandidate])];
    for (const p of paths) {
        if (fs.existsSync(p)) { return p; }
    }
    return undefined;
}

function showCommandSuccess(message: string, options?: { created?: string[]; nextStep?: string }) {
    const details: string[] = [];
    if (options?.created && options.created.length > 0) {
        details.push(`Created/updated: ${options.created.join(', ')}`);
    }
    if (options?.nextStep) {
        details.push(`Next: ${options.nextStep}`);
    }
    const suffix = details.length > 0 ? ` ${details.join(' ')}` : '';
    vscode.window.showInformationMessage(`${message}${suffix}`);
}

function normalizeBudgetThreshold(value: unknown): string | undefined {
    if (typeof value !== 'string') { return undefined; }
    return value.replace(/\s+/g, '').toLowerCase();
}

function relaxDefaultPwaInitialBudgets(angularJson: any, projectName: string): string[] {
    const proj = angularJson?.projects?.[projectName];
    const targets = (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
    const build = targets?.build;
    if (!build || typeof build !== 'object') { return []; }

    const updatedScopes: string[] = [];
    const desiredWarning = '3mb';
    const desiredError = '5mb';

    const maybeUpdateBudgets = (holder: any, scopeLabel: string) => {
        if (!holder || typeof holder !== 'object' || !Array.isArray(holder.budgets)) { return; }
        let changed = false;
        for (const budget of holder.budgets) {
            if (!budget || typeof budget !== 'object') { continue; }
            if (String((budget as any).type ?? '').trim() !== 'initial') { continue; }

            const warning = normalizeBudgetThreshold((budget as any).maximumWarning);
            const error = normalizeBudgetThreshold((budget as any).maximumError);
            const isAngularDefaultInitialBudget = warning === '500kb' && error === '1mb';
            if (!isAngularDefaultInitialBudget) { continue; }

            (budget as any).maximumWarning = desiredWarning;
            (budget as any).maximumError = desiredError;
            changed = true;
        }
        if (changed) {
            updatedScopes.push(scopeLabel);
        }
    };

    maybeUpdateBudgets(build.options, 'build.options');

    const configurations = build.configurations && typeof build.configurations === 'object'
        ? build.configurations
        : {};
    for (const [configName, configValue] of Object.entries(configurations)) {
        if (!/prod/i.test(configName)) { continue; }
        maybeUpdateBudgets(configValue, `build.configurations.${configName}`);
    }

    return updatedScopes;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

type ReleaseNotesInfo = {
    version: string;
    previousVersion?: string;
    relativePath: string;
    summaryMarkdown: string;
};

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

async function pickThemeColorsWithPreview(initial?: { primary?: string; secondary?: string; warn?: string; useDefaultWarn?: boolean }) {
    const primary = normalizeHex(initial?.primary ?? '#3f51b5');
    const secondary = normalizeHex(initial?.secondary ?? '#ff4081');
    const warn = normalizeHex(initial?.warn ?? '#f44336');
    const useDefaultWarn = initial?.useDefaultWarn ?? true;

    const panel = vscode.window.createWebviewPanel(
        'wizlyThemeColorPicker',
        'Wizly: Theme Colors',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: false }
    );

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const renderPaletteSection = (title: string, paletteHex: string) => {
        const palette = buildThemePalette(paletteHex);
        const swatches = [
            ...Object.entries(palette.tints).map(([label, hex]) => ({ label, hex })),
            ...Object.entries(palette.accents).map(([label, hex]) => ({ label, hex })),
        ];
        return `
            <section class="palette-section">
              <h3>${escapeHtml(title)}</h3>
              <div class="swatch-grid">
                ${swatches.map(({ label, hex }) => `
                  <div class="swatch" style="background:${hex};color:${contrastTextColor(hex)}">
                    <div class="swatch-label">${escapeHtml(label)}</div>
                    <div class="swatch-hex">${escapeHtml(hex)}</div>
                    <div class="swatch-contrast">${contrastTextColor(hex) === '#000000' ? 'Black text' : 'White text'}</div>
                  </div>
                `).join('')}
              </div>
            </section>
        `;
    };

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wizly Theme Colors</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
    h1, h2, h3 { margin: 0 0 12px; }
    .layout { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 20px; align-items: start; }
    .controls { position: sticky; top: 0; }
    .field { margin-bottom: 16px; }
    .field label { display: block; margin-bottom: 6px; font-weight: 600; }
    .color-row { display: flex; gap: 10px; align-items: center; }
    .color-row input[type="color"] { width: 48px; height: 36px; padding: 0; border: 1px solid var(--vscode-input-border, transparent); background: transparent; }
    .color-row input[type="text"] { flex: 1; min-width: 0; padding: 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
    .checkbox-row { display: flex; align-items: center; gap: 8px; margin: 12px 0 16px; }
    .button-row { display: flex; gap: 10px; margin-top: 20px; }
    button { padding: 8px 14px; border: 1px solid var(--vscode-button-border, transparent); cursor: pointer; }
    #applyButton { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    #cancelButton { color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); background: var(--vscode-button-secondaryBackground, transparent); }
    .hint { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 6px; }
    .error { color: var(--vscode-errorForeground); min-height: 18px; margin-top: 4px; }
    .palette-section { margin-bottom: 24px; }
    .swatch-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
    .swatch { border-radius: 6px; padding: 10px; min-height: 92px; box-sizing: border-box; border: 1px solid rgba(127,127,127,0.2); }
    .swatch-label { font-weight: 700; }
    .swatch-hex, .swatch-contrast { font-size: 12px; margin-top: 6px; }
    .warn-disabled { opacity: 0.55; pointer-events: none; }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .controls { position: static; }
    }
  </style>
</head>
<body>
  <h1>Theme Colors</h1>
  <p class="hint">Pick the base colors and preview the generated palette values, including whether the text color becomes black or white.</p>
  <div class="layout">
    <div class="controls">
      <div class="field">
        <label for="primaryHex">Primary</label>
        <div class="color-row">
          <input id="primaryColor" type="color" value="${escapeHtml(primary)}" />
          <input id="primaryHex" type="text" value="${escapeHtml(primary)}" spellcheck="false" />
        </div>
        <div class="error" id="primaryError"></div>
      </div>
      <div class="field">
        <label for="secondaryHex">Secondary</label>
        <div class="color-row">
          <input id="secondaryColor" type="color" value="${escapeHtml(secondary)}" />
          <input id="secondaryHex" type="text" value="${escapeHtml(secondary)}" spellcheck="false" />
        </div>
        <div class="error" id="secondaryError"></div>
      </div>
      <label class="checkbox-row">
        <input id="useDefaultWarn" type="checkbox" ${useDefaultWarn ? 'checked' : ''} />
        <span>Use default Material red for warn/error</span>
      </label>
      <div class="field" id="warnField">
        <label for="warnHex">Warn / Error</label>
        <div class="color-row">
          <input id="warnColor" type="color" value="${escapeHtml(warn)}" />
          <input id="warnHex" type="text" value="${escapeHtml(warn)}" spellcheck="false" />
        </div>
        <div class="error" id="warnError"></div>
      </div>
      <div class="button-row">
        <button id="applyButton">Apply</button>
        <button id="cancelButton" type="button">Cancel</button>
      </div>
    </div>
    <div id="previewRoot">
      ${renderPaletteSection('Primary Preview', primary)}
      ${renderPaletteSection('Secondary Preview', secondary)}
      ${renderPaletteSection(useDefaultWarn ? 'Warn Preview (Default Material red)' : 'Warn Preview', useDefaultWarn ? '#f44336' : warn)}
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const DEFAULT_WARN = '#f44336';
    const ids = {
      primaryColor: document.getElementById('primaryColor'),
      primaryHex: document.getElementById('primaryHex'),
      secondaryColor: document.getElementById('secondaryColor'),
      secondaryHex: document.getElementById('secondaryHex'),
      warnColor: document.getElementById('warnColor'),
      warnHex: document.getElementById('warnHex'),
      useDefaultWarn: document.getElementById('useDefaultWarn'),
      warnField: document.getElementById('warnField'),
      previewRoot: document.getElementById('previewRoot'),
      applyButton: document.getElementById('applyButton'),
      cancelButton: document.getElementById('cancelButton'),
      primaryError: document.getElementById('primaryError'),
      secondaryError: document.getElementById('secondaryError'),
      warnError: document.getElementById('warnError')
    };

    const normalizeHex = (value) => {
      const trimmed = String(value || '').trim();
      const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
      return '#' + raw.toLowerCase();
    };
    const isHexColor = (value) => /^#?[0-9a-fA-F]{6}$/.test(String(value || '').trim());
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
    const toHex = (n) => n.toString(16).padStart(2, '0');
    const parseRgb = (hex) => {
      const h = normalizeHex(hex).slice(1);
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    };
    const mix = (a, b, t) => ({ r: clamp(a.r + (b.r - a.r) * t), g: clamp(a.g + (b.g - a.g) * t), b: clamp(a.b + (b.b - a.b) * t) });
    const rgbToHex = (rgb) => '#' + toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b);
    const relativeLuminance = (rgb) => {
      const toLinear = (c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
    };
    const contrastText = (hex) => relativeLuminance(parseRgb(hex)) > 0.5 ? '#000000' : '#ffffff';
    const escapeHtml = (text) => String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const buildPalette = (hex) => {
      const base = parseRgb(hex);
      const white = { r: 255, g: 255, b: 255 };
      const black = { r: 0, g: 0, b: 0 };
      const tints = {
        50: rgbToHex(mix(base, white, 0.92)),
        100: rgbToHex(mix(base, white, 0.80)),
        200: rgbToHex(mix(base, white, 0.65)),
        300: rgbToHex(mix(base, white, 0.50)),
        400: rgbToHex(mix(base, white, 0.30)),
        500: rgbToHex(base),
        600: rgbToHex(mix(base, black, 0.12)),
        700: rgbToHex(mix(base, black, 0.24)),
        800: rgbToHex(mix(base, black, 0.36)),
        900: rgbToHex(mix(base, black, 0.50))
      };
      const accents = { A100: tints[200], A200: tints[500], A400: tints[700], A700: tints[800] };
      return { tints, accents };
    };
    const renderSection = (title, hex) => {
      const palette = buildPalette(hex);
      const items = [...Object.entries(palette.tints), ...Object.entries(palette.accents)];
      return '<section class="palette-section"><h3>' + escapeHtml(title) + '</h3><div class="swatch-grid">' +
        items.map(([label, color]) => {
          const textColor = contrastText(color);
          return '<div class="swatch" style="background:' + color + ';color:' + textColor + '">' +
            '<div class="swatch-label">' + escapeHtml(label) + '</div>' +
            '<div class="swatch-hex">' + escapeHtml(color) + '</div>' +
            '<div class="swatch-contrast">' + (textColor === '#000000' ? 'Black text' : 'White text') + '</div>' +
          '</div>';
        }).join('') + '</div></section>';
    };

    function syncColorPair(colorEl, hexEl) {
      colorEl.addEventListener('input', () => {
        hexEl.value = colorEl.value;
        validateAndRender();
      });
      hexEl.addEventListener('input', () => {
        if (isHexColor(hexEl.value)) {
          colorEl.value = normalizeHex(hexEl.value);
        }
        validateAndRender();
      });
    }

    function validateAndRender() {
      const primaryOk = isHexColor(ids.primaryHex.value);
      const secondaryOk = isHexColor(ids.secondaryHex.value);
      const warnActive = !ids.useDefaultWarn.checked;
      const warnOk = !warnActive || isHexColor(ids.warnHex.value);
      ids.primaryError.textContent = primaryOk ? '' : 'Use hex like #3f51b5.';
      ids.secondaryError.textContent = secondaryOk ? '' : 'Use hex like #ff4081.';
      ids.warnError.textContent = warnOk ? '' : 'Use hex like #f44336.';
      ids.warnField.classList.toggle('warn-disabled', ids.useDefaultWarn.checked);

      if (!primaryOk || !secondaryOk || !warnOk) {
        return false;
      }

      const primary = normalizeHex(ids.primaryHex.value);
      const secondary = normalizeHex(ids.secondaryHex.value);
      const warn = ids.useDefaultWarn.checked ? DEFAULT_WARN : normalizeHex(ids.warnHex.value);
      ids.previewRoot.innerHTML =
        renderSection('Primary Preview', primary) +
        renderSection('Secondary Preview', secondary) +
        renderSection(ids.useDefaultWarn.checked ? 'Warn Preview (Default Material red)' : 'Warn Preview', warn);
      return true;
    }

    syncColorPair(ids.primaryColor, ids.primaryHex);
    syncColorPair(ids.secondaryColor, ids.secondaryHex);
    syncColorPair(ids.warnColor, ids.warnHex);
    ids.useDefaultWarn.addEventListener('change', validateAndRender);
    ids.cancelButton.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    ids.applyButton.addEventListener('click', () => {
      if (!validateAndRender()) {
        return;
      }
      vscode.postMessage({
        type: 'submit',
        primaryHex: normalizeHex(ids.primaryHex.value),
        secondaryHex: normalizeHex(ids.secondaryHex.value),
        useDefaultWarn: ids.useDefaultWarn.checked,
        warnHex: ids.useDefaultWarn.checked ? undefined : normalizeHex(ids.warnHex.value)
      });
    });
    validateAndRender();
  </script>
</body>
</html>`;

    return await new Promise<{ primaryHex: string; secondaryHex: string; useDefaultWarn: boolean; warnHex?: string } | undefined>((resolve) => {
        let settled = false;
        const finish = (result: { primaryHex: string; secondaryHex: string; useDefaultWarn: boolean; warnHex?: string } | undefined) => {
            if (settled) { return; }
            settled = true;
            resolve(result);
        };

        panel.onDidDispose(() => finish(undefined));
        panel.webview.onDidReceiveMessage((message) => {
            if (message?.type === 'cancel') {
                finish(undefined);
                panel.dispose();
                return;
            }
            if (message?.type === 'submit') {
                finish({
                    primaryHex: normalizeHex(String(message.primaryHex ?? '')),
                    secondaryHex: normalizeHex(String(message.secondaryHex ?? '')),
                    useDefaultWarn: !!message.useDefaultWarn,
                    warnHex: message.warnHex ? normalizeHex(String(message.warnHex)) : undefined
                });
                panel.dispose();
            }
        });
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
            if (normalized.includes('scss/main.scss')) { hasAnyStylesScssRef = true; }
        }
        for (const p of collectStyleEntries(testOptions?.styles)) {
            const normalized = p.replace(/\\/g, '/');
            if (normalized.includes('styles.css')) { hasAnyStylesCssRef = true; }
            if (normalized.includes('scss/main.scss')) { hasAnyStylesScssRef = true; }
        }
    }

    const rootSchematicsStyle = angularJson?.schematics?.['@schematics/angular:component']?.style;
    const isSchematicsScss = rootSchematicsStyle === 'scss';

    const srcDir = path.join(workspaceRoot, 'src');
    const mainScssPath = path.join(srcDir, 'scss', 'main.scss');
    const alreadyConfigured = isSchematicsScss || hasAnyStylesScssRef || fs.existsSync(mainScssPath);
    if (alreadyConfigured) {
        vscode.window.showErrorMessage('Wizly: This Angular workspace already appears to be configured for SCSS.');
        return;
    }

    const gitMarkerPath = path.join(workspaceRoot, '.git');
    if (!fs.existsSync(gitMarkerPath)) {
        const proceed = await vscode.window.showWarningMessage(
            'Wizly: This folder does not appear to be a Git repository (.git not found). This conversion changes many files and cannot be automatically undone. Do you want to continue?',
            { modal: true },
            'Yes',
            'No'
        );
        if (proceed !== 'Yes') { return; }
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

    const isMainGlobalStyleEntry = (p: string): boolean => {
        const normalized = normalizeStyleRef(p).toLowerCase();
        return /(^|\/)styles\.(css|scss)$/.test(normalized);
    };

    const updateStylesArray = (styles: any): boolean => {
        if (!Array.isArray(styles)) { return false; }
        let changed = false;
        for (let i = 0; i < styles.length; i++) {
            const s = styles[i];
            if (typeof s === 'string') {
                const normalized = normalizeStyleRef(s);
                if (isMainGlobalStyleEntry(normalized)) {
                    const suffixLen = normalized.endsWith('styles.css') ? 'styles.css'.length : 'styles.scss'.length;
                    styles[i] = s.slice(0, s.length - suffixLen) + 'scss/main.scss';
                    changed = true;
                }
            } else if (s && typeof s === 'object' && typeof (s as any).input === 'string') {
                const input = (s as any).input as string;
                const normalized = normalizeStyleRef(input);
                if (isMainGlobalStyleEntry(normalized)) {
                    const suffixLen = normalized.endsWith('styles.css') ? 'styles.css'.length : 'styles.scss'.length;
                    (s as any).input = input.slice(0, input.length - suffixLen) + 'scss/main.scss';
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

    const ensureDir = (dirPath: string) => {
        if (fs.existsSync(dirPath)) { return; }
        fs.mkdirSync(dirPath, { recursive: true });
    };

    const sevenOneDirs = ['abstracts', 'base', 'components', 'layout', 'pages', 'themes', 'vendors'];
    for (const d of sevenOneDirs) {
        ensureDir(path.join(scssDir, d));
    }

    const legacyStyleEntryPath = path.join(scssDir, 'style.scss');
    const mainEntryPath = path.join(scssDir, 'main.scss');
    if (fs.existsSync(legacyStyleEntryPath) && !fs.existsSync(mainEntryPath)) {
        fs.renameSync(legacyStyleEntryPath, mainEntryPath);
    }

    ensureFile(path.join(scssDir, 'abstracts', '_tokens.scss'), `$font-family-base: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;\n$color-text: #0f172a;\n$color-bg: #ffffff;\n`);
    ensureFile(path.join(scssDir, 'abstracts', '_mixins.scss'), ``);
    ensureFile(path.join(scssDir, 'base', '_base.scss'), `@use '../abstracts/tokens' as *;\n\nhtml,\nbody {\n  height: 100%;\n}\n\n:root {\n  --wizly-body-color: #{$color-text};\n  --wizly-body-background: #{$color-bg};\n}\n\nbody {\n  margin: 0;\n  font-family: $font-family-base;\n  color: var(--wizly-body-color, #{$color-text});\n  background: var(--wizly-body-background, #{$color-bg});\n}\n\nmat-form-field {\n  width: 100%;\n}\n`);
    ensureFile(mainEntryPath, `@use './abstracts/tokens' as *;\n@use './base/base';\n`);

    const stylesCssPath = path.join(srcDir, 'styles.css');
    const stylesScssPath = path.join(srcDir, 'styles.scss');
    const movedImportedStyleFiles = new Set<string>();
    const localStyleImportRegex = /^[^\S\r\n]*@(?:import|use)\s+(?:url\()?(["'])(?<spec>[^"')]+)\1\)?[^\r\n]*(\r?\n)?/gmi;
    const resolveLocalStyleImport = (spec: string, fromDirAbs: string): string | undefined => {
        const normalized = spec.replace(/\\/g, '/');
        if (/^[a-z][a-z0-9+.-]*:/i.test(normalized) || normalized.startsWith('//')) { return undefined; }

        let targetBase: string | undefined;
        const srcMatch = normalized.match(/^(?:\.?\/+)?src\/(?<rest>.+)$/i);
        if (srcMatch?.groups?.rest) {
            targetBase = path.join(workspaceRoot, 'src', String(srcMatch.groups.rest));
        } else if (normalized.startsWith('.') || normalized.startsWith('/')) {
            targetBase = path.resolve(fromDirAbs, normalized);
        }
        if (!targetBase) { return undefined; }

        const parsed = path.parse(targetBase);
        const candidates = parsed.ext
            ? [targetBase]
            : [
                `${targetBase}.scss`,
                `${targetBase}.sass`,
                `${targetBase}.css`,
                path.join(parsed.dir, `_${parsed.name}.scss`),
                path.join(parsed.dir, `_${parsed.name}.sass`)
            ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) { return candidate; }
        }
        return parsed.ext ? targetBase : undefined;
    };
    const collectLocalStyleImports = (text: string, fromFilePath: string) => {
        const fromDirAbs = path.dirname(fromFilePath);
        for (const match of text.matchAll(localStyleImportRegex)) {
            const spec = String((match as any).groups?.spec ?? '');
            const resolved = resolveLocalStyleImport(spec, fromDirAbs);
            if (resolved && resolved.startsWith(workspaceRoot + path.sep)) {
                movedImportedStyleFiles.add(resolved);
            }
        }
    };
    const containsMaterialPrebuiltThemeImport = (filePath: string) => {
        if (!fs.existsSync(filePath)) { return false; }
        const text = fs.readFileSync(filePath, 'utf8');
        return text.includes('@angular/material/prebuilt-themes/');
    };
    const removeMaterialPrebuiltThemeImports = (filePath: string) => {
        if (!fs.existsSync(filePath)) { return; }
        const before = fs.readFileSync(filePath, 'utf8');
        const after = before.replace(/^[^\S\r\n]*@import\s+(?:url\()?(["'])@angular\/material\/prebuilt-themes\/[^"']+\1\)?\s*;?[^\S\r\n]*(\r?\n)?/gmi, '');
        if (after !== before) {
            fs.writeFileSync(filePath, after, 'utf8');
        }
    };
    const moveGlobalStylesIntoMain = (sourcePath: string) => {
        if (!fs.existsSync(sourcePath)) { return; }
        const original = fs.readFileSync(sourcePath, 'utf8');
        if (!original.trim()) { return; }
        collectLocalStyleImports(original, sourcePath);
        let content = original;
        content = content.replace(/^[^\S\r\n]*@use\s+(['"])\.\/scss\/main\1\s*;?[^\S\r\n]*(\r?\n)?/gmi, '');
        content = content.replace(/^[^\S\r\n]*@use\s+(['"])\.\/scss\/style\1\s*;?[^\S\r\n]*(\r?\n)?/gmi, '');
        content = content.replace(/^[^\S\r\n]*@use\s+(['"])scss\/main\1\s*;?[^\S\r\n]*(\r?\n)?/gmi, '');
        content = content.replace(/^[^\S\r\n]*@use\s+(['"])scss\/style\1\s*;?[^\S\r\n]*(\r?\n)?/gmi, '');
        content = content.trim();
        if (!content) { return; }
        const currentMain = fs.existsSync(mainEntryPath) ? fs.readFileSync(mainEntryPath, 'utf8') : '';
        if (currentMain.includes(content)) { return; }
        fs.writeFileSync(mainEntryPath, `${currentMain.trimEnd()}\n\n${content}\n`, 'utf8');
    };

    if (fs.existsSync(stylesCssPath)) {
        moveGlobalStylesIntoMain(stylesCssPath);
        try { fs.unlinkSync(stylesCssPath); } catch { }
    }
    if (fs.existsSync(stylesScssPath)) {
        moveGlobalStylesIntoMain(stylesScssPath);
        try { fs.unlinkSync(stylesScssPath); } catch { }
    }

    const removeRedundantMovedStyleEntriesFromOptions = (options: any): boolean => {
        if (!options || typeof options !== 'object') { return false; }
        const styles = (options as any).styles;
        if (!Array.isArray(styles)) { return false; }

        const seen = new Set<string>();
        let changed = false;
        (options as any).styles = styles.filter((entry: any) => {
            const p = typeof entry === 'string'
                ? entry
                : entry && typeof entry === 'object' && typeof (entry as any).input === 'string'
                    ? (entry as any).input
                    : undefined;
            if (typeof p !== 'string') { return true; }

            const normalized = normalizeStyleRef(p);
            const dedupeKey = normalized.toLowerCase();
            if (seen.has(dedupeKey)) {
                changed = true;
                return false;
            }
            seen.add(dedupeKey);

            const abs = path.isAbsolute(p) ? p : path.resolve(workspaceRoot, p);
            if (abs !== mainEntryPath && movedImportedStyleFiles.has(abs)) {
                changed = true;
                return false;
            }
            return true;
        });
        return changed;
    };

    let cleanedRedundantStyleEntries = false;
    for (const name of Object.keys(projects)) {
        const proj = projects[name];
        const targets = getTargets(proj);
        if (targets?.build?.options) { cleanedRedundantStyleEntries = removeRedundantMovedStyleEntriesFromOptions(targets.build.options) || cleanedRedundantStyleEntries; }
        if (targets?.test?.options) { cleanedRedundantStyleEntries = removeRedundantMovedStyleEntriesFromOptions(targets.test.options) || cleanedRedundantStyleEntries; }
    }
    if (cleanedRedundantStyleEntries) {
        writeJson(angularJsonPath, angularJson);
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
    const magicCandidatesByCssPath = new Map<string, { cssPath: string; indexPath?: string }>();
    for (const indexUri of indexFiles) {
        if (!indexUri.fsPath.startsWith(workspaceRoot + path.sep)) { continue; }
        const cssPath = path.join(path.dirname(indexUri.fsPath), 'magic-styles.css');
        if (!fs.existsSync(cssPath)) { continue; }
        magicCandidatesByCssPath.set(cssPath, { cssPath, indexPath: indexUri.fsPath });
    }

    const collectMagicStylePathsFromOptions = (options: any): string[] => {
        if (!options || typeof options !== 'object') { return []; }
        const styles = (options as any).styles;
        if (!Array.isArray(styles)) { return []; }

        const out: string[] = [];
        for (const entry of styles) {
            const p = typeof entry === 'string'
                ? entry
                : entry && typeof entry === 'object' && typeof (entry as any).input === 'string'
                    ? (entry as any).input
                    : undefined;
            if (typeof p !== 'string') { continue; }
            const normalized = normalizeStyleRef(p).toLowerCase();
            if (!normalized.endsWith('magic-styles.css')) { continue; }
            const abs = path.isAbsolute(p) ? p : path.resolve(workspaceRoot, p);
            if (fs.existsSync(abs)) {
                out.push(abs);
            }
        }
        return out;
    };

    for (const name of Object.keys(projects)) {
        const proj = projects[name];
        const buildOptions = getOptions(proj, 'build');
        const testOptions = getOptions(proj, 'test');
        for (const cssPath of [...collectMagicStylePathsFromOptions(buildOptions), ...collectMagicStylePathsFromOptions(testOptions)]) {
            if (!magicCandidatesByCssPath.has(cssPath)) {
                magicCandidatesByCssPath.set(cssPath, { cssPath });
            }
        }
    }

    const magicCandidates = [...magicCandidatesByCssPath.values()];

    const removeMagicLinkTag = (indexPath?: string) => {
        if (!indexPath || !fs.existsSync(indexPath)) { return; }
        const before = fs.readFileSync(indexPath, 'utf8');
        const after = before.replace(/^[^\S\r\n]*<link\b[^>]*magic-styles\.css[^>]*>\s*(\r?\n)?/gmi, '');
        if (after !== before) {
            fs.writeFileSync(indexPath, after, 'utf8');
        }
    };

    const removeMissingMagicStylesFromOptions = (options: any): boolean => {
        if (!options || typeof options !== 'object') { return false; }
        const styles = (options as any).styles;
        if (!Array.isArray(styles)) { return false; }
        const beforeLen = styles.length;
        const keep = (entry: any): boolean => {
            const p = typeof entry === 'string'
                ? entry
                : entry && typeof entry === 'object' && typeof (entry as any).input === 'string'
                    ? (entry as any).input
                    : undefined;
            if (typeof p !== 'string') { return true; }
            const normalized = normalizeStyleRef(p).toLowerCase();
            const isMagicStyle = normalized.endsWith('magic-styles.css') || normalized.endsWith('magic-styles.scss');
            if (!isMagicStyle) { return true; }
            const abs = path.isAbsolute(p) ? p : path.resolve(workspaceRoot, p);
            return fs.existsSync(abs);
        };
        (options as any).styles = styles.filter(keep);
        return (options as any).styles.length !== beforeLen;
    };

    const removeMissingMagicStylesFromAngularJson = (): boolean => {
        let changed = false;
        for (const name of Object.keys(projects)) {
            const proj = projects[name];
            const targets = getTargets(proj);
            if (targets?.build?.options) { changed = removeMissingMagicStylesFromOptions(targets.build.options) || changed; }
            if (targets?.test?.options) { changed = removeMissingMagicStylesFromOptions(targets.test.options) || changed; }
        }
        return changed;
    };

    const cleanupMagicStyleReferencesAfterDelete = () => {
        const changed = removeMissingMagicStylesFromAngularJson();
        if (changed) {
            writeJson(angularJsonPath, angularJson);
        }
    };

    if (magicCandidates.length > 0) {
        const toRel = (p: string) => path.relative(workspaceRoot, p);
        let magicChosen = magicCandidates[0];
        if (magicCandidates.length > 1) {
            const picked = await vscode.window.showQuickPick(
                magicCandidates.map((c, i) => ({
                    label: toRel(c.cssPath),
                    description: c.indexPath ? toRel(c.indexPath) : 'Referenced from angular.json',
                    index: i
                })),
                { title: 'Wizly: Choose magic-styles.css' }
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
                    description: 'Moves the contents into src/scss/vendors/_magic-styles.scss and deletes magic-styles.css.',
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
            removeMagicLinkTag(magicChosen.indexPath);
            cleanupMagicStyleReferencesAfterDelete();
        } else if (action?.id === 'convert') {
            const magicScssPath = path.join(scssDir, 'vendors', '_magic-styles.scss');
            if (fs.existsSync(magicScssPath)) {
                const overwrite = await vscode.window.showWarningMessage(
                    'Wizly: src/scss/vendors/_magic-styles.scss already exists. Overwrite?',
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

            const styleEntryPath = path.join(scssDir, 'main.scss');
            if (fs.existsSync(styleEntryPath)) {
                const current = fs.readFileSync(styleEntryPath, 'utf8');
                if (!current.includes(`./vendors/magic-styles`) && !current.includes(`vendors/magic-styles`) && !current.includes(`magic-styles`)) {
                    fs.writeFileSync(styleEntryPath, `${current.trimEnd()}\n@use './vendors/magic-styles';\n`, 'utf8');
                }
            }

            const themeFilesToCheck = [mainEntryPath, magicScssPath, ...movedImportedStyleFiles].filter((p, i, arr) => arr.indexOf(p) === i);
            if (themeFilesToCheck.some(containsMaterialPrebuiltThemeImport)) {
                const themePick = await vscode.window.showQuickPick(
                    [
                        {
                            label: 'Keep prebuilt theme',
                            description: 'Keeps the Angular Material prebuilt theme import.',
                            id: 'keep'
                        },
                        {
                            label: 'Remove prebuilt theme',
                            description: 'Removes the prebuilt theme import. You can generate your own theme with Wizly.',
                            id: 'remove'
                        }
                    ],
                    { title: 'Wizly: Remove Angular Material prebuilt theme import?' }
                );
                if (themePick?.id === 'remove') {
                    for (const filePath of themeFilesToCheck) {
                        removeMaterialPrebuiltThemeImports(filePath);
                    }
                }
            }

            removeMagicLinkTag(magicChosen.indexPath);
            try {
                fs.unlinkSync(magicChosen.cssPath);
            } catch (err) {
                vscode.window.showErrorMessage(`Wizly: Failed to remove magic-styles.css: ${err instanceof Error ? err.message : String(err)}`);
                return;
            }
            cleanupMagicStyleReferencesAfterDelete();
        }
    }

    const doc = await vscode.workspace.openTextDocument(mainEntryPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    showCommandSuccess('Wizly: Converted Angular workspace to SCSS.', {
        created: [path.relative(workspaceRoot, mainEntryPath).replace(/\\/g, '/')],
        nextStep: 'Restart ng serve, then continue with theme generation or the next styling step.'
    });
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
    const writeJson = (filePath: string, value: any) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
    const manifestCandidates = [
        path.join(workspaceRoot, 'public', 'manifest.webmanifest'),
        path.join(workspaceRoot, 'src', 'manifest.webmanifest'),
        path.join(workspaceRoot, 'src', 'public', 'manifest.webmanifest')
    ];
    const findManifestPath = () => manifestCandidates.find(candidate => fs.existsSync(candidate));
    if (hasServiceWorkerDep || fs.existsSync(ngswConfigPath) || !!findManifestPath()) {
        vscode.window.showErrorMessage('Wizly: This Angular workspace already appears to have PWA support configured.');
        return;
    }

    const gitMarkerPath = path.join(workspaceRoot, '.git');
    if (!fs.existsSync(gitMarkerPath)) {
        const proceed = await vscode.window.showWarningMessage(
            'Wizly: This folder does not appear to be a Git repository (.git not found). This conversion changes many files and cannot be automatically undone. Do you want to continue?',
            { modal: true },
            'Yes',
            'No'
        );
        if (proceed !== 'Yes') { return; }
    }

    const hasFile = (name: string) => fs.existsSync(path.join(workspaceRoot, name));
    const pkgManager = hasFile('pnpm-lock.yaml') ? 'pnpm'
        : hasFile('yarn.lock') ? 'yarn'
            : 'npm';

    const getInstalledPackageVersionFromNodeModules = (name: string): string | undefined => {
        const pkgJsonPath = path.join(workspaceRoot, 'node_modules', ...name.split('/'), 'package.json');
        if (!fs.existsSync(pkgJsonPath)) { return undefined; }
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as any;
            return typeof pkg?.version === 'string' ? pkg.version : undefined;
        } catch {
            return undefined;
        }
    };

    const getInstalledPackageVersionFromPackageLock = (name: string): string | undefined => {
        const packageLockPath = path.join(workspaceRoot, 'package-lock.json');
        if (!fs.existsSync(packageLockPath)) { return undefined; }
        try {
            const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8')) as any;
            const v1 = lock?.dependencies?.[name]?.version;
            if (typeof v1 === 'string') { return v1; }
            const v2 = lock?.packages?.[`node_modules/${name}`]?.version;
            if (typeof v2 === 'string') { return v2; }
            return undefined;
        } catch {
            return undefined;
        }
    };

    const angularCoreVersion = getInstalledPackageVersionFromPackageLock('@angular/core')
        ?? getInstalledPackageVersionFromNodeModules('@angular/core');

    if (!angularCoreVersion) {
        vscode.window.showErrorMessage('Wizly: Could not determine the installed @angular/core version (package-lock.json or node_modules). Run npm install first, then try again.');
        return;
    }

    const angularCoreSpecifier = typeof packageJson?.dependencies?.['@angular/core'] === 'string'
        ? (packageJson.dependencies['@angular/core'] as string)
        : typeof packageJson?.devDependencies?.['@angular/core'] === 'string'
            ? (packageJson.devDependencies['@angular/core'] as string)
            : undefined;

    const pwaSpecifier = `@angular/pwa@${angularCoreVersion}`;

    const hasPwaMarkers = fs.existsSync(ngswConfigPath) || !!findManifestPath() || hasServiceWorkerDep;
    const installedServiceWorkerVersion = getInstalledPackageVersionFromPackageLock('@angular/service-worker')
        ?? getInstalledPackageVersionFromNodeModules('@angular/service-worker');

    if (hasPwaMarkers && installedServiceWorkerVersion) {
        vscode.window.showErrorMessage('Wizly: This Angular workspace already appears to have PWA support configured.');
        return;
    }

    const setServiceWorkerSpecifierInPackageJson = (specifier: string) => {
        const pkgPath = packageJsonPath;
        if (!fs.existsSync(pkgPath)) { return; }
        const pkg = readJson<any>(pkgPath);
        const deps = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {};
        const devDeps = pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {};

        if (typeof deps['@angular/service-worker'] === 'string') {
            deps['@angular/service-worker'] = specifier;
        } else if (typeof devDeps['@angular/service-worker'] === 'string') {
            devDeps['@angular/service-worker'] = specifier;
        } else {
            const coreInDeps = typeof deps['@angular/core'] === 'string';
            const coreInDevDeps = typeof devDeps['@angular/core'] === 'string';
            if (coreInDeps) {
                deps['@angular/service-worker'] = specifier;
            } else if (coreInDevDeps) {
                devDeps['@angular/service-worker'] = specifier;
            } else {
                deps['@angular/service-worker'] = specifier;
            }
        }
        pkg.dependencies = deps;
        pkg.devDependencies = devDeps;
        fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    };

    const cmd = pkgManager === 'pnpm'
        ? `pnpm exec ng add ${pwaSpecifier} --project "${projectName}" --skip-confirmation`
        : pkgManager === 'yarn'
            ? `yarn ng add ${pwaSpecifier} --project "${projectName}" --skip-confirmation`
            : `npx ng add ${pwaSpecifier} --project "${projectName}" --skip-confirmation`;

    const preInstallServiceWorkerCmd = pkgManager === 'pnpm'
        ? `pnpm add @angular/service-worker@${angularCoreVersion} --save-exact`
        : pkgManager === 'yarn'
            ? `yarn add @angular/service-worker@${angularCoreVersion} --exact`
            : `npm install @angular/service-worker@${angularCoreVersion} --save --save-exact`;

    const channel = getOutputChannel();
    channel.show(true);
    channel.appendLine(`Wizly: Enabling PWA for Angular project "${projectName}"...`);
    channel.appendLine(`Wizly: Pre-installing @angular/service-worker@${angularCoreVersion} to avoid npm ERESOLVE...`);
    channel.appendLine(`Wizly: Running: ${preInstallServiceWorkerCmd}`);
    channel.appendLine(`Wizly: Running: ${cmd}`);

    try {
        let updatedBudgetScopes: string[] = [];
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Wizly: Convert Angular Project to PWA (${projectName})`,
                cancellable: false
            },
            async () => {
                await new Promise<void>((resolve, reject) => {
                    const child = spawn(preInstallServiceWorkerCmd, [], { cwd: workspaceRoot, shell: true, env: process.env });
                    child.stdout.on('data', (d) => channel.append(String(d)));
                    child.stderr.on('data', (d) => channel.append(String(d)));
                    child.on('error', reject);
                    child.on('close', (code) => {
                        if (code === 0) { resolve(); }
                        else { reject(new Error(`Pre-install failed with exit code ${code}`)); }
                    });
                });

                if (!hasPwaMarkers) {
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

                if (angularCoreSpecifier) {
                    setServiceWorkerSpecifierInPackageJson(angularCoreSpecifier);
                }

                const refreshedAngularJson = readJson<any>(angularJsonPath);
                updatedBudgetScopes = relaxDefaultPwaInitialBudgets(refreshedAngularJson, projectName);
                if (updatedBudgetScopes.length > 0) {
                    writeJson(angularJsonPath, refreshedAngularJson);
                    channel.appendLine(`Wizly: Relaxed default Angular initial budgets for Magic-sized production bundles (${updatedBudgetScopes.join(', ')}).`);
                }
            }
        );

        if (updatedBudgetScopes.length > 0) {
            channel.appendLine('Wizly: Updated initial budget defaults from 500kb/1mb to 3mb/5mb where Angular CLI had added the standard production budget.');
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Wizly: Failed to enable PWA. ${err instanceof Error ? err.message : String(err)}. Check the Wizly output for details.`);
        return;
    }

    const addUpdateHandling = await vscode.window.showQuickPick(
        [
            {
                label: 'Yes (add update prompt service)',
                description: 'Creates src/app/pwa-update.service.ts and wires it into AppComponent to prompt on new versions.',
                id: 'yes'
            },
            {
                label: 'No',
                description: 'Only enable PWA via Angular CLI.',
                id: 'no'
            }
        ],
        { title: 'Wizly: Add PWA update handling (check + prompt + reload)?' }
    );

    const addPwaUpdateHandling = async (): Promise<string | undefined> => {
        const proj = projects?.[projectName];
        const sourceRoot = typeof proj?.sourceRoot === 'string' ? proj.sourceRoot : 'src';
        const appDir = path.join(workspaceRoot, sourceRoot, 'app');
        if (!fs.existsSync(appDir)) {
            vscode.window.showWarningMessage(`Wizly: Could not find ${path.relative(workspaceRoot, appDir)}. Skipping update handling scaffolding.`);
            return undefined;
        }

        const servicePath = path.join(appDir, 'pwa-update.service.ts');
        if (!fs.existsSync(servicePath)) {
            const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
            const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
            const hasMaterial = typeof deps['@angular/material'] === 'string'
                || typeof devDeps['@angular/material'] === 'string'
                || fs.existsSync(path.join(workspaceRoot, 'node_modules', '@angular', 'material', 'package.json'));

            const serviceContent = hasMaterial
                ? `import { Component, inject, Injectable, Injector } from '@angular/core';\nimport { SwUpdate, VersionReadyEvent } from '@angular/service-worker';\nimport { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';\nimport { firstValueFrom } from 'rxjs';\nimport { filter, take } from 'rxjs/operators';\n\nexport type PwaUpdateMode = 'prompt' | 'silent';\n\nexport type PwaUpdateOptions = {\n    checkIntervalMs?: number;\n    mode?: PwaUpdateMode;\n    prompt?: (message: string) => boolean | Promise<boolean>;\n};\n\n@Component({\n    selector: 'wizly-pwa-update-dialog',\n    standalone: true,\n    template: ` + "`" + `<h2 style="margin: 0 0 12px">Update available</h2>\n<p style="margin: 0 0 16px">{{ data.message }}</p>\n<div style="display: flex; gap: 8px; justify-content: flex-end">\n  <button type="button" (click)="close(false)">Later</button>\n  <button type="button" (click)="close(true)">Reload</button>\n</div>\n` + "`" + `\n})\nexport class PwaUpdateDialogComponent {\n    readonly data = inject<{ message: string }>(MAT_DIALOG_DATA);\n    private readonly dialogRef = inject(MatDialogRef<PwaUpdateDialogComponent, boolean>);\n\n    close(value: boolean) {\n        this.dialogRef.close(value);\n    }\n}\n\n@Injectable({ providedIn: 'root' })\nexport class PwaUpdateService {\n    private readonly swUpdate = inject(SwUpdate);\n    private readonly injector = inject(Injector);\n\n    init(options?: PwaUpdateOptions) {\n        if (!this.swUpdate.isEnabled) { return; }\n\n        this.swUpdate.versionUpdates\n            .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))\n            .subscribe(() => {\n                void this.handleVersionReady(options);\n            });\n\n        const intervalMs = options?.checkIntervalMs ?? 10 * 60_000;\n        setInterval(() => this.swUpdate.checkForUpdate(), intervalMs);\n    }\n\n    private async handleVersionReady(options?: PwaUpdateOptions) {\n        const mode: PwaUpdateMode = options?.mode ?? 'prompt';\n        if (mode === 'silent') {\n            await this.swUpdate.activateUpdate();\n            location.reload();\n            return;\n        }\n\n        const message = 'A new version is available. Reload now?';\n        const shouldReload = await this.promptReload(message, options);\n        if (shouldReload) {\n            await this.swUpdate.activateUpdate();\n            location.reload();\n        }\n    }\n\n    private async promptReload(message: string, options?: PwaUpdateOptions): Promise<boolean> {\n        if (options?.prompt) {\n            return await options.prompt(message);\n        }\n\n        const dialog = this.injector.get(MatDialog, null as any);\n        if (dialog) {\n            const ref = dialog.open(PwaUpdateDialogComponent, {\n                data: { message },\n                disableClose: true,\n                width: '420px'\n            });\n            const result = await firstValueFrom(ref.afterClosed().pipe(take(1)));\n            return result === true;\n        }\n\n        return confirm(message);\n    }\n}\n`
                : `import { inject, Injectable } from '@angular/core';\nimport { SwUpdate, VersionReadyEvent } from '@angular/service-worker';\nimport { filter } from 'rxjs/operators';\n\nexport type PwaUpdateMode = 'prompt' | 'silent';\n\nexport type PwaUpdateOptions = {\n    checkIntervalMs?: number;\n    mode?: PwaUpdateMode;\n    prompt?: (message: string) => boolean | Promise<boolean>;\n};\n\n@Injectable({ providedIn: 'root' })\nexport class PwaUpdateService {\n    private readonly swUpdate = inject(SwUpdate);\n\n    init(options?: PwaUpdateOptions) {\n        if (!this.swUpdate.isEnabled) { return; }\n\n        this.swUpdate.versionUpdates\n            .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))\n            .subscribe(() => {\n                void this.handleVersionReady(options);\n            });\n\n        const intervalMs = options?.checkIntervalMs ?? 10 * 60_000;\n        setInterval(() => this.swUpdate.checkForUpdate(), intervalMs);\n    }\n\n    private async handleVersionReady(options?: PwaUpdateOptions) {\n        const mode: PwaUpdateMode = options?.mode ?? 'prompt';\n        if (mode === 'silent') {\n            await this.swUpdate.activateUpdate();\n            location.reload();\n            return;\n        }\n\n        const message = 'A new version is available. Reload now?';\n        const shouldReload = options?.prompt ? await options.prompt(message) : confirm(message);\n        if (shouldReload) {\n            await this.swUpdate.activateUpdate();\n            location.reload();\n        }\n    }\n}\n`;
            fs.writeFileSync(servicePath, serviceContent, 'utf8');
        }

        const appComponentCandidates = await vscode.workspace.findFiles('**/app.component.ts', excludeGlob);
        const sourceRootAbs = path.join(workspaceRoot, sourceRoot) + path.sep;
        const scoped = appComponentCandidates
            .map(u => u.fsPath)
            .filter(p => p.startsWith(sourceRootAbs))
            .sort((a, b) => a.length - b.length);

        const appComponentPath = scoped[0];
        if (!appComponentPath || !fs.existsSync(appComponentPath)) {
            vscode.window.showWarningMessage('Wizly: Could not find app.component.ts to wire update handling. Created pwa-update.service.ts only.');
            return servicePath;
        }

        const before = fs.readFileSync(appComponentPath, 'utf8');
        let after = before;

        if (!after.includes(`'./pwa-update.service'`) && !after.includes(`"./pwa-update.service"`)) {
            const importLine = `import { PwaUpdateService } from './pwa-update.service';\n`;
            const importMatches = [...after.matchAll(/^[^\S\r\n]*import\s+[\s\S]*?;\s*(\r?\n)/gm)];
            if (importMatches.length > 0) {
                const last = importMatches[importMatches.length - 1];
                const insertAt = (last.index ?? 0) + last[0].length;
                after = after.slice(0, insertAt) + importLine + after.slice(insertAt);
            } else {
                after = importLine + after;
            }
        }

        const ensureInjectImport = (text: string): string => {
            const hasInjectImport = /from\s+['"]@angular\/core['"]/.test(text) && /\binject\b/.test(text);
            if (hasInjectImport) { return text; }
            const importRegex = /^\s*import\s*\{(?<names>[^}]+)\}\s*from\s*['"]@angular\/core['"];\s*$/m;
            const m = text.match(importRegex);
            if (m && m.groups?.names) {
                const names = m.groups.names.split(',').map(s => s.trim()).filter(Boolean);
                if (names.includes('inject')) { return text; }
                const updated = [...names, 'inject'].sort((a, b) => a.localeCompare(b)).join(', ');
                return text.replace(importRegex, `import { ${updated} } from '@angular/core';`);
            }
            return `import { inject } from '@angular/core';\n${text}`;
        };

        const ensureServiceField = (text: string): string => {
            if (text.includes('inject(PwaUpdateService)')) { return text; }
            if (!/export\s+class\s+AppComponent\b/.test(text)) { return text; }
            return text.replace(/(export\s+class\s+AppComponent\b[^{]*\{\s*)/m, `$1\n    private readonly pwaUpdateService = inject(PwaUpdateService);\n`);
        };

        const ensureInitCallInConstructorBody = (text: string): string => {
            if (text.includes('this.pwaUpdateService.init(') || text.includes('this.pwaUpdateService.init();')) { return text; }
            return text.replace(/\bconstructor\s*\([^)]*\)\s*\{\s*/m, (m) => `${m}\n        this.pwaUpdateService.init();\n`);
        };

        after = ensureInjectImport(after);
        after = ensureServiceField(after);

        if (/\bconstructor\s*\(/m.test(after)) {
            after = ensureInitCallInConstructorBody(after);
        } else if (/export\s+class\s+AppComponent\b/.test(after)) {
            const ctor = `\n    constructor() {\n        this.pwaUpdateService.init();\n    }\n`;
            after = after.replace(/(export\s+class\s+AppComponent\b[^{]*\{)/m, `$1${ctor}`);
        } else {
            vscode.window.showWarningMessage('Wizly: Could not safely wire update handling into AppComponent. Created pwa-update.service.ts only.');
            if (after !== before) {
                fs.writeFileSync(appComponentPath, after, 'utf8');
            }
            return servicePath;
        }

        if (after !== before) {
            fs.writeFileSync(appComponentPath, after, 'utf8');
        }

        return appComponentPath;
    };

    const updateHandlingDocToOpen = addUpdateHandling?.id === 'yes'
        ? await addPwaUpdateHandling()
        : undefined;
    const manifestPath = findManifestPath();

    const docToOpen = manifestPath && fs.existsSync(manifestPath)
        ? manifestPath
        : fs.existsSync(ngswConfigPath)
            ? ngswConfigPath
            : undefined;

    const effectiveDocToOpen = updateHandlingDocToOpen ?? docToOpen;
    if (effectiveDocToOpen) {
        const doc = await vscode.workspace.openTextDocument(effectiveDocToOpen);
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    const createdPaths = [path.relative(workspaceRoot, angularJsonPath).replace(/\\/g, '/')];
    if (manifestPath && fs.existsSync(manifestPath)) {
        createdPaths.push(path.relative(workspaceRoot, manifestPath).replace(/\\/g, '/'));
    }
    if (ngswConfigPath && fs.existsSync(ngswConfigPath)) {
        createdPaths.push(path.relative(workspaceRoot, ngswConfigPath).replace(/\\/g, '/'));
    }
    showCommandSuccess(`Wizly: Enabled PWA support for "${projectName}".`, {
        created: createdPaths,
        nextStep: 'Generate icons if needed and test the service worker in a production-style HTTPS run.'
    });
}

async function generatePwaIconsFromActiveImage() {
    const getActiveFileUri = (): vscode.Uri | undefined => {
        const uri = vscode.window.activeTextEditor?.document?.uri;
        if (uri && uri.scheme === 'file') { return uri; }
        const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const input: any = tab?.input;
        const tabUri: vscode.Uri | undefined = input?.uri;
        if (tabUri && tabUri.scheme === 'file') { return tabUri; }
        return undefined;
    };

    const activeUri = getActiveFileUri();
    if (!activeUri) {
        vscode.window.showErrorMessage('Wizly: Open the source icon image first, then run this command.');
        return;
    }

    const sourcePath = activeUri.fsPath;
    if (path.extname(sourcePath).toLowerCase() !== '.png') {
        vscode.window.showErrorMessage('Wizly: The active file must be a .png image.');
        return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Wizly: The active image must be inside an open workspace folder.');
        return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const srcRoot = path.join(workspaceRoot, 'src');
    const manifestCandidates = [
        path.join(workspaceRoot, 'public', 'manifest.webmanifest'),
        path.join(srcRoot, 'manifest.webmanifest'),
        path.join(srcRoot, 'public', 'manifest.webmanifest')
    ];
    const manifestPath = manifestCandidates.find(p => fs.existsSync(p));
    const ngswConfigPath = path.join(workspaceRoot, 'ngsw-config.json');

    if (!manifestPath || !fs.existsSync(ngswConfigPath)) {
        vscode.window.showErrorMessage('Wizly: This workspace does not appear to be a PWA (manifest.webmanifest or ngsw-config.json not found).');
        return;
    }

    let manifest: any;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
        vscode.window.showErrorMessage(`Wizly: Failed to read ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }

    const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
    const parsedIcons: Array<{ size: number; src: string }> = [];
    for (const icon of icons) {
        const src = typeof icon?.src === 'string' ? icon.src : undefined;
        const sizes = typeof icon?.sizes === 'string' ? icon.sizes : undefined;
        if (!src || !sizes) { continue; }
        if (/^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) { continue; }
        for (const token of sizes.split(/\s+/g).filter(Boolean)) {
            const m = token.match(/^(?<w>\d+)x(?<h>\d+)$/i);
            const w = m?.groups?.w ? Number(m.groups.w) : NaN;
            const h = m?.groups?.h ? Number(m.groups.h) : NaN;
            if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) { continue; }
            if (w !== h) { continue; }
            parsedIcons.push({ size: w, src });
        }
    }

    const uniqueKey = (p: { size: number; src: string }) => `${p.size}::${p.src}`;
    const unique = new Map<string, { size: number; src: string }>();
    for (const p of parsedIcons) {
        unique.set(uniqueKey(p), p);
    }
    const iconTargets = [...unique.values()].sort((a, b) => a.size - b.size || a.src.localeCompare(b.src));
    if (iconTargets.length === 0) {
        vscode.window.showErrorMessage('Wizly: No local square icon targets found in manifest.webmanifest (icons[].src + icons[].sizes).');
        return;
    }

    let srcPng: PNG;
    try {
        const buf = fs.readFileSync(sourcePath);
        srcPng = PNG.sync.read(buf);
    } catch (err) {
        vscode.window.showErrorMessage(`Wizly: Failed to read PNG: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }

    const faviconSizes = [16, 32, 48];
    const maxIconSize = Math.max(
        ...iconTargets.map(t => t.size),
        ...faviconSizes
    );

    if (srcPng.width < maxIconSize || srcPng.height < maxIconSize) {
        vscode.window.showErrorMessage(`Wizly: The active image is too small (${srcPng.width}x${srcPng.height}). It must be at least ${maxIconSize}x${maxIconSize}.`);
        return;
    }

    const writeMode = await vscode.window.showQuickPick(
        [
            {
                label: 'Overwrite existing files',
                description: 'Regenerates icon files even if they already exist.',
                id: 'overwrite'
            },
            {
                label: 'Skip existing files',
                description: 'Only creates missing icon files.',
                id: 'skip'
            }
        ],
        { title: 'Wizly: Generate PWA icons and favicon' }
    );
    if (!writeMode) { return; }

    const overwrite = writeMode.id === 'overwrite';

    const resizeRgbaBilinear = (src: Buffer, srcW: number, srcH: number, dstW: number, dstH: number): Buffer => {
        const dst = Buffer.alloc(dstW * dstH * 4);
        const scaleX = srcW / dstW;
        const scaleY = srcH / dstH;

        const idx = (x: number, y: number, w: number) => (y * w + x) * 4;

        for (let y = 0; y < dstH; y++) {
            const srcY = (y + 0.5) * scaleY - 0.5;
            const y0 = Math.max(0, Math.floor(srcY));
            const y1 = Math.min(srcH - 1, y0 + 1);
            const wy = srcY - y0;

            for (let x = 0; x < dstW; x++) {
                const srcX = (x + 0.5) * scaleX - 0.5;
                const x0 = Math.max(0, Math.floor(srcX));
                const x1 = Math.min(srcW - 1, x0 + 1);
                const wx = srcX - x0;

                const i00 = idx(x0, y0, srcW);
                const i10 = idx(x1, y0, srcW);
                const i01 = idx(x0, y1, srcW);
                const i11 = idx(x1, y1, srcW);

                const w00 = (1 - wx) * (1 - wy);
                const w10 = wx * (1 - wy);
                const w01 = (1 - wx) * wy;
                const w11 = wx * wy;

                const di = idx(x, y, dstW);
                for (let c = 0; c < 4; c++) {
                    const v = src[i00 + c] * w00 + src[i10 + c] * w10 + src[i01 + c] * w01 + src[i11 + c] * w11;
                    dst[di + c] = Math.max(0, Math.min(255, Math.round(v)));
                }
            }
        }

        return dst;
    };

    const toPngBuffer = (rgba: Buffer, size: number): Buffer => {
        const p = new PNG({ width: size, height: size });
        p.data = rgba;
        return PNG.sync.write(p);
    };

    const ensureDir = (dirPath: string) => {
        if (fs.existsSync(dirPath)) { return; }
        fs.mkdirSync(dirPath, { recursive: true });
    };

    let written = 0;
    let skipped = 0;
    const warnings: string[] = [];

    const resolveManifestIconTargetAbsPath = (src: string): string => {
        const normalized = src.replace(/\\/g, '/').replace(/^\//, '');
        if (normalized.startsWith('assets/')) {
            return path.join(srcRoot, normalized);
        }
        const publicRoot = path.join(workspaceRoot, 'public');
        if (manifestPath.replace(/\\/g, '/').includes('/public/') && fs.existsSync(publicRoot)) {
            return path.join(publicRoot, normalized);
        }
        return path.join(srcRoot, normalized);
    };

    for (const target of iconTargets) {
        const destAbs = resolveManifestIconTargetAbsPath(target.src);
        ensureDir(path.dirname(destAbs));
        if (!overwrite && fs.existsSync(destAbs)) {
            skipped++;
            continue;
        }
        try {
            const rgba = resizeRgbaBilinear(srcPng.data as any, srcPng.width, srcPng.height, target.size, target.size);
            const out = toPngBuffer(rgba, target.size);
            fs.writeFileSync(destAbs, out);
            written++;
        } catch (err) {
            warnings.push(`${path.relative(workspaceRoot, destAbs)}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    const buildIco = (images: Array<{ size: number; png: Buffer }>): Buffer => {
        const count = images.length;
        const headerSize = 6 + 16 * count;
        const dir = Buffer.alloc(headerSize);

        dir.writeUInt16LE(0, 0);
        dir.writeUInt16LE(1, 2);
        dir.writeUInt16LE(count, 4);

        let offset = headerSize;
        for (let i = 0; i < images.length; i++) {
            const { size, png } = images[i];
            const entryOffset = 6 + i * 16;
            dir.writeUInt8(size === 256 ? 0 : size, entryOffset + 0);
            dir.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
            dir.writeUInt8(0, entryOffset + 2);
            dir.writeUInt8(0, entryOffset + 3);
            dir.writeUInt16LE(1, entryOffset + 4);
            dir.writeUInt16LE(32, entryOffset + 6);
            dir.writeUInt32LE(png.length, entryOffset + 8);
            dir.writeUInt32LE(offset, entryOffset + 12);
            offset += png.length;
        }

        return Buffer.concat([dir, ...images.map(i => i.png)]);
    };

    const faviconAbs = path.join(srcRoot, 'favicon.ico');
    if (overwrite || !fs.existsSync(faviconAbs)) {
        try {
            const icoPngs = faviconSizes.map(size => {
                const rgba = resizeRgbaBilinear(srcPng.data as any, srcPng.width, srcPng.height, size, size);
                return { size, png: toPngBuffer(rgba, size) };
            });
            const ico = buildIco(icoPngs);
            fs.writeFileSync(faviconAbs, ico);
            written++;
        } catch (err) {
            warnings.push(`${path.relative(workspaceRoot, faviconAbs)}: ${err instanceof Error ? err.message : String(err)}`);
        }
    } else {
        skipped++;
    }

    if (warnings.length > 0) {
        const channel = getOutputChannel();
        channel.show(true);
        channel.appendLine('Wizly: PWA icon generation warnings:');
        for (const w of warnings) { channel.appendLine(`- ${w}`); }
    }

    const message = `Wizly: Generated PWA icons from ${path.basename(sourcePath)}. Written: ${written}, skipped: ${skipped}.`;
    if (warnings.length > 0) {
        vscode.window.showWarningMessage(message);
    } else {
        vscode.window.showInformationMessage(message);
    }
}

async function generateAngularMaterialThemeScss() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Wizly: Please open a folder first.');
        return;
    }

    const themeNameRaw = await vscode.window.showInputBox({
        title: 'Wizly: Theme name',
        prompt: 'Enter a theme name (e.g. acme, client-a, demo)',
        validateInput: (value) => {
            const v = value.trim();
            if (!v) { return 'Theme name is required.'; }
            if (!/^[a-zA-Z0-9][a-zA-Z0-9-_]*$/.test(v)) {
                return 'Use letters, numbers, hyphen and underscore only.';
            }
            return undefined;
        }
    });
    if (!themeNameRaw) { return; }
    const themeName = themeNameRaw.trim();

    const modePick = await vscode.window.showQuickPick(
        [
            { label: 'Light', description: 'Generates a light Angular Material theme.', id: 'light' },
            { label: 'Dark', description: 'Generates a dark Angular Material theme.', id: 'dark' },
            { label: 'Both', description: 'Generates both a light and dark Angular Material theme from the same colors.', id: 'both' }
        ],
        { title: 'Wizly: Theme mode' }
    );
    if (!modePick) { return; }
    const selectedMode = modePick.id as 'light' | 'dark' | 'both';
    const modes: Array<'light' | 'dark'> = selectedMode === 'both' ? ['light', 'dark'] : [selectedMode];

    let includeModeSuffix = selectedMode === 'both';
    if (!includeModeSuffix) {
        const suffixPick = await vscode.window.showQuickPick(
            [
                { label: 'Yes (recommended)', description: `File/bundle will include "-${selectedMode}" suffix.`, id: 'yes' },
                { label: 'No', description: 'File/bundle will not include the mode suffix.', id: 'no' }
            ],
            { title: 'Wizly: Include light/dark suffix in file and bundle name?' }
        );
        if (!suffixPick) { return; }
        includeModeSuffix = suffixPick.id === 'yes';
    }

    const pickedColors = await pickThemeColorsWithPreview();
    if (!pickedColors) { return; }
    const primaryHex = pickedColors.primaryHex;
    const secondaryHex = pickedColors.secondaryHex;
    const warnHex = pickedColors.warnHex;

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
    const angularJson = readJson<any>(angularJsonPath);
    const packageJson = readJson<any>(packageJsonPath);

    const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
    const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
    const hasMaterial = typeof deps['@angular/material'] === 'string'
        || typeof devDeps['@angular/material'] === 'string'
        || fs.existsSync(path.join(workspaceRoot, 'node_modules', '@angular', 'material', 'package.json'));
    if (!hasMaterial) {
        vscode.window.showErrorMessage('Wizly: @angular/material was not found in this workspace. Install Angular Material first, then try again.');
        return;
    }

    const readInstalledPackageVersion = (pkgName: string): string | undefined => {
        const pkgJsonPath = path.join(workspaceRoot, 'node_modules', ...pkgName.split('/'), 'package.json');
        if (!fs.existsSync(pkgJsonPath)) { return undefined; }
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
            return typeof pkg?.version === 'string' ? pkg.version : undefined;
        } catch {
            return undefined;
        }
    };
    const parseMajorVersion = (version: string | undefined): number | undefined => {
        if (!version) { return undefined; }
        const match = version.match(/(\d+)/);
        if (!match) { return undefined; }
        const major = Number(match[1]);
        return Number.isFinite(major) ? major : undefined;
    };
    const materialVersionRaw = typeof deps['@angular/material'] === 'string'
        ? deps['@angular/material']
        : typeof devDeps['@angular/material'] === 'string'
            ? devDeps['@angular/material']
            : readInstalledPackageVersion('@angular/material');
    const materialMajor = parseMajorVersion(materialVersionRaw);
    const useM2ThemingApi = (materialMajor ?? 0) >= 18;

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const defaultProjectName = typeof angularJson?.defaultProject === 'string' ? angularJson.defaultProject : undefined;

    const isAppProject = (proj: any) => {
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && (builder.includes(':application') || builder.includes(':browser') || builder.includes('application') || builder.includes('browser'));
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
            { title: 'Wizly: Choose Angular project to add the theme bundle to' }
        );
        if (!picked) { return; }
        projectName = picked.label;
    }

    const primaryPalette = buildThemePalette(primaryHex);
    const secondaryPalette = buildThemePalette(secondaryHex);
    const warnPalette = warnHex ? buildThemePalette(warnHex) : undefined;

    const toScssMap = (entries: Record<string | number, string>, indent: string) => {
        const keys = Object.keys(entries);
        const lines: string[] = [];
        for (const k of keys) {
            lines.push(`${indent}${k}: ${(entries as any)[k]},`);
        }
        return lines.join('\n');
    };

    const primaryMap = `(\n${toScssMap(primaryPalette.tints, '    ')}\n${toScssMap(primaryPalette.accents, '    ')}\n    contrast: (\n${toScssMap(primaryPalette.contrast, '      ')}\n    ),\n)`;
    const secondaryMap = `(\n${toScssMap(secondaryPalette.tints, '    ')}\n${toScssMap(secondaryPalette.accents, '    ')}\n    contrast: (\n${toScssMap(secondaryPalette.contrast, '      ')}\n    ),\n)`;
    const warnMap = warnPalette
        ? `(\n${toScssMap(warnPalette.tints, '    ')}\n${toScssMap(warnPalette.accents, '    ')}\n    contrast: (\n${toScssMap(warnPalette.contrast, '      ')}\n    ),\n)`
        : undefined;
    const materialCssVars = `:root {\n${renderMaterialCssVariables('primary', primaryPalette)}\n${renderMaterialCssVariables('secondary', secondaryPalette)}\n${renderMaterialCssVariables('warn', warnPalette ?? buildThemePalette('#f44336'))}\n}\n`;

    const definePaletteFn = useM2ThemingApi ? 'm2-define-palette' : 'define-palette';
    const redPaletteRef = useM2ThemingApi ? 'mat.$m2-red-palette' : 'mat.$red-palette';
    const getTargets = (proj: any) => (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
    const selectedProject = projects[projectName];
    const sourceRoot = typeof selectedProject?.sourceRoot === 'string' ? selectedProject.sourceRoot : 'src';
    const targets = getTargets(selectedProject);
    const buildOptions = targets?.build?.options && typeof targets.build.options === 'object' ? targets.build.options : undefined;
    const createdThemeAbsPaths: string[] = [];
    const createdThemeRelPaths: string[] = [];

    for (const mode of modes) {
        const themeBase = includeModeSuffix ? `${themeName}-${mode}` : themeName;
        const themeFileName = `${themeBase}.theme.scss`;
        const themeRelPath = `${sourceRoot.replace(/\\/g, '/')}/scss/themes/${themeFileName}`;
        const themeAbsPath = path.join(workspaceRoot, sourceRoot, 'scss', 'themes', themeFileName);

        if (fs.existsSync(themeAbsPath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `Wizly: ${themeRelPath} already exists. Overwrite?`,
                'Overwrite',
                'Cancel'
            );
            if (overwrite !== 'Overwrite') { return; }
        }

        const themeVarName = themeBase.replace(/[^a-zA-Z0-9]/g, '_');
        const defineThemeFn = useM2ThemingApi ? `m2-define-${mode}-theme` : `define-${mode}-theme`;
        const bodyBackground = mode === 'dark' ? '#303030' : '#fafafa';
        const bodyColor = mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)';
        const themeScss = `@use '@angular/material' as mat;\n\n$${themeVarName}_primary_palette: ${primaryMap};\n$${themeVarName}_secondary_palette: ${secondaryMap};\n${warnHex ? `$${themeVarName}_warn_palette: ${warnMap};\n` : ''}\n$${themeVarName}_primary: mat.${definePaletteFn}($${themeVarName}_primary_palette, 500);\n$${themeVarName}_secondary: mat.${definePaletteFn}($${themeVarName}_secondary_palette, A200, A100, A400);\n$${themeVarName}_warn: ${warnHex ? `mat.${definePaletteFn}($${themeVarName}_warn_palette, 500)` : `mat.${definePaletteFn}(${redPaletteRef})`};\n\n$${themeVarName}_theme: mat.${defineThemeFn}((\n  color: (\n    primary: $${themeVarName}_primary,\n    accent: $${themeVarName}_secondary,\n    warn: $${themeVarName}_warn,\n  ),\n));\n\n${materialCssVars}:root {\n  --wizly-body-background: ${bodyBackground};\n  --wizly-body-color: ${bodyColor};\n}\n\n@include mat.all-component-colors($${themeVarName}_theme);\n`;

        const themesDir = path.dirname(themeAbsPath);
        if (!fs.existsSync(themesDir)) {
            fs.mkdirSync(themesDir, { recursive: true });
        }
        fs.writeFileSync(themeAbsPath, themeScss, 'utf8');

        if (!buildOptions) {
            vscode.window.showWarningMessage(`Wizly: Could not find build options for project "${projectName}". Theme file was created, but angular.json was not updated.`);
        } else {
            buildOptions.styles = Array.isArray(buildOptions.styles) ? buildOptions.styles : [];
            const styles = buildOptions.styles as any[];
            const already = styles.some((s) => {
                if (typeof s === 'string') { return s.replace(/\\/g, '/') === themeRelPath; }
                if (s && typeof s === 'object' && typeof s.input === 'string') { return String(s.input).replace(/\\/g, '/') === themeRelPath; }
                return false;
            });

            if (!already) {
                styles.push({
                    input: themeRelPath,
                    bundleName: themeBase,
                    inject: false
                });
            }
        }

        createdThemeAbsPaths.push(themeAbsPath);
        createdThemeRelPaths.push(themeRelPath);
    }

    if (buildOptions) {
        writeJson(angularJsonPath, angularJson);
    }

    const doc = await vscode.workspace.openTextDocument(createdThemeAbsPaths[0]);
    await vscode.window.showTextDocument(doc, { preview: false });
    showCommandSuccess('Wizly: Generated Angular Material theme bundle(s).', {
        created: createdThemeRelPaths,
        nextStep: 'Load the bundle through runtime settings or index.html so the theme becomes active.'
    });
}

async function generateBlankThemeScss() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Wizly: Please open a folder first.');
        return;
    }

    const themeNameRaw = await vscode.window.showInputBox({
        title: 'Wizly: Theme name',
        prompt: 'Enter a theme name (e.g. acme, client-a, demo)',
        validateInput: (value) => {
            const v = value.trim();
            if (!v) { return 'Theme name is required.'; }
            if (!/^[a-zA-Z0-9][a-zA-Z0-9-_]*$/.test(v)) {
                return 'Use letters, numbers, hyphen and underscore only.';
            }
            return undefined;
        }
    });
    if (!themeNameRaw) { return; }
    const themeName = themeNameRaw.trim();

    const modePick = await vscode.window.showQuickPick(
        [
            { label: 'Light', description: 'Generates a light theme bundle (blank SCSS).', id: 'light' },
            { label: 'Dark', description: 'Generates a dark theme bundle (blank SCSS).', id: 'dark' },
            { label: 'Both', description: 'Generates both a light and dark blank theme bundle.', id: 'both' }
        ],
        { title: 'Wizly: Theme mode' }
    );
    if (!modePick) { return; }
    const selectedMode = modePick.id as 'light' | 'dark' | 'both';
    const modes: Array<'light' | 'dark'> = selectedMode === 'both' ? ['light', 'dark'] : [selectedMode];

    let includeModeSuffix = selectedMode === 'both';
    if (!includeModeSuffix) {
        const suffixPick = await vscode.window.showQuickPick(
            [
                { label: 'Yes (recommended)', description: `File/bundle will include "-${selectedMode}" suffix.`, id: 'yes' },
                { label: 'No', description: 'File/bundle will not include the mode suffix.', id: 'no' }
            ],
            { title: 'Wizly: Include light/dark suffix in file and bundle name?' }
        );
        if (!suffixPick) { return; }
        includeModeSuffix = suffixPick.id === 'yes';
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
    const angularJson = readJson<any>(angularJsonPath);
    const packageJson = readJson<any>(packageJsonPath);

    const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
    const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
    const hasSass = typeof deps['sass'] === 'string'
        || typeof devDeps['sass'] === 'string'
        || fs.existsSync(path.join(workspaceRoot, 'node_modules', 'sass', 'package.json'));
    if (!hasSass) {
        vscode.window.showErrorMessage('Wizly: Sass (sass) was not found in this workspace. Install sass or run "Wizly: Convert Angular Project to SCSS" first.');
        return;
    }

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const defaultProjectName = typeof angularJson?.defaultProject === 'string' ? angularJson.defaultProject : undefined;

    const isAppProject = (proj: any) => {
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && (builder.includes(':application') || builder.includes(':browser') || builder.includes('application') || builder.includes('browser'));
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
            { title: 'Wizly: Choose Angular project to add the theme bundle to' }
        );
        if (!picked) { return; }
        projectName = picked.label;
    }

    const getTargets = (proj: any) => (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
    const selectedProject = projects[projectName];
    const sourceRoot = typeof selectedProject?.sourceRoot === 'string' ? selectedProject.sourceRoot : 'src';
    const targets = getTargets(selectedProject);
    const buildOptions = targets?.build?.options && typeof targets.build.options === 'object' ? targets.build.options : undefined;
    const createdThemeAbsPaths: string[] = [];
    const createdThemeRelPaths: string[] = [];

    for (const mode of modes) {
        const themeBase = includeModeSuffix ? `${themeName}-${mode}` : themeName;
        const themeFileName = `${themeBase}.theme.scss`;
        const themeRelPath = `${sourceRoot.replace(/\\/g, '/')}/scss/themes/${themeFileName}`;
        const themeAbsPath = path.join(workspaceRoot, sourceRoot, 'scss', 'themes', themeFileName);

        if (fs.existsSync(themeAbsPath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `Wizly: ${themeRelPath} already exists. Overwrite?`,
                'Overwrite',
                'Cancel'
            );
            if (overwrite !== 'Overwrite') { return; }
        }

        const themesDir = path.dirname(themeAbsPath);
        if (!fs.existsSync(themesDir)) {
            fs.mkdirSync(themesDir, { recursive: true });
        }
        fs.writeFileSync(themeAbsPath, '\n', 'utf8');

        if (!buildOptions) {
            vscode.window.showWarningMessage(`Wizly: Could not find build options for project "${projectName}". Theme file was created, but angular.json was not updated.`);
        } else {
            buildOptions.styles = Array.isArray(buildOptions.styles) ? buildOptions.styles : [];
            const styles = buildOptions.styles as any[];
            const already = styles.some((s) => {
                if (typeof s === 'string') { return s.replace(/\\/g, '/') === themeRelPath; }
                if (s && typeof s === 'object' && typeof s.input === 'string') { return String(s.input).replace(/\\/g, '/') === themeRelPath; }
                return false;
            });

            if (!already) {
                styles.push({
                    input: themeRelPath,
                    bundleName: themeBase,
                    inject: false
                });
            }
        }

        createdThemeAbsPaths.push(themeAbsPath);
        createdThemeRelPaths.push(themeRelPath);
    }

    if (buildOptions) {
        writeJson(angularJsonPath, angularJson);
    }

    const doc = await vscode.workspace.openTextDocument(createdThemeAbsPaths[0]);
    await vscode.window.showTextDocument(doc, { preview: false });
    showCommandSuccess('Wizly: Generated blank theme bundle(s).', {
        created: createdThemeRelPaths,
        nextStep: 'Add your own CSS variables or styles, then load the bundle through runtime settings or index.html.'
    });
}

async function generateThemeColorUtilitiesScss() {
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

    const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
    const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
    const hasSass = typeof deps['sass'] === 'string'
        || typeof devDeps['sass'] === 'string'
        || fs.existsSync(path.join(workspaceRoot, 'node_modules', 'sass', 'package.json'));
    if (!hasSass) {
        vscode.window.showErrorMessage('Wizly: Sass (sass) was not found in this workspace. Install sass or run "Wizly: Convert Angular Project to SCSS" first.');
        return;
    }

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const defaultProjectName = typeof angularJson?.defaultProject === 'string' ? angularJson.defaultProject : undefined;
    const isAppProject = (proj: any) => {
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && (builder.includes(':application') || builder.includes(':browser') || builder.includes('application') || builder.includes('browser'));
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
            { title: 'Wizly: Choose Angular project for the color utilities' }
        );
        if (!picked) { return; }
        projectName = picked.label;
    }

    const proj = projects[projectName];
    const sourceRoot = typeof proj?.sourceRoot === 'string' ? proj.sourceRoot : 'src';
    const mainScssPath = path.join(workspaceRoot, sourceRoot, 'scss', 'main.scss');
    if (!fs.existsSync(mainScssPath)) {
        vscode.window.showErrorMessage(`Wizly: Could not find ${path.relative(workspaceRoot, mainScssPath)}. Run "Wizly: Convert Angular Project to SCSS" first.`);
        return;
    }

    const utilitiesDir = path.join(workspaceRoot, sourceRoot, 'scss', 'base');
    const utilitiesPath = path.join(utilitiesDir, '_mat-color-utilities.scss');
    const utilitiesRelPath = path.relative(workspaceRoot, utilitiesPath).replace(/\\/g, '/');

    if (fs.existsSync(utilitiesPath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `Wizly: ${utilitiesRelPath} already exists. Overwrite?`,
            'Overwrite',
            'Cancel'
        );
        if (overwrite !== 'Overwrite') { return; }
    }

    const utilitiesScss = `// Generated by Wizly: Theme Color Utilities (SCSS)
// These utilities expect Angular Material theme variables generated by Wizly.
// Background utilities also set a matching foreground color for readability.
// Border and fill utilities help with simple outlines and SVG/icon coloring.

${renderAllMaterialUtilityClasses()}
`;

    if (!fs.existsSync(utilitiesDir)) {
        fs.mkdirSync(utilitiesDir, { recursive: true });
    }
    fs.writeFileSync(utilitiesPath, `${utilitiesScss.trimEnd()}\n`, 'utf8');

    const mainBefore = fs.readFileSync(mainScssPath, 'utf8');
    if (!mainBefore.includes(`./base/mat-color-utilities`) && !mainBefore.includes(`base/mat-color-utilities`)) {
        fs.writeFileSync(mainScssPath, `${mainBefore.trimEnd()}\n@use './base/mat-color-utilities';\n`, 'utf8');
    }

    const doc = await vscode.workspace.openTextDocument(utilitiesPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    showCommandSuccess('Wizly: Generated theme color utilities.', {
        created: [utilitiesRelPath, toWorkspaceRelativePath(workspaceRoot, mainScssPath)],
        nextStep: 'Test classes like mat-bg-*, mat-text-*, mat-border-* and mat-fill-* with an active Material theme.'
    });
}

async function importMagicColorFileScss() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Wizly: Please open a folder first.');
        return;
    }

    const pickedFiles = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Import Magic color file',
        title: 'Wizly: Choose Magic color file',
        filters: {
            'Magic Color Files (*.eng)': ['eng'],
            'All Files': ['*']
        }
    });
    if (!pickedFiles || pickedFiles.length === 0) { return; }

    const colorFilePath = pickedFiles[0].fsPath;
    const colorFileContent = fs.readFileSync(colorFilePath, 'utf8');
    const colorEntries = parseMagicColorFile(colorFileContent);
    if (colorEntries.length === 0) {
        vscode.window.showErrorMessage('Wizly: No valid Magic color rows were found in the selected file.');
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

    const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
    const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
    const hasSass = typeof deps['sass'] === 'string'
        || typeof devDeps['sass'] === 'string'
        || fs.existsSync(path.join(workspaceRoot, 'node_modules', 'sass', 'package.json'));
    if (!hasSass) {
        vscode.window.showErrorMessage('Wizly: Sass (sass) was not found in this workspace. Install sass or run "Wizly: Convert Angular Project to SCSS" first.');
        return;
    }

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const defaultProjectName = typeof angularJson?.defaultProject === 'string' ? angularJson.defaultProject : undefined;
    const isAppProject = (proj: any) => {
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && (builder.includes(':application') || builder.includes(':browser') || builder.includes('application') || builder.includes('browser'));
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
            { title: 'Wizly: Choose Angular project for the imported Magic colors' }
        );
        if (!picked) { return; }
        projectName = picked.label;
    }

    const proj = projects[projectName];
    const sourceRoot = typeof proj?.sourceRoot === 'string' ? proj.sourceRoot : 'src';
    const mainScssPath = path.join(workspaceRoot, sourceRoot, 'scss', 'main.scss');
    if (!fs.existsSync(mainScssPath)) {
        vscode.window.showErrorMessage(`Wizly: Could not find ${path.relative(workspaceRoot, mainScssPath)}. Run "Wizly: Convert Angular Project to SCSS" first.`);
        return;
    }

    const varsDir = path.join(workspaceRoot, sourceRoot, 'scss', 'vars');
    const varsPath = path.join(varsDir, '_magic-colors.scss');
    const utilitiesDir = path.join(workspaceRoot, sourceRoot, 'scss', 'base');
    const utilitiesPath = path.join(utilitiesDir, '_magic-color-utilities.scss');
    const varsRelPath = path.relative(workspaceRoot, varsPath).replace(/\\/g, '/');
    const utilitiesRelPath = path.relative(workspaceRoot, utilitiesPath).replace(/\\/g, '/');

    const existingOutputs = [varsPath, utilitiesPath].filter((filePath) => fs.existsSync(filePath));
    if (existingOutputs.length > 0) {
        const overwrite = await vscode.window.showWarningMessage(
            `Wizly: ${existingOutputs.map((filePath) => path.relative(workspaceRoot, filePath).replace(/\\/g, '/')).join(', ')} already exist. Overwrite?`,
            'Overwrite',
            'Cancel'
        );
        if (overwrite !== 'Overwrite') { return; }
    }

    if (!fs.existsSync(varsDir)) {
        fs.mkdirSync(varsDir, { recursive: true });
    }
    if (!fs.existsSync(utilitiesDir)) {
        fs.mkdirSync(utilitiesDir, { recursive: true });
    }

    fs.writeFileSync(varsPath, renderMagicColorVarsScss(colorEntries), 'utf8');
    fs.writeFileSync(utilitiesPath, renderMagicColorUtilitiesScss(colorEntries), 'utf8');

    const mainBefore = fs.readFileSync(mainScssPath, 'utf8');
    if (!mainBefore.includes(`./base/magic-color-utilities`) && !mainBefore.includes(`base/magic-color-utilities`)) {
        fs.writeFileSync(mainScssPath, `${mainBefore.trimEnd()}\n@use './base/magic-color-utilities';\n`, 'utf8');
    }

    const doc = await vscode.workspace.openTextDocument(utilitiesPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    showCommandSuccess(`Wizly: Imported ${colorEntries.length} Magic colors.`, {
        created: [varsRelPath, utilitiesRelPath, toWorkspaceRelativePath(workspaceRoot, mainScssPath)],
        nextStep: 'Use magic-color-* classes directly or bind a Magic custom property value to a class in Angular.'
    });
}

async function setupAngularRuntimeSettings() {
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

    const gitMarkerPath = path.join(workspaceRoot, '.git');
    if (!fs.existsSync(gitMarkerPath)) {
        const proceed = await vscode.window.showWarningMessage(
            'Wizly: This folder does not appear to be a Git repository (.git not found). This command updates files and cannot be automatically undone. Do you want to continue?',
            { modal: true },
            'Yes',
            'No'
        );
        if (proceed !== 'Yes') { return; }
    }

    const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    const writeJson = (filePath: string, value: any) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    const angularJson = readJson<any>(angularJsonPath);
    const packageJson = readJson<any>(packageJsonPath);

    const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
    const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
    const hasMaterial = typeof deps['@angular/material'] === 'string'
        || typeof devDeps['@angular/material'] === 'string'
        || fs.existsSync(path.join(workspaceRoot, 'node_modules', '@angular', 'material', 'package.json'));

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const defaultProjectName = typeof angularJson?.defaultProject === 'string' ? angularJson.defaultProject : undefined;
    const getTargets = (proj: any) => (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
    const getBuildOptions = (proj: any) => {
        const targets = getTargets(proj);
        const target = targets?.build;
        const options = target?.options;
        return options && typeof options === 'object' ? options : undefined;
    };

    const isAppProject = (proj: any) => {
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = getTargets(proj);
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && (builder.includes(':application') || builder.includes(':browser') || builder.includes('application') || builder.includes('browser'));
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
            { title: 'Wizly: Choose Angular project to setup runtime settings for' }
        );
        if (!picked) { return; }
        projectName = picked.label;
    }

    const themeModePick = await vscode.window.showQuickPick(
        [
            { label: 'Single', description: 'Always use defaultTheme.', id: 'single' },
            { label: 'Multi', description: 'User can pick a theme and store it in localStorage.', id: 'multi' },
            { label: 'Hostbased', description: 'Select a theme based on window.location.hostname.', id: 'hostbased' }
        ],
        { title: 'Wizly: Theme mode' }
    );
    if (!themeModePick) { return; }
    const themeMode = themeModePick.id as 'single' | 'multi' | 'hostbased';

    const proj = projects[projectName];
    const sourceRoot = typeof proj?.sourceRoot === 'string' ? proj.sourceRoot : 'src';
    const settingsPaths = resolveRuntimeSettingsPaths(workspaceRoot, proj, sourceRoot);
    const settingsDirAbs = settingsPaths.settingsDirAbs;
    const settingsPathAbs = settingsPaths.settingsPathAbs;

    const ensureDir = (dirPath: string) => {
        if (fs.existsSync(dirPath)) { return; }
        fs.mkdirSync(dirPath, { recursive: true });
    };

    ensureDir(settingsDirAbs);

    if (fs.existsSync(settingsPathAbs)) {
        const overwrite = await vscode.window.showWarningMessage(
            `Wizly: ${path.relative(workspaceRoot, settingsPathAbs)} already exists. Overwrite?`,
            'Overwrite',
            'Keep'
        );
        if (overwrite !== 'Overwrite') {
            vscode.window.showInformationMessage('Wizly: Kept existing settings.json.');
        } else {
            fs.writeFileSync(settingsPathAbs, '', 'utf8');
        }
    }

    const buildOptions = getBuildOptions(proj);
    const bundleThemes = (): Array<{ name: string; href: string; mode?: 'light' | 'dark' }> => {
        if (!buildOptions) { return []; }
        const styles = Array.isArray((buildOptions as any).styles) ? (buildOptions as any).styles : [];
        const out: Array<{ name: string; href: string; mode?: 'light' | 'dark' }> = [];
        for (const s of styles) {
            if (!s || typeof s !== 'object') { continue; }
            const inject = (s as any).inject;
            const bundleName = (s as any).bundleName;
            if (inject === false && typeof bundleName === 'string' && bundleName.trim()) {
                const bn = bundleName.trim();
                out.push(detectRuntimeThemeFromBundleName(bn));
            }
        }
        const deduped = new Map<string, { name: string; href: string; mode?: 'light' | 'dark' }>();
        for (const t of out) {
            deduped.set(t.href, t);
        }
        return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));
    };

    const detectedThemes = bundleThemes();
    const defaultThemeHref = detectedThemes[0]?.href ?? '';
    const settingsJson = {
        themeMode,
        defaultThemePreference: 'system',
        defaultTheme: defaultThemeHref,
        themes: detectedThemes.length > 0 ? detectedThemes : [
            { name: 'Default', href: '' }
        ]
    };

    const currentSettingsText = fs.existsSync(settingsPathAbs)
        ? fs.readFileSync(settingsPathAbs, 'utf8')
        : '';
    if (!currentSettingsText.trim()) {
        fs.writeFileSync(settingsPathAbs, `${JSON.stringify(settingsJson, null, 2)}\n`, 'utf8');
    }

    if (buildOptions) {
        (buildOptions as any).assets = Array.isArray((buildOptions as any).assets) ? (buildOptions as any).assets : [];
        const assets = (buildOptions as any).assets as any[];
        const inputRel = settingsPaths.assetsInputRel;
        const already = assets.some((a) => {
            if (!a || typeof a !== 'object') { return false; }
            return String(a.input ?? '').replace(/\\/g, '/') === inputRel && String(a.output ?? '').replace(/\\/g, '/') === 'settings';
        });
        if (!already) {
            assets.push({ glob: '**/*', input: inputRel, output: 'settings' });
            writeJson(angularJsonPath, angularJson);
        }
    } else {
        vscode.window.showWarningMessage(`Wizly: Could not find build options for project "${projectName}". settings.json was created, but angular.json was not updated (assets).`);
    }

    const appDirAbs = path.join(workspaceRoot, sourceRoot, 'app');
    if (!fs.existsSync(appDirAbs)) {
        vscode.window.showWarningMessage(`Wizly: Could not find ${path.relative(workspaceRoot, appDirAbs)}. Skipping Angular initializer scaffolding.`);
        const doc = await vscode.workspace.openTextDocument(settingsPathAbs);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
    }

    const coreDirAbs = path.join(appDirAbs, 'core');
    const hasCoreDir = fs.existsSync(coreDirAbs) && fs.statSync(coreDirAbs).isDirectory();
    const wizlyBaseDirAbs = hasCoreDir ? coreDirAbs : appDirAbs;
    const serviceImportRel = hasCoreDir ? './core/wizly/wizly-settings.service' : './wizly/wizly-settings.service';
    const materialDefaultsImportRel = hasCoreDir ? './core/wizly/wizly-material-form-field.defaults' : './wizly/wizly-material-form-field.defaults';

    const wizlyDirAbs = path.join(wizlyBaseDirAbs, 'wizly');
    ensureDir(wizlyDirAbs);

    const migrateGeneratedSettingsService = (text: string) => {
        return text.replace(
            "const nextScheme: WizlyColorScheme = mq.matches ? 'dark' : 'light';\n                const next: WizlySettingsState = { ...this.stateSubject.value, colorScheme: nextScheme };",
            "const nextScheme: WizlyColorScheme = mq.matches ? 'dark' : 'light';\n                const next: WizlySettingsState = { ...this.stateSubject.value, colorScheme: nextScheme };"
        );
    };

    const serviceAbs = path.join(wizlyDirAbs, 'wizly-settings.service.ts');
    const serviceContent = [
        "import { Injectable } from '@angular/core';",
        "import { BehaviorSubject } from 'rxjs';",
        "",
        "export type WizlyThemeMode = 'single' | 'multi' | 'hostbased';",
        "export type WizlyMode = 'light' | 'dark' | 'system';",
        "export type WizlyColorScheme = 'light' | 'dark';",
        "export type WizlyThemeVariantMode = 'light' | 'dark';",
        "",
        "export type WizlyTheme = {",
        "    name: string;",
        "    href: string;",
        "    host?: string;",
        "    mode?: WizlyThemeVariantMode;",
        "    defaultThemePreference?: WizlyMode;",
        "};",
        "",
        "export type WizlyThemeChoice = {",
        "    key: string;",
        "    name: string;",
        "    href: string;",
        "};",
        "",
        "export type WizlySettings = {",
        "    themeMode: WizlyThemeMode;",
        "    defaultThemePreference?: WizlyMode;",
        "    defaultTheme?: string;",
        "    themes?: WizlyTheme[];",
        "};",
        "",
        "export type WizlySettingsState = {",
        "    settings?: WizlySettings;",
        "    themes: WizlyTheme[];",
        "    themeMode: WizlyThemeMode;",
        "    defaultTheme?: string;",
        "    activeThemeHref?: string;",
        "    mode: WizlyMode;",
        "    colorScheme: WizlyColorScheme;",
        "};",
        "",
        "@Injectable({ providedIn: 'root' })",
        "export class WizlySettingsService {",
        "    private readonly stateSubject = new BehaviorSubject<WizlySettingsState>({",
        "        themes: [],",
        "        themeMode: 'single',",
        "        mode: 'system',",
        "        colorScheme: this.getSystemScheme()",
        "    });",
        "",
        "    readonly state$ = this.stateSubject.asObservable();",
        "",
        "    getState() {",
        "        return this.stateSubject.value;",
        "    }",
        "",
        "    getSelectableThemes(): WizlyThemeChoice[] {",
        "        const state = this.stateSubject.value;",
        "        const byKey = new Map<string, WizlyThemeChoice>();",
        "        for (const theme of state.themes) {",
        "            const key = this.getThemeSelectionKey(theme);",
        "            if (!key || byKey.has(key)) { continue; }",
        "            const resolved = this.resolveThemeVariant(theme, state.themes, state.mode);",
        "            if (!resolved?.href) { continue; }",
        "            byKey.set(key, { key, name: theme.name, href: resolved.href });",
        "        }",
        "        return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));",
        "    }",
        "",
        "    getActiveThemeSelection() {",
        "        const active = this.findThemeByHref(this.stateSubject.value.activeThemeHref);",
        "        return active ? this.getThemeSelectionKey(active) : '';",
        "    }",
        "",
        "    async load() {",
        "        this.applyFromStorageBestEffort();",
        "",
        `        const url = \`settings/settings.json?v=\${Date.now()}\`;`,
        "        try {",
        "            const res = await fetch(url, { cache: 'no-store' });",
        "            if (!res.ok) {",
        "                this.recomputeAndApply();",
        "                return;",
        "            }",
        "            const raw = (await res.json()) as unknown;",
        "            const normalized = this.normalizeSettings(raw);",
        "            const prev = this.stateSubject.value;",
        "            const themeMode = normalized.themeMode;",
        "            const themes = normalized.themes ?? [];",
        "            const defaultTheme = normalized.defaultTheme;",
        "            const mode = this.resolveMode(normalized);",
        "            const activeThemeHref = this.resolveThemeHref(normalized, mode, prev.activeThemeHref);",
        "            const colorScheme = this.resolveColorScheme(mode);",
        "",
        "            this.stateSubject.next({",
        "                ...prev,",
        "                settings: normalized,",
        "                themeMode,",
        "                themes,",
        "                defaultTheme,",
        "                mode,",
        "                colorScheme,",
        "                activeThemeHref",
        "            });",
        "",
        "            this.applyMode(mode);",
        "            this.applyThemeLink(activeThemeHref);",
        "        } catch {",
        "            this.recomputeAndApply();",
        "        }",
        "    }",
        "",
        "    canUserSwitchTheme() {",
        "        return this.stateSubject.value.themeMode === 'multi';",
        "    }",
        "",
        "    canUserSwitchMode() {",
        "        return true;",
        "    }",
        "",
        "    setTheme(selection: string) {",
        "        const state = this.stateSubject.value;",
        "        const href = this.resolveThemeSelection(selection, state.themes, state.mode, state.activeThemeHref);",
        "        if (!href) { return; }",
        "        try { localStorage.setItem('wizly.themeHref', href); } catch { }",
        "        this.stateSubject.next({ ...state, activeThemeHref: href });",
        "        this.applyThemeLink(href);",
        "    }",
        "",
        "    setMode(mode: WizlyMode) {",
        "        try { localStorage.setItem('wizly.themePreference', mode); } catch { }",
        "        const state = this.stateSubject.value;",
        "        const scheme = this.resolveColorScheme(mode);",
        "        const nextHref = this.resolveThemeHref(state.settings, mode, state.activeThemeHref);",
        "        this.stateSubject.next({ ...state, mode, colorScheme: scheme, activeThemeHref: nextHref || state.activeThemeHref });",
        "        this.applyMode(mode);",
        "        if (nextHref) {",
        "            this.applyThemeLink(nextHref);",
        "        }",
        "    }",
        "",
        "    private applyFromStorageBestEffort() {",
        "        const state = this.stateSubject.value;",
        "        const storedMode = this.readStoredMode();",
        "        const scheme = this.resolveColorScheme(storedMode);",
        "        const storedThemeHref = this.readStoredThemeHref();",
        "",
        "        this.stateSubject.next({",
        "            ...state,",
        "            mode: storedMode,",
        "            colorScheme: scheme,",
        "            activeThemeHref: storedThemeHref || state.activeThemeHref",
        "        });",
        "",
        "        this.applyMode(storedMode);",
        "        if (storedThemeHref) {",
        "            this.applyThemeLink(storedThemeHref);",
        "        }",
        "    }",
        "",
        "    private recomputeAndApply() {",
        "        const state = this.stateSubject.value;",
        "        const settings = state.settings;",
        "        const mode = this.resolveMode(settings);",
        "        const activeThemeHref = this.resolveThemeHref(settings, mode, state.activeThemeHref);",
        "        const scheme = this.resolveColorScheme(mode);",
        "",
        "        this.stateSubject.next({",
        "            ...state,",
        "            mode,",
        "            colorScheme: scheme,",
        "            activeThemeHref",
        "        });",
        "",
        "        this.applyMode(mode);",
        "        this.applyThemeLink(activeThemeHref);",
        "    }",
        "",
        "    private normalizeSettings(raw: unknown): WizlySettings {",
        "        const obj = raw && typeof raw === 'object' ? raw as any : {};",
        "        const themeMode: WizlyThemeMode = (obj.themeMode === 'single' || obj.themeMode === 'multi' || obj.themeMode === 'hostbased')",
        "            ? obj.themeMode",
        "            : 'single';",
        "",
        "        const defaultThemePreference: WizlyMode = (obj.defaultThemePreference === 'light' || obj.defaultThemePreference === 'dark' || obj.defaultThemePreference === 'system')",
        "            ? obj.defaultThemePreference",
        "            : 'system';",
        "",
        "        const themesRaw = Array.isArray(obj.themes) ? obj.themes : [];",
        "        const themes: WizlyTheme[] = [];",
        "        for (const t of themesRaw) {",
        "            const href = typeof t?.href === 'string' ? t.href.trim() : '';",
        "            if (!href) { continue; }",
        "            const rawName = typeof t?.name === 'string' && t.name.trim() ? t.name.trim() : '';",
        "            const explicitMode: WizlyThemeVariantMode | undefined = t?.mode === 'light' || t?.mode === 'dark' ? t.mode : undefined;",
        "            const inferredMode = explicitMode ?? this.inferThemeVariantMode(rawName, href);",
        "            const name = rawName",
        "                ? this.normalizeThemeName(rawName, inferredMode)",
        "                : this.deriveThemeName(href, inferredMode);",
        "            const host = typeof t?.host === 'string' && t.host.trim() ? t.host.trim() : undefined;",
        "            const perThemeDefaultThemePreference: WizlyMode | undefined = (t?.defaultThemePreference === 'light' || t?.defaultThemePreference === 'dark' || t?.defaultThemePreference === 'system')",
        "                ? t.defaultThemePreference",
        "                : undefined;",
        "            themes.push({ name, href, host, mode: inferredMode, defaultThemePreference: perThemeDefaultThemePreference });",
        "        }",
        "",
        "        const deduped = new Map<string, WizlyTheme>();",
        "        for (const t of themes) {",
        "            if (!deduped.has(t.href)) {",
        "                deduped.set(t.href, t);",
        "            }",
        "        }",
        "        const mergedThemes = [...deduped.values()];",
        "",
        "        let defaultTheme = typeof obj.defaultTheme === 'string' ? obj.defaultTheme.trim() : '';",
        "        if (defaultTheme && !mergedThemes.some(t => t.href === defaultTheme)) {",
        "            defaultTheme = '';",
        "        }",
        "        if (!defaultTheme && mergedThemes.length > 0) {",
        "            defaultTheme = mergedThemes[0].href;",
        "        }",
        "",
        "        return {",
        "            themeMode,",
        "            defaultThemePreference,",
        "            defaultTheme,",
        "            themes: mergedThemes",
        "        };",
        "    }",
        "",
        "    private normalizeThemeName(name: string, mode?: WizlyThemeVariantMode) {",
        "        const trimmed = name.trim();",
        "        if (!trimmed || !mode) { return trimmed; }",
        "        const stripped = trimmed.replace(new RegExp(`(?:[\\\\s_-]+)?${mode}$`, 'i'), '').trim();",
        "        return stripped || trimmed;",
        "    }",
        "",
        "    private deriveThemeName(href: string, mode?: WizlyThemeVariantMode) {",
        "        const file = href.split('/').pop() ?? href;",
        "        const base = file.replace(/\\\\.css$/i, '').replace(/(?:[-_\\\\s]?theme)$/i, '');",
        "        const stripped = mode ? base.replace(new RegExp(`(?:[-_\\\\s]+)?${mode}$`, 'i'), '').trim() : base;",
        "        const source = stripped || base;",
        "        const spaced = source.replace(/[_-]+/g, ' ').trim();",
        "        return spaced ? spaced.replace(/\\\\b\\\\w/g, (m) => m.toUpperCase()) : href;",
        "    }",
        "",
        "    private inferThemeVariantMode(...candidates: Array<string | undefined>): WizlyThemeVariantMode | undefined {",
        "        for (const candidate of candidates) {",
        "            const trimmed = typeof candidate === 'string' ? candidate.trim() : '';",
        "            if (!trimmed) { continue; }",
        "            const normalized = trimmed.replace(/\\\\.css$/i, '').replace(/(?:[-_\\\\s]?theme)$/i, '').trim();",
        "            const match = normalized.match(/(?:^|[-_\\\\s])(light|dark)$/i);",
        "            if (match) {",
        "                return match[1].toLowerCase() as WizlyThemeVariantMode;",
        "            }",
        "        }",
        "        return undefined;",
        "    }",
        "",
        "    private getThemeSelectionKey(theme: WizlyTheme) {",
        "        const name = theme.name.trim().toLowerCase();",
        "        const host = String(theme.host ?? '').trim().toLowerCase();",
        "        return `${name}::${host}`;",
        "    }",
        "",
        "    private findThemeByHref(href?: string) {",
        "        if (!href) { return undefined; }",
        "        return this.stateSubject.value.themes.find(t => t.href === href);",
        "    }",
        "",
        "    private resolveThemeSelection(selection: string, themes: WizlyTheme[], mode: WizlyMode, fallbackHref?: string) {",
        "        const trimmed = selection.trim();",
        "        if (!trimmed) { return ''; }",
        "        const direct = themes.find(t => t.href === trimmed);",
        "        if (direct) {",
        "            return this.resolveThemeVariant(direct, themes, mode)?.href ?? direct.href;",
        "        }",
        "        const keyed = themes.find(t => this.getThemeSelectionKey(t) === trimmed);",
        "        if (keyed) {",
        "            return this.resolveThemeVariant(keyed, themes, mode)?.href ?? keyed.href;",
        "        }",
        "        if (fallbackHref && themes.some(t => t.href === fallbackHref)) {",
        "            return fallbackHref;",
        "        }",
        "        return '';",
        "    }",
        "",
        "    private resolveThemeVariant(baseTheme: WizlyTheme, themes: WizlyTheme[], mode: WizlyMode) {",
        "        const key = this.getThemeSelectionKey(baseTheme);",
        "        const candidates = themes.filter(t => this.getThemeSelectionKey(t) === key);",
        "        if (candidates.length === 0) { return undefined; }",
        "        const desiredMode: WizlyThemeVariantMode = mode === 'system' ? this.getSystemScheme() : mode;",
        "        const exact = candidates.find(t => t.mode === desiredMode);",
        "        if (exact) { return exact; }",
        "        const sameHref = candidates.find(t => t.href === baseTheme.href);",
        "        if (sameHref) { return sameHref; }",
        "        return candidates[0];",
        "    }",
        "",
        "    private readStoredThemeHref() {",
        "        let stored: string | null = null;",
        "        try { stored = localStorage.getItem('wizly.themeHref'); } catch { }",
        "        return stored && stored.trim() ? stored.trim() : undefined;",
        "    }",
        "",
        "    private readStoredMode(): WizlyMode {",
        "        let override: string | null = null;",
        "        try { override = localStorage.getItem('wizly.themePreference'); } catch { }",
        "        if (override === 'light' || override === 'dark' || override === 'system') { return override; }",
        "        return 'system';",
        "    }",
        "",
        "    private resolveMode(settings?: WizlySettings): WizlyMode {",
        "        const stored = this.readStoredMode();",
        "        if (stored !== 'system') { return stored; }",
        "",
        "        const s = settings;",
        "        const defaultThemePreference = s?.defaultThemePreference;",
        "        if (defaultThemePreference === 'light' || defaultThemePreference === 'dark' || defaultThemePreference === 'system') { return defaultThemePreference; }",
        "        return 'system';",
        "    }",
        "",
        "    private resolveThemeHref(settings?: WizlySettings, mode: WizlyMode = this.stateSubject.value.mode, preferredHref?: string): string {",
        "        const s = settings;",
        "        const themeMode: WizlyThemeMode = s?.themeMode ?? this.stateSubject.value.themeMode;",
        "        const themes = s?.themes ?? this.stateSubject.value.themes;",
        "",
        "        if (themes.length === 0) {",
        "            return '';",
        "        }",
        "",
        "        let baseTheme: WizlyTheme | undefined;",
        "",
        "        if (themeMode === 'multi') {",
        "            const stored = preferredHref ?? this.readStoredThemeHref();",
        "            if (stored) {",
        "                baseTheme = themes.find(t => t.href === stored);",
        "            }",
        "        }",
        "",
        "        if (!baseTheme && themeMode === 'hostbased') {",
        "            const host = typeof location !== 'undefined' ? location.hostname : '';",
        "            const match = themes.find(t => t.host === host);",
        "            if (match) {",
        "                baseTheme = match;",
        "            }",
        "        }",
        "",
        "        if (!baseTheme) {",
        "            const def = s?.defaultTheme;",
        "            if (def) {",
        "                baseTheme = themes.find(t => t.href === def);",
        "            }",
        "        }",
        "",
        "        if (!baseTheme && preferredHref) {",
        "            baseTheme = themes.find(t => t.href === preferredHref);",
        "        }",
        "",
        "        if (!baseTheme) {",
        "            baseTheme = themes[0];",
        "        }",
        "",
        "        return this.resolveThemeVariant(baseTheme, themes, mode)?.href ?? baseTheme.href;",
        "    }",
        "",
        "    private applyThemeLink(href?: string) {",
        "        if (!href) { return; }",
        "        if (typeof document === 'undefined') { return; }",
        "",
        "        const existing = document.getElementById('wizly-theme');",
        "        const link = (existing && existing.tagName.toLowerCase() === 'link')",
        "            ? (existing as HTMLLinkElement)",
        "            : document.createElement('link');",
        "",
        "        link.id = 'wizly-theme';",
        "        link.rel = 'stylesheet';",
        "        link.href = href;",
        "",
        "        if (!existing) {",
        "            document.head.appendChild(link);",
        "        }",
        "    }",
        "",
        "    private getSystemScheme(): WizlyColorScheme {",
        "        if (typeof window === 'undefined' || !('matchMedia' in window)) { return 'light'; }",
        "        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';",
        "    }",
        "",
        "    private resolveColorScheme(mode: WizlyMode): WizlyColorScheme {",
        "        if (mode === 'dark') { return 'dark'; }",
        "        if (mode === 'light') { return 'light'; }",
        "        return this.getSystemScheme();",
        "    }",
        "",
        "    private applyMode(mode: WizlyMode) {",
        "        if (typeof document === 'undefined') { return; }",
        "        const el = document.documentElement;",
        "        const scheme = this.resolveColorScheme(mode);",
        "",
        "        el.dataset['wizlyMode'] = mode;",
        "        el.dataset['themeMode'] = mode;",
        "        el.dataset['colorScheme'] = scheme;",
        "        (el.style as any).colorScheme = scheme;",
        "",
        "        if (mode === 'system' && typeof window !== 'undefined' && 'matchMedia' in window) {",
        "            const mq = window.matchMedia('(prefers-color-scheme: dark)');",
        "            const handler = () => {",
        "                const current = this.stateSubject.value.mode;",
        "                if (current !== 'system') { return; }",
        "                const nextScheme: WizlyColorScheme = mq.matches ? 'dark' : 'light';",
        "                const nextHref = this.resolveThemeHref(this.stateSubject.value.settings, 'system', this.stateSubject.value.activeThemeHref);",
        "                const next: WizlySettingsState = { ...this.stateSubject.value, colorScheme: nextScheme, activeThemeHref: nextHref || this.stateSubject.value.activeThemeHref };",
        "                this.stateSubject.next(next);",
        "                el.dataset['colorScheme'] = nextScheme;",
        "                (el.style as any).colorScheme = nextScheme;",
        "                if (nextHref) {",
        "                    this.applyThemeLink(nextHref);",
        "                }",
        "            };",
        "            try {",
        "                mq.removeEventListener('change', handler);",
        "                mq.addEventListener('change', handler);",
        "            } catch {",
        "            }",
        "        }",
        "    }",
        "}",
        ""
    ].join('\n');
    fs.writeFileSync(serviceAbs, serviceContent, 'utf8');
    const createdServiceText = fs.readFileSync(serviceAbs, 'utf8');
    const patchedCreatedServiceText = migrateGeneratedSettingsService(createdServiceText);
    if (patchedCreatedServiceText !== createdServiceText) {
        fs.writeFileSync(serviceAbs, patchedCreatedServiceText, 'utf8');
    }

    const themeSelectorAbs = path.join(wizlyDirAbs, 'wizly-theme-selector.component.ts');
    const selectorContent = hasMaterial
        ? [
            "import { CommonModule } from '@angular/common';",
            "import { Component, inject } from '@angular/core';",
            "import { MatFormFieldModule } from '@angular/material/form-field';",
            "import { MatSelectModule } from '@angular/material/select';",
            "import { map } from 'rxjs/operators';",
            "import { WizlySettingsService } from './wizly-settings.service';",
            "",
            "@Component({",
            "    selector: 'wizly-theme-selector',",
            "    standalone: true,",
            "    imports: [CommonModule, MatFormFieldModule, MatSelectModule],",
            "    template: `<mat-form-field appearance=\"fill\" style=\"width: 100%\">",
            "  <mat-label>Theme</mat-label>",
            "  <mat-select [disabled]=\"!(canSwitch$ | async)\" [value]=\"(activeSelection$ | async) ?? ''\" (selectionChange)=\"setTheme($any($event.value))\">",
            "    <mat-option *ngFor=\"let t of (themes$ | async)\" [value]=\"t.key\">{{ t.name }}</mat-option>",
            "  </mat-select>",
            "</mat-form-field>`",
            "})",
            "export class WizlyThemeSelectorComponent {",
            "    private readonly settings = inject(WizlySettingsService);",
            "    readonly themes$ = this.settings.state$.pipe(map(() => this.settings.getSelectableThemes()));",
            "    readonly activeSelection$ = this.settings.state$.pipe(map(() => this.settings.getActiveThemeSelection()));",
            "    readonly canSwitch$ = this.settings.state$.pipe(map(s => s.themeMode === 'multi'));",
            "",
            "    setTheme(selection: string) {",
            "        this.settings.setTheme(selection);",
            "    }",
            "}",
            ""
        ].join('\n')
        : [
            "import { CommonModule } from '@angular/common';",
            "import { Component, inject } from '@angular/core';",
            "import { map } from 'rxjs/operators';",
            "import { WizlySettingsService } from './wizly-settings.service';",
            "",
            "@Component({",
            "    selector: 'wizly-theme-selector',",
            "    standalone: true,",
            "    imports: [CommonModule],",
            "    template: `<label style=\"display: block; font: inherit\">",
            "  <span style=\"display: block; margin-bottom: 6px\">Theme</span>",
            "  <select [disabled]=\"!(canSwitch$ | async)\" [value]=\"(activeSelection$ | async) ?? ''\" (change)=\"setTheme(($any($event.target).value))\" style=\"width: 100%\">",
            "    <option *ngFor=\"let t of (themes$ | async)\" [value]=\"t.key\">{{ t.name }}</option>",
            "  </select>",
            "</label>`",
            "})",
            "export class WizlyThemeSelectorComponent {",
            "    private readonly settings = inject(WizlySettingsService);",
            "    readonly themes$ = this.settings.state$.pipe(map(() => this.settings.getSelectableThemes()));",
            "    readonly activeSelection$ = this.settings.state$.pipe(map(() => this.settings.getActiveThemeSelection()));",
            "    readonly canSwitch$ = this.settings.state$.pipe(map(s => s.themeMode === 'multi'));",
            "",
            "    setTheme(selection: string) {",
            "        this.settings.setTheme(selection);",
            "    }",
            "}",
            ""
        ].join('\n');
    fs.writeFileSync(themeSelectorAbs, selectorContent, 'utf8');

    const modeToggleAbs = path.join(wizlyDirAbs, 'wizly-mode-toggle.component.ts');
    const modeToggleContent = hasMaterial
        ? [
            "import { CommonModule } from '@angular/common';",
            "import { Component, inject } from '@angular/core';",
            "import { MatButtonModule } from '@angular/material/button';",
            "import { MatIconModule } from '@angular/material/icon';",
            "import { map } from 'rxjs/operators';",
            "import { WizlyMode, WizlySettingsService } from './wizly-settings.service';",
            "",
            "@Component({",
            "    selector: 'wizly-mode-toggle',",
            "    standalone: true,",
            "    imports: [CommonModule, MatButtonModule, MatIconModule],",
            "    template: `<button type=\"button\" mat-icon-button (click)=\"cycle()\" [attr.aria-label]=\"label$ | async\">",
            "  <mat-icon>{{ icon$ | async }}</mat-icon>",
            "</button>`",
            "})",
            "export class WizlyModeToggleComponent {",
            "    private readonly settings = inject(WizlySettingsService);",
            "    readonly mode$ = this.settings.state$.pipe(map(s => s.mode));",
            "    readonly icon$ = this.mode$.pipe(map(m => m === 'dark' ? 'dark_mode' : m === 'light' ? 'light_mode' : 'brightness_auto'));",
            "    readonly label$ = this.mode$.pipe(map(m => m === 'dark' ? 'Dark mode' : m === 'light' ? 'Light mode' : 'System mode'));",
            "",
            "    cycle() {",
            "        const current = this.settings.getState().mode;",
            "        const next: WizlyMode = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';",
            "        this.settings.setMode(next);",
            "    }",
            "}",
            ""
        ].join('\n')
        : [
            "import { CommonModule } from '@angular/common';",
            "import { Component, inject } from '@angular/core';",
            "import { map } from 'rxjs/operators';",
            "import { WizlyMode, WizlySettingsService } from './wizly-settings.service';",
            "",
            "@Component({",
            "    selector: 'wizly-mode-toggle',",
            "    standalone: true,",
            "    imports: [CommonModule],",
            "    template: `<label style=\"display: inline-flex; align-items: center; gap: 8px\">",
            "  <span>Mode</span>",
            "  <select [value]=\"(mode$ | async) ?? 'system'\" (change)=\"setMode($any($event.target).value)\">",
            "    <option value=\"system\">System</option>",
            "    <option value=\"light\">Light</option>",
            "    <option value=\"dark\">Dark</option>",
            "  </select>",
            "</label>`",
            "})",
            "export class WizlyModeToggleComponent {",
            "    private readonly settings = inject(WizlySettingsService);",
            "    readonly mode$ = this.settings.state$.pipe(map(s => s.mode));",
            "",
            "    setMode(mode: string) {",
            "        const m: WizlyMode = mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system';",
            "        this.settings.setMode(m);",
            "    }",
            "}",
            ""
        ].join('\n');
    fs.writeFileSync(modeToggleAbs, modeToggleContent, 'utf8');

    const materialDefaultsAbs = path.join(wizlyDirAbs, 'wizly-material-form-field.defaults.ts');
    if (hasMaterial) {
        const materialDefaultsContent = [
            "import { MatFormFieldDefaultOptions } from '@angular/material/form-field';",
            "",
            "// Central place for Angular Material form-field behavior used by Wizly-generated controls.",
            "export const wizlyMatFormFieldDefaults: MatFormFieldDefaultOptions = {",
            "    appearance: 'fill',",
            "    floatLabel: 'auto'",
            "};",
            ""
        ].join('\n');
        fs.writeFileSync(materialDefaultsAbs, materialDefaultsContent, 'utf8');
    }

    const mainTsAbs = path.join(workspaceRoot, sourceRoot, 'main.ts');
    const appConfigAbs = path.join(appDirAbs, 'app.config.ts');
    const appModuleAbs = path.join(appDirAbs, 'app.module.ts');
    const baseScssAbs = path.join(workspaceRoot, sourceRoot, 'scss', 'base', '_base.scss');
    const indexHtmlRel = typeof buildOptions?.index === 'string' && buildOptions.index.trim()
        ? buildOptions.index.trim().replace(/\\/g, '/')
        : `${sourceRoot.replace(/\\/g, '/')}/index.html`;
    const indexHtmlAbs = path.join(workspaceRoot, indexHtmlRel);

    const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const ensureNamedImportFrom = (text: string, from: string, name: string): string => {
        const importRegex = new RegExp(`^\\s*import\\s*\\{(?<names>[^}]+)\\}\\s*from\\s*['"]${escapeRegex(from)}['"];\\s*$`, 'm');
        const m = text.match(importRegex);
        if (m && m.groups?.names) {
            const names = m.groups.names.split(',').map(s => s.trim()).filter(Boolean);
            if (names.includes(name)) { return text; }
            const updated = [...names, name].sort((a, b) => a.localeCompare(b)).join(', ');
            return text.replace(importRegex, `import { ${updated} } from '${from}';`);
        }
        if (text.includes(`from '${from}'`) || text.includes(`from "${from}"`)) {
            return text;
        }
        return `import { ${name} } from '${from}';\n${text}`;
    };

    const ensureServiceImport = (text: string): string => {
        if (text.includes(`from '${serviceImportRel}'`) || text.includes(`from "${serviceImportRel}"`)) {
            return text;
        }
        return `import { WizlySettingsService } from '${serviceImportRel}';\n${text}`;
    };

    const ensureMaterialDefaultsImport = (text: string): string => {
        if (!hasMaterial) { return text; }
        if (text.includes(`from '${materialDefaultsImportRel}'`) || text.includes(`from "${materialDefaultsImportRel}"`)) {
            return text;
        }
        return `import { wizlyMatFormFieldDefaults } from '${materialDefaultsImportRel}';\n${text}`;
    };

    const initializerProvider = `{ provide: APP_INITIALIZER, useFactory: (s: WizlySettingsService) => () => s.load(), deps: [WizlySettingsService], multi: true }`;
    const materialDefaultsProvider = `{ provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: wizlyMatFormFieldDefaults }`;

    const findProvidersArray = (text: string): { property: ts.PropertyAssignment; array: ts.ArrayLiteralExpression } | undefined => {
        const sourceFile = ts.createSourceFile('wizly-runtime-settings.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        let found: { property: ts.PropertyAssignment; array: ts.ArrayLiteralExpression } | undefined;
        const visit = (node: ts.Node) => {
            if (found) { return; }
            if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'providers' && ts.isArrayLiteralExpression(node.initializer)) {
                found = { property: node, array: node.initializer };
                return;
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        return found;
    };

    const patchProvidersArray = (text: string): string | undefined => {
        const hasInitializer = text.includes('WizlySettingsService') && text.includes('APP_INITIALIZER') && text.includes('s.load()');
        const hasMaterialDefaults = !hasMaterial || (text.includes('MAT_FORM_FIELD_DEFAULT_OPTIONS') && text.includes('wizlyMatFormFieldDefaults'));
        if (hasInitializer && hasMaterialDefaults) {
            return text;
        }

        let out = text;
        out = ensureNamedImportFrom(out, '@angular/core', 'APP_INITIALIZER');
        out = ensureServiceImport(out);
        if (hasMaterial) {
            out = ensureNamedImportFrom(out, '@angular/material/form-field', 'MAT_FORM_FIELD_DEFAULT_OPTIONS');
            out = ensureMaterialDefaultsImport(out);
        }

        const providersInfo = findProvidersArray(out);
        if (providersInfo) {
            const providersText = providersInfo.array.getText();
            const pieces: string[] = [];
            if (!(providersText.includes('WizlySettingsService') && providersText.includes('APP_INITIALIZER'))) {
                pieces.push(initializerProvider);
            }
            if (hasMaterial && !(providersText.includes('MAT_FORM_FIELD_DEFAULT_OPTIONS') && providersText.includes('wizlyMatFormFieldDefaults'))) {
                pieces.push(materialDefaultsProvider);
            }
            if (pieces.length === 0) { return out; }

            const propertyLineStart = out.lastIndexOf('\n', providersInfo.property.getStart()) + 1;
            const propertyIndentMatch = out.slice(propertyLineStart, providersInfo.property.getStart()).match(/^\s*/);
            const propertyIndent = propertyIndentMatch ? propertyIndentMatch[0] : '';
            const itemIndent = `${propertyIndent}    `;
            const closeBracketPos = providersInfo.array.end - 1;
            const hasExistingElements = providersInfo.array.elements.length > 0;
            const insertion = hasExistingElements
                ? `,\n${pieces.map(piece => `${itemIndent}${piece}`).join(',\n')}\n${propertyIndent}`
                : `\n${pieces.map(piece => `${itemIndent}${piece}`).join(',\n')}\n${propertyIndent}`;
            return `${out.slice(0, closeBracketPos)}${insertion}${out.slice(closeBracketPos)}`;
        }
        return undefined;
    };

    let patched = false;
    const tryPatchFile = (filePath: string) => {
        if (!fs.existsSync(filePath)) { return false; }
        const before = fs.readFileSync(filePath, 'utf8');
        const after = patchProvidersArray(before);
        if (!after || after === before) { return !!after; }
        fs.writeFileSync(filePath, after, 'utf8');
        return true;
    };

    let materialIconsPatched = false;
    if (hasMaterial && fs.existsSync(indexHtmlAbs)) {
        const before = fs.readFileSync(indexHtmlAbs, 'utf8');
        const marker = 'fonts.googleapis.com/icon?family=Material+Icons';
        if (!before.includes(marker)) {
            const choice = await vscode.window.showInformationMessage(
                'Wizly: Material is installed and the generated mode toggle uses <mat-icon>. Add the Material Icons stylesheet to index.html?',
                'Add',
                'Skip'
            );
            if (choice === 'Add') {
                const linkTag = '  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">\n';
                let after = before;
                if (before.includes('</head>')) {
                    after = before.replace('</head>', `${linkTag}</head>`);
                } else {
                    after = `${before.trimEnd()}\n${linkTag}`;
                }
                if (after !== before) {
                    fs.writeFileSync(indexHtmlAbs, after, 'utf8');
                    materialIconsPatched = true;
                }
            }
        }
    }

    let baseScssPatched = false;
    if (hasMaterial && fs.existsSync(baseScssAbs)) {
        const before = fs.readFileSync(baseScssAbs, 'utf8');
        if (!/\bmat-form-field\s*\{/.test(before)) {
            const snippet = `\nmat-form-field {\n  width: 100%;\n}\n`;
            fs.writeFileSync(baseScssAbs, `${before.trimEnd()}${snippet}`, 'utf8');
            baseScssPatched = true;
        }
    }

    if (fs.existsSync(appConfigAbs)) {
        patched = tryPatchFile(appConfigAbs);
    }
    if (!patched && fs.existsSync(appModuleAbs)) {
        patched = tryPatchFile(appModuleAbs);
    }
    if (!patched && fs.existsSync(mainTsAbs)) {
        const before = fs.readFileSync(mainTsAbs, 'utf8');
        if (before.includes('APP_INITIALIZER') && before.includes('WizlySettingsService')) {
            patched = true;
        } else {
            vscode.window.showWarningMessage('Wizly: Could not automatically wire APP_INITIALIZER. Created settings + service, but you may need to add the initializer provider manually.');
        }
    }

    const doc = await vscode.workspace.openTextDocument(settingsPathAbs);
    await vscode.window.showTextDocument(doc, { preview: false });
    const createdPaths = [toWorkspaceRelativePath(workspaceRoot, settingsPathAbs)];
    if (materialIconsPatched) {
        createdPaths.push(indexHtmlRel);
    }
    if (baseScssPatched) {
        createdPaths.push(toWorkspaceRelativePath(workspaceRoot, baseScssAbs));
    }
    if (hasMaterial) {
        createdPaths.push(toWorkspaceRelativePath(workspaceRoot, materialDefaultsAbs));
    }
    showCommandSuccess(`Wizly: Setup runtime settings for "${projectName}".`, {
        created: createdPaths,
        nextStep: `Review settings.json under ${settingsPaths.locationLabel}/settings, then run "Wizly: Sync Runtime Themes (Angular)" if you already have theme bundles.`
    });
}

async function syncAngularRuntimeThemes() {
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
    const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;

    const angularJson = readJson<any>(angularJsonPath);
    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const defaultProjectName = typeof angularJson?.defaultProject === 'string' ? angularJson.defaultProject : undefined;
    const getTargets = (proj: any) => (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
    const getBuildOptions = (proj: any) => {
        const targets = getTargets(proj);
        const target = targets?.build;
        const options = target?.options;
        return options && typeof options === 'object' ? options : undefined;
    };
    const isAppProject = (proj: any) => {
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = getTargets(proj);
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && (builder.includes(':application') || builder.includes(':browser') || builder.includes('application') || builder.includes('browser'));
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
            { title: 'Wizly: Choose Angular project to sync themes for' }
        );
        if (!picked) { return; }
        projectName = picked.label;
    }

    const proj = projects[projectName];
    const sourceRoot = typeof proj?.sourceRoot === 'string' ? proj.sourceRoot : 'src';
    const settingsPathAbs = findExistingRuntimeSettingsPath(workspaceRoot, proj, sourceRoot);
    if (!settingsPathAbs) {
        const fallbackRel1 = toWorkspaceRelativePath(workspaceRoot, resolveRuntimeSettingsPaths(workspaceRoot, proj, sourceRoot).settingsPathAbs);
        const fallbackRel2 = `${sourceRoot.replace(/\\/g, '/')}/assets/settings/settings.json`;
        vscode.window.showErrorMessage(`Wizly: Could not find runtime settings.json. Expected ${fallbackRel1} (preferred) or ${fallbackRel2}. Run "Wizly: Setup Runtime Settings (Angular)" first.`);
        return;
    }

    const buildOptions = getBuildOptions(proj);
    if (!buildOptions) {
        vscode.window.showErrorMessage(`Wizly: Could not find build options for project "${projectName}".`);
        return;
    }

    const styles = Array.isArray((buildOptions as any).styles) ? (buildOptions as any).styles : [];
    const out: Array<{ name: string; href: string; mode?: 'light' | 'dark' }> = [];
    for (const s of styles) {
        if (!s || typeof s !== 'object') { continue; }
        const inject = (s as any).inject;
        const bundleName = (s as any).bundleName;
        if (inject === false && typeof bundleName === 'string' && bundleName.trim()) {
            const bn = bundleName.trim();
            out.push(detectRuntimeThemeFromBundleName(bn));
        }
    }
    const deduped = new Map<string, { name: string; href: string; mode?: 'light' | 'dark' }>();
    for (const t of out) {
        deduped.set(t.href, t);
    }
    const detectedThemes = [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));

    let settingsRaw: any;
    try {
        settingsRaw = JSON.parse(fs.readFileSync(settingsPathAbs, 'utf8'));
    } catch {
        vscode.window.showErrorMessage(`Wizly: Could not parse ${path.relative(workspaceRoot, settingsPathAbs)} as JSON.`);
        return;
    }

    settingsRaw.themes = Array.isArray(settingsRaw.themes) ? settingsRaw.themes : [];
    const byHref = new Map<string, any>();
    for (const t of settingsRaw.themes) {
        const href = typeof t?.href === 'string' ? t.href.trim() : '';
        if (!href) { continue; }
        if (!byHref.has(href)) {
            byHref.set(href, t);
        }
    }

    for (const t of detectedThemes) {
        const existing = byHref.get(t.href);
        if (existing) {
            existing.name = t.name;
            if (t.mode) {
                existing.mode = t.mode;
            } else if (existing.mode === 'light' || existing.mode === 'dark') {
                delete existing.mode;
            }
            continue;
        }
        byHref.set(t.href, t.mode ? { name: t.name, href: t.href, mode: t.mode } : { name: t.name, href: t.href });
    }

    settingsRaw.themes = [...byHref.values()];

    const defaultTheme = typeof settingsRaw.defaultTheme === 'string' ? settingsRaw.defaultTheme.trim() : '';
    const hasDefault = defaultTheme && settingsRaw.themes.some((t: any) => String(t?.href ?? '').trim() === defaultTheme);
    if (!hasDefault) {
        settingsRaw.defaultTheme = String(settingsRaw.themes[0]?.href ?? '').trim();
    }

    fs.writeFileSync(settingsPathAbs, `${JSON.stringify(settingsRaw, null, 2)}\n`, 'utf8');
    const doc = await vscode.workspace.openTextDocument(settingsPathAbs);
    await vscode.window.showTextDocument(doc, { preview: false });
    showCommandSuccess(`Wizly: Synced ${detectedThemes.length} theme bundle(s) into settings.json for "${projectName}".`, {
        created: [toWorkspaceRelativePath(workspaceRoot, settingsPathAbs)],
        nextStep: 'Check defaultTheme, themeMode and any host-based entries before testing runtime switching.'
    });
}

async function checkAngularSetup() {
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
            { title: 'Wizly: Choose Angular workspace to check' }
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
    let angularJson: any;
    let packageJson: any;
    try {
        angularJson = readJson<any>(angularJsonPath);
    } catch (error) {
        vscode.window.showErrorMessage(`Wizly: Could not parse angular.json. ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    try {
        packageJson = readJson<any>(packageJsonPath);
    } catch (error) {
        vscode.window.showErrorMessage(`Wizly: Could not parse package.json. ${error instanceof Error ? error.message : String(error)}`);
        return;
    }

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const defaultProjectName = typeof angularJson?.defaultProject === 'string' ? angularJson.defaultProject : undefined;
    const isAppProject = (proj: any) => {
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && (builder.includes(':application') || builder.includes(':browser') || builder.includes('application') || builder.includes('browser'));
    };
    const appProjectNames = Object.keys(projects).filter((name) => isAppProject(projects[name]));
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
            { title: 'Wizly: Choose Angular project to check' }
        );
        if (!picked) { return; }
        projectName = picked.label;
    }

    const report = analyzeAngularSetup(workspaceRoot, angularJson, packageJson, projectName);
    const markdown = renderAngularSetupReportMarkdown(report);
    const doc = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
    await vscode.window.showTextDocument(doc, { preview: false });

    const errorCount = report.findings.filter((finding) => finding.severity === 'error').length;
    const warningCount = report.findings.filter((finding) => finding.severity === 'warning').length;
    if (errorCount > 0) {
        vscode.window.showWarningMessage(`Wizly: Angular setup check found ${errorCount} error(s) and ${warningCount} warning(s).`);
    } else {
        vscode.window.showInformationMessage(`Wizly: Angular setup check found ${warningCount} warning(s).`);
    }
}

async function runUpgradeAssistant() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('Wizly: Please open a folder first.');
        return;
    }

    const report = analyzeUpgradeAssistant(workspaceRoot);
    const markdown = renderUpgradeAssistantReportMarkdown(report);
    const doc = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
    await vscode.window.showTextDocument(doc, { preview: false });

    if (report.recommendedActions.length === 0) {
        vscode.window.showInformationMessage('Wizly: No specific upgrade actions were detected automatically.');
        return;
    }

    const picked = await vscode.window.showQuickPick(
        report.recommendedActions.map((action) => ({
            label: action.title,
            description: action.description,
            detail: action.reason,
            actionId: action.id
        })),
        {
            title: 'Wizly: Upgrade Assistant',
            placeHolder: 'Choose one or more next steps to run now',
            canPickMany: true
        }
    );

    if (!picked || picked.length === 0) {
        return;
    }

    const commandMap: Record<UpgradeAssistantActionId, string> = {
        patchSettings: 'wizly.patchSettings',
        patchTemplates: 'wizly.patchTemplates',
        patchRules: 'wizly.patchRules',
        checkAngularSetup: 'wizly.checkAngularSetup'
    };

    for (const item of picked) {
        const command = commandMap[item.actionId];
        if (command) {
            await vscode.commands.executeCommand(command);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Register commands
    const transformDisposable = vscode.commands.registerCommand('wizly.transformCurrentFile', transformCurrentFile);
    const transformUncommittedDisposable = vscode.commands.registerCommand('wizly.transformUncommittedFiles', transformUncommittedFiles);
    const convertAngularProjectToScssDisposable = vscode.commands.registerCommand('wizly.convertAngularProjectToScss', convertAngularProjectToScss);
    const convertAngularProjectToPwaDisposable = vscode.commands.registerCommand('wizly.convertAngularProjectToPwa', convertAngularProjectToPwa);
    const generatePwaIconsFromImageDisposable = vscode.commands.registerCommand('wizly.generatePwaIconsFromImage', generatePwaIconsFromActiveImage);
    const generateAngularMaterialThemeScssDisposable = vscode.commands.registerCommand('wizly.generateAngularMaterialThemeScss', generateAngularMaterialThemeScss);
    const generateBlankThemeScssDisposable = vscode.commands.registerCommand('wizly.generateBlankThemeScss', generateBlankThemeScss);
    const generateThemeColorUtilitiesScssDisposable = vscode.commands.registerCommand('wizly.generateThemeColorUtilitiesScss', generateThemeColorUtilitiesScss);
    const importMagicColorFileScssDisposable = vscode.commands.registerCommand('wizly.importMagicColorFileScss', importMagicColorFileScss);
    const checkAngularSetupDisposable = vscode.commands.registerCommand('wizly.checkAngularSetup', checkAngularSetup);
    const upgradeAssistantDisposable = vscode.commands.registerCommand('wizly.upgradeAssistant', runUpgradeAssistant);
    const setupAngularRuntimeSettingsDisposable = vscode.commands.registerCommand('wizly.setupAngularRuntimeSettings', setupAngularRuntimeSettings);
    const syncAngularRuntimeThemesDisposable = vscode.commands.registerCommand('wizly.syncAngularRuntimeThemes', syncAngularRuntimeThemes);
    
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

        const gitMarkerPath = path.join(workspaceRoot, '.git');
        if (!fs.existsSync(gitMarkerPath)) {
            const proceed = await vscode.window.showWarningMessage(
                'Wizly: This folder does not appear to be a Git repository (.git not found). This command updates files and cannot be automatically undone. Do you want to continue?',
                { modal: true },
                'Yes',
                'No'
            );
            if (proceed !== 'Yes') { return; }
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

        const magicFiles: vscode.Uri[] = [];
        for (const inc of includePatterns) {
            const found = await vscode.workspace.findFiles(inc, excludeGlob);
            for (const f of found) { magicFiles.push(f); }
        }
        const uniqueMagic = Array.from(new Set(magicFiles.map(u => u.fsPath))).map(p => vscode.Uri.file(p));
        if (uniqueMagic.length === 0) {
            vscode.window.showWarningMessage('Wizly: No Magic module files found (magic.gen.lib.module.ts). Nothing to sync.');
            return;
        }

        const allReqs = mergeAndDedupeRequirements(ruleReqs);
        const partitions = partitionRequirements(allReqs);
        const materialSpecsFromRules = partitions.sharedMaterial
            .filter(r => !!r.from)
            .map(r => ({ name: r.name, from: r.from as string }));

        const inferMaterialSpecsFromMagic = (): { name: string; from: string }[] => {
            const wantedPrefixes = ['@angular/material/', '@angular/cdk/', '@magic-xpa/angular-material-core'];
            const pairs: Array<{ name: string; from: string }> = [];

            for (const uri of uniqueMagic) {
                const text = fs.readFileSync(uri.fsPath, 'utf8');
                const sf = ts.createSourceFile(uri.fsPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
                for (const st of sf.statements) {
                    if (!ts.isImportDeclaration(st)) { continue; }
                    if (!ts.isStringLiteral(st.moduleSpecifier)) { continue; }
                    const from = st.moduleSpecifier.text;
                    if (!wantedPrefixes.some(p => from === p || from.startsWith(p))) { continue; }
                    const clause = st.importClause;
                    const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings : undefined;
                    if (!named) { continue; }
                    for (const el of named.elements) {
                        const name = el.name.text;
                        if (!name.endsWith('Module')) { continue; }
                        pairs.push({ name, from });
                    }
                }
            }

            const deduped = new Map<string, { name: string; from: string }>();
            for (const p of pairs) {
                deduped.set(`${p.from}::${p.name}`, p);
            }
            return [...deduped.values()].sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
        };

        const materialSpecs = materialSpecsFromRules.length > 0 ? materialSpecsFromRules : inferMaterialSpecsFromMagic();
        const hasExistingSharedMaterialModule = fs.existsSync(sharedMaterialAbs);
        const shouldUseSharedMaterialModule = materialSpecs.length > 0 || hasExistingSharedMaterialModule;
        if (!shouldUseSharedMaterialModule) {
            vscode.window.showWarningMessage(
                "Wizly: No Angular Material imports found to move to SharedMaterialModule. Nothing to sync. If you want to drive this explicitly, export advanced rules and add requires.ngModuleImports entries with placement: 'sharedMaterial'."
            );
            return;
        }

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
            next = ensureNgModuleImports(next, [sharedImportName]);
            next = removeNamedImport(next, sharedMatRel, [sharedMaterialImportName]);
            next = removeNgModuleImports(next, [sharedMaterialImportName]);

            // Prune moved sharedMaterial imports from magic.gen.lib.module.ts to avoid duplicates.
            for (const m of materialSpecs) {
                next = removeNamedImport(next, m.from, [m.name]);
            }
            next = removeNgModuleImports(next, materialSpecs.map(m => m.name));

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
    context.subscriptions.push(generatePwaIconsFromImageDisposable);
    context.subscriptions.push(generateAngularMaterialThemeScssDisposable);
    context.subscriptions.push(generateBlankThemeScssDisposable);
    context.subscriptions.push(generateThemeColorUtilitiesScssDisposable);
    context.subscriptions.push(importMagicColorFileScssDisposable);
    context.subscriptions.push(checkAngularSetupDisposable);
    context.subscriptions.push(upgradeAssistantDisposable);
    context.subscriptions.push(setupAngularRuntimeSettingsDisposable);
    context.subscriptions.push(syncAngularRuntimeThemesDisposable);
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
        statusBarItem.tooltip = `Wizly â€” ${ruleCount} active rules (${configSource})\nClick to open config`;
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
    // Only runs when transformTag is enabled â€” the transform tag acts as an idempotency guard,
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
