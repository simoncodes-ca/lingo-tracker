# Feature: Import

## Implementation Status

✅ **Complete** - The import feature is fully implemented, tested, and production-ready as of January 2026.

**Key Capabilities:**
- XLIFF 1.2 and JSON format support (flat/hierarchical, simple/rich)
- Four import strategies: translation-service, verification, migration, update
- Automatic ICU placeholder fixing for translator-modified placeholders
- Comprehensive validation and error handling
- Detailed import summary reports (`import-summary.md`)
- Interactive and non-interactive CLI modes

**Documentation:**
- CLI Help: `lingo-tracker import --help` (comprehensive with examples)
- User Guide: See notes section for recommended documentation enhancements
- Migration Guide: See notes section for recommended migration workflows

---

This is a CLI-only feature. It enables users to import translation resources from external sources in standard formats (XLIFF and JSON), supporting professional translation workflows, system migrations, and expert verification processes.

## Overview

LingoTracker stores translations in a folder-based structure with `resource_entries.json` and `tracker_meta.json` files. The import feature ingests translations from external formats (XLIFF and JSON) and merges them into existing LingoTracker resources, intelligently updating values, recalculating checksums, and managing translation status.

**Business Value:**
- Enable round-trip workflows with professional translation services using XLIFF format
- Support migration from other translation management systems via JSON import
- Allow language experts to verify and update translations through structured import
- Facilitate integration with third-party translation tools and CAT systems
- Automate bulk translation updates while preserving metadata integrity

**Key Characteristics:**
- Import updates existing resources or creates new ones based on matching keys
- Checksums are automatically recalculated for imported values
- Translation status is intelligently managed based on import source and value changes
- Multiple import strategies support different workflows (translation house, migration, verification)
- Import generates a detailed summary report (`import-summary.md`) with statistics and change tracking
- Supports both interactive and non-interactive (CI/CD) modes

## Technical Context

### Architecture
- **CLI Command**: `lingo-tracker import` with `--format` and `--source` flags
- **Core Logic**: Business logic resides in `libs/core/src/lib/import/` (new directory)
  - `import-from-xliff.ts` - XLIFF format parsing and import
  - `import-from-json.ts` - JSON format parsing and import
  - `import-common.ts` - Shared resource updating/creation logic
  - `import-summary.ts` - Summary report generation
  - `types.ts` - Import interfaces and types
- **File Reading/Writing**: Leverage existing utilities from `libs/core/src/resource/`
- **Data Structures**: Uses `ResourceEntry`, `ResourceEntries`, `ResourceEntryMetadata`, `LocaleMetadata`, `TranslationStatus`
- **XLIFF Library**: Uses `xliff` library (https://github.com/locize/xliff) for XLIFF parsing and validation
- **Checksum Computation**: Uses existing checksum utilities from `libs/core/src/resource/checksum.ts`

### Data Targets
- **Resource Entries**: Updates/creates entries in `resource_entries.json` files throughout collection folders
- **Metadata**: Updates/creates metadata in `tracker_meta.json` files with new checksums and status
- **Configuration**: Reads global `.lingo-tracker.json` and collection-specific configs for validation

### Key Considerations
- Import can target a single collection or create resources in default collection
- Resources are stored in nested folder structures (e.g., `apps/common/buttons/`)
- Translation status must be managed intelligently based on import strategy
- Checksums must be recalculated for both imported values and base values
- Import should validate that target locales are configured before importing
- Existing resources should be updated, not replaced (preserve unaffected locales)
- Import must handle missing base values (create or skip based on strategy)
- Dry-run mode available for validation without modifying files
- Backup/rollback capabilities should be considered for safety

## Import Formats

### XLIFF 1.2 Import

XLIFF (XML Localization Interchange File Format) is the industry standard for professional translation services.

**Format Specification:**
- Support XLIFF Version 1.2 schema
- Import from one XLIFF file per target locale (e.g., `es.xliff`, `fr-ca.xliff`)
- `<trans-unit>` IDs are interpreted as full dot-delimited keys (e.g., `common.buttons.cancel`)
- `<source>` contains base locale value (used for validation/creation)
- `<target>` contains translation to import
- `<note>` contains comment (optional, can update existing comment or preserve)
- ICU message format syntax is preserved as-is
- Support both strict XLIFF 1.2 and common variations

**Import Behavior:**
- If resource exists in LingoTracker:
  - Update target locale value with `<target>` content
  - Recalculate checksum for target locale
  - Update status based on import strategy (see Status Management section)
  - Update comment from `<note>` only if `--update-comments` flag is set
  - Preserve base locale value (warn if `<source>` differs from existing base)
  - Preserve other target locales unchanged
- If resource does not exist:
  - Strategy-dependent behavior:
    - `translation-service`, `verification`, `update`: Skip with error (base value required but resource creation not expected)
    - `migration`: Create new resource with base value from `<source>`, add target locale value from `<target>`, create metadata with checksums and status, add comment from `<note>` if present

**Validation:**
- Validate XLIFF schema compliance
- Verify target locale matches configured locales
- If `<source>` value differs from existing base value in LingoTracker:
  - Log warning with resource key and both values
  - Preserve existing LingoTracker base value (do not update)
  - Recalculate `baseChecksum` from existing base value
  - If imported target's `baseChecksum` doesn't match, translation may be marked `stale`
  - Note: A future `--force-base-update` flag may allow base value updates from XLIFF source
- Skip trans-units with empty `<target>` (log as info)

**Example Input:**
```xml
<xliff xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:oasis:names:tc:xliff:document:1.2 http://docs.oasis-open.org/xliff/v1.2/os/xliff-core-1.2-strict.xsd" xmlns="urn:oasis:names:tc:xliff:document:1.2" version="1.2">
  <file datatype="plaintext" source-language="en" target-language="es">
    <body>
      <trans-unit id="common.buttons.cancel">
        <source>Cancel</source>
        <target>Cancelar</target>
        <note>Button the user clicks to undo or discard changes or an action</note>
      </trans-unit>
      <trans-unit id="common.buttons.ok">
        <source>OK</source>
        <target>Aceptar</target>
      </trans-unit>
    </body>
  </file>
</xliff>
```

### JSON Import

JSON import provides flexible format options for system migrations, custom integrations, and structured data imports.

**Format Options:**

Import supports the same JSON structures as export:
1. **Structure**: Hierarchical (nested objects) or Flat (dot-delimited keys at root)
2. **Value Format**: Simple string values or Rich objects with metadata

**Import Behavior:**

**Simple String Values:**
- Import as translation values for specified target locale
- Recalculate checksums
- Set status based on import strategy

**Rich Objects:**
- `value` - The translation string (required)
- `comment` - Resource comment; updates existing comment only if `--update-comments` flag is set (optional)
- `baseValue` - Used for validation against existing base or for creating new resources in migration strategy (optional)
- `status` - Can override automatic status determination if `--preserve-status` flag used (optional)
- `tags` - Resource tags; updates existing tags only if `--update-tags` flag is set (optional)

**Import Behavior:**
- If resource exists in LingoTracker:
  - Update target locale value with imported value
  - Recalculate checksum for target locale
  - Update status based on import strategy (see Status Management section)
  - Update comment only if `--update-comments` flag is set
  - Update tags only if `--update-tags` flag is set
  - Validate `baseValue` if present: warn if differs from existing base, preserve existing base value
  - Preserve other target locales unchanged
- If resource does not exist:
  - Strategy-dependent behavior:
    - `translation-service`, `verification`, `update`: Skip with error (resource creation not expected)
    - `migration`: Create new resource using `baseValue` from rich object (error if missing), add target locale value, create metadata with checksums and status, add comment and tags if present

**Auto-Detection:**
Import automatically detects structure (flat vs hierarchical) and format (simple vs rich):
- If any value is an object with a `value` property, treat as rich format
- If all keys contain dots at root level, treat as flat structure
- Otherwise treat as hierarchical structure

**Hierarchical with Simple Values:**
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

**Flat with Rich Objects:**
```json
{
  "common.buttons.cancel": {
    "value": "Cancelar",
    "comment": "Button the user clicks to undo or discard changes or an action",
    "baseValue": "Cancel",
    "status": "verified",
    "tags": ["ui", "common"]
  },
  "common.buttons.ok": {
    "value": "Aceptar"
  }
}
```

## Import Strategies

Different import sources require different approaches to status management and data handling. The `--strategy` option (or interactive prompt) selects the appropriate behavior.

### Strategy: translation-service (Default)

**Use Case**: Importing translations from professional translation houses/services

**Behavior:**
- Import target locale values from XLIFF files or JSON
- Set status to `translated` for all imported values
- Preserve existing base values (warn if XLIFF `<source>` or JSON `baseValue` differs)
- Do NOT create new resources (skip with error if resource doesn't exist)
- Do NOT update comments or tags by default (flags default to `false`)
- Skip trans-units with empty targets

**Flags:**
- `--create-missing`: `false` (do not create new resources)
- `--update-comments`: `false` (preserve existing comments)
- `--update-tags`: `false` (preserve existing tags)

**Typical Workflow:**
1. Export resources with status `new,stale` to XLIFF
2. Send to translation service
3. Receive translated XLIFF files back
4. Import with strategy `translation-service`

### Strategy: verification

**Use Case**: Language experts verifying and approving translations

**Behavior:**
- If imported value matches existing value:
  - Set status to `verified` (approval without changes)
  - Do NOT update checksum
- If imported value differs from existing value:
  - Update value and recalculate checksum
  - Set status to `verified` (approved with corrections)
- Do NOT create new resources (skip with error if resource doesn't exist)
- Preserve existing base values (warn if XLIFF `<source>` or JSON `baseValue` differs)
- Do NOT update comments or tags by default (flags default to `false`)

**Flags:**
- `--create-missing`: `false` (do not create new resources)
- `--update-comments`: `false` (preserve existing comments)
- `--update-tags`: `false` (preserve existing tags)

**Typical Workflow:**
1. Export resources for review (any status)
2. Language expert reviews and optionally modifies
3. Import with strategy `verification` sets verified status

### Strategy: migration

**Use Case**: Migrating from another translation system (Transloco, i18next, etc.)

**Behavior:**
- Import all translations regardless of existing data
- Create new resources with base values from XLIFF `<source>` or JSON `baseValue`
  - XLIFF: Use `<source>` element value (error if missing)
  - Rich JSON: Use `baseValue` field (error if missing)
  - Simple JSON: Cannot create new resources, skip with warning
- Set status to `translated` for all imports
- Expand Transloco key references (e.g., `{{t('other.key')}}`) into full values
- Update/create comments and tags from import data (flags default to `true`)
- Overwrite existing values and metadata (migration is one-time bulk operation)

**Flags:**
- `--create-missing`: `true` (create new resources)
- `--update-comments`: `true` (update comments from import data)
- `--update-tags`: `true` (update tags from import data)

**Special Handling:**
- **Transloco References**: Detect patterns like `{{t('key.path')}}` or `{{key.path}}` and resolve to actual values
- **Nested References**: Handle references that point to other references (resolve recursively)
- **Missing References**: Warn if reference target not found, preserve literal string

**Typical Workflow:**
1. Export from source system (Transloco, i18next)
2. Transform to LingoTracker JSON format if needed
3. Import with strategy `migration`

### Strategy: update

**Use Case**: Bulk updates to existing translations (maintaining existing status)

**Behavior:**
- Update only existing resources (skip with warning if resource not found)
- Recalculate checksums for changed values
- Preserve existing status (do NOT change to `translated`)
- Do NOT create new resources (always skip)
- Do NOT update comments or tags by default (flags default to `false`)
- Useful for fixing typos or updating specific translations

**Flags:**
- `--create-missing`: `false` (never create new resources)
- `--update-comments`: `false` (preserve existing comments)
- `--update-tags`: `false` (preserve existing tags)

**Typical Workflow:**
1. Export current translations
2. Make corrections in external editor
3. Import with strategy `update` to apply changes

## Status Management

Translation status is managed automatically based on import strategy and value changes:

| Strategy | New Resource | Value Unchanged | Value Changed | Base Value Handling |
|----------|--------------|-----------------|---------------|---------------------|
| `translation-service` | Skip (error) | `translated` | `translated` | Preserve existing (strict) |
| `verification` | Skip (error) | `verified` (no checksum update) | `verified` | Preserve existing (strict) |
| `migration` | `translated` | `translated` | `translated` | Use from import source (flexible) |
| `update` | Skip (warning) | Preserve | Preserve | Preserve existing (flexible) |

**Status Override:**
- With `--preserve-status` flag, rich JSON objects can specify `status` field to override automatic determination
- Only valid statuses accepted: `new`, `translated`, `stale`, `verified`
- This is an advanced option for specific workflows

**Stale Detection:**
- After import, if base value in LingoTracker differs from `baseChecksum` in metadata, mark as `stale`
- This can happen if base locale was updated after export but before import

## Command-Line Interface

### Command Structure
```bash
# XLIFF import
lingo-tracker import --format xliff --source <file> --locale <locale> [options]

# JSON import
lingo-tracker import --format json --source <file> --locale <locale> [options]

# Auto-detect format from file extension
lingo-tracker import --source <file> --locale <locale> [options]
```

### Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `--format` | `xliff \| json` | Import format (auto-detected from file extension if omitted) | Auto-detect |
| `--source` | `string` | Path to import file (required) | - |
| `--locale` | `string` | Target locale for import (e.g., `es`, `fr-ca`) | - |
| `--collection` | `string` | Target collection to import into | Default collection or first collection |
| `--strategy` | `translation-service \| verification \| migration \| update` | Import strategy | `translation-service` |
| `--update-comments` | `boolean` | Update resource comments from import data | `false` (except `migration`: `true`) |
| `--update-tags` | `boolean` | Update resource tags from rich JSON | `false` (except `migration`: `true`) |
| `--preserve-status` | `boolean` | Allow rich JSON to specify status (advanced) | `false` |
| `--create-missing` | `boolean` | Create new resources if they don't exist | Strategy-dependent: `migration`: `true`, all others: `false` |
| `--validate-base` | `boolean` | Warn if source base value differs from existing | `true` |
| `--dry-run` | `boolean` | Show what would be imported without modifying files | `false` |
| `--verbose` | `boolean` | Show detailed import progress (each resource) | `false` |
| `--backup` | `boolean` | Create backup before importing (.bak files) | `false` |

### Interactive Mode (TTY)
When run in interactive mode without required options:
- Prompt for source file path (with file picker/autocomplete)
- Auto-detect format from extension, or prompt if ambiguous
- Prompt for target locale (from configured locales)
- Prompt for collection (if multiple collections exist)
- Prompt for import strategy with descriptions
- Prompt for options based on strategy (update-comments, etc.)

### Non-Interactive Mode (CI/CD)
When `--source` and `--locale` are specified, run without prompts using defaults for missing options.

### Format Auto-Detection
- `.xliff`, `.xlf` → XLIFF format
- `.json` → JSON format
- Other extensions → Error, require explicit `--format`

## Validation & Error Handling

### Pre-Import Validation

**File Validation:**
- Verify source file exists and is readable
- Validate file format (XLIFF schema, JSON parse)
- Check for empty files or files with no importable content

**Locale Validation:**
- Verify target locale is configured in collection settings
- Error if locale is the base locale (cannot import into base)
- Warn if locale not configured for collection

**Collection Validation:**
- Verify target collection exists
- Error if collection not found and no default

**Format Validation:**
- XLIFF: Validate against schema, check source/target language attributes
- JSON: Validate structure, check for malformed keys

### During Import

**Key Validation:**
- Validate dot-delimited key format
- Reject invalid characters or empty segments
- Warn on very long keys (>200 characters)

**Value Validation:**
- Validate ICU message format syntax (if ICU validation enabled in config)
- Warn on suspicious patterns (unmatched braces, etc.)
- Preserve values as-is even if validation warns

**Conflict Handling:**
- If same key appears multiple times in import file:
  - Last occurrence wins (matches standard JSON parsing behavior)
  - Log warning with key name and both values
  - Include duplicate warnings in import summary report
- If hierarchical conflict (key is both parent and leaf): error and skip

**Reference Resolution (Migration Strategy):**
- Detect Transloco reference patterns: `{{t('key')}}`, `{{key}}`
- Resolve references to actual values from import data
- Handle circular references: error and preserve literal
- Handle missing references: warn and preserve literal

### Error Categories

**Fatal Errors (stop import):**
- Source file not found or unreadable
- Invalid XLIFF/JSON format (parse errors)
- Target locale is base locale
- Collection not found and no default
- Output directory not writable

**Non-Fatal Errors (skip resource, continue):**
- Invalid key format
- Hierarchical key conflict
- Circular reference in migration
- Missing required fields in rich JSON

**Warnings (log, continue):**
- XLIFF `<source>` or JSON `baseValue` differs from existing LingoTracker base value (preserves existing base)
- Duplicate keys in import file (last occurrence wins)
- Empty target values in XLIFF
- Locale not configured for collection
- Missing reference targets in migration
- Suspicious value patterns
- Resource not found in `update` strategy (skipped)

## Import Summary Report

Every import generates an `import-summary.md` file in the collection's translation folder (or specified output directory) with detailed change tracking.

```markdown
# Import Summary

**Date**: 2025-12-25 15:30:45
**Format**: XLIFF 1.2
**Source File**: /path/to/translations-es.xliff
**Target Locale**: es
**Collection**: TestDataCore
**Strategy**: translation-service
**Flags**: --update-comments=false, --update-tags=false, --create-missing=true

## Results

- **Resources Imported**: 98
- **Resources Created**: 0
- **Resources Updated**: 98
- **Resources Skipped**: 5
- **Resources Failed**: 2

## Changes by Status

- **New → Translated**: 45
- **Stale → Translated**: 38
- **Translated → Translated**: 15 (value changed)
- **Created**: 0

## Files Modified

- `/path/to/translations/common/buttons/resource_entries.json`
- `/path/to/translations/common/buttons/tracker_meta.json`
- `/path/to/translations/dashboard/resource_entries.json`
- `/path/to/translations/dashboard/tracker_meta.json`
- (+ 8 more files)

## Warnings

- XLIFF source differs from existing base value: `common.buttons.submit` (XLIFF: "Submit Form", LingoTracker: "Submit") - preserved LingoTracker value
- Duplicate key in import file: `common.title` (used last occurrence)
- Empty target value skipped: `dashboard.settings.title`
- Resource not found (skipped): `new.resource.key` (strategy does not allow creation)

## Errors

- Invalid key format: `common..buttons` (consecutive dots)
- Hierarchical conflict: `common` (has value and child keys)

## Detailed Changes

### Created Resources
(None - strategy `translation-service` does not create new resources)

### Updated Resources
1. `common.buttons.cancel`: "Cancelar" → "Cancelar" (translated, checksum updated)
2. `common.buttons.ok`: "" → "Aceptar" (new → translated)
3. `dashboard.title`: "Panel de Control" → "Tablero" (translated → translated, value changed)
... (95 more, showing first 20 in detail)

### Skipped Resources
1. `invalid..key` (invalid format)
2. `common.empty` (empty target value)
3. `new.resource.key` (resource not found, strategy does not allow creation)
4. `another.new.key` (resource not found, strategy does not allow creation)
```

**Dry-Run Mode:**

In dry-run mode, the import process simulates the full import logic including:
- Reading existing `resource_entries.json` and `tracker_meta.json` files
- Determining which resources would be created, updated, or skipped
- Calculating status transitions and checksum changes
- Identifying errors and warnings

The dry-run summary uses "Would" language to indicate no actual changes were made:

```markdown
# Import Summary (DRY RUN)

**Would Import**: 98 resources
**Would Create**: 0 resources
**Would Update**: 98 resources
**Would Skip**: 5 resources
**Would Fail**: 2 resources

(Same detailed sections as above showing what would happen)
```

## Notes

**Relationship to Export Feature:**
- Import is the inverse operation of export (feature symmetry)
- Supports round-trip workflows: export → translate → import
- Import formats mirror export formats (XLIFF 1.2, JSON flat/hierarchical/simple/rich)
- Both features share similar error handling and reporting patterns

**Recommended Documentation Enhancements:**
The following documentation would enhance the user experience but is not blocking (CLI help is comprehensive):

1. **User Guide** (`docs/features/import.md`):
   - Detailed explanation of import strategies with use case examples
   - Step-by-step workflows for common scenarios
   - Troubleshooting guide for common import issues
   - Best practices for professional translation workflows

2. **Migration Guide** (`docs/guides/migration.md`):
   - Step-by-step migration from Transloco (direct JSON import)
   - Migration from i18next (format transformation + import)
   - Migration from other TMS systems via XLIFF
   - Handling edge cases and reference resolution

3. **Round-Trip Workflow Guide**:
   - Export resources for translation (`lingo-tracker export`)
   - Send to translation service (XLIFF preferred format)
   - Import translated results (`lingo-tracker import --strategy translation-service`)
   - Verification and review process
   - Handling status transitions (new → translated → verified)

**Future Enhancements:**
- Support for additional formats (Java properties, PO files, CSV)
- Batch import from multiple files in one command
- Import from URL (fetch and import in one operation)
- Interactive conflict resolution (show diff, choose value)
- Git integration (auto-commit after successful import with summary)
- Round-trip integration test (export → import → verify identical)

**Security Considerations:**
- File paths are validated to prevent directory traversal
- Import file size warnings for large files (>5MB)
- Resource keys are sanitized to prevent injection attacks
- Reference resolution is protected against infinite loops (circular reference detection)
