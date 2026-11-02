---
title: API Reference
sidebar_position: 7
---

# API Reference

`lingo-tracker-app` serves a REST API under `/api` and the [Tracker UI](./tracker-ui.md) at `/`. The UI is a client of this API; anything the UI does, a script can do too.

- Base URL: `http://localhost:3030/api`
- Bodies and responses are JSON, except file uploads and the import summary download
- Interactive Swagger UI at `http://localhost:3030/api`, OpenAPI JSON at `/api-json`
- Every endpoint below is listed in `libs/data-transfer/src/lib/api-routes.ts`, which a contract test keeps in sync with the server

## Running the server

```bash
npx lingo-tracker-app [--port <n>] [--host <address>]
```

The server reads `.lingo-tracker.json` from the directory it is started in, on every request. Start it in your project root.

| Setting | Flag | Environment variable | Default |
|---|---|---|---|
| Port | `--port` | `LINGO_TRACKER_PORT` | `3030` |
| Bind address | `--host` | `LINGO_TRACKER_HOST` | `127.0.0.1` |
| Additional host names | | `LINGO_TRACKER_ALLOWED_HOSTS` | none |
| Index revalidation interval | | `LINGO_TRACKER_REVALIDATE_INTERVAL_MS` | `2000` |
| Collections kept indexed | | `LINGO_TRACKER_MAX_CACHED_COLLECTIONS` | `4` |

### Authentication

There is none. The API is designed for one developer's machine. Beyond the loopback default, the only protections are the Host and Origin checks below. Note also that the import source listing accepts any folder path the process can read, and export and bundle output paths may be absolute. If you bind to a non-loopback address, treat everyone who can reach the port as a trusted user.

### Host and Origin checks

A middleware runs before static files and every route:

1. **Host.** The `Host` header must name `localhost`, an IPv4 literal, a bracketed IPv6 literal, or an exact entry from `LINGO_TRACKER_ALLOWED_HOSTS` (comma-separated, trimmed, case-insensitive). The port is ignored. A missing or other Host gets `403 {"message":"Host not allowed"}`. So LAN access by IP needs no setting, while access by name such as `my-laptop.local` needs the name listed.
2. **Origin.** When an `Origin` header is present it must be `http://` or `https://`, have no path, userinfo or whitespace, and its host and port must equal the `Host` header, case-insensitive. Anything else, including `null`, another localhost port or a loopback alias, gets `403 {"message":"Origin not allowed"}`. Requests without an Origin header, such as curl, pass. CORS uses the same rule, so there is no cross-origin access.

The Angular dev server proxies `/api` while preserving `Host: localhost:4200`, which matches its browser Origin.

## Conventions

**Status codes.** Unless stated otherwise, `GET`, `PUT`, `PATCH` and `DELETE` return `200`. `POST` returns `201`, except the job starters below, which return `202`.

**Errors** have the shape `{ "statusCode": number, "message"?: string, "error": string, "errors"?: string[] }`. Only unexpected `500` responses omit `message`.

| Code | When |
|---|---|
| `400` | Malformed body or query, invalid value, invalid key or locale, locale not present in a collection |
| `403` | Write to a read-only collection, or a failed Host or Origin check |
| `404` | Unknown collection, resource, folder, path or job. Also a missing `.lingo-tracker.json`. |
| `409` | Duplicate name or key, rename or delete blocked by a bundle, config changed on disk between read and write, upload name clash |
| `413` | Upload file over 20 MB |
| `422` | Auto-translation requested while `translation.enabled` is false |
| `429` | A second upload while one is running, or a provider rate limit |
| `500` | Unreadable config file, missing translation API key, invalid API key or unknown provider, unexpected error. Unexpected errors carry no `message`. |
| `502` | Translation provider error |

Shape errors read `"<field path> must <requirement>"`, for example `collection.translationsFolder must be a string`.

**Read-only collections.** Every non-GET route under `/collections/:name` opens the collection for writing and returns `403` when it is read-only. The exceptions are `PUT` and `DELETE /collections/:name`, which change only the config.

**Collection names and locales in paths** are URL-encoded: `/api/collections/my%20app`.

**Jobs.** Bundle generation, exports, imports and whole-locale translation run as jobs. The start endpoint validates synchronously, returns `202` with a `jobId`, and the job runs in a serial queue per job type. Poll the status endpoint until `status` is `completed` or `failed`. Jobs live in memory and do not survive a restart. Each time a job of a type starts, finished jobs of that type older than 30 minutes are removed, then the oldest finished ones are removed until the registry holds about 100 jobs including the new one. Running and queued jobs are never removed.

```json
{ "jobId": "…", "status": "pending" | "running" | "completed" | "failed", "startedAt": "…", "completedAt": "…", "error": "…" }
```

**The in-memory index.** Reads of a collection's tree are served from an index the server builds on first access. Writes through the API patch the index. Changes made on disk by anything else are detected by comparing the folder with the index at most once per `LINGO_TRACKER_REVALIDATE_INTERVAL_MS`; a detected change drops the index and the next tree read rebuilds it. There is no manual invalidation endpoint.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/config` | Read the project config with resolved terminology |
| PUT | `/config` | Replace protected terms and preferred terminology |
| POST | `/collections` | Create a collection |
| PUT | `/collections/:name` | Update or rename a collection |
| DELETE | `/collections/:name` | Unregister a collection |
| POST | `/collections/:name/locales` | Add a locale |
| DELETE | `/collections/:name/locales/:locale` | Remove a locale |
| GET | `/collections/:name/resources/tree` | Read the folder tree |
| GET | `/collections/:name/resources/cache/status` | Index state |
| GET | `/collections/:name/resources/search` | Text or similarity search |
| POST | `/collections/:name/resources` | Create resources |
| PATCH | `/collections/:name/resources` | Edit a resource |
| DELETE | `/collections/:name/resources` | Delete resources |
| POST | `/collections/:name/resources/move` | Move or rename resources |
| POST | `/collections/:name/resources/translate` | Machine-translate one resource |
| POST | `/collections/:name/resources/translate-locale` | Start a whole-locale translation job |
| GET | `/collections/:name/resources/translate-locale/:jobId` | Job status |
| POST | `/collections/:name/folders` | Create a folder |
| DELETE | `/collections/:name/folders` | Delete a folder and its resources |
| POST | `/collections/:name/folders/move` | Move a folder |
| POST | `/bundles` | Create a bundle definition |
| PUT | `/bundles/:name` | Update or rename a bundle definition |
| DELETE | `/bundles/:name` | Delete a bundle definition |
| POST | `/bundles/dry-run` | Preview a definition |
| POST | `/bundles/:name/generate` | Start a generation job |
| GET | `/bundles/jobs/:jobId` | Job status |
| POST | `/exports/dry-run` | Preview an export |
| POST | `/exports` | Start an export job |
| GET | `/exports/jobs/:jobId` | Job status |
| GET | `/imports/sources` | List import files in a folder |
| POST | `/imports/sources` | Upload import files |
| POST | `/imports/dry-run` | Preview an import |
| POST | `/imports` | Start an import job |
| GET | `/imports/jobs/:jobId` | Job status |
| GET | `/imports/jobs/:jobId/summary` | Markdown summary |

---

## Health

`GET /api/health` returns `200 { "status": "all is good" }` without reading the config.

## Config

### GET /api/config

Returns the parsed config plus resolved terminology. There is no separate collections list; this is how clients discover collections.

```json
{
  "baseLocale": "en",
  "locales": ["en", "fr-ca"],
  "exportFolder": "dist/lingo-export",
  "importFolder": "dist/lingo-import",
  "tokenCasing": "upperCase",
  "runtime": "transloco-messageformat",
  "transformICUToTransloco": true,
  "translation": { "enabled": false, "provider": "google-translate", "apiKeyEnv": "GOOGLE_TRANSLATE_API_KEY" },
  "collections": {
    "main": {
      "translationsFolder": "src/i18n",
      "tags": ["web"],
      "readOnly": false,
      "protectedTermsFile": "src/i18n/terms.json",
      "protectedTerms": ["Acme"],
      "protectedTermsFilePath": "/abs/path/src/i18n/terms.json"
    }
  },
  "bundles": { "main": { "bundleName": "{locale}", "dist": "./src/assets/i18n", "collections": "All" } },
  "protectedTerms": ["iPhone"],
  "protectedTermsFilePath": "/abs/path/.lingo-tracker-protected-terms.json",
  "preferredTerminology": [{ "discouraged": "E-mail", "preferred": "email" }],
  "preferredTerminologyFilePath": "/abs/path/.lingo-tracker-preferred-terminology.json",
  "preferredTerminologyError": "…present only when the rule file cannot be loaded…",
  "preferredTerminologyWarning": "…present when preferredTerminologyFile names a file that does not exist…",
  "projectName": "my-app"
}
```

`runtime` is read-only here and appears only when the config file sets it; see [Configuration](./configuration.md#global-fields). Optional fields are omitted when empty. Collection entries also carry `exportFolder`, `importFolder`, `baseLocale`, `locales` and a `translation` block when set, with the meanings in [Configuration](./configuration.md#collection-entry). A missing config file returns `404`; an unparseable one returns `500`.

### PUT /api/config

Replaces the two terminology lists. Nothing else in the config is writable through this route.

```json
{ "protectedTerms": ["Acme", "iPhone"], "preferredTerminology": [{ "discouraged": "E-mail", "preferred": "email", "reason": "Style guide" }] }
```

Both fields are optional; an empty body is a no-op. The whole rule list is validated before anything is written. Invalid rules return `400` with `message: "Invalid preferred terminology rules"` and `errors` listing index, field and problem. A config file that changed between read and write returns `409`.

## Collections

### POST /api/collections

```json
{
  "name": "admin",
  "collection": {
    "translationsFolder": "apps/admin/src/i18n",
    "baseLocale": "en",
    "locales": ["en", "es"],
    "readOnly": false,
    "tags": ["admin"],
    "exportFolder": "dist/admin-export",
    "importFolder": "dist/admin-import",
    "translation": { "enabled": false, "provider": "google-translate", "apiKeyEnv": "KEY", "batchSize": 5, "delayMs": 1000 },
    "protectedTermsFile": "apps/admin/terms.json",
    "protectedTerms": ["Acme"]
  }
}
```

Only `name` and `collection.translationsFolder` are required. A submitted `protectedTermsFilePath` is ignored; it is a read-only output of `GET /config`. `protectedTerms` are written to the named file, not to the config. A folder under `node_modules` becomes read-only unless `readOnly` is given. Returns `201 { "message" }`. A duplicate name returns `409`.

### PUT /api/collections/:name

```json
{ "name": "admin-v2", "collection": { "translationsFolder": "apps/admin/src/i18n", "locales": ["en", "es", "fr"] } }
```

- `collection.translationsFolder` is required by the schema even though the update is a patch.
- A present field replaces the stored value; an absent field keeps it. `tags: []`, `locales: []` and `readOnly: false` clear a setting, and so does `""` for `baseLocale`, `exportFolder`, `importFolder` or `protectedTermsFile`; `locales: []` returns to the global list. `translationsFolder` must stay non-blank.
- Changing `locales` adds or removes locales from every resource file, which is refused with `403` on a read-only collection. Other fields can be changed on read-only collections, including turning `readOnly` off.
- `name` renames the collection and rewrites explicit bundle references. A blank name is `400`; an existing name, or a bundle that already references the new name, is `409`.

Returns `200 { "message" }`.

### DELETE /api/collections/:name

Removes the collection from the config and from explicit bundle lists. Translation files stay on disk. Returns `200 { "message" }`. If a bundle would be left with no collections, returns `409` naming it.

## Locales

### POST /api/collections/:name/locales

```json
{ "locale": "de" }
```

Adds the locale to the collection's own list and seeds every resource with a `new` copy of the source. Returns `201 { "message", "entriesBackfilled", "filesUpdated" }`. An invalid code, the base locale, or an existing locale returns `400`.

### DELETE /api/collections/:name/locales/:locale

Removes the locale and deletes its values and metadata from every file. Returns `200 { "message", "entriesPurged", "filesUpdated" }`. The base locale or a locale the collection does not have returns `400`.

## Resources

### Resource summary shape

Several routes return resources in this shape:

```json
{
  "fullKey": "common.buttons.save",
  "folderPath": "common.buttons",
  "entryKey": "save",
  "base": { "locale": "en", "value": "Save" },
  "targets": [
    { "locale": "fr-ca", "value": "Enregistrer", "status": "translated", "needsWork": false, "sameAsBase": false },
    { "locale": "es", "value": "Save", "status": "new", "needsWork": true, "sameAsBase": true }
  ],
  "comment": "Button label",
  "tags": ["ui"],
  "inheritedTags": ["web"]
}
```

`targets` lists every target locale of the collection in config order. `needsWork` is true for `new` and `stale`.

### GET /api/collections/:name/resources/tree

Query: `path` (dot-delimited folder, default root), `includeNested=true` (flatten every descendant resource into `resources`).

- `200` `{ "path", "resources": [ResourceSummary], "children": [{ "name", "fullPath", "loaded", "tree"? }] }`
- `202` `{ "status": "indexing" | "not-ready", "message" }` when the index was not ready at the start of the request. The first read after start-up, and the first read after an outside change is detected, builds the index and still answers `202`; the next read returns data.
- `404` for an unknown collection or path.

### GET /api/collections/:name/resources/cache/status

`200 { "status": "not-started" | "indexing" | "ready" | "error", "collectionName", "indexedAt"?, "error"?, "stats"?: { "totalKeys", "localeCount" } }`. Starts indexing when the collection has no index yet; an index in the `error` state is rebuilt by the next tree read, not by this route.

### GET /api/collections/:name/resources/search

Query: `query`, `maxResults` (positive integer, default 100, capped at 500; anything else is `400`), `mode`.

- Default mode searches the key, the source value and every translation, case-insensitive. Each result carries `matchType` of `exact-key`, `partial-key`, `exact-value` or `partial-value` and, for value matches, `matchedLocales`.
- `mode=similar` compares the query with source values only, using the same rule as `find-similar`. Each result carries `matchType: "similar-value"` and `similarity` between 0 and 1.

`200 { "query", "results": [...], "totalFound", "limited" }`. A blank query returns an empty result set. The search uses the index when ready and reads disk otherwise.

### POST /api/collections/:name/resources

Create one resource or an array of them.

```json
{
  "key": "common.buttons.ok",
  "baseValue": "OK",
  "comment": "Dialog confirm button",
  "tags": ["ui"],
  "targetFolder": "apps.web",
  "translations": [{ "locale": "es", "value": "Aceptar", "status": "translated" }]
}
```

- `key` and a non-blank `baseValue` are required. `targetFolder` is prepended to the key.
- Locales not given in `translations` are machine-translated when the collection has auto-translation enabled, otherwise seeded as `new`.
- This is not an upsert. If any key already exists, or appears twice in the batch, the whole request is refused with `409` and nothing is written.
- Every item is validated and, when applicable, translated before any file is written. A provider failure writes nothing.

`201 { "entriesCreated", "created", "skippedLocales"?, "terminology"?: { "findings": [{ "key", "discouraged", "preferred", "reason"?, "message" }], "problems": [string] } }`. `skippedLocales` lists locales auto-translation could not handle. `terminology` is advisory: `findings` are preferred-terminology hits in the source text and `problems` are rule-file errors.

### PATCH /api/collections/:name/resources

```json
{
  "key": "common.buttons.save",
  "baseValue": "Save changes",
  "comment": "",
  "tags": ["ui", "forms"],
  "moveTo": "common.actions",
  "locales": { "fr-ca": { "value": "Enregistrer les modifications", "status": "verified" } }
}
```

- `key` is the existing full key. Every other field is optional. `comment` replaces the comment (an empty string is stored as an empty comment; the field cannot be removed), `tags: []` clears tags, `moveTo` is a destination folder with `""` meaning the root; the entry keeps its last key segment.
- A changed `baseValue` marks every real translation `stale`; locales holding an untranslated copy are re-seeded or machine-translated. The edit is saved before machine translation runs, so a provider error leaves the edit in place.
- `locales` entries for the base locale are ignored. A `status` is stored as given; without one the status is inferred.

`200 { "resolvedKey", "updated", "message"?, "resource"?: ResourceSummary, "skippedLocales"?, "terminology"? }`. `updated: false` with `message: "No changes detected"` when nothing differs. Unknown key: `404`. A `moveTo` destination that already exists: `409`.

### DELETE /api/collections/:name/resources

```json
{ "keys": ["common.buttons.ok", "common.buttons.cancel"] }
```

Best-effort. `200 { "entriesDeleted", "errors"?: [{ "key", "error" }] }`. Always check `errors`; a `200` does not mean every key was deleted. Emptied folders are removed.

### POST /api/collections/:name/resources/move

```json
{
  "moves": [
    { "source": "common.buttons.ok", "destination": "common.actions.ok" },
    { "source": "common.buttons.*", "destination": "common.actions", "override": true },
    { "source": "common.title", "destination": "shared.title", "toCollection": "shared" }
  ]
}
```

A `source` ending in `*` moves everything under the prefix. Within a collection, comments, tags and statuses move unchanged; stored `{{ name }}` placeholders are converted to `{name}` with checksums updated, and nothing is machine-translated. With `toCollection`, both collections must share a base locale (otherwise `400`), locales the destination lacks are dropped and locales the entry lacks are seeded as `new`. A destination that exists is skipped with a warning unless `override` is true. An unknown or read-only `toCollection` is reported in `errors` rather than failing the request. `201 { "movedCount", "warnings": [], "errors": [] }`.

### POST /api/collections/:name/resources/translate

```json
{ "key": "common.buttons.ok" }
```

Machine-translates every target locale that is `new`, `stale` or has no metadata. `201 { "resource": ResourceSummary, "translatedCount", "skippedLocales": [], "warnings"? }`. Returns `422` when auto-translation is disabled for the collection, `500` when the API key environment variable is unset, `502` for a provider error, `429` for a provider rate limit.

### POST /api/collections/:name/resources/translate-locale

```json
{ "locale": "fr" }
```

Starts a job that translates every resource whose target locale is `new`, `stale` or has no metadata. `202 { "jobId", "collectionName", "targetLocale", "status": "pending", "totalResources": 0, "translatedCount": 0, "failedCount": 0, "skippedCount": 0 }`. Synchronous errors: `422` disabled, `400` for the base locale or an unconfigured locale, `403` read-only.

### GET /api/collections/:name/resources/translate-locale/:jobId

`200` with the job, including `failures: [{ "key", "error" }]`, `skippedKeys`, `startedAt`, `completedAt` once finished. `404` when the job is unknown or belongs to another collection.

## Folders

All three routes require a writable collection.

### POST /api/collections/:name/folders

```json
{ "folderName": "navigation", "parentPath": "apps.common" }
```

`folderName` is one segment. `201 { "folderPath", "created", "folder": { "name", "fullPath", "loaded": true, "tree": { "path", "resources": [], "children": [] } } }`. `created` is false when the folder already existed.

### DELETE /api/collections/:name/folders

```json
{ "folderPath": "apps.common.buttons" }
```

Deletes the folder and every resource in it. `200 { "deleted", "folderPath", "resourcesDeleted" }`. Unknown folder: `404`.

### POST /api/collections/:name/folders/move

```json
{ "sourceFolderPath": "apps.common.buttons", "destinationFolderPath": "apps.shared", "nestUnderDestination": true, "override": false, "toCollection": "shared" }
```

With `nestUnderDestination` (default true) the source folder becomes a child of the destination; `""` as destination means the root. Moving a folder into its own descendant is `400`. Unlike resource moves, an unknown or read-only `toCollection` fails the request. `201 { "movedCount", "foldersDeleted", "warnings": [], "errors": [] }`.

## Bundles

Bundle definitions are the objects described in [Configuration](./configuration.md#bundle-definition). The HTTP layer checks only that `bundle` is an object; the core validator returns `400 { "message": "Invalid bundle definition", "errors": [...] }` for anything else.

| Route | Body | Response |
|---|---|---|
| `POST /api/bundles` | `{ "name", "bundle" }` | `201 { "message" }`; `409` on a duplicate name |
| `PUT /api/bundles/:name` | `{ "name"?, "bundle" }` | `200 { "message" }`. Replaces the whole definition; `name` renames. `404` unknown, `409` name taken |
| `DELETE /api/bundles/:name` | | `200 { "message" }` |
| `POST /api/bundles/dry-run` | `{ "name", "bundle", "locales"? }` | `201` plan, see below. The definition need not be saved. |
| `POST /api/bundles/:name/generate` | `{ "locales"? }` optional | `202 { "jobId", "bundleName", "status": "pending", "progress": { "current": 0, "total": 0 } }` |
| `GET /api/bundles/jobs/:jobId` | | `200` job with `progress: { current, total, currentFile? }` and, when done, `result: { filesGenerated, keysPerLocale, warnings, localesProcessed, typeDistFile?, typesKeysCount? }` |

Dry-run plan:

```json
{
  "name": "web",
  "locales": ["en", "fr-ca"],
  "files": [{ "path": "src/assets/i18n/en.json", "kind": "bundle", "locale": "en", "exists": true, "keysCount": 120 }],
  "keysPerLocale": { "en": 120, "fr-ca": 120 },
  "conflictsCount": 0,
  "conflictKeys": [],
  "hierarchicalConflicts": [],
  "exampleKey": { "collectionName": "main", "sourceKey": "common.ok", "bundledKey": "common.ok", "tokenPath": "COMMON.OK" },
  "warnings": []
}
```

`conflictKeys` and `hierarchicalConflicts` hold at most 50 items each; `conflictsCount` is the full count.

## Exports

Read-only collections can be exported. Both POST routes take the same body:

```json
{
  "format": "xliff",
  "collections": ["main"],
  "locales": ["fr-ca"],
  "statuses": ["new", "stale"],
  "tags": ["ui"],
  "outputDirectory": "dist/lingo-export",
  "filenamePattern": "{source}-{target}-{date}",
  "protectedTermNotes": true,
  "json": { "structure": "hierarchical", "rich": false, "includeBase": false, "basePropertyName": "baseValue", "includeStatus": false, "includeComment": false, "includeTags": false }
}
```

Only `format` is required. Defaults match the CLI: all collections, all target locales, statuses `new,stale`, the config `exportFolder`, and protected-term notes on. Collections must share a base locale. In `json`, `includeBase`, `includeStatus`, `includeComment`, `includeTags` and `basePropertyName` apply only with `rich: true`; without it, values are plain strings. Invalid enum values return `400` with `errors`; an unknown collection returns `404`.

- `POST /api/exports/dry-run` returns `201 { "format", "outputDirectory", "collections", "locales", "files": [{ "locale", "path", "exists", "entriesCount" }], "skippedLocales": [{ "locale", "reason" }], "entriesTotal", "overwriteCount", "exampleKey"?, "warnings", "errors", "hierarchicalConflicts", "outputProblem"? }`. `warnings`, `errors` and `hierarchicalConflicts` are capped at 50 items. Nothing is written, not even the folder.
- `POST /api/exports` runs the same preparation and returns `400` with the `outputProblem` message when the output folder is unusable; otherwise `202 { "jobId", "status": "pending", "progress": { "current": 0, "total": <files> }, "request" }`.
- `GET /api/exports/jobs/:jobId` returns the job with `progress.currentFile` while running and, when done, `result: { "filesWritten", "entriesExported", "localeResults": [{ "locale", "outcome", "entriesExported", "file"?, "error"? }], "warnings", "errors", "outcome": "succeeded" | "failed", "outputDirectory", "format" }`.

## Imports

### GET /api/imports/sources

Query: `collection` (required), `folder` (optional; defaults to the collection's `importFolder`, then the global one, then `dist/lingo-import`; relative to the project root, absolute paths accepted).

Lists `.xliff`, `.xlf` and `.json` files directly in the folder, with a locale inferred from the XLIFF `target-language` attribute or from the file name.

```json
{
  "collection": "main",
  "folder": "dist/lingo-import",
  "defaultFolder": "dist/lingo-import",
  "exists": true,
  "files": [
    { "path": "dist/lingo-import/fr-ca.xliff", "name": "fr-ca.xliff", "format": "xliff", "sizeBytes": 20480, "modifiedAt": "…", "locale": "fr-ca", "localeSource": "xliff-target-language", "xliffTargetLanguage": "fr-CA" },
    { "path": "dist/lingo-import/en.json", "name": "en.json", "format": "json", "sizeBytes": 1024, "modifiedAt": "…", "locale": "en", "localeSource": "file-name", "localeProblem": "base-locale" }
  ]
}
```

`localeProblem` is `base-locale` when the inferred locale is the base locale, or `not-configured` when an XLIFF target language matches no configured locale. A missing folder returns `exists: false`; a path that is a file returns `400`.

### POST /api/imports/sources

`multipart/form-data` upload with a repeatable `files` field; query `collection` (required), `folder`, `overwrite=true`. Up to 10 files of 20 MB each, extensions `.xliff`, `.xlf` or `.json`. A file must be non-empty, and its name must be at most 255 UTF-8 bytes, contain no path separators, control characters or `<>:"|?*`, not start with a dot, not end with a space or dot, not be a Windows reserved name, and be unique within the batch ignoring case. Uploads are confined to the collection's import folder or a subfolder of it, inside the project root, outside every translations folder and outside `node_modules` or hidden folders. One upload runs at a time per server; a second gets `429`. An existing name returns `409` with the names in `errors` unless `overwrite=true`. Read-only collection: `403`. Returns `201` with the refreshed listing.

### Import request body

```json
{
  "collection": "main",
  "files": [{ "path": "dist/lingo-import/fr-ca.xliff", "locale": "fr-ca", "format": "xliff" }],
  "strategy": "translation-service",
  "createMissing": false,
  "updateComments": false,
  "updateTags": false,
  "preserveStatus": false,
  "validateBase": true
}
```

`collection` and at least one file with a `locale` are required. `locale` must match a configured locale exactly, including case. The base locale is accepted only with `strategy: "migration"`. `createMissing`, `updateComments` and `updateTags` default to `true` for `migration`; other strategies ignore them and always use `false`; `preserveStatus` defaults to `false` and `validateBase` to `true` for every strategy. Both routes open the collection for writing, so a read-only collection returns `403` even for a dry run.

- `POST /api/imports/dry-run` returns `201 { "collection", "strategy", "files": [{ "path", "locale", "format", "entries", "imported", "created", "updated", "skipped", "failed", "changed", "statusTransitions", "warnings", "errors", "sourceProblem"? }], "totals": { "entries", "imported", "created", "updated", "skipped", "failed", "changed" }, "statusTransitions": [{ "from"?, "to", "count" }], "icuAutoFixes": [{ "path"?, "locale", "key", "originalValue", "fixedValue", "description" }], "issues": [{ "path"?, "locale", "key", "type": "failed" | "skipped", "reason" }], "warnings", "errors", "largeFiles", "truncated" }`. `imported` equals `created` plus `updated`. `changed` counts resource files that would be written, not entries. `issues`, `icuAutoFixes`, `warnings` and `errors` are capped at 50 items and `truncated` reports how many were dropped; `files`, `statusTransitions` and `largeFiles` are complete. Each file is previewed against the current state, not against earlier files in the same request.
- `POST /api/imports` inspects every source first and returns `400` for a bad path or undetectable format; otherwise `202 { "jobId", "status": "pending", "progress": { "current": 0, "total": <files> }, "request" }`.
- `GET /api/imports/jobs/:jobId` returns the job with `progress.currentFile` and `progress.currentLocale` while running and, when done, `result` with the plan fields except `largeFiles`, plus per-file `outcome` and `filesModified`, an overall `filesModified` list relative to the project root, and an overall `outcome` of `succeeded` or `failed`.
- `GET /api/imports/jobs/:jobId/summary` returns the Markdown summary as `text/markdown` with a `Content-Disposition: attachment` header. `409` while the job is still running. Summaries are kept in memory with the job and never written to disk by the server.

## Example: create, verify, export

```bash
B=http://localhost:3030/api

# create a resource; the request fails with 409 if the key exists
curl -s -X POST $B/collections/main/resources -H 'Content-Type: application/json' \
  -d '{"key":"common.buttons.ok","baseValue":"OK","comment":"Dialog confirm button"}'

# mark the French translation verified
curl -s -X PATCH $B/collections/main/resources -H 'Content-Type: application/json' \
  -d '{"key":"common.buttons.ok","locales":{"fr-ca":{"value":"OK","status":"verified"}}}'

# preview an export of everything still needing work
curl -s -X POST $B/exports/dry-run -H 'Content-Type: application/json' \
  -d '{"format":"xliff","collections":["main"]}'

# run it and poll
JOB=$(curl -s -X POST $B/exports -H 'Content-Type: application/json' -d '{"format":"xliff","collections":["main"]}' | jq -r .jobId)
curl -s $B/exports/jobs/$JOB
```
