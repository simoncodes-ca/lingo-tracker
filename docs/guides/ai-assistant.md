---
title: Working with an AI Assistant
sidebar_position: 6
---

# Working with an AI Assistant

LingoTracker can generate a skill file that teaches an AI coding assistant how to do the i18n chores in your repository: find hardcoded strings, reuse existing keys, add resources with the right flags, regenerate bundles and update components to use typed tokens. The assistant then runs the same CLI you do, so everything it produces is reviewable JSON and ordinary code changes.

The generated skill is a `SKILL.md` file with a short description header, the format Claude Code reads from `.claude/skills/`. Other assistants that read the same layout can use it from `.cursor/` or `.agents/`.

## Install the skill

Run once per repository, after `init` and after you know your bundle names:

```bash
npx lingo-tracker install-skill \
  --collection main:web:MAIN_TOKENS:src/generated/tokens.ts \
  --dir .claude
```

Each `--collection` value has four colon-separated parts:

| Part | Meaning | Where to find it |
|---|---|---|
| `main` | Collection name | `collections` in `.lingo-tracker.json` |
| `web` | Bundle name the assistant should regenerate | `bundles` in `.lingo-tracker.json` |
| `MAIN_TOKENS` | Exported constant in the generated token file | `tokenConstantName`, or the bundle key upper-cased plus `_TOKENS` |
| `src/generated/tokens.ts` | Path of that token file | `typeDistFile` of the bundle |

Pass `--collection` once per collection. Add `--token-casing camelCase` if your tokens are camel-cased. In a terminal with no flags, the command asks for each value instead.

It writes two files and overwrites them if they exist:

```
.claude/skills/lingo-tracker/SKILL.md            the workflow, with your names filled in
.claude/skills/lingo-tracker/references/patterns.md   Angular and Transloco code patterns
```

Commit both so every contributor's assistant behaves the same way. Re-run the command when collection names, bundle names or token constants change.

## What the assistant does with it

The skill describes a five-step workflow and tells the assistant to run every command non-interactively with explicit flags:

1. **Detect** hardcoded user-facing strings in the component the user asked about. The skill tells it to stay inside that component and not to read the config or the token file speculatively.
2. **Check for similar values** with `lingo-tracker find-similar --value "…"` before creating anything, and reuse an existing key when one fits.
3. **Create resources** with `lingo-tracker add-resource --collection main --key … --value … --comment …`, with a comment for translators.
4. **Regenerate the bundle** with `lingo-tracker bundle --name web` so the token file contains the new keys.
5. **Update the code** to reference `MAIN_TOKENS.…` through the Transloco pipe, directive or service, following the patterns file.

Because the assistant works through the CLI, auto-translation, preferred-terminology warnings and read-only protection all apply exactly as they would for a person.

## A typical session

> Extract the hardcoded strings in `checkout-summary.component` and wire them up.

The assistant lists the strings it found and runs `find-similar` for each. It reports which ones already exist and adds the rest, with keys you can read in the command lines. Then it regenerates the bundle and edits the template to use the tokens. You review the diff: new entries in `src/i18n/…/resource_entries.json`, matching metadata, an updated token file, and the template change.

Things worth checking in that review:

- Keys follow your naming convention. The generated skill prescribes one: camelCase segments in `domain.subdomain.entryKey` form, shared actions under `common.actions.*`, and one tag per resource. Edit that section of `SKILL.md` if your project differs.
- Comments are meaningful. The assistant tends to write them; make sure they help a translator.
- Nothing was added that `find-similar` could have reused.

## Scope and limits

- The skill's main workflow covers authoring and bundle generation. Its command reference also lists `validate` and `normalize`, but no export or import workflow. Nothing stops you from asking the assistant to run those commands too.
- The patterns file targets Angular with Transloco. For another framework, edit `references/patterns.md` after generation; it is a plain Markdown file.
- The CLI's `find-similar` compares source text only, so a string that was translated under a very different English wording will not be found. The assistant may add a near-duplicate in that case.
- If auto-translation is enabled, the assistant's `add-resource` calls will spend provider quota like anyone else's.

## Without the skill

An assistant can still use LingoTracker from the [CLI reference](../cli.md). The skill mainly saves it from reading the config on every task and from guessing collection, bundle and token names.
