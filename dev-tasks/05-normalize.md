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

The `normalize` command is available in the CLI for maintaining translation resources:

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
```

**Command Options:**
- `--collection <name>` - Specify a collection to normalize (required unless --all)
- `--all` - Normalize all collections in the project
- `--dry-run` - Preview changes without applying them
- `--json` - Output results as JSON instead of human-readable format

**Output Summary:**
The command reports:
- Entries processed
- Locales added
- Files created/updated
- Folders removed

**Note**: Normalize is a CLI-only feature. It is a maintenance/housekeeping operation similar to database migrations or linting tools, and does not need API or UI exposure.

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


