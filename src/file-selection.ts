import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { Mode } from './config';
import { matchesFilePattern } from './utils';

/**
 * Which files a transform run looks at. Shared by the CLI and `Transform All Uncommitted Files`,
 * so the two pick the same files.
 */

/** The file patterns of every active rule — what decides whether a file is Wizly's to touch. */
export function activeFilePatterns(modes: Mode[]): string[] {
    const patterns = new Set<string>();
    for (const mode of modes) {
        if (!mode.active) {
            continue;
        }
        for (const rule of mode.rules) {
            if (rule.active && rule.filePattern) {
                patterns.add(rule.filePattern);
            }
        }
    }
    return [...patterns];
}

/** Keep the files at least one active rule applies to. */
export function filesForRules(files: string[], modes: Mode[]): string[] {
    const patterns = activeFilePatterns(modes);
    return files.filter((f) => patterns.some((p) => matchesFilePattern(f, p)));
}

const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.angular', 'coverage']);

/** A file, or every file below a directory, skipping build output and dependencies. */
export function filesUnder(target: string): string[] {
    if (fs.statSync(target).isFile()) {
        return [target];
    }
    const out: string[] = [];
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!SKIPPED_DIRS.has(entry.name)) {
                out.push(...filesUnder(path.join(target, entry.name)));
            }
        } else if (entry.isFile()) {
            out.push(path.join(target, entry.name));
        }
    }
    return out;
}

/**
 * New and changed files under `root`, as git reports them.
 *
 * Asks git rather than looking for `.git` in the root, so a project whose repository starts
 * higher up works too — a Magic project and its Angular app are often one repository. And lists
 * the files inside a new directory one by one, where `git status` reports the directory: a
 * regenerated program is usually exactly that. Throws when `root` is not inside a git work tree.
 */
export function uncommittedFiles(root: string): string[] {
    const git = (...args: string[]) =>
        execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    try {
        git('rev-parse', '--is-inside-work-tree');
    } catch {
        throw new Error(`not a git repository: ${root}`);
    }
    let changed: string[] = [];
    try {
        changed = git('diff', '--name-only', '--relative', 'HEAD').split('\n');
    } catch {
        // No commit yet: everything is untracked, which the next call lists.
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').split('\n');
    return [...new Set([...changed, ...untracked].map((f) => f.trim()).filter(Boolean))]
        .map((f) => path.join(root, f))
        .filter((f) => fs.existsSync(f) && fs.statSync(f).isFile());
}
