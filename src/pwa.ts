import * as fs from 'fs';
import * as path from 'path';

export const PWA_MANIFEST_FILE = 'manifest.webmanifest';
export const PWA_NGSW_CONFIG_FILE = 'ngsw-config.json';
export const PWA_FAVICON_SIZES = [16, 32, 48];

export type PwaIconTarget = { size: number; src: string };

// Where Angular CLI puts the manifest: public/ (Angular 17+) or the source root (older setups).
export function getPwaManifestCandidates(workspaceRoot: string, sourceRoot: string): string[] {
    return [
        path.join(workspaceRoot, 'public', PWA_MANIFEST_FILE),
        path.join(workspaceRoot, sourceRoot, PWA_MANIFEST_FILE),
        path.join(workspaceRoot, sourceRoot, 'public', PWA_MANIFEST_FILE)
    ];
}

export function findPwaManifestPath(workspaceRoot: string, sourceRoot: string): string | undefined {
    return getPwaManifestCandidates(workspaceRoot, sourceRoot).find((candidate) => fs.existsSync(candidate));
}

function normalizeBudgetThreshold(value: unknown): string | undefined {
    if (typeof value !== 'string') { return undefined; }
    return value.replace(/\s+/g, '').toLowerCase();
}

// Magic production bundles are far above Angular's default 500kb/1mb initial budget, which fails the build.
// Only the untouched default is raised, so a budget the team chose on purpose stays as it is.
export function relaxDefaultPwaInitialBudgets(angularJson: any, projectName: string): string[] {
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
            if (String(budget.type ?? '').trim() !== 'initial') { continue; }

            const warning = normalizeBudgetThreshold(budget.maximumWarning);
            const error = normalizeBudgetThreshold(budget.maximumError);
            if (warning !== '500kb' || error !== '1mb') { continue; }

            budget.maximumWarning = desiredWarning;
            budget.maximumError = desiredError;
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

// Local, square icons from manifest.icons. Remote and data: URLs are skipped because there is no file to write.
export function parseManifestIconTargets(manifest: any): PwaIconTarget[] {
    const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
    const unique = new Map<string, PwaIconTarget>();
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
            unique.set(`${w}::${src}`, { size: w, src });
        }
    }
    return [...unique.values()].sort((a, b) => a.size - b.size || a.src.localeCompare(b.src));
}

// Icon src values in the manifest are relative to the folder the manifest is served from.
export function resolveManifestIconPath(workspaceRoot: string, sourceRoot: string, manifestPath: string, src: string): string {
    const normalized = src.replace(/\\/g, '/').replace(/^\//, '');
    const srcRoot = path.join(workspaceRoot, sourceRoot);
    if (normalized.startsWith('assets/')) {
        return path.join(srcRoot, normalized);
    }
    const publicRoot = path.join(workspaceRoot, 'public');
    if (manifestPath.replace(/\\/g, '/').includes('/public/') && fs.existsSync(publicRoot)) {
        return path.join(publicRoot, normalized);
    }
    return path.join(srcRoot, normalized);
}

// Angular 18+ serves favicon.ico from public/, older projects from the source root. An existing file wins.
export function resolveFaviconPath(workspaceRoot: string, sourceRoot: string): string {
    const publicFavicon = path.join(workspaceRoot, 'public', 'favicon.ico');
    const sourceFavicon = path.join(workspaceRoot, sourceRoot, 'favicon.ico');
    if (fs.existsSync(publicFavicon)) { return publicFavicon; }
    if (fs.existsSync(sourceFavicon)) { return sourceFavicon; }
    return fs.existsSync(path.join(workspaceRoot, 'public')) ? publicFavicon : sourceFavicon;
}

export function resizeRgbaBilinear(src: Buffer, srcW: number, srcH: number, dstW: number, dstH: number): Buffer {
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
}

// An .ico file is a small directory header followed by the embedded PNG images.
export function buildIco(images: Array<{ size: number; png: Buffer }>): Buffer {
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

    return Buffer.concat([dir, ...images.map((image) => image.png)]);
}

const PWA_UPDATE_OPTIONS = `export type PwaUpdateMode = 'prompt' | 'silent';

export type PwaUpdateOptions = {
    checkIntervalMs?: number;
    mode?: PwaUpdateMode;
    prompt?: (message: string) => boolean | Promise<boolean>;
};
`;

const PWA_UPDATE_INIT = `    init(options?: PwaUpdateOptions) {
        if (!this.swUpdate.isEnabled) { return; }

        this.swUpdate.versionUpdates
            .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
            .subscribe(() => {
                void this.handleVersionReady(options);
            });

        const intervalMs = options?.checkIntervalMs ?? 10 * 60_000;
        setInterval(() => this.swUpdate.checkForUpdate(), intervalMs);
    }

    private async handleVersionReady(options?: PwaUpdateOptions) {
        const mode: PwaUpdateMode = options?.mode ?? 'prompt';
        if (mode === 'silent') {
            await this.swUpdate.activateUpdate();
            location.reload();
            return;
        }

        const message = 'A new version is available. Reload now?';
`;

// With Angular Material the prompt is a MatDialog, otherwise the browser's confirm().
export function renderPwaUpdateService(withMaterial: boolean): string {
    if (!withMaterial) {
        return `import { inject, Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

${PWA_UPDATE_OPTIONS}
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
    private readonly swUpdate = inject(SwUpdate);

${PWA_UPDATE_INIT}        const shouldReload = options?.prompt ? await options.prompt(message) : confirm(message);
        if (shouldReload) {
            await this.swUpdate.activateUpdate();
            location.reload();
        }
    }
}
`;
    }

    return `import { Component, inject, Injectable, Injector } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';

${PWA_UPDATE_OPTIONS}
@Component({
    selector: 'wizly-pwa-update-dialog',
    standalone: true,
    template: \`<h2 style="margin: 0 0 12px">Update available</h2>
<p style="margin: 0 0 16px">{{ data.message }}</p>
<div style="display: flex; gap: 8px; justify-content: flex-end">
  <button type="button" (click)="close(false)">Later</button>
  <button type="button" (click)="close(true)">Reload</button>
</div>
\`
})
export class PwaUpdateDialogComponent {
    readonly data = inject<{ message: string }>(MAT_DIALOG_DATA);
    private readonly dialogRef = inject(MatDialogRef<PwaUpdateDialogComponent, boolean>);

    close(value: boolean) {
        this.dialogRef.close(value);
    }
}

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
    private readonly swUpdate = inject(SwUpdate);
    private readonly injector = inject(Injector);

${PWA_UPDATE_INIT}        const shouldReload = await this.promptReload(message, options);
        if (shouldReload) {
            await this.swUpdate.activateUpdate();
            location.reload();
        }
    }

    private async promptReload(message: string, options?: PwaUpdateOptions): Promise<boolean> {
        if (options?.prompt) {
            return await options.prompt(message);
        }

        const dialog = this.injector.get(MatDialog, null as any);
        if (dialog) {
            const ref = dialog.open(PwaUpdateDialogComponent, {
                data: { message },
                disableClose: true,
                width: '420px'
            });
            const result = await firstValueFrom(ref.afterClosed().pipe(take(1)));
            return result === true;
        }

        return confirm(message);
    }
}
`;
}

// Adds the import, an injected field and an init() call to AppComponent. `wired` is false when there is
// no AppComponent class to attach to; the text is then returned unchanged.
export function wirePwaUpdateServiceIntoAppComponent(source: string): { text: string; wired: boolean } {
    if (!/export\s+class\s+AppComponent\b/.test(source)) {
        return { text: source, wired: false };
    }

    let text = source;

    if (!text.includes(`'./pwa-update.service'`) && !text.includes(`"./pwa-update.service"`)) {
        const importLine = `import { PwaUpdateService } from './pwa-update.service';\n`;
        const importMatches = [...text.matchAll(/^[^\S\r\n]*import\s+[\s\S]*?;[^\S\r\n]*\r?\n/gm)];
        if (importMatches.length > 0) {
            const last = importMatches[importMatches.length - 1];
            const insertAt = (last.index ?? 0) + last[0].length;
            text = text.slice(0, insertAt) + importLine + text.slice(insertAt);
        } else {
            text = importLine + text;
        }
    }

    const hasInjectImport = /from\s+['"]@angular\/core['"]/.test(text) && /import\s*\{[^}]*\binject\b[^}]*\}\s*from\s*['"]@angular\/core['"]/.test(text);
    if (!hasInjectImport) {
        const importRegex = /^\s*import\s*\{(?<names>[^}]+)\}\s*from\s*['"]@angular\/core['"];\s*$/m;
        const m = text.match(importRegex);
        if (m && m.groups?.names) {
            const names = m.groups.names.split(',').map((name) => name.trim()).filter(Boolean);
            const updated = [...names, 'inject'].sort((a, b) => a.localeCompare(b)).join(', ');
            text = text.replace(importRegex, `import { ${updated} } from '@angular/core';`);
        } else {
            text = `import { inject } from '@angular/core';\n${text}`;
        }
    }

    // The patterns stop at the end of the opening line, so the indentation of the next line stays intact.
    const field = '    private readonly pwaUpdateService = inject(PwaUpdateService);\n';
    if (!text.includes('inject(PwaUpdateService)')) {
        const classOpenLine = /(export\s+class\s+AppComponent\b[^{]*\{[^\S\r\n]*\r?\n)/m;
        text = classOpenLine.test(text)
            ? text.replace(classOpenLine, `$1${field}\n`)
            : text.replace(/(export\s+class\s+AppComponent\b[^{]*\{)/m, `$1\n${field}`);
    }

    if (!text.includes('this.pwaUpdateService.init(')) {
        const constructorOpen = /(\bconstructor\s*\([^)]*\)\s*\{[^\S\r\n]*\r?\n?)/m;
        if (constructorOpen.test(text)) {
            text = text.replace(constructorOpen, '$1        this.pwaUpdateService.init();\n');
        } else {
            const ctor = '\n    constructor() {\n        this.pwaUpdateService.init();\n    }\n';
            text = text.replace(field, `${field}${ctor}`);
        }
    }

    return { text, wired: true };
}
