import * as fs from 'fs';
import * as path from 'path';

import type { AngularSetupFinding, AngularSetupSeverity } from './angular-check';

const MAGIC_SCOPE = '@magic-xpa';
const MAGIC_PACKAGE_PATTERN = /@magic-xpa\/([a-z0-9][a-z0-9._-]*)/gi;
const SOURCE_FILE_EXTENSIONS = ['.ts', '.html'];
const SOURCE_SCAN_FILE_LIMIT = 2000;
const SKIPPED_SCAN_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.vs', '.vscode', '.angular']);

export type MagicDependencyLocation = 'dependencies' | 'devDependencies';

export type MagicDependencyEntry = {
    name: string;
    spec: string;
    location: MagicDependencyLocation;
};

export type MagicDependencyContext = {
    /** `@magic-xpa/*` packages referenced from project source files. */
    importedPackages: string[];
    /** `@magic-xpa/*` packages present in `node_modules`, declared or not. */
    installedPackages: string[];
    nodeModulesPresent: boolean;
    scannedSourceFiles: number;
    sourceScanTruncated: boolean;
    installedAngularCoreVersion?: string;
    installedMagicAngularVersion?: string;
    magicAngularAngularCorePeerRange?: string;
};

type SemverParts = { major: number; minor: number; patch: number };

function parseVersionCore(value: string): SemverParts | undefined {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
    if (!match) { return undefined; }
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(a: SemverParts, b: SemverParts): number {
    if (a.major !== b.major) { return a.major - b.major; }
    if (a.minor !== b.minor) { return a.minor - b.minor; }
    return a.patch - b.patch;
}

function isWildcardPart(part: string | undefined): boolean {
    return part === undefined || part === 'x' || part === 'X' || part === '*';
}

/** `true`/`false` when the comparator could be evaluated, `undefined` when it was not understood. */
function satisfiesComparator(version: SemverParts, comparator: string): boolean | undefined {
    const trimmed = comparator.trim();
    if (!trimmed || trimmed === '*' || trimmed === 'x' || trimmed === 'X') { return true; }

    const match = /^(\^|~|>=|<=|>|<|=)?\s*v?(\d+|x|X|\*)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:[-+][0-9A-Za-z.-]+)?$/.exec(trimmed);
    if (!match) { return undefined; }

    const operator = match[1] ?? '';
    if (isWildcardPart(match[2])) { return true; }

    const minorWildcard = isWildcardPart(match[3]);
    const patchWildcard = isWildcardPart(match[4]);
    const lower: SemverParts = {
        major: Number(match[2]),
        minor: minorWildcard ? 0 : Number(match[3]),
        patch: patchWildcard ? 0 : Number(match[4])
    };

    switch (operator) {
        case '':
        case '=': {
            if (minorWildcard) { return version.major === lower.major; }
            if (patchWildcard) { return version.major === lower.major && version.minor === lower.minor; }
            return compareVersions(version, lower) === 0;
        }
        case '>': return compareVersions(version, lower) > 0;
        case '>=': return compareVersions(version, lower) >= 0;
        case '<': return compareVersions(version, lower) < 0;
        case '<=': return compareVersions(version, lower) <= 0;
        case '^': {
            let upper: SemverParts;
            if (lower.major > 0 || minorWildcard) {
                upper = { major: lower.major + 1, minor: 0, patch: 0 };
            } else if (lower.minor > 0 || patchWildcard) {
                upper = { major: 0, minor: lower.minor + 1, patch: 0 };
            } else {
                upper = { major: 0, minor: 0, patch: lower.patch + 1 };
            }
            return compareVersions(version, lower) >= 0 && compareVersions(version, upper) < 0;
        }
        case '~': {
            const upper: SemverParts = minorWildcard
                ? { major: lower.major + 1, minor: 0, patch: 0 }
                : { major: lower.major, minor: lower.minor + 1, patch: 0 };
            return compareVersions(version, lower) >= 0 && compareVersions(version, upper) < 0;
        }
        default: return undefined;
    }
}

/**
 * Minimal semver range check for the comparators that actually show up in `peerDependencies`.
 * Prerelease tags are ignored on purpose; returns `undefined` when the range is not understood.
 */
export function satisfiesRange(version: string, range: string): boolean | undefined {
    const parsedVersion = parseVersionCore(version);
    if (!parsedVersion) { return undefined; }

    const trimmedRange = range.trim();
    if (!trimmedRange || trimmedRange === '*') { return true; }

    let sawUnknownGroup = false;
    for (const group of trimmedRange.split('||')) {
        const comparators = group.trim().split(/\s+/).filter(Boolean);
        if (comparators.length === 0) { return true; }

        let groupMatches = true;
        let groupUnknown = false;
        for (const comparator of comparators) {
            const result = satisfiesComparator(parsedVersion, comparator);
            if (result === undefined) { groupUnknown = true; break; }
            if (!result) { groupMatches = false; break; }
        }

        if (groupUnknown) { sawUnknownGroup = true; continue; }
        if (groupMatches) { return true; }
    }

    return sawUnknownGroup ? undefined : false;
}

function readJson(filePath: string): any | undefined {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return undefined;
    }
}

function getDependencyMap(packageJson: any, location: MagicDependencyLocation): Record<string, string> {
    const raw = packageJson?.[location];
    return raw && typeof raw === 'object' ? raw as Record<string, string> : {};
}

export function collectMagicDependencyEntries(packageJson: any): MagicDependencyEntry[] {
    const entries: MagicDependencyEntry[] = [];
    for (const location of ['dependencies', 'devDependencies'] as MagicDependencyLocation[]) {
        const map = getDependencyMap(packageJson, location);
        for (const [name, spec] of Object.entries(map)) {
            if (!name.startsWith(`${MAGIC_SCOPE}/`) || typeof spec !== 'string') { continue; }
            entries.push({ name, spec: spec.trim(), location });
        }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location));
}

function isExactVersionSpec(spec: string): boolean {
    return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(spec.trim());
}

function isRegistryRangeSpec(spec: string): boolean {
    return /^[\^~><=]|^\d|^v\d|^\*$|^x$/i.test(spec.trim());
}

function collectMagicImportsFromText(text: string): string[] {
    const found = new Set<string>();
    MAGIC_PACKAGE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MAGIC_PACKAGE_PATTERN.exec(text)) !== null) {
        found.add(`${MAGIC_SCOPE}/${match[1].toLowerCase()}`);
    }
    return [...found];
}

/** Exported for tests: which `@magic-xpa/*` packages a single source file references. */
export function findMagicPackageReferences(text: string): string[] {
    return collectMagicImportsFromText(text).sort();
}

function scanSourceForMagicImports(sourceDir: string): { packages: string[]; scannedFiles: number; truncated: boolean } {
    const packages = new Set<string>();
    let scannedFiles = 0;
    let truncated = false;

    if (!fs.existsSync(sourceDir)) {
        return { packages: [], scannedFiles: 0, truncated: false };
    }

    const walk = (dir: string) => {
        if (truncated) { return; }
        let dirEntries: fs.Dirent[];
        try {
            dirEntries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const dirEntry of dirEntries) {
            if (truncated) { return; }
            const fullPath = path.join(dir, dirEntry.name);
            if (dirEntry.isDirectory()) {
                if (SKIPPED_SCAN_DIRECTORIES.has(dirEntry.name)) { continue; }
                walk(fullPath);
                continue;
            }
            if (!SOURCE_FILE_EXTENSIONS.includes(path.extname(dirEntry.name).toLowerCase())) { continue; }
            if (scannedFiles >= SOURCE_SCAN_FILE_LIMIT) {
                truncated = true;
                return;
            }
            scannedFiles++;
            try {
                for (const name of collectMagicImportsFromText(fs.readFileSync(fullPath, 'utf8'))) {
                    packages.add(name);
                }
            } catch {
                // Unreadable files are skipped; the scan stays best effort.
            }
        }
    };

    walk(sourceDir);
    return { packages: [...packages].sort(), scannedFiles, truncated };
}

/** Reads everything the Magic dependency rules need from disk. */
export function collectMagicDependencyContext(workspaceRoot: string, sourceRoot: string): MagicDependencyContext {
    const nodeModulesDir = path.join(workspaceRoot, 'node_modules');
    const nodeModulesPresent = fs.existsSync(nodeModulesDir);

    let installedPackages: string[] = [];
    if (nodeModulesPresent) {
        const magicScopeDir = path.join(nodeModulesDir, MAGIC_SCOPE);
        try {
            installedPackages = fs.readdirSync(magicScopeDir, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => `${MAGIC_SCOPE}/${entry.name}`)
                .sort();
        } catch {
            installedPackages = [];
        }
    }

    const angularCorePackageJson = readJson(path.join(nodeModulesDir, '@angular', 'core', 'package.json'));
    const magicAngularPackageJson = readJson(path.join(nodeModulesDir, MAGIC_SCOPE, 'angular', 'package.json'));
    const peerRange = magicAngularPackageJson?.peerDependencies?.['@angular/core'];

    const scan = scanSourceForMagicImports(path.join(workspaceRoot, sourceRoot));

    return {
        importedPackages: scan.packages,
        installedPackages,
        nodeModulesPresent,
        scannedSourceFiles: scan.scannedFiles,
        sourceScanTruncated: scan.truncated,
        installedAngularCoreVersion: typeof angularCorePackageJson?.version === 'string' ? angularCorePackageJson.version : undefined,
        installedMagicAngularVersion: typeof magicAngularPackageJson?.version === 'string' ? magicAngularPackageJson.version : undefined,
        magicAngularAngularCorePeerRange: typeof peerRange === 'string' ? peerRange : undefined
    };
}

/**
 * Report-only dependency rules for Magic xpa projects. These are version independent on purpose:
 * they describe how `@magic-xpa/*` must be declared, not which Magic version you should be on.
 */
export function analyzeMagicDependencies(packageJson: any, context: MagicDependencyContext): AngularSetupFinding[] {
    const findings: AngularSetupFinding[] = [];
    const add = (severity: AngularSetupSeverity, title: string, details?: string) => findings.push({ severity, title, details });

    const entries = collectMagicDependencyEntries(packageJson);
    if (entries.length === 0) {
        if (context.importedPackages.length > 0) {
            add(
                'warning',
                'Project source imports `@magic-xpa/*` packages, but package.json declares none.',
                `Imported: ${context.importedPackages.join(', ')}\nAdd these to \`dependencies\` with an exact version, so the build does not depend on a transitively installed copy.`
            );
        } else {
            add('info', 'No `@magic-xpa/*` dependencies were found.', 'The Magic dependency checks were skipped for this project.');
        }
        return findings;
    }

    const declaredNames = new Set(entries.map((entry) => entry.name));
    const registryEntries = entries.filter((entry) => isRegistryRangeSpec(entry.spec));
    const nonRegistryEntries = entries.filter((entry) => !isRegistryRangeSpec(entry.spec));

    // Rule 1 — one version for the whole @magic-xpa scope.
    const versionsBySpec = new Map<string, MagicDependencyEntry[]>();
    for (const entry of registryEntries) {
        const parsed = parseVersionCore(entry.spec.replace(/^[\^~>=< ]+/, ''));
        if (!parsed) { continue; }
        const key = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
        versionsBySpec.set(key, [...(versionsBySpec.get(key) ?? []), entry]);
    }
    if (versionsBySpec.size > 1) {
        add(
            'error',
            'The `@magic-xpa/*` packages are not all on the same version.',
            `${entries.map((entry) => `${entry.name}: ${entry.spec} (${entry.location})`).join('\n')}\n\nMagic packages peer on each other exactly, so a mixed set can break at runtime. Put every \`@magic-xpa/*\` entry on the same version.`
        );
    } else if (versionsBySpec.size === 1) {
        const [version] = [...versionsBySpec.keys()];
        add('success', `All ${declaredNames.size} \`@magic-xpa/*\` package(s) are on version ${version}.`);
    }
    if (nonRegistryEntries.length > 0) {
        add(
            'info',
            'Some `@magic-xpa/*` entries do not use a registry version.',
            `${nonRegistryEntries.map((entry) => `${entry.name}: ${entry.spec}`).join('\n')}\nThese were skipped by the version and pinning checks.`
        );
    }

    // Rule 2 — exact pins only, no ^ or ~.
    const rangedEntries = registryEntries.filter((entry) => !isExactVersionSpec(entry.spec));
    if (rangedEntries.length > 0) {
        add(
            'warning',
            'Some `@magic-xpa/*` versions are not pinned exactly.',
            `${rangedEntries.map((entry) => `${entry.name}: ${entry.spec} (${entry.location})`).join('\n')}\n\nA range can silently cross a Magic release that requires a different Angular major. Remove the \`^\` or \`~\` and pin the exact version.`
        );
    } else if (registryEntries.length > 0) {
        add('success', 'All `@magic-xpa/*` versions are pinned exactly.');
    }

    // Rule 3 — the CLI belongs in devDependencies only.
    const cliName = `${MAGIC_SCOPE}/cli`;
    const cliInDependencies = entries.some((entry) => entry.name === cliName && entry.location === 'dependencies');
    const cliInDevDependencies = entries.some((entry) => entry.name === cliName && entry.location === 'devDependencies');
    if (cliInDependencies && cliInDevDependencies) {
        add(
            'warning',
            '`@magic-xpa/cli` is declared in both `dependencies` and `devDependencies`.',
            'Which entry wins depends on the package manager. Keep the `devDependencies` entry and remove the one in `dependencies`.'
        );
    } else if (cliInDependencies) {
        add(
            'warning',
            '`@magic-xpa/cli` is declared in `dependencies`.',
            'The CLI is a build-time tool. Move it to `devDependencies` so it is not shipped as a runtime dependency.'
        );
    } else if (cliInDevDependencies) {
        add('success', '`@magic-xpa/cli` is declared in `devDependencies` only.');
    }

    // Rule 4 — imported packages must be declared, not resolved transitively.
    if (context.scannedSourceFiles === 0) {
        add('info', 'No source files were scanned for `@magic-xpa/*` imports.', 'The configured source root contains no `.ts` or `.html` files.');
    } else {
        const undeclaredImports = context.importedPackages.filter((name) => !declaredNames.has(name));
        const scanNote = context.sourceScanTruncated
            ? `\n\nOnly the first ${SOURCE_SCAN_FILE_LIMIT} source files were scanned, so this list may be incomplete.`
            : '';
        if (undeclaredImports.length > 0) {
            const lines = undeclaredImports.map((name) => `${name}${context.installedPackages.includes(name) ? ' (resolves transitively from node_modules)' : ' (not installed)'}`);
            add(
                'warning',
                `${undeclaredImports.length} imported \`@magic-xpa/*\` package(s) are not declared in package.json.`,
                `${lines.join('\n')}\n\nAdd them to \`dependencies\` with the same exact version as the other Magic packages. A transitive copy can disappear or change version on the next install.${scanNote}`
            );
        } else {
            add('success', 'Every imported `@magic-xpa/*` package is declared in package.json.', context.sourceScanTruncated ? scanNote.trim() : undefined);
        }
    }

    // Rule 5 — the installed Angular must satisfy what the installed Magic peers on.
    if (!context.nodeModulesPresent) {
        add('info', 'The Angular peer requirement of `@magic-xpa/angular` could not be checked.', 'No `node_modules` folder was found. Run `npm install` and run this check again.');
    } else if (!context.magicAngularAngularCorePeerRange || !context.installedAngularCoreVersion) {
        add(
            'info',
            'The Angular peer requirement of `@magic-xpa/angular` could not be checked.',
            'Either `@magic-xpa/angular` or `@angular/core` was not found in `node_modules`, or it does not declare a peer range for `@angular/core`.'
        );
    } else {
        const installedMagicAngular = context.installedMagicAngularVersion ?? 'unknown version';
        const satisfies = satisfiesRange(context.installedAngularCoreVersion, context.magicAngularAngularCorePeerRange);
        if (satisfies === true) {
            add('success', `Installed \`@angular/core\` ${context.installedAngularCoreVersion} matches the peer range \`${context.magicAngularAngularCorePeerRange}\` of \`@magic-xpa/angular\` ${installedMagicAngular}.`);
        } else if (satisfies === false) {
            add(
                'error',
                `Installed \`@angular/core\` ${context.installedAngularCoreVersion} does not satisfy the peer range \`${context.magicAngularAngularCorePeerRange}\` of \`@magic-xpa/angular\` ${installedMagicAngular}.`,
                'Magic releases can move to a new Angular major. Either pin `@magic-xpa/*` back to a version that peers on your Angular, or upgrade Angular to the required major first.'
            );
        } else {
            add('info', `The peer range \`${context.magicAngularAngularCorePeerRange}\` of \`@magic-xpa/angular\` could not be compared with \`@angular/core\` ${context.installedAngularCoreVersion}.`, 'Check this combination by hand.');
        }
    }

    add(
        'info',
        'These checks only read package.json and node_modules.',
        'Magic-generated files carry no version stamp, so this report cannot tell which Magic Studio version generated the code in this project. Changing `@magic-xpa/*` versions without regenerating from the matching Studio version stays your own risk.'
    );

    return findings;
}
