# REST API (`apps/api`)

The NestJS API is LingoTracker's HTTP interface. It exposes all translation management operations over REST, serves the Angular Tracker UI as static files from the same process, and owns two cross-cutting systems: a single-collection in-memory cache that makes the resource tree fast to browse, and an async job runner for long-running locale translation operations. All API routes are prefixed with `/api`; Swagger docs are available at `/api` when the server is running.

Return to [architecture README](README.md).

---

## Table of Contents

- [Endpoint Reference](#endpoint-reference)
- [Component Diagram](#component-diagram)
- [Static File Serving](#static-file-serving)
- [Collection Cache](#collection-cache)
  - [Single-Collection Design](#single-collection-design)
  - [Cache State Machine](#cache-state-machine)
  - [Incremental Updates vs Full Clear](#incremental-updates-vs-full-clear)
  - [Polling Flow from the Frontend](#polling-flow-from-the-frontend)
- [Translation Job System](#translation-job-system)
- [Mapper Layer](#mapper-layer)

---

## Endpoint Reference

All paths are relative to the `/api` global prefix. URL path parameters that contain collection names are URI-decoded inside each controller action to handle names with special characters.

### Health

| Method | Path | Purpose | Request DTO | Response DTO |
|--------|------|---------|-------------|--------------|
| `GET` | `/health` | Liveness check | — | `{ status: string }` |

### Config

| Method | Path | Purpose | Request DTO | Response DTO |
|--------|------|---------|-------------|--------------|
| `GET` | `/config` | Read global config and all collection configs, with protected terms resolved from their files. Also carries the preferred terminology rules, the rule file path, and any load error or missing-file warning. | — | `LingoTrackerConfigDto` |
| `PUT` | `/config` | Update the writable top-level globals: `protectedTerms` and `preferredTerminology`. The handler writes each one to its own **file**, and leaves `.lingo-tracker.json` untouched. `preferredTerminology` is the full rule list. The server validates it again and returns `400` with per-row errors when a rule is invalid. `collections`, `locales`, and `baseLocale` stay excluded on purpose. | `UpdateConfigDto` | `{ message: string }` |

### Collections

| Method | Path | Purpose | Request DTO | Response DTO |
|--------|------|---------|-------------|--------------|
| `POST` | `/collections` | Create a new [collection](glossary.md#collection) | `CreateCollectionDto` | `{ message: string }` |
| `PUT` | `/collections/:collectionName` | Update a collection's name or settings. When `locales` in the request body differs from the current config, the handler diffs the two lists and adds/removes locale files on disk accordingly (base locale cannot be removed). The handler writes a `protectedTerms` array from the body to the collection's terms file. A collection with no `protectedTermsFile` returns 400. | `UpdateCollectionDto` | `{ message: string }` |
| `DELETE` | `/collections/:collectionName` | Delete a collection and its config entry | — | `{ message: string }` |

### Resources

| Method | Path | Purpose | Request DTO | Response DTO |
|--------|------|---------|-------------|--------------|
| `POST` | `/collections/:collectionName/resources` | Create one or more [resources](glossary.md#resource) (batch-aware) | `CreateResourceDto \| CreateResourceDto[]` | `CreateResourceResponseDto` |
| `PATCH` | `/collections/:collectionName/resources` | Update a resource's base value, translations, comment, or tags | `UpdateResourceDto` | `UpdateResourceResponseDto` |
| `DELETE` | `/collections/:collectionName/resources` | Delete one or more resources by key | `DeleteResourceDto` | `DeleteResourceResponseDto` |
| `POST` | `/collections/:collectionName/resources/move` | Move or rename resources (single key or wildcard pattern, cross-collection supported) | `MoveResourceDto` | `MoveResourceResponseDto` |
| `POST` | `/collections/:collectionName/resources/translate` | Auto-translate a single resource via the configured provider | `TranslateResourceDto` | `TranslateResourceResponseDto` |
| `GET` | `/collections/:collectionName/resources/tree` | Fetch the resource [tree](glossary.md#resource-tree) (or subtree) from cache | query: `path`, `includeNested` | `ResourceTreeDto \| TreeStatusResponseDto` |
| `GET` | `/collections/:collectionName/resources/cache/status` | Poll the cache [indexing](glossary.md#indexing) state | — | `CacheStatusDto` |
| `GET` | `/collections/:collectionName/resources/search` | Full-text search across the collection | query: `SearchTranslationsDto` | `SearchResultsDto` |
| `POST` | `/collections/:collectionName/resources/translate-locale` | Fire-and-forget: start a bulk locale translation job | `TranslateLocaleRequestDto` | `TranslateLocaleJobDto` (202 Accepted) |
| `GET` | `/collections/:collectionName/resources/translate-locale/:jobId` | Poll a translation job by ID | — | `TranslateLocaleJobDto` |

### Folders

| Method | Path | Purpose | Request DTO | Response DTO |
|--------|------|---------|-------------|--------------|
| `POST` | `/collections/:collectionName/folders` | Create a [folder](glossary.md#folder) (incremental cache update) | `CreateFolderDto` | `CreateFolderResponseDto` |
| `DELETE` | `/collections/:collectionName/folders` | Delete a folder and all its contents (incremental cache update) | `DeleteFolderDto` | `DeleteFolderResponseDto` |
| `POST` | `/collections/:collectionName/folders/move` | Move a folder within or across collections | `MoveFolderDto` | `MoveFolderResponseDto` |

### Locales

| Method | Path | Purpose | Request DTO | Response DTO |
|--------|------|---------|-------------|--------------|
| `POST` | `/collections/:collectionName/locales` | Add a locale to a collection (clears cache) | `AddLocaleDto` | `AddLocaleResponseDto` |
| `DELETE` | `/collections/:collectionName/locales/:locale` | Remove a locale from a collection (clears cache) | — | `RemoveLocaleResponseDto` |

### Bundles

Bundle definitions live under `bundles` in `.lingo-tracker.json` and are exposed on `GET /config`. Generation runs as an async job (one at a time, in order) that the client polls, mirroring the translation job flow.

| Method | Path | Purpose | Request DTO | Response DTO |
|--------|------|---------|-------------|--------------|
| `POST` | `/bundles` | Create a [bundle](glossary.md#bundle) definition. Validation failures return 400 `{ message, errors[] }`; a duplicate name returns 409. | `CreateBundleDto` | `{ message: string }` |
| `PUT` | `/bundles/:name` | Replace a bundle definition, optionally renaming it via `name` in the body. 404 when missing, 400 when invalid, 409 when the new name is taken. | `UpdateBundleDto` | `{ message: string }` |
| `DELETE` | `/bundles/:name` | Remove a bundle definition (404 when missing) | — | `{ message: string }` |
| `POST` | `/bundles/dry-run` | Plan a bundle from the request body without writing anything. The definition does not have to be saved, so the UI can preview unsaved edits. | `BundleDryRunRequestDto` | `BundleDryRunResultDto` |
| `POST` | `/bundles/:name/generate` | Fire-and-forget: start a generation job for a saved bundle. Optional `locales` must be a subset of the project locales (400 otherwise). | `GenerateBundleRequestDto` | `BundleGenerateJobDto` (202 Accepted) |
| `GET` | `/bundles/jobs/:jobId` | Poll a bundle generation job by ID | — | `BundleGenerateJobDto` |

---

## Component Diagram

<!-- C4 Level 3: internal structure of the API process -->

```mermaid
graph TD
    TRACKER["Tracker UI\n(Angular SPA)"]
    CLI["CLI\n(Commander)"]

    subgraph api["apps/api (NestJS + Express)"]
        subgraph controllers["Controllers"]
            APPC["AppController\n/health"]
            CONFIGC["ConfigController\n/config"]
            COLLC["CollectionsController\n/collections"]
            RESC["ResourcesController\n/collections/:name/resources"]
            FOLDC["FoldersController\n/collections/:name/folders"]
            LOCALEC["LocalesController\n/collections/:name/locales"]
        end

        subgraph services["Services / Infrastructure"]
            CONFIGS["ConfigService\nReads .lingo-tracker.json\non every request"]
            CACHE["CollectionCacheService\nSingle-collection in-memory\nResourceTreeNode cache"]
            JOBS["TranslationJobService\nIn-memory job map\nUUID → TranslationJob"]
        end

        subgraph mappers["Mappers"]
            RESMAP["resource.mapper\nCreateResourceDto → AddResourceParams"]
            TREEMP["resource-tree.mapper\nResourceTreeNode → ResourceTreeDto\nResourceTreeEntry → ResourceSummaryDto"]
            COLMAP["collection.mapper\nLingoTrackerCollectionDto ↔ LingoTrackerCollection"]
            CFGMAP["config.mapper\nLingoTrackerConfig → LingoTrackerConfigDto"]
            SRCHMAP["search-result.mapper\nSearchResult → SearchResultDto"]
        end

        STATIC["Express static middleware\nServes Angular SPA from\ndist/tracker/browser/"]
    end

    subgraph core["@simoncodes-ca/core"]
        COREOPS["addResource · editResource · deleteResource\nmoveResource · createFolder · deleteFolder\nmoveFolder · addLocaleToCollection\nremoveLocaleFromCollection · searchTranslations\ntranslateExistingResource · translateLocale\nloadResourceTree · searchResourceTree"]
    end

    TRACKER -->|"REST /api/*"| controllers
    TRACKER -->|"Static files"| STATIC
    CLI -.->|"Some flows use API"| controllers

    RESC --> CACHE
    RESC --> CONFIGS
    RESC --> JOBS
    FOLDC --> CACHE
    FOLDC --> CONFIGS
    LOCALEC --> CACHE
    LOCALEC --> CONFIGS
    COLLC --> CONFIGS
    CONFIGC --> CONFIGS

    RESC --> RESMAP
    RESC --> TREEMP
    RESC --> SRCHMAP
    FOLDC --> TREEMP
    CONFIGC --> CFGMAP
    COLLC --> COLMAP

    CONFIGS -->|"reads .lingo-tracker.json"| COREOPS
    CACHE -->|"core.loadResourceTree()"| COREOPS
    RESC -->|"delegate writes"| COREOPS
    FOLDC -->|"delegate writes"| COREOPS
    LOCALEC -->|"delegate writes"| COREOPS
    JOBS -->|"translateLocale()"| COREOPS

    style api fill:#d1ecf1,stroke:#17a2b8,color:#000
    style controllers fill:#e8f4fd,stroke:#17a2b8,color:#000
    style services fill:#fff3cd,stroke:#ffc107,color:#000
    style mappers fill:#f3e5f5,stroke:#9c27b0,color:#000
    style core fill:#d4edda,stroke:#28a745,color:#000
```

Controllers are the only layer that knows HTTP. They resolve collection config from `ConfigService`, delegate business operations to `@simoncodes-ca/core` (see [core-library.md](core-library.md)), apply mappers at the boundary, and update `CollectionCacheService` incrementally after successful writes.

**Read-only enforcement.** `WritableCollectionGuard` (`collections/guards/writable-collection.guard.ts`) is applied at the class level to the `Resources`, `Locales`, and `Folders` controllers. For any non-`GET` request it reads the `:collectionName` route param, looks up the collection in `ConfigService`, and throws `403 Forbidden` when the collection is `readOnly`. This is the single API choke-point for read-only enforcement. The `Collections` controller is intentionally **not** guarded: updating a collection's config entry or unregistering it (`PUT`/`DELETE /collections/:name`) is permitted even for read-only collections, since the lock protects resources, not the registration. On create, the controller defaults `readOnly` to `true` for `node_modules` paths (via the `isUnderNodeModules` domain helper) when the DTO omits it.

---

## Static File Serving

The Express server that backs NestJS is configured before NestJS routes are registered. The middleware registration order in `main.ts` is intentional:

1. `express.static(dist/tracker/browser)` — serves the Angular build output (JS bundles, assets) for any URL that matches a real file on disk.
2. A catch-all `GET {*splat}` handler — for any non-`/api` request that did not match a static file, sends `index.html` so the Angular router can handle client-side navigation.
3. NestJS routes under `/api` — registered last; the catch-all explicitly skips requests whose URL starts with `/api` via `next()`.

This means a single `node apps/api/main.js` process serves both the UI and the API with no reverse proxy required. The Angular SPA's `base href` and API client are both configured relative to the same origin.

---

## Collection Cache

### Bounded Multi-Collection Design

`CollectionCacheService` holds a `Map` of `CachedCollection` entries keyed by collection name, capped at `LINGO_TRACKER_MAX_CACHED_COLLECTIONS` (default 4) and evicted least-recently-used.

**Why more than one.** Opening a second collection in another browser tab is a real usage pattern. With a single slot, each tab's 2-second `/cache/status` poll evicted the other tab's cache, so neither ever reached `READY`, both polled forever, and the server re-indexed continuously. Independent entries remove the contention entirely.

**Why bounded.** A fully-loaded [resource tree](glossary.md#resource-tree) for a large collection (thousands of keys, multiple locales, full translation values and metadata) can be tens of megabytes of JavaScript heap, and that cost multiplies per cached collection. The cap is a memory budget; lower it to 1 to restore the old single-slot behaviour.

**Eviction.** On inserting a new entry at the cap, the entry with the lowest `accessSequence` is dropped. `accessSequence` is a monotonic counter bumped on every read and write, not a clock — several collections can be touched inside the same millisecond and eviction still needs a strict order. An entry in `INDEXING` state is never chosen: discarding in-flight work would leave the request that started it waiting for nothing, so the map is allowed to overflow briefly when every entry is busy.

**Per-entry state.** Fingerprint, revalidation throttle stamp and the deferred fingerprint-refresh timer all live on the entry. A read of one collection therefore cannot postpone another collection's staleness check.

### Cache State Machine

<!-- Cache state machine — CacheStatus enum values and transitions -->

```mermaid
stateDiagram-v2
    [*] --> NOT_STARTED : server start\nor cache eviction

    NOT_STARTED --> INDEXING : indexCollection() called\n(triggered by first /tree or /cache/status request)
    ERROR --> INDEXING : indexCollection() called\n(auto-retry on next /tree request)

    INDEXING --> READY : core.loadResourceTree() succeeds
    INDEXING --> ERROR : core.loadResourceTree() throws

    READY --> NOT_STARTED : clearCache(name) called\n(delete/move resource or locale change)
    READY --> NOT_STARTED : evicted as least recently used\n(cache at its collection limit)

    READY --> READY : incremental update\n(addResourceToCache, addFolderToCache,\nremoveFolderFromCache, removeResourceFromCache,\nmoveFolderInCache)
```

State values are the string literals from the `CacheStatus` enum in `collection-cache.service.ts`:

| State | String value | Meaning |
|-------|-------------|---------|
| `NOT_STARTED` | `"not-started"` | No cache exists for this collection. Indexing has not been requested yet. |
| `INDEXING` | `"indexing"` | `core.loadResourceTree()` is running asynchronously. Read requests must wait. |
| `READY` | `"ready"` | Tree is in memory. Read requests are served instantly from the entry's `tree`. |
| `ERROR` | `"error"` | The last indexing attempt threw. The error message is stored on the entry. The next `/tree` or `/cache/status` request automatically re-triggers indexing. |

### Incremental Updates vs Full Cache Clear

After a successful write operation the cache is updated by one of two strategies:

**Incremental update** — for operations where the exact structural change is known and bounded. The controller calls a targeted method on `CollectionCacheService` that mutates only the affected subtree of `ResourceTreeNode` in memory, leaving the rest of the tree intact. The cache stays in `READY` state throughout.

| Cache method | Triggered by |
|---|---|
| `addResourceToCache()` | `POST /resources` (create), `PATCH /resources` (edit in-place or move-to-new-folder) |
| `removeResourceFromCache()` | `PATCH /resources` (when resource moves folder — removes from old location) |
| `addFolderToCache()` | `POST /folders` |
| `removeFolderFromCache()` | `DELETE /folders` |
| `moveFolderInCache()` | `POST /folders/move` within one collection (with `clearCache(name)` fallback if structural navigation fails; a cross-collection move clears both collections instead) |

**Full cache clear** — for operations where the breadth of changes cannot be tracked in a single incremental call, or where correctness risk outweighs the cost of a re-index. `clearCache(collectionName)` drops that one collection's entry, returning it to `NOT_STARTED`; the next request to `/tree` or `/cache/status` triggers a fresh `indexCollection()`. It is always scoped to the collection that was written — a write against one collection must never force a re-index of a collection somebody else is viewing. Cross-collection moves clear the source and every destination collection they touched. `clearAllCaches()` exists for changes that invalidate everything.

| Operation | Why full clear |
|---|---|
| `DELETE /resources` | Keys may span multiple folders; tracking all removals is error-prone. |
| `POST /resources/move` | Wildcard pattern moves affect an unbounded set of folders. |
| `POST /locales` (add) | Every folder's `tracker_meta.json` gains a new locale entry; the cached tree would be stale everywhere. |
| `DELETE /locales/:locale` | Same — locale removal touches all metadata nodes. |

### Polling Flow from the Frontend

The Tracker UI polls the cache endpoints when it needs the resource tree. For the full sequence, see [user-flows.md — Cache Indexing Flow](user-flows.md#6-cache-indexing-flow). The protocol is:

```mermaid
sequenceDiagram
    participant UI as Tracker UI
    participant API as ResourcesController
    participant Cache as CollectionCacheService
    participant Core as @simoncodes-ca/core

    UI->>API: GET /api/collections/{name}/resources/tree
    API->>Cache: getCacheStatus(name)

    alt Cache is NOT_STARTED or ERROR
        Cache-->>API: NOT_STARTED | ERROR
        API->>Cache: indexCollection() [fire, no await]
        Cache->>Core: loadResourceTree() [async]
        API-->>UI: 202 Accepted { status: "not-ready", message: "..." }
        UI->>UI: wait ~1s, then retry
    end

    alt Cache is INDEXING
        Cache-->>API: INDEXING
        API-->>UI: 202 Accepted { status: "indexing", message: "..." }
        UI->>UI: wait ~1s, then retry
    end

    alt Cache is READY
        Core-->>Cache: ResourceTreeNode
        Cache-->>API: setCacheStatus(READY, tree)
        Cache-->>API: tree (ResourceTreeNode)
        API->>API: mapResourceTreeToDto(tree)
        API-->>UI: 200 OK ResourceTreeDto
    end
```

A 202 Accepted response always means "retry shortly". A 200 OK carries the full or partial tree. The frontend is responsible for the retry loop; there is no server-sent event or WebSocket involved.

---

## Translation Job System

Bulk locale translation (`POST /resources/translate-locale`) can take seconds to minutes depending on collection size. The API uses a fire-and-forget async job pattern to avoid HTTP timeouts.

```mermaid
sequenceDiagram
    participant UI as Tracker UI
    participant RC as ResourcesController
    participant JS as TranslationJobService
    participant Core as @simoncodes-ca/core

    UI->>RC: POST /translate-locale { locale: "fr" }
    RC->>JS: startJob(params)
    JS->>JS: generate UUID jobId
    JS->>JS: store job (status: "pending")
    JS->>Core: translateLocale() [no await — runs in background]
    JS-->>RC: jobId
    RC-->>UI: 202 Accepted TranslateLocaleJobDto\n{ jobId, status: "pending", ... }

    loop Poll until status is "completed" or "failed"
        UI->>RC: GET /translate-locale/{jobId}
        RC->>JS: getJob(jobId)
        JS-->>RC: TranslateLocaleJobDto
        RC-->>UI: 200 OK\n{ status: "running", translatedCount: N, ... }
    end

    Core-->>JS: TranslateLocaleResult (via onProgress callbacks + final resolve)
    JS->>JS: update job status to "completed"

    UI->>RC: GET /translate-locale/{jobId}
    RC-->>UI: 200 OK\n{ status: "completed", translatedCount: N, skippedCount: M }
```

**Job lifecycle states:** `pending` → `running` → `completed` | `failed`. `TranslationJobService` stores jobs in a plain `Map<string, TranslationJob>` in process memory. Jobs are never evicted — this is appropriate for a single-user development tool. If the process restarts, all jobs are lost and the UI must re-issue any in-progress operations.

**Progress reporting.** `translateLocale()` in `@simoncodes-ca/core` accepts an `onProgress` callback. `TranslationJobService` subscribes to this callback and updates the in-memory job's `translatedCount`, `failedCount`, and `skippedCount` fields on each tick. Polling clients see live progress, not just a final result.

**Error handling.** If `translateLocale()` rejects with a `TranslationError` (API key issue, provider timeout) or any other error, the job transitions to `failed` and the `error` field is set. No retry is attempted. The UI can display the error and offer a manual re-trigger.

---

## Mapper Layer

The mapper layer enforces the boundary between `@simoncodes-ca/core`'s domain models and `@simoncodes-ca/data-transfer`'s DTOs. All transformation happens in `apps/api/src/app/mappers/`. No controller accesses a raw domain model object directly in its response, and no core function receives a DTO as its argument.

For the entity types that mappers transform, see [domain-and-data-model.md](domain-and-data-model.md).

| Mapper file | Direction | Key transformation |
|-------------|-----------|-------------------|
| `resource.mapper.ts` | `CreateResourceDto` → `AddResourceParams` | Flat field-for-field projection; adds `allLocales` when auto-translation is active |
| `resource-tree.mapper.ts` | `ResourceTreeNode` → `ResourceTreeDto` | Flattens `folderPathSegments[]` array to a dot-delimited `path` string; merges `source` (base locale value) into the `translations` record keyed by the base locale string; extracts per-locale `status` from the `metadata` record |
| `resource-tree.mapper.ts` | `ResourceTreeEntry` → `ResourceSummaryDto` | Identifies the base locale by the absence of `status` and `baseChecksum` in the metadata entry; produces a flat `{ key, translations, status, comment, tags, inheritedTags }` shape. The `inheritedTags` field carries the parent collection's `tags` so the UI can render them distinctly without re-reading the config. |
| `collection.mapper.ts` | `LingoTrackerCollectionDto` ↔ `LingoTrackerCollection` | Bidirectional; shallow clone of `locales[]` and `tags[]` arrays to prevent aliasing. Carries the `protectedTermsFile` setting in both directions. Drops resolved `protectedTerms` on the way back to config, because terms live in a file and the controller writes them there separately. |
| `config.mapper.ts` | `LingoTrackerConfig` → `LingoTrackerConfigDto` | Delegates collection mapping to `collection.mapper` and bundle mapping to `bundle.mapper`; shallow clone of `locales[]`. Takes an optional `ResolvedProtectedTerms` and `projectName` (basename of the API's working directory) from the controller, so the mapper itself reads no files. |
| `bundle.mapper.ts` | `BundleDefinitionDto` ↔ `BundleDefinition`; `BundlePlan` → `BundleDryRunResultDto`; `GenerateBundleResult` → `BundleGenerateJobResultDto` | Bidirectional definition mapping trims strings and drops empty optionals so nothing spurious is written to the config. The plan mapper drops `absolutePath` and caps `conflictKeys` at 50. The job-result mapper rebuilds written file paths from `localesProcessed` plus the types file. |
| `search-result.mapper.ts` | `SearchResult` → `SearchResultDto` | Structurally identical types; mapper exists for explicit API boundary documentation |

**Why does `config.mapper.ts` take resolved terms as an argument?** Protected terms live in JSON files outside `.lingo-tracker.json`. Building the DTO therefore requires reading the filesystem.

The mapper keeps no file access. Instead `ConfigController.getConfig()` calls `resolveProtectedTermsForConfig(config)` from core, which reads every scope in one pass, and hands the result to the mapper. The mapper stays a pure projection.

The resolved terms and their file paths then reach the UI as read-only DTO fields, `protectedTerms` and `protectedTermsFilePath`. The writable `protectedTermsFile` setting travels alongside them.

**Why the base locale detection logic in `resource-tree.mapper.ts`?** The `ResourceTreeEntry` domain model stores the base locale value in a dedicated `source` field and tracks its metadata in the same `metadata` record as translations — distinguished by the absence of `status` and `baseChecksum` fields (the base locale has a checksum but no `baseChecksum` to compare against, and no `status` since it is never `new` or `stale` relative to itself). The DTO flattens this into a single `translations` map for simpler frontend consumption. The mapper performs this denormalization at the API boundary so the domain model stays clean.
