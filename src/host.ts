/**
 * What the transformation needs from whatever runs it, and nothing more.
 *
 * The transformer, the config loader and the template resolver used to import `vscode` for three
 * things: the workspace folder, a `wizly.*` setting, and a message to the user. Behind this
 * interface they run anywhere — in the extension (`vscode-host.ts`), in the CLI (`cli.ts`), and in
 * the tests, without stubbing a module.
 */
export interface Host {
    /** The project root: where `.wizly/` (or `.vswizly/`) and the Angular workspace live. */
    workspaceRoot(): string | undefined;
    /** A `wizly.*` setting by its key without the prefix, e.g. `transformTag.enable`. */
    getSetting<T>(key: string, fallback?: T): T | undefined;
    showError(message: string): void;
    showWarning(message: string): void;
    showInfo(message: string): void;
}

/** No workspace, every setting at its fallback, messages to the console. */
export const consoleHost: Host = {
    workspaceRoot: () => undefined,
    getSetting: <T>(_key: string, fallback?: T) => fallback,
    showError: (m) => console.error(m),
    showWarning: (m) => console.warn(m),
    showInfo: (m) => console.log(m),
};

let current: Host = consoleHost;

export function setHost(next: Host): void {
    current = next;
}

export function host(): Host {
    return current;
}
