# Feature: Normalize translation resources

Normalize fixes and aligns on-disk translation files after manual edits or incomplete entries. It recomputes checksums, updates statuses, ensures required files exist at every level, and adds any missing locale values. New locale entries are initialized from the base locale value with status `new`.

## Scope
- Operates per collection (required) and may support an "all collections" mode.
- Traverses the translations folder tree and processes every `resource_entries.json` / `tracker_meta.json` pair.
- Non-destructive: preserves existing values and comments; only fills missing pieces and corrects metadata.

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

## CLI, API, and UI
- CLI command: `normalize`
  - Flags: `--collection <name>` (required) or `--all`, `--fix` (default true), `--dry-run` (optional; print planned changes only).
  - Output summary: counts of entries processed, locales added, files created/updated.
- API endpoint: `POST /collections/:collection/normalize`
  - Body: `{ dryRun?: boolean }`
  - Response: summary of changes, same as CLI.
- Tracker (UI): optional administrative action to trigger normalization (last priority).

## TODO:
 - [ ] CORE (libs/core)
   - [ ] Implement traversal over collection translations folder and file ensuring
   - [ ] Implement normalizeEntry for a single leaf (recompute base checksum; add missing locales; recompute checksums; update statuses)
   - [ ] Aggregate summary: processed entries, locales added, files touched
   - [ ] Unit tests: create missing files, add missing locales, base change stale, no-op
 - [ ] Data Transfer (libs/data-transfer)
   - [ ] Normalize request/response DTOs; export from index
   - [ ] Validation: flags (dryRun), collection name
 - [ ] API (apps/api)
   - [ ] POST /collections/:collection/normalize endpoint; map DTOs; call CORE normalize
   - [ ] Status codes: 200 always (include summary); 400 validation errors
   - [ ] Tests: dry-run, fix run, invalid collection
 - [ ] CLI (apps/cli)
   - [ ] normalize command with `--collection` or `--all`, `--dry-run`
   - [ ] Print human-readable summary and JSON output option
   - [ ] Tests: dry-run, full run, per-collection
 - [ ] Tracker (apps/tracker)
   - [ ] Admin action to trigger normalize; show summary
   - [ ] Optional: guard behind feature flag/role
 - [ ] Cross-cutting
   - [ ] E2E: induce inconsistencies then normalize; verify expected corrections
   - [ ] Docs: add normalization section; document CLI/API usage and semantics


