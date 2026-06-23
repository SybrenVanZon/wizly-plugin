# Patching

Patch commands help you adopt new Wizly defaults without overwriting your own project customizations.

## Available Patch Commands

- `Wizly: Upgrade Assistant`
- `Wizly: Patch Settings`
- `Wizly: Patch Templates`
- `Wizly: Patch Rules`

## Upgrade Assistant

`Wizly: Upgrade Assistant` gives you one central place to start after updating Wizly.

It scans the current project for signals such as:

- exported settings in `.vswizly/wizly.config.js`
- exported templates in `.vswizly/templates`
- exported rules in `.vswizly/wizly.rules.js`
- Angular workspaces that may need a follow-up consistency check

It then opens a short markdown report and lets you launch the relevant next steps directly, such as:

- `Wizly: Patch Settings`
- `Wizly: Patch Templates`
- `Wizly: Patch Rules`
- `Wizly: Check Angular Setup`

## When To Use Them

- After upgrading Wizly
- When new settings keys appear
- When bundled templates have improved
- When default rules change and you want to review the differences

## Recommended Upgrade Flow

1. Update Wizly
2. Run the relevant patch command
3. Review the diff
4. Copy over only the changes you want
5. Test the generated output again

## Patch Templates

`Wizly: Patch Templates` compares your `.vswizly/templates/` files against the built-in templates.

It reports:

- new templates that exist in Wizly but not yet in your project
- modified templates where the built-in version has changed

Typical flow:

1. Run `Wizly: Patch Templates`
2. Open the diff for the template you want to inspect
3. Copy only the relevant changes

## Patch Rules

`Wizly: Patch Rules` compares your `.vswizly/wizly.rules.js` with the built-in rule set.

It reports:

- new rules in the system
- modified rules with the same name
- custom rules that exist only in your project

## Patch Settings

`Wizly: Patch Settings` checks whether your `.vswizly/wizly.config.js` still contains all keys from the current defaults.

Example of a missing key report:

```text
Missing keys: transformTag.locale
```

This is especially useful when new nested settings are added in later Wizly versions.

## Important Principle

- Patch commands do not overwrite your customizations automatically
- They open diffs so you can choose what to adopt
- The patch baseline is always the current built-in default shipped with Wizly
