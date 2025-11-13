# Feature: Delete translation resource entries (Bulk Operations)

This feature lets users delete one or more existing translation resources in a single operation. Users provide **exact keys** (e.g., `apps.common.buttons.ok`), and the operation processes all provided keys and returns the count of successfully deleted entries. The user will need to confirm the delete operation. If after deletion there are no other entries at the same leaf (resource_entries is empty), then remove the resource_entries.json and tracker_meta.json.

**Architecture Decisions**:

1. **Best-Effort Approach**: The bulk delete operation uses a best-effort approach rather than atomic transactions. If some keys fail validation or are not found, the operation continues processing remaining keys and returns the count of successful deletions. This provides resilience in bulk operations and clear feedback about partial success scenarios.

2. **Exact Key Matching Only**: Keys must exactly match existing resources (e.g., `apps.common.buttons.ok`). There is no partial/prefix matching support. To delete multiple resources, users must provide each exact key in the bulk operation (comma-separated in CLI, or as an array in the API).

## Implementation Task List

### Phase 1: Core Library Implementation ✅ COMPLETED

**Location:** `libs/core/src/lib/resource/`

#### Task 1.1: Create delete-resource.ts core function ✅
- [x] Create `libs/core/src/lib/resource/delete-resource.ts`
- [x] Define `DeleteResourceParams` interface:
  ```typescript
  interface DeleteResourceParams {
    keys: string[];  // Array of full dot-delimited keys (e.g., ["apps.common.buttons.ok", "apps.common.buttons.cancel"])
  }
  ```
- [x] Define return type:
  ```typescript
  interface DeleteResourceResult {
    entriesDeleted: number;  // Count of successfully deleted entries
    errors?: Array<{         // Optional array of errors encountered (for partial failures)
      key: string;
      error: string;
    }>;
  }
  ```
- [x] Implement `deleteResource(translationsFolder: string, params: DeleteResourceParams)`:
  - Initialize counter: `let entriesDeleted = 0`
  - Initialize error collector: `const errors: Array<{key: string, error: string}> = []`
  - Loop through each key in `params.keys`:
    - Validate key format using existing `validateKey()`
      - If validation fails, collect error and continue to next key
    - Use `resolveResourceKey(translationsFolder, key, undefined)` to get full path
      - If resolution fails, collect error and continue
    - Use `splitResolvedKey()` to decompose into folderPath array and entryKey
    - Construct full folder path: `path.join(translationsFolder, ...folderPath)`
    - Check if folder exists using `existsSync()`
      - If missing, collect error and continue
    - Load `resource_entries.json` from folder
    - Load `tracker_meta.json` from folder
    - Check if entryKey exists in resource_entries
      - If missing, collect error and continue
    - Delete entry from both objects: `delete entries[entryKey]` and `delete metadata[entryKey]`
    - Increment counter: `entriesDeleted++`
    - Check if objects are now empty: `Object.keys(entries).length === 0`
    - If empty, delete both JSON files using `fs.unlinkSync()`
    - If not empty, write updated files using `fs.writeFileSync()` with pretty formatting
  - Return `{ entriesDeleted, errors: errors.length > 0 ? errors : undefined }`

#### Task 1.2: Export new function ✅
- [x] Add export to `libs/core/src/lib/resource/index.ts`:
  ```typescript
  export * from './delete-resource';
  ```

#### Task 1.3: Unit tests for delete-resource ✅
- [x] Create `libs/core/src/lib/resource/delete-resource.spec.ts`
- [x] Test cases:
  - **Bulk deletion scenarios**:
    - Successfully delete multiple resources (2-3 keys)
    - Delete resources from different folders in single operation
    - Partial success: some keys valid, some invalid (verify count and errors)
    - Partial success: some keys found, some not found
    - Empty array handling (entriesDeleted should be 0)
    - All keys invalid (entriesDeleted should be 0, errors populated)
    - Mixed errors: validation failures + not found errors
  - **Single key scenarios**:
    - Successfully delete single existing resource
    - Error collected when resource doesn't exist
    - Error collected when folder doesn't exist
    - Error collected for invalid key format
    - Files removed when last entry is deleted
    - Files preserved when other entries remain in same folder
    - Handles nested folder structures (e.g., "apps.common.buttons.ok")

#### Task 1.4: Add constants to libs/core/src/constants.ts ✅
- [x] Added `RESOURCE_ENTRIES_FILENAME = 'resource_entries.json'`
- [x] Added `TRACKER_META_FILENAME = 'tracker_meta.json'`
- [x] Updated `add-resource.ts` to use constants

#### Task 1.5: Test verification ✅
- [x] All 14 delete-resource tests passing
- [x] All 88 core library tests passing

---

### Phase 2: Data Transfer Objects (DTOs) ✅ COMPLETED

**Location:** `libs/data-transfer/src/lib/`

#### Task 2.1: Create delete-resource.dto.ts ✅
- [x] Create `libs/data-transfer/src/lib/delete-resource.dto.ts`
- [x] Define interface:
  ```typescript
  export interface DeleteResourceDto {
    keys: string[];  // Array of full dot-delimited keys
  }
  ```
- [x] Export from `libs/data-transfer/src/index.ts`

#### Task 2.2: Create delete-resource-response.dto.ts ✅
- [x] Create `libs/data-transfer/src/lib/delete-resource-response.dto.ts`
- [x] Define interface:
  ```typescript
  export interface DeleteResourceResponseDto {
    entriesDeleted: number;  // Count of successfully deleted entries
    errors?: Array<{         // Optional array of errors for partial failures
      key: string;
      error: string;
    }>;
  }
  ```
- [x] Export from `libs/data-transfer/src/index.ts`

---

### Phase 3: API Implementation ✅ COMPLETED

**Location:** `apps/api/src/app/collections/resources/`

#### Task 3.1: Add DELETE endpoint to resources controller ✅
- [x] Open `apps/api/src/app/collections/resources/resources.controller.ts`
- [x] Import new core functions and DTOs
- [x] Add DELETE endpoint:
  ```typescript
  @Delete()
  async delete(
    @Param('collectionName') collectionName: string,
    @Body() dto: DeleteResourceDto  // Now accepts keys: string[]
  ): Promise<DeleteResourceResponseDto>  // Now returns entriesDeleted count
  ```
- [x] Implementation:
  - Decode collection name: `decodeURIComponent(collectionName)`
  - Get config from ConfigService
  - Find collection in config, throw NotFoundException if not found
  - Get translationsFolder from collection config
  - Call `deleteResource(translationsFolder, { keys: dto.keys })`
  - Handle bulk operation errors:
    - Return result with entriesDeleted count and optional errors array
    - Return 200 OK even if some keys fail (best-effort approach)
    - Return 400 BAD_REQUEST only if keys array is empty or malformed
    - Return 404 NOT_FOUND only if collection not found
    - Other → 500 INTERNAL_SERVER_ERROR
  - Return DeleteResourceResponseDto with count and errors

---

### Phase 4: CLI Implementation ✅ COMPLETED

**Location:** `apps/cli/src/commands/`

**Note:** CLI interface supports both single-key (for simplicity) and comma-separated keys (for bulk operations).

#### Task 4.1: Create delete-resource command file ✅
- [x] Create `apps/cli/src/commands/delete-resource.ts`
- [x] Define command options interface:
  ```typescript
  interface DeleteResourceOptions {
    collection?: string;
    key?: string;        // Single key OR comma-separated keys
    yes?: boolean;       // Skip confirmation prompt (--yes or -y flag)
  }
  ```

#### Task 4.2: Implement interactive prompts ✅
- [x] Import prompts library: `const prompts = (await import('prompts')).default;`
- [x] Implement `promptForMissing()` function:
  - If collection not provided:
    - Load config to get available collections
    - Show select prompt with collection choices
  - If key(s) not provided:
    - Show text input prompt for key entry
    - Support comma-separated keys (e.g., "key1, key2, key3")
- [x] Implement confirmation prompt:
  - Parse keys (split by comma if needed)
  - Display list of keys to be deleted:
    - Single key: "You are about to delete: {key}"
    - Multiple keys: "You are about to delete {count} resources:\n  - key1\n  - key2\n  - key3"
  - Show warning: "This will remove translations for all locales"
  - Ask: "Are you sure? (y/N)"
  - Skip if `--yes` flag provided or not in TTY mode
  - Exit gracefully if user declines

#### Task 4.3: Implement deleteResourceCommand function ✅
- [x] Create main command handler:
  ```typescript
  export async function deleteResourceCommand(options: DeleteResourceOptions): Promise<void>
  ```
- [x] Implementation steps:
  - Load config from `.lingo-tracker.json` in cwd
  - Validate collection exists in config
  - Parse keys from options (handle comma-separated string or array)
  - If TTY mode, prompt for missing options
  - If non-TTY mode, validate all required options present
  - Get translationsFolder from collection config
  - Show confirmation prompt (unless --yes or non-TTY)
  - Call `deleteResource()` from core library with keys array
  - Display results:
    - Show count: "✓ Deleted {entriesDeleted} resource(s)"
    - If errors exist, show warnings for each failed key
  - Handle other errors with user-friendly messages

#### Task 4.4: Register command in main.ts ✅
- [x] Open `apps/cli/src/main.ts`
- [x] Add delete-resource command:
  ```typescript
  program
    .command('delete-resource')
    .description('Delete one or more translation resources from a collection')
    .option('--collection <name>', 'Collection name')
    .option('--key <keys>', 'Resource key(s) - single key or comma-separated (e.g., key1,key2,key3)')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (options) => {
      const { deleteResourceCommand } = await import('./commands/delete-resource');
      await deleteResourceCommand(options);
    });
  ```

#### Task 4.5: CLI manual testing
- [x] Test interactive mode (TTY):
  - Run `delete-resource` without options, verify prompts appear
  - Test single key entry
  - Test comma-separated key entry (e.g., "key1, key2, key3")
  - Verify confirmation prompt shows list of keys
  - Test declining confirmation (should exit cleanly)
  - Test with --yes flag (should skip confirmation)
- [x] Test non-interactive mode (CI/CD):
  - Test with all required options provided
  - Verify no prompts appear
  - Test error when options missing
- [x] Test edge cases:
  - Delete single key (backward compatibility)
  - Delete multiple keys (bulk operation)
  - Mix of valid and invalid keys (partial success)
  - Delete non-existent resource (should show in errors)
  - Delete from non-existent collection (should show error)
  - Invalid key format (should show in errors)
  - Delete last entry in folder (verify files are removed)

---

### Phase 5: Documentation & Testing ✅ COMPLETED

#### Task 5.1: Update README/Documentation ✅
- [x] Document `delete-resource` CLI command in `/Users/simon/git/lingo-tracker/docs/cli.md`
- [x] Add usage examples for implemented features (exact key matching, bulk operations)
- [x] Document DELETE API endpoint in `/Users/simon/git/lingo-tracker/docs/api.md`

#### Task 5.2: Add usage examples to documentation ✅
- [x] Add CLI examples:
  ```bash
  # Interactive mode - prompts for collection and key(s)
  lingo-tracker delete-resource

  # Delete a single resource (exact match only)
  lingo-tracker delete-resource --collection default --key apps.common.buttons.ok

  # Delete multiple resources (comma-separated, all exact matches)
  lingo-tracker delete-resource --collection default --key "apps.common.buttons.ok,apps.common.buttons.cancel,apps.common.buttons.save"

  # Skip confirmation prompt (useful for scripts)
  lingo-tracker delete-resource --collection default --key apps.common.buttons.ok --yes
  ```
- [x] Add API curl examples:
  ```bash
  # Delete a single resource (exact match only)
  curl -X DELETE http://localhost:3030/api/collections/default/resources \
    -H "Content-Type: application/json" \
    -d '{"keys": ["apps.common.buttons.ok"]}'

  # Delete multiple resources (bulk operation, all exact matches)
  curl -X DELETE http://localhost:3030/api/collections/default/resources \
    -H "Content-Type: application/json" \
    -d '{"keys": ["apps.common.buttons.ok", "apps.common.buttons.cancel", "apps.common.buttons.save"]}'

  # Response format with entriesDeleted and optional errors:
  # {
  #   "entriesDeleted": 3,
  #   "errors": []
  # }
  ```

---

## Implementation Order Recommendation

1. **Core Library** (Phase 1): Implement and test business logic first
2. **DTOs** (Phase 2): Define contracts between layers
3. **API** (Phase 3): REST endpoints for programmatic access
4. **CLI** (Phase 4): User-facing command-line interface
5. **Documentation** (Phase 5): Polish and finalize

---

## Key Design Decisions

### Bulk Operations (Best-Effort Approach)
- **Array-Based API**: All operations accept `keys: string[]` (supports single or multiple keys)
- **Best-Effort Processing**: Continue processing all keys even if some fail
- **Error Collection**: Failed operations collect errors without throwing exceptions
- **Count-Based Results**: Return count of successful deletions plus optional error details
- **Partial Success**: Return HTTP 200 with both success count and error array
- **No Atomicity**: Operations are NOT atomic - successful deletions persist even if others fail
- **Backward Compatibility**: Single-key operations work by passing single-element array

### Key Handling (Exact Matching Only)
- Users provide **exact dot-delimited keys** (e.g., `apps.common.buttons.ok`)
- **Exact matching only**: Each key must exactly match an existing resource to be deleted
- **No partial/prefix matching**: To delete multiple resources, each exact key must be provided
- **Bulk operations**: Support comma-separated keys in CLI or array in API
  - Example: `"apps.common.buttons.ok,apps.common.buttons.cancel,apps.common.buttons.save"`
  - Example API: `{"keys": ["apps.common.buttons.ok", "apps.common.buttons.cancel"]}`
- **Safety considerations**:
  - CLI shows confirmation prompt listing all keys before deletion
  - Best-effort approach: partial failures don't halt processing
  - Clear error messages for non-existent or invalid keys
- Key validation and path resolution handled internally by existing functions

### File Cleanup Behavior
When the last resource entry is deleted from a folder:
- ✅ Delete `resource_entries.json`
- ✅ Delete `tracker_meta.json`
- ❌ Do NOT delete empty parent folders (keeps Git structure stable)

### Confirmation Flow
- **CLI Interactive**: Always show confirmation with list of keys unless `--yes` flag
- **CLI Non-Interactive**: Require `--yes` flag or treat as error
- **API**: No confirmation (caller's responsibility)

### Error Handling (Updated for Bulk)
**Core Library:**
- Collect all errors in array, never throw during key iteration
- Return errors array with `{key, error}` structure

**API Error Mapping:**
- Partial/full success with errors → 200 OK with `entriesDeleted` and `errors` array
- Empty or malformed `keys` array → 400 BAD_REQUEST
- Collection not found → 404 NOT_FOUND
- Unexpected errors → 500 INTERNAL_SERVER_ERROR

**Note:** Individual key errors (validation, not found) do NOT result in HTTP errors - they are returned in the response errors array.

---

## Testing Checklist

### Core Library (Updated for Bulk)
- ✅ Delete single existing resource successfully
- ✅ Delete multiple resources in single operation
- ✅ Partial success scenarios (some succeed, some fail)
- ✅ Empty array returns 0 deletions
- ✅ All invalid keys returns 0 deletions with errors
- ✅ Error collected when resource doesn't exist
- ✅ Error collected when folder doesn't exist
- ✅ Error collected for invalid key format
- ✅ Remove both JSON files when last entry deleted *(existing)*
- ✅ Preserve JSON files when other entries remain *(existing)*
- ✅ Handle deeply nested folder structures *(existing)*

### CLI (To Be Implemented with Bulk Support)
- [x] Interactive mode prompts for missing inputs
- [x] Confirmation prompt appears and shows list of keys
- [x] --yes flag skips confirmation
- [x] Non-interactive mode validates required options
- [x] Error messages are clear and actionable
- [x] Success messages show deletion count
- [x] Single key deletion (backward compatibility)
- [x] Comma-separated keys work correctly
- [x] Partial failures show warnings

### API (Updated for Bulk)
- ✅ DELETE returns 200 with correct response DTO
- ✅ DELETE with single key in array returns count
- ✅ DELETE with multiple keys returns count
- ✅ Partial success returns 200 with errors array
- ✅ Empty keys array returns 400 BAD_REQUEST
- ✅ DELETE returns 404 when collection not found

### Integration (Updated for Bulk)
- ✅ Full workflow: add → delete → verify cleanup *(existing)*
- ✅ Multiple resources: add many → delete one → verify others intact *(existing)*
- ✅ Bulk delete: add many → delete multiple → verify correct ones deleted
- ✅ Works consistently across CLI and API with bulk operations
- ✅ File system state is correct after operations *(existing)*
- ✅ Works with various folder nesting levels *(existing)*