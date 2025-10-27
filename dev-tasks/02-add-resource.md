# Feature: Create translation resource entries

This feature lets users add translation resources. A resource is a key/value pair in the base locale, optionally annotated with metadata and translated values for other locales.

## Create: required and optional fields
- Key (required): dot-delimited string, e.g. `apps.common.buttons.ok`.
- Base value (required): text in the base locale.
- Comment (optional): context to aid translators.
- Tags (optional): comma-separated list for filtering/exporting.
- Target folder (optional): dot-delimited path relative to the translation folder. If omitted, the resource is added directly under the translation folder.

Notes:
- Target folder is a convenience. Example equivalence:
  - Key `apps.common.buttons.cancel`, Target folder empty
  - Key `buttons.cancel`, Target folder `apps.common`
  Both resolve to the same on-disk location.
 - If `targetFolder` is provided and overlaps with the key prefix, no de-duplication is performed; segments may repeat.
- Validation: each segment (between dots) of `key` and `targetFolder` may contain only alphanumeric characters, `_`, or `-` (regex per segment: `[A-Za-z0-9_-]+`).

## Key resolution and filesystem layout
1) Compute the resolved key: `resolvedKey = targetFolder ? targetFolder + '.' + key : key`.
2) Split `resolvedKey` by `.`. All but the last segment form nested folders under the translation folder; the last segment is the resource entry key within `resource_entries.json`.
3) Ensure each nested folder exists. At each folder level, ensure `resource_entries.json` and `tracker_meta.json` exist; create empty files if missing.

Example: resolved key `apps.common.buttons.cancel` → path segments `['apps','common','buttons','cancel']`.
- Create/ensure folders: `apps/common/buttons/`
- Use final segment `cancel` as the entry key in `resource_entries.json`

## Example files under `apps/common/buttons/`
resource_entries.json:
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

tracker_meta.json:
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

## Status lifecycle
- Allowed values: `new`, `translated`, `stale`, `verified`.
- On creation: status is set automatically to `new`.
- On import/update of translation values: status is updated accordingly (e.g., to `translated`).
- When the base-locale source changes: existing non-base entries are marked `stale`.
 - `verified` can be set manually by users in the application or via imports from in-house language experts.

## Checksums
- Checksums are MD5 hashes of the locale values.
- Base locale entry includes a `checksum` calculated from its base value.
- Non-base entries include both `checksum` (their value) and `baseChecksum` (the base locale checksum at the time of translation).


## TODO:
 - [ ] CORE (libs/core)
   - [ ] Define core types for resource entries and tracker meta
   - [ ] Implement key/targetFolder validation (per segment `[A-Za-z0-9_-]+`) and resolution (no de-dup)
   - [ ] Add checksum utilities (MD5 of values) and status helpers
   - [ ] Implement addResource: ensure folders/files at each level; update resource_entries.json and tracker_meta.json; set statuses
   - [ ] Unit tests: validation, resolution, tags, idempotency, base change → stale, checksums
 - [ ] Data Transfer (libs/data-transfer)
   - [ ] CreateResourceDto and response DTO; export from index
   - [ ] DTO validation (class-validator) mirroring CORE constraints; coerce tags CSV→array
 - [ ] API (apps/api)
   - [ ] DTO ↔ CORE mapping functions
   - [ ] POST /collections/:collection/resources endpoint that calls CORE addResource
   - [ ] Request/response validation and error mapping (400/409/500)
   - [ ] Unit/E2E tests: happy path, invalid key, idempotent repeat, base change → stale
 - [ ] CLI (apps/cli)
   - [ ] add-resource command with flags: --collection --key --value --comment --tags --targetFolder
   - [ ] Interactive prompts and non-interactive validation; call CORE; print summary
   - [ ] Tests for flags, prompts, validation failures, idempotency
 - [ ] Tracker (apps/tracker)
   - [ ] API client: POST /collections/:collection/resources using data-transfer DTOs
   - [ ] Store/action: addResource and refresh affected paths
   - [ ] UI (last): Create Resource dialog with validations; submit to API; handle results
 - [ ] Cross-cutting
   - [ ] E2E smoke: create resource via CLI and API in temp collection; assert filesystem and meta
   - [ ] Docs: getting-started resource entries; API endpoint docs (payload/response)
   - [ ] Changelog entry
