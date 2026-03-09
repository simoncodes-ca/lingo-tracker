---
name: lingo-tracker
description: Translation management for lingo-tracker. Handles i18n, internationalization, transloco, hardcoded strings detection, translation resource creation, token generation, and code updates.
---

# LingoTracker i18n Workflow

Use this skill when the user wants to:
- Detect and extract hardcoded strings for translation
- Add, edit, or delete translation resources
- Regenerate translation bundles and typed token constants
- Update Angular components to use Transloco with typed tokens

## Workflow Overview

The full i18n workflow is a 5-step process:

1. **Detect** hardcoded strings in templates and TypeScript
2. **Check for similar values** before creating a new resource
3. **Create resources** via CLI (`npx lingo-tracker add-resource --collection {{PRIMARY_COLLECTION}} ...`) — only if no suitable existing key was found
4. **Regenerate bundle** via CLI (`npx lingo-tracker bundle --name {{PRIMARY_BUNDLE}}`)
5. **Update code** to use typed token constants with Transloco pipes/service

Always use non-interactive CLI mode — pass all values as `--flags`. Never rely on interactive prompts.

## File Reading — Stay Focused

Read only what the specific task requires:

- **For a component task**: read only that component's `.ts` and `.html` files
- **Do not** explore broadly or read sibling components unless the task explicitly involves them
- **Do not** read `.lingo-tracker.json` — the collection name (`{{PRIMARY_COLLECTION}}`) and bundle name (`{{PRIMARY_BUNDLE}}`) are already in this file
- **Do not** read `{{TOKEN_FILE_BASENAME}}` proactively — only read it after running `bundle` when you need the generated token names

## Step 2 — Check for Similar Values

Before calling `add-resource` for any detected string, run:

```bash
npx lingo-tracker find-similar --collection {{PRIMARY_COLLECTION}} --value "<the string value>"
```

**If the command returns any results, evaluate each match** (the tool already filters to ≥ 80% similarity):

- **Reuse the existing key if**:
  - The stored value is identical or nearly identical (≥ 95% similarity)
  - The existing key is a generic action label under `common.actions.*` or `common.*` (e.g. `common.actions.cancel`, `common.actions.save`)
  - The meaning is the same even if phrasing differs slightly

- **Create a new entry (call add-resource) if**:
  - The existing key belongs to a different domain and has context-specific meaning
  - The match is only partial and the wording serves a distinct purpose
  - The command outputs "No similar values found" (no results returned)

When reusing, use the existing key directly in the code — do not call `add-resource`.

## Default Collection & Bundle

{{COLLECTIONS_SECTION}}
- **Base locale**: `en`

## Detecting Hardcoded Strings

### Flag these as translatable:
- HTML text content, `placeholder`, `aria-label`, `title` attributes
- Angular Material: `matTooltip`, `<mat-label>`, button text
- TypeScript: snackbar messages, dialog titles/messages, toast notifications, error messages shown to users

### Skip these (not translatable):
- CSS class names, route paths, enum values, icon names (e.g., `'add'`, `'delete'`)
- Technical identifiers, object keys, log messages, selector strings
- URLs, file paths, regex patterns

## Key Naming Conventions

Keys use **camelCase dot-delimited segments**: `domain.subdomain.entryKey`

- **Domain** = feature area: `browser`, `collections`, `common`, `theme`, `data`
- **Shared actions** go under `common.actions.*` (e.g., `back`, `cancel`, `delete`, `edit`, `save`, `ok`)
- **Suffix with `X`** for interpolated keys (e.g., `showingSearchResultsForX` for text containing `{{ query }}`)
- **Group related keys** under shared prefixes (e.g., `collections.dialog.delete.title`, `collections.dialog.delete.message`)
- **UI structure keys**: `dialog.title`, `dialog.message`, `toast.created`, `toast.error`, `emptyState.message`, `emptyState.cta`
- **Tags**: Use only 1 tag — the top-level domain from the key (e.g., key `browser.similarTranslations.title` → tag `browser`)

## CLI Commands Reference

**Never directly edit `resource_entries.json`, `tracker_meta.json`, or any JSON bundle files.** Always use the CLI commands below — they handle checksums, metadata, and validation automatically. Direct edits will corrupt metadata and bypass validation.

All commands use the `npx lingo-tracker` prefix.

{{CLI_COMMANDS_SECTION}}

## Code Patterns

For template and TypeScript patterns (pipe usage, component setup, imperative translation, TranslocoPipe vs TranslocoModule), read:

`skills/lingo-tracker/references/patterns.md`

Read this only when you need to write or update Angular code — not upfront.

> **Note**: Update the token import paths in that file to match this project:
> - Import path: `{{TOKEN_IMPORT_PATH}}`
> - Token constant: `{{PRIMARY_TOKEN_CONSTANT}}`
