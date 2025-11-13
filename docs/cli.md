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

- `--collectionName <name>` - Name of the initial collection key, e.g., "Main" (required in non-interactive mode)
- `--translationsFolder <path>` - Path to the translations directory for this collection (required in non-interactive mode)
- `--exportFolder <path>` - Output folder for exports (default: `dist/lingo-export`)
- `--importFolder <path>` - Input folder for imports (default: `dist/lingo-import`)
- `--subfolderSplitThreshold <number>` - Split large folders after N files (default: `100`)
- `--baseLocale <locale>` - Base/authoring locale (default: `en`)
- `--locales <locales...>` - Space-separated list of supported locales (e.g., `en fr-ca es de`)

**Examples:**

Interactive mode (prompts for values):
```bash
lingo-tracker init
```

Non-interactive mode (CI-safe, all required options provided):
```bash
lingo-tracker init \
  --collectionName Main \
  --translationsFolder apps/web/src/assets/i18n \
  --exportFolder dist/lingo-export \
  --importFolder dist/lingo-import \
  --subfolderSplitThreshold 200 \
  --baseLocale en \
  --locales en fr-ca es de
```

**Notes:**
- Run this command once in your project root to create `.lingo-tracker.json`
- Creates the initial configuration with one collection
- Commit `.lingo-tracker.json` to version control

---

### add-collection

Add a new translation collection to an existing Lingo Tracker project. Collections allow you to manage multiple translation sources within the same repository (e.g., main app, admin panel, mobile app).

**Usage:**

```bash
lingo-tracker add-collection [options]
```

**Options:**

- `--collectionName <name>` - Name of the new collection (required in non-interactive mode)
- `--translationsFolder <path>` - Path to the translations directory for this collection (required in non-interactive mode)
- `--exportFolder <path>` - Override global export folder for this collection
- `--importFolder <path>` - Override global import folder for this collection
- `--subfolderSplitThreshold <number>` - Override global split threshold
- `--baseLocale <locale>` - Override global base locale
- `--locales <locales...>` - Override global locales list

**Examples:**

Interactive mode (prompts for collection details):
```bash
lingo-tracker add-collection
```

Simple, using global defaults:
```bash
lingo-tracker add-collection \
  --collectionName Admin \
  --translationsFolder apps/admin/src/assets/i18n
```

With collection-specific overrides (only differences are saved):
```bash
lingo-tracker add-collection \
  --collectionName Mobile \
  --translationsFolder apps/mobile/src/i18n \
  --baseLocale en-GB \
  --subfolderSplitThreshold 50
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

- `--collectionName <name>` - Name of the collection to delete (required in non-interactive mode)

**Examples:**

Interactive mode (prompts for collection):
```bash
lingo-tracker delete-collection
```

Non-interactive mode:
```bash
lingo-tracker delete-collection --collectionName Mobile
```

**Notes:**
- Removes the collection entry from `.lingo-tracker.json`
- Does NOT delete translation files from disk (data is preserved)
- Will prompt for confirmation before deletion (in interactive mode)

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
- `--targetFolder <folder>` - Optional dot-delimited path override for folder placement
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
  --targetFolder apps.common \
  --translations '[{"locale":"es","value":"Aceptar","status":"translated"},{"locale":"fr-ca","value":"OK","status":"new"}]'
```

**Notes:**
- In interactive mode, you'll be prompted if you want to provide translations for each configured locale
- Resources are placed in the appropriate folder based on the key and optional `--targetFolder`
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

## Configuration

All commands read from `.lingo-tracker.json` in the project root. This file is created by the `init` command.

### Configuration Structure

```json
{
  "exportFolder": "dist/lingo-export",
  "importFolder": "dist/lingo-import",
  "subfolderSplitThreshold": 100,
  "baseLocale": "en",
  "locales": ["en", "fr-ca", "es"],
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

- **Global fields** (`exportFolder`, `importFolder`, `subfolderSplitThreshold`, `baseLocale`, `locales`) apply to all collections by default
- **Per-collection fields** can override global settings for specific collections

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
  --collectionName Main \
  --translationsFolder src/assets/i18n \
  --baseLocale en \
  --locales en fr-ca es

# Add a collection in CI
lingo-tracker add-collection \
  --collectionName Admin \
  --translationsFolder src/admin/i18n

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
