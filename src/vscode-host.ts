import * as vscode from 'vscode';
import type { Host } from './host';

/** The extension's host: the first workspace folder, VS Code's `wizly.*` settings, notifications. */
export const vscodeHost: Host = {
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    getSetting: <T>(key: string, fallback?: T) =>
        fallback === undefined
            ? vscode.workspace.getConfiguration('wizly').get<T>(key)
            : vscode.workspace.getConfiguration('wizly').get<T>(key, fallback),
    showError: (m) => void vscode.window.showErrorMessage(m),
    showWarning: (m) => void vscode.window.showWarningMessage(m),
    showInfo: (m) => void vscode.window.showInformationMessage(m),
};
