# User Flows

End-to-end sequence diagrams and flowcharts for the six primary user flows in LingoTracker. Each section names the real participants — components, store methods, API controllers, core functions — so the diagrams can be read alongside the code.

Return to [architecture README](README.md).

---

## Table of Contents

- [1. Resource Lifecycle](#1-resource-lifecycle)
- [2. Import / Export Flow](#2-import--export-flow)
  - [Export](#export)
  - [Import](#import)
  - [Import Strategy Decision](#import-strategy-decision)
- [3. Frontend: Browse and Edit](#3-frontend-browse-and-edit)
- [4. Frontend: Search](#4-frontend-search)
- [5. Frontend: Drag-and-Drop Move](#5-frontend-drag-and-drop-move)
- [6. Cache Indexing Flow](#6-cache-indexing-flow)

---

## 1. Resource Lifecycle

The full lifecycle of a [resource](glossary.md#resource-entry) from creation through verification and bundle generation. Each status transition is driven by the [checksum-based staleness mechanism](domain-and-data-model.md#checksum-driven-staleness-detection). The flow ends with `generateBundle()` in [core-library.md — Bundle Generation](core-library.md#bundle-generation).

<!-- Resource lifecycle: create → edit base → auto-translate → stale → re-translate → verify → bundle -->

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant CLI as CLI / API
    participant Core as @simoncodes-ca/core
    participant Domain as @simoncodes-ca/domain
    participant FS as Filesystem
    participant Provider as Google Translate v2

    Note over Dev,FS: 1. Create resource
    Dev->>CLI: add-resource apps.common.ok "OK"
    CLI->>Core: addResource(translationsFolder, params)
    Core->>Domain: validateKey("apps.common.ok")
    Domain-->>Core: valid
    Core->>Domain: resolveResourceKey() → folderPath
    Core->>FS: ensureDirectoryExists(folderPath)
    Core->>FS: readResourceEntries() + readTrackerMetadata()
    Core->>Domain: translocoToICU("OK") → "OK"
    Core->>Core: autoTranslateResource() [if translationConfig.enabled]
    Core->>Provider: translate("OK", en→fr, en→de, ...)
    Provider-->>Core: { fr: "OK", de: "OK", ... }
    Core->>Core: createResourceMetadata() — MD5 checksums, status=translated
    Core->>FS: writeJsonFile(resource_entries.json)
    Core->>FS: writeJsonFile(tracker_meta.json)
    Core-->>CLI: AddResourceResult
    CLI-->>Dev: "Resource created"

    Note over Dev,FS: 2. Edit base value — triggers stale
    Dev->>CLI: edit-resource apps.common.ok "OK" --base "Confirm"
    CLI->>Core: editResource(translationsFolder, options)
    Core->>FS: readResourceEntries() + readTrackerMetadata()
    Core->>Domain: translocoToICU("Confirm") → "Confirm"
    Core->>Core: updateMetadataForBaseValueChange()
    Note right of Core: new baseChecksum ≠ stored baseChecksum<br/>for each locale → status = "stale"
    Core->>FS: writeJsonFile() — persists stale status before API call
    Core->>Core: autoTranslateResource() [on base value change]
    Core->>Provider: translate("Confirm", en→fr, ...)
    Provider-->>Core: { fr: "Confirmer", ... }
    Core->>FS: writeJsonFile() — second pass with translated values

    Note over Dev,FS: 3. Manual re-translate (UI trigger)
    Dev->>CLI: translate-resource apps.common.ok
    CLI->>Core: translateExistingResource(translationsFolder, key)
    Core->>FS: read current entries + metadata
    Note right of Core: Only translates locales with status<br/>"new" or "stale"
    Core->>Provider: translate(baseValue, ...)
    Provider-->>Core: translations
    Core->>FS: write updated entries + metadata (status=translated)

    Note over Dev,FS: 4. Verify
    Dev->>CLI: edit-resource apps.common.ok --locale fr --status verified
    CLI->>Core: editResource(..., { locales: [{ locale: "fr", status: "verified" }] })
    Core->>FS: write tracker_meta.json (fr.status = "verified")
    Core-->>CLI: EditResourceResult

    Note over Dev,FS: 5. Bundle
    Dev->>CLI: bundle
    CLI->>Core: generateBundle(params)
    Core->>FS: loadCollectionResources() — reads resource_entries.json per folder
    Core->>Domain: icuToTransloco(value) — per entry
    Core->>Core: buildHierarchy() — dot-keys → nested object
    Core->>FS: writeBundleFile(dist/i18n/en.json, dist/i18n/fr.json, ...)
    Core->>Core: generateBundleTypes() [if typeDist configured]
    Core->>FS: write TRACKER_TOKENS type file
    Core-->>CLI: BundleResult
    CLI-->>Dev: "Bundle written"
```

**Status transitions in this flow:** `new` → `translated` (auto-translate on create) → `stale` (base value change) → `translated` (re-translate) → `verified` (manual approval). See [domain-and-data-model.md — Translation Status Lifecycle](domain-and-data-model.md#translation-status-lifecycle) for the full state diagram.

---

## 2. Import / Export Flow

### Export

Export serializes the current resource tree for one locale to a JSON or XLIFF file for offline translator work. Core functions are documented in [core-library.md — Export Pipeline](core-library.md#export-pipeline).

<!-- Export: filter resources → serialize → write file -->

```mermaid
sequenceDiagram
    actor Dev as Developer / CI
    participant CLI as CLI
    participant Core as @simoncodes-ca/core
    participant FS as Filesystem

    Dev->>CLI: export --locale fr --format json --output ./exports/fr.json
    CLI->>Core: exportToJson(options)
    Core->>Core: loadResourcesFromCollections()
    Note right of Core: walkFolders() traverses translationsFolder<br/>reads resource_entries.json + tracker_meta.json per folder
    Core->>FS: read resource_entries.json (per folder)
    Core->>FS: read tracker_meta.json (per folder)
    FS-->>Core: LoadedResource[] — key, source, translations, status, tags, comment
    Core->>Core: filter by tag / key pattern [if options.filter]
    Core->>Core: serialize: flat {key: value} map for locale "fr"
    Note right of Core: Falls back to base locale value<br/>when translation is absent
    Core->>FS: validateOutputDirectory(outputDir)
    Core->>FS: write fr.json
    Core-->>CLI: ExportResult { resourcesExported, outputPath }
    CLI-->>Dev: Export summary
```

---

### Import

Import ingests a translated file for one locale and reconciles it with the existing resource tree using the chosen [import strategy](glossary.md#import-strategy). Core functions are documented in [core-library.md — Import Pipeline](core-library.md#import-pipeline).

<!-- Import: parse file → ICU auto-fix → merge per strategy → write files → report status transitions -->

```mermaid
sequenceDiagram
    actor Translator as Translator / Developer
    participant CLI as CLI
    participant Core as @simoncodes-ca/core
    participant Domain as @simoncodes-ca/domain
    participant FS as Filesystem

    Translator->>CLI: import --locale fr --file ./exports/fr.json --strategy translation-service
    CLI->>Core: importFromJson(options)

    Note over Core: setupImportWorkflow(options)
    Core->>FS: read .lingo-tracker.json → baseLocale = "en"
    Core->>Core: getStrategyDefaults("translation-service")<br/>createMissing=false, updateComments=false

    Note over Core: Parse source file
    Core->>FS: read fr.json
    Core->>Core: detectJsonStructure() — flat vs hierarchical
    Core->>Core: flatten hierarchical keys if needed

    Note over Core: Normalize and auto-fix
    Core->>Core: normalizeTranslocoSyntaxInResources()<br/>{{ x }} → {x} in imported values
    Core->>Domain: applyICUAutoFixToResources()<br/>repairs malformed placeholder syntax
    Domain-->>Core: fixed resources + ICUAutoFix[] records

    Note over Core: Validate
    Core->>Core: validateImportResources() — duplicate key check

    Note over Core: Group and write per folder
    Core->>Core: groupResourcesByFolder() — batch by resource_entries.json path
    loop For each folder batch
        Core->>FS: readResourceEntries() + readTrackerMetadata()
        Core->>Core: determineUpdatedResourceStatus(strategy, resource, oldStatus)
        Note right of Core: translation-service → "translated"<br/>verification → "verified"<br/>migration → preserves source status<br/>update → preserves old status
        Core->>Core: recompute checksums (MD5)
        Core->>FS: writeJsonFile(resource_entries.json)
        Core->>FS: writeJsonFile(tracker_meta.json)
    end

    Core->>Core: buildImportResult() — consolidate counts, transitions, warnings
    Core-->>CLI: ImportResult
    CLI-->>Translator: Import summary (created / updated / skipped / failed, ICU fixes applied)
```

---

### Import Strategy Decision

<!-- Import merge-strategy decision flowchart -->

```mermaid
flowchart TD
    START([Incoming imported value\nfor key K, locale fr]) --> IS_BASE{"locale == baseLocale?"}

    IS_BASE -- Yes --> IS_MIGRATION{"strategy == 'migration'?"}
    IS_MIGRATION -- No --> REJECT([Error: cannot import\ninto base locale])
    IS_MIGRATION -- Yes --> WRITE_BASE([Write base value\nno status assigned])

    IS_BASE -- No --> EXISTS{"Key K exists in\nresource_entries.json?"}

    EXISTS -- No --> CREATE_ALLOWED{"createMissing\n== true?"}
    CREATE_ALLOWED -- No --> SKIP([Skip — resource not created])
    CREATE_ALLOWED -- Yes --> CREATE_NEW

    EXISTS -- Yes --> VALUE_CHANGED{"Imported value\n≠ stored value?"}

    VALUE_CHANGED -- No --> UNCHANGED_STATUS{"strategy?"}
    UNCHANGED_STATUS -- update --> KEEP_OLD([Keep oldStatus])
    UNCHANGED_STATUS -- verification --> MARK_VERIFIED([status = 'verified'])
    UNCHANGED_STATUS -- translation-service\nor migration --> MARK_TRANSLATED_U([status = 'translated'])

    VALUE_CHANGED -- Yes --> HAS_SOURCE_STATUS{"resource.status present\nAND preserveStatus applies?"}

    HAS_SOURCE_STATUS -- Yes --> USE_SOURCE([Use source status])
    HAS_SOURCE_STATUS -- No --> STRATEGY_STATUS{"strategy?"}

    STRATEGY_STATUS -- verification --> STATUS_VERIFIED([status = 'verified'])
    STRATEGY_STATUS -- update --> STATUS_OLD([Keep oldStatus])
    STRATEGY_STATUS -- translation-service\nor migration --> STATUS_TRANSLATED([status = 'translated'])

    CREATE_NEW([Create new entry\nstatus = 'translated'\nor source status if preserved])

    USE_SOURCE --> WRITE([Recompute checksums\nwrite resource_entries.json\nwrite tracker_meta.json])
    MARK_VERIFIED --> WRITE
    KEEP_OLD --> WRITE
    MARK_TRANSLATED_U --> WRITE
    STATUS_VERIFIED --> WRITE
    STATUS_OLD --> WRITE
    STATUS_TRANSLATED --> WRITE
    CREATE_NEW --> WRITE

    style SKIP fill:#fff3cd,stroke:#ffc107,color:#000
    style REJECT fill:#f8d7da,stroke:#dc3545,color:#000
    style WRITE fill:#d4edda,stroke:#28a745,color:#000
```

---

## 3. Frontend: Browse and Edit

Opening a [collection](glossary.md#collection), navigating the folder tree, editing a resource, and the optimistic update / rollback path. Component and store names match [frontend.md — State Management Architecture](frontend.md#state-management-architecture). API endpoints are documented in [api.md — Endpoint Reference](api.md#endpoint-reference).

<!-- Frontend browse-and-edit: collection open → cache poll → folder navigation → edit → optimistic update → confirm / rollback -->

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant TB as TranslationBrowser
    participant BS as BrowserStore
    participant CS as withCacheStatusFeature
    participant FT as withFolderTreeFeature
    participant TS as withTranslationsFeature
    participant API as ResourcesController
    participant TLS as TranslationListStore
    participant Dialog as TranslationEditorDialog

    Note over Dev,Dialog: A. Open collection
    Dev->>TB: navigate to /browser/:collectionName
    TB->>BS: setSelectedCollection({ collectionName, locales, baseLocale })
    BS->>BS: reset transient state (folders, cache, translations)
    BS->>BS: loadViewPreferences(collectionName) — restore from localStorage
    BS->>CS: checkCacheStatus() [rxMethod — starts interval(2000)]

    Note over CS,API: B. Cache indexing poll (every 2 s until "ready")
    CS->>API: GET /api/collections/{name}/resources/cache/status
    API-->>CS: CacheStatusDto { status: "not-started" | "indexing" | "ready" }
    Note right of CS: Loop continues while status is<br/>"indexing" or "not-started".<br/>takeWhile stops the interval on "ready".
    CS->>CS: patchState({ cacheStatus })
    CS->>FT: loadRootFolders() [when status becomes "ready" and rootFolders is empty]

    Note over FT,API: C. Load root folder tree
    FT->>API: GET /api/collections/{name}/resources/tree?path=&includeNested=true
    API-->>FT: ResourceTreeDto { children: FolderNodeDto[], resources: ResourceSummaryDto[] }
    FT->>BS: patchState({ rootFolders, translations, currentFolderPath: "" })

    Note over Dev,TS: D. Navigate to a subfolder
    Dev->>TB: click FolderNode "apps.common"
    TB->>FT: loadFolderChildren("apps.common") [if not already loaded]
    FT->>API: GET /api/collections/{name}/resources/tree?path=apps.common
    API-->>FT: ResourceTreeDto
    FT->>BS: update rootFolders[apps.common].tree + loaded=true
    TB->>TS: selectFolder("apps.common")
    TS->>API: GET /api/collections/{name}/resources/tree?path=apps.common
    API-->>TS: ResourceTreeDto { resources: [...] }
    TS->>BS: patchState({ translations, currentFolderPath: "apps.common" })

    Note over Dev,Dialog: E. Edit a resource
    Dev->>TB: double-click TranslationItem (or press E)
    TB->>TLS: editTranslation(translation, collectionName)
    TLS->>Dialog: MatDialog.open(TranslationEditorDialog, data)
    Dev->>Dialog: edit values, click Save
    Dialog->>API: PATCH /api/collections/{name}/resources
    API-->>Dialog: UpdateResourceResponseDto { resource: ResourceSummaryDto }
    Dialog-->>TLS: afterClosed() → { success: true, resource, folderPath }

    Note over TLS,BS: F. Optimistic cache update (no re-fetch)
    TLS->>BS: updateTranslationInCache(resource)
    Note right of BS: Replaces the stale entry in translations[]<br/>in-place using the API response payload.<br/>No second HTTP request.
    TLS->>TLS: flashRecentlyUpdated(key) — 1.5 s highlight

    Note over TLS,BS: G. Rollback path (API error)
    Note right of TLS: If PATCH fails, Dialog closes<br/>with result.success = false.<br/>translations[] is never mutated —<br/>no rollback needed for edit.
```

---

## 4. Frontend: Search

Full-text search across a collection via the `TranslationSearch` component, the `withSearchFeature` store method, and the API search endpoint. See [api.md — Endpoint Reference](api.md#endpoint-reference) for the search endpoint and [frontend.md — BrowserStore Feature Breakdown](frontend.md#browserstore-feature-breakdown) for store state details.

<!-- Frontend search: type query → 300 ms debounce → API search → display results -->

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant TS as TranslationSearch
    participant BS as BrowserStore (withSearchFeature)
    participant API as ResourcesController
    participant TL as TranslationList (displayedTranslations)

    Dev->>TS: type "confirm" (character by character)
    TS->>TS: #searchSubject.next(query) on each keystroke
    Note right of TS: debounceTime(300ms) + distinctUntilChanged()<br/>— only emits after 300 ms of no input<br/>and only if value actually changed

    TS->>TS: query.trim().length >= 3? Yes
    TS->>BS: setSearchQuery("confirm")
    Note right of BS: patchState({ searchQuery, isSearchMode: true, isDisabled: true })
    TS->>BS: searchTranslations("confirm") [rxMethod]

    BS->>BS: patchState({ isSearchLoading: true, searchError: null })
    BS->>API: GET /api/collections/{name}/resources/search?query=confirm
    Note right of API: searchTranslations() in @simoncodes-ca/core<br/>walks cached ResourceTreeNode in memory<br/>or falls back to disk if cache not ready

    API-->>BS: SearchResultsDto { results: SearchResultDto[] }
    BS->>BS: patchState({ searchResults, isSearchLoading: false })

    Note over TL: displayedTranslations computed signal<br/>returns searchResults when isSearchMode=true
    TL->>TL: re-render virtual scroll list

    Dev->>TS: clear search (X button or empty input)
    TS->>BS: clearSearch()
    BS->>BS: patchState({ searchQuery: "", isSearchMode: false,<br/>searchResults: [], isDisabled: false })
    Note over TL: displayedTranslations switches back to<br/>translations[] (folder browse mode)
```

**Minimum query length:** 3 characters (enforced in `TranslationSearch` before calling `setSearchQuery`). Queries shorter than 3 characters that are non-empty are silently ignored — only a full clear (empty string) resets search mode.

---

## 5. Frontend: Drag-and-Drop Move

Moving a resource or folder via Angular CDK drag-and-drop, the optimistic update, and the rollback path on API failure. Drag mechanics are described in [frontend.md — Drag-and-Drop](frontend.md#drag-and-drop--move-resource-and-folder); the `moveResource` API endpoint is in [api.md — Endpoint Reference](api.md#endpoint-reference).

<!-- Frontend drag-and-drop: drag resource → drop on folder → optimistic remove → API move → confirm / rollback -->

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant TI as TranslationItem
    participant TB as TranslationBrowser
    participant FN as FolderNode (drop target)
    participant BS as BrowserStore
    participant API as ResourcesController / FoldersController
    participant Cache as CollectionCacheService

    Note over Dev,Cache: A. Drag a resource
    Dev->>TI: dragStart on TranslationItem
    TI->>TB: dragStarted output → activeDragData = { type: "resource", key, folderPath }
    TB->>FN: pass activeDragData as input → FolderNode highlights valid drop targets

    Note over FN,BS: B. Drop on a FolderNode
    Dev->>FN: drop on "apps.navigation" folder
    FN->>BS: moveResource({ sourceKey: "apps.common.ok", destinationFolderPath: "apps.navigation" })

    Note over BS: Check same-folder guard
    BS->>BS: sourceFolderPath == destinationFolderPath? No → proceed

    Note over BS: Optimistic update
    BS->>BS: snapshot currentTranslations[]
    BS->>BS: patchState({ translations: optimisticTranslations })<br/>— resource removed from list immediately
    BS->>BS: patchState({ isDisabled: true })

    BS->>API: POST /api/collections/{name}/resources/move<br/>{ source: "apps.common.ok", destination: "apps.navigation.ok" }
    API->>Cache: clearCache() — wildcard-safe full clear
    Cache-->>API: cache state = NOT_STARTED
    API-->>BS: MoveResourceResponseDto { success: true }

    Note over BS: Success path
    BS->>BS: patchState({ isDisabled: false })
    BS->>BS: notifications.success("Resource moved")
    BS->>BS: loadRootFolders() — refresh sidebar tree
    BS->>BS: selectFolder(currentFolderPath) — reload translation list

    Note over BS: Rollback path (API error)
    alt API call fails
        API-->>BS: HTTP error
        BS->>BS: patchState({ translations: snapshotTranslations })<br/>— restore removed item
        BS->>BS: patchState({ isDisabled: false, error: errorMessage })
        BS->>BS: notifications.error(errorMessage)
    end

    Note over Dev,Cache: C. Drag a folder (abbreviated — same pattern)
    Dev->>FN: dragStart on FolderNode (type: "folder")
    Dev->>FN: drop on destination FolderNode
    FN->>BS: moveFolder({ sourceFolderPath, destinationFolderPath })
    BS->>BS: open ConfirmationDialog (lazy import)
    Dev->>BS: confirm
    BS->>BS: snapshot rootFolders[]
    BS->>BS: patchState({ rootFolders: optimisticFolders })<br/>— source removed immediately from sidebar
    BS->>API: POST /api/collections/{name}/folders/move
    API-->>BS: MoveFolderResponseDto
    BS->>BS: rebaseFolderPaths(sourceNode, destinationFolderPath)<br/>insertFolderIntoTree(rootFolders, rebasedFolder, dest)
    BS->>BS: retry GET /tree for movedFolderPath (up to 5×, 1 s delay)
    Note right of BS: Folder move clears API cache;<br/>retry waits for READY before loading translations.
    alt API call fails
        API-->>BS: HTTP error
        BS->>BS: patchState({ rootFolders: snapshotFolders })<br/>isDisabled=false, isDeletingFolder=false
        BS->>BS: notifications.error(errorMessage)
    end
```

---

## 6. Cache Indexing Flow

The sequence from opening a collection to having a fully populated resource tree in the browser store. This flow is driven by `withCacheStatusFeature.checkCacheStatus` (which polls every 2 seconds using `interval(2000)`) and `CollectionCacheService` on the API. The cache state machine is documented in [api.md — Cache State Machine](api.md#cache-state-machine).

<!-- Cache indexing flowchart: app opens collection → poll cache status → wait for READY → load tree into store -->

```mermaid
flowchart TD
    START([Developer navigates to\n/browser/:collectionName]) --> SET_COLLECTION

    SET_COLLECTION["BrowserStore.setSelectedCollection()\nReset: cacheStatus=null, rootFolders=[], translations=[]\nRestore view preferences from localStorage"]

    SET_COLLECTION --> POLL_START["withCacheStatusFeature.checkCacheStatus()\nStart interval(2000ms)"]

    POLL_START --> CALL_STATUS["BrowserApiService.getCacheStatus(collection)\nGET /api/collections/{name}/resources/cache/status"]

    CALL_STATUS --> STATUS_CHECK{"CacheStatusDto.status?"}

    STATUS_CHECK -- "not-started" --> TRIGGER_INDEX
    STATUS_CHECK -- "indexing" --> WAIT_LOOP

    TRIGGER_INDEX["CollectionCacheService.indexCollection()\n[API fires, does not await]\nCore.loadResourceTree() starts async"]

    TRIGGER_INDEX --> WAIT_LOOP

    WAIT_LOOP["patchState({ cacheStatus: 'indexing' })\nIndexingOverlay shown in UI\nWait 2 s → repeat poll"]

    WAIT_LOOP --> POLL_START

    STATUS_CHECK -- "error" --> SHOW_ERROR
    SHOW_ERROR["patchState({ cacheStatus: 'error', cacheError })\nError shown in UI\nNext /tree request will re-trigger indexCollection()"]

    STATUS_CHECK -- "ready" --> MARK_READY["patchState({ cacheStatus: 'ready', collectionStats })\ntakeWhile stops the interval — polling ends"]

    MARK_READY --> HAS_FOLDERS{"rootFolders.length == 0?"}

    HAS_FOLDERS -- Yes --> LOAD_TREE
    HAS_FOLDERS -- No --> DONE_INDEXED([Tree already loaded\nUI ready])

    LOAD_TREE["withFolderTreeFeature.loadRootFolders()\nGET /api/collections/{name}/resources/tree?path="]

    LOAD_TREE --> TREE_RESPONSE{"Response type?"}

    TREE_RESPONSE -- "ResourceTreeDto\n(200 OK, cache READY)" --> POPULATE["patchState({\n  rootFolders: treeData.children,\n  translations: treeData.resources,\n  currentFolderPath: ''\n})\nIndexingOverlay hidden"]

    TREE_RESPONSE -- "TreeStatusResponseDto\n(202, not ready yet)" --> LOAD_TREE_RETRY["No-op — status still 'indexing'\nNext interval tick will retry"]

    LOAD_TREE_RETRY --> POLL_START

    POPULATE --> DONE([UI ready: folder tree visible,\ntranslation list populated,\ncollectionStats shown in AppHeader])

    style SHOW_ERROR fill:#f8d7da,stroke:#dc3545,color:#000
    style DONE fill:#d4edda,stroke:#28a745,color:#000
    style DONE_INDEXED fill:#d4edda,stroke:#28a745,color:#000
    style WAIT_LOOP fill:#fff3cd,stroke:#ffc107,color:#000
```

**Key timing details:**
- Poll interval: `2000 ms` (hard-coded in `withCacheStatusFeature` via `interval(2000)`)
- The interval uses `takeWhile(..., true)` — the final `"ready"` emission is included before the stream completes, which is what triggers `loadRootFolders()`
- There is no WebSocket or server-sent event. The retry loop is entirely client-driven.
- `CollectionCacheService` holds at most one collection at a time. Switching collections immediately discards the previous collection's tree from memory. See [api.md — Single-Collection Design](api.md#single-collection-design).
