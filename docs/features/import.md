---
title: Import
sidebar_position: 3
---

# Import Feature

Import reads an XLIFF 1.2 or JSON file into one collection and one locale. A strategy decides what status the imported values get and whether missing keys are created, so the same command serves vendor deliveries, reviewer approvals, migrations from other systems and bulk corrections. Import repairs placeholder names a translator changed, refuses translations that altered a protected term, and writes a Markdown summary of everything it did.

## Usage

```bash
lingo-tracker import -s <file> -l <locale> [options]
# or
lingo-tracker import --source <file> --locale <locale> [options]
```

### Formats

LingoTracker automatically detects the import format from the file extension:

- `.xliff`, `.xlf`: XLIFF 1.2 format (industry standard for professional translation services)
- `.json`: JSON format (flexible for migrations and integrations)

You can explicitly specify the format with `--format <format>` if needed.

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --source <file>` | Path to import file (required). | - |
| `-l, --locale <locale>` | Target locale for import (e.g., `es`, `fr-ca`). | - |
| `-f, --format <format>` | Import format (`xliff` or `json`). | Auto-detect from extension |
| `-c, --collection <name>` | Target collection to import into. | The only collection, or a prompt |
| `--strategy <strategy>` | Import strategy (see below). | `translation-service` |
| `--update-comments` | Update resource comments from import data. `migration` only. | On for `migration` |
| `--update-tags` | Update resource tags from rich JSON. `migration` only. | On for `migration` |
| `--preserve-status` | Honour a `status` field in rich JSON instead of the strategy's status. | `false` |
| `--create-missing` | Create new resources if they don't exist. `migration` only. | On for `migration` |
| `--validate-base` | Warn if source base value differs from existing. | `true` |
| `--dry-run` | Preview import without modifying files. | `false` |
| `--verbose` | Show detailed import progress. | `false` |

> **Note:** Files larger than 5 MB will show a warning before import begins.

## Import Strategies

The `--strategy` option selects what happens to statuses and missing keys:

### translation-service (Default)

**Use Case**: Importing translations from professional translation houses/services

**Behavior**:
- A value that differs from the stored one is written with status `translated`
- A value identical to the stored one is re-confirmed: it keeps its status, except that a `stale` entry, or one whose source changed since, becomes `translated` again
- Preserves existing base values (warns if the file's source differs)
- Does NOT create new resources (missing keys are counted as skipped, not as errors)
- Does NOT update comments or tags unless asked

**Typical Workflow**:
1. Export resources with status `new,stale` to XLIFF
2. Send to translation service
3. Receive translated XLIFF files back
4. Import with strategy `translation-service`

**Example**:
```bash
lingo-tracker import --source translations-es.xliff --locale es --strategy translation-service
```

### verification

**Use Case**: Language experts verifying and approving translations

**Behavior**:
- If imported value matches existing value: sets status to `verified` (approval without changes)
- If imported value differs: updates value and sets status to `verified` (approved with corrections)
- Does NOT create new resources
- Preserves existing base values

**Example**:
```bash
lingo-tracker import --source verified-fr.xliff --locale fr --strategy verification
```

### migration

**Use Case**: Migrating from another translation system (Transloco, i18next, etc.). Works with plain interpolation; the [migration guide's Limitations](../guides/migration.md#limitations) list what else to check.

**Behavior**:
- Creates new resources with base values from XLIFF `<source>` or JSON `baseValue`
- Sets status to `translated`, or to the `status` found in rich JSON when `--preserve-status` is given
- Resolves Transloco key references (e.g., `{{t('other.key')}}`, `{{key}}`) by inlining the referenced value. Missing references emit a "Missing reference target" warning only for `t()` calls or direct dotted keys such as `{{other.key}}`. Missing parameters such as `{{name}}` are listed together in one "Unresolved parameters" warning. Circular references emit a "Circular reference detected" warning. Missing and circular references remain as literals
- Converts `{{ name }}` interpolation to ICU `{name}`. Plural and select blocks are stored as written.
- Imports values that change through the ICU round trip, with a warning that shows the source and bundled forms. For example, `{first}` bundles as `{{ first }}`
- Overwrites existing values and metadata
- Is the only strategy allowed to import into the base locale

**Flag defaults**: `--create-missing`, `--update-comments` and `--update-tags` are on for this strategy.

**Example**:
```bash
lingo-tracker import --source old-system-fr.json --locale fr --strategy migration
```

### update

**Use Case**: Bulk updates to existing translations (maintaining existing status)

**Behavior**:
- Updates only existing resources (skips missing resources; counted in Resources Skipped, not an error)
- Preserves existing status (does NOT change to `translated`)
- Does NOT create new resources
- Useful for fixing typos or updating specific translations

**Example**:
```bash
lingo-tracker import --source corrections-de.json --locale de --strategy update
```

## Import Formats

### XLIFF 1.2

XLIFF (XML Localization Interchange File Format) is the industry standard for professional translation services.

**Format Specification**:
- `<trans-unit>` IDs are interpreted as full dot-delimited keys (e.g., `common.buttons.cancel`)
- `<source>` contains base locale value (used for validation/creation)
- `<target>` contains translation to import
- `<note>` contains comment (optional). A trans-unit with several notes gets one comment, one note per line. LingoTracker ignores a note that starts with `Do not translate:`, because export adds that note to list the protected terms. It is not part of the comment.

**Example**:
```xml
<xliff version="1.2">
  <file source-language="en" target-language="es">
    <body>
      <trans-unit id="common.buttons.cancel">
        <source>Cancel</source>
        <target>Cancelar</target>
        <note>Button text for canceling actions</note>
      </trans-unit>
    </body>
  </file>
</xliff>
```

### JSON

JSON import provides flexible format options for system migrations and integrations.

**Structure Options**:
- **Flat**: Dot-delimited keys at root level
- **Hierarchical**: Nested objects (auto-detected)

**Value Format Options**:
- **Simple**: String values only
- **Rich**: Objects with metadata (`value`, `comment`, `baseValue`, `status`, `tags`)

An object is rich only when `value` is a string and all its keys are `value`, `baseValue`, `comment`, `status` or `tags`. Any other object is a namespace in a hierarchical file and is skipped in a flat file. When an object has only these keys but one of them has the wrong type (for example, an unknown `status`), a hierarchical file imports it as nested keys and shows a warning. Arrays, numbers, booleans and `null` are skipped, listed in one warning, and counted as skipped in the summary.

**Flat with Simple Values**:
```json
{
  "common.buttons.cancel": "Cancelar",
  "common.buttons.ok": "Aceptar"
}
```

**Hierarchical with Simple Values**:
```json
{
  "common": {
    "buttons": {
      "cancel": "Cancelar",
      "ok": "Aceptar"
    }
  }
}
```

Imported tags are stored as given; run `normalize` afterwards to bring them into the normalized lowercase form.

**Flat with Rich Objects**:
```json
{
  "common.buttons.cancel": {
    "value": "Cancelar",
    "comment": "Button text for canceling actions",
    "baseValue": "Cancel",
    "status": "verified",
    "tags": ["ui", "common"]
  }
}
```

## Protected Term Verification

LingoTracker checks every incoming translation against the [protected terms](./protected-terms.md) for its collection. Those terms come from two files. LingoTracker combines the global file with the collection's own file.

A term may appear in the stored **source** value and be missing from the incoming translation. That entry then fails:

```
❌ "app.checkout.title" Protected term(s) altered: iPhone
```

LingoTracker skips the entry and reports it as failed. The rest of the import continues normally.

LingoTracker matches the source case-insensitively. It requires the translation to hold the term **exactly** as stored. That difference is deliberate, and it is what catches `iPhone` coming back as `iphone` or as `Iphone`.

Base-locale imports skip the check, because a base-locale import defines the source rather than translating it. An import in a project with no protected terms also skips it.

## Preferred Terminology Warnings

A base-locale import (`--strategy migration` into the base locale) checks every value it writes against the preferred terminology rules (`.lingo-tracker-preferred-terminology.json`, or the file named by `preferredTerminologyFile`). Each discouraged term found adds one warning, whichever way it is capitalized and however often it occurs in the value:

```
Preferred terminology: key "budget.title" — consider "Investment" instead of "Expenditure". Finance style guide
```

The warnings are advisory. The value is imported as-is, nothing is skipped or failed, and the exit code is unchanged. A dry run reports the same warnings.

- **Target-locale imports are never checked.** Translations use their own vocabulary.
- **A broken rule file** (invalid JSON or invalid rules) adds one warning, `Preferred terminology checks skipped: …`, and the import continues without the check.
- **A missing file** at the default path means no rules. A missing file named explicitly by `preferredTerminologyFile` adds one warning.

The [Preferred Terminology](./preferred-terminology.md) page explains the rules and how matching works.

## ICU Format Auto-Fixing

LingoTracker automatically fixes common ICU message format placeholder errors made by translators:

**What Gets Auto-Fixed**:
- Renamed placeholders: `{nombre}` → `{name}`
- Missing placeholders: Inserts single missing placeholder
- Plural/select form corrections: `{numero, plural, ...}` → `{count, plural, ...}`

**What Gets Reported**:
- All auto-fixes are logged in the import summary with before/after values
- Errors for unfixable cases (multiple missing placeholders, malformed syntax) — the resource import fails and is counted in Resources Failed

**Example**:
```
Original: "Hola {nombre}, tienes {numero} mensajes"
Auto-Fixed: "Hola {name}, tienes {count} mensajes"
```

Review the reported repairs before you accept the import.

## Import Summary

Every completed import writes a timestamped `lingo-tracker-import-summary-<timestamp>.md` file to the **OS temp directory** (e.g. `/tmp` on macOS/Linux, `%TEMP%` on Windows) and prints the full path to the console. A run never overwrites an earlier summary: if two runs start in the same millisecond, the later one adds a `-1`, `-2` and so on (see [CLI summary files](../cli.md)). The file is written outside your project tree to avoid polluting your repository or breaking build pipelines that scan `.md` files. It contains detailed change tracking:

- Import statistics (resources imported, created, updated, skipped, failed)
- Status transitions (e.g., "new → translated", "stale → verified")
- ICU auto-fixes applied
- Files modified
- Warnings and errors
- Detailed change log (first 20 resources)

> **Exit code:** The command exits with code `1` when any resources fail or errors occur. Skipped resources (missing from storage) do not cause a non-zero exit, so CI pipelines will not fail on skips alone.

### Dry-Run Mode

Use `--dry-run` to preview what would be imported without modifying files:

```bash
lingo-tracker import --source translations-es.xliff --locale es --dry-run
```

The dry-run summary shows exactly what would happen, using "Would" language to indicate no changes were made. The summary file is not written in dry-run mode, but the temp path where it would be written is still printed to the console.

## Interactive Mode

If you run `lingo-tracker import` without required options in a terminal, it will launch an interactive wizard to guide you through:

- Source file path entry (with path validation)
- Format auto-detection
- Target locale selection (from configured locales)
- Collection selection (if multiple exist)
- Import strategy selection with descriptions
- Strategy-specific options

## Round-Trip Workflow

LingoTracker supports professional translation workflows:

1. **Export for Translation**:
   ```bash
   lingo-tracker export --format xliff --locale es --status new,stale
   ```

2. **Send to Translation Service**:
   - Upload `es.xliff` to professional translation service
   - Translators work on translations

3. **Import Translated Files**:
   ```bash
   lingo-tracker import --source es.xliff --locale es --strategy translation-service
   ```

4. **Review Import Summary**:
   - Check the summary file (path printed to console) for statistics and warnings
   - Review any ICU auto-fixes applied
   - Verify all translations imported successfully

5. **Verification (Optional)**:
   - Export again for language expert review
   - Import with `--strategy verification` to mark as verified

## Examples

### Professional Translation Service

```bash
# Export resources needing translation
lingo-tracker export --format xliff --locale es,fr,de --status new,stale

# After receiving translated files back
lingo-tracker import --source es.xliff --locale es --strategy translation-service
lingo-tracker import --source fr.xliff --locale fr --strategy translation-service
lingo-tracker import --source de.xliff --locale de --strategy translation-service
```

### Language Expert Verification

```bash
# Export the translations that await review
lingo-tracker export --format xliff --locale es --status translated

# After expert review
lingo-tracker import --source es-reviewed.xliff --locale es --strategy verification
```

### Bulk Corrections

```bash
# Export every current translation, whatever its status
lingo-tracker export --format json --locale es --status new,stale,translated,verified

# Edit JSON file to fix typos
# Import corrections
lingo-tracker import --source es-corrected.json --locale es --strategy update
```

### Migrating from Another System

See the [Migration Guide](../guides/migration.md) for detailed instructions on migrating from Transloco, i18next, and other translation systems.

## Import from the Tracker UI

The Tracker UI imports with the same strategies and options as the CLI. A live preview shows what the import will change before you run it.

![The Import dialog on the Source pane, with four files checked and the live preview of the changes](../images/import-dialog.png)

The dialog reads files from the server's disk, like the CLI's `--source`, and lists them for you. You can also add files from your computer. See [Upload files](#upload-files).

### Open the dialog

- Select **Import…** in the head of the Collections section.
- Select **Import…** in the ⋮ menu of a collection card to import into that collection. The item is disabled on read-only collections.

An import writes into one collection. Read-only collections are locked and cannot be chosen.

### Settings

| Section | Controls | CLI flag |
|---------|----------|----------|
| Source | The collection, the import folder and the files to read, each with a target locale. | `--collection`, `--source`, `--locale` |
| Strategy | `translation-service`, `verification`, `migration` or `update`, described [above](#import-strategies). | `--strategy` |
| Options | Create missing keys, update comments and update tags (migration only), plus Keep status from file and Warn when the base text differs under **Advanced**. | `--create-missing`, `--update-comments`, `--update-tags`, `--preserve-status`, `--validate-base` |

The Source section lists the `.xliff`, `.xlf` and `.json` files in the import folder. The folder is the collection's `importFolder`, else the global `importFolder`, else `dist/lingo-import`. You can type another folder, relative to the project root. Check the files to import. You can import several files in one run. They share one strategy and one option set, and each file has its own locale.

### Upload files

Files you want to import may be on your own computer rather than on the server. Select **Upload files…** above the file list, or drag files onto the list. LingoTracker copies them into the folder the dialog shows, checks them, and lists them with the rest. From there they follow the usual preview and import.

- Uploads go only to the collection's import folder or one of its subfolders, and always inside the project root. For any other folder the button and the drop area are disabled. A subfolder that does not exist yet is created.
- A file that has the same name as one already in the folder (ignoring case) prompts you: **Replace** overwrites the existing file, and **Keep existing** discards the upload. Nothing is overwritten unless you choose Replace.
- You can upload up to 10 files at a time, each up to 20 MB. The files must be `.xliff`, `.xlf` or `.json`. The dialog checks this before it sends anything, and the server checks again.
- The server accepts one upload at a time. If another is running, try again in a moment.
- Uploading is not available for read-only collections.
- An upload row for a base-locale file stays unchecked unless the strategy is `migration`, as for any other file.

LingoTracker infers the locale of each file:

1. For XLIFF, from the `target-language` attribute of the `<file>` element.
2. Otherwise, from a configured locale code in the file name, such as `es.xliff` or `translations-en-to-fr-ca-2025-12-13.json`.

A file with no inferred locale shows a locale selector, and you must choose a locale before you can import. The base locale is only available with the `migration` strategy.

### Preview

The preview runs a dry run each time you change a setting. It shows the files, the counts of entries that would be imported, created, updated, skipped or fail, the status changes, the ICU auto-fixes, and the key-level issues and warnings. It does not modify any file. The dry-run summary lists the **Files That Would Be Modified**.

The Import button shows the number of entries. It stays enabled when some entries would fail, because the import continues past failures, as the CLI does.

### Result strip

When the import finishes, a result strip appears on the Collections page:

- **Details** shows the counts for each file, the status changes, the ICU auto-fixes, the failed and skipped keys with their reasons, the warnings, and the files that changed.
- **Download summary** downloads the Markdown summary. It is available for about 30 minutes after the import ends. The server keeps it in memory only and does not write it to disk.
- **Dismiss** removes the strip.
- **Retry** opens the dialog again with the same request. It appears when the import failed.

The import runs as a background job. The API behind it is described in the [Imports API](../api.md#imports) section of the API reference.

### Round trip in the UI

1. Export the entries that need translation to XLIFF, from the [Export dialog](./export.md#export-from-the-tracker-ui) or the CLI.
2. Send the files to your vendor.
3. Put the returned files in `dist/lingo-import` on the server.
4. Open **Import…**, choose the collection, check the files, and read the preview.
5. Select **Import**.

### Remembered settings

The dialog remembers its strategy and options for each project, and the import folder for each collection. The file selection is not remembered.
