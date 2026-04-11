# Import Feature

The Import feature allows you to import translation resources from external sources in standard formats (XLIFF and JSON), supporting professional translation workflows, system migrations, and expert verification processes.

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
| `-c, --collection <name>` | Target collection to import into. | Default collection |
| `--strategy <strategy>` | Import strategy (see below). | `translation-service` |
| `--update-comments` | Update resource comments from import data. | `false` |
| `--update-tags` | Update resource tags from rich JSON. | `false` |
| `--preserve-status` | Allow rich JSON to specify status (advanced). | `false` |
| `--create-missing` | Create new resources if they don't exist. | Strategy-dependent |
| `--validate-base` | Warn if source base value differs from existing. | `true` |
| `--dry-run` | Preview import without modifying files. | `false` |
| `--verbose` | Show detailed import progress. | `false` |

> **Note:** Files larger than 5 MB will show a warning before import begins.

## Import Strategies

Different import workflows require different approaches. The `--strategy` option selects the appropriate behavior:

### translation-service (Default)

**Use Case**: Importing translations from professional translation houses/services

**Behavior**:
- Sets status to `translated` for all imported values
- Preserves existing base values (warns if source differs)
- Does NOT create new resources (skips missing resources; counted in Resources Skipped, not an error)
- Does NOT update comments or tags by default

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

**Use Case**: Migrating from another translation system (Transloco, i18next, etc.)

**Behavior**:
- Creates new resources with base values from XLIFF `<source>` or JSON `baseValue`
- Sets status to `translated` (use `--preserve-status` with rich JSON to honor source status)
- Resolves Transloco key references (e.g., `{{t('other.key')}}`, `{{key}}`) by inlining the referenced value; missing references emit a "Missing reference target" warning and circular references emit a "Circular reference detected" warning — both are preserved as literals
- Normalizes Transloco plural/select syntax to ICU format
- Overwrites existing values and metadata

**Flags Default**:
- `--create-missing`: `true` (applied automatically for migration strategy)
- `--update-comments`: `false` (pass explicitly to enable)
- `--update-tags`: `false` (pass explicitly to enable)

**Example**:
```bash
lingo-tracker import --source old-system-fr.json --locale fr --strategy migration \
  --update-comments --update-tags
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
- `<note>` contains comment (optional)

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

This ensures translations work correctly even when translators accidentally modify placeholder names.

## Import Summary

Every completed import writes `import-summary.md` to the translations folder (e.g., `src/assets/i18n/import-summary.md`) with detailed change tracking:

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

The dry-run summary shows exactly what would happen, using "Would" language to indicate no changes were made. The summary file is not written in dry-run mode, but the path where it would be written is still printed to the console.

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
   - Check `import-summary.md` for statistics and warnings
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
# Export all translations for review
lingo-tracker export --format xliff --locale es

# After expert review
lingo-tracker import --source es-reviewed.xliff --locale es --strategy verification
```

### Bulk Corrections

```bash
# Export current translations
lingo-tracker export --format json --locale es

# Edit JSON file to fix typos
# Import corrections
lingo-tracker import --source es-corrected.json --locale es --strategy update
```

### Migrating from Another System

See the [Migration Guide](../guides/migration.md) for detailed instructions on migrating from Transloco, i18next, and other translation systems.
