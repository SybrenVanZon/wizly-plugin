import * as fs from 'fs';
import * as path from 'path';

/** The project configuration folder for new projects. */
export const CONFIG_DIR = '.wizly';

/**
 * The folder every project used before 0.7.0. Still read, and still written to when it is the
 * one a project has: an existing project keeps working without moving anything, and its
 * configuration never ends up split over two folders.
 */
export const LEGACY_CONFIG_DIR = '.vswizly';

/** The single-file configuration from before the folder existed. Read only. */
export const LEGACY_CONFIG_FILE = '.vswizly.js';

/**
 * The configuration folder of a project, for reading and for writing.
 *
 * `.wizly/` when it exists, else `.vswizly/` when that exists, else `.wizly/` — so a new project
 * gets the new name and an existing one keeps the folder it has. The folder does not have to
 * exist yet; callers that write create it.
 */
export function configDirFor(root: string): string {
    const current = path.join(root, CONFIG_DIR);
    if (fs.existsSync(current)) {
        return current;
    }
    const legacy = path.join(root, LEGACY_CONFIG_DIR);
    if (fs.existsSync(legacy)) {
        return legacy;
    }
    return current;
}

/**
 * True when a project has both folders. Only `.wizly/` is read then, so anything still in
 * `.vswizly/` is silently ignored — worth telling the user about.
 */
export function hasIgnoredLegacyConfigDir(root: string): boolean {
    return fs.existsSync(path.join(root, CONFIG_DIR)) && fs.existsSync(path.join(root, LEGACY_CONFIG_DIR));
}
