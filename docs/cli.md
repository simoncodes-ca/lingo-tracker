---
title: CLI Reference
sidebar_position: 6
---

# CLI Reference

Every command of the `lingo-tracker` CLI, with its flags, prompts and exit codes. For a walkthrough see [Getting Started](./getting-started.md); for config fields see [Configuration](./configuration.md).

```bash
lingo-tracker <command> [options]
lingo-tracker <command> --help     # or: lingo-tracker help <command>
lingo-tracker --version            # -V
```

## How the CLI behaves

**Project root and config.** The CLI reads `.lingo-tracker.json` from `INIT_CWD` when a package manager sets it, otherwise from the current directory. It never searches parent directories. A missing file exits 1 with a hint to run `init`; `init` and `install-skill` do not need the file.

**Interactive or not.** A run is interactive only when both stdin and stdout are terminals. Piping output or redirecting it to a file makes the run non-interactive. Interactive runs prompt for missing values. Some commands also ask for confirmation in a terminal: `delete-resource`, `delete-collection`, `normalize --all`, and `add-resource` when the key exists. `remove-locale` does not ask. Non-interactive runs never prompt: a missing required value exits 1 with `Missing required options in non-interactive mode: --…`, and confirmations are skipped because the flags count as consent. `--yes` therefore matters only in a terminal.

**Choosing a collection.** Most commands take `--collection <name>`. When the flag is omitted and the project has exactly one collection, that collection is used. With several, an interactive run shows a selection prompt and a non-interactive run exits 1. `normalize` is the exception: it always needs `--collection` or `--all` outside a terminal.

**Read-only collections.** Commands that write resources refuse a read-only collection and exit 1. `normalize --all` skips read-only collections with a warning instead. `edit-collection` and `delete-collection` still work because they change only the config.

**Output streams.** Results go to stdout. Errors (`❌`) and warnings (`⚠️`) go to stderr. So `glossary --stdout | jq` and `normalize --json > report.json` are safe.

**Exit codes.** `0` on success, and after a cancelled prompt. `1` for a reported failure, a thrown error, missing required options, or an unknown command. Warnings never change the exit code.

**Lists.** Comma-separated flags trim each item and drop blanks. For optional list flags such as `--tags`, an exactly empty value counts as not given and `--tags ,` means an empty list. `--set-tags ""` and `--set ""` deliberately clear, and `export --status ""` is an error.

**Summary files.** Outside dry runs, `export` and `import` write a Markdown summary to the operating system's temp directory as `lingo-tracker-export-summary-<timestamp>.md` or `lingo-tracker-import-summary-<timestamp>.md` and print the path. The timestamp has millisecond precision, and a run never overwrites an existing summary: if the name is taken, it adds `-1`, `-2` and so on. They are not written into your project.

## Command index

| Area | Commands |
|---|---|
| Project | [`init`](#init), [`install-skill`](#install-skill) |
| Collections | [`add-collection`](#add-collection), [`edit-collection`](#edit-collection), [`delete-collection`](#delete-collection), [`add-locale`](#add-locale), [`remove-locale`](#remove-locale) |
| Resources | [`add-resource`](#add-resource), [`edit-resource`](#edit-resource), [`delete-resource`](#delete-resource), [`move`](#move), [`find-similar`](#find-similar), [`normalize`](#normalize) |
| Output | [`bundle`](#bundle), [`validate`](#validate) |
| Exchange | [`export`](#export), [`import`](#import), [`glossary`](#glossary) |
| Terminology | [`protected-terms`](#protected-terms), [`preferred-terminology`](#preferred-terminology) |
| Machine translation | [`translate-locale`](#translate-locale) |

---

## Project commands

### init

Create `.lingo-tracker.json` in the current directory.

```bash
lingo-tracker init [options]
```

| Flag | Default | Notes |
|---|---|---|
| `--collection-name <name>` | prompt | Required outside a terminal |
| `--translations-folder <path>` | prompt | Required outside a terminal |
| `--base-locale <locale>` | `en` | |
| `--locales <locales...>` | none | Space-separated. Include the base locale. |
| `--export-folder <path>` | `dist/lingo-export` | |
| `--import-folder <path>` | `dist/lingo-import` | |
| `--setup-bundle <true\|false>` | prompt | Inferred `true` when any bundle flag is given |
| `--bundle-dist <path>` | `./src/assets/i18n` | |
| `--bundle-name <pattern>` | `{locale}` | |
| `--type-dist-file <path>` | none | Enables TypeScript key generation |
| `--token-casing <upperCase\|camelCase>` | none | |
| `--token-constant-name <name>` | derived from bundle key | |
| `--runtime <transloco-messageformat\|transloco>` | detected, else `transloco-messageformat` | App runtime for bundles. Detection reads `package.json`: a `transloco-messageformat` package gives `transloco-messageformat`, otherwise `@jsverse/transloco` or `@ngneat/transloco` gives `transloco`. An explicit value is always written; a default is not. Detection reads `dependencies` and `devDependencies` only, not `peerDependencies`, so a library repo should pass `--runtime`. Interactive and non-interactive runs both print `Detected runtime: <value> (from package.json)` when detection found a value and `--runtime` was not given. |
| `--enable-auto-translation` | off | Writes a `translation` block |
| `--translation-provider <name>` | `google-translate` | |
| `--translation-api-key-env <var>` | `GOOGLE_TRANSLATE_API_KEY` | |

Behaviour:

- Writes only the config file. The translations folder is created by the first resource.
- Always creates a bundle named `main`. Without bundle flags, outside a terminal, it is `{ "bundleName": "{locale}", "dist": "./src/assets/i18n", "collections": "All" }`. In a terminal, accepting every default also enables type generation at `./src/generated/tokens.ts` with `upperCase` casing.
- Without `--locales` the global `locales` list is empty.
- Does not apply the `node_modules` read-only default; use `add-collection` for vendored folders.
- If the config file already exists, prints a note and exits 0 without changes.

```bash
lingo-tracker init \
  --collection-name main \
  --translations-folder src/i18n \
  --base-locale en \
  --locales en fr-ca es \
  --setup-bundle true \
  --type-dist-file ./src/generated/tokens.ts
```

### install-skill

Write an AI assistant skill, pre-filled with your collection and bundle names, into the repository. See [Working with an AI assistant](./guides/ai-assistant.md).

```bash
lingo-tracker install-skill [options]
```

| Flag | Default | Notes |
|---|---|---|
| `--collection <name:bundle:CONSTANT:tokenFile>` | prompt | Repeatable. All four colon-separated parts are required. |
| `--dir <path>` | `.claude` | Output root. Ignored when the interactive prompts run. |
| `--token-casing <upperCase\|camelCase>` | none | When omitted, the generated commands pass no casing flag. |

Writes `<dir>/skills/lingo-tracker/SKILL.md` and `<dir>/skills/lingo-tracker/references/patterns.md`, overwriting existing files. In a terminal without `--collection`, it prompts for the directory (`.claude`, `.agents` or `.cursor`), then for each collection, then for casing. Outside a terminal `--collection` is required.

```bash
lingo-tracker install-skill \
  --collection main:web:MAIN_TOKENS:src/generated/tokens.ts \
  --dir .claude
```

---

## Collection commands

### add-collection

Register another translations folder.

```bash
lingo-tracker add-collection [options]
```

| Flag | Notes |
|---|---|
| `--collection-name <name>` | Required outside a terminal. Must be unused. |
| `--translations-folder <path>` | Required outside a terminal |
| `--base-locale <locale>`, `--locales <locales...>`, `--export-folder <path>`, `--import-folder <path>` | Per-collection overrides. Only values that differ from the global ones are stored. |
| `--read-only` / `--no-read-only` | Force the flag either way |

When neither read-only flag is given: in a terminal the command asks, with the default on for a folder under `node_modules`; outside a terminal a `node_modules` folder becomes read-only and any other folder stays writable.

```bash
lingo-tracker add-collection --collection-name admin --translations-folder apps/admin/src/i18n
lingo-tracker add-collection --collection-name design --translations-folder node_modules/@acme/ds/i18n
```

### edit-collection

Manage a collection's inherited tags. Renaming a collection is available only through the API.

```bash
lingo-tracker edit-collection <name> [--add-tag <tag>]... [--remove-tag <tag>]... [--set-tags <a,b>]
```

`--set-tags` replaces the list and cannot be combined with the other two; `--set-tags ""` clears it. Tags are normalized to lowercase hyphenated form. Works on read-only collections because it changes only the config.

### delete-collection

Remove a collection from the config. Files on disk are kept.

```bash
lingo-tracker delete-collection [--collection-name <name>] [--yes]
```

Also removes the collection from explicit bundle collection lists. If a bundle would be left with no collections, the command refuses and names the bundle. In a terminal it asks for confirmation unless `--yes` is given.

### add-locale

Add a target locale to one collection and seed every existing resource with a `new` copy of the source.

```bash
lingo-tracker add-locale [--collection <name>] --locale <locale>
```

The locale must be well-formed, must not be the base locale and must not already exist. The result is written as the collection's own `locales` list, copied from the global list first if the collection inherited it.

**Note:** bundles use the global `locales`. After `add-locale`, also add the locale to the top-level `locales` array, or `bundle` will not emit a file for it and `bundle --locale <l>` will report an unknown locale.

### remove-locale

Remove a target locale from one collection and delete its values and metadata from every resource file.

```bash
lingo-tracker remove-locale [--collection <name>] --locale <locale>
```

The base locale cannot be removed. Removing the last target locale leaves a monolingual collection. The data is gone from the files; recover it from Git if needed.

---

## Resource commands

### add-resource

Create one resource.

```bash
lingo-tracker add-resource [options]
```

| Flag | Notes |
|---|---|
| `--collection <name>` | |
| `--key <key>` | Required. Dot-delimited. |
| `--value <text>` | Required. The source text. Cannot be blank. |
| `--comment <text>` | Context for translators |
| `--tags <a,b>` | Normalized on write |
| `--target-folder <path>` | Dot-delimited folder prepended to the key |
| `--translations <json>` | JSON array of `{ "locale", "value", "status"? }` |
| `--override` | Replace an existing resource |

Locales not supplied through `--translations` are machine-translated when auto-translation is enabled, otherwise seeded as `new` copies of the source. In a terminal without `--translations`, the command offers to enter a value and pick a status for each target locale. An explicit `status` is stored as given; when omitted it is `translated`, or `new` if the value equals the source.

If the key already exists: with `--override` the resource is replaced without a question; without it, a terminal run asks whether to replace, and a non-interactive run exits 1 with `Resource already exists`. After saving, the command prints a warning for each [preferred terminology](./features/preferred-terminology.md) rule the source text breaks; warnings do not change the exit code.

```bash
lingo-tracker add-resource \
  --key buttons.ok --value OK --comment "Dialog confirm button" --tags ui,dialogs \
  --target-folder common \
  --translations '[{"locale":"es","value":"Aceptar"},{"locale":"fr-ca","value":"OK","status":"verified"}]'
```

### edit-resource

Change an existing resource.

```bash
lingo-tracker edit-resource [options]
```

| Flag | Notes |
|---|---|
| `--collection <name>` | |
| `--key <key>` | Required |
| `--base-value <text>` | New source text. Marks every real translation `stale`. |
| `--comment <text>` | `--comment ""` clears it |
| `--tags <a,b>` | Replaces the list. `--tags ,` clears it; `--tags ""` is ignored. |
| `--target-folder <path>` | Moves the entry. `""` means the collection root. |
| `--locale <locale>` with `--locale-value <text>` | Set one translation. When the value changes, its status becomes `translated`, or `new` if it equals the source. An unchanged value keeps its status. |

In a terminal, only the key and base value are prompted for; a blank answer keeps the current base value. When the source changes, locales that hold an untranslated copy get the new source, or a machine translation if enabled, and real translations become `stale`. Giving only one of `--locale` and `--locale-value` prints a warning and skips the translation; the other edits in the same command still apply. `No changes detected` is reported when nothing differs.

A resource that has values but no metadata record cannot be edited until `normalize` has created the record.

### delete-resource

Delete one or more resources, in every locale.

```bash
lingo-tracker delete-resource [--collection <name>] --key <key[,key...]> [--yes]
```

Deletion is best-effort: valid keys are removed even when others fail. Failures are listed under `Errors (N):` on stderr and make the exit code 1. Folders left empty are removed, deepest first, stopping at a folder that still holds other files such as `.gitkeep`. The translations folder itself is never removed. In a terminal the command shows the keys and asks for confirmation unless `--yes` is given.

### move

Move or rename resources, within a collection or into another one.

```bash
lingo-tracker move [--collection <name>] --source <key|pattern> --dest <key> [--dest-collection <name>] [--override]
```

- `--source` is a key, or a pattern ending in `*` such as `common.buttons.*`. With a pattern, `--dest` is the new prefix: `common.buttons.ok` becomes `common.actions.ok`.
- Comments, tags and statuses move unchanged, and nothing is machine-translated. Stored `{{ name }}` placeholders are converted to `{name}` on the way, with checksums updated to match.
- A destination that already exists is skipped with a warning and exit code 0 unless `--override` is given.
- `--dest-collection` moves into another writable collection. Both collections must share a base locale. Locales the destination lacks are dropped; locales the entry lacks are seeded as `new`. The flag is never prompted for.
- Emptied source folders are removed, as for `delete-resource`.

```bash
lingo-tracker move --source "common.buttons.*" --dest common.actions
lingo-tracker move --source common.buttons.ok --dest shared.ok --dest-collection shared
```

### find-similar

List resources whose source text is close to a given string. Use it before adding a resource to avoid duplicates; the editor's **Similar values** panel uses the same rule.

```bash
lingo-tracker find-similar [--collection <name>] --value <text> [--max-results <n>]
```

Scoring is normalized Levenshtein similarity on trimmed, lowercased source values. A resource is listed when its similarity is at least 80%, or when one text contains the other as whole words and the similarity is at least 40%. Results are ranked by similarity, with a key that contains the query winning ties. `--max-results` defaults to 5 and is capped at 500. The thresholds are fixed.

```
Similar values found for "Save":
  buttons.save → "Save" (similarity: 100%)
  labels.saved → "Saved" (similarity: 80%)
  buttons.saveDraft → "Save draft" (similarity: 40%)
```

### normalize

Repair and tidy a collection's files. See the [Normalize guide](./guides/normalize.md) for when to run it.

```bash
lingo-tracker normalize (--collection <name> | --all) [--dry-run] [--json] [--yes]
```

For every entry it:

- converts `{{ x }}` to `{x}`
- normalizes tags
- recomputes checksums and re-applies the staleness rule
- seeds missing target locales as `new`
- drops a stray base-locale property
- writes both files where something changed

Then it removes empty folders bottom-up. It never changes translated text beyond the placeholder syntax, never removes values for locales that are no longer configured, and never removes the translations folder itself or any folder holding other files.

Outside a terminal, `--collection` or `--all` is required even with one collection. `--all` skips read-only collections with a warning and asks for confirmation in a terminal unless `--yes` is given. `--json` prints one object with per-collection counts, `problems`, `findings` and `totals` to stdout.

```
🔄 Normalizing collection: main

   ✅ Entries processed: 42
   ✅ Locales added: 7
   ✅ Values converted to ICU: 0
   ✅ Files created: 2
   ✅ Files updated: 15
   ✅ Folders removed: 3
```

---

## Output commands

### bundle

Write the runtime JSON files and optional TypeScript keys defined in `bundles`. See the [Bundling guide](./guides/bundling.md).

```bash
lingo-tracker bundle [options]
```

| Flag | Notes |
|---|---|
| `--name <a,b>` | Bundles to generate. Default: all. In a terminal with no flag, a selection prompt is shown. |
| `--locale <a,b>` | Locales to generate, from the global `locales`. Default: all. |
| `--token-casing <upperCase\|camelCase>` | Overrides config |
| `--token-constant-name <name>` | Overrides config. Requires a single bundle: pass `--name`, or have only one bundle configured. |
| `--[no-]transform-icu-to-transloco` | Convert `{name}` to `{{ name }}`, or keep `{name}`. Overrides config; when omitted, the bundle and global settings apply. |
| `--debug-keys [locale]` | Also write a bundle where every value is its own key, under locale code `99` unless given |
| `--quiet` | Suppress progress and success lines |
| `--verbose` | Print every warning |

Each bundle writes `<dist>/<bundleName>.json` per locale and, when `typeDistFile` is set, the token file. Stored values are included whatever their status; a locale seeded as `new` therefore holds source text. A locale with no matching entries writes no file and warns. A key that is both a value and a parent fails the bundle. One failing bundle does not stop the others, but the exit code becomes 1.

### validate

Check every collection and target locale for release readiness. See [Validate](./features/validate.md) for the rules in depth.

```bash
lingo-tracker validate [options]
```

| Flag | Effect |
|---|---|
| `--allow-translated` | `translated` becomes a warning instead of a failure |
| `--skip-locales <a,b>` | Exclude target locales. Unknown codes warn; skipping every target locale exits 1. |
| `--skip-icu` | Do not compile values as ICU |
| `--skip-runtime` | Do not check that the configured `runtime` can render each value's ICU constructs |
| `--skip-placeholders` | Do not compare argument names with the source |
| `--skip-protected-terms` | Do not check protected terms |
| `--require-portable-plurals` | Warn when a source plural selects by category instead of `=N` |

Failures, each of which exits 1: a locale that is `new`, `stale`, `translated` without `--allow-translated`, or has no metadata; a value that does not compile as ICU for its locale; under `runtime: "transloco"`, a value with ICU `plural`, `select`, `selectordinal`, `number`, `date`, `time` or `duration`; a translation whose ICU argument names differ from the source; a translation missing a protected term; a folder whose files are not valid JSON; a preferred-terminology file that exists but cannot be loaded. Preferred-terminology findings and portable-plural findings are warnings. `validate` reports a runtime failure for each locale that holds the value, while `bundle` warns once per bundled key and set of constructs. The command never prompts and has no collection filter.

---

## Exchange commands

### export

Write translations to XLIFF 1.2 or JSON for a translator or another system. See [Export](./features/export.md).

```bash
lingo-tracker export --format <xliff|json> [options]
```

| Flag | Default | Notes |
|---|---|---|
| `-f, --format <xliff\|json>` | prompt | Required outside a terminal |
| `-c, --collection <a,b>` | all | Collections must share a base locale |
| `-l, --locale <a,b>` | all target locales | The base locale is never exported |
| `-s, --status <a,b>` | `new,stale` | Any of `new`, `stale`, `translated`, `verified` |
| `-t, --tags <a,b>` | none | Entries with any of these tags, counting inherited tags |
| `-o, --output <dir>` | config `exportFolder` | |
| `--filename <pattern>` | `{locale}` | Placeholders `{locale}`, `{target}`, `{source}`, `{date}`; extension added if missing |
| `--no-protect-notes` | | Omit "Do not translate" annotations for protected terms |
| `--dry-run` | | Print the plan and summary; write nothing, not even the folder |
| `--verbose` | | |

JSON-only flags: `--structure <hierarchical|flat>` (default hierarchical), `--rich`, `--include-base`, `--include-status`, `--include-comment`, `--include-tags`, `--base-property-name <name>` (default `baseValue`; `value`, `comment`, `status` and `tags` are reserved). The `--include-*` flags and `--base-property-name` apply only with `--rich`; without it they print an advisory and have no effect. Given with XLIFF these flags have no effect.

One file is written per target locale. Errors and hierarchical key conflicts exit 1. A completed dry run exits 0 even when its plan reports errors; a dry run that cannot start, for example because the output folder is unusable, exits 1.

### import

Read translations from an XLIFF 1.2 or JSON file into one collection and locale. See [Import](./features/import.md).

```bash
lingo-tracker import --source <file> --locale <locale> [options]
```

| Flag | Default | Notes |
|---|---|---|
| `-s, --source <file>` | prompt | Required |
| `-l, --locale <locale>` | prompt | Required. The base locale is allowed only with `--strategy migration`. |
| `-c, --collection <name>` | | |
| `-f, --format <xliff\|json>` | from extension | |
| `--strategy <name>` | `translation-service` | See the table |
| `--create-missing` | on for migration | Create resources the file has but the collection lacks |
| `--update-comments` | on for migration | |
| `--update-tags` | on for migration | Rich JSON only |
| `--preserve-status` | off | Honour a `status` field in rich JSON instead of the strategy's status |
| `--validate-base` / `--no-validate-base` | on | Warn when the file's source text differs from the stored one |
| `--dry-run`, `--verbose` | | |

| Strategy | Resulting status | Creates missing | Typical use |
|---|---|---|---|
| `translation-service` | changed values `translated`; unchanged values keep their status, except that `stale` ones, or ones whose recorded base checksum differs from the current source, become `translated` | no | files back from a vendor |
| `verification` | `verified` | no | a reviewer's approved file |
| `migration` | changed or new values `translated`, or the file's own status with `--preserve-status`; unchanged values keep their status | yes | moving in from another system, including the base locale |
| `update` | unchanged | no | bulk corrections |

Passing `--create-missing`, `--update-comments` or `--update-tags` with a strategy other than `migration` prints an advisory warning and has no effect; these flags apply only to `migration`. Entries that fail, for example because a protected term was altered, are reported and make the exit code 1; entries skipped because the key does not exist do not. Files over 5 MB print a size warning.

### glossary

Extract the terms used in a block of text and output their existing translations. Meant for translating help content consistently with the UI. See [Glossary](./features/glossary.md).

```bash
lingo-tracker glossary (--text <text> | --input <file> | <stdin>) [options]
```

| Flag | Default |
|---|---|
| `--text <text>` / `--input <file>` / piped stdin | precedence in that order |
| `--output <file>` | `./lingo-tracker-glossary-<timestamp>.json` |
| `--stdout` | print JSON to stdout, status to stderr |
| `--collection <name>` | all collections, which must share a base locale |
| `--locales <a,b>` | all target locales |
| `--include-all` | also include `new` and `stale` translations |
| `--extractor <ngram>` | `ngram`. `ai` is reserved and currently errors. |

---

## Terminology commands

### protected-terms

Edit the global protected-terms file or a collection's own file. See [Protected Terms](./features/protected-terms.md).

```bash
lingo-tracker protected-terms [--collection <name>] ([--add <term>]... | [--remove <term>]... | --set <a,b> | --list | --file <path>)
```

`--list` prints the terms and the file behind them; with `--collection` it prints the global, collection and combined lists. `--file` points the scope at another file and carries existing terms across; `--file ""` removes the setting. A collection has no default file, so give it one with `--file` before adding terms. `--set` cannot be combined with `--add` or `--remove`. Files are written sorted, one term per line.

### preferred-terminology

Edit the preferred-terminology rules. See [Preferred Terminology](./features/preferred-terminology.md).

```bash
lingo-tracker preferred-terminology (--list | --add <discouraged> --preferred <preferred> [--reason <text>] | --remove <discouraged>)
```

`--add` replaces an existing rule for the same discouraged term, compared without case, so omitting `--reason` clears an earlier reason. Invalid rule sets, such as chains, cycles or self-mappings, are rejected without touching the file. If the file cannot be read, `--add` and `--remove` refuse to run.

---

## Machine translation

### translate-locale

Machine-translate every resource of one collection whose target locale is `new`, `stale` or has no metadata yet. Requires `translation.enabled`. See [Auto-Translation](./auto-translation.md).

```bash
lingo-tracker translate-locale [--collection <name>] --locale <locale> [--verbose]
```

Resources that use plural, select, number, date or time ICU forms, that lose a placeholder in translation, or whose translation drops a protected term are skipped and counted as needing a human. Requests are sent in batches of `translation.batchSize` with `translation.delayMs` between them. `--verbose` prints one line per batch. The exit code is 1 when any resource failed.

---

## Scripting notes

- Pass every required value as a flag. Do not rely on auto-selection of a single collection in scripts that may later run against several.
- Check exit codes. Partial failures in `delete-resource`, `import`, `bundle` and `translate-locale` exit 1 while still having done the successful part.
- `validate` and `bundle` together make a release gate: validate first, then bundle, then build.
- The [CI/CD guide](./guides/ci-cd.md) has complete pipeline examples.
