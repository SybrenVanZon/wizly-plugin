import * as fs from 'fs';
import * as path from 'path';

export type AngularSetupSeverity = 'error' | 'warning' | 'info' | 'success';

export type AngularSetupFinding = {
    severity: AngularSetupSeverity;
    title: string;
    details?: string;
};

export type AngularSetupReport = {
    workspaceRoot: string;
    projectName: string;
    sourceRoot: string;
    findings: AngularSetupFinding[];
};

function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}

function readJsonSafe<T>(filePath: string): { value?: T; error?: string } {
    try {
        return { value: JSON.parse(fs.readFileSync(filePath, 'utf8')) as T };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function hasSassDependency(packageJson: any, workspaceRoot: string): boolean {
    const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
    const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
    return typeof deps['sass'] === 'string'
        || typeof devDeps['sass'] === 'string'
        || fs.existsSync(path.join(workspaceRoot, 'node_modules', 'sass', 'package.json'));
}

function hasMaterialDependency(packageJson: any, workspaceRoot: string): boolean {
    const deps = packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
    const devDeps = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {};
    return typeof deps['@angular/material'] === 'string'
        || typeof devDeps['@angular/material'] === 'string'
        || fs.existsSync(path.join(workspaceRoot, 'node_modules', '@angular', 'material', 'package.json'));
}

function getTargets(proj: any) {
    return (proj?.targets && typeof proj.targets === 'object') ? proj.targets : proj?.architect;
}

function getBuildOptions(proj: any) {
    const targets = getTargets(proj);
    const target = targets?.build;
    const options = target?.options;
    return options && typeof options === 'object' ? options : undefined;
}

function getThemeBundles(buildOptions: any): Array<{ name: string; href: string; input?: string }> {
    const styles = Array.isArray(buildOptions?.styles) ? buildOptions.styles : [];
    const bundles: Array<{ name: string; href: string; input?: string }> = [];
    for (const s of styles) {
        if (!s || typeof s !== 'object') { continue; }
        const inject = (s as any).inject;
        const bundleName = typeof (s as any).bundleName === 'string' ? (s as any).bundleName.trim() : '';
        const input = typeof (s as any).input === 'string' ? normalizePath((s as any).input) : undefined;
        if (inject === false && bundleName) {
            bundles.push({ name: bundleName, href: `${bundleName}.css`, input });
        }
    }
    const unique = new Map<string, { name: string; href: string; input?: string }>();
    for (const bundle of bundles) {
        unique.set(bundle.href, bundle);
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeThemeAssetHref(value: string): string {
    return value
        .trim()
        .replace(/\\/g, '/')
        .replace(/[?#].*$/, '')
        .replace(/^(?:\.\/)+/, '')
        .replace(/^\/+/, '');
}

function getIndexHtmlPath(workspaceRoot: string, sourceRoot: string, buildOptions: any): string {
    const rel = typeof buildOptions?.index === 'string' && buildOptions.index.trim()
        ? buildOptions.index.trim().replace(/\\/g, '/')
        : `${normalizePath(sourceRoot)}/index.html`;
    return path.join(workspaceRoot, rel);
}

function findFixedThemeLink(indexHtmlText: string, knownThemeHrefs: Iterable<string>): { href: string; managed: boolean } | undefined {
    const normalizedKnownHrefs = new Set([...knownThemeHrefs].map(normalizeThemeAssetHref));
    const linkRegex = /<link\b[^>]*>/gi;
    let matchedKnownHref: { href: string; managed: boolean } | undefined;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(indexHtmlText)) !== null) {
        const tag = match[0];
        const hrefMatch = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
        if (!hrefMatch) { continue; }
        const href = hrefMatch[2].trim();
        if (!href) { continue; }
        const managed = /\bdata-wizly-theme-activation\s*=\s*(["'])fixed\1/i.test(tag);
        const normalizedHref = normalizeThemeAssetHref(href);
        if (managed) {
            return { href, managed: true };
        }
        if (!matchedKnownHref && normalizedKnownHrefs.has(normalizedHref)) {
            matchedKnownHref = { href, managed: false };
        }
    }

    return matchedKnownHref;
}

function hasSettingsAsset(buildOptions: any, inputRel: string): boolean {
    const assets = Array.isArray(buildOptions?.assets) ? buildOptions.assets : [];
    return assets.some((a: any) => {
        if (!a || typeof a !== 'object') { return false; }
        return normalizePath(String((a as any).input ?? '')) === normalizePath(inputRel)
            && normalizePath(String((a as any).output ?? '')) === 'settings';
    });
}

function listFilesRecursive(root: string, predicate: (filePath: string) => boolean, skip = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.vs', '.vscode'])): string[] {
    const found: string[] = [];
    if (!fs.existsSync(root)) { return found; }
    const walk = (dirPath: string) => {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (skip.has(entry.name)) { continue; }
                walk(path.join(dirPath, entry.name));
                continue;
            }
            const fullPath = path.join(dirPath, entry.name);
            if (predicate(fullPath)) {
                found.push(fullPath);
            }
        }
    };
    walk(root);
    return found;
}

export function analyzeAngularSetup(workspaceRoot: string, angularJson: any, packageJson: any, projectName: string): AngularSetupReport {
    const findings: AngularSetupFinding[] = [];
    const add = (severity: AngularSetupSeverity, title: string, details?: string) => findings.push({ severity, title, details });

    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    const proj = projects[projectName];
    const sourceRoot = typeof proj?.sourceRoot === 'string' ? proj.sourceRoot : 'src';

    if (!proj || typeof proj !== 'object') {
        add('error', `Angular project "${projectName}" was not found in angular.json.`);
        return { workspaceRoot, projectName, sourceRoot, findings };
    }

    const buildOptions = getBuildOptions(proj);
    if (!buildOptions) {
        add('error', `Build options are missing for Angular project "${projectName}".`);
        return { workspaceRoot, projectName, sourceRoot, findings };
    }

    if (hasSassDependency(packageJson, workspaceRoot)) {
        add('success', 'Sass is installed.');
    } else {
        add('error', 'Sass is missing.', 'Install `sass` or run `Wizly: Convert Angular Project to SCSS` first.');
    }

    const mainScssRel = `${normalizePath(sourceRoot)}/scss/main.scss`;
    const mainScssAbs = path.join(workspaceRoot, sourceRoot, 'scss', 'main.scss');
    if (fs.existsSync(mainScssAbs)) {
        add('success', `${mainScssRel} exists.`);
    } else {
        add('warning', `${mainScssRel} was not found.`, 'If this project should use Wizly SCSS structure, run `Wizly: Convert Angular Project to SCSS`.');
    }

    const styles = Array.isArray(buildOptions.styles) ? buildOptions.styles : [];
    const mainScssIncluded = styles.some((styleEntry: any) => {
        if (typeof styleEntry === 'string') {
            return normalizePath(styleEntry) === mainScssRel;
        }
        if (styleEntry && typeof styleEntry === 'object' && typeof (styleEntry as any).input === 'string') {
            return normalizePath(String((styleEntry as any).input)) === mainScssRel;
        }
        return false;
    });
    if (mainScssIncluded) {
        add('success', `${mainScssRel} is configured in angular.json styles.`);
    } else {
        add('warning', `${mainScssRel} is not configured in angular.json styles.`);
    }

    const hasMaterial = hasMaterialDependency(packageJson, workspaceRoot);
    if (hasMaterial) {
        add('success', '@angular/material is installed.');
    } else {
        add('info', '@angular/material is not installed.', 'That is fine unless you want Angular Material themes or Material-based Wizly UI helpers.');
    }

    const themeBundles = getThemeBundles(buildOptions);
    if (themeBundles.length > 0) {
        add('success', `Found ${themeBundles.length} theme bundle(s) in angular.json.`, themeBundles.map((bundle) => `${bundle.name} -> ${bundle.href}`).join('\n'));
    } else {
        add('info', 'No theme bundles were found in angular.json.', 'That is fine unless you want separate deployable themes or runtime theme switching.');
    }

    const indexHtmlAbs = getIndexHtmlPath(workspaceRoot, sourceRoot, buildOptions);
    const fixedThemeLink = fs.existsSync(indexHtmlAbs)
        ? findFixedThemeLink(fs.readFileSync(indexHtmlAbs, 'utf8'), themeBundles.map((bundle) => bundle.href))
        : undefined;
    if (fixedThemeLink) {
        const matchedBundle = themeBundles.find((bundle) => normalizeThemeAssetHref(bundle.href) === normalizeThemeAssetHref(fixedThemeLink.href));
        if (matchedBundle) {
            add('success', `index.html loads a fixed theme (${fixedThemeLink.href}).`);
        } else {
            add('warning', `index.html references "${fixedThemeLink.href}" as a fixed theme, but that href does not match the current theme bundles.`);
        }
    }

    const themeUtilitiesAbs = path.join(workspaceRoot, sourceRoot, 'scss', 'base', '_mat-color-utilities.scss');
    if (fs.existsSync(themeUtilitiesAbs)) {
        add('success', 'Material color utilities file exists.');
        const mainScssText = fs.existsSync(mainScssAbs) ? fs.readFileSync(mainScssAbs, 'utf8') : '';
        if (mainScssText.includes('./base/mat-color-utilities') || mainScssText.includes('base/mat-color-utilities')) {
            add('success', 'Material color utilities are imported into main.scss.');
        } else {
            add('warning', 'Material color utilities exist but are not imported into main.scss.');
        }
        if (themeBundles.length === 0) {
            add('warning', 'Material color utilities exist without any theme bundles.', 'These utilities depend on `--wizly-mat-*` variables generated by an active Wizly Material theme.');
        }
    } else {
        add('info', 'Material color utilities were not generated.');
    }

    const magicUtilitiesAbs = path.join(workspaceRoot, sourceRoot, 'scss', 'base', '_magic-color-utilities.scss');
    const magicVarsAbs = path.join(workspaceRoot, sourceRoot, 'scss', 'vars', '_magic-colors.scss');
    if (fs.existsSync(magicUtilitiesAbs) || fs.existsSync(magicVarsAbs)) {
        add('success', 'Magic color SCSS files are present.');
    }

    const projectRootRel = typeof proj?.root === 'string' ? proj.root : '';
    const publicSettingsAbs = path.join(workspaceRoot, projectRootRel, 'public', 'settings', 'settings.json');
    const assetsSettingsAbs = path.join(workspaceRoot, sourceRoot, 'assets', 'settings', 'settings.json');
    const settingsPathAbs = fs.existsSync(publicSettingsAbs) ? publicSettingsAbs : (fs.existsSync(assetsSettingsAbs) ? assetsSettingsAbs : undefined);
    if (settingsPathAbs) {
        add('success', `${normalizePath(path.relative(workspaceRoot, settingsPathAbs))} exists.`);
        if (settingsPathAbs === assetsSettingsAbs) {
            const inputRel = `${normalizePath(sourceRoot)}/assets/settings`;
            if (hasSettingsAsset(buildOptions, inputRel)) {
                add('success', 'angular.json copies the runtime settings folder to /settings.');
            } else {
                add('warning', 'settings.json exists but angular.json does not appear to copy the settings folder to /settings.');
            }
        } else {
            add('info', 'settings.json is placed under public/.', 'In most Angular setups, public/ files are served at the site root. This typically makes the runtime settings available at /settings/settings.json.');
        }

        const parsedSettings = readJsonSafe<any>(settingsPathAbs);
        if (parsedSettings.error) {
            add('error', 'settings.json could not be parsed.', parsedSettings.error);
        } else {
            const settingsRoot = parsedSettings.value ?? {};
            const settings = settingsRoot.wizly && typeof settingsRoot.wizly === 'object' ? settingsRoot.wizly : {};
            const themeMode = settings.themeMode;
            if (themeMode === 'single' || themeMode === 'multi' || themeMode === 'hostbased') {
                add('success', `Runtime theme mode is set to "${themeMode}".`);
            } else {
                add('warning', 'Runtime theme mode is missing or invalid.', 'Expected `single`, `multi` or `hostbased`.');
            }

            const defaultThemePreference = settings.defaultThemePreference;
            if (defaultThemePreference === 'light' || defaultThemePreference === 'dark' || defaultThemePreference === 'system') {
                add('success', `defaultThemePreference is set to "${defaultThemePreference}".`);
            } else {
                add('warning', 'defaultThemePreference is missing or invalid.', 'Expected `light`, `dark` or `system`.');
            }

            const runtimeThemes = Array.isArray(settings.themes) ? settings.themes : [];
            if (runtimeThemes.length > 0) {
                add('success', `settings.json contains ${runtimeThemes.length} runtime theme entry/entries.`);
            } else {
                add('warning', 'settings.json does not contain any runtime themes.');
            }

            const runtimeThemeHrefs = new Set<string>(runtimeThemes.map((theme: any) => String(theme?.href ?? '').trim()).filter(Boolean));
            const bundleHrefs = new Set(themeBundles.map((bundle) => bundle.href));
            const missingInSettings = themeBundles.filter((bundle) => !runtimeThemeHrefs.has(bundle.href));
            const missingInBundles = [...runtimeThemeHrefs].filter((href) => !bundleHrefs.has(href));

            if (themeBundles.length > 0 && missingInSettings.length === 0) {
                add('success', 'Runtime theme entries match the detected theme bundles.');
            } else if (missingInSettings.length > 0) {
                add('warning', 'Some theme bundles are missing from settings.json.', missingInSettings.map((bundle) => bundle.href).join('\n'));
            }

            if (missingInBundles.length > 0) {
                add('warning', 'Some runtime themes do not match any current theme bundle.', missingInBundles.join('\n'));
            }

            const defaultTheme = typeof settings.defaultTheme === 'string' ? settings.defaultTheme.trim() : '';
            if (defaultTheme) {
                if (runtimeThemeHrefs.has(defaultTheme)) {
                    add('success', `defaultTheme points to "${defaultTheme}".`);
                } else {
                    add('warning', `defaultTheme points to "${defaultTheme}" but that href was not found in settings.json themes.`);
                }
            } else {
                add('warning', 'defaultTheme is missing or empty.');
            }

            if (themeMode === 'hostbased') {
                const missingHost = runtimeThemes.filter((theme: any) => !String(theme?.host ?? '').trim());
                if (missingHost.length === 0) {
                    add('success', 'All hostbased runtime themes define a host.');
                } else {
                    add('warning', 'Hostbased theme mode is active but some themes do not define a host.', missingHost.map((theme: any) => String(theme?.href ?? '')).join('\n'));
                }

                const themesByHost = new Map<string, any[]>();
                for (const theme of runtimeThemes) {
                    const host = String(theme?.host ?? '').trim();
                    if (!host) { continue; }
                    const list = themesByHost.get(host) ?? [];
                    list.push(theme);
                    themesByHost.set(host, list);
                }
                const ambiguousHosts = [...themesByHost.entries()].filter(([host, list]) => {
                    if (list.length < 2) { return false; }
                    const hasExplicitDefault = list.some((theme) => theme?.default === true);
                    const hasMatchingGlobalDefault = defaultTheme && list.some((theme) => String(theme?.href ?? '').trim() === defaultTheme);
                    return !hasExplicitDefault && !hasMatchingGlobalDefault;
                });
                if (ambiguousHosts.length > 0) {
                    add(
                        'warning',
                        'Some hosts have multiple themes without a clear default.',
                        `${ambiguousHosts.map(([host]) => host).join('\n')}\n\nMark one theme per host with "default": true, or point defaultTheme at one of that host's themes. Without either, the first matching theme in the array is used.`
                    );
                }
            }

            if (themeMode === 'multi' && runtimeThemes.length < 2) {
                add('warning', 'themeMode is `multi` but fewer than two runtime themes were found.');
            }
        }

        const wizlyServiceCandidates = [
            path.join(workspaceRoot, sourceRoot, 'app', 'wizly', 'wizly-settings.service.ts'),
            path.join(workspaceRoot, sourceRoot, 'app', 'core', 'wizly', 'wizly-settings.service.ts')
        ];
        if (wizlyServiceCandidates.some((candidate) => fs.existsSync(candidate))) {
            add('success', 'Wizly runtime settings service exists.');
        } else {
            add('warning', 'settings.json exists but Wizly runtime settings service was not found.');
        }

        if (fixedThemeLink) {
            add('warning', 'Both runtime settings and a fixed theme link in index.html were found.', 'This can be valid during migration, but usually you should choose one primary activation path.');
        }
    } else {
        if (fixedThemeLink) {
            add('info', 'Runtime settings are not configured.', 'That is fine because index.html already activates a fixed theme.');
        } else {
            add('info', 'Runtime settings are not configured.');
        }
    }

    if (themeBundles.length > 0 && !settingsPathAbs && !fixedThemeLink) {
        add('warning', 'Theme bundles exist, but no activation path was found.', 'Use runtime settings or add a fixed theme link in index.html so one of the generated bundles becomes active.');
    }

    const manifestCandidates = [
        path.join(workspaceRoot, 'public', 'manifest.webmanifest'),
        path.join(workspaceRoot, sourceRoot, 'manifest.webmanifest'),
        path.join(workspaceRoot, sourceRoot, 'public', 'manifest.webmanifest')
    ];
    const hasManifest = manifestCandidates.some((candidate) => fs.existsSync(candidate));
    const ngswConfigPath = path.join(workspaceRoot, 'ngsw-config.json');
    if (hasManifest && fs.existsSync(ngswConfigPath)) {
        add('success', 'PWA markers were found (manifest + ngsw-config.json).');
    } else if (hasManifest || fs.existsSync(ngswConfigPath)) {
        add('warning', 'Only part of the expected PWA setup was found.', 'Expected both a manifest.webmanifest and ngsw-config.json.');
    } else {
        add('info', 'PWA support is not configured.');
    }

    const sharedModuleCandidates = [
        path.join(workspaceRoot, sourceRoot, 'app', 'shared', 'shared.module.ts'),
        path.join(workspaceRoot, sourceRoot, 'app', 'shared', 'shared-material.module.ts')
    ];
    const magicModuleFiles = listFilesRecursive(workspaceRoot, (filePath) => normalizePath(filePath).endsWith('/magic.gen.lib.module.ts'));
    if (magicModuleFiles.length > 0) {
        const existingSharedModules = sharedModuleCandidates.filter((candidate) => fs.existsSync(candidate));
        if (existingSharedModules.length > 0) {
            add('success', `Shared module support appears present for ${magicModuleFiles.length} Magic module file(s).`);
        } else {
            add('warning', `Found ${magicModuleFiles.length} magic.gen.lib.module.ts file(s) but no shared module files in the default shared folder.`);
        }
    } else {
        add('info', 'No magic.gen.lib.module.ts files were found.', 'Shared module sync may not be relevant for this project.');
    }

    return { workspaceRoot, projectName, sourceRoot, findings };
}

export function renderAngularSetupReportMarkdown(report: AngularSetupReport): string {
    const severityLabel = (severity: AngularSetupSeverity) => {
        switch (severity) {
            case 'error': return 'Error';
            case 'warning': return 'Warning';
            case 'success': return 'OK';
            case 'info': return 'Info';
        }
    };

    const counts = {
        error: report.findings.filter((finding) => finding.severity === 'error').length,
        warning: report.findings.filter((finding) => finding.severity === 'warning').length,
        success: report.findings.filter((finding) => finding.severity === 'success').length,
        info: report.findings.filter((finding) => finding.severity === 'info').length,
    };

    const lines: string[] = [];
    lines.push('# Wizly Angular Setup Report');
    lines.push('');
    lines.push(`- Workspace: \`${normalizePath(report.workspaceRoot)}\``);
    lines.push(`- Project: \`${report.projectName}\``);
    lines.push(`- Source root: \`${normalizePath(report.sourceRoot)}\``);
    lines.push(`- Summary: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.success} OK item(s), ${counts.info} info item(s)`);
    lines.push('');
    lines.push('## Findings');
    lines.push('');
    for (const finding of report.findings) {
        lines.push(`- **${severityLabel(finding.severity)}**: ${finding.title}`);
        if (finding.details) {
            lines.push(`  ${finding.details.replace(/\r?\n/g, '\n  ')}`);
        }
    }
    lines.push('');
    return lines.join('\n');
}
