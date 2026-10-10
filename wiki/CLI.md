# Command Line (CLI)

Wizly's transformation also runs outside VS Code: in a terminal, in CI, or driven by an AI agent. It is the same pipeline as `Wizly: Transform Current File` — the same rules, templates, project settings and Prettier — so a file transformed on the command line comes out exactly as it would in the editor.

## Running It

The CLI ships inside the extension, as `dist/cli.js`, and runs on Node.js (tested with Node 22). It is not on npm yet.

From an installed extension (Windows shown; the folder name carries the installed version):

```bash
node "%USERPROFILE%\.vscode\extensions\sybrenvanzon.wizly-0.7.0\dist\cli.js" help
```

On macOS and Linux the folder is `~/.vscode/extensions/sybrenvanzon.wizly-0.7.0/`.

From a clone of this repository, after `npm install` and `npm run compile`:

```bash
node dist/cli.js help
```

The examples below write `wizly` for whichever of these you use.

## Commands

| Command | What it does | Writes files |
| --- | --- | --- |
| `wizly transform` | Applies the rules to files, as `Transform Current File` does | yes |
| `wizly skill` | Writes a Claude Code skill for this project, so an agent knows when and how to use Wizly | yes |
| `wizly commands` | Lists every command; with `--json`, everything a tool needs to call them | no |
| `wizly help [<command>]` | Shows the help of a command | no |

`wizly --version` prints the version.

### `wizly transform`

```bash
wizly transform [<path>...] [--uncommitted] [--check] [--json] [--root <dir>]
```

- `<path>` — a file or a directory. A directory is searched recursively, skipping `node_modules`, `.git`, `dist`, `out`, `.angular` and `coverage`.
- `--uncommitted` — adds every new or changed file that git reports under the root: the files a Magic regeneration just wrote. Works when the git repository starts above the Angular project, and lists the files inside a new folder one by one.
- `--check` — writes nothing. Lists the files that would change and exits with `1` if there are any.
- `--json` — prints one JSON document: every file with its status (`changed`, `unchanged`, `error`) and messages, the settings sources used, and a summary.
- `--root <dir>` — the project root, where `.wizly/` and `.vscode/` live. Default: the current directory.
- `--no-user-settings` — ignores your personal VS Code settings. Use this in CI.
- `--user-settings <file>` — reads another VS Code user settings file, for example from VS Code Insiders or a profile.

Only files that an active rule applies to are transformed (by default `*.html`), so pointing it at a whole folder is safe.

Commit before you transform: the result is meant to be reviewed as a diff.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success. With `--check`: nothing would change |
| `1` | `--check` only: at least one file would change |
| `2` | A file could not be read or written, or a rule reported an error |
| `64` | Invalid command line |

## Settings

The CLI resolves settings the way VS Code does, from the same files:

1. `.wizly/wizly.config.js` (or `.vswizly/wizly.config.js` in an existing project) — the project config, wins over everything below
2. `.vscode/settings.json` in the project — `wizly.*` entries; comments and trailing commas are fine
3. Your VS Code user settings — `wizly.*` entries in plain VS Code's `settings.json`
4. The defaults declared by the extension

Every run reports which of these it used (`settings:` in the text output, `settingsSources` in `--json`).

**Put anything the whole team relies on in `.wizly/wizly.config.js`.** It is the only source that is the same on every machine and in CI. Personal VS Code settings are read for convenience, but the CLI cannot tell which editor flavour or profile you use, and CI never has them.

## In CI

Fail the build when a generated file was committed without being transformed:

```bash
wizly transform src/app/magic --check --no-user-settings
```

Exit code `1` means at least one file would still change.

## With an AI Agent

The CLI is written to be called by tools as well as people:

- `wizly commands --json` describes every command — options, whether it writes files, exit codes and examples — from the same source as `wizly help`, so the two cannot disagree.
- `--json` output can be parsed instead of read.
- Nothing asks a question. Choices are flags, and `--check` previews without writing.

A typical agent flow after a Magic regeneration: `wizly transform --uncommitted --check --json`, review the listed files, then `wizly transform --uncommitted`.

### A Skill for Claude Code

```bash
wizly skill
```

writes `.claude/skills/wizly/SKILL.md` in the project. Claude Code reads it and from then on knows when to reach for Wizly — after a Magic regeneration, or when generated templates look untransformed — how to find the CLI, and to preview with `--check` before it writes. The skill is generated from the same command descriptions as `wizly help`, so it describes the Wizly you have installed.

- Commit it: every teammate's agent gets it. It contains no machine-specific path.
- Run `wizly skill` again after updating Wizly. It overwrites a skill it wrote itself, and refuses to overwrite a hand-written `SKILL.md` unless you pass `--force`.
- `wizly skill --print` shows the skill without writing it.

## Related Pages

- [Getting Started](./Getting-Started.md)
- [Commands](./Commands.md)
