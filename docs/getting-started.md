## Getting Started

Lingo Tracker helps you track, validate, and manage translations across projects. This guide shows how to install the CLI, initialize a project, and add collections.

### Install

- Node.js >= 22.16 and pnpm >= 10 are recommended.
- Add the CLI to your workspace (recommended during development):

```bash
pnpm nx build cli && pnpm link --global ./dist/apps/cli
# Now the `lingo-tracker` command is available globally from your build output
```

Or install the built artifact wherever you publish it and ensure `lingo-tracker` is on your PATH.

### Initialize a project

Run in your project root to create `.lingo-tracker.json`:

```bash
lingo-tracker init
```

If you run it interactively, you will be prompted for missing values. In non‑interactive environments, pass the required options.

- Required when non‑interactive: `--collectionName`, `--translationsFolder`
- All options:
  - `--collectionName <name>`: Name of the initial collection key (e.g., "Main").
  - `--translationsFolder <path>`: Path to the translations directory for this collection.
  - `--exportFolder <path>`: Output folder for exports. Default: `dist/lingo-export`.
  - `--importFolder <path>`: Input folder for imports. Default: `dist/lingo-import`.
  - `--baseLocale <locale>`: Base/authoring locale. Default: `en`.
  - `--locales <locales...>`: Supported locales list. Example: `en fr-ca es de`.

Example (CI-safe, no prompts):

```bash
lingo-tracker init \
  --collectionName Main \
  --translationsFolder apps/web/src/assets/i18n \
  --exportFolder dist/lingo-export \
  --importFolder dist/lingo-import \
  --baseLocale en \
  --locales en fr-ca es de
```

### The configuration file

Initialization writes a JSON config named `.lingo-tracker.json` at your project root. Structure:

```json
{
  "exportFolder": "dist/lingo-export",
  "importFolder": "dist/lingo-import",
  "baseLocale": "en",
  "locales": [
    "en"
  ],
  "collections": {
    "Main": {
      "translationsFolder": "apps/web/src/assets/i18n"
    }
  }
}
```

- Global fields (`exportFolder`, `importFolder`, `baseLocale`, `locales`) apply to all collections by default.
- Each collection requires `translationsFolder`. A collection may override any global field locally if needed.

Collection shape:

```json
{
  "translationsFolder": "path/to/translations",
  "exportFolder": "optional/override",
  "importFolder": "optional/override",
  "baseLocale": "en",
  "locales": ["en", "fr-ca"]
}
```

### Add additional collections

Use `add-collection` to register more translation sources within the same repo. This reuses global defaults and only persists overrides when they differ.

```bash
lingo-tracker add-collection
```

- Required when non‑interactive: `--collectionName`, `--translationsFolder`
- All options (same meanings as `init`):
  - `--collectionName <name>`
  - `--translationsFolder <path>`
  - `--exportFolder <path>`
  - `--importFolder <path>`
  - `--baseLocale <locale>`
  - `--locales <locales...>`

Examples:

- Simple, rely on global defaults:

```bash
lingo-tracker add-collection \
  --collectionName Admin \
  --translationsFolder apps/admin/src/assets/i18n
```

- Override per-collection settings (only differences are saved under the collection):

```bash
lingo-tracker add-collection \
  --collectionName Mobile \
  --translationsFolder apps/mobile/src/i18n \
  --baseLocale en-GB
```

Notes:
- If `.lingo-tracker.json` is missing or invalid, the command will exit with a helpful message.
- If the collection name already exists, the command will refuse to overwrite.

### Non-interactive and CI usage

Both commands support fully non‑interactive runs; provide all required flags to avoid prompts. The CLI auto‑detects TTY and will throw if a required option is missing in non‑interactive mode.

- Required flags in CI:
  - `init`: `--collectionName`, `--translationsFolder` (others optional)
  - `add-collection`: `--collectionName`, `--translationsFolder`

### Quick checklist

- Install and expose `lingo-tracker` on your PATH
- Run `lingo-tracker init` once in the repo
- Add more collections with `lingo-tracker add-collection`
- Commit `.lingo-tracker.json`

That's it. You're ready to track and manage translations with Lingo Tracker.

### Maintaining Translation Consistency

After setting up your project, you may need to normalize your translation files to ensure consistency. Normalization is particularly useful in these scenarios:

#### When to Normalize

**After Manual Edits**
If you or your team manually edit JSON translation files, checksums and statuses may become outdated. Normalization recomputes all checksums and updates statuses accordingly.

**After Adding New Locales**
When you add a new locale to your configuration (e.g., adding `de` to your locales list), existing resources won't have entries for the new locale. Normalization creates these missing entries with the base value and marks them as `new`.

**After Importing Translations**
External translation tools or services may provide translations without proper metadata. Normalization ensures all entries have correct checksums and statuses.

**Periodic Maintenance**
Running normalize periodically helps maintain consistency and cleans up your folder structure by removing empty directories.

**When Statuses Seem Wrong**
If translation statuses don't match reality (e.g., translations marked as `stale` when they shouldn't be), normalization corrects these based on actual checksums.

#### What Normalization Does

The `normalize` command performs these operations:

1. **Recomputes Checksums**: Updates MD5 checksums for the base locale and all translations to reflect current values
2. **Adds Missing Locales**: Creates entries for any configured locales that don't exist in a resource, using the base value with status `new`
3. **Updates Statuses**: Sets correct translation statuses based on checksums:
   - `new` - Locale entry was just added or matches the base value
   - `stale` - Base value changed since the translation was last updated
   - `translated` / `verified` - Preserved when base value hasn't changed
4. **Creates Missing Files**: Ensures both `resource_entries.json` and `tracker_meta.json` exist at every folder level
5. **Cleans Up Empty Folders**: Removes directories that no longer contain translation entries

#### Folder Cleanup Details

Normalization automatically removes empty folders to keep your translations directory clean and organized:

- **Empty Folder Definition**: A folder is considered empty if it has:
  - No `resource_entries.json` file, OR
  - An empty `resource_entries.json` (no entries or `{}`), AND
  - No subfolders containing entries

- **What Gets Removed**:
  - Folders with only `tracker_meta.json` (metadata without entries)
  - Folders with only hidden files like `.gitkeep` or `.DS_Store`
  - Parent folders that become empty after their children are removed

- **What's Protected**:
  - The root translations folder is never removed, even if empty
  - Any folder containing `resource_entries.json` with actual entries
  - Any folder with subfolders that contain entries

- **Bottom-Up Cleanup**: The cleanup process starts with the deepest folders and works up to the root, allowing recursive removal of entire empty folder trees

#### Running Normalize

Preview what would change (recommended first step):
```bash
lingo-tracker normalize --collection Main --dry-run
```

Normalize a specific collection:
```bash
lingo-tracker normalize --collection Main
```

Normalize all collections:
```bash
lingo-tracker normalize --all
```

Get JSON output for automation:
```bash
lingo-tracker normalize --collection Main --json
```

#### Understanding the Output

After normalization, you'll see a summary like this:

```
🔄 Normalizing collection: Main

   ✅ Entries processed: 42
   ✅ Locales added: 7
   ✅ Files created: 2
   ✅ Files updated: 15
   ✅ Folders removed: 3
```

- **Entries processed**: Total number of translation resources examined
- **Locales added**: Number of missing locale entries that were created
- **Files created**: Number of new JSON files created (resource_entries.json or tracker_meta.json)
- **Files updated**: Number of existing files that had metadata updated
- **Folders removed**: Number of empty folders that were deleted

#### Best Practices

1. **Use Dry-Run First**: Always run with `--dry-run` to preview changes before applying them
2. **Commit Before Normalizing**: Ensure you have a clean Git state so you can review changes
3. **Normalize After Config Changes**: Any time you modify locale settings, run normalize to update all resources
4. **Regular Maintenance**: Consider adding normalize to your CI/CD pipeline or running it periodically
5. **Check Folder Cleanup**: Review the "Folders removed" count to understand what's being cleaned up

#### Non-Destructive Operation

Normalization is designed to be safe:
- **Preserves Translation Values**: Never modifies existing translation text
- **Preserves Comments and Tags**: Keeps all metadata intact
- **Only Adds/Corrects**: Fills in missing data and fixes incorrect metadata
- **Dry-Run Available**: Preview all changes before applying

### Configuring Auto-Translation

LingoTracker can automatically translate new resources using machine translation providers such as Google Translate. To enable this, add a `translation` block to your `.lingo-tracker.json`:

```json
{
  "translation": {
    "enabled": true,
    "provider": "google-translate",
    "apiKeyEnv": "GOOGLE_TRANSLATE_API_KEY"
  }
}
```

Then set the API key in your environment:

```bash
export GOOGLE_TRANSLATE_API_KEY="your-api-key-here"
```

Auto-translation handles plain text and simple placeholders (`{name}`, `{{ count }}`). Strings with complex ICU syntax (plural, select, number, date, time) are skipped and left for human translators.

For full details on configuration, ICU handling, and best practices, see the [Auto-Translation Guide](./auto-translation.md).

### Next Steps

- For managing translation resources and other CLI commands, see the [CLI Reference](./cli.md)
- For programmatic access via REST API, see the [API Reference](./api.md)
- For setting up machine translation, see the [Auto-Translation Guide](./auto-translation.md)
- To set up an AI assistant skill for your repo (guides Claude Code and similar tools through the i18n workflow), run `lingo-tracker install-skill` — see [`install-skill`](./cli.md#install-skill) in the CLI Reference
