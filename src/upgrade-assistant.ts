import * as fs from 'fs';
import * as path from 'path';
import { analyzeAngularSetup, AngularSetupReport } from './angular-check';

export type UpgradeAssistantActionId =
    | 'patchSettings'
    | 'patchTemplates'
    | 'patchRules'
    | 'checkAngularSetup';

export type UpgradeAssistantAction = {
    id: UpgradeAssistantActionId;
    title: string;
    description: string;
    reason: string;
};

export type UpgradeAssistantReport = {
    workspaceRoot: string;
    hasExportedSettings: boolean;
    hasExportedTemplates: boolean;
    hasExportedRules: boolean;
    angularWorkspaces: Array<{
        workspaceRoot: string;
        projectNames: string[];
        report?: AngularSetupReport;
    }>;
    recommendedActions: UpgradeAssistantAction[];
};

function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}

function readJsonSafe<T>(filePath: string): T | undefined {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    } catch {
        return undefined;
    }
}

function findFilesRecursive(root: string, targetFileName: string, skip = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.vs', '.vscode'])): string[] {
    const found: string[] = [];
    if (!fs.existsSync(root)) { return found; }
    const walk = (dirPath: string) => {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (skip.has(entry.name)) { continue; }
                walk(path.join(dirPath, entry.name));
            } else if (entry.name === targetFileName) {
                found.push(path.join(dirPath, entry.name));
            }
        }
    };
    walk(root);
    return found;
}

function getApplicationProjectNames(angularJson: any): string[] {
    const projects = angularJson?.projects && typeof angularJson.projects === 'object' ? angularJson.projects : {};
    return Object.keys(projects).filter((name) => {
        const proj = projects[name];
        if (!proj || typeof proj !== 'object') { return false; }
        if (proj.projectType === 'application') { return true; }
        const targets = (proj.targets && typeof proj.targets === 'object') ? proj.targets : proj.architect;
        const build = targets?.build;
        const builder = build?.builder ?? build?.executor;
        return typeof builder === 'string' && (builder.includes(':application') || builder.includes(':browser') || builder.includes('application') || builder.includes('browser'));
    });
}

export function analyzeUpgradeAssistant(workspaceRoot: string): UpgradeAssistantReport {
    const configDir = path.join(workspaceRoot, '.vswizly');
    const exportedSettingsPath = path.join(configDir, 'wizly.config.js');
    const exportedTemplatesDir = path.join(configDir, 'templates');
    const exportedRulesPath = path.join(configDir, 'wizly.rules.js');

    const angularJsonFiles = findFilesRecursive(workspaceRoot, 'angular.json');
    const angularWorkspaces = angularJsonFiles.map((angularJsonPath) => {
        const angularWorkspaceRoot = path.dirname(angularJsonPath);
        const angularJson = readJsonSafe<any>(angularJsonPath);
        const packageJson = readJsonSafe<any>(path.join(angularWorkspaceRoot, 'package.json'));
        const projectNames = angularJson ? getApplicationProjectNames(angularJson) : [];
        const defaultProjectName = angularJson && typeof angularJson.defaultProject === 'string' ? angularJson.defaultProject : undefined;
        const chosenProjectName = defaultProjectName && projectNames.includes(defaultProjectName)
            ? defaultProjectName
            : projectNames[0];
        const report = angularJson && packageJson && chosenProjectName
            ? analyzeAngularSetup(angularWorkspaceRoot, angularJson, packageJson, chosenProjectName)
            : undefined;
        return {
            workspaceRoot: angularWorkspaceRoot,
            projectNames,
            report
        };
    });

    const recommendedActions: UpgradeAssistantAction[] = [];
    if (fs.existsSync(exportedSettingsPath)) {
        recommendedActions.push({
            id: 'patchSettings',
            title: 'Patch Settings',
            description: 'Compare `.vswizly/wizly.config.js` with the current built-in defaults',
            reason: 'Exported settings were found, so new Wizly keys can be reviewed after an update.'
        });
    }
    if (fs.existsSync(exportedTemplatesDir)) {
        recommendedActions.push({
            id: 'patchTemplates',
            title: 'Patch Templates',
            description: 'Review built-in template changes against your exported templates',
            reason: 'Exported templates were found in `.vswizly/templates`.'
        });
    }
    if (fs.existsSync(exportedRulesPath)) {
        recommendedActions.push({
            id: 'patchRules',
            title: 'Patch Rules',
            description: 'Compare your exported rules with the current default rules',
            reason: 'An exported `wizly.rules.js` file was found.'
        });
    }
    if (angularWorkspaces.length > 0) {
        recommendedActions.push({
            id: 'checkAngularSetup',
            title: 'Check Angular Setup',
            description: 'Run the Angular setup report for SCSS, themes, runtime settings, PWA and shared modules',
            reason: 'An Angular workspace was found and may need a quick consistency check after the upgrade.'
        });
    }

    return {
        workspaceRoot,
        hasExportedSettings: fs.existsSync(exportedSettingsPath),
        hasExportedTemplates: fs.existsSync(exportedTemplatesDir),
        hasExportedRules: fs.existsSync(exportedRulesPath),
        angularWorkspaces,
        recommendedActions
    };
}

export function renderUpgradeAssistantReportMarkdown(report: UpgradeAssistantReport): string {
    const lines: string[] = [];
    lines.push('# Wizly Upgrade Assistant');
    lines.push('');
    lines.push(`- Workspace: \`${normalizePath(report.workspaceRoot)}\``);
    lines.push(`- Exported settings found: ${report.hasExportedSettings ? 'yes' : 'no'}`);
    lines.push(`- Exported templates found: ${report.hasExportedTemplates ? 'yes' : 'no'}`);
    lines.push(`- Exported rules found: ${report.hasExportedRules ? 'yes' : 'no'}`);
    lines.push(`- Angular workspace(s) found: ${report.angularWorkspaces.length}`);
    lines.push('');
    lines.push('## Recommended Actions');
    lines.push('');
    if (report.recommendedActions.length === 0) {
        lines.push('- No specific upgrade actions were detected automatically.');
        lines.push('- If you still want to review the project, run `Wizly: Check Angular Setup` or the patch commands directly.');
    } else {
        for (const action of report.recommendedActions) {
            lines.push(`- **${action.title}**: ${action.description}`);
            lines.push(`  ${action.reason}`);
        }
    }
    lines.push('');

    if (report.angularWorkspaces.length > 0) {
        lines.push('## Angular Snapshot');
        lines.push('');
        for (const angularWorkspace of report.angularWorkspaces) {
            lines.push(`- Workspace: \`${normalizePath(angularWorkspace.workspaceRoot)}\``);
            if (angularWorkspace.projectNames.length > 0) {
                lines.push(`  App projects: ${angularWorkspace.projectNames.join(', ')}`);
            } else {
                lines.push('  No Angular application project was detected.');
            }
            if (angularWorkspace.report) {
                const errorCount = angularWorkspace.report.findings.filter((finding) => finding.severity === 'error').length;
                const warningCount = angularWorkspace.report.findings.filter((finding) => finding.severity === 'warning').length;
                lines.push(`  Quick summary: ${errorCount} error(s), ${warningCount} warning(s)`);
            }
        }
        lines.push('');
    }

    lines.push('## Suggested Upgrade Flow');
    lines.push('');
    lines.push('1. Run the relevant patch commands for any exported Wizly files you keep in the project.');
    lines.push('2. Run `Wizly: Check Angular Setup` if the project contains Angular output.');
    lines.push('3. Re-test the parts of the app that rely on templates, rules, themes, runtime settings, and shared modules.');
    lines.push('');
    return lines.join('\n');
}
