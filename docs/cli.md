---
title: CLI Reference
sidebar_position: 3
---

# CLI Reference

This document provides a comprehensive reference for all Lingo Tracker CLI commands. For initial setup instructions, see the [Getting Started Guide](./getting-started.md).

## Overview

The Lingo Tracker CLI provides commands to manage translation collections and resources from the command line. All commands support both interactive mode (with prompts) and non-interactive mode (for CI/CD environments).

### General Usage

```bash
lingo-tracker <command> [options]
```

## Interactive vs Non-Interactive Mode

- **Interactive Mode**: When running in a TTY environment without all required options, the CLI will prompt you for missing values.
- **Non-Interactive Mode**: In CI/CD environments or when all required options are provided, no prompts will appear.

### Common Options

- Most commands accept configuration options that can override defaults from `.lingo-tracker.json`
- Options use `--kebab-case` naming convention
- Multi-value options (like `--locales`) accept space-separated values

---

## Collection Commands

### init

Initialize a new Lingo Tracker project by creating a `.lingo-tracker.json` configuration file.

**Usage:**

```bash
lingo-tracker init [options]
```

**Options:**

- `--collection-name <name>` - Name of the initial collection key, e.g., "Main" (required in non-interactive mode)
- `--translations-folder <path>` - Path to the translations directory for this collection (required in non-interactive mode)
- `--export-folder <path>` - Output folder for exports (default: `dist/lingo-export`)
- `--import-folder <path>` - Input folder for imports (default: `dist/lingo-import`)
- `--base-locale <locale>` - Base/authoring locale (default: `en`)
- `--locales <locales...>` - Space-separated list of supported locales (e.g., `en fr-ca es de`)

**Bundle options:**

- `--setup-bundle <true|false>` - Customize bundle configuration (default: prompted interactively). When omitted and any bundle flag is provided, automatically inferred as `true`
- `--bundle-dist <path>` - Bundle output directory (default: `./src/assets/i18n`)
- `--bundle-name <pattern>` - Bundle name pattern (default: `{locale}`)
- `--token-casing <casing>` - Token property key casing: `upperCase` or `camelCase`
- `--type-dist-file <path>` - Path for generated TypeScript type definitions file (default: `./src/generated/tokens.ts`)
- `--token-constant-name <name>` - Custom name for the generated TypeScript constant (auto-derived from bundle key when omitted)

**Auto-translation options:**

- `--enable-auto-translation` - Enable automatic translation via an external provider
- `--translation-provider <provider>` - Translation provider to use (default: `google-translate`). Required when `--enable-auto-translation` is set
- `--translation-api-key-env <envVar>` - Name of the environment variable holding the provider API key (default: `GOOGLE_TRANSLATE_API_KEY`). Required when `--enable-auto-translation` is set

**Examples:**

Interactive mode (prompts for values):
```bash
lingo-tracker init
```

Non-interactive mode (CI-safe, all required options provided):
```bash
lingo-tracker init \
  --collection-name Main \
  --translations-folder apps/web/src/assets/i18n \
  --export-folder dist/lingo-export \
  --import-folder dist/lingo-import \
  --base-locale en \
  --locales en fr-ca es de
```

Non-interactive mode with bundle configuration:
```bash
lingo-tracker init \
  --collection-name Main \
  --translations-folder apps/web/src/assets/i18n \
  --base-locale en \
  --locales en fr-ca es de \
  --setup-bundle true \
  --bundle-dist ./src/assets/i18n \
  --bundle-name "{locale}" \
  --token-casing camelCase \
  --type-dist-file ./src/generated/tokens.ts
```

Non-interactive mode with auto-translation enabled:
```bash
lingo-tracker init \
  --collection-name Main \
  --translations-folder apps/web/src/assets/i18n \
  --base-locale en \
  --locales en fr-ca es de \
  --enable-auto-translation \
  --translation-provider google-translate \
  --translation-api-key-env GOOGLE_TRANSLATE_API_KEY
```

**Notes:**
- Run this command once in your project root to create `.lingo-tracker.json`
- Creates the initial configuration with one collection and a default bundle
- In interactive mode, you will be prompted to customize the bundle configuration (dist path, name pattern, token casing, type generation)
- If you decline bundle customization, a default bundle is still created with `dist: ./src/assets/i18n`, `bundleName: {locale}`, and `collections: All`
- Commit `.lingo-tracker.json` to version control
- When `--enable-auto-translation` is set, the `translation` block is written to `.lingo-tracker.json` and new/edited resources are automatically translated via the configured provider

---

### add-collection

Add a new translation collection to an existing Lingo Tracker project. Collections allow you to manage multiple translation sources within the same repository (e.g., main app, admin panel, mobile app).

**Usage:**

```bash
lingo-tracker add-collection [options]
```

**Options:**

- `--collection-name <name>` - Name of the new collection (required in non-interactive mode)
- `--translations-folder <path>` - Path to the translations directory for this collection (required in non-interactive mode)
- `--export-folder <path>` - Override global export folder for this collection
- `--import-folder <path>` - Override global import folder for this collection
- `--base-locale <locale>` - Override global base locale
- `--locales <locales...>` - Override global locales list

**Examples:**

Interactive mode (prompts for collection details):
```bash
lingo-tracker add-collection
```

Simple, using global defaults:
```bash
lingo-tracker add-collection \
  --collection-name Admin \
  --translations-folder apps/admin/src/assets/i18n
```

With collection-specific overrides (only differences are saved):
```bash
lingo-tracker add-collection \
  --collection-name Mobile \
  --translations-folder apps/mobile/src/i18n \
  --base-locale en-GB
```

**Notes:**
- Requires an existing `.lingo-tracker.json` configuration file (run `init` first)
- Reuses global defaults; only saves overrides when they differ
- Will refuse to add a collection if the name already exists
- Only persists per-collection settings that differ from global configuration

---

### delete-collection

Delete a translation collection from the project.

**Usage:**

```bash
lingo-tracker delete-collection [options]
```

**Options:**

- `--collection-name <name>` - Name of the collection to delete (required in non-interactive mode)

**Examples:**

Interactive mode (prompts for collection):
```bash
lingo-tracker delete-collection
```

Non-interactive mode:
```bash
lingo-tracker delete-collection --collection-name Mobile
```

**Notes:**
- Removes the collection entry from `.lingo-tracker.json`
- Does NOT delete translation files from disk (data is preserved)
- Will prompt for confirmation before deletion (in interactive mode)

---

### add-locale

Add a locale to a collection and backfill all existing resources with the new locale.

**Usage:**

```bash
lingo-tracker add-locale [options]
```

**Options:**

- `--collection <name>` - Name of the collection (required in non-interactive mode)
- `--locale <locale>` - Locale to add, e.g. `fr-ca`, `de`, `es` (required in non-interactive mode)

**Examples:**

Interactive mode (prompts for collection and locale):
```bash
lingo-tracker add-locale
```

Non-interactive mode:
```bash
lingo-tracker add-locale --collection Main --locale de
```

**Notes:**
- Validates locale format (e.g. `en`, `fr-ca`, `zh-Hans`)
- Errors if the locale already exists in the collection
- Cannot add the base locale
- If the collection inherits global locales (no explicit `locales` in its config), global locales are copied into the collection first, then the new locale is appended
- All existing `resource_entries.json` files are updated with the new locale value set to the base (`source`) value, and `tracker_meta.json` is updated with `status: "new"`

---

### remove-locale

Remove a locale from a collection and purge all of its translation data from resource files.

**Usage:**

```bash
lingo-tracker remove-locale [options]
```

**Options:**

- `--collection <name>` - Name of the collection (required in non-interactive mode)
- `--locale <locale>` - Locale to remove (required in non-interactive mode)

**Examples:**

Interactive mode (prompts for collection, then shows a list of removable locales):
```bash
lingo-tracker remove-locale
```

Non-interactive mode:
```bash
lingo-tracker remove-locale --collection Main --locale de
```

**Notes:**
- Errors if the locale does not exist in the collection
- Cannot remove the base locale
- Removes the locale key from all `resource_entries.json` and `tracker_meta.json` files in the collection
- Translation data for the locale is permanently deleted from files (recoverable via git)
- Removing the last non-base locale is allowed (results in a monolingual collection)
- If the collection inherits global locales, global locales are copied into the collection first, then the target locale is removed

---

## Resource Commands

### add-resource

Add a translation resource to a collection.

**Usage:**

```bash
lingo-tracker add-resource [options]
```

**Options:**

- `--collection <name>` - Collection to add the resource to (required in non-interactive mode)
- `--key <key>` - Dot-delimited resource key, e.g., `apps.common.buttons.ok` (required in non-interactive mode)
- `--value <text>` - Base (source) text in the base locale (required in non-interactive mode)
- `--comment <text>` - Optional context for translators
- `--tags <tags>` - Optional comma-separated tags for filtering/exporting
- `--target-folder <folder>` - Optional dot-delimited path override for folder placement
- `--translations <json>` - Optional JSON array with translation objects

**Translation Object Format:**

The `--translations` option accepts a JSON array of objects with the following structure:

```json
[
  {
    "locale": "es",
    "value": "Aplicar",
    "status": "translated"
  },
  {
    "locale": "fr-ca",
    "value": "Appliquer",
    "status": "verified"
  }
]
```

Valid status values: `new`, `translated`, `verified`, `stale`

**Examples:**

Interactive mode (prompt for all values):
```bash
lingo-tracker add-resource
```

Non-interactive, minimal (key placed directly in translation folder):
```bash
lingo-tracker add-resource \
  --collection Main \
  --key buttons.ok \
  --value OK
```

Non-interactive, full options (key nested under `apps.common`, tagged, with translations):
```bash
lingo-tracker add-resource \
  --collection Main \
  --key buttons.ok \
  --value OK \
  --comment "OK button in dialogs" \
  --tags "ui,buttons,dialogs" \
  --target-folder apps.common \
  --translations '[{"locale":"es","value":"Aceptar","status":"translated"},{"locale":"fr-ca","value":"OK","status":"new"}]'
```

**Notes:**
- In interactive mode, you'll be prompted if you want to provide translations for each configured locale
- Resources are placed in the appropriate folder based on the key and optional `--target-folder`
- If a translation's checksum matches the base value's checksum, the status will automatically be set to `new` regardless of the provided status

---

### delete-resource

Delete one or more translation resources from a collection.

**Usage:**

```bash
lingo-tracker delete-resource [options]
```

**Options:**

- `--collection <name>` - Collection to delete resources from (required in non-interactive mode)
- `--key <keys>` - Resource key(s) - single key or comma-separated (required in non-interactive mode)
- `--yes` - Skip confirmation prompt (useful for scripts)

**Examples:**

Interactive mode (prompts for collection and key):
```bash
lingo-tracker delete-resource
```

Delete a single resource:
```bash
lingo-tracker delete-resource \
  --collection Main \
  --key apps.common.buttons.ok
```

Delete multiple resources (comma-separated):
```bash
lingo-tracker delete-resource \
  --collection Main \
  --key "apps.common.buttons.ok,apps.common.buttons.cancel,apps.common.buttons.save"
```

Skip confirmation prompt (useful for scripts):
```bash
lingo-tracker delete-resource \
  --collection Main \
  --key apps.common.buttons.ok \
  --yes
```

**Behavior:**

- **Bulk Operations**: The command uses a best-effort approach. If some keys fail validation or are not found, the operation continues processing remaining keys and reports the count of successful deletions.
- **File Cleanup**: When the last resource entry is deleted from a folder, both `resource_entries.json` and `tracker_meta.json` are removed. Empty parent folders are preserved (keeps Git structure stable).
- **Confirmation**: In interactive mode (TTY), you'll be asked to confirm the deletion unless the `--yes` flag is provided. The confirmation shows all keys that will be deleted.
- **Partial Success**: If some keys succeed and others fail, the command completes successfully and reports both the deletion count and any errors encountered.

**Output:**

```bash
# Successful deletion
✅ Deleted 3 resource(s)

# Partial success with errors
✅ Deleted 2 resource(s)

⚠️  Some operations failed:
   - invalid..key: Invalid key format
   - nonexistent.key: Resource not found
```

**Notes:**
- This command removes translations for ALL locales for the specified keys
- In non-interactive mode, you must provide all required options
- Errors for individual keys don't halt the operation; other keys continue to be processed


---

### edit-resource

Edit an existing translation resource.

**Usage:**

```bash
lingo-tracker edit-resource [options]
```

**Options:**

- `--collection <name>` - Collection containing the resource (required in non-interactive mode)
- `--key <key>` - Resource key (required in non-interactive mode)
- `--base-value <text>` - New base value (updates source text)
- `--comment <text>` - New comment
- `--tags <tags>` - New tags (comma-separated, replaces existing)
- `--target-folder <folder>` - New target folder
- `--locale <locale>` - Locale to update (requires `--locale-value`)
- `--locale-value <text>` - New translation value for the specified locale

**Examples:**

Interactive mode:
```bash
lingo-tracker edit-resource
```

Update base value (marks other locales as stale):
```bash
lingo-tracker edit-resource \
  --collection Main \
  --key buttons.save \
  --base-value "Save Item"
```

Update a specific translation:
```bash
lingo-tracker edit-resource \
  --collection Main \
  --key buttons.save \
  --locale fr-ca \
  --locale-value "Enregistrer l'article"
```

Update metadata:
```bash
lingo-tracker edit-resource \
  --collection Main \
  --key buttons.save \
  --comment "Main save button" \
  --tags "ui,primary"
```

**Notes:**
- Updating `--base-value` triggers a checksum update and marks all other existing translations as `stale`.
- Updating a locale value sets its status to `translated` and updates its checksum.
- If no changes are detected (values match existing), the command reports "No changes detected".

---

### translate-locale

Auto-translate all `new` and `stale` resources in a collection for a single target locale. Requires auto-translation to be enabled in `.lingo-tracker.json`.

**Usage:**

```bash
lingo-tracker translate-locale [options]
```

**Options:**

- `--collection <name>` - Collection name (prompted if not provided)
- `--locale <locale>` - Target locale to translate (prompted if not provided)
- `--verbose` - Show per-batch progress (default: summary only)

**Interactive mode:**

When running in a TTY environment without `--collection` or `--locale`, the command prompts for the missing values.

**Non-interactive mode:**

Both `--collection` and `--locale` are required. The command exits with a non-zero code if either is missing.

**Examples:**

Interactive mode (prompts for collection and locale):
```bash
lingo-tracker translate-locale
```

Non-interactive mode:
```bash
lingo-tracker translate-locale \
  --collection Main \
  --locale fr
```

With verbose progress:
```bash
lingo-tracker translate-locale \
  --collection Main \
  --locale fr \
  --verbose
```

**Output (summary mode):**

```
Translating locale 'fr' in collection 'playground'...
Done.

Translated: 45 resources
Skipped (ICU): 3 resources
Failed: 0 resources
```

**Output (verbose mode):**

```
[batch 1/9] translated: 5, skipped: 0, failed: 0
[batch 2/9] translated: 10, skipped: 0, failed: 0
...
```

**Notes:**
- Only resources with status `new` or `stale` are translated; `translated` and `verified` resources are left unchanged
- Resources whose base value uses complex ICU syntax are skipped and reported in the "Skipped (ICU)" count
- Throttling is controlled by `batchSize` and `delayMs` in the `translation` config block; see [Auto-Translation](./auto-translation.md) for recommended settings
- Requires `translation.enabled: true` in `.lingo-tracker.json`

---

### move

Move or rename translation resources. Supports moving single resources as well as bulk moves using wildcard patterns.

**Usage:**

```bash
lingo-tracker move [options]
```

**Options:**

- `--collection <name>` - Collection to move resources in (required in non-interactive mode)
- `--source <key>` - Source key or pattern (e.g., `common.buttons.ok` or `common.buttons.*`) (required in non-interactive mode)
- `--dest <key>` - Destination key (e.g., `common.actions.ok` or `common.actions`) (required in non-interactive mode)
- `--override` - Overwrite destination if it already exists
- `--verbose` - Print detailed output for each moved resource

**Examples:**

Interactive mode:
```bash
lingo-tracker move
```

Move a single resource:
```bash
lingo-tracker move \
  --collection Main \
  --source common.buttons.ok \
  --dest common.actions.ok
```

Move multiple resources using a wildcard pattern:
```bash
lingo-tracker move \
  --collection Main \
  --source "common.buttons.*" \
  --dest "common.actions"
```
*Result: `common.buttons.ok` -> `common.actions.ok`, `common.buttons.cancel` -> `common.actions.cancel`*

Force move (overwrite destination):
```bash
lingo-tracker move \
  --collection Main \
  --source old.key \
  --dest new.key \
  --override
```

**Notes:**
- When using wildcard patterns, the suffix matched by `*` is appended to the destination key.
- Moving a resource preserves its comments, tags, and translations.
- The source resource is deleted after a successful move.

---

### normalize

Normalize translation resources by recomputing checksums, adding missing locale entries, updating statuses, and cleaning up empty folders. This is a maintenance operation that ensures translation files are consistent and correct after manual edits, configuration changes, or imports.

**Usage:**

```bash
lingo-tracker normalize [options]
```

**Options:**

- `--collection <name>` - Collection name to normalize (required unless `--all` is used)
- `--all` - Normalize all collections in the project
- `--dry-run` - Preview changes without applying them (reports what would be changed)
- `--json` - Output results as JSON (useful for scripts and automation)

**What Normalization Does:**

1. **Recomputes checksums**: Updates MD5 checksums for base locale and all translations
2. **Adds missing locales**: Creates entries for any missing locales using the base value with status `new`
3. **Updates statuses**: Sets correct translation status based on checksums
   - `new` - Locale entry was just added or matches base value
   - `stale` - Base value changed since last translation (checksum mismatch)
   - `translated` / `verified` - Preserved when base value unchanged
4. **Creates missing files**: Ensures `resource_entries.json` and `tracker_meta.json` exist at every folder level
5. **Cleans up empty folders**: Removes folders with no entries (bottom-up recursive cleanup)

**Folder Cleanup Behavior:**

Normalization automatically removes empty folders to keep the translations directory clean:

- Folders are considered **empty** if they contain:
  - No `resource_entries.json` file, OR
  - An empty `resource_entries.json` (no entries or `{}`), AND
  - No subfolders
- Folders containing only `tracker_meta.json` or hidden files (`.gitkeep`, `.DS_Store`) are removed
- Cleanup uses bottom-up traversal (deepest folders first) to handle recursive removal
- The root translations folder is **never removed**, even if empty

**When to Use Normalize:**

- After manually editing JSON translation files
- After adding new locales to configuration
- After importing translations from external sources
- Periodically to maintain consistency and clean up the folder structure
- When translation statuses seem incorrect

**Examples:**

Interactive mode (prompts for collection):
```bash
lingo-tracker normalize
```

Normalize a specific collection:
```bash
lingo-tracker normalize --collection Main
```

Normalize all collections:
```bash
lingo-tracker normalize --all
```

Preview changes without applying (dry-run):
```bash
lingo-tracker normalize --collection Main --dry-run
```

Output results as JSON (useful for scripts):
```bash
lingo-tracker normalize --collection Main --json
```

Normalize all collections with JSON output:
```bash
lingo-tracker normalize --all --json
```

**Output:**

Human-readable format (default):
```
🔄 Normalizing collection: Main

   ✅ Entries processed: 42
   ✅ Locales added: 7
   ✅ Files created: 2
   ✅ Files updated: 15
   ✅ Folders removed: 3
```

JSON format (`--json` flag):
```json
{
  "collections": [
    {
      "collectionName": "Main",
      "entriesProcessed": 42,
      "localesAdded": 7,
      "filesCreated": 2,
      "filesUpdated": 15,
      "foldersRemoved": 3
    }
  ],
  "totals": {
    "collectionsProcessed": 1,
    "entriesProcessed": 42,
    "localesAdded": 7,
    "filesCreated": 2,
    "filesUpdated": 15,
    "foldersRemoved": 3
  }
}
```

**Notes:**
- Normalization is **non-destructive**: it preserves existing translation values, comments, and tags
- Only fills in missing data and corrects metadata
- Dry-run mode counts folders that would be removed but doesn't delete them
- In interactive mode, you'll be prompted to confirm when using `--all`
- Best practice: run with `--dry-run` first to preview changes before applying

---

### bundle

Generate translation bundles for deployment.

**Usage:**

```bash
lingo-tracker bundle [options]
```

**Options:**

- `--name <names>` - Bundle name(s) to generate (comma-separated). If not specified, generates all configured bundles
- `--locale <locales>` - Specific locale(s) to generate (comma-separated). If not specified, generates all locales
- `--token-casing <casing>` - Casing style for generated type token keys: `upperCase` or `camelCase`. Overrides any `tokenCasing` set in the config file. Default: `upperCase`
- `--token-constant-name <name>` - Custom name for the generated TypeScript constant. Must be a valid JavaScript identifier. Only works when targeting a single bundle (via `--name`). Overrides `tokenConstantName` in the bundle config
- `--no-transform-icu-to-transloco` - Disable ICU to Transloco format conversion in bundle output
- `--verbose` - Show detailed output including all warnings

**What Bundle Generation Does:**

1. **Reads bundle configuration** from `.lingo-tracker.json` `bundles` section
2. **Collects translations** from specified collections based on selection rules
3. **Applies filters** using pattern matching and tag-based selection
4. **Resolves conflicts** using merge strategies (merge or override)
5. **Transforms to hierarchical JSON** (flat keys → nested objects)
6. **Writes bundle files** to configured output directories with `{locale}` placeholder replacement

**When to Use Bundle:**

- Before deploying your application to production
- As part of your build pipeline
- After translator completes translations
- When you need to generate bundles for specific locales only
- To preview bundle contents with `--verbose` flag

**Examples:**

Interactive mode (prompts for bundle selection):
```bash
lingo-tracker bundle
```

Generate all configured bundles:
```bash
lingo-tracker bundle
```

Generate specific bundle(s):
```bash
lingo-tracker bundle --name core
lingo-tracker bundle --name core,admin
```

Generate bundles for specific locale(s):
```bash
lingo-tracker bundle --locale en,fr
```

Verbose output (shows all warnings):
```bash
lingo-tracker bundle --verbose
```

Combined options:
```bash
lingo-tracker bundle --name core --locale en,fr --verbose
```

Override token casing for generated types:
```bash
lingo-tracker bundle --token-casing camelCase
```

Custom constant name for a single bundle:
```bash
lingo-tracker bundle --name core --token-constant-name MY_KEYS
```

**Output:**

Normal output (default):
```
🔄 Generating bundle: core

   ✅ Files generated: 3
   ✅ Locales: en, fr-ca, es
   ⚠️  Warnings: 2
```

Verbose output (`--verbose` flag):
```
🔄 Generating bundle: core
   Locales: en, fr-ca

   ✅ Files generated: 2
   ✅ Locales: en, fr-ca
   ⚠️  Warnings: 1
      - Bundle 'core' for locale 'es' is empty
```

Summary for multiple bundles:
```
🔄 Generating bundle: core

   ✅ Files generated: 3
   ✅ Locales: en, fr-ca, es

🔄 Generating bundle: admin

   ✅ Files generated: 3
   ✅ Locales: en, fr-ca, es

📊 Summary (2 bundles):
   Total files generated: 6
```

**Bundle Configuration:**

Bundles are configured in `.lingo-tracker.json`:

```json
{
  "tokenCasing": "upperCase",
  "bundles": {
    "main": {
      "bundleName": "{locale}",
      "dist": "./dist/i18n",
      "collections": "All"
    },
    "admin": {
      "bundleName": "admin-{locale}",
      "dist": "./dist/admin/i18n",
      "tokenCasing": "camelCase",
      "collections": [
        {
          "name": "Admin",
          "entriesSelectionRules": "All"
        }
      ]
    },
    "core": {
      "bundleName": "resources.{locale}",
      "dist": "./src/assets/i18n",
      "collections": [
        {
          "name": "Common",
          "bundledKeyPrefix": "common",
          "entriesSelectionRules": [
            {
              "matchingPattern": "apps.common.*",
              "matchingTags": ["ui"],
              "matchingTagOperator": "All"
            }
          ],
          "mergeStrategy": "merge"
        }
      ]
    }
  }
}
```

**Bundle Definition Fields:**

- `bundleName` - Output filename pattern (use `{locale}` placeholder for locale substitution)
- `dist` - Output directory path (relative to project root)
- `tokenCasing` (optional) - Casing style for generated type token keys: `"upperCase"` (default) or `"camelCase"`. When set on a bundle, overrides the global `tokenCasing`. See [Bundle Type Generation](./features/bundle-type-generation.md) for details
- `tokenConstantName` (optional) - Custom name for the generated TypeScript constant. Must be a valid JavaScript identifier. When omitted, derived from the bundle key (e.g., `common` → `COMMON_TOKENS`). See [Bundle Type Generation](./features/bundle-type-generation.md) for details
- `collections` - Either `"All"` or array of collection definitions
  - `name` - Collection name from config
  - `bundledKeyPrefix` (optional) - Prefix to add to all keys from this collection
  - `entriesSelectionRules` - Either `"All"` or array of selection rules
    - `matchingPattern` - Pattern to match keys: `"*"` (all), `"apps.*"` (wildcard), or exact key
    - `matchingTags` (optional) - Tags to filter by
    - `matchingTagOperator` (optional) - `"All"` (requires all tags) or `"Any"` (requires any tag, default)
  - `mergeStrategy` (optional) - `"merge"` (first wins, default) or `"override"` (later wins)

**Merge Strategies:**

When multiple collections contribute the same key:

- **`merge`** (default): First collection wins - key from earlier collection is kept
- **`override`**: Later collection wins - key from later collection overwrites previous

**Pattern Matching:**

- `"*"` - Matches all keys
- `"apps.*"` - Matches `apps` and all keys starting with `apps.`
- `"apps.common.buttons.ok"` - Exact match only

**Tag Filtering:**

- `matchingTags: ["ui"]` with `matchingTagOperator: "Any"` - Entry must have `ui` tag
- `matchingTags: ["ui", "buttons"]` with `matchingTagOperator: "All"` - Entry must have both tags
- `matchingTags: ["*"]` - Entry must have at least one tag (any tag)

**Notes:**
- Bundle generation is **read-only**: it never modifies source translation files
- Empty bundles (no matching entries) generate a warning but don't create files
- Base locale translations use the `source` property; other locales use their locale key
- Warnings include empty bundles, missing collections, and missing translations
- For detailed examples and integration guides, see [Bundling Guide](./guides/bundling.md)

---

## Search Commands

### find-similar

Find existing translation resources whose base locale value is similar to a given string. Useful for detecting duplicate or near-duplicate translations before adding a new resource.

**Usage:**

```bash
lingo-tracker find-similar [options]
```

**Options:**

- `--collection <name>` - Collection to search (required)
- `--value <text>` - Base locale text to compare against (required)
- `--max-results <n>` - Maximum number of results to return (default: `5`)

**Examples:**

Find resources similar to "Save":
```bash
lingo-tracker find-similar \
  --collection Main \
  --value "Save"
```

Limit results:
```bash
lingo-tracker find-similar \
  --collection Main \
  --value "Are you sure you want to delete this item?" \
  --max-results 3
```

**Output:**

When matches are found:
```
Similar values found for "Save":
  buttons.save → "Save" (similarity: 100%)
  buttons.saveAndClose → "Save and Close" (similarity: 89%)
```

When no matches meet the similarity threshold:
```
No similar values found for "Save draft".
```

**How It Works:**

1. Runs a broad substring pre-filter via `searchTranslations` (up to 50 candidates)
2. Scores each candidate using normalised Levenshtein distance (case-insensitive)
3. Keeps only results with a similarity score ≥ 80%
4. Returns top N results sorted by score descending

**Notes:**
- Only the base locale value is compared (not translations)
- Only `exact-value` and `partial-value` match types are considered; key-based matches are excluded
- Similarity threshold is fixed at 80% — results below this are not shown
- Non-interactive only; does not prompt for missing options

---

## Validation Commands

### validate

Validate translation completeness and readiness for production release. This command checks all resources across all locales and collections, ensuring translations meet quality standards before deployment.

**Usage:**

```bash
lingo-tracker validate [options]
```

**Options:**

- `--allow-translated` - Treat 'translated' status as warning instead of failure (default: false)

**What Validate Does:**

1. **Loads all resources** from all configured collections
2. **Checks translation status** for every resource in every target locale
3. **Collects all validation results** (does not stop at first error)
4. **Categorizes findings** into failures, warnings, and successes
5. **Reports comprehensive results** grouped by locale

**Validation Rules:**

| Status | Default Behavior | With `--allow-translated` |
|--------|------------------|---------------------------|
| `new` | ❌ Failure | ❌ Failure |
| `stale` | ❌ Failure | ❌ Failure |
| `translated` | ❌ Failure | ⚠️ Warning |
| `verified` | ✅ Success | ✅ Success |

**Exit Codes:**

- `0` - All validations passed (all resources verified)
- `1` - Validation failures found (new/stale resources or translated without `--allow-translated` flag)

**When to Use Validate:**

- As a quality gate in CI/CD pipelines before release
- Before deploying to production environments
- To verify all translations are complete and verified
- To enforce translation quality standards in automated builds
- During staging deployments (with `--allow-translated` for relaxed requirements)

**Examples:**

Strict validation (production):
```bash
lingo-tracker validate
```

Output on failure:
```
❌ Translation Validation FAILED

Validation Summary by Locale:
  es:
    new: 3
    stale: 2
    translated: 1
    verified: 45

  fr-ca:
    new: 1
    stale: 0
    translated: 2
    verified: 48

Failures (6 resources):
  es:
    - apps.common.buttons.submit (new)
    - apps.common.errors.network (new)
    - apps.features.dashboard.title (new)
    - apps.common.buttons.save (stale)
    - apps.features.settings.label (stale)
    - apps.common.buttons.cancel (translated)

  fr-ca:
    - apps.common.buttons.submit (new)
    - apps.features.dashboard.subtitle (translated)
    - apps.features.profile.header (translated)

Total: 6 failures, 0 warnings
```

Relaxed validation (staging):
```bash
lingo-tracker validate --allow-translated
```

Output with warnings:
```
⚠️  Translation Validation PASSED with warnings

Validation Summary by Locale:
  es:
    new: 3
    stale: 2
    translated: 1
    verified: 45

  fr-ca:
    new: 1
    stale: 0
    translated: 2
    verified: 48

Failures (5 resources):
  es:
    - apps.common.buttons.submit (new)
    - apps.common.errors.network (new)
    - apps.features.dashboard.title (new)
    - apps.common.buttons.save (stale)
    - apps.features.settings.label (stale)

  fr-ca:
    - apps.common.buttons.submit (new)

Warnings (3 resources):
  es:
    - apps.common.buttons.cancel (translated)

  fr-ca:
    - apps.features.dashboard.subtitle (translated)
    - apps.features.profile.header (translated)

Total: 5 failures, 3 warnings
```

CI/CD Integration Examples:

**GitHub Actions:**
```yaml
- name: Validate translations
  run: lingo-tracker validate
```

**GitLab CI:**
```yaml
validate-translations:
  script:
    - lingo-tracker validate
```

**Jenkins:**
```groovy
sh 'lingo-tracker validate'
```

**CircleCI:**
```yaml
- run:
    name: Validate translations
    command: lingo-tracker validate
```

Staging pipeline (allow translated):
```yaml
- name: Validate translations (staging)
  run: lingo-tracker validate --allow-translated
```

**Comprehensive Validation:**

The validate command performs a comprehensive check:
- Validates **ALL** collections (no filtering)
- Validates **ALL** target locales (excludes base locale)
- Collects **ALL** validation results before reporting
- Shows **COMPLETE** summary of all failures and warnings
- Does **NOT** stop at first error

**Notes:**

- Non-interactive only (designed for CI/CD, never prompts)
- Validates all target locales (base locale is excluded)
- Validates all collections (no collection filtering)
- Reports all issues comprehensively before exiting
- Exit code reflects overall validation status after checking everything
- Use `--allow-translated` for staging deployments where not all translations may be verified yet

---

## Data Exchange Commands

### export

Export translation resources to XLIFF or JSON format for integration with translation services, external systems, and third-party tools.

**Usage:**

```bash
lingo-tracker export [options]
```

**Options:**

- `-f, --format <format>` - Export format: `xliff` or `json` (required in non-interactive mode)
- `-c, --collection <names>` - Specific collection(s) to export (comma-separated). If not specified, exports all collections
- `-l, --locale <locales>` - Target locale(s) to export (comma-separated). If not specified, exports all target locales (excludes base locale)
- `-s, --status <statuses>` - Filter by translation status (comma-separated). Default: `new,stale`
  - Valid values: `new`, `translated`, `stale`, `verified`
- `-t, --tags <tags>` - Filter by tags (comma-separated). Only resources with matching tags are included
- `-o, --output <path>` - Output directory path. Default: from config `exportFolder` or `dist/lingo-export`
- `--filename <pattern>` - Custom filename pattern with placeholders
- `--dry-run` - Preview export without writing files (shows what would be exported)
- `--verbose` - Show detailed export progress

**JSON-Specific Options:**

- `--structure <type>` - JSON structure: `hierarchical` (nested objects) or `flat` (dot-delimited keys). Default: `hierarchical`
- `--rich` - Include metadata in JSON objects (creates objects instead of string values). Default: `false`
- `--include-base` - Include base locale value in rich objects. Default: `false`
- `--include-status` - Include translation status in rich objects. Default: `false`
- `--include-comment` - Include translator comments in rich objects. Default: `true`
- `--include-tags` - Include tags array in rich objects. Default: `false`

**Filename Placeholders:**

Customize output filenames using these placeholders:

- `{locale}` - Target locale code (e.g., `es`, `fr-ca`)
- `{target}` - Alias for `{locale}`
- `{source}` - Base locale code (e.g., `en`)
- `{date}` - Current date in YYYY-MM-DD format

**What Export Does:**

1. **Loads resources** from specified collections
2. **Filters resources** by locale, status, and tags
3. **Transforms data** to target format (XLIFF or JSON)
4. **Writes files** to output directory (one file per locale)
5. **Generates summary** report with statistics, warnings, and errors

**When to Use Export:**

- Sending translations to translation agencies (use XLIFF format)
- Integrating with Translation Management Systems (TMS)
- Extracting translations for review or backup
- Generating custom translation deliverables
- Exporting subsets of translations using status/tag filters

**Examples:**

Interactive mode (prompts for options):
```bash
lingo-tracker export
```

Export all collections to XLIFF for all target locales:
```bash
lingo-tracker export --format xliff
```

Export specific collection to JSON:
```bash
lingo-tracker export --format json --collection Main
```

Export multiple collections for Spanish only:
```bash
lingo-tracker export --format xliff --collection Main,Admin --locale es
```

Export only untranslated and stale translations (default):
```bash
lingo-tracker export --format xliff --locale es
# Same as: --status new,stale
```

Export all translations regardless of status:
```bash
lingo-tracker export --format json --locale es --status new,translated,stale,verified
```

Export only verified translations:
```bash
lingo-tracker export --format xliff --status verified
```

Export with tag filtering:
```bash
lingo-tracker export --format json --tags ui,buttons
```

Export with custom filename pattern:
```bash
lingo-tracker export --format xliff --filename "translation-{source}-{target}-{date}"
# Generates: translation-en-es-2025-12-14.xliff
```

JSON export with hierarchical structure (default):
```bash
lingo-tracker export --format json --locale es
```

Output:
```json
{
  "common": {
    "buttons": {
      "ok": "Aceptar",
      "cancel": "Cancelar"
    }
  }
}
```

JSON export with flat structure:
```bash
lingo-tracker export --format json --locale es --structure flat
```

Output:
```json
{
  "common.buttons.ok": "Aceptar",
  "common.buttons.cancel": "Cancelar"
}
```

JSON export with rich objects (includes metadata):
```bash
lingo-tracker export --format json --locale es --rich --include-base --include-status
```

Output:
```json
{
  "common": {
    "buttons": {
      "ok": {
        "value": "Aceptar",
        "baseValue": "OK",
        "status": "translated",
        "comment": "OK button in dialogs"
      }
    }
  }
}
```

Dry-run to preview export:
```bash
lingo-tracker export --format json --collection Main --locale es --dry-run
```

Output:
```
🔄 Exporting to JSON...
   Collections: Main
   Locales: es
   Output: /path/to/dist/lingo-export
   [DRY RUN]
   Processing es (42 resources)

📊 Export Summary:
   Files Created: 0
   Resources Exported: 42
```

Verbose output for detailed progress:
```bash
lingo-tracker export --format json --locale es --verbose
```

Output:
```
🔄 Exporting to JSON...
   Collections: Main
   Locales: es
   Output: /path/to/dist/lingo-export
   Processing es (42 resources)
   Writing /path/to/dist/lingo-export/es.json
   ✅ es: Exported 42 resources to es.json

📊 Export Summary:
   Files Created: 1
   Resources Exported: 42

📄 Summary written to: /path/to/dist/lingo-export/export-summary.md
```

**Export Summary Report:**

Every export generates an `export-summary.md` file in the output directory containing:

- Export configuration (format, collections, locales, filters)
- Statistics (resources exported, files created)
- List of created files with resource counts
- Warnings (overwritten files, empty results)
- Errors (malformed files, missing metadata, hierarchical conflicts)

**XLIFF Format Notes:**

- Generates XLIFF 1.2 format (industry standard)
- One file per source-target locale pair
- `<source>` contains base locale value
- `<target>` contains translation
- `<note>` contains translator comments (if present)
- Compatible with professional translation tools (SDL Trados, MemoQ, etc.)
- ICU message format preserved as-is

**JSON Format Notes:**

- Flexible format for custom integrations
- Supports both hierarchical (nested) and flat (dot-delimited) structures
- Simple format (string values) ideal for direct use in applications
- Rich format (object values) includes metadata for validation and processing
- Collections are merged into single output (last write wins for duplicate keys)

**Filtering Behavior:**

- **Status filtering** is per-locale: a resource is included in a locale if it matches the filter for that locale
- **Tag filtering** uses OR logic: resource must have at least one of the specified tags
- **Base locale** is never exported (only target locales)
- Resources without metadata are omitted and logged in errors
- Empty export results don't create files (warning logged)

**Error Handling:**

- Malformed files: Skipped with detailed warning, export continues
- Missing metadata: Resource omitted, logged in errors
- Hierarchical conflicts: Logged when a key is both a parent and leaf value (JSON hierarchical only)
- Non-writable output directory: Fails with clear error message
- Empty results: No files created, warning shown

**Notes:**

- Export is **read-only**: never modifies source translation files
- Multiple collections merge into single output file per locale (last write wins)
- Base locale is excluded from export (use bundle command for base locale)
- Dry-run shows accurate resource counts without creating files
- For detailed format specifications and examples, see [Export Feature Documentation](./features/export.md)

---

### import

Import translation resources from XLIFF or JSON files into a collection. Supports professional translation workflows, language expert verification, system migrations, and bulk corrections.

For full format specifications, workflow examples, and ICU auto-fix details, see the [Import Feature Documentation](./features/import.md).

**Usage:**

```bash
lingo-tracker import --source <file> --locale <locale> [options]
```

**Options:**

- `-f, --format <format>` - Import format: `xliff` or `json`. Default: auto-detected from file extension (`.xlf`/`.xliff` → xliff; `.json` → json)
- `-s, --source <path>` - Path to the import file (required)
- `-l, --locale <locale>` - Target locale for the import, e.g., `es`, `fr-ca` (required)
- `-c, --collection <name>` - Target collection to import into. If not specified, prompts or auto-selects
- `--strategy <strategy>` - Import strategy (see below). Default: `translation-service`
- `--update-comments` - Update resource comments from import data. Default: `false`
- `--update-tags` - Update resource tags from rich JSON. Default: `false`
- `--preserve-status` - Allow rich JSON to specify status (advanced). Default: `false`
- `--create-missing` - Create new resources if they don't exist
- `--validate-base` - Warn if the source base value differs from existing. Default: `true`
- `--dry-run` - Preview what would be imported without modifying files. Default: `false`
- `--verbose` - Show detailed import progress. Default: `false`

**Import Strategies:**

| Strategy | Description |
|----------|-------------|
| `translation-service` (default) | Sets status to `translated`. For translation agencies. Does not create missing resources. |
| `verification` | Sets status to `verified`. For native-speaker review and approval. Does not create missing resources. |
| `migration` | Sets status to `translated`. Creates missing resources (`--create-missing` defaults to `true`). Resolves Transloco-style key refs. Updates comments and tags by default. |
| `update` | Preserves existing status. Bulk-updates values without changing metadata. Does not create missing resources. |

**Examples:**

Interactive mode (prompts for all required values):
```bash
lingo-tracker import
```

Import XLIFF from a translation service (default strategy):
```bash
lingo-tracker import \
  --source dist/lingo-import/es.xliff \
  --locale es
```

Import with explicit strategy:
```bash
lingo-tracker import \
  --source dist/lingo-import/fr.xliff \
  --locale fr \
  --strategy translation-service
```

Import for language expert verification:
```bash
lingo-tracker import \
  --source fr-reviewed.xliff \
  --locale fr \
  --strategy verification
```

Migrate from another translation system (creates missing resources):
```bash
lingo-tracker import \
  --source old-system-fr.json \
  --locale fr \
  --strategy migration
```

Bulk-correct existing translations without changing status:
```bash
lingo-tracker import \
  --source corrections-de.json \
  --locale de \
  --strategy update
```

Dry-run to preview what would be imported:
```bash
lingo-tracker import \
  --source translations-es.xliff \
  --locale es \
  --dry-run
```

Verbose output to see detailed progress:
```bash
lingo-tracker import \
  --source translations-es.xliff \
  --locale es \
  --verbose
```

Import into a specific collection:
```bash
lingo-tracker import \
  --source admin-es.xliff \
  --locale es \
  --collection Admin \
  --strategy translation-service
```

**Round-Trip Workflow:**

```bash
# 1. Export resources needing translation
lingo-tracker export --format xliff --locale es --status new,stale

# 2. (Send es.xliff to translation agency, receive back translated file)

# 3. Import translated file
lingo-tracker import --source es.xliff --locale es --strategy translation-service

# 4. Optionally verify with a language expert
lingo-tracker import --source es-reviewed.xliff --locale es --strategy verification
```

**Notes:**
- Format is auto-detected from the file extension; use `--format` to override
- Every import generates an `import-summary.md` in the import folder with statistics, status transitions, ICU auto-fixes, warnings, and errors
- ICU message placeholder errors (renamed or missing placeholders) are automatically detected and fixed where possible; all auto-fixes are reported in the summary
- Dry-run mode produces the same summary report using "Would" language, with no files modified
- In interactive mode, a wizard guides you through source file selection, locale, collection, and strategy

---

## AI Tooling Commands

### install-skill

Generate a customised LingoTracker AI skill for use in another Angular/Transloco repository. The skill guides AI assistants (Claude Code and compatible tools) through the i18n workflow — detecting hardcoded strings, adding resources, bundling, and updating components to use Transloco.

The generated skill is pre-configured with the collection names, bundle names, and token constants of the target repository, so the AI assistant can follow the correct workflow without guessing project-specific details.

**Usage:**

```bash
lingo-tracker install-skill [options]
```

**Options:**

- `--collection <spec>` - Collection specification in the format `name:bundle:TokenConstant:tokenFilePath`. Repeatable — pass once per collection
- `--dir <path>` - Output directory for the skill files (default: `.claude`)
- `--token-casing <casing>` - Casing style for token keys: `upperCase` or `camelCase` (default: `upperCase`)

**Output:**

Writes two files to `{dir}/skills/lingo-tracker/`:

- `SKILL.md` — the main skill file, customised with the provided collection, bundle, and token values
- `references/patterns.md` — static Angular/Transloco code pattern reference

**Examples:**

Interactive mode (prompts for AI tool directory, collection details, and token casing):
```bash
lingo-tracker install-skill
```

Interactive mode prompts:
1. AI tool directory: `.claude` (default) | `.agents` | `.cursor`
2. Collection details (looping — name, bundle name, token constant, token file path), with an option to add more after each
3. Token casing: `upperCase` | `camelCase`

Non-interactive mode with a single collection:
```bash
lingo-tracker install-skill \
  --collection trackerResources:tracker:TRACKER_TOKENS:apps/tracker/src/i18n-types/tracker-resources.ts
```

Non-interactive mode with multiple collections and camelCase tokens:
```bash
lingo-tracker install-skill \
  --collection trackerResources:tracker:TRACKER_TOKENS:apps/tracker/src/i18n-types/tracker-resources.ts \
  --collection adminResources:admin:ADMIN_TOKENS:apps/admin/src/i18n-types/admin-resources.ts \
  --token-casing camelCase
```

Output to a custom directory (e.g. for Cursor):
```bash
lingo-tracker install-skill \
  --collection myApp:main:MY_APP_TOKENS:src/i18n-types/my-app.ts \
  --dir .cursor
```

**Collection Specification Format:**

Each `--collection` value is a colon-separated string with four parts:

| Part | Description | Example |
|------|-------------|---------|
| `name` | Collection name as registered in `.lingo-tracker.json` | `trackerResources` |
| `bundle` | Bundle name used with `lingo-tracker bundle --name` | `tracker` |
| `TokenConstant` | Name of the exported TypeScript token constant | `TRACKER_TOKENS` |
| `tokenFilePath` | Path to the generated token file (relative to project root) | `apps/tracker/src/i18n-types/tracker-resources.ts` |

**Notes:**
- Run this command once after setting up LingoTracker in a new repository
- Commit the generated skill files (`.claude/skills/lingo-tracker/`) to version control so the entire team benefits
- If you change collection names, bundle names, or token constants, re-run the command to regenerate the skill
- The `--dir` option should match the AI tool your team uses (`.claude` for Claude Code, `.cursor` for Cursor, etc.)

---

## Configuration

All commands read from `.lingo-tracker.json` in the project root. This file is created by the `init` command.

### Configuration Structure

```json
{
  "exportFolder": "dist/lingo-export",
  "importFolder": "dist/lingo-import",
  "baseLocale": "en",
  "locales": ["en", "fr-ca", "es"],
  "tokenCasing": "upperCase",
  "collections": {
    "Main": {
      "translationsFolder": "apps/web/src/assets/i18n"
    },
    "Admin": {
      "translationsFolder": "apps/admin/src/assets/i18n",
      "baseLocale": "en-GB"
    }
  }
}
```

- **Global fields** (`exportFolder`, `importFolder`, `baseLocale`, `locales`, `tokenCasing`) apply to all collections and bundles by default
- **Per-collection fields** can override global settings for specific collections
- **`tokenCasing`** (optional) - Controls the casing style for generated type token keys. Accepts `"upperCase"` (default, SCREAMING_SNAKE_CASE) or `"camelCase"`. Can be set globally or per-bundle. See [Bundle Type Generation](./features/bundle-type-generation.md) for details. Precedence: CLI flag `--token-casing` > per-bundle config > global config > default (`"upperCase"`)

---

## CI/CD Usage

All commands support non-interactive mode for use in CI/CD pipelines. To ensure non-interactive behavior:

1. Provide all required options via command-line flags
2. Use the `--yes` flag for commands that require confirmation (like `delete-resource`)
3. The CLI auto-detects TTY and will throw an error if required options are missing in non-interactive environments

**Example CI/CD workflow:**

```bash
# Initialize a project in CI
lingo-tracker init \
  --collection-name Main \
  --translations-folder src/assets/i18n \
  --base-locale en \
  --locales en fr-ca es

# Add a collection in CI
lingo-tracker add-collection \
  --collection-name Admin \
  --translations-folder src/admin/i18n

# Add a resource in CI
lingo-tracker add-resource \
  --collection Main \
  --key feature.new.title \
  --value "New Feature" \
  --comment "Title for the new feature page"

# Delete resources in CI
lingo-tracker delete-resource \
  --collection Main \
  --key "deprecated.old.feature" \
  --yes

# Validate translations before deployment (production)
lingo-tracker validate

# Validate translations with relaxed requirements (staging)
lingo-tracker validate --allow-translated

# Export translations to XLIFF for translation agency
lingo-tracker export \
  --format xliff \
  --collection Main \
  --status new,stale \
  --verbose

# Export all translations to JSON for backup
lingo-tracker export \
  --format json \
  --status new,translated,stale,verified \
  --filename "backup-{locale}-{date}"
```

**Complete CI/CD Pipeline Example:**

```yaml
# GitHub Actions example
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: pnpm install

      # Validate translations as quality gate
      - name: Validate translations
        run: lingo-tracker validate

      # Only build and deploy if validation passes
      - name: Build
        run: pnpm run build

      - name: Deploy
        run: pnpm run deploy
```

---

## Tips and Best Practices

### Key Naming Conventions

- Use dot-delimited keys that reflect the hierarchy: `apps.common.buttons.ok`
- Keys decompose into folder paths: `apps.common.buttons.ok` → `apps/common/buttons/` folder
- Keep keys descriptive and consistent across your project

### Tags for Organization

- Use tags to organize related resources: `--tags "ui,buttons,dialogs"`
- Tags can be used for filtering during export/import operations
- Tags are comma-separated and stored in metadata

### Working with Multiple Collections

- Use collections to separate translation sources (e.g., main app, admin panel, mobile app)
- Each collection can have its own configuration overrides
- Collections share global defaults unless explicitly overridden

### Error Handling

- Commands report errors clearly with actionable messages
- Bulk operations (like `delete-resource` with multiple keys) use best-effort approach
- Check exit codes in scripts: 0 for success, non-zero for errors
