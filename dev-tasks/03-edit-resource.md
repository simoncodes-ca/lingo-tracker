# Feature: Edit translation resource entries

This feature lets users edit existing translation resources. Edits may update the base value, comment, tags, and/or non‑base locale values. Renaming/moving keys is out of scope here and should be a separate "move/rename resource" feature.

## Edit: allowed fields and behavior
- Key (required): identifies the existing resource to edit. Same rules as add.
- Editable fields:
  - Base value (optional): updates `source` and base checksum; marks non‑base entries `stale`.
  - Comment (optional): updates `comment`; does not affect statuses/checksums.
  - Tags (optional): replaces entire `tags` array.
  - Locale updates (optional): per‑locale values for non‑base locales; updates checksum and status.

Semantics:
- If base value changes:
  - Update `resource_entries.json[leafKey].source`.
  - Recompute base `checksum` in `tracker_meta.json` under base locale code (e.g., `"en"`).
  - For every non‑base locale present: set `baseChecksum` to the new base checksum and set `status` to `stale`.
- If comment changes: update comment only.
- If tags provided: set to the provided array (trim items, de‑duplicate).
- For each non‑base locale value provided:
  - Set `resource_entries.json[leafKey][locale] = value`.
  - Recompute `checksum` and set/refresh `baseChecksum` to current base checksum.
  - Set `status` to `translated` unless explicitly set to `verified` via a trusted import/UI action.
- No changes detected → no‑op.
- Resource not found → error.

## Validation and resolution
- Key and targetFolder validation: dot‑delimited; each segment matches `[A-Za-z0-9_-]+`; no empty segments.
- Resolution: `resolvedKey = targetFolder ? targetFolder + '.' + key : key`; no de‑duplication if segments overlap.
- The resource must already exist at the resolved path (leaf key in `resource_entries.json`).
- Filesystem self‑healing: if `resource_entries.json` or `tracker_meta.json` files are missing at levels, create empty files, but still require the resource entry to exist for edit.

## Checksums and statuses
- Checksums: MD5 of values. Base locale has `checksum`; non‑base locales have `checksum` and `baseChecksum`.
- Status values: `new`, `translated`, `stale`, `verified`.
- Base change → non‑base statuses become `stale`.
- Non‑base value update → `translated` (or `verified` if explicitly set by user/import).

## Example: edit base value (causes stale)
Before
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
      "fr-ca": {
        "checksum": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "baseChecksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "status": "translated"
      }
    }
  }
}
```

Edit
```json
{
  "key": "buttons.cancel",
  "targetFolder": "apps.common",
  "baseValue": "Cancel operation"
}
```

After
```json
{
  "tracker_meta.json": {
    "cancel": {
      "en": { "checksum": "cccccccccccccccccccccccccccccccc" },
      "fr-ca": {
        "checksum": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "baseChecksum": "cccccccccccccccccccccccccccccccc",
        "status": "stale"
      }
    }
  }
}
```

## Example: edit non‑base locale value
Edit
```json
{
  "key": "buttons.cancel",
  "targetFolder": "apps.common",
  "locales": {
    "fr-ca": { "value": "Annuler l'opération" }
  }
}
```

Effect
```json
{
  "resource_entries.json": {
    "cancel": {
      "fr-ca": "Annuler l'opération"
    }
  },
  "tracker_meta.json": {
    "cancel": {
      "fr-ca": {
        "checksum": "dddddddddddddddddddddddddddddddd",
        "baseChecksum": "cccccccccccccccccccccccccccccccc",
        "status": "translated"
      }
    }
  }
}
```

## TODO:
 - [ ] CORE (libs/core)
   - [ ] Extend types for edit inputs (baseValue?, comment?, tags?, localeUpdates?)
   - [ ] Implement existence check and edit pipeline (validate, resolve, read/merge/write)
   - [ ] Implement base change logic (recompute base checksum, mark non‑base stale)
   - [ ] Implement non‑base updates (checksum, baseChecksum, status translated/verified)
   - [ ] Unit tests: not found, no‑op, base change → stale, non‑base edit, tags replace
 - [ ] Data Transfer (libs/data-transfer)
   - [ ] UpdateResourceDto (PATCH semantics) and response DTO; export from index
   - [ ] DTO validation (segment regex, arrays, optional fields)
 - [ ] API (apps/api)
   - [ ] DTO ↔ CORE mapping for updates
   - [ ] PATCH /collections/:collection/resources endpoint; 200 on edit, 204 if no‑op, 404 not found, 400 validation
   - [ ] Tests: base edit, locale edit, not found, invalid key, no‑op
 - [ ] CLI (apps/cli)
   - [ ] edit-resource command with flags: --collection --key --comment --tags --targetFolder --value (base) --locale <code> --localeValue <val>
   - [ ] Interactive prompts; validation; call CORE; print diff/summary
   - [ ] Tests: base edit, locale edit, invalid input, no‑op
 - [ ] Tracker (apps/tracker)
   - [ ] API client: PATCH /collections/:collection/resources using data-transfer DTOs
   - [ ] Store/action: editResource and refresh affected paths
   - [ ] UI: Edit Resource form/dialog (base value, comment, tags; per‑locale edit if in scope)
 - [ ] Cross‑cutting
   - [ ] E2E smoke: edit base then verify statuses; edit locale then verify translated
   - [ ] Docs: add/Edit resource sections; API endpoint docs (PATCH semantics)


