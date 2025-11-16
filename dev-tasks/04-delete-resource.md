# Feature: Delete Translation Resource Entries

This feature lets users delete one or more existing translation resources in a single operation. Users provide exact keys, and the operation returns the count of successfully deleted entries.

## Overview

Delete operations support both single and bulk deletion of resources. The implementation uses a best-effort approach - if some keys fail validation or are not found, the operation continues processing remaining keys and returns clear feedback about successes and failures.

## Key Features

### Exact Key Matching
- Users provide **exact dot-delimited keys** (e.g., `apps.common.buttons.ok`)
- No partial or prefix matching - each key must exactly match an existing resource
- For bulk operations, each key must be provided explicitly

### Best-Effort Processing
- Continues processing all keys even if some fail
- Failed operations collect errors without throwing exceptions
- Returns count of successful deletions plus optional error details
- Partial success returns HTTP 200 with both success count and error array
- Operations are NOT atomic - successful deletions persist even if others fail

### File Cleanup
When the last resource entry is deleted from a folder:
- ✅ Delete `resource_entries.json`
- ✅ Delete `tracker_meta.json`
- ❌ Do NOT delete empty parent folders (keeps Git structure stable)

## Usage

### CLI

```bash
# Interactive mode - prompts for collection and key(s)
lingo-tracker delete-resource

# Delete a single resource
lingo-tracker delete-resource --collection default --key apps.common.buttons.ok

# Delete multiple resources (comma-separated)
lingo-tracker delete-resource --collection default --key "apps.common.buttons.ok,apps.common.buttons.cancel,apps.common.buttons.save"

# Skip confirmation prompt (useful for scripts)
lingo-tracker delete-resource --collection default --key apps.common.buttons.ok --yes
```

**CLI Options:**
- `--collection <name>` - Collection to delete from
- `--key <keys>` - Single key or comma-separated keys
- `--yes` / `-y` - Skip confirmation prompt

**CLI Behavior:**
- Interactive mode prompts for missing inputs
- Confirmation prompt shows list of keys before deletion
- `--yes` flag skips confirmation (useful for CI/CD)
- Reports deletion count and any errors

### API

```bash
# Delete a single resource
curl -X DELETE http://localhost:3030/api/collections/default/resources \
  -H "Content-Type: application/json" \
  -d '{"keys": ["apps.common.buttons.ok"]}'

# Delete multiple resources (bulk operation)
curl -X DELETE http://localhost:3030/api/collections/default/resources \
  -H "Content-Type: application/json" \
  -d '{"keys": ["apps.common.buttons.ok", "apps.common.buttons.cancel", "apps.common.buttons.save"]}'

# Response format:
{
  "entriesDeleted": 3,
  "errors": []
}

# Partial success response:
{
  "entriesDeleted": 2,
  "errors": [
    {
      "key": "apps.common.buttons.invalid",
      "error": "Resource not found"
    }
  ]
}
```

**API Endpoint:**
- **DELETE** `/api/collections/:collectionName/resources`
- **Request Body**: `{ keys: string[] }`
- **Response**: `{ entriesDeleted: number, errors?: Array<{key: string, error: string}> }`

**HTTP Status Codes:**
- `200 OK` - Success (including partial success with errors array)
- `400 BAD_REQUEST` - Empty or malformed keys array
- `404 NOT_FOUND` - Collection not found
- `500 INTERNAL_SERVER_ERROR` - Unexpected errors

**Note**: Individual key errors (validation failures, not found) are returned in the response errors array, not as HTTP errors.

## Data Transfer Objects

### DeleteResourceDto
```typescript
interface DeleteResourceDto {
  keys: string[];  // Array of full dot-delimited keys
}
```

### DeleteResourceResponseDto
```typescript
interface DeleteResourceResponseDto {
  entriesDeleted: number;  // Count of successfully deleted entries
  errors?: Array<{         // Optional array of errors for partial failures
    key: string;
    error: string;
  }>;
}
```

## Error Handling

### Core Library
- Collects all errors in array, never throws during key iteration
- Returns errors array with `{key, error}` structure
- Continues processing even after individual failures

### API Error Mapping
- Partial/full success with errors → 200 OK with `entriesDeleted` and `errors` array
- Empty or malformed `keys` array → 400 BAD_REQUEST
- Collection not found → 404 NOT_FOUND
- Unexpected errors → 500 INTERNAL_SERVER_ERROR

### CLI Error Handling
- Shows clear error messages for validation failures
- Displays warnings for keys that couldn't be deleted
- Reports successful deletion count even with partial failures
- Exits gracefully if user declines confirmation

## Validation

Each key segment must match: `[A-Za-z0-9_-]+`

Failed validations are collected in the errors array and processing continues.

## Implementation Status

**Status**: COMPLETED

### Implemented Components
- ✅ Core library with bulk delete support and error collection
- ✅ Data Transfer DTOs (DeleteResourceDto, DeleteResourceResponseDto)
- ✅ API DELETE endpoint with best-effort processing
- ✅ CLI command with interactive/non-interactive modes
- ✅ Confirmation prompts with key listing
- ✅ File cleanup when last entry removed
- ✅ Unit tests for all layers
- ✅ Documentation (CLI, API)

### Key Files
- Core: `/Users/simon/git/lingo-tracker/libs/core/src/lib/resource/delete-resource.ts`
- DTOs: `/Users/simon/git/lingo-tracker/libs/data-transfer/src/lib/delete-resource*.dto.ts`
- API: `/Users/simon/git/lingo-tracker/apps/api/src/app/collections/resources/resources.controller.ts`
- CLI: `/Users/simon/git/lingo-tracker/apps/cli/src/commands/delete-resource.ts`
- Docs: `/Users/simon/git/lingo-tracker/docs/cli.md`, `/Users/simon/git/lingo-tracker/docs/api.md`

---

**Design Philosophy**: The bulk operation design prioritizes resilience and clear feedback. By using best-effort processing with error collection, users get maximum value from partial successes while maintaining full visibility into what failed and why.
