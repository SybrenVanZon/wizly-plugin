import * as fs from 'fs';
import * as path from 'path';
import { getCachedSettings, getModes, refreshModes } from './config';
import { createCliHost, Message, SettingsSource } from './cli-host';
import { filesForRules, filesUnder, uncommittedFiles } from './file-selection';
import { host, setHost } from './host';
import { configDirFor, LEGACY_CONFIG_FILE } from './project-config';
import { transformText } from './transformer';

/**
 * Wizly without VS Code.
 *
 * Written to be driven by a person *and* by an agent. Every command is described once, in
 * `COMMANDS`, and that one description is what `wizly help`, `wizly commands --json` and the
 * generated Claude skill are made from — so what a tool reads about a command cannot drift from
 * what a person reads. Nothing here asks a question: a choice is a flag, `--check` shows what
 * would change without writing, and `--json` gives a result to parse instead of text to scrape.
 */

/** Exit codes, shared by every command. */
export const EXIT = {
    OK: 0,
    /** `--check` found files that would change. */
    CHANGES_PENDING: 1,
    /** A file could not be read or written, or a rule failed to render. */
    ERRORS: 2,
    /** The command line itself was wrong. */
    USAGE: 64,
} as const;

export const EXIT_CODE_MEANINGS: Record<number, string> = {
    [EXIT.OK]: 'success; with --check: nothing would change',
    [EXIT.CHANGES_PENDING]: '--check only: at least one file would change',
    [EXIT.ERRORS]: 'a file could not be read or written, or a rule reported an error',
    [EXIT.USAGE]: 'invalid command line',
};

export interface Io {
    out(text: string): void;
    err(text: string): void;
}

export interface OptionSpec {
    flag: string;
    /** The value's placeholder, for an option that takes one. */
    arg?: string;
    description: string;
}

export interface CommandSpec {
    name: string;
    summary: string;
    description: string;
    usage: string;
    arguments?: { name: string; description: string }[];
    options: OptionSpec[];
    /** Whether the command can change files in the project. */
    writesFiles: boolean;
    examples: { command: string; description: string }[];
    run(args: ParsedArgs, io: Io): Promise<number>;
}

export interface ParsedArgs {
    positional: string[];
    flags: Map<string, string | true>;
}

const GLOBAL_OPTIONS: OptionSpec[] = [
    { flag: '--root', arg: 'dir', description: 'Project root: where .wizly/ (or .vswizly/) and .vscode/ live. Default: the current directory.' },
    { flag: '--json', description: 'Print one JSON document instead of text.' },
    { flag: '--help', description: 'Show help for the command.' },
];

const TRANSFORM: CommandSpec = {
    name: 'transform',
    summary: "Apply Wizly's rules to Magic-generated files, as Transform Current File does in VS Code.",
    description: [
        'Runs the same pipeline as the editor command: the project rules from .wizly/wizly.rules.js',
        '(or the built-in defaults), template overrides from .wizly/templates/, settings from',
        '.wizly/wizly.config.js, and Prettier. Only files that an active rule applies to are',
        'considered (by default *.html). Files are rewritten in place unless --check is given.',
        'A directory is searched recursively, skipping node_modules, .git, dist, out, .angular and coverage.',
        'Commit before transforming: the result is meant to be reviewed as a diff.',
    ].join('\n'),
    usage: 'wizly transform [<path>...] [--uncommitted] [--check] [--json] [--root <dir>]',
    arguments: [{ name: 'path', description: 'A file or a directory. Relative paths are resolved against the current directory.' }],
    options: [
        { flag: '--uncommitted', description: 'Add every new or changed file git reports under the root — the files a Magic regeneration just wrote.' },
        { flag: '--check', description: 'Write nothing; list the files that would change and exit 1 if there are any.' },
        { flag: '--user-settings', arg: 'file', description: "Read this VS Code user settings file instead of plain VS Code's default." },
        { flag: '--no-user-settings', description: "Ignore the user's VS Code settings; use the project's and the defaults only. Use this in CI." },
    ],
    writesFiles: true,
    examples: [
        { command: 'wizly transform --uncommitted --check', description: 'After a Magic regeneration: which generated files would Wizly change?' },
        { command: 'wizly transform --uncommitted', description: 'Transform them.' },
        { command: 'wizly transform src/app/magic --check --json --no-user-settings', description: 'In CI: fail when a generated template was committed untransformed.' },
    ],
    run: runTransform,
};

const COMMANDS_COMMAND: CommandSpec = {
    name: 'commands',
    summary: 'List every command with its options, exit codes and examples.',
    description: 'The machine-readable description of this CLI. With --json it is the document an agent should read first.',
    usage: 'wizly commands [--json]',
    options: [],
    writesFiles: false,
    examples: [{ command: 'wizly commands --json', description: 'Everything a tool needs to know to call Wizly.' }],
    run: async (args, io) => {
        if (args.flags.has('--json')) {
            io.out(JSON.stringify(describeCommands(), null, 2));
        } else {
            for (const c of COMMANDS) {
                io.out(`${c.name.padEnd(12)} ${c.summary}`);
            }
            io.out('\nRun `wizly help <command>` for details.');
        }
        return EXIT.OK;
    },
};

const HELP_COMMAND: CommandSpec = {
    name: 'help',
    summary: 'Show help for a command.',
    description: 'Without a command name, lists the commands.',
    usage: 'wizly help [<command>]',
    arguments: [{ name: 'command', description: 'The command to describe.' }],
    options: [],
    writesFiles: false,
    examples: [{ command: 'wizly help transform', description: 'Options and exit codes of transform.' }],
    run: async (args, io) => {
        const name = args.positional[0];
        if (!name) {
            io.out(overview());
            return EXIT.OK;
        }
        const command = COMMANDS.find((c) => c.name === name);
        if (!command) {
            io.err(`Unknown command: ${name}\n\n${overview()}`);
            return EXIT.USAGE;
        }
        io.out(commandHelp(command));
        return EXIT.OK;
    },
};

const SKILL_TARGETS = ['claude', 'agents', 'all'] as const;

const SKILL_COMMAND: CommandSpec = {
    name: 'skill',
    summary: 'Write instructions that teach a coding agent when and how to use this CLI.',
    description: [
        'Generated from the same command descriptions as `wizly help`, so they are as current as the',
        'installed Wizly. Writes two things by default, because a project rarely knows which agents',
        'its people use: a Claude Code skill in .claude/skills/wizly/SKILL.md, and a marked block in',
        'AGENTS.md, which most other agents read (Codex, Copilot, Cursor, Gemini CLI and more) and',
        'Claude Code reads only when a project has no CLAUDE.md. --target claude or --target agents',
        'writes only one. Commit them and every teammate\'s agent knows Wizly; run it again after',
        'updating Wizly. A skill Wizly wrote is overwritten, a hand-written SKILL.md only with --force.',
        'In AGENTS.md, only the block between Wizly\'s own markers is ever touched.',
    ].join('\n'),
    usage: 'wizly skill [--target <claude|agents|all>] [--print] [--force] [--root <dir>]',
    options: [
        { flag: '--target', arg: 'claude|agents|all', description: 'Which instructions to write. Default: all — a project rarely knows which agents its people use.' },
        { flag: '--print', description: 'Print what would be written instead of writing it.' },
        { flag: '--force', description: 'Overwrite a SKILL.md that Wizly did not write.' },
    ],
    writesFiles: true,
    examples: [
        { command: 'wizly skill', description: 'Add or refresh both: the Claude Code skill and the AGENTS.md block.' },
        { command: 'wizly skill --target claude', description: 'Only the Claude Code skill, for a project that does not want an AGENTS.md.' },
        { command: 'wizly skill --target agents --print', description: 'See the block an agent reading AGENTS.md would get.' },
    ],
    run: runSkill,
};

export const COMMANDS: CommandSpec[] = [TRANSFORM, SKILL_COMMAND, COMMANDS_COMMAND, HELP_COMMAND];

// --- skill -----------------------------------------------------------------------------------

/** The first line of every skill this CLI writes, so it knows which files are its own. */
export const SKILL_MARKER = '<!-- Generated by `wizly skill`. Run it again after updating Wizly; edits here are overwritten. -->';

/**
 * The markers around Wizly's block in AGENTS.md. That file belongs to the project, so Wizly owns
 * only what sits between these two lines and never anything else in it.
 */
export const AGENTS_BEGIN = '<!-- wizly:begin — generated by `wizly skill`; run it again after updating Wizly. Edits between these markers are overwritten. -->';
export const AGENTS_END = '<!-- wizly:end -->';

async function runSkill(args: ParsedArgs, io: Io): Promise<number> {
    const target = stringFlag(args, '--target') ?? 'all';
    if (!(SKILL_TARGETS as readonly string[]).includes(target)) {
        io.err(`skill: --target must be one of ${SKILL_TARGETS.join(', ')}, not "${target}".`);
        return EXIT.USAGE;
    }
    const claude = target !== 'agents';
    const agents = target !== 'claude';

    if (args.flags.has('--print')) {
        if (claude) {
            io.out(renderSkill());
        }
        if (agents) {
            io.out(renderAgentsBlock());
        }
        return EXIT.OK;
    }

    // Every precondition first, so `--target all` never writes one file and then refuses the other.
    const root = path.resolve(stringFlag(args, '--root') ?? process.cwd());
    const writes: { file: string; text: string }[] = [];
    if (claude) {
        const file = path.join(root, '.claude', 'skills', 'wizly', 'SKILL.md');
        if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes(SKILL_MARKER) && !args.flags.has('--force')) {
            io.err(`skill: ${file} exists and was not written by Wizly. Use --force to overwrite it.`);
            return EXIT.ERRORS;
        }
        writes.push({ file, text: renderSkill() });
    }
    if (agents) {
        const file = path.join(root, 'AGENTS.md');
        const merged = mergeAgentsBlock(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, renderAgentsBlock());
        if (merged === null) {
            io.err(`skill: ${file} has Wizly's markers, but not exactly one begin followed by one end. Fix them by hand; nothing was written.`);
            return EXIT.ERRORS;
        }
        writes.push({ file, text: merged });
    }

    for (const w of writes) {
        fs.mkdirSync(path.dirname(w.file), { recursive: true });
        fs.writeFileSync(w.file, w.text, 'utf8');
    }
    if (args.flags.has('--json')) {
        io.out(JSON.stringify({ command: 'skill', target, written: writes.map((w) => w.file), exitCode: EXIT.OK }, null, 2));
    } else {
        for (const w of writes) {
            io.out(`wrote ${path.relative(root, w.file).replace(/\\/g, '/')}`);
        }
    }
    return EXIT.OK;
}

/**
 * Put Wizly's block into a project's AGENTS.md: replace the one between the markers, append one
 * when there is none, start the file when there is no file. `null` when the markers are broken —
 * a begin without an end, or more than one of either — because guessing there could eat the
 * project's own text.
 */
export function mergeAgentsBlock(existing: string | null, block: string): string | null {
    if (existing === null || existing.trim() === '') {
        return block + '\n';
    }
    const eol = existing.includes('\r\n') ? '\r\n' : '\n';
    const ownBlock = block.split('\n').join(eol);
    const begins = existing.split('<!-- wizly:begin').length - 1;
    const ends = existing.split(AGENTS_END).length - 1;
    if (begins === 0 && ends === 0) {
        return existing.replace(/\s*$/, '') + eol + eol + ownBlock + eol;
    }
    const start = existing.indexOf('<!-- wizly:begin');
    const end = existing.indexOf(AGENTS_END);
    if (begins !== 1 || ends !== 1 || end < start) {
        return null;
    }
    return existing.slice(0, start) + ownBlock + existing.slice(end + AGENTS_END.length);
}

/**
 * The Claude Code skill, from `COMMANDS`. Deliberately free of anything machine-specific — no
 * absolute path to this file — because a team commits it and every machine has Wizly in a
 * different place.
 */
export function renderSkill(): string {
    return [
        '---',
        'name: wizly',
        `description: ${WHEN_TO_USE}`,
        '---',
        '',
        SKILL_MARKER,
        '',
        ...skillBody(1),
    ].join('\n') + '\n';
}

/** The same instructions as a block for AGENTS.md, one heading level down to sit inside it. */
export function renderAgentsBlock(): string {
    return [AGENTS_BEGIN, '', ...skillBody(2), '', AGENTS_END].join('\n');
}

const WHEN_TO_USE = 'Post-process Magic xpa Web Client generated Angular templates with the Wizly CLI. Use after a Magic regeneration, when asked to apply or check Wizly\'s transformation, or when generated *.component.html files look untransformed (raw Magic markup next to transformed screens).';

function skillBody(level: number): string[] {
    const h = (n: number, text: string) => `${'#'.repeat(level + n)} ${text}`;
    const { version, commands, exitCodes } = describeCommands();
    const lines: string[] = [
        h(0, 'Wizly'),
        '',
        `Wizly (generated from version ${version}) rewrites the HTML that Magic xpa generates for its Angular Web Client, using the project's rules and templates. The command line runs exactly what the VS Code command \`Wizly: Transform Current File\` runs.`,
        '',
        `When to use it: ${WHEN_TO_USE.replace(/^[^.]*\. Use /, '')}`,
        '',
        h(1, 'Finding the CLI'),
        '',
        'It ships inside the VS Code extension. Use the newest `sybrenvanzon.wizly-*` folder:',
        '',
        '- Windows: `%USERPROFILE%\\.vscode\\extensions\\sybrenvanzon.wizly-<version>\\dist\\cli.js`',
        '- macOS / Linux: `~/.vscode/extensions/sybrenvanzon.wizly-<version>/dist/cli.js`',
        '',
        'Run it as `node <that path> <command>`. Below, `wizly` stands for that. If no such folder exists, Wizly is not installed: say so, do not improvise a transformation by hand.',
        '',
        h(1, 'How to work with it'),
        '',
        '1. Make sure the working tree is committed, or tell the user what is uncommitted. The result is reviewed as a diff.',
        '2. Preview first: `wizly transform <paths> --check --json` (or `--uncommitted` right after a Magic regeneration). Exit code 1 means files would change.',
        '3. Transform: the same command without `--check`. Then show the user `git diff --stat` for what changed.',
        '4. Report any file with status `error` and its messages. Do not hand-edit generated files to work around a rule; rules and templates live in `.wizly/` (or `.vswizly/` in older projects) and changing them is the user\'s call.',
        '',
        'Always pass `--json` when you will read the result, and `--no-user-settings` when the result must not depend on this machine. Run `wizly commands --json` if anything below seems out of date.',
        '',
        h(1, 'Commands'),
    ];
    for (const c of commands) {
        lines.push('', h(2, `\`wizly ${c.name}\``), '', c.summary, '', '```', c.usage, '```', '', c.description.replace(/\n/g, ' '));
        if (c.options.length) {
            lines.push('');
            for (const o of c.options) {
                lines.push(`- \`${optionLabel(o)}\` — ${o.description}`);
            }
        }
        lines.push('', `Writes files: ${c.writesFiles ? 'yes' : 'no'}.`);
        if (c.examples.length) {
            lines.push('', 'Examples:', '');
            for (const e of c.examples) {
                lines.push(`- \`${e.command}\` — ${e.description}`);
            }
        }
    }
    lines.push('', h(1, 'Options for every command'), '');
    for (const o of GLOBAL_OPTIONS) {
        lines.push(`- \`${optionLabel(o)}\` — ${o.description}`);
    }
    lines.push('', h(1, 'Exit codes'), '');
    for (const [code, meaning] of Object.entries(exitCodes)) {
        lines.push(`- \`${code}\` — ${meaning}`);
    }
    return lines;
}

// --- transform -------------------------------------------------------------------------------

interface FileResult {
    path: string;
    status: 'changed' | 'unchanged' | 'error';
    messages: Message[];
}

async function runTransform(args: ParsedArgs, io: Io): Promise<number> {
    const root = path.resolve(stringFlag(args, '--root') ?? process.cwd());
    const check = args.flags.has('--check');
    const json = args.flags.has('--json');
    const uncommitted = args.flags.has('--uncommitted');

    if (args.positional.length === 0 && !uncommitted) {
        io.err('transform: give at least one path, or --uncommitted.\n\n' + commandHelp(TRANSFORM));
        return EXIT.USAGE;
    }
    if (!fs.existsSync(root)) {
        io.err(`transform: root does not exist: ${root}`);
        return EXIT.USAGE;
    }

    const userSettings = args.flags.has('--no-user-settings') ? false : stringFlag(args, '--user-settings');
    const { host: cliHost, sources, messages } = createCliHost({ root, extensionRoot: extensionRoot(), userSettings });
    const previous = host();
    setHost(cliHost);
    refreshModes();
    try {
        const candidates = new Set<string>();
        const problems: string[] = [];
        for (const p of args.positional) {
            const abs = path.resolve(p);
            if (!fs.existsSync(abs)) {
                problems.push(`not found: ${p}`);
                continue;
            }
            for (const f of filesUnder(abs)) {
                candidates.add(f);
            }
        }
        if (uncommitted) {
            try {
                for (const f of uncommittedFiles(root)) {
                    candidates.add(f);
                }
            } catch (err) {
                problems.push(`--uncommitted: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const files = filesForRules([...candidates], getModes()).sort();
        const project = projectSources(root);
        const settingsSources = [project.settings, ...sources];
        const results: FileResult[] = [];
        for (const file of files) {
            const rel = path.relative(root, file).replace(/\\/g, '/');
            messages.length = 0;
            try {
                const before = fs.readFileSync(file, 'utf8');
                const after = await transformText(before, file);
                const changed = after !== before;
                if (changed && !check) {
                    fs.writeFileSync(file, after, 'utf8');
                }
                const fileMessages = [...messages];
                const failed = fileMessages.some((m) => m.level === 'error');
                results.push({ path: rel, status: failed ? 'error' : changed ? 'changed' : 'unchanged', messages: fileMessages });
            } catch (err) {
                results.push({ path: rel, status: 'error', messages: [...messages, { level: 'error', text: err instanceof Error ? err.message : String(err) }] });
            }
        }

        const changed = results.filter((r) => r.status === 'changed').length;
        const errors = results.filter((r) => r.status === 'error').length + problems.length;
        const code = errors > 0 ? EXIT.ERRORS : check && changed > 0 ? EXIT.CHANGES_PENDING : EXIT.OK;

        if (json) {
            io.out(JSON.stringify({
                command: 'transform',
                root,
                configDir: configDirFor(root),
                check,
                settingsSources,
                rules: project.rules,
                problems,
                files: results,
                summary: { files: results.length, changed, unchanged: results.length - changed - results.filter((r) => r.status === 'error').length, errors },
                exitCode: code,
            }, null, 2));
        } else {
            for (const p of problems) {
                io.err(`error: ${p}`);
            }
            for (const r of results) {
                if (r.status !== 'unchanged' || r.messages.length) {
                    io.out(`${r.status === 'changed' ? (check ? 'would change' : 'changed') : r.status}: ${r.path}`);
                }
                for (const m of r.messages) {
                    io.out(`    ${m.level}: ${firstLine(m.text)}`);
                }
            }
            io.out(`${results.length} files, ${changed} ${check ? 'would change' : 'changed'}, ${errors} errors`);
            const rel = (p: string) => path.relative(root, p).replace(/\\/g, '/') || '.';
            io.out(`settings: ${settingsSources.filter((s) => s.used).map((s) => s.kind).join(' > ')}`);
            io.out(`rules: ${project.rules.source === 'built-in' ? 'built-in' : rel(project.rules.path)}, config folder: ${rel(configDirFor(root))}`);
        }
        return code;
    } finally {
        setHost(previous);
        refreshModes();
    }
}

/**
 * What `config.ts` took from the project itself, in the order it looks: the config folder's
 * `wizly.config.js` and `wizly.rules.js`, else the legacy root `.vswizly.js`. Settings count as
 * used only when `config.ts` actually loaded some, so a file that sets nothing is not reported as
 * a source. Call after `getModes()`, which is what loads them.
 */
function projectSources(root: string): {
    settings: SettingsSource;
    rules: { source: 'project' | 'legacy' | 'built-in'; path: string };
} {
    const dir = configDirFor(root);
    const configFile = path.join(dir, 'wizly.config.js');
    const rulesFile = path.join(dir, 'wizly.rules.js');
    const legacyFile = path.join(root, LEGACY_CONFIG_FILE);
    const settingsFile = fs.existsSync(configFile) ? configFile : legacyFile;
    const loaded = getCachedSettings() !== null;
    const settings: SettingsSource = {
        kind: 'project',
        path: settingsFile,
        used: loaded,
        note: loaded ? 'overrides every source below' : fs.existsSync(settingsFile) ? 'sets no wizly setting' : 'not found',
    };
    const rules = fs.existsSync(rulesFile)
        ? { source: 'project' as const, path: rulesFile }
        : fs.existsSync(legacyFile)
          ? { source: 'legacy' as const, path: legacyFile }
          : { source: 'built-in' as const, path: path.join(extensionRoot(), 'default.rules.js') };
    return { settings, rules };
}

// --- help ------------------------------------------------------------------------------------

/** The registry without the functions — what `commands --json` prints and the skill is made from. */
export function describeCommands() {
    return {
        name: 'wizly',
        version: packageVersion(),
        globalOptions: GLOBAL_OPTIONS,
        exitCodes: EXIT_CODE_MEANINGS,
        commands: COMMANDS.map(({ run: _run, ...spec }) => spec),
    };
}

function overview(): string {
    const lines = [`wizly ${packageVersion()} — Magic xpa Web Client post-processing, outside VS Code`, '', 'Commands:'];
    for (const c of COMMANDS) {
        lines.push(`  ${c.name.padEnd(12)} ${c.summary}`);
    }
    lines.push('', 'Global options:');
    for (const o of GLOBAL_OPTIONS) {
        lines.push(`  ${optionLabel(o).padEnd(18)} ${o.description}`);
    }
    lines.push('', 'Run `wizly help <command>` for details, or `wizly commands --json` for all of it as JSON.');
    return lines.join('\n');
}

export function commandHelp(c: CommandSpec): string {
    const lines = [`wizly ${c.name} — ${c.summary}`, '', `Usage: ${c.usage}`, '', c.description];
    if (c.arguments?.length) {
        lines.push('', 'Arguments:');
        for (const a of c.arguments) {
            lines.push(`  ${`<${a.name}>`.padEnd(22)} ${a.description}`);
        }
    }
    const options = [...c.options, ...GLOBAL_OPTIONS];
    lines.push('', 'Options:');
    for (const o of options) {
        lines.push(`  ${optionLabel(o).padEnd(22)} ${o.description}`);
    }
    lines.push('', `Writes files: ${c.writesFiles ? 'yes' : 'no'}`, '', 'Exit codes:');
    for (const [code, meaning] of Object.entries(EXIT_CODE_MEANINGS)) {
        lines.push(`  ${code.padEnd(4)} ${meaning}`);
    }
    if (c.examples.length) {
        lines.push('', 'Examples:');
        for (const e of c.examples) {
            lines.push(`  ${e.command}`, `      ${e.description}`);
        }
    }
    return lines.join('\n');
}

function optionLabel(o: OptionSpec): string {
    return o.arg ? `${o.flag} <${o.arg}>` : o.flag;
}

// --- plumbing --------------------------------------------------------------------------------

const VALUE_FLAGS = new Set(['--root', '--user-settings', '--target']);

export function parseArgs(argv: string[]): ParsedArgs | string {
    const positional: string[] = [];
    const flags = new Map<string, string | true>();
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const [flag, inline] = a.split(/=(.*)/s, 2);
            if (VALUE_FLAGS.has(flag)) {
                const value = inline ?? argv[++i];
                if (value === undefined) {
                    return `${flag} needs a value`;
                }
                flags.set(flag, value);
            } else {
                flags.set(flag, true);
            }
        } else if (a === '-h') {
            flags.set('--help', true);
        } else {
            positional.push(a);
        }
    }
    return { positional, flags };
}

function stringFlag(args: ParsedArgs, flag: string): string | undefined {
    const v = args.flags.get(flag);
    return typeof v === 'string' ? v : undefined;
}

/** The extension's own folder: `templates/`, `default.rules.js` and `package.json` live here. */
function extensionRoot(): string {
    return path.join(__dirname, '..');
}

function packageVersion(): string {
    try {
        return JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8')).version;
    } catch {
        return 'unknown';
    }
}

function firstLine(text: string): string {
    return text.split('\n')[0];
}

const stdio: Io = {
    out: (t) => process.stdout.write(t + '\n'),
    err: (t) => process.stderr.write(t + '\n'),
};

export async function main(argv: string[], io: Io = stdio): Promise<number> {
    const parsed = parseArgs(argv);
    if (typeof parsed === 'string') {
        io.err(parsed);
        return EXIT.USAGE;
    }
    if (parsed.flags.has('--version')) {
        io.out(packageVersion());
        return EXIT.OK;
    }
    const [name, ...rest] = parsed.positional;
    if (!name) {
        io.out(overview());
        return parsed.flags.has('--help') ? EXIT.OK : EXIT.USAGE;
    }
    const command = COMMANDS.find((c) => c.name === name);
    if (!command) {
        io.err(`Unknown command: ${name}\n\n${overview()}`);
        return EXIT.USAGE;
    }
    if (parsed.flags.has('--help')) {
        io.out(commandHelp(command));
        return EXIT.OK;
    }
    const known = new Set([...command.options, ...GLOBAL_OPTIONS].map((o) => o.flag).concat('--version'));
    const unknown = [...parsed.flags.keys()].filter((f) => !known.has(f));
    if (unknown.length) {
        io.err(`${command.name}: unknown option ${unknown.join(', ')}\n\n${commandHelp(command)}`);
        return EXIT.USAGE;
    }
    return command.run({ positional: rest, flags: parsed.flags }, io);
}

if (require.main === module) {
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (err) => {
            process.stderr.write(`wizly: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
            process.exit(EXIT.ERRORS);
        },
    );
}
