# Patching Exported Files

When you install a new version of Wizly, the built-in templates, rules, and settings may have changed. If you have already exported any of these files to your project, the Wizly patch commands let you compare your local versions against the updated system defaults and selectively apply the changes you want to keep.

> **When to use this:** After upgrading Wizly and noticing that transforms behave differently, or when you want to pick up new features (new settings keys, new templates, updated rules) without losing your own customizations.

---

## Patch Templates

**Command:** `Wizly: Patch Templates`

Compares every `.ejs` file in your `.vswizly/templates/` folder against the current built-in templates.

### What it shows

| Status | Meaning |
|---|---|
| **New** | A template exists in the system but has not been exported to your project yet. |
| **Modified** | The system version differs from the file in your project. |

Files that are identical are not shown.

### How to use it

1. Open the command palette (`Ctrl+Shift+P`) and run `Wizly: Patch Templates`.
2. A list of changed templates appears. For each entry you can:
   - **Press Enter** — opens a diff editor (system version on the left, your version on the right).
   - **Add button** (new templates) — copies the system template into your project.
   - **View Diff button** (modified templates) — opens a diff editor so you can inspect what changed.
   - **Overwrite button** (modified templates) — replaces your version with the system version after a confirmation prompt.
3. In the diff editor you can manually copy individual lines from the system version (left) into your version (right) using VS Code's standard diff controls (the arrow icons in the gutter).

> **Tip:** If you have made significant customizations to a template, use **View Diff** rather than **Overwrite** so you can pick only the changes that are relevant to you.

---

## Patch Rules

**Command:** `Wizly: Patch Rules`

Compares your `.vswizly/wizly.rules.js` against the built-in `default.rules.js` by loading both files and matching rules by their `name` field.

### What it reports

| Category | Meaning |
|---|---|
| **New** | A rule exists in the system but not in your file. |
| **Modified** | A rule with the same name has a different definition in the system. |
| **Custom (yours only)** | A rule exists in your file but not in the system. These are rules you added yourself. |

### How to use it

1. Run `Wizly: Patch Rules` from the command palette.
2. A summary message appears listing the counts for each category.
3. Click **View Diff** to open the diff editor:
   - Left side: the current system `default.rules.js`
   - Right side: your `.vswizly/wizly.rules.js`
4. Copy the rules you want to adopt from left to right using the diff gutter arrows, or edit the file directly.

> **Custom rules are safe.** The diff only shows what is different. Rules you added yourself appear only on the right side, so they are not affected unless you explicitly delete them.

---

## Patch Settings

**Command:** `Wizly: Patch Settings`

Checks whether your `.vswizly/wizly.config.js` contains all keys that are defined in the current system defaults. Missing keys are detected at every level of nesting.

### Example

Suppose a new version of Wizly adds a `locale` property inside `transformTag`:

```js
// System default (new)
transformTag: {
    enable: true,
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    template: 'Changed by Wizly on {date} at {time}',
    locale: 'en-US'  // ← new
}
```

If your exported config still has the old `transformTag` without `locale`, the patch command reports:

```
Missing keys: transformTag.locale
```

### How to use it

1. Run `Wizly: Patch Settings` from the command palette.
2. The message shows which keys (if any) are missing from your config.
3. Click **View Diff** to open a diff editor:
   - Left side: the full system defaults
   - Right side: your `wizly.config.js`
4. Copy the settings you want to adopt from left to right.

> **Your values are not overwritten automatically.** The diff editor lets you choose what to copy over — you always stay in control.

---

## How Defaults Stay in Sync

The system defaults used by the patch commands are the same source that powers `Wizly: Export Settings`. This means the diff you see in `Patch Settings` is always an accurate representation of what a fresh export would produce today — there is no separate "patch baseline" to maintain.

Similarly, `Patch Rules` always diffs against the same `default.rules.js` that ships with the extension, and `Patch Templates` always diffs against the bundled `.ejs` files.
