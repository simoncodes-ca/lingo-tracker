# Feature: Export

This is a CLI only feature. It will enable users to export translation resources in various formats for integration with translation houses, external systems, and third-party tools.

## Overview

LingoTracker stores translations in a folder-based structure with `resource_entries.json` and `tracker_meta.json` files. The export feature will aggregate and transform these resources into standard formats (XLIFF and JSON) suitable for external consumption.

**Business Value:**
- Enable collaboration with professional translation services that require XLIFF format
- Support integration with external translation management systems
- Allow flexible data export for custom workflows and tooling
- Facilitate sharing translations with stakeholders in accessible formats

**Key Characteristics:**
- Multiple collections are merged into single output files per locale/format
- Base locale is never exported (only target locales)
- Filtering is applied on a per-locale basis
- Resources without metadata are omitted from export and logged as errors
- Export generates a summary report (`export-summary.md`) with statistics and warnings

## Technical Context

### Architecture
- **CLI Command**: `lingo-tracker export` with `--format` flag
- **Core Logic**: Business logic resides in `libs/core/src/lib/export/` (new directory)
  - `export-to-xliff.ts` - XLIFF format generation
  - `export-to-json.ts` - JSON format generation
  - `export-common.ts` - Shared filtering/loading logic
- **File Reading**: Leverage existing resource reading utilities from `libs/core/src/resource/`
- **Data Structures**: Uses `ResourceEntry`, `ResourceEntries`, `ResourceEntryMetadata`, `LocaleMetadata`, `TranslationStatus`
- **XLIFF Library**: Uses `xliff` library (https://github.com/locize/xliff) for XLIFF generation and validation

### Data Sources
- **Resource Entries**: Read from `resource_entries.json` files throughout collection folders
- **Metadata**: Read from `tracker_meta.json` files for status and checksum information
- **Configuration**: Global `.lingo-tracker.json` and collection-specific configs for locales

### Key Considerations
- Export can span multiple collections which are merged into single output files
- Resources are stored in nested folder structures (e.g., `apps/common/buttons/`)
- Translation status tracked as: `new`, `translated`, `stale`, `verified`
- Resources with missing metadata are **omitted** from export with error logging
- Export destination defaults to `exportFolder` from config (`dist/lingo-export`)
- Supports streaming for large exports with fallback to in-memory assembly
- Dry-run mode available for validation without writing files

## Export Formats

### XLIFF 1.2 Export

XLIFF (XML Localization Interchange File Format) is the industry standard for professional translation services.

**Format Specification:**
- Use XLIFF Version 1.2 strict schema
- One XLIFF file per target locale (e.g., `es.xliff`, `fr-ca.xliff`)
- All collections are merged into a single file per target locale
- `<trans-unit>` IDs use full dot-delimited keys (e.g., `common.buttons.cancel`)
- `<source>` contains base locale value
- `<target>` contains translation (empty if not translated)
- `<note>` contains comment if present in resource entry
- **No status attributes or custom tags** - standard XLIFF 1.2 only
- **No tags from ResourceEntry** - only comments are included
- ICU message format syntax is preserved as-is in source and target values

**Filename Pattern:**
- Default: `{target}.xliff` (e.g., `es.xliff`, `fr-ca.xliff`)
- Custom: Use `--filename` with placeholders `{target}`, `{source}`, `{locale}`, `{date}`

**Example Output:**
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
        <target></target>
      </trans-unit>
    </body>
  </file>
</xliff>
```

### JSON Export

JSON export provides flexible format options for custom integrations and developer workflows.

**Format Options:**

1. **Structure**: Hierarchical (nested objects) or Flat (dot-delimited keys at root)
2. **Value Format**: Simple string values or rich objects with metadata

**Filename Pattern:**
- Default: `{locale}.json` (e.g., `es.json`, `fr-ca.json`)
- Custom: Use `--filename` with placeholders `{locale}`, `{date}`

**Metadata Fields:**
- `value` - The translation string (always present in rich format)
- `comment` - Resource comment (if present and not filtered)
- `baseValue` - Base locale value (if `--include-base` flag used)
- `status` - Translation status (if `--include-status` flag used)
- `tags` - Resource tags array (if `--include-tags` flag used)
- **Only defined fields are included** - undefined/nil fields are omitted

**Special Behavior:**
- When `--include-base` is specified without `--rich`, values become objects with `value` and `baseValue` properties
- Checksums are never exported
- Hierarchical format will error if a key is both a parent and leaf value (e.g., `common` has value and `common.buttons.ok` exists)

**Hierarchical with Rich Objects:**
```json
{
  "common": {
    "buttons": {
      "cancel": {
        "value": "Cancelar",
        "comment": "Button the user clicks to undo or discard changes or an action"
      }
    }
  }
}
```

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

**Flat with Rich Objects (with optional fields):**
```json
{
  "common.buttons.cancel": {
    "value": "Cancelar",
    "comment": "Button the user clicks to undo or discard changes or an action",
    "baseValue": "Cancel",
    "status": "translated",
    "tags": ["ui", "common"]
  },
  "common.buttons.ok": {
    "value": "Aceptar"
  }
}
```

**Flat with Simple Values:**
```json
{
  "common.buttons.cancel": "Cancelar",
  "common.buttons.ok": "Aceptar"
}
```

**With --include-base but not --rich:**
```json
{
  "common": {
    "buttons": {
      "cancel": {
        "value": "Cancelar",
        "baseValue": "Cancel"
      }
    }
  }
}
```

## Command-Line Interface

### Command Structure
```bash
# XLIFF export
lingo-tracker export --format xliff [options]

# JSON export
lingo-tracker export --format json [options]
```

### Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `--format` | `xliff \| json` | Export format (required) | - |
| `--collection` | `string` | Specific collection to export (comma-separated for multiple) | All collections |
| `--locale` | `string` | Target locale(s) to export (comma-separated, base locale excluded) | All target locales from config |
| `--status` | `string` | Filter by translation status (comma-separated: `new`, `translated`, `stale`, `verified`) | `new,stale` |
| `--tags` | `string` | Filter by tags (comma-separated, resources must have at least one matching tag) | None (no tag filtering) |
| `--output` | `string` | Output directory path | Config `exportFolder` or `./dist/lingo-export` |
| `--structure` | `flat \| hierarchical` | JSON structure (JSON only) | `hierarchical` |
| `--rich` | `boolean` | Include metadata in JSON objects (JSON only) | `false` |
| `--include-base` | `boolean` | Include base locale value (JSON only, forces object format) | `false` |
| `--include-status` | `boolean` | Include status in rich objects (JSON only) | `false` |
| `--include-comment` | `boolean` | Include comment in rich objects (JSON only) | `true` |
| `--include-tags` | `boolean` | Include tags array in rich objects (JSON only) | `false` |
| `--filename` | `string` | Custom filename pattern (placeholders: `{target}`, `{source}`, `{locale}`, `{date}`) | XLIFF: `{target}.xliff`, JSON: `{locale}.json` |
| `--dry-run` | `boolean` | Show what would be exported without writing files | `false` |
| `--verbose` | `boolean` | Show detailed export progress (each resource and file written) | `false` |

### Interactive Mode (TTY)
When run in interactive mode without required options:
- Prompt for export format (XLIFF or JSON)
- Prompt for collection selection (multiselect or "All")
- Prompt for locale selection (multiselect or "All", excluding base locale)
- Prompt for status filter (multiselect with default new,stale)
- Prompt for tag filtering (optional)
- For JSON: prompt for structure and rich object options

### Non-Interactive Mode (CI/CD)
When `--format` is specified, run without prompts using defaults for missing options.

## Filtering & Selection

### Collection Filtering
- **Default**: Export all collections defined in `.lingo-tracker.json`
- **Specific**: `--collection TestDataCore,TestDataPlayground`
- **Behavior**:
  - Skip collections that don't exist with warning
  - **Multiple collections are merged into single output files per locale**
  - If duplicate keys exist across collections, last collection's value wins

### Locale Filtering
- **Default**: Export all target locales configured for the collection(s)
- **Specific**: `--locale es,fr-ca,de`
- **Validation**: Warn if specified locale is not configured for any collection
- **Important**: **Base locale is NEVER exported** - only target locales
- Each target locale generates a separate output file

### Status Filtering
- **Default**: `new,stale` (resources needing translation)
- **Options**: `new`, `translated`, `stale`, `verified`, or combinations
- **Per-Locale Filtering**: Filtering is applied on a per-locale basis
  - If `common.buttons.ok` is `stale` in `es` but `translated` in `fr-ca`
  - With filter `new,stale`: exported in `es.xliff` but NOT in `fr-ca.xliff`
- **Behavior**:
  - Resources with no translation in target locale are considered `new`
  - If status filter includes `new`, include untranslated resources
  - **Resources with missing metadata are omitted and logged as errors**

### Tag Filtering
- **Default**: No tag filtering (all resources included regardless of tags)
- **Specific**: `--tags ui,common`
- **Behavior**: Include resources that have at least one matching tag
- **Combination**: Works in conjunction with status filtering (both must match)

### Output Directory
- **Default**: Value from `exportFolder` in `.lingo-tracker.json` (e.g., `dist/lingo-export`)
- **Override**: `--output ./custom/path`
- **Behavior**:
  - Create directory if it doesn't exist
  - Overwrite existing files with warning message
  - Fail early with clear error if directory is not writable

## Error Handling & Edge Cases

### Malformed Files
- **Behavior**: Skip folders with malformed `resource_entries.json` or `tracker_meta.json`
- **Logging**: Log detailed warning with file path and parse error
- **Continue**: Export continues with remaining resources
- **Summary**: Malformed files are listed in `export-summary.md`

### Missing Metadata
- **Behavior**: Resources without corresponding metadata entries are **omitted** from export
- **Logging**: Log error for each resource without metadata
- **Summary**: List all omitted resources in `export-summary.md` under "Resources Omitted" section

### Hierarchical Key Conflicts
- **Issue**: Key is both a parent and leaf value (e.g., `common` has value and `common.buttons.ok` exists)
- **Behavior**: Log error and include in error summary
- **Export**: Resource is still exported but marked as problematic in summary

### Empty Export Results
- **Behavior**: If no resources match filter criteria, do NOT create empty files
- **Logging**: Log warning message
- **Summary**: Include warning in `export-summary.md`
- **Exit Code**: Return success (0) but with warning notification

### Non-Writable Output Directory
- **Behavior**: Fail early with clear error message before processing resources
- **Exit Code**: Return error code (1)
- **No Partial Output**: Do not create any files if directory is not writable

### File Overwrite
- **Behavior**: Overwrite existing files with warning message logged
- **Summary**: List overwritten files in `export-summary.md`

### Large Exports
- **Streaming**: Use streaming where possible to handle large datasets efficiently
- **Fallback**: Fall back to in-memory assembly if streaming not available
- **Progress**: Show progress indicators in `--verbose` mode

## Export Summary Report

Every export generates an `export-summary.md` file in the output directory with the following structure:

```markdown
# Export Summary

**Date**: 2025-12-11 14:23:45
**Format**: XLIFF 1.2
**Collections**: TestDataCore, TestDataPlayground (merged)
**Target Locales**: es, fr-ca, de
**Status Filter**: new, stale
**Tag Filter**: ui, common

## Results

- **Resources Exported**: 245
- **Files Created**: 3
- **Output Directory**: /path/to/dist/lingo-export

## Files Created

- `es.xliff` (98 trans-units)
- `fr-ca.xliff` (76 trans-units)
- `de.xliff` (71 trans-units)

## Warnings

- Collection "NonExistentCollection" not found, skipped
- Overwritten existing file: es.xliff

## Errors

### Malformed Files
- `/path/to/translations/broken/resource_entries.json`: JSON parse error at line 12
- `/path/to/translations/invalid/tracker_meta.json`: Invalid schema

### Resources Omitted (Missing Metadata)
- `common.buttons.submit`
- `dashboard.title`
- `settings.advanced.cache`

### Hierarchical Key Conflicts
- `common`: Has value "Common" but also has child keys
```

**Dry-Run Mode:**
In dry-run mode (`--dry-run`), the summary includes what would have been exported without actually writing files:

```markdown
# Export Summary (DRY RUN)

**Would Export**: 245 resources
**Would Create**: 3 files
**Output Directory**: /path/to/dist/lingo-export

## Files That Would Be Created

- `es.xliff` (98 trans-units)
- `fr-ca.xliff` (76 trans-units)
- `de.xliff` (71 trans-units)
```

## Implementation Details

### Core Function Interface

```typescript
interface ExportResult {
  format: 'xliff' | 'json';
  filesCreated: string[];
  resourcesExported: number;
  warnings: string[];
  errors: string[];
  collections: string[];
  locales: string[];
  outputDirectory: string;
  omittedResources: string[]; // Resources without metadata
  malformedFiles: string[];
  hierarchicalConflicts: string[];
}
```

### File Structure

```
libs/core/src/lib/export/
├── export-to-xliff.ts      # XLIFF format generation
├── export-to-json.ts       # JSON format generation
├── export-common.ts        # Shared filtering/loading logic
├── export-summary.ts       # Summary report generation
└── types.ts                # Export interfaces and types
```

### XLIFF Generation
- Use `xliff` library (https://github.com/locize/xliff)
- Library handles schema validation and XML generation
- No custom status attributes or tags in output
- ICU message format preserved as-is

### JSON Generation
- Use native `JSON.stringify()` with 2-space indentation
- Implement streaming for large datasets where possible
- Build hierarchical structure using key path decomposition

### Filtering Logic
- **Per-Locale Basis**: Each locale filtered independently
- **Status Check**: Compare against metadata for each locale
- **Tag Match**: Resource must have at least one matching tag (OR logic)
- **Combined Filters**: Resource must pass both status AND tag filters (AND logic)

### Collection Merging
- Process collections in order specified (or alphabetical if "All")
- Build merged resource map with last-write-wins for duplicate keys
- Track source collection for each resource in warnings if duplicate

### Future Extensibility
- Architecture supports pluggable export formats
- Future formats could include: Java properties, CSV, PO files
- Export functions follow consistent interface pattern

## Implementation Status

**Status**: Fully implemented and production-ready as of December 2025

This feature has been completely implemented across all 10 planned phases. The implementation includes:

- **Core Infrastructure**: Complete resource loading, filtering, and collection merging logic in `libs/core/src/lib/export/` with comprehensive TypeScript type definitions
- **XLIFF Export**: Standard XLIFF 1.2 generation using the `xliff` library with full schema compliance and ICU message format preservation
- **JSON Export**: All four format variations (flat/hierarchical × simple/rich) with metadata options (`--include-base`, `--include-status`, `--include-tags`)
- **CLI Command**: Interactive and non-interactive modes with full option support, including dry-run, verbose output, and custom filename patterns with placeholder support
- **Export Summary**: Automatic `export-summary.md` generation with detailed statistics, warnings, errors, and comprehensive reporting
- **Error Handling**: Robust handling of malformed files, missing metadata, hierarchical key conflicts, empty results, and all edge cases

All unit tests and integration tests are passing. The feature supports professional translation workflows, custom integrations, and CI/CD pipelines.