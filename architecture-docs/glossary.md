# Glossary

Alphabetical reference for every domain term used in LingoTracker documentation. Each entry links to the spoke document where the concept is explained in full context.

Return to [architecture README](README.md).

---

## A

### API Error

The one error value the Tracker UI sees for a failed API request (`ApiError` in `apps/tracker/src/app/shared/api-error/api-error.ts`). A functional `HttpClient` interceptor, installed once by `provideTrackerHttpClient()`, converts every failed response at the HTTP seam — every `HttpClient` request goes through it, the API clients and the Transloco loader alike — so Angular's `HttpErrorResponse` never reaches a store or a dialog. An `ApiError` carries a `kind` shrunk to what a consumer branches on (`invalid`, `not-found`, `conflict`, `other`), the real HTTP `status`, the `serverMessage` of the API's `{ statusCode, message, error }` body when it had one, and the body's `errors` array as `details` (bundle rule messages, preferred-terminology rule errors). Consumers decide with `kind` and show `apiErrorMessage(error, fallback)`: the server's message, else their own localized fallback. No status is special: the API's catch-all answers an unmapped exception with a 500 that carries no message, so it lands on the fallback by the same rule, and a 500 that does carry one (an `InvalidConfigError` naming what is wrong with `.lingo-tracker.json`) is shown as is. It is the Tracker's counterpart of the [typed errors](#typed-errors) the API maps to HTTP.

The server maps core errors by `kind` and an API-owned table keyed on `code`. Core supplies domain facts, including optional `details`. The API table owns message transforms, status overrides, and inclusion of `details` as response `errors`. The Tracker receives those lists as `ApiError.details`. The server does not send the core `kind` or `code`.

Explained in context: [`frontend.md`](frontend.md#api-errors--one-adapter-at-the-http-seam), [`api.md`](api.md#error-mapping)

---

## B

### Base Locale

The authoritative source language for all translation resources — the locale whose values are treated as the ground truth for staleness detection. Configured globally in `.lingo-tracker.json` as `baseLocale` (e.g. `"en"`) and overridable per collection. The base locale's value is what all other locale translations are derived from.

Tracker metadata for the base locale omits `status` and `baseChecksum`; only `checksum` is stored (the MD5 of the base value itself).

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md)

---

### Browser Session

The one path that opens a [collection](#collection) in the Tracker UI. In code, `openCollection(settings)` in `apps/tracker/src/app/browser/store/features/with-browser-session.feature.ts`, a feature of the root-provided `BrowserStore`. It takes a `CollectionSettings`, the Tracker's [resolved collection](#collection) (`resolveCollectionSettings(config, name)` in `apps/tracker/src/app/collections/store/collection-settings.ts`, using domain's [Collection Settings](#collection-settings) rule and projecting `translationEnabled` from `translation?.enabled === true`). It bumps the session counter `sessionId`, starts every store feature at its own initial state (each feature exports it; the session names no other feature's fields), stores the settings as `collectionSettings` (with the projections `selectedCollection`, `availableLocales`, `baseLocale`, `isReadOnly`), restores the collection's saved view preferences (`restoreViewPreferences`, owned by the view-preferences feature, which delegates locale and density restoration to [Locale Selection](#locale-selection); a missing or retired `medium` density reads as `compact`), and starts index polling. Store loaders capture `sessionId` when a request starts and drop the response if another open has happened since (`captureSession`/`withinSession` in `apps/tracker/src/app/browser/store/session-guard.ts`), so a slow response from the previous collection, or from an earlier open of the same one, never lands in the new session. The [List Scope](#list-scope)'s loads are cancelled outright on every open, not just dropped. This includes the entry writes (`createResource`, `updateResource`, `deleteResource`, `translateResource`): each still resolves its Observable for the caller, but only patches or drops a cache row while its own session is still open, so the translation editor dialog's save cannot land in a collection that replaced the one it was editing. Because the store outlives the route, this is what keeps one collection's search results, folder selection, folder tree or pending folder operation from showing up in the next collection. **Re-entering the open collection is not an open**: the user keeps their place (folder, expansion, search box and results, filters), and only `updateSettings(settings)` runs. A `readOnly` or `translationEnabled` change writes the changed settings in place; equal settings, as on an unrelated config reload, are a no-op. A change to `locales`, `baseLocale` or `translationsFolder` invalidates data cached under the old settings, so `updateSettings` runs `openCollection(settings)` instead — a fresh session, with the collection's saved view preferences restored against its current locales (dropping any locale the collection no longer has, so it cannot leave a stale column on screen or in storage). `collectionSettings` is the browser's one source of settings, `translationEnabled` and `translationsFolder` included. The `TranslationBrowser` route component is the only production caller of both methods.

Explained in context: [`frontend.md`](frontend.md#browserstore--feature-composition)

---

### Bundle

A generated JSON file (one per locale) that aggregates translation values from one or more [collections](#collection) into a flat or hierarchical format consumable by the Angular Transloco library. Bundles are defined in the `bundles` section of `.lingo-tracker.json`. Each bundle specifies a `dist` output directory, a `bundleName` pattern (e.g. `{locale}`), and which collections (or `"All"`) to include.

During bundle generation, ICU simple placeholder syntax (`{varName}`) is converted to Transloco double-brace syntax (`{{ varName }}`); complex ICU constructs (`plural`, `select`) pass through unchanged.

Core generates a saved bundle by its name for the API. For a CLI run, `generateBundles(config, { names?, locales?, overrides, cwd })` selects all or named bundles, prepares each request once, continues after an individual failure, and returns one outcome per bundle plus totals. [Bundle Run Preparation](#bundle-run-preparation) supplies the shared settings for generation and planning. Type generation has one outcome: written, skipped, failed, or not configured. A skipped outcome carries the `empty-bundle` reason code. Core's `bundleTypeOutcomeDetail` returns each outcome's detail once; the API and CLI add status words and their own framing. A deprecated-setting warning travels with that outcome when type writing fails and with the prepared run when generation throws, for the CLI to print or the API job to log.

Explained in context: [`bundle-generation.md`](bundle-generation.md), [`core-library.md`](core-library.md)

---

### Bundle Collection References

The explicit collection entries stored in bundle definitions. `renameBundleCollectionReferences` and `removeBundleCollectionReferences` in `libs/core/src/collections-manager/bundle-collection-references.ts` change them in memory as part of the [Collection Lifecycle](#collection-lifecycle). Rename refuses a target already referenced by a bundle with `CollectionRenameBundleConflictError`. Removal checks every bundle first and throws `CollectionRequiredByBundleError` when any list would become empty. Malformed collection lists are skipped and null entries are tolerated. Entries in `'All'` bundles are unchanged.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution)

---

### Bundle Definition

One entry under `bundles` in `.lingo-tracker.json`: how a [bundle](#bundle) is built.

An explicit collection list can name one collection more than once when the entries have different prefixes. Collection renames update every matching entry; deletion removes every matching entry. A delete is refused if it would leave any explicit list empty. A rename is refused if a bundle already references the new name. The `'All'` form needs no update.

It lives in domain, so core, the API, the CLI and the Tracker share one type and one set of rules. The same module derives the default token constant name from a bundle key (`bundleKeyToConstantName`: `core-ui` gives `CORE_UI_TOKENS`), which core's settings resolution and the Tracker bundle dialog both use. In code, `libs/domain/src/lib/bundle-definition.ts` declares `BundleDefinition` (`bundleName`, `dist`, `collections`, and the optional `typeDistFile`, `tokenCasing`, `tokenConstantName`, `transformICUToTransloco`), `CollectionBundleDefinition` and `EntrySelectionRule`. The data-transfer `BundleDefinitionDto` types are aliases of these, so the API does not map them. The rules are pure. `validateBundleKey(key)` accepts letters, digits, hyphens and underscores. `validateBundleDefinition(definition, collectionNames)` returns every problem at once: `bundleName` needs the `{locale}` placeholder, `dist` is required, each collection must exist and appear only once per `bundledKeyPrefix`, rules need a `matchingPattern`, `tokenCasing` is `upperCase` or `camelCase`, `typeDistFile` must end in `.ts` and `tokenConstantName` must be a JavaScript identifier. `normalizeBundleDefinition(definition)` trims strings, drops empty optionals and empty tags, keeps the `'All'` literals, moves a legacy `typeDist` to `typeDistFile`, and never throws on malformed input. `checkBundleDefinition(definition, collectionNames, key?)` runs both and returns the normalized definition with every error (key errors first); it is the one check core, the API dry run and the Tracker form run. `findBundleDefinition(bundles, key)` looks a key up by own property only. `bundleOutputFile(definition, locale)` is the file core writes for a locale: `<dist>/<bundleName with {locale} replaced>.json`, with `/` separators and no leading `./`. Core's add and update operations check definitions against an [Opened Project](#opened-project), run `checkBundleDefinition`, and throw `InvalidBundleDefinitionError` for invalid definitions. They write through `guardedConfigWrite`; a changed config snapshot raises `ConfigChangedError`. The API dry run runs the same check, and the Tracker bundle form runs it on submit.

Explained in context: [`core-library.md`](core-library.md#bundle-definition), [`api.md`](api.md#bundles), [`frontend.md`](frontend.md#bundle-form-dialog)

---

### Bundle Form

The Tracker bundle dialog's form model, `BundleForm`, in `apps/tracker/src/app/collections/bundle-form-dialog/bundle-form.ts`. It owns the typed Angular form, population and validation, section state and errors, definition building, and the form-to-signal bridge. An injected dry-run function supplies its debounced preview, including stale results and error recovery. `submitResult()` validates an attempted submit; `destroy()` releases subscriptions. The dialog keeps DOM handling and writes through [Dialog Config Submit](#dialog-config-submit).

Explained in context: [`frontend.md`](frontend.md#bundle-form-dialog)

---

### Bundle Run Preparation

The core step shared by a dry-run plan and generation. `prepareBundleRun` in `libs/core/src/lib/bundle/prepare-bundle-run.ts` takes `source: 'supplied'` with a definition for a full Bundle Definition and locale check, or `source: 'saved'` with a name for the existing lookup and locale check. Both modes resolve settings (including the token constant name) and return `{ bundleKey, cwd, definition, settings, locales, collections, typeWarning, tokenConstantNameOverride }`. Core trims the key for a supplied definition. A saved definition uses the caller’s name unchanged. The root is resolved when preparation runs; collections and generated files use that same root. Collections open on first use. A saved bundle with a deleted collection keeps running with a warning. The job service prepares synchronously before queueing. `generatePreparedBundle` takes the prepared run and per-run progress or debug options. `selectPreparedBundleLocale` selects one locale and adds the empty-bundle warning in one place. A prepared `typeWarning` still reaches the CLI event or API log if generation throws.

Explained in context: [`bundle-generation.md`](bundle-generation.md#where-bundle-generation-lives), [`api.md`](api.md#bundles)

---

### Bundle Runs

The Tracker state for bundle generation: each bundle run and the names started by the latest "Generate all" request. `withBundlesFeature` stores those names in `bundleBatch` and exposes `batchTotal`, `batchPosition`, and `isBatchRunning`. A bundle already running is excluded from the batch. Completed and failed runs advance its position.

The pure `apps/tracker/src/app/collections/store/bundle-runs.ts` module maps job snapshots, formats errors, and parses persisted runs. The store owns API calls, polling, and session storage. Run state survives a reload, but the batch does not. A restored run disappears when the API no longer knows its job.

Explained in context: [`frontend.md`](frontend.md#bundle-runs)

---

### Bundle Selection

What a [bundle](#bundle) holds for one locale: each final key, its value, and the resource the value came from. In code, `libs/core/src/lib/bundle/bundle-selection.ts` has two functions. `resolveBundleCollections(definition, config, { cwd })` opens each [collection](#collection) the definition reads once per run (`'All'` means every collection, with every entry and no prefix). For saved generation it warns once about an unknown collection; a supplied dry-run definition is rejected before selection. `selectBundleEntries(collections, locale, { transformICUToTransloco, cache })` reads each collection for the locale through the [Collection Reader](#collection-reader), keeps the entries that match a rule (key pattern and [tags](#tags)), prepends `bundledKeyPrefix`, converts [ICU](#icu-format) to [Transloco](#transloco) when asked, and merges: the first value of a key wins, unless a later collection's `mergeStrategy` is `'override'`. It returns `{ entries, conflicts, warnings }`; each entry has a `value` and an `origin` (`collectionName`, `sourceKey`). Each collection's base value comes from its own [base locale](#base-locale); `COLLECTION_BASE_LOCALE` asks for every collection's base value. `generateBundle` writes the JSON files from it, `planBundle` counts keys and reports conflicts from it, and the type file takes its keys from it. None of them selects entries itself.

Explained in context: [`core-library.md`](core-library.md#bundle-selection), [`bundle-generation.md`](bundle-generation.md#entry-filtering-pipeline)

---

## C

### Checksum

An MD5 hash of a translation value, stored in [`tracker_meta.json`](#tracker-metadata) for every locale. Two checksums are tracked per non-base locale entry:

- **`checksum`** — MD5 of the current translation value for that locale.
- **`baseChecksum`** — MD5 of the [base locale](#base-locale) value at the time the translation was last written.

When the base value changes, a new `checksum` is computed for it. If `baseChecksum` no longer matches the base locale's current `checksum`, the translation is automatically marked [stale](#staleness).

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`core-library.md`](core-library.md)

---

### Chip Input

`ChipInput` in `apps/tracker/src/app/shared/chip-input/chip-input.ts` is a directive for an `<input>` that adds and removes chips: `[appChipInput]="chips()"` takes the list now shown. Enter or comma emits `chipAdd` with the typed text (even blank, so the host resets its own input state; the host's rule ignores a blank) and clears the field, and Backspace in an empty field emits `chipRemove` with the last chip. `commitOnBlur` makes leaving the field commit typed text; the translation editor leaves it off so a click on an autocomplete option is not preempted. The directive does not interpret text: the translation editor, the collection dialog and the bundle dialog each pass `chipAdd` to their own rule (a tag by [Tag List Edit](#tag-list-edit), a protected term by the [Protected Term Add](#protected-term-add) rule).

Explained in context: [`frontend.md`](frontend.md#collection-form-dialog)

---

### CLI Help Text

The long examples appended to `import`, `validate`, and `preferred-terminology` help. `apps/cli/src/runner/help-text.ts` holds these strings so the [Command Registration](#command-registration) list stays short. Registration passes each string to Commander's `addHelpText('after', ...)` unchanged.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### CLI Option Definitions

Reusable Commander flag declarations in `apps/cli/src/runner/options.ts`. A definition registers one option when the [Command Registration](#command-registration) is applied. `option({ flags, description?, defaultValue?, helpDefault?, parse? })` states which strings are help descriptions and which values Commander parses by default. Its `parse` callback converts and validates a supplied value before the command loads; `find-similar --max-results` uses it to reject non-numeric input. The module owns the collection flag, token casing choices, repeatable list parser, shared `init` and `add-collection` flags, `--yes`, resource field groups, and the value conversion for `--setup-bundle`. `commaListOption({ flags, description?, helpDefault?, empty? })` uses `parseCommaSeparatedList` to deliver trimmed `string[]` values with empty items removed. A raw empty optional flag (`""`) becomes undefined, so prompt and required-option gates still run. Non-empty inputs with no items (such as `" , "`) retain `[]` and count as supplied flags. `empty: 'clear'` preserves `[]` for replacement flags. `empty: 'preserve'` returns `{ kind: 'empty', input }` for deferred diagnostics. Export reads this explicit empty state to reject `--status` after collection resolution, before core validation and advisories. Commands declare `commaListAnswers` for comma-string prompt fields, which the runner converts with the same parser before required checks and selection. `validate-options.ts` beside validate owns its defaults; `find-similar-options.ts` owns the numeric parser.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### Collection

A named group of translation [resources](#resource-entry) that share a common `translationsFolder` on disk and optional configuration overrides (base locale, locales, import/export folders, auto-translation settings, collection-level tags). Collections are defined under the `collections` key in `.lingo-tracker.json`.

Collections may declare a `tags?: string[]` array. These are **collection-level (inherited) tags** — every resource in the collection inherits them automatically at read time. See [Tags](#tags) for the inheritance model.

Example collections from the project's own config: `trackerResources` (the Tracker UI's own strings), `TestDataPlayground`, and `mockDesignSystem`.

**Collection (resolved).** Code outside the config module never reads a collection's raw entry to get its settings. `openCollection(config, name)` in `@simoncodes-ca/core` applies domain's [Collection Settings](#collection-settings) rule and returns a `Collection` with the effective values: `baseLocale` (non-empty collection value, else non-empty global value, else `en`), `locales` (non-empty collection list, else global list, else none). An empty collection value inherits: `baseLocale: ''` and `locales: []` both use the global setting. Other effective values are `targetLocales` (the locales without the base locale), `translationConfig` (collection, else global; the two are not merged), the absolute `translationsFolder`, normalized `tags`, `termFiles` (the paths of the [protected-terms](#protected-term) and [preferred-terminology](#preferred-terminology) files, resolved but not read; `readProjectTerms(collection)` reads them as the [Project Terms](#project-terms)), and `readOnly`. The returned `OpenedCollection` is also an [Opened Project](#opened-project): it carries `sourceConfig` and `projectRoot`, so registration and locale writes use the config that was opened. It throws `CollectionNotFoundError` for an unknown name, and `ReadOnlyCollectionError` when `{ writable: true }` is set on a read-only collection. The CLI and the API both open collections this way. Every resource and folder operation (`addResource`, `editResource`, `deleteResource`, `moveResource`, `translateExistingResource`, `translateLocale`, `createFolder`, `deleteFolder`, `moveFolder`) takes the opened `Collection` as its first parameter, like the [Import run](#import-run), so the base locale and locales come only from it.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`cli.md`](cli.md), [`core-library.md`](core-library.md#config-and-collection-resolution)

---

### Collection Draft

The Tracker collection form's plain values and rules in `apps/tracker/src/app/collections/collection-form-dialog/collection-draft.ts`. It seeds create or edit values, normalizes and changes locale choices, keeps the base locale fixed in edit mode (including an inherited base), reports removed original locales for confirmation, defaults read-only from a `node_modules` folder until the user chooses it, and builds the collection write payload. It has no Angular dependency. It also adds and removes tags and protected terms. [Collection Form](#collection-form) holds the draft; `collection-form-dialog.ts` owns the confirmation and store write.

Explained in context: [`frontend.md`](frontend.md#collection-form-dialog)

---

### Collection Change

The shared change engine for an existing [Collection Entry](#collection-entry). `changeCollection` in `libs/core/src/collections-manager/collection-change.ts` serves update, add-locale, and remove-locale.

All preconditions precede writes. Locale sugar refuses read-only before its locale-specific checks and the stale snapshot. Update patches check terms, rename, entry, bundle references, terms destination, and stale snapshot before read-only and added-locale validation. The engine reads every affected folder before writes. It seeds added locales, purges removed locales, writes config, then writes optional terms.

The planning step resolves the next config, effective collection, locale differences, folders, and terms destination before writes. The write phase writes config before optional terms. A failed terms write leaves config written and throws the original error. Public result shapes remain unchanged. Locale or config failures also throw directly. One reporting step delivers deduplicated [reindex mutations](#resource-mutation) after attempted locale saves or a changed record's config write, including failures. Structural equality ignores object key order and preserves array order.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution)

---

### Collection Entry

The write side of a [collection's](#collection) record in `.lingo-tracker.json`: the one place that decides what the stored entry contains. In code, `libs/core/src/lib/config/collection-entry.ts` holds three pure functions over the in-memory config: `toCollectionEntry(config, collection)` builds the record (`translationsFolder`, trimmed, plus only the settings that differ from the global config, so a collection inherits by omission; `translation` is kept verbatim; `readOnly` only when true; tags normalized), `addCollectionEntry` registers it (a folder under `node_modules` is read-only unless the caller decides) and `patchCollectionEntry` changes it, with an optional rename in place. Patch semantics: a field the patch sets replaces the stored value (a setting is cleared, so the collection inherits, with its empty value: `tags: []`, `readOnly: false`, `locales: []`, and `''` for `exportFolder`, `importFolder`, `baseLocale` and `protectedTermsFile`; `translation` has no empty value and cannot be cleared by a patch, only replaced), a field set to `null` is `InvalidCollectionError`, and a field left out or `undefined` keeps its stored value, so a client that never sends `translation`, `exportFolder` or `importFolder` cannot lose them; the merged record is then re-minimized. An empty `locales` list means inherit, never "no locales". The rule for every field is listed once, keyed by the `LingoTrackerCollection` type, so a new field does not compile until its rule is written. `addCollection`, `editCollectionTags` and project-term pointer changes write through it. `assertCollectionFields` rejects null fields and a non-string `translationsFolder` before DTO-only fields are removed by the API mapper. The mapper also requires a string `translationsFolder` on collection request bodies, including updates. `updateCollection`, `addLocaleToCollection` and `removeLocaleFromCollection` share one locale-change path: validate, read every folder, seed added locales, purge removed locales, then write the minimized record once through `patchCollectionEntry`. A changed record delivers reindex mutations for the old and new translations folders. The errors are typed: `CollectionNotFoundError`, `CollectionAlreadyExistsError`, `InvalidCollectionError`.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution)

---

### Collection Form

The Tracker collection dialog's form model, `CollectionForm`, in `apps/tracker/src/app/collections/collection-form-dialog/collection-form.ts`. A signal holds the [Collection Draft](#collection-draft); the typed FormGroup holds only the name and folder text inputs and feeds each change into the draft. It owns locale, base-locale, read-only, tag and protected-term edits through the draft's rules, the add-locale input and its errors, display state (displayed base locale, hints, disclosure), validation of an attempted submit, and the refusal message cleared on the next edit. `destroy()` releases its subscriptions. The dialog keeps DOM handling, the removal confirmation, and the write through [Dialog Config Submit](#dialog-config-submit). It is the collection counterpart of [Bundle Form](#bundle-form).

Explained in context: [`frontend.md`](frontend.md#collection-form-dialog)

---

### Collection Index

The API's in-memory copy of each open [collection's](#collection) [resource tree](#resource-tree). In code, `CollectionIndex` in `apps/api/src/app/cache/collection-index.service.ts` exposes `tree(collection, path)` and `searchPage(collection, request)` for resource reads. Search runs [Resource Search](#resource-search) over the index tree, or over the disk before the collection is indexed. `status(collection)` answers the `cache/status` endpoint, and writable API collections carry `sink` as their default `onMutation`. Disk search and tree loading report unreadable folders through the Nest logger using `describeFolderProblem` with the collection name; `loadResourceTree` passes them to `onProblem`. Its internal `apply()` method and tests consume the [resource mutations](#resource-mutation). Indexing on first read, revalidation against a disk fingerprint, patching, and the memory cap (least recently used eviction) are internal. When a patch does not match the tree, the index drops that collection and indexes it again on the next read. The HTTP endpoints and the Tracker UI still call it the "cache".

Explained in context: [`api.md`](api.md#collection-index)

---

### Collection Lifecycle

The core operation that registers or changes a [Collection Entry](#collection-entry) together with its optional protected terms. Changes to existing collections use [Collection Change](#collection-change).

Collection rename and delete check bundle references before writing. Rename changes the collection registration and every explicit bundle reference in one config write, unless a bundle already references the new name. Delete removes the registration and its explicit references in one config write, unless an affected bundle would become empty. Either conflict leaves config and translation files untouched.

`addCollection(project, name, collection, { protectedTerms? })` and `updateCollection(openedCollection, newName, patch, { protectedTerms? })` check the term list and the resulting entry before their first write. The resulting entry supplies the file pointer, including one supplied in the same request or retained through a rename. A missing pointer raises `ProtectedTermsFileNotSetError` and changes no file. After any locale file changes required by an update, core writes `.lingo-tracker.json` and then the protected-terms file. The two files are not atomic: if the terms write itself fails, the config entry remains written. `editCollectionTags(openedCollection, { add?, remove?, set? })` edits inherited tags in the registration, with core enforcing flag combinations and normalization. `initConfig(config, { cwd? })` validates and creates a config through the same config write path with an exclusive file create, refusing an existing file even when it appears during the write.

`loadConfig()` records the exact config bytes it read. `guardedConfigWrite(openedProject)` checks that version before every config write, including add, delete, bundle writes, and writes delayed by a CLI prompt. A changed or removed file raises `ConfigChangedError` instead of replacing another process's edit. The locale-change path checks before touching locale files; the handle checks again when it writes config. The API answers 409 with the error message, and the CLI prints it and exits 1.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution), [`api.md`](api.md#collections), [`cli.md`](cli.md)

---

### Collection Reader

The read side of the [Resource Folder](#resource-folder): the one walk over a [collection's](#collection) `translationsFolder`. In code, `readCollection(collection)` in `libs/core/src/lib/resource/read-collection.ts` opens every folder with the collection's [base locale](#base-locale) and returns `{ resources, problems }`. Each `StoredResource` has an address (`fullKey`, `folderPath`, `entryKey`), the `entry` as `ResourceFolder.treeEntry()` reads it, and `effectiveTags` ([Tags](#tags)). The rules are the same for every caller. Hidden folders are skipped, with everything below them; this rule, and the rules for a missing or unlistable folder, are the collection-folder policy that the [Collection Sweep](#collection-sweep) shares. An entry without metadata is read with `metadata: {}`, so it counts as `new`. A folder whose file is not valid JSON, or that cannot be listed, is left out and returned as a problem, and the caller reports it. `CollectionFolderProblem.kind` is `unreadable` for listing or parsing failures and `not-removed` for pruning removal failures. `describeFolderProblem(problem, { collectionName? })` supplies the shared diagnostic wording. Core returns problems or sends them to an adapter callback; it never prints them to the console. The [Collection Set](#collection-set) (for export, validate, and glossary), the [Bundle Selection](#bundle-selection) (bundle, dry-run plan and type file), the resource tree, [Resource Search](#resource-search) on the disk (the API before indexing, the CLI `find-similar`) and the CLI `glossary` all read through it.

Explained in context: [`core-library.md`](core-library.md#collection-reader)

---

### Collection Set

The read model for a whole-collection run. In code, `readCollectionSet(collections, options)` in `libs/core/src/lib/collection-set/collection-set.ts` reads each opened collection through the [Collection Reader](#collection-reader) and returns one agreed base locale, the ordered target-locale union (optionally scoped), flattened resources with values and metadata-derived status, and `readProblems` with collection, folder path, and message. A missing status counts as `new` for status checks. [Export Run](#export-run) and [Term Glossary](#term-glossary) require base-locale agreement and raise `CollectionBaseLocaleMismatchError` (`invalid`) before reading when it fails. [Validate Run](#validate-run) uses the same resource model but checks collections independently under their own base locales, so it allows different base locales. Export, Validate, and Glossary map the common read problems into their existing result fields. [Bundle Selection](#bundle-selection) keeps its locale-at-a-time reader because it needs per-definition filtering, prefixes, merge order, and its run cache.

Explained in context: [`core-library.md`](core-library.md#collection-set)

---

### Collection Settings

The pure inheritance rule shared by core and the Tracker: `inheritCollectionSettings(collection, global)` in `libs/domain/src/lib/collection-settings.ts`. `baseLocale` uses the first non-empty collection or global value, else `DEFAULT_BASE_LOCALE` (`en`). `locales` uses the non-empty collection array, else the global array, else `[]`. An empty collection value inherits, for both `baseLocale` and `locales`. An empty global locale array stays empty.

`translation` uses the collection object, else the global object, without merging. `readOnly` is true only when the collection sets it to `true`.

Translation settings stay generic, so domain has no dependency on core. Core adds paths, target locales, tags and term files. The Tracker adds raw `translationsFolder` (`''` when the collection is unknown) and `translationEnabled` (`translation?.enabled === true`). Both callers find entries with `findCollectionEntry(collections, name)` from the same domain module. This function reads own properties only, so inherited `constructor` and `__proto__` names do not resolve to collections.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution), [`frontend.md`](frontend.md#browserstore--feature-composition)

---

### Collection Sweep

The write side of the [Resource Folder](#resource-folder), the twin of the [Collection Reader](#collection-reader): the one walk that writes over many folders of a [collection](#collection). In code, `sweepCollection(collection, { startPath? })` in `libs/core/src/lib/resource/collection-sweep.ts` yields each collection folder under `startPath` (default: the root) opened with the collection's [base locale](#base-locale), or a problem for a folder it cannot read (invalid JSON, or not listable). The caller changes and saves each folder, and decides what a problem means. `sweepKeys` is the same sweep reduced to the full keys and the problems. It visits the same folders as the reader: hidden folders and everything below them are not part of the collection. The shared walk checks every start-path segment with `lstat`: the first symbolic link yields one `unreadable` problem visit with no subfolders, then the walk stops. A missing segment still yields nothing. The shared locale-change path for add-locale, remove-locale and edit-collection reads every folder before writing; normalize, folder delete (its entry count), folder move and the wildcard resource move go through it. Normalize and folder move then remove empty folders through [Folder Pruning](#folder-pruning).

Explained in context: [`core-library.md`](core-library.md#collection-sweep)

---

### Command Registration

The CLI declaration that connects a name, description, ordered option definitions, optional positional argument and help text to a lazy command import. `registerCommand<Options>(program, registration)` in `apps/cli/src/runner/register-command.ts` installs it on Commander, then loads and invokes the handler when the action runs. Its optional `mapOptions(raw, args)` converts raw flags and positional arguments before invocation. The shared [CLI Option Definitions](#cli-option-definitions) supply repeated flags and parsers.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### Command Runner

The CLI execution path. `registerCommand(program, registration)` applies the command's flags to Commander; `defineCommand<Options>()(spec)` in `apps/cli/src/runner/command-runner.ts` returns the function its lazy action calls. A command spec has a `name`, what it opens (`collection: 'writable' | 'read' | 'many' | 'none'`, and `config: false` for `init` and `install-skill`), its optional `preflight(ctx)` for preconditions, its `prompts` for missing values, the options it `required` (an absent flag, or an empty answer, fails; `run` sees them typed as present), and `run`, which makes the core call and prints. The runner finds the project root (`INIT_CWD`, else `process.cwd()`), reads the interactive rule, and loads the config. Its opened collection carries that config snapshot; the locale and tag commands pass it with a write handle to core. For one collection it resolves the flag, the only configured name, or an interactive selection. For `many` it supplies all opened collections to prompt builders, then selects all or an ordered, deduplicated list after the prompts. An empty config or unknown name fails with exit 1. The four many-collection commands are `validate`, `export`, `normalize`, and `glossary`; `normalizeCollections` in core applies the named versus all read-only rule after receiving the opened collections. After resources open, the runner awaits `preflight` in both modes before building command questions. Its context supplies those resources and the original flags as `options`. A thrown preflight error uses normal reporting (`❌ <message>`, exit 1); `formatError` receives `duringRun: false`. The runner handles cancellation and errors, sets `process.exitCode`, and never calls `process.exit()`.

`missingTextQuestions` hides missing-flag checks and required-text validation; `collectionSetupQuestions` hides the six shared collection questions and their command-specific defaults. `confirmOrCancel` hides the confirmation question, answer field, consent and interactive checks, and cancellation error.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### Config Write

One write to `.lingo-tracker.json` from the Tracker UI, and the one way its outcome comes back. In code, `injectConfigWrite(store)` in `apps/tracker/src/app/collections/store/config-write.ts` returns the function that runs one, and every mutation of `CollectionsStore` is: `createCollection`, `updateCollection`, `deleteCollection`, `updateGlobalConfig`, and the bundle feature's `createBundle`, `updateBundle`, `deleteBundle`. Each sends its request, reloads `GET /api/config`, stores the config, and returns an Observable of that config, so the caller hears back only once the store already holds what the server holds; if that reload fails, the write still happened, so the Observable resolves with `null` and the store reports the load failure in `error`; a rejected write errors with the [API Error](#api-error) of the request (`conflict` for a taken name, `invalid` with the rule messages or the per-row preferred-terminology errors as `details`, anything else) and leaves the store as it was. The Observable is cold, like the browser store's entry writes: nothing is sent until the caller subscribes, and the caller owns the reaction. The collection and bundle form dialogs write through the store themselves, cannot be closed while the write is in flight, and close only on success; a taken name lands on the name field, any other refusal on an error line in the dialog (the bundle dialog lists the server's rule messages). The collections manager toasts a create or edit only when a dialog closes with a saved result, and awaits a delete's outcome before it toasts. Settings Draft handles the save outcome: the saved config reseeds both lists, while the page gives one toast (a failed reload still earns the toast); a refusal keeps every edit and maps rule errors onto the rows that were sent, while the page shows its message. The store's `error` signal reports only a failed load (the initial one, or the reload after a write).

Explained in context: [`frontend.md`](frontend.md#collectionsstore)

---

### Confirmation

Confirmation is one boolean answer from the shared `ConfirmationDialog`. `injectConfirm()` in `apps/tracker/src/app/shared/confirm.ts` accepts a `ConfirmationSpec`: title, message, optional button-label tokens, and action type. Each text field accepts a token string or `{ token, params }`. Parameter values can also reference a token. The helper translates the spec into `ConfirmationDialogData` with the existing width and close options.

The helper lazily opens the dialog and resolves `true` only for an explicit confirmation. Cancel, backdrop close, and a close without an emitted result resolve `false`. The helper checks the caller's `canOpen` guard after loading and before opening.

Explained in context: [`frontend.md`](frontend.md#lazy-loaded-dialogs)

---

### Connector Links

The lines from collection cards to a hovered bundle card in the Tracker's Collections Manager. `apps/tracker/src/app/collections/collections-manager.ts` measures the hovered bundle and only its referenced collection cards, then passes their rectangles to `collectionLinks` in `apps/tracker/src/app/collections/collection-links.ts`. The pure function returns the SVG paths and dot positions. It draws nothing when the columns stack or no referenced collection card is present. Its fixed port offset, column inset, dot standoff, rounding and curve reach keep the lines aligned with the cards.

Explained in context: [`frontend.md`](frontend.md#collection-connector-links)

---

## D

### Dialog Config Submit

Dialog Config Submit is how the collection and bundle form dialogs submit a [Config Write](#config-write). `submitDialogConfigWrite()` in `apps/tracker/src/app/collections/store/dialog-config-submit.ts` sets `saving`, locks closing during the write, closes with the caller's saved result on success, and restores the previous close setting and `saving` on refusal. `NamedEntrySubmit` in the same module owns the server-taken-name validator, the create/update choice and rename patch, the editable-name conflict, and the localized refusal fallback for both forms. It returns a name conflict or a message with API details; each form renders that outcome in its own fields. `classifyConfigRefusal()` lives with the [Config Write](#config-write) in `config-write.ts`, which it classifies, and gives callers a `conflict`, `invalid`, or `other` refusal and preserves API details for every kind. The settings page uses that classification for preferred-terminology rule errors but owns its save subscription because it is a page and must keep saving after navigation.

Explained in context: [`frontend.md`](frontend.md#bundle-form-dialog)

---

## E

### Editor Advisories

The translation editor's advice rules in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-advisories.ts`. `EditorAdvisories.observe()` follows base-value and Similar Values streams until `destroy()`: typed text updates at once, preferred-term findings update after a 300 ms pause, and a failed rule-file load suppresses them. It holds pinned hits and their clear/loading/ready state, identifies a trimmed, case-insensitive exact match, and applies a preferred term through the form's normal value-change path. Its signals are read-only to the dialog. Pure tag suggestion filtering excludes the entry's own and inherited tags. The dialog keeps rendering and focus after Use.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Entry Form

The translation editor's typed form and [Resource Entry Draft](#resource-entry-draft) bridge in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-entry-form.ts`. `EditorEntryForm` seeds every non-base locale from the resource summary, gives missing metadata the domain's `new` status, publishes raw form snapshots, selects locales needing work with the domain status helper, and detects unsaved fields, folder or tag changes. It exposes tags for reading and owns `addTag` and `removeTag` through Tag List Edit. Its `draft(folderPath)` is the plain snapshot passed to [Editor Submit](#editor-submit). The dialog keeps the template bindings and UI focus.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Location

The translation editor's folder-selection state in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-location.ts`. It owns the selected folder, dotted-key continuation, known entries from the browser and [Folder Peek](#folder-peek), the live key collision and "Where it lands" tree, and the decision to peek an unknown target folder. An edit can peek its original folder or a destination; its own key is exempt from collision only in the original folder. The dialog keeps popover staging, filter and focus; [Editor Entry Form](#editor-entry-form) owns the form. [Editor Submit](#editor-submit) owns the save protocol.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Outcome

How the Tracker's translation editor closed: the one result its launcher reads. In code, the `EditorOutcome` union in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-submit.ts`, with five kinds: `saved` (an edit stayed in its folder), `moved` (an edit with a `moveTo`, with the new key and folder), `created`, `open-existing` (the key is taken and the user asked for the entry that holds it) and `cancelled` (no write, a dialog closed without a result, or an edit the server found nothing to change in). `saved`, `moved` and `created` carry the locales auto-translation skipped. `TranslationEditorLauncher` opens every create and edit (`openCreate`, `openEdit`, `openByFullKey`) and gives the feedback for each outcome: the toasts, and for `open-existing` the move of the list to the entry's folder and an edit of it, whose outcome the hand-off resolves with. The reload after a write is the store's, not the launcher's.

Explained in context: [`frontend.md`](frontend.md#the-editor-outcome)

---

### Editor Submit

The translation editor's save session in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-submit.ts`. `EditorSubmitSession` owns idle, missing-comment confirmation, key-conflict choice, writing and done phases. It ignores a trigger outside idle and remembers "Save Anyway" after a refused write. Writing and done both keep the dialog's busy indicator on until it closes. Injected functions provide the store writes and both prompts. The session returns an [Editor Outcome](#editor-outcome), a message decision or a focus decision. Message decisions carry [Outcome Feedback](#outcome-feedback), with the existing token, optional server-message detail, error tone, and inline placement. The dialog shows this feedback through `injectFeedback().text` and retains the existing focus behavior. An empty write or rejected prompt gives the unexpected message and restores idle. `submitEditor` builds the create or update request from the [Resource Entry Draft](#resource-entry-draft) and classifies API refusals. `submitGate` keeps the read-only, submitting, invalid-form, collision and comment order. `resolveDraftKey` in `resource-entry-draft.ts` trims the leaf for the preview, create request and conflict hand-off. [Editor Location](#editor-location) gathers known entries; `editor-entry-sources.ts` derives tag suggestions.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Entry Relocation

The one way [resource entries](#resource-entry) move between keys, inside a [collection](#collection) or into another one. The [Move Plan](#move-plan) supplies its key pairs and `sameCollection` fact. In code, `relocateEntries(plan, { override?, onMutation? })` in `libs/core/src/lib/resource/relocate-entries.ts` takes a plan with its source and destination collections, relocations, and `sameCollection` and returns `{ moved, collisions, errors }` and delivers changes to the sink. It moves them as one batch: each [Resource Folder](#resource-folder) involved is opened and saved once, and only after every folder it sends entries to, so a failed write leaves no moved entry lost (except inside a cycle of folders that swap entries). The copy is lossless (checksums and statuses are kept; nothing is auto-translated). One collision rule applies: a destination key held by an entry that is not moving away is a collision, unless `override` replaces it; a key the batch frees is free. An entry moved into another collection is fitted to its locales: locales the destination does not have are dropped, and missing ones are seeded as a `new` copy of the base (the [Locale Seeding](#locale-seeding) fallback). Both collections must have the same [base locale](#base-locale). `editResource` (`moveTo`), `moveResource` and `moveFolder` move through it.

Explained in context: [`core-library.md`](core-library.md#entry-relocation)

---

### Entry Writes

The Tracker UI's store feature for resource creation, updates, deletion and auto-translation. `withEntryWritesFeature` in `apps/tracker/src/app/browser/store/features/with-entry-writes.feature.ts` is a sibling of [Folder Writes](#folder-writes). Both features share the `Refusal` type and `refused()` normalizer in `store/write-refusal.ts`. Entry Writes blocks read-only delete and translate writes before HTTP.

Delete and translate return cold `Observable` outcomes with decided [Outcome Feedback](#outcome-feedback). These outcomes include `read-only`, `no-collection`, `stale-session` and `refused` with an `ApiError`. `requestEntryDelete(fullKey, confirm)` captures the [Browser Session](#browser-session), gives its guard to the caller's confirmation callback, and checks the session after confirmation.

The feature updates the folder list and search results only in the session where the write began. A stale delete or translate response gives no feedback. The list actions supply the existing dialog and show the decided feedback. They own the translating keys and row flash. Editor create/update retain API responses and raw errors for [Editor Submit](#editor-submit), including the 409 key-conflict flow. Editor Submit enforces read-only before these pass-through store methods.

Explained in context: [`frontend.md`](frontend.md#writing-a-resource-entry)

---

### Existence Policy

`addResource` and `addResources` refuse an existing resolved key by default with `ResourceAlreadyExistsError`. Pass `onExisting: 'replace'` to replace its translations and metadata. The check happens before locale seeding or any write. A batch checks every item before translating any of them; duplicate resolved keys within a batch are always refused. The API uses `fail`; the CLI uses `fail` unless `--override` is passed or an interactive user confirms replacement.

Explained in context: [`core-library.md`](core-library.md#add-resource)

---

### Export Run

One export of one or more [collections](#collection) to one file per target locale. In code, `runExport(collections, options)` in `libs/core/src/lib/export/run-export.ts` is the whole run: it validates the base property name, status filter, and output directory, resolves the output path from the explicit option, configured folder, or default, uses the [Collection Set](#collection-set) to choose locales (every collection's target locales, narrowed to the requested ones) and flatten resources, filters each collection's resources by status and tags for the locales it has, annotates [protected terms](#protected-term), writes the JSON or XLIFF files, and returns the totals, an outcome per locale, the [Run Outcome](#run-outcome), and the Markdown summary. An invalid or empty status filter raises `InvalidTranslationStatusError` before resources are read. An empty `locales` list means no target remains. It calls `onStart` with the resolved path and locales before reading resources, so the CLI can print the plan. Collections with targets must share one [base locale](#base-locale); otherwise the run raises `CollectionBaseLocaleMismatchError`. The CLI defaults are in `apps/cli/src/commands/run-option-defaults.ts` and prompt preselection is in `apps/cli/src/commands/export-cmd.ts`; a prompt answer with no selected collection, locale, or status is refused.

Explained in context: [`core-library.md`](core-library.md#export-pipeline)

---

## F

### Folder Address

A dot-delimited path to a folder in a [collection](#collection), such as `apps.common.buttons`. The empty address names the translations root. `lib/resource/folder-address.ts` validates each segment with the domain `isValidSegment` rule, resolves the address beneath the collection's `translationsFolder`, and checks whether that path exists. One shared segment check rejects symbolic links below the translations root. Walks return an unreadable problem; direct resolution raises `InvalidCollectionFolderError` with kind `invalid` (HTTP 400). Production Resource Folder opens also check the collection boundary before reading and saving. Folder create, delete and move decide whether the root is allowed and retain their own error labels; `createFolder` returns the resolved Folder Address as `folderAddress`, with a whitespace-only parent treated as the root; wildcard resource moves use key-style diagnostics for their prefix.

Explained in context: [`core-library.md`](core-library.md#resource-crud-flows)

---

### Folder Move Plan

The Tracker's pure store-side decision for a successful or failed folder move. In `apps/tracker/src/app/browser/store/folder-move-plan.ts`, `planFolderMove` receives the current tree and expansion plus the source node captured before HTTP, then returns expansion changes, the path to show, and either a tree patch with any destination-child load or a root reload. `planFolderMoveRollback` restores an absent source only when its parent is loaded. `withFolderWritesFeature` applies these decisions after its [Browser Session](#browser-session) guard; it still owns HTTP, loaders, navigation, and outcomes.

Explained in context: [`frontend.md`](frontend.md#optimistic-updates-with-rollback)

---

### Folder Peek

A read of one folder's entries without changing the [List Scope](#list-scope). `FolderPeek.openFolderPeek()` gives each translation editor dialog a scope with its own successful-read cache. A later dialog gets a fresh scope and fresh data. `openByFullKey` also opens a fresh scope for each hand-off. Concurrent scopes share an in-flight API request, but no completed result. A response from an earlier [Browser Session](#browser-session) is dropped; a failed read can be retried.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Folder Pruning

The one empty-folder removal rule, in `libs/core/src/lib/resource/folder-pruning.ts`: `pruneEmptyFolders(collection, { startPath?, dryRun?, onMutation? })`. It processes collection folders deepest first and never removes the translations root. A folder qualifies only after its subfolders disappear and only these files remain:

- `resource_entries.json` with zero entries (`{}`)
- Valid `tracker_meta.json`, only with absent or empty entries
- OS junk from `PRUNABLE_OS_JUNK_FILES`: `.DS_Store`, `Thumbs.db`, `desktop.ini`.

Other files, hidden directories, resource entries, and unreadable or malformed collection files protect the folder and its ancestors. Unlistable folders also stay. Pruning relies on the shared walk to reject symbolic links in the start path; it has no separate `lstat` loop. A rejected link stays with reason `problem`.

The result reports removed addresses, kept folders with reasons, and problems. Removal rechecks entries before deletes and unlinks `resource_entries.json` last, immediately before `rmdir`. Partial-removal problems name the deleted files. With a sink, each removal immediately emits a [Resource Mutation](#resource-mutation) (`remove-folder`). A dry run reports the same planned removals without writes or mutations.

Without locks, pruning can delete another writer's fresh `tracker_meta.json` before the entries recheck keeps the folder and reports a problem. The next normalize recomputes the metadata, so a `verified` status is not restored and becomes the recomputed status.

A supplied `startPath` includes the start folder and excludes its ancestors. Normalize uses the whole collection without a mutation sink. Folder move uses its source subtree and reports removals to its sink.

Explained in context: [`core-library.md`](core-library.md#folder-pruning)

---

### Folder Writes

The Tracker UI's one store feature for creating, deleting and moving folders, and for dropping a resource into a folder. `withFolderWritesFeature` in `apps/tracker/src/app/browser/store/features/with-folder-writes.feature.ts` returns a cold `Observable` of a typed outcome from each write. Its `requestFolderMove` entry point checks the drop, captures the [Browser Session](#browser-session), asks the caller to present confirmation when needed, and then moves the folder. `folder-drop.ts` is the pure rule shared by the sidebar drop targets and the write feature: it returns `canLand` for the CDK target and a separate no-op reason for a folder or resource dragged onto a folder path or the collection root. A folder can land on its current parent; Folder Writes then returns `already-at-location` so the sidebar shows its existing info toast. A resource at the collection root has `folderPath: ''` and can be dropped into a folder. The feature refuses every write in a read-only collection before HTTP and updates cached tree and rows only in the session where the write began. The [Folder Move Plan](#folder-move-plan) decides the tree, expansion, reload, navigation, and rollback effects of folder moves. A failed optimistic move restores only the moved item against current state when its parent is loaded; an unloaded parent gets its children on its next load, so a newer tree load survives. Deletion shows the parent only if the current folder is the deleted folder or one of its descendants. Every outcome carries the [Outcome Feedback](#outcome-feedback) it decided, so a caller renders it and decides nothing; folder writes do not set the shared load `error`. A create refusal reads inline, under the still-open input, in both the sidebar and the picker; a new folder is silent and an existing one toasts info. The sidebar's draft lives in this feature: `confirmFolderDraft` creates from it and closes it when the create ends (created, read-only, no collection). An inline refusal keeps it open and sits in the `folderCreateError` signal until the name is edited, the draft is cancelled or restarted, a create succeeds, or a [Browser Session](#browser-session) opens. The picker keeps an independent draft, because its modal dialog would otherwise open a second input in the sidebar behind it, and holds its own refusal; its `createFolder` never touches the store's draft. The pure `folder-draft.ts` module owns the whole lifecycle of both drafts. It manages identity, start, cancel, error dismissal, and create outcome settlement. The picker additionally closes its draft on a stale-session outcome. The store keeps only inline refusal feedback as the draft error. Toast refusals produce a toast and keep the draft open without an inline error. `requestFolderDelete` mirrors `requestFolderMove`: it asks the caller to confirm inside the session guard.

Explained in context: [`frontend.md`](frontend.md#optimistic-updates-with-rollback)

---

## I

### ICU Format

The [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) standard for representing locale-sensitive strings. LingoTracker stores translation values in ICU format internally. Simple placeholders use single braces: `Hello {name}`. Complex constructs use keyword-based syntax: `{count, plural, one {# item} other {# items}}`. The Resource Folder converts Transloco `{{ name }}` placeholders to ICU when it writes a base value, translation, or copied entry. Legacy values are converted only when their entry is written; opening or saving a folder does not normalize other entries. The conversion is idempotent, so an already-ICU value keeps its bytes and checksum. Import also converts before ICU validation and auto-fix.

During [bundle](#bundle) generation, simple `{varName}` placeholders are converted to Transloco's `{{ varName }}` syntax. Complex ICU constructs are passed through as-is because Transloco's messageformat pipe handles them natively.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`bundle-generation.md`](bundle-generation.md)

---

### Import Run

One file import into one locale of one [collection](#collection). `runImport(collection, { source, format?, locale, ...options })` in `libs/core/src/lib/import/run-import.ts` detects the format, reads JSON or XLIFF through its adapter, emits a large-source warning before the run header, applies the resources, and returns the result with a lazy `summary()` renderer. Source failures raise `ImportSourceError` before any resource write. `importResources(collection, resources, options)` remains the entry point for callers with parsed resources. It applies strategy defaults, reads the collection's [Project Terms](#project-terms), resolves Transloco references (migration only), normalizes and repairs placeholders, validates, and merges per [folder](#resource-folder). The session and CLI prompts share domain's `DEFAULT_IMPORT_STRATEGY` and import locale rule; the prompts use `importableLocales` for choices. The session and migration confirmations read defaults from the domain [Import Strategy Policy](#import-strategy-policy). `apps/cli/src/main.ts` leaves import strategy and update switches unset, and `apps/cli/src/commands/import-cmd.ts` passes omitted comment, tag, and create-missing switches as undefined, so `libs/core/src/lib/import/import-session.ts` applies the selected strategy's defaults. The CLI resolves an omitted `--preserve-status` to false before calling core. `apps/cli/src/commands/run-option-defaults.ts` supplies this value, the default strategy, and the base-validation default to both command resolution and help labels. Base-value validation stays on unless the user gives `--no-validate-base`. An `ImportSession` holds its settings, terms, changes, warnings, errors, and written files. A base-locale import without the migration strategy raises `InvalidImportLocaleError`.

Explained in context: [`core-library.md`](core-library.md#import-pipeline)

---

### Import Strategy Policy

The one place that defines what each [import run](#import-run) strategy means: `importStrategyPolicy(strategy)` in `libs/domain/src/lib/import-strategy-policy.ts`. Its frozen records hold creation, comment and tag defaults, base-locale permission, reference resolution, source-status preservation, and unchanged-value status and checksum rules. `statusOnUnchanged: 'untouched'` leaves update imports' unchanged values and metadata alone; `reconfirmsUnchanged` controls base-checksum refresh. `resolveImportStatus` handles both status fields exhaustively. `IMPORT_STRATEGIES` and `isImportStrategy` expose the table's valid keys; an invalid policy lookup throws. Core processing and CLI prompts consume the policy; domain reads no files.

Explained in context: [`core-library.md`](core-library.md#import-pipeline)

---

## J

### Job Registry

The API's in-memory runner for background jobs. Each `JobRegistry` instance owns a serial queue, UUID-keyed jobs, lifecycle timestamps, DTO snapshots, and eviction of finished jobs after 30 minutes or when a new job would exceed 100 retained jobs. Queued and running jobs remain until they finish, even above the cap. `BundleJobService` and `TranslationJobService` each have their own instance. Preconditions run synchronously before registration, and a failed run does not stop later jobs in that instance. Start returns the initial pending DTO snapshot. Lookup returns a fresh snapshot or raises API-local `JobNotFoundError` with kind `not-found`; an optional owner check hides another collection's job with the same 404 body as an unknown or evicted ID.

Explained in context: [`api.md`](api.md#translation-job-system)

---

## L

### List Edit Merge

`listEditProblem()` and `mergeListEdit()` in `libs/domain/src/lib/list-edit.ts` provide the shared add, remove and set rules for collection tags and protected terms. Every list is an array of strings. Core maps a missing or conflicting edit to a typed, flag-free error; the CLI checks its own flag combinations before calling core. Each caller supplies its own normalization: tags use `normalizeTags()`, while protected terms keep case and punctuation with `normalizeProtectedTerms()`.

Explained in context: [`core-library.md`](core-library.md#project-terms), [`domain-and-data-model.md`](domain-and-data-model.md#protected-terms)

---

### List Scope

What the Tracker's translation list shows, and the only loader of its rows. In code, `withListScopeFeature` in `apps/tracker/src/app/browser/store/features/with-list-scope.feature.ts`, a feature of `BrowserStore`. The scope is a folder or a search query (`ListScope = { kind: 'folder'; path } | { kind: 'search'; query }`). Other code asks it to `showFolder(path)`, `showQuery(query)`, `clearSearch()` (back to the folder behind the search, loaded again only when its rows are not that folder's; a no-op when no search is shown) or `reloadList()`. Only the List Scope writes `currentFolderPath`, the busy flag `isListLoading` (of which `isTranslationsLoading` and `isSearchLoading` are readings) and its own error `listError`, and only it loads the rows (`translations`, `searchResults`); entry writes and moves patch the loaded rows in place. Every load runs through one `switchMap`, so a newer scope cancels an older load, and the [Browser Session](#browser-session) cancels it on every open, which also stops its not-ready retries. One failure rule (`handleLoadFailure` in `store/load-failure.ts`, which the folder tree's loads share): when the index is not ready and a list has already loaded in the session, the list goes back to the last scope that loaded (`shownScope`, whose rows are the ones on screen) and a toast gives the reason; any other failure, a search's included, is `listError`, which no other load can clear, shown with a Retry that loads the same scope again. `isDisabled` (folder navigation locked) is derived: a search is shown, or a move is in flight.

Explained in context: [`frontend.md`](frontend.md#list-scope--what-the-list-shows)

---

### Locale Metadata

The per-locale record stored within [`tracker_meta.json`](#tracker-metadata) for each [resource entry](#resource-entry). Defined by the `LocaleMetadata` interface in `@simoncodes-ca/domain`:

```typescript
interface LocaleMetadata {
  checksum: string;        // MD5 of this locale's current value
  baseChecksum?: string;   // MD5 of the base locale value at write time (non-base locales only)
  status?: TranslationStatus; // absent for the base locale
}
```

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md)

---

### Locale Seeding

What each of a [collection's](#collection) target locales gets when a resource's base value is written: the translation the caller supplied, else an auto-translation from the [Translator](#translator) when the collection enables it, else (or when the Translator skipped the locale) a copy of the base value with status `new`, except that on edit a real translation is kept (and is `stale`). In code, `seedLocales(collection, request)` in `libs/core/src/lib/resource/locale-seeding.ts`. `addResource` applies it to every target locale; `editResource` applies it after a base value change, to the locales that need work by the [staleness rule](#staleness-rule), and never replaces a real translation with a copy. A locale that is missing from a stored entry gets the same fallback, a `new` copy of the base, from the [Resource Folder](#resource-folder)'s `seedLocale`, which add-locale, edit-collection and normalize share. The API, the CLI and the Tracker do not decide this themselves.

Explained in context: [`core-library.md`](core-library.md#locale-seeding)

---

### Locale Selection

The one pure value for density, the locale filter and the remembered compact locale in the Tracker (`apps/tracker/src/app/browser/store/locale-selection.ts`). Its transitions select locales, switch density and restore saved preferences; its projections give the locales and filter label to show. Entering compact remembers the full selection; leaving restores it unless the user changed the compact selection. The default compact locale is the available base locale, else the first available locale. The filter and view-preferences features read and patch this value; persistence stays in the view-preferences feature. Repeating the current density is a no-op, preserving the multi-selection across compact → compact → full.

In compact, select-all and clear-all change only the filter; restoration keeps the remembered `compactLocale` even when it displays a fallback. For an empty collection, compact display falls back to the base locale string while restoration selects nothing.

Explained in context: [`frontend.md`](frontend.md#browserstore--feature-composition)

---

## M

### Move Plan

The pure move decision before [Entry Relocation](#entry-relocation). `planMove({ source, destination, selection, destinationPath })` in `libs/core/src/lib/resource/move-plan.ts` compares resolved translations roots without filesystem calls. The source and destination are opened collections. A resource selection returns an `entries` plan with both collections, relocations, and `sameCollection`. A folder selection returns a `folder` plan with only `forKeys(keys)`, or a `refused` result.

Folder refusals are `descendant`, `same-location`, and `already-there`, and apply only within the same collection. Each refusal supplies `warning()`, which returns the existing warning or throws `FolderMoveIntoDescendantError` for a descendant. `moveFolder` calls this method before filesystem reads and does not interpret the refusal reason. The error constructor is the single source of the descendant message. Domain supplies the browser-safe `isDescendantFolderPath(source, destination)` predicate for both Move Plan and the Tracker folder-drop rule.

The selection names a resource key, a pattern prefix with keys, a folder path with nest mode, or an edited entry. A folder plan maps keys that the caller enumerates after the move decision. Its `forKeys(keys)` returns an `entries` plan bound to the same collections and `sameCollection` fact. Folder moves nest by default and always nest at the collection root. With `nestUnderDestination: false`, a destination at the same depth renames the folder, and a different depth nests it. An edited entry with an empty or whitespace-only destination moves to the collection root.

`moveFolder`, `moveResource`, and `editResource` pass the bound plan to Entry Relocation. `moveResources` uses the same interface through `moveResource`. Cross-collection moves take a plain `toCollection` name. Core resolves the destination through `config` and optional `cwd` before the move decision. A missing or read-only destination throws a typed error for a single move.

Explained in context: [`core-library.md`](core-library.md#move-plan)

---

### Mutation Sink

`MutationSink` and `MutationSinkOptions` in `libs/core/src/lib/resource/resource-mutation.ts` define the synchronous `onMutation` callback. An opened `Collection` carries an optional default sink, supplied to `openCollection` alongside `writable`. Core writes with mutation consumers use the one `resolveMutationSink(collection, options)` rule: `options.onMutation ?? collection.onMutation`. Explicit callbacks still win, including CLI callers. A single [Resource Entry](#resource-entry) reports through it with `save(onMutation)`. The API attaches `CollectionIndex.sink` when opening writable route collections and collection update/delete handles. The translation job service inherits the sink from the writable route collection. The sink applies each mutation and never throws into the write.

---

## O

### Opened Project

An `OpenedProject` is the config as `loadConfig()` read it (`sourceConfig`) and its directory (`projectRoot`). The API builds one through `ConfigService.openProject()` for each request; the CLI runner builds one after loading config for each command. Every config write uses `guardedConfigWrite(openedProject)` and refuses a stale read with `ConfigChangedError`. An in-memory config without a read version is used only by tests and cannot be checked.

---

### Outcome Feedback

What a write has decided to tell the user about its outcome: the `Feedback` in `apps/tracker/src/app/browser/feedback.ts`, `{ tone: 'success' | 'info' | 'warning' | 'error', placement: 'inline' | 'toast', token, params?, detail? }`. `token` is a Transloco token, `params` can hold `{ token }` values that are themselves translated (the root folder's label), and `detail` is the failure's own message, which replaces the token's wording. It is plain data produced by pure mappings, so no TestBed is needed to test the choice: `decide*` in `store/folder-write-feedback.ts` for [Folder Writes](#folder-writes) (a `feedback` on each outcome, `null` when the write is silent), and `decideDeleteResource` / `decideTranslateResource` in `store/resource-write-outcome.ts` for [Entry Writes](#entry-writes) (a translate carries an array of feedback for its success and skipped-locales warning). Editor Submit message decisions also carry this feedback, chosen by `refusalDecision` with error tone and inline placement. Surfaces render it with `feedbackText` or `injectFeedback()` (`text`, and `toast`, which ignores inline feedback).

Explained in context: [`frontend.md`](frontend.md#optimistic-updates-with-rollback)

---

## P

### Preferred Terminology

A global list of rules. Each rule maps a **discouraged** source-language term to the **preferred** term, with an optional `reason`. LingoTracker warns when a base-locale value uses a discouraged term, and suggests the preferred one. It never blocks. Only an unreadable rule file fails `validate`.

The rules are project configuration rather than resource data. They live in a standalone JSON file, a bare array of rule objects. `.lingo-tracker.json` names that file with `preferredTerminologyFile`. Omit the setting and the rules fall back to `.lingo-tracker-preferred-terminology.json` beside the config. Collections cannot override the rules. Core reads the file as a term file (`lib/config/term-file.ts`, shared with the protected-terms files): a missing default file is an empty list, a missing named file is a warning, a file that exists but cannot be used (malformed JSON, the wrong shape, an invalid rule) is an error and reads as empty. Nothing is thrown; the problem travels with the [Project Terms](#project-terms) to whoever ran the check.

Matching is case-insensitive and whole-word, and it covers only the text a reader sees. ICU arguments and selectors, Transloco placeholders, and tags are skipped. The pure rule and matching functions live in `libs/domain`, so the Tracker UI and core share them.

The check runs in core, where the value is stored: `addResource` and `editResource` (on a supplied base value) return `terminology` (`findings`, one per rule the value breaks, and the rule-file `problems`); an [import run](#import-run) into the base locale adds one warning per finding and opens its warnings with a rule-file problem; `validateResources` reports findings as warnings and a broken rule file as a failure. The CLI and the API only render what core returned.

Contrast with [Protected Term](#protected-term), which keeps a word unchanged in translations and blocks imports that alter it.

Explained in context: [`docs/features/preferred-terminology.md`](../docs/features/preferred-terminology.md)

---

### Preferred Terminology Draft

`PreferredTerminologyDraft` in `apps/tracker/src/app/settings/preferred-terminology-draft.ts` stages settings-page rule edits. It owns rows, normalization, client validation, error visibility, change counts, and mapping server rule-error indexes back to submitted rows. It has no API dependency; [Settings Draft](#settings-draft) owns the Config Write.

Explained in context: [`frontend.md`](frontend.md#protected-terms-in-the-ui)

---

### Project Terms

The terms and rules in force for an opened [collection](#collection): its [protected terms](#protected-term) (the global list united with the collection's own) and the project's [preferred terminology](#preferred-terminology). In code, `readProjectTerms(collection)` in `libs/core/src/lib/config/project-terms.ts` reads the files `openCollection` resolved into `Collection.termFiles` and returns `ProjectTerms`: `protectedTerms`, `preferredTerminology`, `problems` (every term file that is named but missing, a warning, or exists but cannot be used, an error) and `checkBaseValue(key, value)`, the advisory terminology check of a stored base value (its findings, and the rule-file problems that limited it). Opening a collection reads nothing; each operation reads the Project Terms once, and nothing is cached, so a long-running API sees a hand edit or `git pull` on its next request. Reading never throws. A consumer that guards values with the protected terms and has no advisory channel asks for `requireProtectedTerms(terms)`, which throws `ProtectedTermsFileError` for a broken protected-terms file: the [Translator](#translator) when it opens, and the [import run](#import-run) before it writes. The Translator reports a missing named protected-terms file in its `problems`. Every other consumer reports the problems: `addResource` and `editResource` in their `terminology` result, import in its `warnings`, export in its `warnings` and, for a broken protected-terms file, its `errors` (the command exits 1), `validate` as printed warnings and, for a broken rule file, a failure. The two file kinds share one term-file module (`term-file.ts`: pointer resolution, the missing-file rule, the read that reports instead of throwing, the write with typed errors); each kind adds only its item check and its serialization. Direct writes of the global lists go through [Project Terms Update](#project-terms-update).

Explained in context: [`core-library.md`](core-library.md#project-terms)

---

### Project Terms Update

`planProjectTermsUpdate(project, update)` in `libs/core/src/lib/config/update-project-terms.ts` validates structured protected-term and preferred-terminology edits once, reports invalid combinations through a machine-readable `problem` on `InvalidProjectTermsEditError`, and returns a read-only `view` and `apply()`. The CLI checks whether its preferred-terminology flags form a complete upsert, then shows the view and applies the plan. `updateProjectTerms` plans and applies in one call for the API. The plan resolves the pointer, term paths, and preview once. Apply uses those resolved values and writes the pointer before the term edit. The separate pointer setters are gone. It saves the exact previous bytes of changed term files. On failure, it restores those files and reverts only its pointer key if that key still holds the new value, preserving unrelated config edits. The original error keeps its type and message if a restore fails, with the restore failure attached as its cause. The API keeps its config update success message.

Explained in context: [`core-library.md`](core-library.md#project-terms), [`api.md`](api.md#endpoint-reference), [`cli.md`](cli.md#protected-terms-scoping)

---

### Protected Term

A word that must stay unchanged through translation. A brand name, a product name, or a piece of jargon all qualify. `iPhone` stays `iPhone` in every locale.

Protected terms are project configuration rather than resource data. Nothing about them reaches `resource_entries.json` or `tracker_meta.json`.

The list lives in a standalone JSON file, which holds a bare array of strings. `.lingo-tracker.json` names that file with `protectedTermsFile`. Omit the setting globally and the list falls back to `.lingo-tracker-protected-terms.json` beside the config. A [collection](#collection) may name a file of its own, and LingoTracker adds those terms to the global ones. A collection has no default file.

Example file:
```json
[
  "Acme",
  "C++",
  "iPhone",
  "Node.js"
]
```

A term matches only as a whole word. LingoTracker uses the list in three places. Export marks each string with the terms found in its source, as a `doNotTranslate` array in JSON and as a `Do not translate:` note in XLIFF. Import rejects any translation that omits a term present in the source. The [Translator](#translator) skips (does not store) a machine translation that omits one. All three read the terms in force for a collection as its [Project Terms](#project-terms); nobody passes the list in. `readProtectedTermsTarget()` reads the stored scope through `readGlobalProtectedTerms` / `readCollectionProtectedTerms`, which return `terms` (and a warning for a missing named file) and throw `ProtectedTermsFileError` for a malformed file. The config endpoint sends edits to core `updateProjectTerms()`, which checks an untyped list before it writes.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md#protected-terms), [`core-library.md`](core-library.md#project-terms)

---

### Protected Term Add

`prepareProtectedTermAdd(existing, input)` in `apps/tracker/src/app/shared/protected-terms/protected-term-add.ts` normalizes a newly entered term with the domain rule and checks exact, case-sensitive duplicates. It returns `blank`, `duplicate`, or `added` with the normalized term. The settings draft and collection chips use this one add rule.

Explained in context: [`frontend.md`](frontend.md#protected-terms-in-the-ui)

---

### Protected Terms Draft

`ProtectedTermsDraft` in `apps/tracker/src/app/shared/protected-terms/protected-terms-draft.ts` stages protected-term edits for Settings. It uses the shared add rule and domain normalization, and owns removed and restored rows, rename status, filtering and reveal requests, change counts, and the sorted save list. It has no API or DOM dependency; Settings owns scrolling and [Settings Draft](#settings-draft) owns the Config Write.

Explained in context: [`frontend.md`](frontend.md#protected-terms-in-the-ui)

---

### Public Surface

The names a library's `index.ts` barrel exports — everything a caller must know to use it. The `domain` and `core` barrels list their exports by name, never with `export *`. They list only names that something outside the library uses, plus the types those names' signatures need. A helper that only its own library uses stays exported from its file but not from the barrel. `libs/domain/src/index.spec.ts` pins domain's runtime exports, so adding one is a deliberate change.

Explained in context: [`monorepo-structure.md`](monorepo-structure.md#public-surface), [`core-library.md`](core-library.md#public-surface)

---

## R

### Rename Target

The name that a collection or bundle update uses. The shared core rule `resolveRenameTarget(current, requested)` resolves it. An omitted name keeps the current name. The rule trims a supplied name and throws `InvalidNameError` if the result is blank. It returns `{ target, isRename }`. `isRename` is true only when the target differs from the current name.

Explained in context: [`core-library.md`](core-library.md#bundle-definition)

---

### Resolved Key

The fully qualified dot-delimited key after combining an input key with an optional [target folder](#target-folder). Resolution is additive: `resolvedKey = targetFolder + "." + key` (or just `key` if no target folder is specified).

Example: key `ok` with target folder `apps.common.buttons` resolves to `apps.common.buttons.ok`.

The resolved key determines the filesystem path: `apps/common/buttons/` folder, entry key `ok` in `resource_entries.json`.

Explained in context: [`libs-domain.md`](libs-domain.md)

---

### Resource Batches

Core owns writes of many resource entries. `addResources(collection, items)` checks every item for malformed keys and folder addresses, unknown locales, duplicate or existing resolved keys, and unreadable folder JSON before it translates any item. Translation failures also stop the batch before any write. Preflight reads folders but does not create them or check whether a later filesystem write can succeed. It rejects duplicate resolved keys within the batch with `ResourceAlreadyExistsError`; an existing exact key is refused unless `onExisting: 'replace'` is passed. Parent/child keys remain allowed at add time and may later appear as bundle-plan hierarchical conflicts. It then writes in input order and returns created count, deduplicated skipped locales and terminology problems, all findings. A filesystem write failure after preparation (for example, an existing file in the folder path or a permissions failure) can leave earlier entries, or one of the failing folder's two JSON files, on disk; there is no rollback, but earlier items were already delivered through the [Mutation Sink](#mutation-sink). A failed folder save delivers `reindex`. `moveResources(collection, ops, { config, cwd?, onMutation? })` runs each move in order through the same destination resolution as a single move. Missing and read-only destinations are typed errors at that boundary; the batch records their messages for the affected operation and continues. The optional `cwd` resolves relative destination paths. API batches inherit `CollectionIndex.sink` from the opened source collection; the sink receives changes to both source and destination folders.

Explained in context: [`core-library.md`](core-library.md#resource-batches), [`api.md`](api.md#resources)

---

### Resource Entry

A single translatable string identified by a [resource key](#resource-key). Stored as one JSON property in a `resource_entries.json` file. A resource entry contains:

- `source` — the base locale value (the source text)
- locale keys (e.g. `"es"`, `"fr-ca"`) — translation values
- optional `comment` — context for translators
- optional `tags` — string array for filtering during bundle/export

Example:
```json
{
  "title": {
    "source": "Delete Resource",
    "comment": "Title of the confirmation dialog",
    "tags": ["browser"],
    "es": "Eliminar recurso",
    "fr-ca": "Supprimer la ressource"
  }
}
```

Core opens one entry by full key against an opened [Collection](#collection) with `openResourceEntry(collection, key, { targetFolder? })` in `libs/core/src/lib/resource/resource-entry.ts`. It validates the key, resolves the folder, and opens the [Resource Folder](#resource-folder) with the collection's base locale. It exposes `exists()`, `get()`, and the folder. Its `save(onMutation)` reports through the [Mutation Sink](#mutation-sink): `upsert` after a write, `remove` after a removal. On a failed save, it reports `reindex` and rethrows the error. Add, edit, delete, and translate-existing open entries this way.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md)

---

### Resource Entry Draft

The translation editor's view of the [resource entry](#resource-entry) it is writing, as plain data: entry key, target folder, base value, comment, tags, and one value and status for each non-base locale. The pure module `apps/tracker/src/app/browser/dialogs/translation-editor/resource-entry-draft.ts` holds the editor's rules for a draft: dotted-key absorption, key collision, the "Where it lands" tree, tag edits, the create and update DTOs, and the unsaved-work check. It uses the domain's missing-metadata status default. The module has no Angular dependency.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Resource Folder

One folder of the translation hierarchy, seen as a unit: its `resource_entries.json` ([resource entries](#resource-entry)) and `tracker_meta.json` ([tracker metadata](#tracker-metadata)) are always read and written together. In code, `openResourceFolder(folderPath, { baseLocale })` returns a `ResourceFolder` (`libs/core/src/lib/resource/resource-folder.ts`); the collection's base locale is required, so checksums use the right locale bucket. Every core operation that changes resources goes through it. Single-entry operations open it through the [Resource Entry](#resource-entry). Batch callers group or open folders by full key through `folder-batch.ts`; they do not handle file paths. Whole-collection reads go through it too, by way of the [Collection Reader](#collection-reader), and writes over many folders by way of the [Collection Sweep](#collection-sweep). It converts incoming locale values to [ICU](#icu-format) when an entry is written, computes checksums and applies the [staleness rule](#staleness-rule); opening or saving a folder does not rewrite other legacy entries. No caller builds `{ checksum, baseChecksum, status }` itself. Its operations: `setBase` (the staleness rule on a base change), `setTranslation`, `setStatus`, `setDetails`, `setEntry` (copy/replace with ICU normalization: move, rename, add-resource reset after its existence policy allows replacement; with `targetLocales`, for an entry moved into another collection, it drops the other locales and seeds the missing ones by the `seedLocale` rule), `seedLocale` (the one seeding rule: a missing locale becomes a copy of the base with status `new`, for add-locale and normalize), `dropLocale`, `remove`, and `normalizeEntry(key, targetLocales)`, [normalize's](core-library.md#normalization-pipeline) write path: it converts each stored value once, normalizes tags and returns `valuesConverted`, `tagsNormalized`, `localesAdded` and `changed`. It drops a stray base-locale property, re-records every target-locale translation with a current checksum and its stored status (a translation whose stored `baseChecksum` differs from the base checksum becomes `stale`, see [staleness](#staleness)), puts a changed base through the staleness rule and seeds the missing target locales. Locales outside the collection keep their values and metadata unless ICU conversion changes a value's checksum. `hasMissingFiles()` reports whether either file was missing when opened or after the last non-dry save; file paths remain private. One rule holds everywhere: a locale value with no metadata counts as `new`, in the reader, in validate and after normalize.

Explained in context: [`core-library.md`](core-library.md#resource-crud-flows)

---

### Resource Key

A dot-delimited string that uniquely identifies a [resource entry](#resource-entry) within a [collection](#collection). Segments may contain only alphanumeric characters, underscores, and hyphens (`[A-Za-z0-9_-]`).

Example: `apps.common.buttons.ok`

All segments except the last define the folder hierarchy on disk; the last segment is the entry key within `resource_entries.json`. See also [resolved key](#resolved-key).

Explained in context: [`libs-domain.md`](libs-domain.md)

---

### Resource Mutation

One change that a core write made to a translations folder: `upsert` (key and stored entry), `remove` (key), `add-folder` / `remove-folder` (path), or `reindex` (a broad or uncertain change). Each carries the absolute `translationsFolder` it applies to. Writes deliver mutations synchronously through `onMutation` as the disk changes; no write returns `mutations`. `saveReporting` sends the saved mutation after a successful Resource Folder save and a `reindex` if the save throws after it may have written one JSON file. `translateLocale` sends a `reindex` after every folder save attempt. With a sink, [Folder Pruning](#folder-pruning) sends `remove-folder` immediately after each removal. Folder move supplies a sink for the API Collection Index. Normalize has no mutation sink. Dry runs send no mutations. Writable API collections carry `CollectionIndex.sink` as the default callback. The type and helper are in `libs/core/src/lib/resource/resource-mutation.ts`.

Explained in context: [`api.md`](api.md#writes-resource-mutations)

---

### Resource Search

The one matcher over a [collection's](#collection) resources. In code, `searchResources(resources, collection, query, { mode, limit })` in `libs/core/src/lib/resource/search.ts`. It reads any iterable of `{ fullKey, entry }`: the [Collection Reader](#collection-reader)'s `resources` for the disk, or `treeResources(tree)` for the [Collection Index](#collection-index) tree. It is pure, so the reader's problems are the caller's to report. `normalizeSearchRequest(request, defaultLimit)` trims the query, reports a single `blank` outcome, defaults invalid limits and caps every limit at 500. The API passes default 100; the CLI passes default 5. The API controller maps its `similar` DTO mode to core's `similar-value` before normalizing. It ranks every match before applying `limit`, so a better match is never lost because it was found late. `searchPage(resources, collection, request)` returns the page, `limited`, and the true `totalFound` counted before slicing. A blank query returns nothing; matching is case-insensitive. Text mode (the default) looks in the full key, the base value (always, under the collection's [base locale](#base-locale)) and every translation. Each hit gets one match type, the key first: `exact-key`, `partial-key`, `exact-value`, `partial-value`. They rank in the order exact-key, exact-value, partial-key, partial-value, then key. Similar-value mode compares the query with the base value only. A value matches when its `normalizedLevenshtein` score is at least 0.8 (`save` / `saved`), or when one text contains the other as whole words (`Save` / `Save draft`) with a score (`shorter / longer` length) of at least 0.4 (`CONTAINMENT_MIN_SCORE`), so a short label inside a long sentence does not count. A fragment inside a word does not count either (`connect` in `connection`, `don` in `don't`: apostrophes are word characters). Hits rank by `similarity`, then a key that contains the query, then key, with `matchType: 'similar-value'`. The API's `CollectionIndex.searchPage` (`GET …/resources/search`, `mode=text | similar`) and the CLI `find-similar` use it. The Tracker's "Similar values" block asks the API for similar mode.

Explained in context: [`core-library.md`](core-library.md#resource-search), [`api.md`](api.md#collection-index)

---

### Resource Summary

One [resource entry](#resource-entry) as the API and the Tracker see it: an explicit address — `fullKey` (`apps.common.buttons.ok`), `folderPath` (`apps.common.buttons`, `''` at the root) and `entryKey` (`ok`) — the base locale and value, and one row per target locale of the [collection](#collection), in collection order, with `value`, `status`, `needsWork` (the [staleness rule](#staleness-rule)'s `needsTranslation`) and `sameAsBase` (`isUntranslatedCopy`, compared trimmed). The base locale and target locales come from the opened `Collection`, never from the metadata. In code, `buildResourceSummary(fullKey, entry, collection)`, `summaryTarget(summary, locale)` and `displayStatus(target)` in `libs/domain/src/lib/resource-summary.ts`; `ResourceSummaryDto` in `data-transfer` is the same type. The Tracker's pure `row-view.ts` turns a summary into what one list row shows.

Explained in context: [`api.md`](api.md#mapper-layer), [`frontend.md`](frontend.md#translation-rows-and-the-row-view)

---

### Route Collection

The API parameter seam for resource, folder, and locale routes. `@RouteCollection()` supplies the `Collection` opened by `RouteCollectionPipe` from the already-decoded `:collectionName` param. The pipe reads config once and retains that snapshot on the opened collection for locale writes, requires writable access for methods other than `GET` by default, attaches `CollectionIndex.sink` to writable handles, and maps missing or read-only source collections to Nest 404 or 403 exceptions. This is the route source rule: the HTTP contract spec runs without `APP_FILTER`, so the pipe must return its own HTTP body. Move destinations follow one separate core rule; core resolves the plain `toCollection` name, and the app filter maps its typed errors. Collection registration routes do not use it. The Tracker encodes names once in API URL path segments; its router also encodes navigation segments, and `TranslationBrowser` uses the decoded route name directly.

Explained in context: [`api.md`](api.md#component-diagram), [`frontend.md`](frontend.md#route-structure)

---

### Run Options Resolution

The pure CLI step that builds missing-option questions from flags and resolves the runner's merged answers and defaults to options for an [Export Run](#export-run) or [Import Run](#import-run). Export also returns advisories for the command to print on stderr. In code, `apps/cli/src/commands/export-options.ts` and `import-options.ts` own the option dependencies. Their question callbacks use the flag-over-answer merge in `commands/run-option-defaults.ts`; the [Command Runner](#command-runner) merges submitted answers over flags before final resolution. Export's table controls JSON question visibility and uses `EXPORT_DEFAULTS`. Its resolution rejects an empty status list before the core call and advisories; unknown statuses remain core's responsibility. Import uses `IMPORT_DEFAULTS` and the [Import Strategy Policy](#import-strategy-policy) for locale choices and migration prompt initials; unset strategy switches remain undefined for core to default. [Selection](#selection) validation preserves export's collection → locale → status error order before the runner looks up collection names. The commands own I/O and rendering; core still validates run preconditions.

Explained in context: [`cli.md`](cli.md#command-inventory)

---

### Run Outcome

Core's `RunOutcome` is `succeeded` or `failed`. Its producers are `runExport`, `runImport`, `translateLocale`, `runValidate`, `generateBundles`, `generateBundle`, `generatePreparedBundle`, `moveResource`, `moveResources`, `moveFolder`, and `normalizeCollections`. The CLI maps completed outcomes to exit codes through `exitForRunOutcome`. A `failed` outcome gives exit code 1, even with partial output. A warning or intentional skip alone does not fail a run. Preconditions that throw have no run outcome.

Move fails when its result contains errors. Normalize fails when a collection raises an error, including in dry runs. Folder problems and read-only skips under `--all` do not fail normalize. Export ignores errors and hierarchical conflicts in a dry run. Import counts failed resources and errors even in a dry run. Bundle generation reports outcomes per bundle and fails the whole run on a thrown bundle error or failed type generation.

Explained in context: [`core-library.md`](core-library.md), [`cli.md`](cli.md#errors-and-exit-codes)

---

### Run Summary Writer

The CLI utility `reportRunSummary(kind, summary, { dryRun })` in `apps/cli/src/utils/write-run-summary.ts` owns both persistence and announcement of the import or export run's Markdown summary at a temporary path (`writeRunSummary` does the write). Core supplies the text through import's lazy `summary()` or export's `summary`. A real run writes and prints `<Kind> summary written to: <path>`; a failed write only warns and never changes the exit code, which comes from the run outcome. A dry run writes nothing and prints `<Kind> summary would be written to: <path>`; export passes `previewOnDryRun` and also prints the summary text as its only preview, while import renders nothing.

Explained in context: [`cli.md`](cli.md#shared-utilities), [`core-library.md`](core-library.md#import-pipeline)

---

## S

### Selection

The CLI choice of one, several, or all named items. `Selection` in `apps/cli/src/utils/prompt-utils.ts` has `kind: 'all'` or `kind: 'some'` with `names`. `selectionPrompt` builds the question with an explicit single or multiple mode. `parseNameSelection` retains literal flags, while `parseListSelection` parses comma-separated flags. Both functions resolve prompt answers, give flags precedence, and return `undefined` for empty input.

Commands apply their own defaults and errors. The prompt sentinel stays private to this module. For many collections, the [Command Runner](#command-runner) passes the resolved Selection and opened collections to `run`.

Explained in context: [`cli.md`](cli.md#selection-prompt-utilsts)

---

### Settings Draft

`SettingsDraft` in `apps/tracker/src/app/settings/settings-draft.ts` composes the protected-terms and preferred-terminology drafts. It owns the combined change count, save gate, revert, reseeding, and one [Config Write](#config-write) through a write function supplied by the page. `save(write)` records submitted rule rows when it builds the payload and emits `saved`, `blocked`, `refused`, or `unchanged`; a refusal maps valid rule errors onto the submitted rows. The page owns focus, the banner, and the toast. Both child drafts remain free of API dependencies.

Explained in context: [`frontend.md`](frontend.md#protected-terms-in-the-ui)

---

### Similar Values

The translation editor's suggestions for a typed base value. `SimilarValues` waits 300 ms after an eligible edit, then asks [Resource Search](#resource-search) for similar-mode results. It removes the entry being edited and keeps at most 10 hits. Changing the value clears old hits; a value under three characters cancels the pending search. An API failure yields an empty list. The lookup is scoped to the [Browser Session](#browser-session).

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Staleness

The condition where a translation's `baseChecksum` no longer matches the [base locale](#base-locale)'s current [checksum](#checksum). This means the source text changed after the translation was written, so the translation is out of sync. A stale resource carries `status: "stale"` in its [locale metadata](#locale-metadata) and will fail CI validation by default.

Staleness is detected automatically during resource reads — no explicit re-scan is required.

Normalize makes the condition explicit. A target translation whose stored `baseChecksum` differs from the base checksum (for example after a git merge, where one branch changed the base and another verified the translation) becomes `stale` and gets the current `baseChecksum`. A translation whose value is a copy of the base becomes `new`, and a `new` translation stays `new`. Normalize does not erase the signal by re-recording the translation with its old status.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`core-library.md`](core-library.md)

---

### Staleness Rule

The domain module `libs/domain/src/lib/staleness.ts` holds both parts of this rule. `applyBaseChange` sets a translation to `stale` when the base value changes. It sets an identical copy to `new`. When a writer omits the status, `recordTranslation` stores `new` for a copy of the base or `translated` for a different value. It keeps every explicit status, including `translated`. [Resource Folder](#resource-folder) applies these rules through `setBase` and `setTranslation`. The module also holds `needsTranslation`; the [Import Strategy Policy](#import-strategy-policy) owns `resolveImportStatus`. `needsTranslation` uses the [translation status](#translation-status) module's `isNeedsWorkStatus` predicate for stored statuses and treats missing metadata as work.

Explained in context: [`core-library.md`](core-library.md#resource-crud-flows)

---

## T

### Tag List Edit

The pure Tracker helper in `apps/tracker/src/app/shared/tag-list-edit.ts` adds a normalized, deduplicated tag or removes all matching tags. An empty or duplicate add returns the original list. Resource-entry removal passes inherited tags so those stay in place; collection and bundle editors remove their own tags without that option. For collection registrations, `editCollectionTags` in `libs/core/src/collections-manager/edit-collection-tags.ts` takes a domain `ListEdit`: `set` is an array of tags, or `add` and `remove` are arrays. The CLI splits the comma-separated `--set-tags` value and owns flag-combination wording. Core normalizes tags and raises typed, flag-free `InvalidCollectionError` with a `problem` for a conflicting or missing edit. The CLI maps the problem to its flag wording.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft), [`frontend.md`](frontend.md#bundle-form-dialog)

---

### Tags

String labels that can be attached to [resource entries](#resource-entry) (stored in `resource_entries.json`) or to an entire [collection](#collection) (stored in `.lingo-tracker.json`). Tags are used to filter resources during bundle generation and export/import.

**Per-resource tags** — stored as `tags?: string[]` on each resource entry. Set via `add-resource --tags`, `edit-resource --tags`, or the Tracker UI chip input.

**Collection-level (inherited) tags** — declared as `tags?: string[]` on the collection config. Every resource in the collection inherits these tags at read time without them being written to `resource_entries.json`. The merge rule is: `effectiveTags = union(collectionTags, resourceTags)` (deduped, normalized). This is implemented in `libs/domain/src/lib/effective-tags.ts`.

Inheritance is:
- **Additive only** — no negative/override syntax. To exempt a resource from a tag, move it to a different collection.
- **Not stored in bundle files** — the destination collection's own config re-applies its tags on import.
- **Visible in the Tracker UI** — inherited tags are shown as dashed-border chips with a tooltip; they cannot be removed per-resource.

Tag normalization: lowercase, hyphens replace spaces, non-`[a-z0-9-]` stripped, max 50 chars.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`cli.md`](cli.md), [`api.md`](api.md)

---

### Target Folder

An optional dot-delimited path prefix that scopes an input [resource key](#resource-key) to a specific folder within the collection's translation hierarchy. Used when a resource is created (`addResource`, `add-resource --target-folder`, `CreateResourceDto.targetFolder`) to place a short key (e.g. `ok`) at a specific location (e.g. `apps.common.buttons`) without repeating the full path in the key itself.

Validated to the same segment rules as a resource key (`[A-Za-z0-9_-]`). An empty string means no folder scoping.

An edit does not use it. `editResource(collection, key, { moveTo })` takes the full existing key, and `moveTo` is the folder the entry moves to (`''` for the collection root); `UpdateResourceDto.moveTo` and `edit-resource --target-folder` map to it.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`core-library.md`](core-library.md#collection-bound-operations), [`cli.md`](cli.md)

---

### Term Glossary

A ranked list of existing translations that match candidate terms in a block of base-locale text. In core, `buildGlossary(collections, text, { extractor?, locales?, includeAll? })` reads opened [collections](#collection) through the [Collection Set](#collection-set), extracts unique unigrams and bigrams by default, and matches them against base values. It returns the JSON payload (`baseLocale`, target `locales`, source counts, `matchCount`, `terms`) and separate unreadable-folder `readProblems`. By default, each entry contributes only its own collection's target locales. An explicit locale list can select stored translations outside those targets; only the base locale is removed. New and stale translations are omitted unless `includeAll` is set. An empty collection set raises `GlossaryNoCollectionsError`; different base locales raise `CollectionBaseLocaleMismatchError`, because one glossary has one source language. The CLI selects input and prints or saves the payload, reporting reader problems on stderr.

Explained in context: [`core-library.md`](core-library.md#term-glossary), [`cli.md`](cli.md#glossary-pipeline)

---

### Term List Edit

The direct file-edit side of [Project Terms](#project-terms), owned by core config. Collection create and update can also provide a whole protected-terms list through the [Collection Lifecycle](#collection-lifecycle). Project Terms Update changes `protectedTermsFile` and carries over the old list. [Project Terms Update](#project-terms-update) previews stored terms, paths, warnings and the effective union before a write, so the CLI can print that view. Protected terms use the domain `ListEdit`: `set`, `add` and `remove` hold arrays; the CLI splits its comma-separated `--set` value. Preferred terminology uses a replacement rule array, one `upsert` rule, or one discouraged term to remove. Core checks missing and conflicting structured edits; the CLI maps each typed `problem` to its flag wording and checks incomplete preferred-terminology flag groups before making a core request. Core applies protected-term lists through the shared [List Edit Merge](#list-edit-merge). Preferred-terminology upsert and removal match discouraged terms without regard to case; a validation error carries its row details and leaves the file untouched.

Explained in context: [`core-library.md`](core-library.md#project-terms), [`cli.md`](cli.md#protected-terms-scoping), [`api.md`](api.md#error-mapping)

---

### Tracker Metadata

The `tracker_meta.json` file stored alongside every `resource_entries.json`. It holds [locale metadata](#locale-metadata) (checksums and translation status) for every resource entry in that folder, keyed first by entry key then by locale code.

Example:
```json
{
  "title": {
    "en": {
      "checksum": "cc367b544fab23df0ddaf982fb1445b5"
    },
    "es": {
      "checksum": "b2640f303143f6238cbbe0a626d23b11",
      "baseChecksum": "cc367b544fab23df0ddaf982fb1445b5",
      "status": "translated"
    }
  }
}
```

The base locale entry has only `checksum`. Non-base locale entries add `baseChecksum` and `status`.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md)

---

### Translate Locale

`translateLocale(collection, params)` translates a collection's resources that need work for one target locale. It calls `onMutation` synchronously with a `reindex` after every folder save attempt, including an attempt that fails after a partial write. Its completed result has a [Run Outcome](#run-outcome): `failed` when any resource failed, otherwise `succeeded`. It stores results through [Translation Write-back](#translation-write-back), so writes made during the provider call survive. Changed or removed entries go into `skippedKeys`. Skipped resources and unreadable folders are reported separately.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline), [`api.md`](api.md#translation-job-system)

---

### Translation Batch

The shared translate-and-store operation beneath [Translate Locale](#translate-locale) and `translateExistingResource`. `translationBatch` in `libs/core/src/lib/translation/translation-batch.ts` takes full keys, source values, per-locale snapshots, target locales, an opened [Translator](#translator), and [Mutation Sink](#mutation-sink) options. It calls the Translator once, groups translated values by folder with `groupByFolder`, and stores each folder through [Translation Write-back](#translation-write-back). It returns one outcome per key and locale: `written`, `skipped` (provider or stale write-back), or `failed` with a `provider` or `write` stage and error message. A provider failure fails the entire batch; a write failure fails only that folder's translated values. Earlier writes and provider skips keep their outcomes. The original error is retained so the single-resource caller can rethrow it.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline)

---

### Translation List View

The Tracker's status filter, sort, per-status counts and needs-work count for a set of [Resource Summaries](#resource-summary). The pure module is `apps/tracker/src/app/browser/translations/utils/translation-list-view.ts`. `resourceStatusScope(items, locales)` returns per-item counts, status counts and a needs-work count. `translationListRows(scope, selection)` filters the scope and delegates sort to `sortTranslationRecords`, which reuses those per-item counts. Status and sort changes preserve the scope and its counts reference.

The filter and counts use one predicate over domain `statusCountsOver` results. Each status count equals the rows that status alone keeps. Counts use the status-unfiltered resources, and needs work counts the union of `new` and `stale` once per resource.

Explained in context: [`frontend.md`](frontend.md#translation-status-summary)

---

### Translation Status

A status (`TranslationStatus` in `@simoncodes-ca/domain`) that tracks the review lifecycle of a non-base locale translation. `TRANSLATION_STATUSES` defines the four values, and `isTranslationStatus` checks input at runtime. `NEEDS_WORK_STATUSES` defines `new` and `stale`; `isNeedsWorkStatus` and `isNeedsWorkStatusSelection` test one status or an exact shortcut selection. `DEFAULT_MISSING_METADATA_STATUS` is `new` for a locale with no stored metadata:

| Status | Meaning | CI validation result |
|---|---|---|
| `new` | Resource added but not yet translated (value is a copy of the base) | Failure |
| `translated` | Has a translation value but not reviewed | Failure by default; warning with `--allow-translated` |
| `stale` | Base locale value changed after translation was written | Failure |
| `verified` | Translation reviewed and approved by a language expert | Success |

The lifecycle flows: `new` → `translated` → `verified`. If the base value changes after `verified`, the status becomes `stale`. A caller can explicitly mark an identical copy `translated` or `verified`. Core checks status values on resource writes and checks each export filter value with the same `InvalidTranslationStatusError`. The CLI parses `--translations` JSON shape and splits `--status`, rejects an empty status split with its flag message, then passes status values to core.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`bundle-generation.md`](bundle-generation.md), [`domain-and-data-model.md`](domain-and-data-model.md)

---

### Translation Status Summary

The roll-up of a set of locale [translation statuses](#translation-status): the number of locales in each status (`StatusCounts`) and the worst status. The pure module `libs/domain/src/lib/translation-status-summary.ts` holds the rules. `countByStatus(statuses)` counts the statuses and ignores a locale with no status. `statusCountsOver(summary, locales)` counts one resource's display statuses over the supplied locales. A target without metadata counts as `new`. Base and unknown locales contribute nothing. `worstStatus(counts)` applies `STATUS_PRECEDENCE`, which is worst first: `stale` > `new` > `translated` > `verified`. Every roll-up in the Tracker UI uses this module: the rollup ring, the screen-reader breakdown, the locale column, the status filter counts, and sort by status. The Tracker counts each locale's domain `displayStatus(target)`: the stored status, or `new` for a locale that needs work and has no metadata. The glyphs and label tokens are presentation. They are in one Tracker table, `shared/translation-status/translation-status-presentation.ts`, which the rows and the translation editor's status labels both use. Every ranking in the UI (filter rail, tooltip rows, sort, ring arc order) uses `STATUS_PRECEDENCE`, stale first. The rollup ring's arc geometry and tooltip row order are pure functions in `rollup-geometry.ts` next to `TranslationRollup`.

Explained in context: [`frontend.md`](frontend.md#translation-status-summary)

---

### Translation Write-back

The shared rule for storing translations after a provider call. `snapshotTranslation` records the stored ICU base checksum and target checksum and status before translation. `writeBackTranslations` in `libs/core/src/lib/translation/translation-write-back.ts` reopens the [Resource Folder](#resource-folder) from disk. It skips missing entries, changed base checksums, changed target checksums or statuses, and targets that no longer need translation. It writes the remaining values and saves once, only if it wrote a value. Sibling entries survive because the folder contains fresh disk state.

`translateLocale` reports skipped keys and sends a `reindex` after every save attempt. `translateExistingResource` reports skipped locales and returns the fresh entry with a count of written locales. Phase 2 of `editResource` compares against its saved phase-1 state and preserves concurrent edits or deletions. Edit reports skipped locales only when auto-translation ran. Single-entry callers send `upsert` after success, or `reindex` before a failed save throws. A synchronous TOCTOU gap remains between reopening and saving, and the two-file save is not atomic.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline)

---

### Translator

The one way core machine-translates text for a [collection](#collection). In code, `openTranslator(collection, { provider?, protectedTerms? })` in `libs/core/src/lib/translation/translator.ts` returns a `Translator`: `translate(entries, locales) → { values, skipped }`, and `problems` (a named protected-terms file that does not exist). Opening it checks that the collection's translation config is enabled (`AutoTranslationDisabledError`) and, unless a provider is injected, reads the API key (`TranslationError` `MISSING_API_KEY`) and builds the configured provider. For a whole-locale translation, core first runs `assertCanTranslateLocale`: auto-translation must be enabled and the target must be a configured, non-base locale. It reads the collection's [Project Terms](#project-terms) once for the protected terms, unless they are passed (`ProtectedTermsFileError` for a malformed file; a named file that does not exist is in `Translator.problems`, which its callers pass on as warnings). `translate` makes one provider call per locale and ignores the base locale. It never sends complex [ICU](#icu-format). It protects simple placeholders and skips a translation that lost a marker. It skips a translation that dropped a [protected term](#protected-term) present in the source. It returns every value normalized to ICU. Each skip carries a reason: `complex-icu`, `placeholder-mismatch` or `protected-term`. [Locale seeding](#locale-seeding), `translateExistingResource` and `translateLocale` all translate through it; they only choose what needs work (the [staleness rule](#staleness-rule)) and store the values. The provider is the seam: `GoogleTranslateV2Provider` in production, `InMemoryTranslationProvider` (a deterministic transform that records its calls, internal to core) in core's specs. Google requests time out after 30 seconds and fail with a retryable `TranslationError` (`TIMEOUT`); a whole-locale run records that batch in `failures` and continues. An invalid timeout option raises `INVALID_REQUEST_TIMEOUT` when the provider is constructed. `translateLocale`, `translateExistingResource`, and phase 2 of `editResource` store results through [Translation Write-back](#translation-write-back). This shared rule preserves writes made during the provider call. Callers report changed or removed entries in `skippedKeys` or `skippedLocales`.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline)

---

### Transloco

The Angular internationalization library ([jsverse/transloco](https://jsverse.github.io/transloco/)) that LingoTracker is designed to integrate with. Transloco consumes locale JSON [bundle](#bundle) files at runtime. LingoTracker converts ICU simple placeholder syntax to Transloco's `{{ varName }}` interpolation syntax during bundle generation.

Explained in context: [`frontend.md`](frontend.md), [`bundle-generation.md`](bundle-generation.md)

---

### Typed Errors

The errors core raises on purpose. Each subclass of `LingoTrackerError` (`libs/core/src/lib/errors/lingo-tracker-error.ts`) declares a `kind` for adapter mapping, a stable `code` (for example `RESOURCE_NOT_FOUND`), and any typed payload fields (for example `key`).

The API maps `kind` to a default HTTP status. An API-owned code table declares message transforms, status overrides, and inclusion of core `details` as response `errors`. All core error classes live in `errors/`, including translation and terminology validation errors. Core exposes domain facts without HTTP metadata. The filter reads these facts without checks for specific subclasses. The API may define its own `LingoTrackerError` subclasses, such as `JobNotFoundError` with kind `not-found`, because the filter reads only `kind`, `code` and `exposeMessage` to select their HTTP mapping. A core spec reserves kind `upstream` for `TranslationError`, so unknown provider codes keep the same prefix and default 502.

A missing move destination is `CollectionNotFoundError` with the same `not-found` kind and a destination-specific message; a read-only destination is `ReadOnlyCollectionError` with kind `forbidden`. `CollectionBaseLocaleMismatchError` has kind `invalid` and maps a whole-collection source-locale disagreement to HTTP 400. Project-term and collection-tag edit errors name data, not CLI flags, and so do the glossary extractor and bundle constant-name errors (`GlossaryExtractorError`, `MultipleBundleConstantNameError`), so the API shows flag-free text; their `problem` fields identify invalid edit combinations so the commands in `apps/cli/src/commands/` can supply the exact flag wording. Core converts operational failures at its boundary to typed errors; `CoreOperationError` keeps the CLI message and `String(error)` text of a former plain error while the API keeps its generic 500 body without a message. `ResourceFolder` keeps three programmer-error assertions as plain `Error`. An `InvalidConfigError` still carries a deliberate, client-visible message. On the other side of the wire, the Tracker turns each failed answer back into one [API Error](#api-error).

Explained in context: [`core-library.md`](core-library.md#error-model), [`api.md`](api.md#error-mapping), [`cli.md`](cli.md#errors-and-exit-codes)

---

## V

### Validate Run

One validation of the opened [collections](#collection) for CI. In code, `runValidate(collections, options)` in `libs/core/src/lib/validate/run-validate.ts` uses the [Collection Set](#collection-set) for target locales and flattened resources, resolves skipped locales, reads each collection's [Project Terms](#project-terms), runs status, ICU, placeholder, and preferred-terminology checks through `validateResources`, and returns the validation result, its summary, and printable warnings. A missing collection set, no target locale, or every target locale skipped returns an in-band failure; a broken preferred-terminology file fails validation. The rule file belongs to the project, so the run uses the first collection whose read has rules. Validation checks collections independently under each base locale and accepts different base locales.

Explained in context: [`core-library.md`](core-library.md#validation-for-cicd), [`cli.md`](cli.md)
