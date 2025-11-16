# Feature: Create Translation Resource Entries

This feature lets users add translation resources. A resource is a key/value pair in the base locale, optionally annotated with metadata and translated values for other locales.

## Required and Optional Fields

### Required
- **Key**: Dot-delimited string (e.g., `apps.common.buttons.ok`)
- **Base value**: Text in the base locale (stored as `source`)

### Optional
- **Comment**: Context to aid translators
- **Tags**: Comma-separated list for filtering/exporting
- **Target folder**: Dot-delimited path relative to translation folder

## Key Resolution and Filesystem Layout

### Resolution Logic
1. Compute resolved key: `resolvedKey = targetFolder ? targetFolder + '.' + key : key`
2. Split by `.` - all but last segment form nested folders
3. Last segment becomes the entry key in `resource_entries.json`

### Target Folder Convenience
Target folder provides flexibility in how resources are organized:
- `key: "apps.common.buttons.cancel"`, `targetFolder: ""` (empty)
- `key: "buttons.cancel"`, `targetFolder: "apps.common"`

Both resolve to the same location: `apps/common/buttons/cancel`

**Note**: If `targetFolder` overlaps with key prefix, no de-duplication is performed.

### Validation Rules
Each segment (between dots) of `key` and `targetFolder` must match: `[A-Za-z0-9_-]+`

## File Structure

At each folder level, two files are maintained:

### resource_entries.json
Contains the actual translation data:
```json
{
  "cancel": {
    "source": "Cancel",
    "comment": "Cancel button is used to abort any operation without making any changes",
    "tags": ["ui", "buttons"],
    "fr-ca": "Annuler",
    "es": "Cancelar"
  }
}
```

### tracker_meta.json
Contains checksums and translation status:
```json
{
  "cancel": {
    "en": {
      "checksum": "ea4788705e6873b424c65e91c2846b19"
    },
    "fr-ca": {
      "checksum": "847607d75e504090b5aff16a6e6c8351",
      "baseChecksum": "ea4788705e6873b424c65e91c2846b19",
      "status": "translated"
    }
  }
}
```

## Status Lifecycle

Translation entries use a status field to track their state:

- **`new`**: Not yet translated (set automatically on creation)
- **`translated`**: Has translation but not verified
- **`stale`**: Base value changed, translation out of sync
- **`verified`**: Reviewed and approved (set manually by users or language experts)

### Status Transitions
- On creation → `new`
- On import/update of translation → `translated`
- When base source changes → existing translations marked `stale`

## Checksums

MD5 hashes are used to detect changes:

- **Base locale**: Has `checksum` calculated from base value
- **Non-base locales**: Have both:
  - `checksum`: Hash of the translation value
  - `baseChecksum`: Hash of the base value at time of translation (for stale detection)

## Usage

### CLI
```bash
# Interactive mode
lingo-tracker add-resource

# Non-interactive mode
lingo-tracker add-resource \
  --collection default \
  --key apps.common.buttons.ok \
  --value "OK" \
  --comment "OK button" \
  --tags "ui,buttons"

# With target folder
lingo-tracker add-resource \
  --collection default \
  --key buttons.ok \
  --targetFolder apps.common \
  --value "OK"
```

### API
```bash
# Add single resource
POST /api/collections/:collection/resources
Content-Type: application/json

[{
  "key": "apps.common.buttons.ok",
  "baseValue": "OK",
  "comment": "OK button",
  "tags": ["ui", "buttons"],
  "targetFolder": ""
}]
```

**Note**: API accepts an array of resources for bulk operations.

## Implementation Status

### Completed
- ✅ Core library implementation with validation and checksum logic
- ✅ CLI command with interactive and non-interactive modes
- ✅ Data Transfer DTOs
- ✅ API endpoint with bulk operation support
- ✅ Unit tests for all layers
- ✅ Documentation (getting-started, CLI, API)

### Pending
- Tracker UI implementation (Create Resource dialog)
- E2E smoke tests
