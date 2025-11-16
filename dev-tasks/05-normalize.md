# Feature: Normalize translation resources

Normalize fixes and aligns on-disk translation files after manual edits or incomplete entries. It recomputes checksums, updates statuses, ensures required files exist at every level, and adds any missing locale values. New locale entries are initialized from the base locale value with status `new`. After normalization completes, empty folders are automatically cleaned up to keep the translations directory structure lean and organized.

## Scope
- Operates per collection (required) and may support an "all collections" mode.
- Traverses the translations folder tree and processes every `resource_entries.json` / `tracker_meta.json` pair.
- Non-destructive: preserves existing values and comments; only fills missing pieces and corrects metadata.
- Cleans up empty folders after normalization to maintain a clean folder structure.

## Rules and behavior
- Validation
  - Keys are leaf properties inside `resource_entries.json` objects.
  - Key and target folder naming rules remain unchanged: per segment `[A-Za-z0-9_-]+` (any spaces will be converted to _).
- File structure
  - At each folder level under translations: ensure `resource_entries.json` and `tracker_meta.json` exist; create empty files if missing.
- Base locale handling
  - The base value is `resource_entries.json[leafKey].source`.
  - Recompute the base checksum (MD5 of the base value) and store under base locale code in `tracker_meta.json`.
- Non-base locales handling
  - For each configured locale L ≠ base:
    - If `resource_entries.json[leafKey][L]` is missing, add it and set the value equal to the base value; set status `new`.
    - Recompute `checksum` for the locale value.
    - Set/update `baseChecksum` to the current base checksum.
    - Status normalization:
      - If locale entry was added just now → `new`.
      - Else if base checksum changed since last time → `stale` (unless the locale value equals the new base value, in which case keep `new`).
      - Else if locale value present and non-empty → keep existing (`translated` or `verified`).
- Comments and tags
  - Preserve comments and tags from `resource_entries.json` as-is.
  - Optional: trim and de-duplicate tags (safe normalization).
- No-op detection
  - If a resource is already fully consistent, do nothing.
- Folder cleanup (runs after normalization)
  - Remove empty leaf folders (folders with no `resource_entries.json` or empty `resource_entries.json`)
  - Remove empty intermediate folders recursively (folders with no subfolders and no files)
  - Use bottom-up traversal: check leaf folders first, then parent folders as children are removed
  - Never remove the root translations folder
  - Consider a folder empty if it contains:
    - No `resource_entries.json` file, OR
    - An empty `resource_entries.json` (no entries or `{}`), AND
    - No subfolders
  - Folders containing only `tracker_meta.json` or hidden files (`.gitkeep`, etc.) are considered empty
  - Cleanup runs automatically after normalization completes

## Examples
Before (missing `es`, outdated checksums)
```json
{
  "resource_entries.json": {
    "cancel": {
      "source": "Cancel",
      "comment": "Cancel button",
      "tags": ["ui", "buttons"],
      "fr-ca": "Annuler"
    }
  },
  "tracker_meta.json": {
    "cancel": {
      "en": { "checksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      "fr-ca": { "checksum": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "baseChecksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "status": "translated" }
    }
  }
}
```

After normalize
```json
{
  "resource_entries.json": {
    "cancel": {
      "source": "Cancel",
      "comment": "Cancel button",
      "tags": ["ui", "buttons"],
      "fr-ca": "Annuler",
      "es": "Cancel"
    }
  },
  "tracker_meta.json": {
    "cancel": {
      "en": { "checksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      "fr-ca": { "checksum": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "baseChecksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "status": "translated" },
      "es": { "checksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "baseChecksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "status": "new" }
    }
  }
}
```

## Folder Cleanup Implementation Details

### Algorithm

The folder cleanup process runs after all normalization is complete using a bottom-up traversal approach:

```
function cleanupEmptyFolders(translationsRoot: string): number {
  let foldersRemoved = 0;

  // Step 1: Walk directory tree depth-first to build list of folders (deepest first)
  const folders = getAllFoldersBottomUp(translationsRoot);

  // Step 2: For each folder (starting from deepest leaves):
  for (const folder of folders) {
    if (folder === translationsRoot) continue; // Never remove root

    if (isFolderEmpty(folder)) {
      fs.rmdirSync(folder);
      foldersRemoved++;
    }
  }

  return foldersRemoved;
}

function isFolderEmpty(folderPath: string): boolean {
  const entries = fs.readdirSync(folderPath);

  // Check for subfolders (non-empty if any exist)
  const hasSubfolders = entries.some(entry =>
    fs.statSync(path.join(folderPath, entry)).isDirectory()
  );
  if (hasSubfolders) return false;

  // Check for resource_entries.json with actual entries
  const resourceEntriesPath = path.join(folderPath, 'resource_entries.json');
  if (fs.existsSync(resourceEntriesPath)) {
    const content = JSON.parse(fs.readFileSync(resourceEntriesPath, 'utf8'));
    // Empty object or no keys means empty
    if (Object.keys(content).length > 0) return false;
  }

  // If we get here: no subfolders, and either no resource_entries.json or it's empty
  // tracker_meta.json and hidden files don't count
  return true;
}
```

### Edge Cases

1. **Folders with only tracker_meta.json**: Considered empty and removed
2. **Folders with hidden files (.gitkeep, .DS_Store)**: Considered empty and removed
3. **Empty resource_entries.json ({})**: Triggers folder removal
4. **Root translations folder**: Never removed, even if empty
5. **Concurrent modifications**: Cleanup happens after normalization locks are released
6. **Dry-run mode**: Counts folders that would be removed but doesn't delete them

### Example Before/After

Before normalization:
```
translations/
├── apps/
│   ├── common/
│   │   ├── resource_entries.json (empty: {})
│   │   └── tracker_meta.json
│   └── dashboard/
│       └── alerts/
│           ├── resource_entries.json (has entries)
│           └── tracker_meta.json
└── shared/
    ├── resource_entries.json (has entries)
    └── tracker_meta.json
```

After normalization with folder cleanup:
```
translations/
├── apps/
│   └── dashboard/
│       └── alerts/
│           ├── resource_entries.json (has entries)
│           └── tracker_meta.json
└── shared/
    ├── resource_entries.json (has entries)
    └── tracker_meta.json
```

Removed: `apps/common/` (empty resource_entries.json)

## CLI
- CLI command: `normalize`
  - Flags: `--collection <name>` (required) or `--all`, `--fix` (default true), `--dry-run` (optional; print planned changes only).
  - Output summary: counts of entries processed, locales added, files created/updated, folders removed.
- **Note**: Normalize is a CLI-only feature. It is a maintenance/housekeeping operation similar to database migrations or linting tools, and does not need API or UI exposure.

## Implementation Task List

### Phase 1: Core Library Implementation

**Location:** `libs/core/src/lib/normalize/`

#### Task 1.1: Create folder utility functions
- [x] Create `libs/core/src/lib/normalize/folder-utils.ts`
- [x] Define `FolderInfo` type:
  ```typescript
  interface FolderInfo {
    path: string;
    depth: number;  // For sorting (deepest first)
  }
  ```
- [x] Implement `getAllFoldersBottomUp(rootPath: string): string[]`:
  - Recursively traverse directory tree
  - Collect all folder paths
  - Sort by depth (deepest first) for bottom-up processing
  - Return array of folder paths
- [x] Implement `isFolderEmpty(folderPath: string): boolean`:
  - Read directory entries
  - Return false if any subfolders exist
  - Check for `resource_entries.json`
    - If missing, return true (empty)
    - If present, parse and check for entries (keys)
    - Return false if has entries, true if empty object
  - Ignore `tracker_meta.json` and hidden files (`.gitkeep`, `.DS_Store`)
  - Return true only if no subfolders AND (no resource_entries.json OR empty resource_entries.json)
- [x] Export from `libs/core/src/lib/normalize/index.ts`

#### Task 1.2: Create folder cleanup function
- [x] Create `libs/core/src/lib/normalize/cleanup-empty-folders.ts`
- [x] Import `getAllFoldersBottomUp` and `isFolderEmpty` utilities
- [x] Define `CleanupResult` interface:
  ```typescript
  interface CleanupResult {
    foldersRemoved: number;
    removedPaths: string[];  // For debugging/logging
  }
  ```
- [x] Implement `cleanupEmptyFolders(translationsRoot: string, dryRun?: boolean): CleanupResult`:
  - Get all folders sorted bottom-up
  - Initialize counters and tracking arrays
  - For each folder (skip root):
    - Check if empty using `isFolderEmpty()`
    - If empty and not dry-run: use `fs.rmdirSync()` to remove
    - If empty: increment counter and track path
  - Return result with counts and paths
- [x] Export from normalize index

#### Task 1.3: Create normalize entry function
- [x] Create `libs/core/src/lib/normalize/normalize-entry.ts`
- [x] Import checksum utilities from `libs/core/src/lib/resource/checksum.ts`
- [x] Import `ResourceEntryData` and `TrackerMetadata` types
- [x] Define `NormalizeEntryParams` interface:
  ```typescript
  interface NormalizeEntryParams {
    entryKey: string;
    resourceEntry: ResourceEntryData;  // From resource_entries.json
    metadata: TrackerMetadata;         // From tracker_meta.json
    baseLocale: string;
    locales: string[];
  }
  ```
- [x] Define `NormalizeEntryResult` interface:
  ```typescript
  interface NormalizeEntryResult {
    resourceEntry: ResourceEntryData;  // Updated entry
    metadata: TrackerMetadata;         // Updated metadata
    changes: {
      localesAdded: number;
      checksumsUpdated: number;
      statusesChanged: number;
    };
  }
  ```
- [x] Implement `normalizeEntry(params: NormalizeEntryParams): NormalizeEntryResult`:
  - Extract base value from `resourceEntry.source`
  - Compute base checksum (MD5 of base value)
  - Update base locale metadata with checksum
  - For each non-base locale:
    - Check if locale entry exists in resourceEntry
    - If missing: add entry with base value, set status to `new`
    - Compute locale value checksum
    - Update metadata:
      - Set `checksum` to locale value checksum
      - Set `baseChecksum` to current base checksum
      - Determine status:
        - If just added → `new`
        - Else if baseChecksum changed → `stale` (unless locale value equals base value)
        - Else → keep existing status
  - Track changes (localesAdded, checksumsUpdated, statusesChanged)
  - Return updated entry and metadata with change summary
- [x] Export from normalize index

#### Task 1.4: Create main normalize function
- [x] Create `libs/core/src/lib/normalize/normalize.ts`
- [x] Define `NormalizeParams` interface:
  ```typescript
  interface NormalizeParams {
    translationsFolder: string;
    baseLocale: string;
    locales: string[];
    dryRun?: boolean;
  }
  ```
- [x] Define `NormalizeResult` interface:
  ```typescript
  interface NormalizeResult {
    entriesProcessed: number;
    localesAdded: number;
    filesCreated: number;
    filesUpdated: number;
    foldersRemoved: number;
    dryRun: boolean;
  }
  ```
- [x] Implement `normalize(params: NormalizeParams): Promise<NormalizeResult>`:
  - Initialize counters for summary
  - Traverse translations folder recursively:
    - For each folder:
      - Ensure `resource_entries.json` exists (create if missing)
      - Ensure `tracker_meta.json` exists (create if missing)
      - Load both files
      - For each entry in resource_entries:
        - Call `normalizeEntry()` with entry data
        - Aggregate change counts
        - If not dry-run: write updated files
  - After traversal complete:
    - Call `cleanupEmptyFolders()` to remove empty folders
    - Add foldersRemoved to summary
  - Return summary with all counts and dryRun flag
- [x] Export from normalize index

#### Task 1.5: Export from core library
- [x] Add exports to `libs/core/src/lib/normalize/index.ts`:
  ```typescript
  export * from './folder-utils';
  export * from './cleanup-empty-folders';
  export * from './normalize-entry';
  export * from './normalize';
  ```
- [x] Add export to `libs/core/src/index.ts`:
  ```typescript
  export * from './lib/normalize';
  ```

#### Task 1.6: Unit tests for folder utilities
- [x] Create `libs/core/src/lib/normalize/folder-utils.spec.ts`
- [x] Test `getAllFoldersBottomUp()`:
  - Returns folders in depth-first order (deepest first)
  - Handles nested folder structures (3+ levels)
  - Returns empty array for folder with no subfolders
  - Handles single-level folder structure
- [x] Test `isFolderEmpty()`:
  - Returns true for folder with no resource_entries.json
  - Returns true for folder with empty resource_entries.json ({})
  - Returns false for folder with entries in resource_entries.json
  - Returns false for folder with subfolders (even if no entries)
  - Ignores tracker_meta.json (folder with only tracker_meta is empty)
  - Ignores hidden files like .gitkeep (folder with only .gitkeep is empty)

#### Task 1.7: Unit tests for folder cleanup
- [x] Create `libs/core/src/lib/normalize/cleanup-empty-folders.spec.ts`
- [x] Test `cleanupEmptyFolders()`:
  - Removes empty leaf folder (no resource_entries.json)
  - Removes empty leaf folder (empty resource_entries.json)
  - Removes folder with only tracker_meta.json
  - Removes folder with only hidden files (.gitkeep)
  - Preserves folders with entries in resource_entries.json
  - Preserves folders with subfolders
  - Removes empty intermediate folders recursively when children are removed
  - Never removes root translations folder (even if empty)
  - Works correctly with multiple nested levels
  - Dry-run mode: counts folders but doesn't delete
  - Returns correct count and paths of removed folders

#### Task 1.8: Unit tests for normalize entry
- [x] Create `libs/core/src/lib/normalize/normalize-entry.spec.ts`
- [x] Test `normalizeEntry()`:
  - Recomputes base checksum for base locale
  - Adds missing locale entry with base value and status `new`
  - Recomputes checksum for existing locale entry
  - Updates baseChecksum to current base checksum
  - Sets status to `stale` when base value changed
  - Preserves status `translated` or `verified` when base unchanged
  - Sets status to `new` when locale value equals new base value
  - Preserves comments and tags in resource entry
  - Returns correct change counts (localesAdded, checksumsUpdated, statusesChanged)
  - No-op when entry already fully consistent

#### Task 1.9: Unit tests for main normalize function
- [x] Create `libs/core/src/lib/normalize/normalize.spec.ts`
- [x] Test `normalize()`:
  - Processes all entries in translations folder
  - Creates missing resource_entries.json files
  - Creates missing tracker_meta.json files
  - Adds missing locale entries across all resources
  - Updates checksums for all entries
  - Detects and marks stale translations
  - Removes empty folders after normalization
  - Returns correct summary counts
  - Dry-run mode: reports changes but doesn't modify files
  - Handles deeply nested folder structures
  - Handles collection with no inconsistencies (no-op)

#### Task 1.10: Test verification
- [x] Run all normalize tests: `pnpm nx test core --testFile=src/lib/normalize`
- [x] Verify all tests pass
- [x] Run full core library test suite: `pnpm run test:core`
- [x] Verify no regressions

---

### Phase 2: CLI Implementation

**Location:** `apps/cli/src/commands/`

#### Task 2.1: Create normalize command file
- [x] Create `apps/cli/src/commands/normalize.ts`
- [x] Define command options interface:
  ```typescript
  interface NormalizeOptions {
    collection?: string;  // Single collection name
    all?: boolean;        // Normalize all collections
    dryRun?: boolean;     // Preview changes without applying
  }
  ```

#### Task 2.2: Implement interactive prompts
- [x] Import prompts library: `const prompts = (await import('prompts')).default;`
- [x] Implement `promptForMissing()` function:
  - If neither collection nor all flag provided:
    - Load config to get available collections
    - Show select prompt with collection choices:
      - Options: individual collections + "All collections" option
    - Store selection in options
  - Handle confirmation for --all mode:
    - Show warning: "This will normalize ALL collections in your project"
    - Ask: "Are you sure? (y/N)"
    - Exit gracefully if user declines

#### Task 2.3: Implement normalizeCommand function
- [x] Create main command handler:
  ```typescript
  export async function normalizeCommand(options: NormalizeOptions): Promise<void> {
    // Implementation below
  }
  ```
- [x] Implementation steps:
  - Load config from `.lingo-tracker.json` in cwd
  - Determine which collections to process:
    - If `--all`: use all collections from config
    - Else: use single collection (validate it exists)
  - If TTY mode, prompt for missing options
  - If non-TTY mode, validate all required options present
  - For each collection to process:
    - Get collection settings (translationsFolder, baseLocale, locales)
    - Call `normalize()` from core library
    - Collect results
  - Display summary:
    - If dry-run: "Dry run - no changes made"
    - Show per-collection summary:
      - "Collection: {name}"
      - "Entries processed: {count}"
      - "Locales added: {count}"
      - "Files created: {count}"
      - "Files updated: {count}"
      - "Folders removed: {count}"
    - If processing multiple collections, show total summary
  - Handle errors with user-friendly messages

#### Task 2.4: Add JSON output option
- [x] Add `--json` flag to command options:
  ```typescript
  interface NormalizeOptions {
    collection?: string;
    all?: boolean;
    dryRun?: boolean;
    json?: boolean;  // Output results as JSON
  }
  ```
- [x] When `--json` flag present:
  - Suppress human-readable output
  - Output results as JSON to stdout:
    ```json
    {
      "collections": [
        {
          "name": "default",
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

#### Task 2.5: Register command in main.ts
- [x] Open `apps/cli/src/main.ts`
- [x] Add normalize command:
  ```typescript
  program
    .command('normalize')
    .description('Normalize translation resources (fix checksums, add missing locales, clean up empty folders)')
    .option('--collection <name>', 'Collection name (required unless --all)')
    .option('--all', 'Normalize all collections')
    .option('--dry-run', 'Preview changes without applying them')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
      const { normalizeCommand } = await import('./commands/normalize');
      await normalizeCommand(options);
    });
  ```

#### Task 2.6: CLI manual testing
- [ ] Test interactive mode (TTY):
  - Run `normalize` without options, verify prompts appear
  - Test collection selection prompt
  - Test "All collections" option
  - Verify confirmation prompt for --all mode
  - Test declining confirmation (should exit cleanly)
- [ ] Test dry-run mode:
  - Run with `--dry-run` flag
  - Verify summary shows planned changes
  - Verify no files are actually modified
  - Verify folder cleanup is counted but not executed
- [ ] Test non-interactive mode (CI/CD):
  - Test with `--collection <name>`
  - Test with `--all`
  - Test with `--dry-run`
  - Verify no prompts appear
  - Test error when required options missing
- [ ] Test JSON output:
  - Run with `--json` flag
  - Verify valid JSON output
  - Verify human-readable output suppressed
- [ ] Test edge cases:
  - Normalize collection with no inconsistencies (no-op)
  - Normalize collection with missing locale entries
  - Normalize collection with stale translations
  - Normalize collection with empty folders
  - Normalize non-existent collection (should show error)

---

### Phase 3: Documentation & Testing

#### Task 3.1: Update CLI documentation
- [x] Document `normalize` CLI command in `/Users/simon/git/lingo-tracker/docs/cli.md`
- [x] Add command description, options, and flags
- [x] Document behavior:
  - What normalization does
  - When to use it
  - Folder cleanup behavior
  - Dry-run mode

#### Task 3.2: Add CLI usage examples
- [x] Add examples to CLI documentation:
  ```bash
  # Interactive mode - prompts for collection
  lingo-tracker normalize

  # Normalize specific collection
  lingo-tracker normalize --collection default

  # Normalize all collections
  lingo-tracker normalize --all

  # Preview changes without applying (dry-run)
  lingo-tracker normalize --collection default --dry-run

  # Output results as JSON (useful for scripts)
  lingo-tracker normalize --collection default --json

  # Normalize all collections with JSON output
  lingo-tracker normalize --all --json
  ```

#### Task 3.3: Add normalization guide
- [x] Create normalization guide section in documentation
- [x] Document when normalization is needed:
  - After manual edits to JSON files
  - After adding new locales to config
  - After importing translations from external sources
  - Periodically to maintain consistency
- [x] Document what normalization does:
  - Recomputes checksums for all entries
  - Adds missing locale entries
  - Updates translation statuses (new, stale, translated, verified)
  - Creates missing JSON files (resource_entries.json, tracker_meta.json)
  - Removes empty folders automatically
- [x] Document folder cleanup behavior:
  - When folders are considered empty
  - What gets removed vs. preserved
  - Bottom-up recursive cleanup
  - Root folder is never removed

#### Task 3.4: Integration testing
- [x] **DEFERRED** - Integration testing infrastructure not yet established
  - **Assessment**: The project currently has no integration or e2e test infrastructure for CLI commands
  - **Recommendation**: Defer integration testing until CLI testing infrastructure is established
  - **Testing Coverage**: Core library has comprehensive unit tests (54 tests passing) that cover:
    - Folder utilities and cleanup logic
    - Entry normalization with all edge cases
    - Main normalize function with various scenarios
    - Dry-run mode
    - Error handling
  - **Manual Testing**: Phase 2 Task 2.6 covers manual testing scenarios for the CLI command
  - **Future Implementation**: When CLI integration testing infrastructure is added, create test scenario:
    - Set up test collection with intentional inconsistencies:
      - Missing locale entries
      - Outdated checksums
      - Modified base values (to trigger stale)
      - Empty folders (no entries)
      - Folders with only tracker_meta.json
    - Run normalize via CLI
    - Verify corrections:
      - Missing locales added with correct values and status
      - Checksums recomputed correctly
      - Stale statuses set where base changed
      - Empty folders removed
      - Root folder preserved
    - Verify summary counts are accurate

---

## Implementation Order Recommendation

1. **Core Library** (Phase 1): Implement and test business logic first - folder utilities, cleanup, entry normalization, and main normalize function
2. **CLI** (Phase 2): User-facing command-line interface with interactive and non-interactive modes
3. **Documentation** (Phase 3): Polish, finalize, and create comprehensive guides

This order ensures each layer can be tested independently and that the CLI can rely on stable core functionality.

---

## Key Design Decisions

### Folder Cleanup Strategy
- **Automatic Cleanup**: Folder cleanup runs automatically after normalization completes
- **Bottom-Up Traversal**: Process folders from deepest leaves to root for safe recursive cleanup
- **Empty Definition**: Folders are empty if they have:
  - No `resource_entries.json` file, OR
  - An empty `resource_entries.json` (no entries), AND
  - No subfolders
- **Ignored Files**: `tracker_meta.json` and hidden files (`.gitkeep`, `.DS_Store`) don't count as content
- **Root Protection**: Never remove the root translations folder, even if empty
- **Dry-Run Support**: Count folders that would be removed without actually deleting them

### Normalization Scope
- **Per-Collection Operation**: Normalize operates on one collection at a time
- **All-Collections Mode**: CLI supports `--all` flag to process all collections sequentially
- **Non-Destructive**: Preserves existing values, comments, and tags - only fills missing data and corrects metadata
- **File Ensuring**: Creates missing `resource_entries.json` and `tracker_meta.json` files at every level

### Checksum and Status Logic
- **Base Checksum**: MD5 hash of base locale value (from `source` field)
- **Locale Checksum**: MD5 hash of translation value for each locale
- **Status Determination**:
  - `new`: Locale entry was just added with base value
  - `stale`: Base checksum changed since last normalization (locale value differs from base)
  - `translated` or `verified`: Preserved when base unchanged and locale has value
- **Smart Stale Detection**: If locale value equals new base value, keep status as `new` instead of `stale`

### Dry-Run Mode
- **Preview Changes**: Reports what would be changed without modifying files
- **Complete Simulation**: Processes all logic but skips file writes and deletions
- **Accurate Counts**: Returns same summary structure as normal run
- **Safe Testing**: Allows users to verify normalization scope before applying

### Error Handling
- **Best-Effort Processing**: Continue processing all entries even if some fail
- **Aggregate Errors**: Collect all errors and report in summary (future enhancement)
- **Fail-Safe**: File system errors don't halt entire operation
- **User Feedback**: Clear error messages for validation and file system issues

### CLI Design
- **Interactive Mode**: Prompts for missing collection when TTY detected
- **Non-Interactive Mode**: Requires all options via flags for CI/CD usage
- **Confirmation for --all**: Shows warning and requires confirmation when normalizing all collections
- **Human-Readable Output**: Default output shows clear summary with counts
- **JSON Output**: `--json` flag for programmatic consumption (useful for scripts)


