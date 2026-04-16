# Feature Matrix

A side-by-side comparison of which operations are available through each LingoTracker interface. Use this as the first reference when deciding which surface to use for a task.

Return to [architecture README](README.md).

---

## Table of Contents

- [Operation Matrix](#operation-matrix)
- [Notable Asymmetries](#notable-asymmetries)
- [Legend](#legend)

---

## Operation Matrix

Each cell shows whether the operation is supported (`Yes`), not supported (`—`), or includes a short clarifying note.

[Collections](glossary.md#collection), [resource keys](glossary.md#resource-key), [translation status](glossary.md#translation-status), [bundles](glossary.md#bundle), and other domain terms are defined in [`glossary.md`](glossary.md).

| Operation | [CLI](cli.md) | [REST API](api.md) | [Tracker UI](frontend.md) |
|---|---|---|---|
| **Project Setup** | | | |
| Init project (create `.lingo-tracker.json`) | Yes (`init`) | — | — |
| Install AI skill | Yes (`install-skill`) | — | — |
| **Collections** | | | |
| Add [collection](glossary.md#collection) | Yes (`add-collection`) | Yes (`POST /collections`) | Yes (Collections Manager dialog) |
| Edit / rename collection | — | Yes (`PUT /collections/:name`) | Yes (Collections Manager edit dialog) |
| Delete collection | Yes (`delete-collection`) | Yes (`DELETE /collections/:name`) | Yes (Collections Manager delete dialog) |
| Read global config | — | Yes (`GET /config`) | Yes (reads on startup via `CollectionsStore`) |
| **Locales** | | | |
| Add [locale](glossary.md#base-locale) to collection | Yes (`add-locale`) | Yes (`POST /collections/:name/locales`) | — |
| Remove locale from collection | Yes (`remove-locale`) | Yes (`DELETE /collections/:name/locales/:locale`) | — |
| **Resources** | | | |
| Add [resource](glossary.md#resource-entry) | Yes (`add-resource`) | Yes (`POST /collections/:name/resources`) | Yes (translation editor dialog — single resource) |
| Edit resource (base value, comment, tags) | Yes (`edit-resource`) | Yes (`PATCH /collections/:name/resources`) | Yes (translation editor dialog) |
| Edit resource (locale translation value) | Yes (`edit-resource --locale --locale-value`) | Yes (`PATCH /collections/:name/resources`) | Yes (translation editor dialog — per-locale fields) |
| Delete resource | Yes (`delete-resource`) | Yes (`DELETE /collections/:name/resources`) | Yes (delete key from item action menu) |
| Move / rename resource | Yes (`move`) | Yes (`POST /collections/:name/resources/move`) | Yes (drag-and-drop resource to folder node) |
| Batch add resources | — | Yes (accepts `CreateResourceDto[]`) | — |
| Batch delete resources | Yes (`delete-resource --key k1,k2`) | Yes (`keys[]` in request body) | — |
| Normalize (fix checksums, backfill locales, clean empty folders) | Yes (`normalize`) | — | — |
| **Folders** | | | |
| Create folder | — | Yes (`POST /collections/:name/folders`) | Yes (inline folder input in sidebar tree) |
| Delete folder (with contents) | — | Yes (`DELETE /collections/:name/folders`) | Yes (folder node context menu) |
| Move folder | — | Yes (`POST /collections/:name/folders/move`) | Yes (drag-and-drop folder node) |
| **Auto-Translation** | | | |
| Translate single resource (new/stale locales) | — | Yes (`POST /collections/:name/resources/translate`) | Yes (translate button on translation item) |
| Translate entire locale (bulk, async job) | Yes (`translate-locale`) | Yes (`POST /collections/:name/resources/translate-locale`) | — |
| Poll translation job status | — | Yes (`GET /collections/:name/resources/translate-locale/:jobId`) | — |
| **Search** | | | |
| Full-text search across collection | Yes (`find-similar`) | Yes (`GET /collections/:name/resources/search`) | Yes (search bar in translation browser header) |
| Filter by status | — | — | Yes (status filter dropdown) |
| Filter by locale | — | — | Yes (locale filter dropdown) |
| **Bundle / Export / Import** | | | |
| Generate bundle (locale JSON + optional TS types) | Yes (`bundle`) | — | — |
| Export resources (XLIFF or JSON) | Yes (`export`) | — | — |
| Import translations (XLIFF or JSON) | Yes (`import`) | — | — |
| **Validation** | | | |
| Validate all resources (CI gate) | Yes (`validate`) | — | — |
| View resource status per locale | — | — | Yes (status badge per locale row in item) |
| **Cache / Indexing** | | | |
| Poll [indexing](glossary.md#indexing) cache state | — | Yes (`GET /collections/:name/resources/cache/status`) | Yes (via `withCacheStatusFeature` — auto-polls on collection load) |
| Trigger cache re-index | — | Yes (implicit on `GET /tree` when state is `NOT_STARTED` or `ERROR`) | Yes (implicit on collection switch in `BrowserStore`) |

---

## Notable Asymmetries

### API Only

- **In-memory collection cache** — `CollectionCacheService` is an API-only system. It holds a single-slot, incrementally-updated in-memory tree of the active collection, making browsing fast for the Tracker UI. The CLI bypasses the cache entirely and reads files directly on every invocation. See [`api.md — Collection Cache`](api.md#collection-cache).
- **Async translation jobs** — The `TranslationJobService` (fire-and-forget job map with UUID-based polling) is API-only. The CLI's `translate-locale` command runs synchronously in-process and prints progress inline.
- **Batch resource creation** — The `POST /collections/:name/resources` endpoint accepts an array of `CreateResourceDto` objects. The CLI's `add-resource` and the UI's editor dialog only create one resource at a time.
- **Edit / rename collection** — `PUT /collections/:name` exists only on the API and UI. The CLI has no `edit-collection` command; renaming a collection requires editing `.lingo-tracker.json` manually or using the UI.

### CLI Only

- **`init`** — Project bootstrapping (creating `.lingo-tracker.json`) is a CLI-only operation. The API and UI require a config file to already exist before they can start.
- **`install-skill`** — Generates a `.claude/` AI skill file templated to the current repository. No equivalent in the API or UI.
- **`bundle`** — Generating deployment locale JSON files and TypeScript token constants is a CLI-only pipeline. See [`bundle-generation.md`](bundle-generation.md).
- **`export` / `import`** — XLIFF and JSON import/export workflows for integration with external translation agencies are CLI-only.
- **`validate`** — The CI validation gate (exit code 1 on failures) is CLI-only. The UI shows per-resource status visually but does not produce a machine-readable validation report.
- **`normalize`** — Repair of checksum drift, backfilling of missing locale entries, and cleanup of empty folders is CLI-only.

### Tracker UI Only

- **Filter by status** — Filtering the visible translation list to only `new`, `stale`, `translated`, or `verified` resources. No CLI or API equivalent for this interactive filter.
- **Filter by locale** — Narrowing the locale columns shown in the browser. UI-only display preference.
- **Drag-and-drop move** — Moving resources and folders interactively via CDK drag-and-drop. CLI requires `move` command; API requires an explicit `POST /move` call.
- **View preferences persistence** — Density mode (compact/full) and locale selection are persisted to `localStorage` per collection. CLI and API are stateless.
- **Similar-translation sidebar** — Live in-dialog similarity search as the user types a new base value. Powered by the API's `/search` endpoint but surfaced only in the UI.

---

## Legend

| Symbol | Meaning |
|---|---|
| `Yes` | Fully supported |
| `Yes (note)` | Supported with a qualifier — read the note |
| `—` | Not supported on this surface |

---

## Related Docs

- [`cli.md`](cli.md) — full command inventory, interactive vs. non-interactive mode, shared utilities
- [`api.md`](api.md) — full endpoint reference, collection cache design, translation job system
- [`frontend.md`](frontend.md) — Angular component trees, BrowserStore feature breakdown, key UI patterns
- [`glossary.md`](glossary.md) — definitions for all domain terms used in this document
- [`bundle-generation.md`](bundle-generation.md) — bundle pipeline details (CLI `bundle` command internals)
- [architecture README](README.md) — hub for all architecture documentation
