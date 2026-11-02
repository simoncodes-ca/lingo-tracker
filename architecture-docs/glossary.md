# Glossary

Alphabetical reference for every domain term used in LingoTracker documentation. Each entry links to the spoke document where the concept is explained in full context.

Return to [architecture README](README.md).

---

## A

### API Error

The one error value the Tracker UI sees for a failed API request (`ApiError` in `apps/tracker/src/app/shared/api-error/api-error.ts`). A functional `HttpClient` interceptor, installed once by `provideTrackerHttpClient()`, converts every failed response at the HTTP seam — every `HttpClient` request goes through it, the API clients and the Transloco loader alike — so Angular's `HttpErrorResponse` never reaches a store or a dialog. An `ApiError` carries a `kind` shrunk to what a consumer branches on (`invalid`, `not-found`, `conflict`, `other`), the real HTTP `status`, the `serverMessage` of the API's `{ statusCode, message, error }` body when it had one, and the body's `errors` array as `details` (bundle rule messages, preferred-terminology rule errors). Consumers decide with `kind` and show `apiErrorMessage(error, fallback)`: the server's message, else their own localized fallback. No status is special: the API's catch-all answers an unmapped exception with a 500 that carries no message, so it lands on the fallback by the same rule, and a 500 that does carry one (an `InvalidConfigError` naming what is wrong with `.lingo-tracker.json`) is shown as is. It is the Tracker's counterpart of the [typed errors](#typed-errors) the API maps to HTTP.

The server maps core errors by `kind` and a sparse API-owned override table keyed on `code`. Core supplies typed `facts`, including optional `facts.details`. Code-specific rules receive facts narrowed from the core catalogue. Route pipes let core errors reach the global filter.

The API table owns message transforms, status overrides, and inclusion of `details` as response `errors`. The Tracker receives those lists as `ApiError.details`. The server does not send the core `kind` or `code`.

Config and companion-file failures keep their original error mapping after a [Config Write Transaction](#config-write-transaction) rollback.

The project snapshot preserves config response fields and serialization order. Malformed protected files still map to HTTP 500; invalid term edits still map to HTTP 400.

Explained in context: [`frontend.md`](frontend.md#api-errors--one-adapter-at-the-http-seam), [`api.md`](api.md#error-mapping)

---

## B

### Base Locale

The authoritative source language for all translation resources — the locale whose values are treated as the ground truth for staleness detection. Configured globally in `.lingo-tracker.json` as `baseLocale` (e.g. `"en"`) and overridable per collection. The base locale's value is what all other locale translations are derived from.

Tracker metadata for the base locale omits `status` and `baseChecksum`; only `checksum` is stored (the MD5 of the base value itself).

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md)

---

### Browser Mirror

The one rule that maps a successful Tracker write to the translation list and folder tree on screen. `apps/tracker/src/app/browser/store/browser-mirror.ts` is a pure core: `planBrowserWrite(list, tree, result)` returns cache patches and ordered load/navigation effects for `entry-created`, `entry-replaced`, `entry-removed` (deletion or editor relocation), `entry-moved` (a drag), `folder-created`, `folder-moved` and `folder-removed`. `planOptimisticMove` captures and removes only the dragged row or folder; `planMirrorRollback` restores it against current state without reverting newer loads. Folder moves reuse the [Folder Move Plan](#folder-move-plan). The thin `withBrowserMirrorFeature` in `store/features/with-browser-mirror.feature.ts` patches signals and calls [List Scope](#list-scope) and Folder Tree loaders. [Entry Writes](#entry-writes) and [Folder Writes](#folder-writes) supply these results and move tokens inside [Write Run](#write-run)'s session guards. They retain HTTP, operation state and decided feedback. In-session move failures reach the mirror through `rollbackMirrorMove`; failed non-move writes leave caches alone. Only stale responses and errors are dropped by `withinSession` before success mapping or error handling.

Explained in context: [`frontend.md`](frontend.md#browserstore--feature-composition)

---

### Browser Session

The one path that opens a [collection](#collection) in the Tracker UI. In code, `openCollection(settings)` in `apps/tracker/src/app/browser/store/features/with-browser-session.feature.ts`, a feature of the root-provided `BrowserStore`. It takes a `CollectionSettings`, the Tracker's [resolved collection](#collection) (`resolveCollectionSettings(config, name)` in `apps/tracker/src/app/collections/store/collection-settings.ts`, using domain's [Collection Settings](#collection-settings) rule and projecting `translationEnabled` from `translation?.enabled === true`). It runs close hooks to cancel list loads, then reset hooks that restore state and cancel the Folder Writes highlight timer. Each state owner registers its reset through `withCollectionState(initialState)` in `store/collection-reset.ts`. The session then patches the incremented `sessionId` and settings as `collectionSettings` (with the projections `selectedCollection`, `availableLocales`, `baseLocale`, `isReadOnly`), restores the collection's saved view preferences (`restoreViewPreferences`, owned by the view-preferences feature, which delegates locale and density restoration to [Locale Selection](#locale-selection); a missing or retired `medium` density reads as `compact`), and starts an [Index Readiness](#index-readiness) wait, cancelling the previous wait. Store loaders capture `sessionId` when a request starts and drop the response if another open has happened since (`captureSession`/`withinSession` in `apps/tracker/src/app/browser/store/session-guard.ts`), so a slow response from the previous collection, or from an earlier open of the same one, never lands in the new session. The [List Scope](#list-scope)'s loads are cancelled outright on every open, not just dropped. This includes the entry writes (`createResource`, `updateResource`, `deleteResource`, `translateResource`): each still resolves its Observable for the caller, but only patches or drops a cache row while its own session is still open, so the translation editor dialog's save cannot land in a collection that replaced the one it was editing. Because the store outlives the route, this is what keeps one collection's search results, folder selection, folder tree or pending folder operation from showing up in the next collection. **Re-entering the open collection is not an open**: the user keeps their place (folder, expansion, search box and results, filters), and only `updateSettings(settings)` runs. A `readOnly` or `translationEnabled` change writes the changed settings in place; equal settings, as on an unrelated config reload, are a no-op. A change to `locales`, `baseLocale` or `translationsFolder` invalidates data cached under the old settings, so `updateSettings` runs `openCollection(settings)` instead — a fresh session, with the collection's saved view preferences restored against its current locales (dropping any locale the collection no longer has, so it cannot leave a stale column on screen or in storage). `collectionSettings` is the browser's one source of settings, `translationEnabled` and `translationsFolder` included. The `TranslationBrowser` route component is the only production caller of both methods.

Each store instance owns a lifecycle registry from `withCollectionLifecycle()`. Features register hooks during construction through `_collectionLifecycle`; its hook lists remain private. Every open runs `close` → `reset` → settings/session patch → `restore` → `ready`. Hooks within a phase run in registration order. The ready hook cancels the previous overlay wait through the existing `switchMap`. The session requires no sibling feature methods or feature-state intersection. A new state feature automatically registers its reset through `withCollectionState`. Later features can register hooks too. The close phase adds no standalone close operation or route-exit behavior.

Explained in context: [`frontend.md`](frontend.md#browserstore--feature-composition)

---

### Bundle

A generated JSON file (one per locale) that aggregates translation values from one or more [collections](#collection) into a flat or hierarchical format consumable by the Angular Transloco library. Bundles are defined in the `bundles` section of `.lingo-tracker.json`. Each bundle specifies a `dist` output directory, a `bundleName` pattern (e.g. `{locale}`), and which collections (or `"All"`) to include.

During bundle generation, ICU simple placeholder syntax (`{varName}`) is converted to Transloco double-brace syntax (`{{ varName }}`); complex ICU constructs (`plural`, `select`) pass through unchanged.

Core generates a saved bundle by its name for the API. For a CLI run, `generateBundles(config, { names?, locales?, overrides, cwd })` selects all or named bundles, prepares each request once, continues after an individual failure, and returns one outcome per bundle plus totals. [Bundle Run Preparation](#bundle-run-preparation) supplies the shared settings for generation and planning. Type generation has one outcome: written, skipped, failed, or not configured. A skipped outcome carries the `empty-bundle` reason code.

Core returns [Bundle Findings](#bundle-findings) for both adapters. The CLI owns tree lines and warning framing; config and type diagnostics stay outside its generation warning summary.

If generation throws, the prepared warning still reaches the CLI event or API log.

Explained in context: [`bundle-generation.md`](bundle-generation.md), [`core-library.md`](core-library.md)

---

### Bundle Batch Controller

The thin bundle adapter in `apps/tracker/src/app/collections/store/bundle-batch-controller.ts`, backed by [Job Run Lifecycle](#job-run-lifecycle). `start(name, locales?, defaultLocaleCount?)` ignores a running bundle and replaces a finished result. `startAll(names, defaultLocaleCount?)` skips running bundles and keeps an active batch. `changes` publishes run maps, started batch names, batch position and busy state. Completed and failed runs advance the batch position; even an immediate request failure counts as a start. Batch names are not persisted. The adapter supplies bundle jobs, snapshot mapping with seeded locale totals, and localized error mapping; lifecycle recovery, cancellation and persistence are shared with export and import.

Explained in context: [`frontend.md`](frontend.md#bundle-runs)

---

### Bundle Collection References

The explicit collection entries stored in bundle definitions. `renameBundleCollectionReferences` and `removeBundleCollectionReferences` in `libs/core/src/lib/bundle/bundle-definition-operations.ts` change them in memory as part of the [Collection Lifecycle](#collection-lifecycle). Rename refuses a target already referenced by a bundle with `CollectionRenameBundleConflictError`. Removal checks every bundle first and throws `CollectionRequiredByBundleError` when any list would become empty. Malformed collection lists are skipped and null entries are tolerated. Entries in `'All'` bundles are unchanged. The same module owns bundle-map edits for definition add, update and delete. One rebuild path preserves key order. Separate rename and removal passes share the explicit-list guard and tolerate null entries.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution)

---

### Bundle Definition

One entry under `bundles` in `.lingo-tracker.json`: how a [bundle](#bundle) is built.

An explicit collection list can name one collection more than once when the entries have different prefixes. Collection renames update every matching entry; deletion removes every matching entry. A delete is refused if it would leave any explicit list empty. A rename is refused if a bundle already references the new name. The `'All'` form needs no update.

It lives in domain, so core, the API, the CLI and the Tracker share one type and one set of rules. The same module derives the default token constant name from a bundle key (`bundleKeyToConstantName`: `core-ui` gives `CORE_UI_TOKENS`), which core's settings resolution and the Tracker bundle dialog both use. In code, `libs/domain/src/lib/bundle-definition.ts` declares `BundleDefinition` (`bundleName`, `dist`, `collections`, and the optional `typeDistFile`, `tokenCasing`, `tokenConstantName`, `transformICUToTransloco`), `CollectionBundleDefinition` and `EntrySelectionRule`. The data-transfer `BundleDefinitionDto` types are aliases of these, so the API does not map them. The rules are pure. `validateBundleKey(key)` accepts letters, digits, hyphens and underscores. `validateBundleDefinition(definition, collectionNames)` returns every problem at once: `bundleName` needs the `{locale}` placeholder, `dist` is required, each collection must exist and appear only once per `bundledKeyPrefix`, rules need a `matchingPattern`, `tokenCasing` is `upperCase` or `camelCase`, `typeDistFile` must end in `.ts` and `tokenConstantName` must be a JavaScript identifier. `normalizeBundleDefinition(definition)` trims strings, drops empty optionals and empty tags, keeps the `'All'` literals, moves a legacy `typeDist` to `typeDistFile`, and never throws on malformed input. `checkBundleDefinition(definition, collectionNames, key?)` runs both and returns the normalized definition with every error (key errors first); it is the one check core, the API dry run and the Tracker form run. `findBundleDefinition(bundles, key)` looks a key up by own property only. `bundleOutputFile(definition, locale)` is the file core writes for a locale: `<dist>/<bundleName with {locale} replaced>.json`, with `/` separators and no leading `./`. Core's add and update operations check definitions against an [Opened Project](#opened-project), run `checkBundleDefinition`, and throw `InvalidBundleDefinitionError` for invalid definitions. They write through `guardedConfigWrite`; a changed config snapshot raises `ConfigChangedError`. The API dry run runs the same check, and the Tracker bundle form runs it on submit.

Explained in context: [`core-library.md`](core-library.md#bundle-definition), [`api.md`](api.md#bundles), [`frontend.md`](frontend.md#bundle-form-dialog)

---

### Bundle Findings

The classified diagnostics carried as `findings` on `GenerateBundleResult` and every `BundleRunOutcome`. Core assembles them once when generation finishes, or from prepared config advisories when a run throws. A returned result and its run outcome share the same findings object. The internal assembly module is `libs/core/src/lib/bundle/bundle-findings.ts`; adapters do not call it. `messages` preserves generation, config, then type warning order, including repeated messages. `byOrigin` groups messages as `generation`, `config`, and `type`. `types` is a discriminated union: `written` with path and key count, `failed` with reason, `skipped` with a worded reason, or `none`. An unconfigured type file or a run that throws has `none`. Raw warnings and type outcomes stay inside core. The CLI formats config advisories, generation warning counts and type progress from these findings. Its type switch is exhaustive. The API copies every message and written type metadata into the unchanged DTO, including config advisories on successful jobs.

Explained in context: [`bundle-generation.md`](bundle-generation.md)

---

### Bundle Draft

The Tracker bundle form's plain values and rules in `apps/tracker/src/app/collections/bundle-form-dialog/bundle-draft.ts`. `toBundleDraft` reads normalized definitions and supplies initial choices. `toBundleDefinition` and `toBundleResult` build payloads from those choices. `bundleDraftErrors(result, collectionNames, nameEditable)` applies the shared domain check, with key validation only while the name is editable. `bundleDryRunRequest` requires a name, output folder and pattern. The module has no Angular dependency.

Explained in context: [`frontend.md`](frontend.md#bundle-form-dialog)

---

### Bundle Form

The Tracker bundle dialog's form model, `BundleForm`, in `apps/tracker/src/app/collections/bundle-form-dialog/bundle-form.ts`. It owns the typed Angular form, editing mutators, field validators, section state and errors, and the form-to-signal bridge. It delegates population, definition building and domain validation to [Bundle Draft](#bundle-draft). [Bundle Output Preview](#bundle-output-preview) owns the preview signals and refresh lifecycle. The form exposes one readonly `preview` part and releases its subscription with the form subscriptions. Templates and specs read preview signals through that part. `submitResult()` prepares an attempted submit: it validates and builds the result once. `submit({ dialog, write })` is the form's submit entry point. It delegates the attempt to a [Form Submit Attempt](#form-submit-attempt) (which composes [Dialog Config Submit](#dialog-config-submit)), supplying a single preparation callback and refusal rendering: a taken name opens the Output section, any other refusal lands in `submitErrors`. It exposes the module's `saving` signal. Its `destroyRef` cancels an in-flight write and releases form subscriptions (`destroy()` also releases form subscriptions). The dialog keeps DOM handling; `injectBundleFormSubmit()` supplies the submit environment and store write wiring.

Explained in context: [`frontend.md`](frontend.md#bundle-form-dialog)

---

### Bundle Output Preview

The output projections and preview lifecycle in `apps/tracker/src/app/collections/bundle-form-dialog/bundle-output-preview.ts`. `bundleOutputPreview({ draft, locales, plan? })` returns the output summary, locale filenames, type filename, and folders with file kinds, existing-file flags and path segments. `BundlePreview` takes draft and config callbacks plus a dry-run function. It owns preview signals, the 300 ms debounce, cancellation, stale results and local fallback after errors. `connect(changes)` returns the subscription that [Bundle Form](#bundle-form) releases on destruction. Tests supply plain draft values and a fake dry-run function.

Explained in context: [`frontend.md`](frontend.md#bundle-form-dialog)

---

### Bundle Presentation

The CLI's event-driven renderer in `apps/cli/src/commands/bundle-report.ts`. `printBundleEvent(event, { quiet?, verbose?, localeFilter? })` prints progress and diagnostics. `printBundleSummary(run, options)` derives the existing generation-only warning totals. Bundle keeps this presentation because its streams are pinned byte-for-byte and differ from [Run Report](#run-report)'s grouped lists. It formats [Bundle Findings](#bundle-findings) as separate config advisory, type tree/failure, and generation warning output. Only verbose mode shows generation warning details. Quiet mode retains diagnostics and warning totals. Neither function changes exit status; the command uses the completed run outcome.

Explained in context: [`cli.md`](cli.md)

---

### Bundle Result Warnings

The warnings assembled internally by generation from [Bundle Warning](#bundle-warning) objects. The returned interface is [Bundle Findings](#bundle-findings). If generation throws before returning a result, the API job service logs each prepared config advisory once.

Explained in context: [`bundle-generation.md`](bundle-generation.md)

---

### Bundle Run Preparation

The core step shared by a dry-run plan and generation. `prepareBundleRun` in `libs/core/src/lib/bundle/prepare-bundle-run.ts` takes `source: 'supplied'` with a definition for a full Bundle Definition and locale check, or `source: 'saved'` with a name for the existing lookup and locale check. Both modes resolve settings (including the token constant name) and return `{ bundleKey, cwd, definition, settings, locales, collections, warnings, tokenConstantNameOverride, content }`. Core trims the key for a supplied definition. A saved definition uses the caller’s name unchanged. The root is resolved when preparation runs; collections and generated files use that same root. Collections open on first use. A saved bundle with a deleted collection keeps running with a warning. The job service prepares synchronously before queueing. `generatePreparedBundle` takes the prepared run and per-run progress or debug options. `content({ onLocale?, onBase? })` selects all requested locales and each collection’s base values once, on first use. It caches trees, base keys, conflicts, and warnings. `planPreparedBundle(prepared)` describes this content; generation writes it. Empty locales have zero counts and warnings but no planned file. Base-selection warnings appear once unless separate locale selections also report them. Selected locale conflicts stop generation before all writes. Base conflicts stop runs only when types or debug keys consume the base tree. Progress fires before each locale selection. The run holds all selections in memory until output completes. Preparation is the single producer of config advisories: `warnings: readonly BundleWarning[]` contains already worded messages with the `config` origin, or is empty. Generation and failed run outcomes classify these advisories into [Bundle Findings](#bundle-findings). If generation throws before returning a result, the API logs each prepared warning once.

Explained in context: [`bundle-generation.md`](bundle-generation.md#where-bundle-generation-lives), [`api.md`](api.md#bundles)

---

#### Job Start Attempt

The job acceptance helper in `apps/tracker/src/app/collections/store/form-submit-attempt-job.ts`. `JobStartAttempt<TResult>` takes a failure-message callback and composes [Form Attempt State](#form-attempt-state), exposed as `state`. `start(prepare, start)` returns a lazy Observable, ignores duplicate starts, and clears previous errors after valid preparation. It owns `saving`, maps failures through `detailsElseMessage`, rethrows the original error and resets saving on completion, error or cancellation. Export and import forms keep their validation, request construction and section jumps.

Explained in context: [`frontend.md`](frontend.md#export-and-import-dialogs)

---

## Key Tree

The pure conversion between dot-delimited keys and nested JSON in `libs/domain/src/lib/key-tree.ts`. `buildKeyTree(entries, { leaf?, path? })` returns `{ tree, conflicts }`. Every branch has a null prototype, and traversal checks own properties. Leaves remain opaque, including rich objects. Parent leaves win over descendants in both key orders; conflicts lists each parent once, sorted. Exact duplicates use the last value. With `path`, distinct source keys that share a transformed path produce conflicts naming every source key. Callers validate key syntax before conversion.

`flattenKeyTree(tree, isLeaf, prefix?)` returns flat entries through own properties. An undefined prefix starts at the root; an empty prefix preserves an empty segment. The caller identifies strings or rich leaves; arrays, null, and unsupported primitives are skipped. JSON import uses this reverse operation. `detectHierarchicalConflicts` is a view of the same forward operation. Bundle and type generation reject conflicts. Export keeps parent leaves, names skipped descendants in conflict messages, and counts only surviving keys.

The core `buildBundleHierarchy(entries, tokenCasing?)` adapter also checks parent conflicts after token casing. It uses Key Tree for both hierarchies. The type adapter converts Key Tree output to the serializer’s node shape.

Explained in context: [`bundle-generation.md`](bundle-generation.md#hierarchy-building), [`domain-and-data-model.md`](domain-and-data-model.md#key-tree)

---

### Bundle Runs

The Tracker state for bundle generation: each bundle run and the names started by the latest "Generate all" request. The Bundle Batch Controller records those names in `bundleBatch`; `withBundlesFeature` exposes `batchTotal`, `batchPosition`, and `isBatchRunning`. A bundle already running is excluded from the batch. Completed and failed runs advance its position.

The pure `apps/tracker/src/app/collections/store/bundle-runs.ts` module maps job snapshots and parses persisted runs. The [Job Run Lifecycle](#job-run-lifecycle) owns starts, polling and session storage mirroring; the [Bundle Batch Controller](#bundle-batch-controller) adds batch progress; the store retains config reads/writes and projects controller snapshots into signals. The API formats core's [Bundle Findings](#bundle-findings) into the job result DTO. Warning strings are opaque text: the card counts and shows them, and persistence keeps their content unchanged. Run state survives a reload, but the batch does not. A restored run disappears when the API no longer knows its job.

Explained in context: [`frontend.md`](frontend.md#bundle-runs)

---

### Bundle Selection

What a [bundle](#bundle) holds for one locale: each final key, its value, and the resource the value came from. In code, `libs/core/src/lib/bundle/bundle-selection.ts` has two functions. `resolveBundleCollections(definition, config, { cwd })` opens each [collection](#collection) the definition reads once per run (`'All'` means every collection, with every entry and no prefix). For saved generation it warns once about an unknown collection; a supplied dry-run definition is rejected before selection. `selectBundleEntries(collections, locale, { transformICUToTransloco, cache })` reads each collection for the locale through the [Collection Reader](#collection-reader), keeps the entries that match a rule (key pattern and [tags](#tags)), prepends `bundledKeyPrefix`, converts [ICU](#icu-format) to [Transloco](#transloco) when asked, and merges: the first value of a key wins, unless a later collection's `mergeStrategy` is `'override'`. It returns `{ entries, conflicts, warnings }`; each entry has a `value` and an `origin` (`collectionName`, `sourceKey`). Each collection's base value comes from its own [base locale](#base-locale); `COLLECTION_BASE_LOCALE` asks for every collection's base value. `generatePreparedBundle` writes the JSON files from it, `planBundle` counts keys and reports conflicts from it, and the type file takes its keys from it. None of them selects entries itself.

Explained in context: [`core-library.md`](core-library.md#bundle-selection), [`bundle-generation.md`](bundle-generation.md#entry-filtering-pipeline)

---

### Bundle Type Outcome

The internal `BundleTypeOutcome` union in `libs/core/src/lib/bundle/generate-bundle.ts`: `written` with a project-relative path and key count, `skipped` with the `empty-bundle` reason, `failed` with a reason message, or `not-configured`. `generateBundleTypes` in `type-generation/generate-types.ts` returns it directly. Hierarchical conflicts still throw before writes; generation records them as failed outcomes. Generation adds the written type path to `writtenFiles` and converts the outcome to [Bundle Findings](#bundle-findings) before returning.

Explained in context: [`bundle-generation.md`](bundle-generation.md)

---

### Bundle Warning

One internal warning in the prepared config advisory list or [Bundle Result Warnings](#bundle-result-warnings), declared as `BundleWarning` in `libs/core/src/lib/bundle/generate-bundle.ts`. Its `origin` is `generation`, `config` (the legacy type-setting deprecation), or `type` (failed or skipped type generation); `message` is the existing core-formatted warning text. Bundle Run Preparation creates config warnings once; generation consumes these objects without deriving messages from a raw field. Adapters consume [Bundle Findings](#bundle-findings).

Explained in context: [`bundle-generation.md`](bundle-generation.md)

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

The long examples appended to `import`, `validate`, and `preferred-terminology` help. `apps/cli/src/runner/help-text.ts` holds factories for these strings so the [Command Registration](#command-registration) list stays short. The factories read flag spellings from records. Registration calls them after metadata loads and passes the result to Commander's `addHelpText('after', ...)`; the output is unchanged.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### CLI Option Definitions

Each command declares its CLI spellings, help, parsing, defaults and questions once in an adjacent flag record, enforced by `defineFlags<Options, Context>()(records)`. `registerFlags` creates fresh Commander options; negation uses a `--no-…` spelling with an optional `positive` companion. `flagValues` maps Commander attributes and positional arguments to record keys. For `list: 'optional'`, it converts Commander's raw `''` to `undefined` but keeps the key present. After prompts, `resolveFlagValues` applies implicit values and defaults with fresh array copies in production and `runCommand`. A record's `selection` metadata types its prompt and all-flag names against declared answer and option keys, and defines fallback rules; the runner decodes these inputs into typed `selections` before calling the handler, so commands do not read prompt-only answers or reapply record defaults.

`runner/options.ts` contains the low-level Commander constructors. `commaListOption` omits an exactly empty optional flag (`""`) so prompts and missing-option gates still run. Comma-only input keeps `[]` and counts as supplied. Clear mode preserves `[]`; preserve mode returns `{ kind: 'empty', input }` for deferred diagnostics. Prompt list answers use the same parser. Find-similar's one default limit lives in its flag record; `find-similar-options.ts` supplies its numeric parser. Validate's records replace the separate registration conversion.

Export and import use the same [Flag Record](#flag-record) interface for registration, per-field questions and resolution in `commands/export-cmd-flags.ts` and `commands/import-cmd-flags.ts`. `helpDefault` prints a label without assigning a parsed value; `defaultValue` assigns a Commander default; `runtimeDefault` supplies a fallback without changing help. Prompt initials can differ from resolution defaults. Import records read strategy-dependent help values and migration prompt initials from the Import Strategy Policy.

`flagQuestions` builds questions in record order unless a record specifies `promptOrder`. Every prompted import record declares its dependency order. `resolveFlag(record, values)` preserves each record's exact result type and takes no prompt context. Commands assemble a complete resolved result, and the compiler rejects missing fields. `ResolvingFlagRecords` requires a resolution rule for every options key; its ordered variant requires an order for every prompted record. List records cannot define a custom parser. Metadata uses type-only core imports and leaves handlers lazy. Export status choices derive from `TRANSLATION_STATUSES` and retain their existing labels and order.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### CLI Error Wording

The CLI adapter for core [typed errors](#typed-errors), in `apps/cli/src/runner/cli-error-wording.ts`.
`cliErrorWording(error, commandName?)` returns a message, optional details, an optional hint, and a rule for displaying its cause.
It returns `undefined` for values outside `LingoTrackerError`.
A sparse, type-safe `ErrorCode` table holds only wording deviations for domain and known provider codes.
Codes without a row retain their original message and the runner’s default exit behaviour.
Separate exhaustive problem tables supply flag text for collection-tag, protected-term, and preferred-terminology edits.
Unknown typed codes retain their message.

The [Command Runner](#command-runner) applies this module before command-specific hooks and generic error text.
`printCliError(error, options?)` prints complete diagnostics on stderr and retains the original error.
The runner, bundle outcomes, and normalize's read-only catch use this helper.
`ADD_RESOURCE_COMMAND_NAME` links the command definition to its advice, so only add-resource receives existing-key replacement advice.
A contract spec iterates the error catalogue, covers every override and problem, and rejects redundant overrides. It shares `errorAdapterFixtures()` in `libs/core/src/lib/errors/error-adapter-fixtures.spec-helpers.ts` with the API spec; this test helper constructs one real error per catalogue code.

Typed import errors include `Error` causes unless their wording rule suppresses them.
Import source and invalid-import-locale rules suppress causes.
The scoped catch for untyped `runImport` errors also suppresses causes.
Result-display and summary errors use normal runner reporting, with their message and cause.
Typed translation errors omit the command-specific `Translation failed:` prefix.
Import source and invalid-import-locale errors retain `Import failed:`, except source format-detection errors.

Explained in context: [`cli.md`](cli.md#cli-error-wording)

---

### Collection

A named group of translation [resources](#resource-entry) that share a common `translationsFolder` on disk and optional configuration overrides (base locale, locales, import/export folders, auto-translation settings, collection-level tags). Collections are defined under the `collections` key in `.lingo-tracker.json`.

Collections may declare a `tags?: string[]` array. These are **collection-level (inherited) tags** — every resource in the collection inherits them automatically at read time. See [Tags](#tags) for the inheritance model.

Example collections from the project's own config: `trackerResources` (the Tracker UI's own strings), `TestDataPlayground`, and `mockDesignSystem`.

**Collection (resolved).** Code outside the config module never reads a collection's raw entry to get its settings. `openCollection(config, name)` in `@simoncodes-ca/core` applies domain's [Collection Settings](#collection-settings) rule and returns a `Collection` with the effective values: `baseLocale` (non-empty collection value, else non-empty global value, else `en`), `locales` (non-empty collection list, else global list, else none). An empty collection value inherits: `baseLocale: ''` and `locales: []` both use the global setting. Other effective values are `targetLocales` (the locales without the base locale), `translationConfig` (collection, else global; the two are not merged), the absolute `translationsFolder`, normalized `tags`, `termFiles` (the paths of the [protected-terms](#protected-term) and [preferred-terminology](#preferred-terminology) files, resolved but not read; `readProjectTerms(collection)` reads them as the [Project Terms](#project-terms)), and `readOnly`. The returned `OpenedCollection` is also an [Opened Project](#opened-project): it carries `sourceConfig` and `projectRoot`, so registration and locale writes use the config that was opened. It throws `CollectionNotFoundError` for an unknown name, and `ReadOnlyCollectionError` when `{ writable: true }` is set on a read-only collection. The CLI and the API both open collections this way. Every resource and folder operation (`addResource`, `editResource`, `deleteResource`, `executeMove`, `translateExistingResource`, `prepareTranslationRun`, `createFolder`, `deleteFolder`) takes the opened `Collection` as its first parameter, like the [Import run](#import-run), so the base locale and locales come only from it.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`cli.md`](cli.md), [`core-library.md`](core-library.md#config-and-collection-resolution)

---

### Collection Draft

The Tracker collection form's plain values and rules in `apps/tracker/src/app/collections/collection-form-dialog/collection-draft.ts`. It seeds create or edit values, normalizes and changes locale choices, keeps the base locale fixed in edit mode (including an inherited base), reports removed original locales for confirmation, defaults read-only from a `node_modules` folder until the user chooses it, and builds the collection write payload. It has no Angular dependency. It also adds and removes tags and protected terms. [Collection Form](#collection-form) holds the draft and owns submit preparation, including confirmation; the adapter supplies store writes.

Explained in context: [`frontend.md`](frontend.md#collection-form-dialog)

---

### Collection Change

The shared change engine for an existing [Collection Entry](#collection-entry). `changeCollection` in `libs/core/src/collections-manager/collection-change.ts` serves update, tag edits, add-locale, and remove-locale. Tag edits validate and normalize the list edit, then await this engine; read-only registrations still permit tag edits. Refused edits write nothing and emit no mutation. Changed tags emit one collection reindex.

All preconditions precede writes. Locale sugar refuses read-only before its locale-specific checks and the stale snapshot. Update patches check terms, rename, entry, bundle references, terms destination, and stale snapshot before read-only and added-locale validation. The engine reads every affected folder before writes. It seeds added locales, purges removed locales, writes config, then writes optional terms.

The planning step resolves the next config, effective collection, locale differences, folders, and terms destination before writes. The write phase writes config before optional terms. If no locale file write was attempted, a failed terms write restores config and companion files through the [Config Write Transaction](#config-write-transaction). After a locale write attempt, core keeps the new config so it agrees with the locale files. Both paths throw the original terms error. Public result shapes remain unchanged. Locale or config failures also throw directly. One reporting step delivers deduplicated [reindex mutations](#resource-mutation) after attempted locale saves or a changed record's config write, including failures. Structural equality ignores object key order and preserves array order.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution)

---

### Collection Entry

The write side of a [collection's](#collection) record in `.lingo-tracker.json`: the one place that decides what the stored entry contains. In code, `libs/core/src/lib/config/collection-entry.ts` holds three pure functions over the in-memory config: `toCollectionEntry(config, collection)` builds the record (`translationsFolder`, trimmed, plus only the settings that differ from the effective inherited value, so a collection inherits by omission; `translation` is kept verbatim; `readOnly` only when true; tags normalized), `addCollectionEntry` registers it (a folder under `node_modules` is read-only unless the caller decides) and `patchCollectionEntry` changes it, with an optional rename in place. Patch semantics: a field the patch sets replaces the stored value (a setting is cleared, so the collection inherits, with its empty value: `tags: []`, `readOnly: false`, `locales: []`, and `''` for `exportFolder`, `importFolder`, `baseLocale` and `protectedTermsFile`; `translation` has no empty value and cannot be cleared by a patch, only replaced), a field set to `null` is `InvalidCollectionError`, and a field left out or `undefined` keeps its stored value, so a client that never sends `translation`, `exportFolder` or `importFolder` cannot lose them; the merged record is then re-minimized. An empty `locales` list means inherit, never "no locales". The rule for every field is listed once, keyed by the `LingoTrackerCollection` type, so a new field does not compile until its rule is written. `addCollection`, `editCollectionTags` and project-term pointer changes write through it. `assertCollectionFields` rejects null fields and a non-string `translationsFolder` before DTO-only fields are removed by the API mapper. The mapper also requires a string `translationsFolder` on collection request bodies, including updates. `updateCollection`, `addLocaleToCollection` and `removeLocaleFromCollection` share one locale-change path: validate, read every folder, seed added locales, purge removed locales, then write the minimized record once through `patchCollectionEntry`. A changed record delivers reindex mutations for the old and new translations folders. The errors are typed: `CollectionNotFoundError`, `CollectionAlreadyExistsError`, `InvalidCollectionError`.

Collection Entry compares `exportFolder`, `importFolder`, `baseLocale`, and `locales` with the global value, or the built-in default when absent. A value equal to the effective global-or-default is not stored. Patching an existing entry re-applies this rule, so an explicit value equal to the default is dropped.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution)

---

### Collection Form

The Tracker collection dialog's form model, `CollectionForm`, in `apps/tracker/src/app/collections/collection-form-dialog/collection-form.ts`. A signal holds the [Collection Draft](#collection-draft); the typed FormGroup holds only the name and folder text inputs and feeds each change into the draft. It owns locale, base-locale, read-only, tag and protected-term edits through the draft's rules, the add-locale input and its errors, display state (displayed base locale, hints, disclosure), validation of an attempted submit, and the refusal message cleared on the next edit. `submit({ dialog, write })` is the form's submit entry point. It delegates the attempt to a [Form Submit Attempt](#form-submit-attempt) (exposed as `attempt`), supplying a single preparation callback: a taken name lands on the name field, any other refusal on `submitError`. It exposes the module's `saving` signal. Its `destroyRef` cancels an in-flight write and releases form subscriptions. The dialog keeps DOM handling; `injectCollectionFormSubmit()` supplies only the submit environment and entity write. The form's `prepare()` validates, confirms removed locales through `env.confirm`, explicitly clears `submitError` after acceptance, and builds the result once. It is the collection counterpart of [Bundle Form](#bundle-form).

Explained in context: [`frontend.md`](frontend.md#collection-form-dialog)

---

### Collection Index

The API cache of each open [collection's](#collection) [Resource Tree Index](#resource-tree-index). `CollectionIndex` in `apps/api/src/app/cache/collection-index.service.ts` exposes `tree(collection, path)`, `searchPage(collection, request)`, and `status(collection)`. Writable collections carry its `sink` as their default `onMutation`.

Core owns tree loading, mutation patches, fingerprints, subtree reads, and search. The API owns cache states, indexing on first read, revalidation cadence, deferred fingerprint refreshes, LRU eviction, and Nest logging. A reload result from core removes that collection from the cache. The next tree or status read loads it again. Search uses disk until a tree is ready and does not start indexing. The HTTP endpoints and the Tracker UI still call it the "cache". The tree response mapper owns the HTTP 200/202 decision; [Index Readiness](#index-readiness) owns the Tracker wait.

Explained in context: [`api.md`](api.md#collection-index)

---

### Collection Lifecycle

The core operation that registers or changes a [Collection Entry](#collection-entry) together with its optional protected terms. Changes to existing collections use [Collection Change](#collection-change).

Collection rename and delete check bundle references before writing. Rename changes the collection registration and every explicit bundle reference in one config write, unless a bundle already references the new name. Delete removes the registration and its explicit references in one config write, unless an affected bundle would become empty. Either conflict leaves config and translation files untouched.

`addCollection(project, name, collection, { protectedTerms? })` and `updateCollection(openedCollection, newName, patch, { protectedTerms? })` check the term list and the resulting entry before their first write. The resulting entry supplies the file pointer, including one supplied in the same request or retained through a rename. A missing pointer raises `ProtectedTermsFileNotSetError` and changes no file. After any locale file changes required by an update, core writes `.lingo-tracker.json` and then the protected-terms file. The [Config Write Transaction](#config-write-transaction) restores both files if no locale file write was attempted. After a locale write attempt, a terms failure leaves the new config in place. Locale resource writes remain outside this transaction. `editCollectionTags(openedCollection, { add?, remove?, set? })` edits inherited tags in the registration, with core enforcing flag combinations and normalization. `initConfig(config, { cwd? })` validates and creates a config through the same config write path with an exclusive file create, refusing an existing file even when it appears during the write.

Collection Lifecycle owns Collection Index invalidation through the [Mutation Sink](#mutation-sink). After a successful registration write, `addCollection` sends one `reindex` for the new entry’s absolute translations folder. The API supplies `CollectionIndex.sink`; it does not build mutations or resolve collection paths itself. Existing collection changes and deletion report through the opened collection’s sink. The CLI can omit the sink.

`loadConfig()` records the exact config bytes it read. `guardedConfigWrite(openedProject)` checks that version before every config write, including add, delete, bundle writes, and writes delayed by a CLI prompt. A changed or removed file raises `ConfigChangedError` instead of replacing another process's edit. The locale-change path checks before touching locale files; the handle checks again when it writes config. The API answers 409 with the error message, and the CLI prints it and exits 1.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution), [`api.md`](api.md#collections), [`cli.md`](cli.md)

---

### Collection Reader

The read side of the [Resource Folder](#resource-folder): the one walk over a [collection's](#collection) `translationsFolder`. In code, `readCollection(collection)` in `libs/core/src/lib/resource/read-collection.ts` opens every folder with the collection's [base locale](#base-locale) and returns `{ resources, problems, warnings }`. Each `StoredResource` has an address (`fullKey`, `folderPath`, `entryKey`), the `entry` as `ResourceFolder.treeEntry()` reads it, and `effectiveTags` ([Tags](#tags)). The rules are the same for every caller. Hidden folders are skipped, with everything below them; the [Collection Tree Scan](#collection-tree-scan) owns this rule and the missing or unlistable folder rules that the [Collection Sweep](#collection-sweep) shares. An entry without metadata is read with `metadata: {}`, so it counts as `new`. A folder whose file is not valid JSON, or that cannot be listed, is left out and returned as a problem, and the caller reports it. `CollectionFolderProblem.kind` is `unreadable` for listing or parsing failures and `not-removed` for pruning removal failures. `describeFolderProblem` stays internal to core; collection read and glossary results carry ready-worded `warnings`, and `ResourceTreeIndex` sends warning strings to its callbacks, including the collection name when known. The normalize run also returns warnings for folder problems and read-only skips in collection order; adapters only print or log them, and core never prints to the console. The [Collection Set](#collection-set) (for export, validate, and glossary), the [Bundle Selection](#bundle-selection) (bundle, dry-run plan and type file), the resource tree, [Resource Search](#resource-search) on the disk (the API before indexing, the CLI `find-similar`) and the CLI `glossary` all read through it.

Explained in context: [`core-library.md`](core-library.md#collection-reader)

---

### Collection Set

The read model for a whole-collection run. In code, `readCollectionSet(collections, options)` in `libs/core/src/lib/collection-set/collection-set.ts` reads each opened collection through the [Collection Reader](#collection-reader). Named scopes replace caller policy flags. The options are a discriminated union: `{ scope: 'validation', skippedLocales? }`, `{ scope: 'export', locales?, onBeforeRead? }`, or `{ scope: 'glossary', locales? }`. The entry point resolves locales once and returns the first base locale, target locales, a `localesByCollection` map (including empty collections), and a deferred, cached `read()`. Only validation exposes `skippedLocales`, `warnings`, and a preflight `outcome` (`ready`, `no-collections`, `no-targets`, or `all-skipped`). Validate Run maps those outcomes to its existing errors before loading terms or resources; for a ready scope it loads terms before invoking the read, preserving I/O order. Direct resource validation can still read an empty scope. `validateResources` without a scope validates every configured target; its explicit-scope signature uses only that scope's locales. `ValidationOptions` contains check settings, with no skip list. Validate Run copies scope warnings before appending term-file warnings and passes the resolved skipped locales separately to the summary formatter for display. The read returns resources with values and metadata-derived status, and `readProblems` with collection, folder path, and message. `collectionSetTargetLocales` remains the export pre-read query. A missing status counts as `new`.

| Scope        | Shared keys                                                                                           | Locale scope and base locales                                                                                                                 | No targets                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `export`     | Last eligible collection wins per target, before status/tag filtering; first-key position is retained | Ordered configured target union, narrowed by requested locales; unknown locales ignored; bases must agree when targets remain                 | Skip reads and base agreement                                                          |
| `validation` | Keep every collection/key occurrence                                                                  | Each collection's own targets minus skips; unknown skips warn, base-only skips are silent; different bases allowed                            | The reader still reads; the run reports an empty or fully skipped scope before reading |
| `glossary`   | Keep every collection/key candidate for source-value matching                                         | Own collection targets by default; explicit locales include unconfigured/unknown stored locales and exclude the agreed base; bases must agree | Still read and require base agreement                                                  |

`resource.targetLocales` means the single locale for which the resource won in export; the collection's own targets minus skipped locales in validation (the same resolved list held in `localesByCollection`); and allowed matching locales in glossary (own collection targets by default, explicit requested locales minus the base otherwise). Preserved suspected glossary quirk: explicit locale order and duplicate locales survive base exclusion, for example `['de', 'unknown', 'fr', 'de']`; they are not deduplicated. Validate Run privately selects preferred-terminology rules: the first collection with non-empty rules wins, without checking later lists for agreement. Validation retains its existing `totalUniqueKeys` count of collection/key occurrences, including a shared key in each collection. Export, Validate, and Glossary map common read problems into their existing result fields. [Bundle Selection](#bundle-selection) stays separate: it selects final prefixed keys with per-definition filters, configurable merge strategies, base-locale reads, and a run cache.

Explained in context: [`core-library.md`](core-library.md#collection-set)

---

### Collection Settings

The pure inheritance rule shared by core and the Tracker: `inheritCollectionSettings(collection, global)` in `libs/domain/src/lib/collection-settings.ts`. `baseLocale` uses the first non-empty collection or global value, else `DEFAULT_BASE_LOCALE` (`en`). `locales` uses the non-empty collection array, else the global array, else `[]`. An empty collection value inherits, for both `baseLocale` and `locales`. An empty global locale array stays empty.

`translation` uses the collection object, else the global object, without merging. `readOnly` is true only when the collection sets it to `true`.

Translation settings stay generic, so domain has no dependency on core. Core adds paths, target locales, tags and term files. The Tracker adds raw `translationsFolder` (`''` when the collection is unknown) and `translationEnabled` (`translation?.enabled === true`). Both callers find entries with `findCollectionEntry(collections, name)` from the same domain module. This function reads own properties only, so inherited `constructor` and `__proto__` names do not resolve to collections.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution), [`frontend.md`](frontend.md#browserstore--feature-composition)

---

### Collection Sweep

The shared walk over Resource Folders, with read-only folders by default. In code, `sweepCollection(collection, { startPath?, unreported?: true })` in `libs/core/src/lib/resource/collection-sweep.ts` yields each collection folder under `startPath` (default: the root) opened with the collection's [base locale](#base-locale), or a problem for a folder it cannot read (invalid JSON, or not listable). Normalize and locale rewrites explicitly request `{ unreported: true }` to change and save folders. Their JSON saves remain silent as at HEAD. Folder move, folder delete, and key enumeration use read-only folders. The caller decides what a problem means. `sweepKeys` is the same sweep reduced to the full keys and the problems. It visits the same folders as the reader: hidden folders and everything below them are not part of the collection. Its [Collection Tree Scan](#collection-tree-scan) adapter checks every start-path segment with `lstat`: the first symbolic link yields one `unreadable` problem visit with no subfolders, then the walk stops. A missing segment still yields nothing. Move Run uses `fullKeyOf(folderPath, entryKey)` for folder selections, as `sweepKeys` does for patterns. The shared locale-change path for add-locale, remove-locale and edit-collection reads every folder before writing; normalize, folder delete (its entry count), folder move and the wildcard resource move go through it. Normalize and folder move then remove empty folders through [Folder Pruning](#folder-pruning).

Explained in context: [`core-library.md`](core-library.md#collection-sweep)

---

### Collection Tree Scan

The shared collection enumeration in `libs/core/src/lib/resource/iterative-folder-walker.ts`. `walkFolders(rootPath, { maxDepth?, onUnlistable? })` yields each folder's path, depth, visible subfolder names, and `resourceFileNames`. Only `resource_entries.json` and `tracker_meta.json` are resource files; directories with those names are excluded. The scan skips dot-folders and their descendants, does not descend into symbolic links, guards repeated real paths, and skips missing or unlistable folders. Callers can receive listing problems through `onUnlistable`, including folders that vanish during the scan. Cycle detection uses an internal visited set. `scanFolder(absolutePath)` reads one folder, includes all directory entries for pruning, and throws the original filesystem error on failure. Neither interface opens file contents.

`walkCollectionFolders` adds collection addresses, start-path checks, and problem visits. The [Collection Reader](#collection-reader), [Collection Sweep](#collection-sweep), and [Folder Pruning](#folder-pruning) use that adapter. The [Resource Tree Index](#resource-tree-index) fingerprint sums file stats from the scan and tolerates files disappearing before stat. Pruning uses all directory entries so excluded content still protects folders.

Explained in context: [`core-library.md`](core-library.md#collection-tree-scan)

---

### CLI Program

The CLI assembly in `apps/cli/src/program.ts`. `createCli(manifest: CommandManifest = commandManifest): Command` returns a fresh, unparsed Commander program with every command registered from the [Command Manifest](#command-manifest) and handlers still lazy. `main.ts` supplies process argv through Commander. Wiring tests use `testing/recording-manifest.ts` to inject a manifest with recording loaders, call the factory and await `parseAsync` directly; no process-argument replacement, module-cache reset or completion polling is needed.

A new command requires its command file, its registration (flags) file, and one manifest entry. Handler recorders derive from the manifest, so no spec mock is needed. An argv case in `main.handlers.spec.ts` pins parsed values and defaults; coverage checks every flag record key. `createCli` registers each supplied entry directly, allowing tests to replace loaders while keeping real flags and help.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### Command Manifest

The ordered command inventory in `apps/cli/src/command-manifest.ts`. Each entry pairs an existing [Command Registration](#command-registration) declaration with its lazy `import()` loader. A typed helper keeps each handler paired with its options; [CLI Program](#cli-program) registers the supplied entries directly. The manifest order is the Commander help order.

Handler-coverage and surface-snapshot tests use the manifest directly. Startup specs check that metadata imports and help generation do not load core. Handler specs replace lazy loaders with recorders and check argv cases through the injected manifest.

A new command requires its command file, its registration (flags) file, and one manifest entry. Handler recorders derive from the manifest, so no spec mock is needed. An argv case in `main.handlers.spec.ts` pins parsed values and defaults; coverage checks every flag record key. `createCli` registers each supplied entry directly, allowing tests to replace loaders while keeping real flags and help.

Explained in context: [`cli.md`](cli.md#command-inventory)

---

### Command Registration

The CLI declaration that connects a name, description, flag records, help text and a lazy command import. `registerCommand<Options>(program, registration)` in `apps/cli/src/runner/register-command.ts` installs it on Commander. Its action uses `flagValues(records, raw, args)` to map Commander attributes and ordered positional arguments to record keys. It then awaits the lazy import and handler. Only declared keys reach handlers. Absent flag attributes stay absent unless Commander supplies a default. An exactly empty optional list retains its key with `undefined`, so `resolveFlagValues` treats it as present and applies defaults or prompt answers. The [Command Manifest](#command-manifest) pairs each declaration with its loader. Handler-coverage and surface-snapshot tests use the manifest directly. Coverage checks it against every command in `createCli()`. Every handler takes one options object. The shared [CLI Option Definitions](#cli-option-definitions) supply repeated records and parsers.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### Command Runner

The CLI execution path. `registerCommand(program, registration)` applies the command's flags to Commander; `defineCommand<Options>()(spec)` in `apps/cli/src/runner/command-runner.ts` returns the function its lazy action calls. A command spec has a `name`, what it opens (`collection: 'writable' | 'read' | 'many' | 'none'`, and `config: false` for `init` and `install-skill`), its optional `preflight(ctx)` for preconditions and a typed preparation result, its `flags` for record questions and diagnostic spellings, optional `prompts` for workflow questions appended after record questions, the options it `required` (an absent flag, or an empty answer, fails; `run` sees them typed as present), and `run`, which makes the core call and prints. The runner finds the project root (`INIT_CWD`, else `process.cwd()`), reads the interactive rule, and loads the config. Its opened collection carries that config snapshot; the locale and tag commands pass it with a write handle to core. For one collection it resolves the flag, the only configured name, or an interactive selection. For `many` it supplies all opened collections to prompt builders, then selects all or an ordered, deduplicated list after the prompts. An empty config or unknown name fails with exit 1. The four many-collection commands are `validate`, `export`, `normalize`, and `glossary`; `normalizeCollections` in core applies the named versus all read-only rule after receiving the opened collections. After resources open, the runner awaits `preflight` in both modes before building command questions. Its context supplies those resources and the original flags as `options`. The returned value belongs to that invocation and reaches `run` through its typed `preflight` field (void when no hook is supplied). Translate locale uses this field for its Translation Run, preserving validation before command prompts without separate state. A thrown preflight error uses normal reporting (`❌ <message>`, exit 1). Shared core wording takes precedence. For untyped errors, `formatError` receives `duringRun: false`. The runner handles cancellation and errors, sets `process.exitCode`, and never calls `process.exit()`.

`runCommand(command, flags, { cwd, ask?, interactive?, output?, summaryDirectory?, now? })` runs that same pipeline in an explicit environment and returns `Promise<{ exitCode: 0 | 1, stdout, stderr }>`. It does not mutate process state. Tests use temporary projects and real core; injected `ask` answers questions or throws `CommandCancelledError`. The runner's async-scoped output port captures formatter output, direct command output and summary announcements separately for each run. Production supplies the process root, real prompts and TTY detection, uses the real console/streams, and sets `process.exitCode`.

`missingTextQuestions` hides missing-flag checks and required-text validation; `collectionSetupQuestions` hides the six shared collection questions and their command-specific defaults. `confirmOrCancel` hides the confirmation question, answer field, consent and interactive checks, and cancellation error.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### Config File

`libs/core/src/lib/config/config-file-operations.ts` owns reading, parsing, hashing, serializing and writing `.lingo-tracker.json`. `loadConfig({ cwd? })` returns the parsed file without validation or normalization. Its exact content version stays in a private WeakMap. The same content reader supplies the version check before a guarded write; missing or changed bytes raise `ConfigChangedError`, including invalid JSON from another writer.

`guardedConfigWrite(project)` keeps the existing read, write, create, update, version-check and transaction interface. Validation runs when enabled, which is the default for `guardedConfigWrite`. Each write serializes once, writes that string and advances its baseline from the same string. Exclusive creation refuses an existing file. The [Config Write Transaction](#config-write-transaction) supplies companion snapshots and rollback; Config File owns the guard and write-state decisions used during restoration.

Explained in context: [`core-library.md`](core-library.md#config-and-collection-resolution)

---

### Config Write Transaction

`guardedConfigWrite(project).transaction(config, companions, onOutcome?)` writes optional config and staged companion files together. The shared transaction returns `{ status }` on success or `{ status, error, reverted }` after failure. The optional observer receives this outcome before the config writer throws the original error; Project Terms carries the restore fact separately from error identity. `CompanionFileWrite` supplies a destination path and a write callback. The snapshot and rollback implementation is `libs/core/src/lib/config/config-write-transaction.ts`; [Config File](#config-file) owns the version baseline and decides whether config restoration is allowed.

The transaction snapshots every destination before the first write. It restores attempted destinations in reverse order after a failure. Existing files regain their exact bytes; new files disappear; existing directories stay intact. After a completed config write, the config guard checks for concurrent changes before any restoration. If config changed, the transaction preserves companion files that the current config can still reference. Validation and version-check failures leave config untouched. Once the config write starts, a failed write restores its previous bytes. Restoration failures become the original error's cause.

Collection Lifecycle uses this transaction only when no locale file write was attempted. Project Terms Update always uses it. Locale resource writes remain outside its scope. The transaction provides synchronous rollback, without crash recovery or a filesystem lock.

---

### Config Write

One write to `.lingo-tracker.json` from the Tracker UI, and the one way its outcome comes back. In code, `injectConfigWrite(store)` in `apps/tracker/src/app/collections/store/config-write.ts` returns the function that runs one, and every mutation of `CollectionsStore` is: `createCollection`, `updateCollection`, `deleteCollection`, `updateGlobalConfig`, and the bundle feature's `createBundle`, `updateBundle`, `deleteBundle`. Each sends its request, reloads `GET /api/config`, stores the config, and returns an Observable of that config, so the caller hears back only once the store already holds what the server holds; if that reload fails, the write still happened, so the Observable resolves with `null` and the store reports the load failure in `error`; a rejected write errors with the [API Error](#api-error) of the request (`conflict` for a taken name, `invalid` with the rule messages or the per-row preferred-terminology errors as `details`, anything else) and leaves the store as it was. The Observable is cold, like the browser store's entry writes: nothing is sent until the caller subscribes, and the caller owns the reaction. The collection and bundle form dialogs delegate their store writes to [Dialog Config Submit](#dialog-config-submit), cannot be closed while the write is in flight, and close only on success; a taken name lands on the name field, any other refusal on an error line in the dialog (the bundle dialog lists the server's rule messages). The collections manager toasts a create or edit only when a dialog closes with a saved result, and awaits a delete's outcome before it toasts. Settings Draft handles the save outcome: the saved config reseeds both lists, while the page gives one toast (a failed reload still earns the toast); a refusal keeps every edit and maps rule errors onto the rows that were sent, while the page shows its message. The store's `error` signal reports only a failed load (the initial one, or the reload after a write).

Core [Config File](#config-file) writes can stage companion term files through `guardedConfigWrite(project).transaction(config, companions)`. See [Config Write Transaction](#config-write-transaction) for its rollback scope.

Explained in context: [`frontend.md`](frontend.md#collectionsstore)

---

### Confirmation

Confirmation is one boolean answer from the shared `ConfirmationDialog`. `injectConfirm()` in `apps/tracker/src/app/shared/confirm.ts` accepts a `ConfirmationSpec`: title, message, optional button-label tokens, and action type. Each text field accepts a token string or `{ token, params }`. Parameter values can also reference a token. The helper translates the spec into `ConfirmationDialogData` with the existing width and close options.

The helper lazily opens the dialog and resolves `true` only for an explicit confirmation. Cancel, backdrop close, and a close without an emitted result resolve `false`. The helper checks the caller's `canOpen` guard after loading and before opening. The collection form's preparation step validates and supplies the removed-locale prompt through `FormSubmitEnv.confirm`. [Dialog Config Submit](#dialog-config-submit) waits for preparation and writes only when it returns a result.

Explained in context: [`frontend.md`](frontend.md#lazy-loaded-dialogs)

---

### Confirmed Write

The one way a Tracker surface asks, writes and tells the user. `injectConfirmedWrite()` in `apps/tracker/src/app/shared/confirmed-write.ts` builds on [Confirmation](#confirmation) and [Outcome Feedback](#outcome-feedback). `confirmDestructive({ title, message, cancelButtonText?, width? })` and the general `confirmWrite(spec)` return the `(inSession?) => Promise<boolean>` callback the store's write guards accept (`requestFolderDelete`, `requestFolderMove`, `requestEntryDelete`). The callback checks the [Browser Session](#browser-session) guard (when the store gives one) and the surface's `DestroyRef` before the dialog opens, and answers `false` if the surface was destroyed while the dialog was open. `runWrite(outcome$)` toasts the decided `feedback` of each outcome as it arrives, accepting one value or an ordered readonly array. It never cancels the write: after destroy the write still runs to its end, so the store settles it, and only the toast is suppressed. This holds for the folder, entry-delete, entry-translate, collection and bundle writes alike; item-actions translate still updates the store after its host is destroyed, but skips toasts and per-row UI updates. Callers pass only tokens and params for confirmation and feedback; Confirmed Write owns the dialog and toast lifetime checks.

Explained in context: [`frontend.md`](frontend.md#lazy-loaded-dialogs)

---

### Connector Links

The lines from collection cards to a hovered bundle card in the Tracker's Collections Manager. `apps/tracker/src/app/collections/collection-links-measurement.ts` owns the measuring boundary: `readCollectionLinkRects` queries the root's `.split`, `.bundles-col`, `[data-bundle]` and `[data-collection]` elements, measuring only the hovered bundle and its referenced collection cards. The adapter handles absent hover or required elements and filters linked names once. It returns a plain viewport rects object with the container, column, named bundle and a collection-name-to-rect map, or `undefined` when required elements are missing. The pure `collectionLinksFromRects` in `collection-links.ts` takes that object plus collection names in template order, skips missing cards and delegates geometry to `collectionLinks`. `measureCollectionLinks` composes the adapter and pure function to return the rendered `{ links, port }` shape. The component keeps the signals, next-frame effect and captured scroll/resize listener lifecycle. It draws nothing when required elements are missing, the columns stack or no referenced collection card is present. The geometry's fixed port offset, column inset, dot standoff, rounding and curve reach keep the lines aligned with the cards.

Explained in context: [`frontend.md`](frontend.md#collection-connector-links)

---

## D

### Dialog Config Submit

Dialog Config Submit owns the collection or bundle write lifecycle; [Form Submit Attempt](#form-submit-attempt) composes it and adds the form's attempt state. `NamedEntrySubmit` in `apps/tracker/src/app/collections/store/dialog-config-submit.ts` accepts five submit fields: `dialog`, `entry` (mode and original name), `prepare`, `write`, and `onRefusal`. The form's `prepare(): TResult | undefined | Promise<TResult | undefined>` owns synchronous validity checks, any confirmation, explicit error resets and one result build; `undefined` aborts. The module ignores another attempt during confirmation or a write, awaits preparation, chooses create or update, and builds the rename patch. `write` groups the entity's `create(result)` and `update(name, patch, result)` calls. The module owns `saving`, the server-taken-name validator and localized refusal classification; the form renders the refusal. `submitDialogConfigWrite()` owns the cold write subscription, close lock, success close and restoration on refusal. The same module supplies `submitDialogJob({ dialogRef, start, destroyRef })` for export and import: it locks closing, subscribes to the form-owned start, closes with the accepted job, unlocks on finalization and cancels on destruction. Job refusal messages stay with [Job Start Attempt](#job-start-attempt). Destruction cancels an in-flight write and prevents a write after pending preparation. Confirmation keeps the original saving and close behavior. Each form's `submit({ dialog, write })` is its single submit entry point; dialogs call it directly. `dialog-config-submit-adapters.ts` returns only `{ env, write }`, using DTO types without importing forms. The environment supplies `translate`, `destroyRef` and an injected `confirm` function. The collection form owns its removed-locale prompt. `classifyConfigRefusal()` remains with [Config Write](#config-write); Settings uses it for row errors and keeps its page-owned subscription after navigation.

Explained in context: [`frontend.md`](frontend.md#bundle-form-dialog)

---

### Drag Auto-Scroll

The standalone `DragAutoScroll` directive in `apps/tracker/src/app/browser/sidebar/folder-tree/drag-auto-scroll.directive.ts`. Its host mousemove listener checks the folder list edges while a drag is active. Inside the 50 px edge zone it scrolls 15 px every 50 ms. Changing direction replaces the interval; leaving the zone, ending the drag or destroying the list cancels it. Folder Tree supplies the combined local and external drag state.

Explained in context: [`frontend.md`](frontend.md#drag-and-drop--move-resource-and-folder)

---

## E

### Copy with Feedback

The shared clipboard action in `apps/tracker/src/app/shared/clipboard.ts`. `copyWithFeedback(text, feedback)` copies the text and shows one success or error toast. The caller supplies both messages and the notification seam. Only a successful copy runs the optional `onCopied` callback. The result is `copied` or `failed`, including an unavailable clipboard API or a rejected write.

Explained in context: [`frontend.md`](frontend.md#timed-ui-transients-and-clipboard)

---

### Editor Advisories

The translation editor's advice rules in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-advisories.ts`. `EditorAdvisories.observe()` follows base-value and Similar Values streams until `destroy()`: typed text updates at once, preferred-term findings update after a 300 ms pause, and a failed rule-file load suppresses them. It holds pinned hits and their clear/loading/ready state, identifies a trimmed, case-insensitive exact match, and applies a preferred term through the form's normal value-change path. Its signals are read-only to the dialog. The pure `suggestTags()` function takes live signals and derives sorted, unique suggestions from live collection entries and filters by typed text, excluding the entry's own and inherited tags. The dialog keeps rendering and focus after Use.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Entry Form

The translation editor's typed form and [Resource Entry Draft](#resource-entry-draft) bridge in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-entry-form.ts`. `EditorEntryForm` seeds every non-base locale from the resource summary, gives missing metadata the domain's `new` status, publishes raw form snapshots, selects locales needing work with the domain status helper, and detects unsaved fields, folder or tag changes. It exposes tags for reading and owns `addTag` and `removeTag` through Tag List Edit. It owns form validity, error visibility, `submitAttempted`, and the first invalid locale index. The session supplies the live key-collision read for validity. Its `draft(folderPath)` is the plain snapshot passed to [Editor Submit](#editor-submit). The dialog keeps the template bindings and UI focus.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Focus

The translation editor's one focus seam in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-focus.ts`. `EditorFocus` is scoped to each dialog and owns `EditorFocusTarget`, the named target type. Callers use `request(target)`; one path waits for Angular `afterNextRender`, then defers focus by a timer past the closing overlay's queued focus restoration. Anchor lookup happens in that deferred task, after the view has rendered. A newer request cancels the pending one, and dialog destruction cancels pending focus. The standalone `[editorFocusAnchor]` directive registers its element for a named target and unregisters it when its target changes or its view is destroyed. Registrations form a stack per target: the latest live element wins, and its removal restores the previous live element. Conditional drawer and folder-overlay views register when they appear; only the first drawer textarea registers the drawer target. It focuses the named field or panel control and, for Comment, scrolls it into view and selects its text. The drawer's first-control target falls back to the first invalid locale value when its own anchor is absent; other missing anchors do nothing. [Editor Panels](#editor-panels), [Editor Session](#editor-session), and the dialog request named targets through this interface without scheduling or DOM access.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Location

The translation editor's folder-selection state in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-location.ts`. It owns the selected folder, dotted-key continuation, absorption feedback, known entries from the browser and [Folder Peek](#folder-peek), the live key collision and "Where it lands" tree, and the decision to peek an unknown target folder. On absorption it publishes the localized live-region announcement, drops the highlight for one animation frame, and restarts its 900 ms reset. It owns cancellation of that frame and reset on destruction. The caller supplies the announcement wording through `absorbedLabel`. An edit can peek its original folder or a destination; its own key is exempt from collision only in the original folder. [Editor Panels](#editor-panels) keeps popover staging, filter and named focus requests; [Editor Entry Form](#editor-entry-form) owns the form. [Editor Submit](#editor-submit) owns the save protocol.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Outcome

How the Tracker's translation editor closed: the one result its launcher reads. In code, the `EditorOutcome` union in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-submit.ts`, with five kinds: `saved` (an edit stayed in its folder), `moved` (an edit with a `moveTo`, with the new key and folder), `created`, `open-existing` (the key is taken and the user asked for the entry that holds it) and `cancelled` (no write, a dialog closed without a result, or an edit the server found nothing to change in). `saved`, `moved` and `created` carry the locales auto-translation skipped. `TranslationEditorLauncher` opens every create and edit (`openCreate`, `openEdit`, `openByFullKey`) and gives the feedback for each outcome: the toasts, and for `open-existing` the move of the list to the entry's folder and an edit of it, whose outcome the hand-off resolves with. The reload after a write is the store's, not the launcher's.

Explained in context: [`frontend.md`](frontend.md#the-editor-outcome)

---

### Editor Panels

The translation editor's transient panels in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-panels.ts`. `EditorPanels` owns which of the folder popover, the other-locales drawer and the context disclosure is open, the popover's staged folder and filter, and the order Escape dismisses them: `dismissNearest()` closes the popover, then the drawer, and returns true when it consumed the key. It receives the [Editor Focus](#editor-focus) request interface as a collaborator. Opening a panel asks for focus inside it; closing one asks for focus on its opener, but only if it was open. `closeAll()` closes both without any focus ask, so a validation failure can focus the offending field. The class never touches the DOM. The dialog keeps the template and directive anchors; Editor Focus owns after-render scheduling and fallback rules. [Editor Location](#editor-location) owns the committed folder; [Editor Session](#editor-session) owns the accidental-close guard.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Presentation

The translation editor's display derivations in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-presentation.ts`. `EditorPresentation` reads entry and location parts, direct advisory findings, and mode signals. It supplies localized summaries, locale names, error tokens, tooltips, button labels, markup, and aria IDs. It has no injector, DOM access, side effects, or cleanup. [Editor Session](#editor-session) creates it, and the dialog exposes it as `presentation` for template reads. Its small input interface declares the required state without a session type dependency. Pure tests supply state and compare the resulting strings.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Session

The translation editor composition in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-session.ts`. `new EditorSession(data, options)` exposes readonly `entry`, `location`, `advisories`, `panels`, and `submit` parts for template reads. It composes these parts without signal aliases. It owns dotted-key synchronization, the unsaved-work guard, and tag suggestions. It applies submit decisions through [Editor Focus](#editor-focus) and panels; Editor Submit chooses the reveal targets. The options supply store and API seams, confirmation, close, feedback, and the [Editor Focus](#editor-focus) request interface shared with panels. The owner must call `destroy()` to release subscriptions and timers, including the cleanup owned by its collaborators.

The session creates [Editor Presentation](#editor-presentation) for display derivations. Editor Location owns absorption announcements and the highlight timing.

The component keeps its template, DOM anchors, initial focus request, and Escape/backdrop bridge. Editor Focus owns all focus scheduling and cancellation. Session tests use fakes for confirmation, close, and Editor Focus's request interface without TestBed.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Editor Submit

The translation editor's save session in `apps/tracker/src/app/browser/dialogs/translation-editor/editor-submit.ts`. `EditorSubmitSession` owns idle, missing-comment confirmation, key-conflict choice, writing and done phases. It ignores a trigger outside idle and remembers "Save Anyway" after a refused write. Writing and done both keep the dialog's busy indicator on until it closes. Injected functions provide the store writes and both prompts. The session returns an [Editor Outcome](#editor-outcome), a message decision or a focus decision. Message decisions carry [Outcome Feedback](#outcome-feedback), with the existing token, optional server-message detail, error tone, and inline placement. [Editor Session](#editor-session) shows this feedback through its supplied `feedbackText` function and applies the reveal targets through Editor Focus and panels. Invalid decisions carry the offending field and panel action: key first, then base value, then the locales drawer. Comment decisions carry the comment focus target and keep the panels unchanged. An empty write or rejected prompt gives the unexpected message and restores idle. `submitEditor` builds the create or update request from the [Resource Entry Draft](#resource-entry-draft) and classifies API refusals. The private `submitGate` keeps the read-only, invalid-form, collision and comment order after the session has rejected every trigger outside idle. Its input and reason types omit submitting because the only call occurs after that phase guard. `resolveDraftKey` in `resource-entry-draft.ts` trims the leaf for the preview, create request and conflict hand-off. [Editor Location](#editor-location) gathers known entries; [Editor Advisories](#editor-advisories) derives tag suggestions.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Entry Change

The rule for an entry's optional comment and tags. The pure `entryChange(intent, input)` function in `libs/domain/src/lib/entry-change.ts` maps these values to core writes. Absent values (`undefined`) leave fields unchanged. Non-empty values set fields. On edit, an empty comment (`''`) clears it and an empty tags list (`[]`) removes tags. On add, empty values mean no comment or tags.

CLI add-resource, CLI edit-resource and API update use this rule. Edit-resource prompts only for key and base value, so comment and tags come from flags. The flag-record boundary omits exactly empty `--tags ""`, while `--tags ,` supplies `[]`.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md#entry-change)

---

### Entry Relocation

The one way [resource entries](#resource-entry) move between keys, inside a [collection](#collection) or into another one. The [Move Plan](#move-plan) supplies its key pairs and `sameCollection` fact. In code, `relocateEntries(plan, { override? })` in `libs/core/src/lib/resource/relocate-entries.ts` takes a plan with its source and destination collections, relocations, and `sameCollection` and returns `{ moved, collisions, errors }` and delivers changes to the sink. It moves them as one batch: each [Resource Folder](#resource-folder) involved is opened and saved once, and only after every folder it sends entries to, so a failed write leaves no moved entry lost (except inside a cycle of folders that swap entries). The copy is lossless (checksums and statuses are kept; nothing is auto-translated). One collision rule applies: a destination key held by an entry that is not moving away is a collision, unless `override` replaces it; a key the batch frees is free. An entry moved into another collection is fitted to its locales: locales the destination does not have are dropped, and missing ones are seeded as a `new` copy of the base (the [Locale Seeding](#locale-seeding) fallback). Both collections must have the same [base locale](#base-locale). `editResource` (`moveTo`) and Move Run move through it. Relocation owns its lazy folder cache. With `deferPruning`, it returns saved empty folders to Move Run; an `InterruptedRelocation` carries them across a thrown exception. Move Run prunes them before it rethrows the original exception. Otherwise, relocation prunes its empty folders itself. [Move Report](#move-report) converts relocation collisions to warnings and accumulates errors for resource and folder moves.

Explained in context: [`core-library.md`](core-library.md#entry-relocation)

---

### Entry Write

The core Entry Writes module in `libs/core/src/lib/resource/resource-entry.ts` owns `addResource`, `addResources`, `editResource` and `removeEntry`. Public add and edit names are defined here directly; the core barrel preserves the application interface. The intent dispatcher failed the deletion test: callers wrapped arguments in `{ kind, ... }` and unwrapped `{ kind, result }` without gaining behaviour or depth. Direct calls return precise results.

Edit returns a fresh Resource Tree entry; add returns stored translations and terminology. Single-entry translation belongs to [Translation Run](#translation-run). Synchronous `removeEntry(collection, key, options?)` reports `emptied` for operation-end [Folder Pruning](#folder-pruning). These functions share one opened-folder path through [Resource Folder](#resource-folder), apply the [Staleness Rule](#staleness-rule), and each resolve its sink through the same [Mutation Sink](#mutation-sink) rule.

Add prepares translations before saving. Edit's private phases validate values and destination, apply base and details, apply supplied translations, seed and write back unchanged targets, and relocate and assemble the result. The top-level edit saves supplied changes before seeding, so provider failure preserves them; relocation follows write-back, and terminology uses the final key. `saveEntry` is the shared save/report path: `upsert` or `remove` after success, `reindex` after a failed save. The private `locateEntry` helper returns the address and opened folder for internal inspection. Batch add preparation and conflict rechecks belong to `addResources` in the same module.

Changed incoming base and translation values pass through [Value Admission](#value-admission) with the `stored-entry` policy, which uses the default [Stored Value Check](#stored-value-check) conversion-safety rules before preparation or mutation. Unsafe values raise `BracedPlaceholderError`; an edit that resends a held stored value unchanged remains allowed.

Explained in context: [`core-library.md`](core-library.md#resource-crud-flows)

---

### Entry Writes

In core, Entry Writes is the module described under [Entry Write](#entry-write); it owns single and batch adds, edit and remove, with private add phases. Changed supplied values use [Value Admission](#value-admission) with the `stored-entry` policy.

In the Tracker UI, Entry Writes is the store feature for resource creation, updates, deletion and auto-translation. `withEntryWritesFeature` in `apps/tracker/src/app/browser/store/features/with-entry-writes.feature.ts` is a sibling of [Folder Writes](#folder-writes). Both features delegate guards, session capture and API refusal normalization to [Write Run](#write-run). Entry Writes blocks read-only delete and translate writes before HTTP.

Delete and translate return cold `Observable` outcomes with decided [Outcome Feedback](#outcome-feedback). These outcomes include `read-only`, `no-collection`, `stale-session` and `refused` with an `ApiError`. `requestEntryDelete(fullKey, confirm)` uses Write Run and its shared `confirmThenWrite` helper to give the [Browser Session](#browser-session) guard to the caller's confirmation callback and check it after confirmation.

The feature updates the folder list and search results only in the session where the write began. A stale delete or translate response gives no feedback. The list actions supply the existing dialog and show the decided feedback. They own the translating keys and row flash. Editor create/update retain API responses and raw errors for [Editor Submit](#editor-submit), including the 409 key-conflict flow. Editor Submit enforces read-only before these pass-through store methods.

Entry Writes requires root session and collection guards plus the [Browser Mirror](#browser-mirror) `mirrorWrite` method. It supplies typed write results in its guarded success callbacks and neither declares nor patches row-cache state. Browser Mirror owns edits to both folder rows and search hits.

Explained in context: [`frontend.md`](frontend.md#writing-a-resource-entry)

---

### Existence Policy

`addResource` and `addResources` refuse an existing resolved key by default with `ResourceAlreadyExistsError`. Pass `onExisting: 'replace'` to replace its translations and metadata. The check happens before locale seeding or any write. A batch checks every item before translating any of them; duplicate resolved keys within a batch are always refused. The API uses `fail`; the CLI uses `fail` unless `--override` is passed or an interactive user confirms replacement.

Explained in context: [`core-library.md`](core-library.md#add-resource)

---

### Export Dialog Decisions

The plain footer and plan presentation rules in `apps/tracker/src/app/collections/export-dialog/export-dialog-decisions.ts`. `exportFooter(input)` takes validity, preview state, the plan and busy flags; it returns the ordered footer state, submit permission and primary button token with its count. `exportPlanPresentation(plan, sectionErrors)` adds server output problems to the rail errors. `exportFixSection(formInvalid, outputProblem)` chooses the Output jump only when field validation did not already choose a section. The component binds these Angular-free functions with computed signals.

Explained in context: [`frontend.md`](frontend.md#export-and-import-dialogs)

---

### Export Options Policy

The shared export rules in `exportOptionsPolicy` from `libs/domain/src/lib/export-options-policy.ts`.
Its frozen record holds shared defaults, format and JSON structure guards, and status selection order.
Named predicates identify JSON and rich JSON.
The applicability function also owns the base-property question rule: JSON with include-base, even without rich JSON.
Its advisory function returns reason data for callers to render, including the rich-JSON requirement for metadata output.
Public types describe the policy, choices, formats, JSON structures, option names, and advisory data.
CLI and API collapse an empty base property name to undefined so core applies the default.
The CLI flag record, API mapper, and Tracker draft, dialog, and preview consume this browser-safe policy.
The default statuses come from `NEEDS_WORK_STATUSES`.
CLI prompts and Tracker drafts initially select XLIFF, but CLI resolution leaves format unset and the API requires it.
Only the CLI renders advisories, with its existing text.
ADR-0002 supersedes ADR-0001 because export gained API and Tracker consumers.

Explained in context: [ADR-0002](../docs/adr/0002-export-options-policy-in-domain.md)

---

### Export Run

One export of one or more [collections](#collection) to one file per target locale. In code, `runExport(collections, options)` in `libs/core/src/lib/export/run-export.ts` is the whole run: it validates the base property name, status filter, and output directory, resolves the output path from the explicit option, configured folder, or default, uses the `export` scope of the [Collection Set](#collection-set) to choose locales (every collection's target locales, narrowed to the requested ones) and flatten resources, filters each collection's resources by status and tags for the locales it has, annotates [protected terms](#protected-term), writes the JSON or XLIFF files, and returns the totals, an outcome per locale, the [Run Outcome](#run-outcome), and the Markdown summary. An invalid or empty status filter raises `InvalidTranslationStatusError` before resources are read. An omitted core status filter exports all statuses. The CLI defaults to `new,stale`. The domain [Export Options Policy](#export-options-policy) owns shared defaults and reuses the base property name constant that core consumes. An empty `locales` list means no target remains. It calls `onStart` with the resolved path and locales before reading resources, so the CLI can print the plan. Collections with targets must share one [base locale](#base-locale); otherwise the run raises `CollectionBaseLocaleMismatchError`. The CLI flag record reads defaults and prompt preselection from the Export Options Policy. A prompt answer with no selected collection, locale, or status is refused.

The API's `ExportJobService` owns preparation for both dry-run and start. Dry-run maps the prepared plan without writing. Start rejects a prepared `outputProblem` synchronously before registering a job: `POST /exports` returns HTTP 400 with `{ statusCode: 400, message: outputProblem, error: "Bad Request" }` for an unwritable output folder or a path that is a file. A valid start queues the exact prepared object for `writePreparedExport`. The Tracker blocks submission when its dry-run plan has an output problem.

Explained in context: [`core-library.md`](core-library.md#export-pipeline)

---

## F

### Flag Record

One CLI option or positional argument declaration in `apps/cli/src/runner/flag-record.ts`. It owns spelling, help, parsing, defaults, optional per-field questions and selection metadata. Its optional `appliesWhen(values)` predicate declares applicability. `flagQuestions` skips supplied fields with applicability metadata and evaluates the predicate before asking, using supplied flags over prior answers (including false and empty strings). Only dynamic `type` and `choices` callbacks on records with `appliesWhen` or `mergePromptAnswers: true` receive that merged view. Import opts its format-detection and locale-choice records into merging; callbacks on all other records receive prior answers unchanged. `flagAdvisories` calls each supplied field’s `inapplicableMessage` once and lists returned diagnostics in record order; values are retained. Diagnostic factories reuse applicability predicates but can cover additional inert cases without changing the prompt gate, such as a base property name without rich JSON. `FlagRecords` and `defineFlags` require every command options key. `PromptFactory<Options, Context>` is the shared question-factory signature, receiving options, context and the declared default. Export and import extend these records with typed `resolve` rules through `ResolvingFlagRecords`; `resolveFlag` receives parsed values and the declared default, without a context. `flagQuestions` supplies the prompt context and default and preserves record order or explicit `promptOrder`. The Command Runner appends a command's `prompts` questions after flag-level questions. Export and import pass prompt-free runner flags through `withoutFlagPrompts`, while their question builders use the full records with command-specific context.

Explained in context: [`cli.md`](cli.md#command-runner)

---

### Folder Address

A dot-delimited path to a folder in a [collection](#collection), such as `apps.common.buttons`. The empty address names the translations root.

Pure Folder Address arithmetic lives in `libs/domain/src/lib/folder-path.ts`, exported through `@simoncodes-ca/domain`.
`folderPathSegments` and `folderPathFromSegments` convert between addresses and segments.
`parentFolderPath` returns `null` for the root or a top-level folder; `folderPathLeaf` returns the last segment.
`collectAncestorPaths` returns strict ancestors, outermost first, excluding the root and the address itself.
`isDescendantFolderPath` tests strict descendants; `isFolderPathUnder` also includes the source folder.
Both tests require segment boundaries, so `apps.x` is not under `app`.
`rebaseFolderPath` replaces a source prefix and leaves unrelated addresses unchanged.
`joinFolderPath` combines a folder and a key; `resolveResourceKey` delegates to it.
The root has no segments. Non-root paths keep empty segments verbatim.
Paths with empty segments are malformed and rejected by key/folder validation, never silently collapsed.
Arithmetic does not trim whitespace or validate input.
Resource key resolution retains its whitespace-only target-folder convention: that target means the root.

Core's `libs/core/src/lib/resource/folder-address.ts` retains filesystem resolution and caller-specific validation errors.
It validates each segment with the domain `isValidSegment` rule and resolves the address beneath the collection's `translationsFolder`.
It also checks whether that path exists.

One shared segment check rejects symbolic links below the translations root.
Walks return an unreadable problem; direct resolution raises `InvalidCollectionFolderError` with kind `invalid` (HTTP 400).
Production Resource Folder opens also check the collection boundary before reading and saving.

Folder create, delete and move decide whether the root is allowed and retain their own error labels.
`createFolder` returns the resolved Folder Address as `folderAddress`, with a whitespace-only parent treated as the root.
Wildcard resource moves use key-style diagnostics for their prefix.

Explained in context: [`core-library.md`](core-library.md#resource-crud-flows)

---

### Folder Draft Session

The inline folder-create flow shared by the sidebar and translation editor picker. `FolderDraftSession` in `apps/tracker/src/app/browser/store/folder-draft.ts` exposes `state`, `isCreating`, `start(parentPath)`, cold `confirm(name, parentPath?)`, `edit()`, `cancel()` and `reset()`. Its adapter supplies the create write, optional state storage, start guard, parent reveal and created-folder effects, and the stale-draft policy. The session owns draft identity, pending writes, inline refusal settlement and stale outcomes. The adapter state holds the only identity counter; start, cancel and reset increment it. A cancelled or replaced draft cannot be settled by an older write. Folder Writes stores the sidebar draft in collection state and calls `reset()` on collection reset. The picker uses session-local state, closes its own stale draft, and supplies local expansion, selection and the `folderCreated` output. Its keyboard navigation stays in the component. The two instances keep the modal picker independent of the sidebar behind it. [Write Run](#write-run) still guards HTTP and cache effects against the Browser Session.

Explained in context: [`frontend.md`](frontend.md#folder-draft-session)

---

### Folder Move Plan

The Tracker's pure store-side decision for a successful or failed folder move. It is separate from the core [Move Plan](#move-plan) inside Move Run. In `apps/tracker/src/app/browser/store/folder-move-plan.ts`, `planFolderMove` receives the current tree and expansion plus the source node captured before HTTP, then returns expansion changes, the path to show, and either a tree patch with any destination-child load or a root reload. `planFolderMoveRollback` restores an absent source only when its parent is loaded. Folder Tree applies these decisions through `applyFolderMove` and `restoreFolder`. Folder Writes calls these methods after its [Browser Session](#browser-session) guard. It owns HTTP, navigation, and outcomes.

Explained in context: [`frontend.md`](frontend.md#optimistic-updates-with-rollback)

---

### Folder Peek

A read of one folder's entries without changing the [List Scope](#list-scope). `FolderPeek.openFolderPeek()` gives each translation editor dialog a scope with its own successful-read cache. A later dialog gets a fresh scope and fresh data. `openByFullKey` also opens a fresh scope for each hand-off. Concurrent scopes share an in-flight API request, but no completed result. A response from an earlier [Browser Session](#browser-session) is dropped; a failed read can be retried.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Folder Pruning

The one empty-folder removal rule, in `libs/core/src/lib/resource/folder-pruning.ts`: `pruneEmptiedFolders(collection, emptiedFolderPaths, options)` for writes and `pruneEmptyFolders(collection, { startPath?, dryRun? })` for batch repair. Resource Folder saves report emptied folders; each write prunes the deduplicated paths once at the end of the operation, after entry mutations and through its Mutation Sink, with pruning problems reported as warnings, except that failure to remove an already-empty folder-move source is an error. Folder moves also remove any parent folders that become empty. Batch repair processes collection folders deepest first; neither path removes the translations root. A folder qualifies only after its subfolders disappear and only these files remain:

- `resource_entries.json` with zero entries (`{}`)
- Valid `tracker_meta.json`, only with absent or empty entries
- OS junk from `PRUNABLE_OS_JUNK_FILES`: `.DS_Store`, `Thumbs.db`, `desktop.ini`.

Other files, hidden directories, resource entries, and unreadable or malformed collection files protect the folder and its ancestors. Unlistable folders also stay. Pruning enumerates through the [Collection Tree Scan](#collection-tree-scan) and its adapter to reject symbolic links in the start path; it has no separate `lstat` loop. A rejected link stays with reason `problem`.

The shared result reports removed addresses, kept folders with reasons, and problems. Move Cleanup (`move-cleanup.ts`) folds this result into source-removal counts and ordered warnings and errors. Move Run owns source attribution and diagnostic severity, including overlapping sources and already-empty sources. Removal rechecks entries before deletes and unlinks `resource_entries.json` last, immediately before `rmdir`. Partial-removal problems name the deleted files. With a sink, each removal immediately emits a [Resource Mutation](#resource-mutation) (`remove-folder`). A dry run reports the same planned removals without writes or mutations.

Without locks, pruning can delete another writer's fresh `tracker_meta.json` before the entries recheck keeps the folder and reports a problem. The next normalize recomputes the metadata, so a `verified` status is not restored and becomes the recomputed status.

A supplied `startPath` includes the start folder and excludes its ancestors. Normalize uses the whole collection without a mutation sink. Folder move uses its source subtree and reports removals to its sink.

Explained in context: [`core-library.md`](core-library.md#folder-pruning)

---

### Folder Response Mapper

The pure API projection in `apps/api/src/app/mappers/folder-response.mapper.ts`. `mapCreateFolderResultToDto(result, folderName)` builds a loaded empty insertion node with the submitted name and core's resolved [Folder Address](#folder-address), even for an already-existing folder. The delete and move controllers use one-line payload projections. Deletion adds the successful deletion marker. Moves exclude internal [Run Outcome](#run-outcome), preserve diagnostic arrays and default an absent folder count to zero. The mapper performs no validation or I/O.

Explained in context: [`api.md`](api.md#mapper-layer)

---

### Folder Writes

The Tracker UI's one store feature for creating, deleting and moving folders, and for dropping a resource into a folder. `withFolderWritesFeature` in `apps/tracker/src/app/browser/store/features/with-folder-writes.feature.ts` returns a cold `Observable` of a typed outcome from each write. Its writes delegate collection guards, session capture and refusal normalization to [Write Run](#write-run). Its `requestFolderMove` entry point checks the drop and uses Write Run's shared `confirmThenWrite` helper to ask for confirmation in the [Browser Session](#browser-session) before moving the folder. `folder-drop.ts` is the pure rule shared by the sidebar drop targets and the write feature: it returns `canLand` for the CDK target and a separate no-op reason for a folder or resource dragged onto a folder path or the collection root. A folder can land on its current parent; Folder Writes then returns `already-at-location` so the sidebar shows its existing info toast. A resource at the collection root has `folderPath: ''` and can be dropped into a folder. The feature refuses every write in a read-only collection before HTTP and updates cached tree and rows only in the session where the write began. The [Folder Move Plan](#folder-move-plan) decides the tree, expansion, reload, navigation, and rollback effects of folder moves. A failed optimistic move restores only the moved item against current state when its parent is loaded; an unloaded parent gets its children on its next load, so a newer tree load survives. Deletion shows the parent only if the current folder is the deleted folder or one of its descendants. Every outcome carries the [Outcome Feedback](#outcome-feedback) it decided, so a caller renders it and decides nothing; folder writes do not set the shared load `error`. A create refusal reads inline, under the still-open input, in both the sidebar and the picker; a new folder is silent and an existing one toasts info. The sidebar delegates its draft to [Folder Draft Session](#folder-draft-session), backed by this feature's collection state. The picker uses another instance with local state; its `createFolder` never touches the sidebar draft. Inline refusals remain open until an edit, cancel, restart, successful create or collection reset. Toast refusals keep the input open without an inline error. `requestFolderDelete` mirrors `requestFolderMove`: it asks the caller to confirm inside the session guard.

Folder Writes requires the [Browser Mirror](#browser-mirror) methods `mirrorWrite`, `beginMirrorMove` and `rollbackMirrorMove`. The mirror owns tree and row edits, optimistic capture, rollback and follow-up navigation or loads. Folder Writes declares no foreign cache state and patches only its own operation and draft state.

Explained in context: [`frontend.md`](frontend.md#optimistic-updates-with-rollback)

---

### Form Attempt State

The shared attempt and refusal state in `apps/tracker/src/app/collections/store/form-submit-attempt-state.ts`. `FormAttemptState` owns `attempted`, `errors`, `check(form)`, error reveal rules, `clear`, `fail` and `clearOnEdit(form)`. It records attempts and marks invalid forms touched. [Form Submit Attempt](#form-submit-attempt) and [Job Start Attempt](#job-start-attempt) compose it; each owns its own saving lifecycle.

Explained in context: [`frontend.md`](frontend.md#export-and-import-dialogs)

---

### Form Submit Attempt

The named-entry submit helper in `apps/tracker/src/app/collections/store/form-submit-attempt.ts`. `FormSubmitAttempt<TResult extends { name: string }>` composes [Form Attempt State](#form-attempt-state) and `NamedEntrySubmit` from [Dialog Config Submit](#dialog-config-submit). Its existing `submit({ dialog, write })` API owns preparation, saving, name conflicts and refusal rendering. Configuration supplies the entry, prepare callback, optional refusal mapping and name-conflict hook, and error reveal rule. `detailsElseMessage` prefers string server details over the fallback message. [Bundle Form](#bundle-form) uses that mapping and opens Output on name conflict; [Collection Form](#collection-form) shows the refusal message and reveals errors after touch.

Explained in context: [`frontend.md`](frontend.md#bundle-form-dialog)

---

## I

### ICU Message

The one parse of a translation value in `libs/domain/src/lib/icu-message.ts`. `parseIcuMessage(source, { interpolation, lenient })` returns a range-annotated tree (literal, pound, argument with `icu` or `transloco` syntax, plural/select/selectordinal group with cases, error) and never throws; malformed spans become error nodes that keep their brace-delimited content, so conversion stays total. `lenient` accepts what the MessageFormat runtime parser accepts; argument comparison, plural portability and preferred-terminology ranges read values that way. [Transloco](#transloco) to [ICU Format](#icu-format) conversion, bundle export, syntax validation, placeholder extraction, classification, argument comparison and plural portability are thin functions over this tree, so they share one parse instead of each scanning braces and quotes. A few lexical tests remain on top of it: `hasBareSelectorBefore` in the bundle expander, the Transloco-matcher test in `hasUnbundlableBranchBody`, and the classifier's plain-brace-frame check. Interpolation mode deliberately keeps the position test stored values were converted under, so `offset:2other{{x}}`-style behaviour is preserved on purpose. The [Stored Value Check](#stored-value-check) owns the syntax findings over this tree; `@messageformat/core` compiles per locale separately. Explained in context: `domain-and-data-model.md`, `bundle-generation.md`.

### ICU Format

The [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) standard for representing locale-sensitive strings. LingoTracker stores translation values in ICU format internally. Simple placeholders use single braces: `Hello {name}`. Complex constructs use keyword-based syntax: `{count, plural, one {# item} other {# items}}`. The Resource Folder converts Transloco `{{ name }}` placeholders to ICU when it writes a base value, translation, or copied entry. Legacy values are converted only when their entry is written; opening or saving a folder does not normalize other entries. The conversion is idempotent, so an already-ICU value keeps its bytes and checksum. The [Stored Value Check](#stored-value-check) checks conversion safety first; Resource Folder holds unsafe braced values unchanged, and Import Run rejects them before conversion and auto-fix.

During [bundle](#bundle) generation, simple `{varName}` placeholders are converted to Transloco's `{{ varName }}` syntax. Complex ICU constructs are passed through as-is because Transloco's messageformat pipe handles them natively.

The [ICU Message](#icu-message) module owns parsing and range-based conversion of translation values.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`bundle-generation.md`](bundle-generation.md)

---

### Import Dialog Decisions

The plain footer and plan presentation rules in `apps/tracker/src/app/collections/import-dialog/import-dialog-decisions.ts`. `importFooter(input)` takes collection, listing, upload, validity, preview and busy values; it returns the ordered footer state, submit permission and primary button token with its count. `importPlanPresentation(plan, listing)` returns ordered notes, file rows, locale counts, nontrivial status transitions, capped issues and auto-fixes with overflow counts, failures and whether every file is unreadable. `importFilesError(input)` maps a revealed file problem to its message token. The component binds these Angular-free functions with computed signals and retains drag-and-drop DOM handling.

Explained in context: [`frontend.md`](frontend.md#export-and-import-dialogs)

---

### Import Run

One file import into one locale of one [collection](#collection). `runImport(collection, { source, format?, locale, ...options })` in `libs/core/src/lib/import/run-import.ts` detects the format, reads JSON or XLIFF through its adapter, emits a large-source warning before the run header, applies the resources, and returns the result with a lazy `summary()` renderer. Source failures raise `ImportSourceError` before any resource write. `importResources(collection, resources, options)` remains the entry point for callers with parsed resources. Its ordered steps open a session (strategy defaults and the collection's [Project Terms](#project-terms)), resolve Transloco references (migration only), reject unsafe incoming values and base values through [Stored Value Check](#stored-value-check), normalize placeholders, apply [Placeholder Repair](#placeholder-repair), validate, then check the translation contract through Value Admission (`import`, with `referencesResolved` for migration) and merge per [folder](#resource-folder). The session and CLI prompts share domain's `DEFAULT_IMPORT_STRATEGY` and import locale rule; the prompts use `importableLocales` for choices. The session and migration confirmations read defaults from the domain [Import Strategy Policy](#import-strategy-policy). `apps/cli/src/commands/import-cmd-flags.ts` leaves import strategy and update switches unset, and `apps/cli/src/commands/import-cmd.ts` passes omitted comment, tag, and create-missing switches as undefined, so `libs/core/src/lib/import/import-session.ts` applies the selected strategy's defaults. The CLI resolves an omitted `--preserve-status` to false before calling core. `apps/cli/src/commands/import-cmd-flags.ts` supplies this value, the default strategy, and the base-validation default to command resolution and help labels. Base-value validation stays on unless the user gives `--no-validate-base`. An `ImportSession` holds its settings, terms, changes, warnings, errors, and written files. `recordImportIssues` in `import-session.ts` is the rejection channel: each issue supplies its key, reason, and explicit diagnostic, and the operation derives the failed change and error. Validation returns one issue list, including empty-value skips without errors. The optional `diagnosticOrder` rank preserves diagnostic order independently of change order within a batch. Validation changes retain input order, while conflict diagnostics precede key errors and repeated conflict keys share one diagnostic. Missing-base and folder-read failures remain change-only outcomes. A base-locale import without the migration strategy raises `InvalidImportLocaleError`.

Core owns the imported count and completed outcome. `sessionResult` derives `resourcesImported` from `resourcesCreated + resourcesUpdated`, so CLI output, Markdown summaries, and API responses share the same count. `runImport` fails when resources fail or errors exist, including in a dry run. Consumers read that outcome. `summarizeImportRuns(runs)` owns multi-file totals (`entries`, `imported`, `created`, `updated`, `skipped`, `failed`, `changed`) and fails the overall outcome when any run fails. `changed` sums distinct affected files per source, so the same destination file can count once per source. The API adds only source failures, which have no core run, to the overall failure decision.

Explained in context: [`core-library.md`](core-library.md#import-pipeline)

---

### Import Strategy Policy

The one place that defines what each [import run](#import-run) strategy means: `importStrategyPolicy(strategy)` in `libs/domain/src/lib/import-strategy-policy.ts`. Its frozen records hold creation, comment and tag defaults, base-locale permission, reference resolution, source-status preservation, and unchanged-value status and checksum rules. `statusOnUnchanged: 'untouched'` leaves update imports' unchanged values and metadata alone; `reconfirmsUnchanged` controls base-checksum refresh. `resolveImportStatus` handles both status fields exhaustively. `IMPORT_STRATEGIES` and `isImportStrategy` expose the table's valid keys; an invalid policy lookup throws. Core processing and CLI prompts consume the policy; domain reads no files.

Explained in context: [`core-library.md`](core-library.md#import-pipeline)

---

### Index Readiness

The Tracker's one cancellable wait for a [Collection Index](#collection-index). `IndexReadiness.whenReady(poll, purpose, notReadyMessage)` in `apps/tracker/src/app/browser/services/index-readiness.ts` calls the supplied poll function synchronously on subscription (callers delegate to `BrowserApiService.getCacheStatus`), emits each status, and completes on `ready`. Overlay HTTP failures pass through as [API Error](#api-error); an index `error` status emits and completes the overlay wait, retaining the DTO stats and its message (or null when empty). Tree-wait HTTP failures become `CollectionIndexNotReadyError` with the API Error message. `INDEX_WAIT_POLICY` contains both policies: `overlay` polls every two seconds without a limit; `treeRead` polls sequentially, one second after each response, with `deadlineMs: 5000`. Deadline completion permits one final tree request, so a tree ready by five seconds still loads. Unsubscribe stops the wait.

The cache-status feature projects emissions into overlay and statistics state and loads missing content on ready. A tree HTTP 202 waits through this service with the bounded `treeRead` policy, then requests the tree once more on readiness or deadline completion; a second 202 raises `CollectionIndexNotReadyError`. An index `error` during a tree wait has the same error type, using the server message or the original 202 message. An index `error` fails a tree wait immediately rather than retrying for five seconds. Tree-request HTTP errors remain API Errors. [Browser Session](#browser-session) changes cancel the previous overlay wait, while existing loader guards reject stale results.

Explained in context: [`frontend.md`](frontend.md), [`api.md`](api.md#polling-flow-from-the-frontend)

---

## J

### Job Registry

The API's in-memory runner for background jobs. Each `JobRegistry` instance owns a serial queue, UUID-keyed jobs, lifecycle timestamps, DTO snapshots, and eviction of finished jobs after 30 minutes or when a new job would exceed 100 retained jobs. Queued and running jobs remain until they finish, even above the cap. `BundleJobService`, `TranslationJobService`, `ExportJobService` and `ImportJobService` each have their own instance. Preconditions run synchronously before registration. Export preparation and dry-run belong to its job service; a prepared output problem rejects `POST /exports` with HTTP 400 and its message, without registering a job. Import start inspects every source before registration, while preview keeps source failures as plan entries. Each import job retains one lazy summary renderer, omitted from its HTTP DTO and evicted with the job. A failed run does not stop later jobs in that instance. For bundle jobs, preparation provides config advisories before registration; the job service logs their messages only if generation throws, while successful results carry them through the API mapper. Start returns the initial pending DTO snapshot. Lookup returns a fresh snapshot or raises API-local `JobNotFoundError` with kind `not-found`; an optional owner check hides another collection's job with the same 404 body as an unknown or evicted ID.

Explained in context: [`api.md`](api.md#translation-job-system)

---

### Job Run Lifecycle

The neutral Tracker module in `apps/tracker/src/app/collections/store/job-run-lifecycle.ts`. `JobRunLifecycle<Request, Job, Run>` owns runs keyed by id, publishes run maps through `changes`, and takes a job adapter, [Keyed Storage](#keyed-storage) and a `JobTime` clock/poll scheduler. One 500 ms interval serves bundle, export and import jobs. The adapter supplies start/get calls, job identity, completion detection, snapshot mapping and failure mapping. The neutral `job-run-error.ts` helper preserves server messages and string rule details with a localized fallback.

`start` persists a running seed immediately and turns request errors into failed runs. `startAccepted` publishes temporary busy state, persists only accepted jobs and returns request errors to the dialog, restoring its previous result on rejection or cancellation. The one-key `JobRunController` adapter uses this second policy for export/import and keeps their original single-object storage shape. Each run kind supplies its persisted-run reader and unchanged storage key; `injectJobRun` shares feature subscription and destruction wiring without adding store methods.

`restore()` reads persisted runs, immediately queries active jobs and polls them to completion; a failed resumed request removes that run, including a later polling failure. Starting or resuming replaces the key's previous subscription. `clear(id)` cancels only that key and persists dismissal; clearing the last run removes the storage key. `destroy()` cancels requests and polling. Storage errors are contained by Keyed Storage. Bundle batches stay outside the lifecycle and are never persisted.

Explained in context: [`frontend.md`](frontend.md#bundle-runs)

---

## K

### Keyed Storage

The typed best-effort persistence seam in `apps/tracker/src/app/shared/storage/keyed-storage.ts`. `KeyedStorage<T>` binds one key and a fixed `{ parse, serialize }` codec to a lazy raw adapter. The `json` and `raw` presets keep the wire format paired. `read()` returns a parsed value or absence, `write(value)` persists it, and `remove()` removes only that key. Missing adapters, blocked storage getters, read/parser errors, serialization/quota errors and removal errors are silently contained. No operation throws or logs a storage failure. Injectable browser local/session adapters avoid storage access on the server; `MemoryStorageAdapter` supplies isolated test storage. Theme and UI locale retain raw-string formats; view preferences and bundle runs retain JSON and their existing keys.

Explained in context: [`frontend.md`](frontend.md)

---

## L

### List Edit Merge

`listEditProblem()` and `mergeListEdit()` in `libs/domain/src/lib/list-edit.ts` provide the shared add, remove and set rules for collection tags and protected terms. Every list is an array of strings. Core maps a missing or conflicting edit to a typed, flag-free error; the CLI maps those typed problems to its existing flag messages. Each caller supplies its own normalization: tags use `normalizeTags()`, while protected terms keep case and punctuation with `normalizeProtectedTerms()`.

The Project Terms Update union separates a complete replacement from an incremental `ListEdit`. Both paths retain protected-term normalization.

Domain `validateListEdit` owns string-array, conflict, and missing-edit checks for collection tags and protected terms. Callers supply typed errors and refusal precedence. `assertStringArray` is the shared array assertion.

Explained in context: [`core-library.md`](core-library.md#project-terms), [`domain-and-data-model.md`](domain-and-data-model.md#protected-terms)

---

### List Scope

What the Tracker's translation list shows, and the only loader of its rows. In code, `withListScopeFeature` in `apps/tracker/src/app/browser/store/features/with-list-scope.feature.ts`, a feature of `BrowserStore`. The scope is a folder or a search query (`ListScope = { kind: 'folder'; path } | { kind: 'search'; query }`). Other code asks it to `showFolder(path)`, `showQuery(query)`, `clearSearch()` (back to the folder behind the search, loaded again only when its rows are not that folder's; a no-op when no search is shown) or `reloadList()`. Only the List Scope writes `currentFolderPath`, the busy flag `isListLoading` (of which `isTranslationsLoading` and `isSearchLoading` are readings) and its own error `listError`, and only it loads the rows (`translations`, `searchResults`); the [Browser Mirror](#browser-mirror) owns write-driven edits to both caches and optimistic row capture and restoration. Every load runs through one `switchMap`, so a newer scope cancels an older load, and the [Browser Session](#browser-session) cancels it on every open, which also stops its Index Readiness wait. One failure rule (`handleLoadFailure` in `store/load-failure.ts`, which the folder tree's loads share): when the index is not ready and a list has already loaded in the session, the list goes back to the last scope that loaded (`shownScope`, whose rows are the ones on screen) and a toast gives the reason; any other failure, a search's included, is `listError`, which no other load can clear, shown with a Retry that loads the same scope again. `isDisabled` (folder navigation locked) is derived: a search is shown, or a move is in flight.

Explained in context: [`frontend.md`](frontend.md#list-scope--what-the-list-shows)

---

### Locale Freshness

The [Resource Folder](#resource-folder)'s rule for relating a locale's translation to the current base value. Its private functions in `libs/core/src/lib/resource/resource-folder.ts` compare the locale's `baseChecksum` with the stored base-locale checksum, falling back to the source value's checksum only when base metadata is missing. The folder owns that lookup for translation writes, normalization and unchanged-value import reconfirmation. The domain [Staleness Rule](#staleness-rule) supplies the status after base drift.

A base edit records the current `baseChecksum` even for a translation it makes `stale` or `new`; checksum equality alone does not mean approval. Normalization also refreshes the reference, keeping `new` and marking older-base translations `stale` (or `new` for a copy of the base). A status-only write keeps the reference; reconfirmation owns checksum refresh. ICU syntax conversion rebases only references to the original base value and preserves statuses. `reconfirmTranslation` applies the [Import Strategy Policy](#import-strategy-policy), reporting the resolved status and whether metadata changed: update leaves unchanged translations untouched, migration keeps its existing reference, and translation-service and verification refresh it. [Translation Write-back](#translation-write-back)'s snapshot comparison remains a separate concurrency check.

Explained in context: [`core-library.md`](core-library.md#resource-crud-flows)

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

### Locale Files

The filesystem phase of [Collection Change](#collection-change), in `libs/core/src/collections-manager/locale-files.ts`. `openLocaleFolders(collection)` opens every [Collection Sweep](#collection-sweep) folder before writes and refuses an unreadable folder. `seedLocaleFiles(folders, locale, onSave?)` and `dropLocaleFiles(folders, locale, onSave?)` return `{ entries, filesUpdated }`, save only changed folders, and call `onSave` after each save attempt, including failures. They never write config. Seeding preserves existing translations and gives missing locales a `new` base-value copy; dropping removes values and metadata.

---

### Locale Seeding

What each of a [collection's](#collection) target locales gets when a resource's base value is written: the translation the caller supplied, else an auto-translation from the [Translator](#translator) when the collection enables it, else (or when the Translator skipped the locale) a copy of the base value with status `new`, except that on edit a real translation is kept (and is `stale`). In code, `seedLocales(collection, request)` in `libs/core/src/lib/resource/locale-seeding.ts`. `addResource` applies it to every target locale; `editResource` applies it after a base value change, to the locales that need work by the [staleness rule](#staleness-rule), and never replaces a real translation with a copy. A locale that is missing from a stored entry gets the same fallback, a `new` copy of the base, from the [Resource Folder](#resource-folder)'s `seedLocale`, which add-locale, edit-collection and normalize share. The API, the CLI and the Tracker do not decide this themselves.

`parseTranslationInputs(raw)` in domain checks supplied translations once: an array of objects with a non-empty string locale, string value, and optional status from `TRANSLATION_STATUSES`. It returns a typed list of `TranslationInput` values or the first failure's zero-based item index and reason (a null index means the input is not an array). Core's `AddResourceParams.translations` uses the same type. The CLI owns JSON decoding and flag diagnostics; it also parses interactive translation answers through this function.

Explained in context: [`core-library.md`](core-library.md#locale-seeding)

---

### Locale Selection

The one pure value for density, the locale filter and the remembered compact locale in the Tracker (`apps/tracker/src/app/browser/store/locale-selection.ts`). Its transitions select locales, switch density and restore saved preferences; its projections give the locales and filter label to show. Entering compact remembers the full selection; leaving restores it unless the user changed the compact selection. The default compact locale is the available base locale, else the first available locale. The filter and view-preferences features read and patch this value; the [Stored View Preferences](#stored-view-preferences) module owns the persisted shape, and the feature persists it through [Keyed Storage](#keyed-storage). Repeating the current density is a no-op, preserving the multi-selection across compact → compact → full.

In compact, select-all and clear-all change only the filter; restoration keeps the remembered `compactLocale` even when it displays a fallback. For an empty collection, compact display falls back to the base locale string while restoration selects nothing.

Explained in context: [`frontend.md`](frontend.md#browserstore--feature-composition)

---

## M

### Move Executor

The Move Run module for key, pattern and folder moves. Its only public entry points are `executeMove` and `executeMoves`. `executeMove(collection, selection)` in `libs/core/src/lib/resource/execute-move.ts` accepts `MoveRequest` with `source`, `destination`, optional `override` and `toCollection`. Core infers key versus pattern from the trailing `*` in `source`. Folder selections explicitly set `kind: 'folder'` and may set `nestUnderDestination`. The source is an `OpenedCollection`. Destinations open through `openProjectCollection` from its existing `sourceConfig` and `projectRoot`, inheriting its mutation sink without another config read. It validates once, resolves the destination, sweeps keys, applies [Move Plan](#move-plan), and relocates entries. Each completed selection returns its report, emptied folders, and optional folder source. An interrupted relocation carries its saved empty folders back to the run. The run prunes once through Move Cleanup, then folds its diagnostics into [Move Report](#move-report). `executeMoves(collection, selections)` uses the same preparation and execution, then combines reports, including folder removals.

**Error policy.** Selection and destination preconditions throw from a single move: `CollectionNotFoundError`, `ReadOnlyCollectionError` and `FolderNotFoundError`. A batch converts only the two destination-unavailable errors into per-operation report entries and continues. Malformed addresses, unsafe folder paths, missing source folders and unexpected exceptions throw from either entry point. Every batch validates all submitted addresses, resolves all destinations and checks accepted folder sources before its first write; refused destinations become report errors. Folder no-op refusals still precede source inspection. This preflight is a snapshot, not a filesystem lock: later read/write failures can leave earlier moves and mutations completed. After an exception, the run prunes saved empty folders from completed selections and the interrupted relocation, plus eligible ancestors. This includes exceptions from mutation callbacks after saves. Already-empty subtree repair applies only to completed folder selections. The original exception then propagates; later selections do not execute.

Batch folder sources must exist when `executeMoves` is called. Preflight plans every selection against the disk before writing, so a folder created by an earlier operation in the same batch is not visible to a later selection.

Per-entry missing/read/write failures and sweep problems become report errors. A folder sweep problem prevents every write because pruning an incompletely enumerated tree could lose resources. Pattern selections keep readable siblings moving and prune only emptied source folders and their ancestors, so an unreadable child remains safe. This retains the existing selection semantics. Collisions and no-ops are warnings. Pruning problems are warnings and do not fail completed entry moves; failure to remove an already-empty folder-move source remains an error. The result has no error side channel. CLI output and API statuses and response bodies retain their previous mappings.

Explained in context: [`core-library.md`](core-library.md#move-executor)

---

### Move Plan

The pure move decision before [Entry Relocation](#entry-relocation). `planMove({ source, destination, selection, destinationPath })` in `libs/core/src/lib/resource/move-plan.ts` compares resolved translations roots without filesystem calls. The source and destination are opened collections. This internal seam also owns pure resource-input validation and pattern-prefix rules. A resource selection returns an `entries` plan with both collections, relocations, and `sameCollection`. A folder selection returns a `folder` plan with only `forKeys(keys)`, or a `refused` result.

Folder refusals are `descendant`, `same-location`, and `already-there`, and apply only within the same collection. Each refusal contains warning text or a `FolderMoveIntoDescendantError` value. Move Run decides the throw-versus-warning policy during preflight, before source inspection. Refusals execute no callbacks. The error constructor is the single source of the descendant message. Domain supplies the browser-safe `isDescendantFolderPath(source, destination)` predicate for both Move Plan and the Tracker folder-drop rule.

The selection names a resource key, a pattern prefix with keys, a folder path with nest mode, or an edited entry. A folder plan maps keys that the caller enumerates after the move decision. Its `forKeys(keys)` returns an `entries` plan bound to the same collections and `sameCollection` fact. Folder moves nest by default and always nest at the collection root. With `nestUnderDestination: false`, a destination at the same depth renames the folder, and a different depth nests it. An edited entry with an empty or whitespace-only destination moves to the collection root.

`executeMove` and `editResource` pass the bound plan to Entry Relocation. `executeMoves` uses the same validated execution body. `executeMove` and `executeMoves` return a [Move Report](#move-report). Malformed folder paths and resource patterns throw typed errors before relocation. Cross-collection moves take a plain `toCollection` name. Core resolves the destination through the opened source project before the move decision. Destination handling follows the [Move Executor error policy](#move-executor).

Explained in context: [`core-library.md`](core-library.md#move-plan)

---

### Move Report

The shared result accumulator for `executeMove` and `executeMoves`, in `libs/core/src/lib/resource/move-report.ts`. `MoveReport.merge()` accepts an [Entry Relocation](#entry-relocation) result or a completed move result. It counts moved entries, converts collisions to warnings, and preserves errors. `warn()` and `fail()` add diagnostics. `finish()` returns `{ movedCount, warnings, errors, outcome }`. For folder moves, `finish(true)` also returns `foldersDeleted`.

Errors give a failed [Run Outcome](#run-outcome). Warnings alone succeed. `prune()` adds the counts, warnings, and errors that Move Cleanup supplies from [Folder Pruning](#folder-pruning). The report does not interpret kept-folder reasons or assign problems to sources. Cleanup counts only removal of each selected source folder. Operation-end pruning problems become warnings without changing the outcome of completed entry writes; an already-empty folder-move source that cannot be removed because of a problem fails the move. Malformed folder paths throw `InvalidFolderPathError`. Malformed resource patterns throw `InvalidResourceKeyError` with the unchanged validation message. The CLI exits 1 through its typed-error path, and the API returns HTTP 400.

Explained in context: [`core-library.md`](core-library.md#move-report)

---

### Mutation Sink

`MutationSink` in `libs/core/src/lib/resource/resource-mutation.ts` is the synchronous `onMutation` callback. Every resolved `Collection`, including an Opened Collection, carries a required sink. `openCollection` supplies a no-op sink for CLI handles without a consumer. `openProjectCollection` inherits the project sink. Consumers choose a sink when they open the handle. Individual write options do not override it.

`FileResourceFolder` receives the sink and translations root in its constructor. Its own `save()` reports changed keys after success and reindexes after a failed save. `openResourceFolder(path, collection)` requires the Opened Collection's base locale, root, and sink. `openReadonlyResourceFolder(path, { baseLocale, translationsFolder? })` returns `ReadonlyResourceFolder` without setters or `save()`. `openUnreportedResourceFolder` explicitly retains silent import, normalize, locale rewrite, and fixture saves. Import JSON saves remain silent. Normalize reports successful folder pruning only.

Four internal reporting names remain: `resourceMutations` (payload constructors), `saveResourceRelocation`, `reportResourceDirectoryWrite`, and `reindexResourceCollection`. Relocation uses a private unreported save, then reports all removes before all upserts. A failed relocation reindexes the destination, then a different source collection. Directory operations retain their existing notifications. Lifecycle operations retain broad reindexes. Locale translation binds one internal batch consumer to collect save attempts, then sends one reindex per batch.

The API route pipe attaches `CollectionIndex.sink` to writable and lifecycle handles. The Collection Index applies each mutation without throwing into the write.

---

## O

### Opened Collection

An `OpenedCollection` combines resolved `Collection` config with an [Opened Project](#opened-project). `openCollection` returns this handle. Its Resource Folder saves inherit the Mutation Sink and report successful writes or reindex after a failed save. Cross-collection moves also use its config snapshot and project root to open the destination.

---

### Opened Project

An `OpenedProject` is the config as `loadConfig()` read it (`sourceConfig`) and its directory (`projectRoot`). Collection sinks are required. This project sink remains optional. Its optional `onMutation` sink is inherited by `openProjectCollection(project, name, options?)`. The API supplies one through [Route Project](#route-project) for each project-scoped request; the CLI runner builds one after loading config for each command. Every config write uses `guardedConfigWrite(openedProject)` and refuses a stale read with `ConfigChangedError`. An in-memory config without a read version is used only by tests and cannot be checked.

---

### Outcome Feedback

What a write has decided to tell the user about its outcome: the `Feedback` in `apps/tracker/src/app/browser/feedback.ts`, `{ tone: 'success' | 'info' | 'warning' | 'error', placement: 'inline' | 'toast', token, params?, detail? }`. `token` is a Transloco token, `params` can hold `{ token }` values that are themselves translated (the root folder's label), and `detail` is the failure's own message, which replaces the token's wording. It is plain data produced by pure mappings, so no TestBed is needed to test the choice: `decide*` in `store/folder-write-feedback.ts` for [Folder Writes](#folder-writes) (a `feedback` on each outcome, `null` when the write is silent), and `decideDeleteResource` / `decideTranslateResource` in `store/resource-write-outcome.ts` for [Entry Writes](#entry-writes) (a translate carries an array of feedback for its success and skipped-locales warning). Editor Submit message decisions also carry this feedback, chosen by `refusalDecision` with error tone and inline placement. Collection and bundle submit refusals instead use [Dialog Config Submit](#dialog-config-submit)'s `NamedEntryRefusal` for the existing name-field and form-message placement; success toasts still follow a saved dialog result. Surfaces render it with `feedbackText` or `injectFeedback()` (`text`, and `toast`, which ignores inline feedback).

Explained in context: [`frontend.md`](frontend.md#optimistic-updates-with-rollback)

---

## P

### Placeholder Repair

The domain policy for choosing a repair engine and a trusted base value during an [Import Run](#import-run). `repairPlaceholders({ translation, storedBase, importedBase })` in `libs/domain/src/lib/placeholder-repair.ts` uses Transloco when the stored base has Transloco placeholders. That engine trusts only the stored base: an imported base can contain unresolved references such as `{{greeting}}`. Otherwise, ICU uses the stored base, falling back to the imported base only when the stored base is absent. The `PlaceholderRepair` result distinguishes skipped, matched, fixed, and failed outcomes. Core maps those outcomes to import records and progress messages. [Value Admission](#value-admission) checks the repaired value afterward, with the import policy for its strategy.

Explained in context: [`core-library.md`](core-library.md#import-pipeline)

---

### Preferred Terminology

A global list of rules. Each rule maps a **discouraged** source-language term to the **preferred** term, with an optional `reason`. LingoTracker warns when a base-locale value uses a discouraged term, and suggests the preferred one. It never blocks. Only an unreadable rule file fails `validate`.

The rules are project configuration rather than resource data. They live in a standalone JSON file, a bare array of rule objects. `.lingo-tracker.json` names that file with `preferredTerminologyFile`. Omit the setting and the rules fall back to `.lingo-tracker-preferred-terminology.json` beside the config. Collections cannot override the rules. Core reads the file as a term file (`lib/config/term-file.ts`, shared with the protected-terms files): a missing default file is an empty list, a missing named file is a warning, a file that exists but cannot be used (malformed JSON, the wrong shape, an invalid rule) is an error and reads as empty. Nothing is thrown; the problem travels with the [Project Terms](#project-terms) to whoever ran the check.

Matching is case-insensitive and whole-word, and it covers only the text a reader sees. ICU arguments and selectors, Transloco placeholders, and tags are skipped. The pure rule and matching functions live in `libs/domain`, so the Tracker UI and core share them.

The check runs in core, where the value is stored: `addResource` and `editResource` (on a supplied base value) return `terminology` (`findings`, one per rule the value breaks, and the rule-file `problems`); an [import run](#import-run) into the base locale adds one warning per finding and opens its warnings with a rule-file problem; `validateResources` reports findings as warnings and a broken rule file as a failure. The CLI and the API only render what core returned.

Contrast with [Protected Term](#protected-term), which keeps a word unchanged in translations and blocks imports that alter it.

Preferred-terminology writes share the [Config Write Transaction](#config-write-transaction) with protected-term and config writes in the same update.

The project snapshot contains the loaded rule file with its warning or error. Core converts preferred-terminology flags to a request before structured validation.

Explained in context: [`docs/features/preferred-terminology.md`](../docs/features/preferred-terminology.md)

---

### Preferred Terminology Draft

`PreferredTerminologyDraft` in `apps/tracker/src/app/settings/preferred-terminology-draft.ts` stages settings-page rule edits. It owns rows, normalization, client validation, error visibility, change counts, and mapping server rule-error indexes back to submitted rows. It has no API dependency; [Settings Draft](#settings-draft) owns the Config Write.

Explained in context: [`frontend.md`](frontend.md#protected-terms-in-the-ui)

---

### Prepared Add

An add whose values and advice are ready before any resource file is written. Core's `libs/core/src/lib/resource/resource-entry.ts` owns the phases: `preflightAdd` → `prepareAdd` → `commitPrepared`. `preflightAdd` resolves the folder, validates a non-empty base value and supplied locales and statuses, then checks the [Existence Policy](#existence-policy). The functions and their `AddPreflight` and `PreparedAdd` types are module-private. Single and batch adds use them internally, so callers only submit complete operations.

The Prepared Add contains the collection, resolved key, existence policy, ICU base value, supplied and seeded translations, details, skipped locales when auto-translation ran, and [Project Terms](#project-terms) findings with Translator problems. Preparation uses [Locale Seeding](#locale-seeding) once. Commit reopens fresh state, rechecks existence and writes the captured values through the [Resource Folder](#resource-folder), reporting through the [Mutation Sink](#mutation-sink). Single and batch adds share these phases and retain their result shapes.

[Resource Batches](#resource-batches) preflights every item before preparing any. Each preflight precedes the batch duplicate-key check. Its `recheck` reads fresh state; the batch rechecks every prepared item without an await before its synchronous write loop. Preparation failures and late conflicts write no batch item; filesystem write failures have no rollback.

Explained in context: [`core-library.md`](core-library.md#add-resource)

---

### Project Defaults

The browser-safe setup constants in `libs/domain/src/lib/project-defaults.ts`: `CONFIG_FILENAME`, `DEFAULT_CONFIG`, `DEFAULT_BUNDLE_DIST`, `DEFAULT_BUNDLE_NAME`, and `DEFAULT_TYPE_DIST_FILE`. Core publicly re-exports `CONFIG_FILENAME` and `DEFAULT_CONFIG`; its bundle setup defaults remain internal. CLI flag records and prompt builders import them from domain, so importing metadata or generating help does not load core. Values and prompt defaults are unchanged.

Explained in context: [`core-library.md`](core-library.md)

---

### Project Init

The core operation `initProject(cwd, answers)` creates the initial project config from plain setup values. It applies built-in defaults, creates the first Collection Entry and Bundle Definition, and builds optional translation config. It validates and writes through [Config Write](#config-write), with an exclusive create that refuses an existing file. The result contains `config` and its absolute `configPath`. The CLI supplies flags and prompt answers, then prints the result.

Explained in context: [`cli.md`](cli.md), [`core-library.md`](core-library.md#project-init)

---

### Project Terms

The terms and rules in force for an opened [collection](#collection): effective [protected terms](#protected-term) and project [preferred terminology](#preferred-terminology). `readProjectTerms(collection)` reads fresh files and returns terms, rules, `checkBaseValue(key, value)`, and intent methods. `forGuard(kind = 'target')` throws `ProtectedTermsFileError` for broken protected files and returns terms plus warnings. Source imports warn about preferred files; target guards warn about protected files. `forReport()` splits protected-file errors and warnings for export. `forValidation()` warns about protected files and missing rules, and returns a broken rule file as `loadError`. The advisory base-value check retains its findings and printable rule-file problems. Raw file problems remain internal.

`readProjectTermsView(project)` shares the same file reader. Its `forConfig()` rejects broken protected files, collections before global, and returns data for the API mapper. Its `forTarget({ collection? })` returns stored lists, effective terms, paths and warnings, rejecting broken files global before selected collection. Unrelated collection files do not block a selected scope. Project-wide edits use [Project Terms Update](#project-terms-update).

Explained in context: [`core-library.md`](core-library.md#project-terms)

---

### Protected Terms Request

The protected-term shape assertion and request, view, and result types in `libs/core/src/lib/config/protected-terms-request.ts`. `assertProtectedTerms(value)` rejects an untyped non-string list with `InvalidCollectionError`. [Project Terms Update](#project-terms-update) and [Collection Lifecycle](#collection-lifecycle) share this assertion. The module performs no writes.

Explained in context: [`core-library.md`](core-library.md#project-terms)

---

### Project Term Files

The internal read path for [Project Terms](#project-terms) collection and project snapshots. `readProjectTermFiles(protectedFiles, preferredFile)` in `libs/core/src/lib/config/project-term-files.ts` reads file kinds, collects internal `TermFileProblem` objects, and supplies shared diagnostic wording. Identical protected-file descriptors share one read and one diagnostic during the call. Export therefore reports a missing file shared by global and collection pointers once. Stored-scope pointer carry-over uses this reader, and the preferred editor receives an already-read snapshot from Project Terms. Nothing is cached between calls. Consumers use intent methods instead of interpreting raw problems.

Explained in context: [`core-library.md`](core-library.md#project-terms)

---

### Project Terms Update

`updateProjectTerms(project, update, { onPreview? }?)` in `libs/core/src/lib/config/update-project-terms.ts` returns one `ProjectTermsUpdateOutcome`: `listed` with the view, `changed` with the view and written values, `refused` with the original planning/validation error, or `failed` with the apply/report error, view and confirmed `reverted` fact. `status` is the only discriminator. CLI mappers only map flags; core owns contradictions and incomplete-group refusal order. Complete preferred rules use `upsert`; incomplete flag groups use the exclusive `rule` route. The optional preview callback runs before writes. Both commands render the outcome; the API rethrows unsuccessful outcomes' original errors and retains its success message. Plans and reports are internal.

Core resolves pointers, paths and term snapshots once. Incremental preferred edits require a usable previous rule file; a full replacement validates submitted rows and can overwrite a broken file. A broken preferred list returns `failed` when listed alone and remains advisory in the view of a combined protected edit. Writes use the [Config Write Transaction](#config-write-transaction). `reverted` confirms restoration of every attempted write; a concurrent config change prevents restoration. Original errors retain their identity and carry restoration failures as their cause.

Each written result carries its sole outcome in `action`. `protectedTermsResult.action` is `updated` or `cleared`; `preferredTerminologyResult.action` is `added`, `updated`, `removed`, `set`, or `cleared`. An applied protected list edit that writes an empty list reports `cleared`, including no-op edits. Both kinds report an empty replacement as `cleared`, regardless of previous contents. Preferred single-rule actions mean requested and applied, not that the list changed; removing the last rule remains `removed`. List-only and pointer-only requests have no written result. Pointer changes retain their message and path in `protectedTermsFileChange`; the preview’s `lists` identifies requested lists. The CLI renders the written result directly. Update views and results carry only the typed `preferredTerminologyError` diagnostic, without a nested string `error`. The separate config-read snapshot retains its existing string diagnostic for the API mapper, preserving response shapes. The preview callback remains to guarantee output before writes can fail.

The protected-term request contains `target` and `change`. `change.kind` selects `replace`, `edit`, or `view`. Both replacements and incremental edits write the selected global or collection scope. A collection replacement requires its own file pointer.

The plan reads one project snapshot for its list previews. Protected-term and preferred-terminology refusals use separate problem types in one `InvalidProjectTermsEditError`.

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

A term matches only as a whole word. LingoTracker uses the list in three places. Export marks each string with the terms found in its source, as a `doNotTranslate` array in JSON and as a `Do not translate:` note in XLIFF. Import rejects any translation that omits a term present in the source. The [Translator](#translator) skips (does not store) a machine translation that omits one. All three read the terms in force for a collection as its [Project Terms](#project-terms); nobody passes the list in. `ProjectTermsView.forTarget()` selects a stored scope from `readProjectTermsView()`. It returns terms and warnings and throws `ProtectedTermsFileError` for a malformed file. The config endpoint sends edits to core `updateProjectTerms()`, which checks an untyped list before it writes.

A protected-term replacement selects its scope through `target.collection`. Core writes the collection file when the request names a collection.

CLI scope selection uses `ProjectTermsView.forTarget` on the project snapshot. It reports global and selected-collection problems, and ignores unrelated collection problems.

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

The names a library's `index.ts` barrel exports — everything a caller must know to use it. The `domain` and `core` interfaces expose runtime names with a non-test consumer in `apps/*/src` or another library, plus types needed by callers and operation signatures. Core's use of domain counts. Core also permits explicit, reasoned exceptions in its pin spec: `CONTRACT_EXPORTS` holds `TranslationError`, required by implementers of the public `TranslationProvider` interface; `APP_SPEC_SETUP_EXPORTS` holds `openProjectCollection` and `openResourceFolder`, which must each have an app-spec consumer. Other test-only uses do not justify a public export. App tests that need internal error fixtures import the test-only `@simoncodes-ca/core/testing` entry point. ESLint rejects production imports of this entry point.

`libs/domain/src/index.spec.ts` and `libs/core/src/index.spec.ts` pin and check their own runtime exports without importing across libraries. Each reads consumers with Node `fs` and parses named imports (including aliases and type imports), named re-exports, and namespace imports with dot or literal-string member access. The scans exclude each library's own files, `*.spec.ts`, `*.test.ts`, and `testing/` directories from normal consumption; core separately scans app specs for its listed setup helpers. Failures list every runtime name without a consumer or permitted exception. Type-only exports are excluded. Node dependencies stay in specs; domain's runtime remains browser-safe.

Entry Writes keeps the add phase protocol private; `addResource`, `addResources` and `editResource` keep their public names and signatures.

Sub-barrels own named export lists: core forwards the public errors sub-barrel with `export *`, while the internal error barrel forwards all definitions. The error spec discovers subclasses rather than maintaining another list of internal names, so a new public error needs one list edit in `errors/index.ts`. `reindexMutation` stays internal to core because Collection Lifecycle reports its own mutations. `openCollection` remains public for CLI and other collection consumers.

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

Core's `resolveCheckedResourceKey` validates the input key and optional target folder before it combines them. It raises `InvalidResourceKeyError` with the unchanged domain message. Single and batch add callers, move input and relocation use this check without filesystem access. `resolveResourcePaths` uses the same check for submitted keys before folder resolution, including for `removeEntry`. `resolveResolvedResourcePaths` maps validated or stored full keys without another syntax check. Add preflight, folder batches, import lookup and locale translation use this path resolver. Both path entries retain collection-folder policy. Delete and relocation retain their per-key message reporting.

Explained in context: [`libs-domain.md`](libs-domain.md)

---

### Resource Batches

Core owns writes of many resource entries. `addResources(collection, items)` checks every item for malformed keys and folder addresses, unknown locales, duplicate or existing resolved keys, and unreadable folder JSON before it translates any item. Translation failures also stop the batch before any write. Preflight reads folders but does not create them or check whether a later filesystem write can succeed. It rejects duplicate resolved keys within the batch with `ResourceAlreadyExistsError`; an existing exact key is refused unless `onExisting: 'replace'` is passed. Parent/child keys remain allowed at add time and may later appear as bundle-plan hierarchical conflicts. It then writes in input order and returns created count, deduplicated skipped locales and terminology problems, all findings. A filesystem write failure after preparation (for example, an existing file in the folder path or a permissions failure) can leave earlier entries, or one of the failing folder's two JSON files, on disk; there is no rollback, but earlier items were already delivered through the [Mutation Sink](#mutation-sink). A failed folder save delivers `reindex`. `executeMoves(collection, selections, { onMutation? }?)` is the batch entry point of Move Run. It preflights all selections before writes, executes them in order, and prunes once from their returned cleanup data. The batch records destination-unavailable errors and continues under the [Move Executor error policy](#move-executor). API batches inherit `CollectionIndex.sink` from the opened source collection; the sink receives changes to both source and destination folders.

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

Single-entry mutations belong to the [Entry Write](#entry-write) module.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md)


---

### Resource Entry Draft

The translation editor's view of the [resource entry](#resource-entry) it is writing, as plain data: entry key, target folder, base value, comment, tags, and one value and status for each non-base locale. The pure module `apps/tracker/src/app/browser/dialogs/translation-editor/resource-entry-draft.ts` holds the editor's rules for a draft: dotted-key absorption, key collision, the "Where it lands" tree, tag edits, the create and update DTOs, and the unsaved-work check. It uses the domain's missing-metadata status default. The module has no Angular dependency.

Explained in context: [`frontend.md`](frontend.md#translation-editor-and-the-resource-entry-draft)

---

### Resource Folder

One folder of the translation hierarchy, seen as a unit: its `resource_entries.json` ([resource entries](#resource-entry)) and `tracker_meta.json` ([tracker metadata](#tracker-metadata)) are always read and written together. In code, `openResourceFolder(folderPath, collection)` returns a `ResourceFolder` (`libs/core/src/lib/resource/resource-folder.ts`); the collection supplies a required base locale, translations root, and Mutation Sink. Every core operation that changes resources goes through this module. Import uses `openUnreportedResourceFolder` for legacy silent JSON saves. Normalize and locale rewrites explicitly request writable unreported sweeps. Readers use `ReadonlyResourceFolder`, without setters or `save()`. Single-entry operations open it through [Entry Write](#entry-write). Batch callers group full keys through `folder-grouping.ts`; Entry Relocation owns its lazy folder cache. Whole-collection reads go through it too, by way of the [Collection Reader](#collection-reader), and writes over many folders by way of the [Collection Sweep](#collection-sweep). It converts incoming locale values to [ICU](#icu-format) when an entry is written, computes checksums and owns [Locale Freshness](#locale-freshness) using the domain [staleness rule](#staleness-rule); opening or saving a folder does not rewrite other legacy entries. No caller builds `{ checksum, baseChecksum, status }` itself. Its operations: `setBase` (the staleness rule on a base change), `setTranslation`, `setStatus`, `reconfirmTranslation` (unchanged-value import policy), `setDetails`, `setEntry` (copy/replace with ICU normalization: move, rename, add-resource reset after its existence policy allows replacement; with `targetLocales`, for an entry moved into another collection, it drops the other locales and seeds the missing ones by the `seedLocale` rule), `seedLocale` (the one seeding rule: a missing locale becomes a copy of the base with status `new`, for add-locale and normalize), `dropLocale`, `remove`, and `normalizeEntry(key, targetLocales)`, [normalize's](core-library.md#normalization-pipeline) write path: it converts each stored value once, normalizes tags and returns `valuesConverted`, `tagsNormalized`, `localesAdded` and `changed`. It drops a stray base-locale property, re-records every target-locale translation with a current checksum and its stored status (a translation whose stored `baseChecksum` differs from the base checksum becomes `stale`, see [staleness](#staleness)), puts a changed base through the staleness rule and seeds the missing target locales. Locales outside the collection keep their values and metadata unless ICU conversion changes a value's checksum. An empty `save()` reports the emptied folder without removing its directory; the write collects these paths for [Folder Pruning](#folder-pruning) once at operation end, after entry mutations. `hasMissingFiles()` reports whether either file was missing when opened or after the last non-dry save; file paths remain private. One rule holds everywhere: a locale value with no metadata counts as `new`, in the reader, in validate and after normalize.

An Opened Collection binds its Mutation Sink to the folder save. Changed keys report in their first-write order. An empty save reports removed entries before operation-end pruning. Standalone fixtures use `openUnreportedResourceFolder` with `UnreportedResourceFolderOptions` and remain unobserved.

Its conversion guard uses [Value Admission](#value-admission) with the `stored-entry` policy (default Stored Value Check conversion safety) and holds unsafe braced values unchanged.

Explained in context: [`core-library.md`](core-library.md#resource-crud-flows)

---

### Resource Key

A dot-delimited string that uniquely identifies a [resource entry](#resource-entry) within a [collection](#collection). Segments may contain only alphanumeric characters, underscores, and hyphens (`[A-Za-z0-9_-]`).

Example: `apps.common.buttons.ok`

All segments except the last define the folder hierarchy on disk; the last segment is the entry key within `resource_entries.json`. See also [resolved key](#resolved-key).

Explained in context: [`libs-domain.md`](libs-domain.md)

---

### Resource Mutation

One change to a translations folder: `upsert` (key and stored entry), `remove` (key), `add-folder` / `remove-folder` (path), or `reindex` (a broad or uncertain change). Each carries its absolute `translationsFolder`. Resource Folder saves deliver mutations synchronously through the [Mutation Sink](#mutation-sink). A failed save sends `reindex`, because one JSON file can already be on disk. Dry runs send no mutations. Writes return no mutation array.

The vocabulary lives in `resource-mutation.ts`. The reporting boundary lives in `resource-folder.ts`. Its `reportResourceDirectoryWrite` covers directory creation, recursive deletion, and pruning, which do not save a JSON pair. Failed recursive deletion sends `reindex`. Pruning retains its legacy notifications for successful removals only. Collection config changes retain one reindex per affected root. Locale translation retains one reindex per batch with save attempts, including partial failures.

The [Resource Tree Index](#resource-tree-index) owns the meaning of each mutation for an in-memory tree. Its `apply(mutation)` returns `patched`, `ignored`, or `reload`. A `reindex` or a patch that cannot match the tree invalidates the tree and returns a reload reason. The API decides when to load the collection again.

Explained in context: [`api.md`](api.md#writes-resource-mutations)

---

### Resource Search

The one matcher over a [collection's](#collection) resources. In code, `searchResources(resources, collection, query, { mode, limit })` in `libs/core/src/lib/resource/search.ts`. It reads any iterable of `{ fullKey, entry }`: the [Collection Reader](#collection-reader)'s `resources` for the disk, or the internal `treeResources(tree)` adapter for the [Resource Tree Index](#resource-tree-index). It is pure, so the reader's problems are the caller's to report. `normalizeSearchRequest(request, defaultLimit)` trims the query, reports a single `blank` outcome, defaults invalid limits and caps every limit at 500. The API passes default 100; the CLI passes default 5. The API controller maps its `similar` DTO mode to core's `similar-value` before normalizing. It ranks every match before applying `limit`, so a better match is never lost because it was found late. `searchPage(resources, collection, request)` returns the page, `limited`, and the true `totalFound` counted before slicing. A blank query returns nothing; matching is case-insensitive. Text mode (the default) looks in the full key, the base value (always, under the collection's [base locale](#base-locale)) and every translation. Each hit gets one match type, the key first: `exact-key`, `partial-key`, `exact-value`, `partial-value`. They rank in the order exact-key, exact-value, partial-key, partial-value, then key. Similar-value mode compares the query with the base value only. A value matches when its `normalizedLevenshtein` score is at least 0.8 (`save` / `saved`), or when one text contains the other as whole words (`Save` / `Save draft`) with a score (`shorter / longer` length) of at least 0.4 (`CONTAINMENT_MIN_SCORE`), so a short label inside a long sentence does not count. A fragment inside a word does not count either (`connect` in `connection`, `don` in `don't`: apostrophes are word characters). Hits rank by `similarity`, then a key that contains the query, then key, with `matchType: 'similar-value'`. The API's `CollectionIndex.searchPage` (`GET …/resources/search`, `mode=text | similar`) and the CLI `find-similar` use it. The Tracker's "Similar values" block asks the API for similar mode.

Explained in context: [`core-library.md`](core-library.md#resource-search), [`api.md`](api.md#collection-index)

---

### Resource Summary

One [resource entry](#resource-entry) as the API and the Tracker see it: an explicit address — `fullKey` (`apps.common.buttons.ok`), `folderPath` (`apps.common.buttons`, `''` at the root) and `entryKey` (`ok`) — the base locale and value, and one row per target locale of the [collection](#collection), in collection order, with `value`, `status`, `needsWork` (the [staleness rule](#staleness-rule)'s `needsTranslation`) and `sameAsBase` (`isUntranslatedCopy`, compared trimmed). The base locale and target locales come from the opened `Collection`, never from the metadata. In code, `buildResourceSummary(fullKey, entry, collection)`, `summaryTarget(summary, locale)` and `displayStatus(target)` in `libs/domain/src/lib/resource-summary.ts`; `ResourceSummaryDto` in `data-transfer` is the same type. The Tracker's pure `row-view.ts` turns a summary into what one list row shows.

Explained in context: [`api.md`](api.md#mapper-layer), [`frontend.md`](frontend.md#translation-rows-and-the-row-view)

---

### Resource Tree Index

The core owner of one [collection's](#collection) in-memory resource tree. `ResourceTreeIndex` in `libs/core/src/lib/resource/resource-tree-index.ts` loads the tree through the [Collection Reader](#collection-reader). It applies every [Resource Mutation](#resource-mutation), compares stat fingerprints projected from the [Collection Tree Scan](#collection-tree-scan), extracts subtrees, counts keys, and returns ranked search pages. An optional tree and fingerprint let tests exercise these rules without disk access.

A `reindex` or an incompatible patch returns `reload` and invalidates the tree. Unrelated mutations and patches before loading return `ignored`. Loading records the fingerprint before the tree read. This order lets a later revalidation detect writes that occur during loading. The [Collection Index](#collection-index) owns cache policy and schedules fingerprint refreshes after its own writes.

Explained in context: [`core-library.md`](core-library.md#resource-tree-index), [`api.md`](api.md#collection-index)

---

### Resource Tree Types

The shared read-model types in `libs/core/src/lib/resource/resource-tree-types.ts`: `ResourceTreeEntry`, `ResourceTreeNode`, and `FolderChild`. The [Collection Reader](#collection-reader), Resource Folder, tree loader, and their consumers depend on this type-only module, so the reader does not depend on the tree loader. Core exports these types through its public resource interface.

---

### Response Contracts

The compile-time payload checks in `apps/api/src/app/mappers/response-contracts.ts`. `ResponseContractChecks` asserts equality of core's independently owned locale result types and the response DTOs, normalizing readonly properties. It also checks delete payloads without internal `outcome`, and move payloads without `outcome` or `foldersDeleted`, requiring the always-present diagnostic arrays. It also checks `TreeAnswer['body']` against the tree/status DTO union and the non-ready `TreeRead` statuses against the exact states handled by the tree mapper. A changed payload field or new index state fails API typecheck. This module emits no runtime behavior and keeps core independent of HTTP contracts; locale controllers return results directly, while delete and move controllers project internal fields away. Folder payload and terminology checks also preserve the DTO boundary.

Explained in context: [`api.md`](api.md#mapper-layer), [`core-library.md`](core-library.md#collection-bound-operations)

---

### Route Collection

The API parameter seam for resource, folder, locale, and existing collection registration routes. `@RouteCollection()` supplies the `OpenedCollection` opened by `RouteCollectionPipe` from the already-decoded `:collectionName` param. The pipe reads config once and retains that snapshot on the opened collection for locale writes and move destinations, requires writable access for methods other than `GET` by default, attaches `CollectionIndex.sink` to writable handles, and lets core errors reach the global filter. The filter maps missing or read-only source collections to the existing 404 or 403 bodies. The HTTP contract spec registers `APP_FILTER`. Move destinations follow one separate core rule; core resolves the plain `toCollection` name, and the app filter maps its typed errors. Route Collection has no body validation or DTO mapping. The collection update route uses `@ValidBody(updateCollectionBody)`; collection lookup takes precedence, so an invalid body sent to an unknown collection now answers 404 instead of 400, while an existing collection still answers 400. `@RouteCollection({ lifecycle: 'update' })` opens without requiring writable resources; core refuses effective locale changes on read-only collections. `@RouteCollection({ lifecycle: 'delete' })` allows read-only collections and registrations with missing or non-string translations folders. Both lifecycle handles carry the index sink. Creation uses Route Project; `addCollection` inherits its sink. The Tracker encodes names once in API URL path segments; its router also encodes navigation segments, and `TranslationBrowser` uses the decoded route name directly.

Explained in context: [`api.md`](api.md#component-diagram), [`frontend.md`](frontend.md#route-structure)

---

### Route Manifest

The shared HTTP method and path list (`API_ROUTES` in `libs/data-transfer/src/lib/api-routes.ts`). The API contract spec checks that Nest mounts exactly these routes. Tracker API services build their URLs with `apiPath('POST /api/collections/:collectionName/resources/move', { collectionName })`: the compiler checks the route and its required parameters, and the builder percent-encodes each parameter with `encodeURIComponent`. Services retain query-string handling; static translation assets are outside the manifest.

Explained in context: [`api.md`](api.md), [`frontend.md`](frontend.md)

---

### Route Project

The API parameter seam for project-scoped bundle, config and collection-creation routes. `@RouteProject()` supplies an `OpenedProject` through `RouteProjectPipe` in `apps/api/src/app/config/route-project.ts`, with `CollectionIndex.sink` attached for write requests; GET handles have no sink. It reads config on first use of `sourceConfig` and retains that snapshot for the request. Invalid bodies and no-op config updates keep their existing responses without a config read. Collections opened through `openProjectCollection` inherit the sink; collection creation reports its reindex through the project sink. Config read errors retain ConfigService's HTTP mappings.

---

### Reported Run

The CLI sequence in `apps/cli/src/utils/reported-run.ts`. `reportRun` is the single entry point for grouped CLI run reporting. It accepts counts, warnings, errors, an outcome, a dry-run flag, optional text or JSON presentation, section and notice, optional summary settings, and optional body and completion printers. Summary settings specify the kind, text, directory, and dry-run preview. When supplied, it saves the summary before printing the body. It then prints the [Run Report](#run-report), prints completion text, and announces any summary. The runner still owns the exit code.

Import, export, normalize, translate locale, move, delete resource, and edit resource use this sequence. Only import and export supply summaries. Commands keep their command-specific body printing. Validate keeps its individual warnings and error details or preformatted summary. Bundle keeps its event-driven [Bundle Presentation](#bundle-presentation). Neither fits the grouped report without changes to output.

`RunTiming(now, enabled)` in `apps/cli/src/utils/reported-run.ts` prints the verbose start and completion timestamps and elapsed time for import. The [Command Runner](#command-runner) supplies `now()` from the environment, with `Date.now` as the default. Tests can supply a fake clock. Timing starts in the `onStart` callback from core and completes before summary saving.

---

### Run Report

The private renderer inside [Reported Run](#reported-run) that renders run counts, warnings, and errors. `printRunReport({ counts?, warnings, errors, outcome, presentation?, section?, notice?, dryRun?, summaryPath? })` in `apps/cli/src/utils/reported-run.ts` prints counts on stdout, then `Warnings (N):` and `Errors (N):` on stderr with `- ` bullets, and returns `exitForRunOutcome(outcome)`. A list longer than 10 is capped as `... and N more (full list in <summaryPath>)` only when the command wrote a [Run Summary](#run-summary-writer) file; with no `summaryPath`, or in a dry run, every item is printed. `move`, `delete-resource`, `edit-resource`, `import`, `export`, `normalize`, and `translate-locale` use this grouped presentation through `reportRun`. Commands supply their counts and diagnostic strings; Reported Run owns grouped rendering, optional summary saving, and output order. JSON presentation accepts `{ kind: 'json', payload }` and writes two-space JSON plus a newline instead of text counts, section or notice. Diagnostics and exit outcomes are independent of presentation. Normalize declares its unchanged `{ collections, totals }` payload once. Bundle is excluded from this grouped presentation. It keeps its own [Bundle Presentation](#bundle-presentation) to preserve its pinned event-driven streams.

### Run Options Resolution

The pure CLI step that builds missing-option questions from flags and resolves the runner's typed values and defaults to options for an [Export Run](#export-run) or [Import Run](#import-run). Export returns advisories for the command to print on stderr; import uses the same `flagAdvisories` collector. Both print through `ConsoleFormatter.warning`. In code, `apps/cli/src/commands/export-options.ts` and `import-options.ts` assemble prompt context and selections around shared flag records. Export resolution and the import command collect advisories through `flagAdvisories`. Shared `flagQuestions` owns flag-over-answer precedence for records with `appliesWhen` or `mergePromptAnswers: true`; only their dynamic `type` and `choices` callbacks see the merged values; the [Command Runner](#command-runner) merges submitted answers over flags before final resolution. Export's flag records control JSON applicability and defaults. Export and import declare `appliesWhen` once for both prompt visibility and supplied-but-inapplicable advisories, without dropping resolved values. The base-property advisory has a trailing period and also warns when rich JSON is off, while its prompt still depends only on JSON and include-base. Export resolution rejects an empty status list before the core call and advisories; unknown statuses remain core's responsibility. Import's flag records use the [Import Strategy Policy](#import-strategy-policy) for locale choices and migration prompt initials. Unset strategy switches remain undefined for core to default. The flag records' selection metadata uses the shared flag-record decoder, preserving export's collection → locale → status validation order before the runner looks up collection names. The commands own I/O and rendering; core still validates run preconditions.

Explained in context: [`cli.md`](cli.md#command-inventory)

---

### Run Outcome

Core's `RunOutcome` is `succeeded` or `failed`. Its producers are `runExport`, `runImport`, the locale-bound run, `runValidate`, `generateBundles`, `generatePreparedBundle`, `executeMove`, `executeMoves`, `normalizeCollections`, and `deleteResource`. The CLI maps completed outcomes to exit codes through `exitForRunOutcome`. A `failed` outcome gives exit code 1, even with partial output. A warning or intentional skip alone does not fail a run. `deleteResource` fails when any key could not be deleted (the same errors-present rule as a [Move Report](#move-report)), even if others were deleted; the API's delete response does not carry it. Preconditions that throw have no run outcome.

Move fails when its result contains errors. The [Normalization Pipeline](core-library.md#normalization-pipeline) defines normalize's refused and completed result arms and their outcome rules.

Export ignores errors and hierarchical conflicts in a dry run. Import counts failed resources and errors even in a dry run. Core owns this decision; CLI and API consumers use the recorded outcome, and core totals combine outcomes across import runs. Bundle generation reports outcomes per bundle and fails the whole run on a thrown bundle error or failed type generation.

Explained in context: [`core-library.md`](core-library.md), [`cli.md`](cli.md#errors-and-exit-codes)

---

### Run Result Strip

The shared Tracker presentation component in `apps/tracker/src/app/shared/components/run-result-strip/`. Its `RunResultView` union separates running progress, completed clauses and warning counts, and failed errors and retry labels. The component takes three inputs: `view`, `detailsOpen` and `detailsId`. It emits `retry`, `dismiss` and `detailsToggle`. Callers project the details body and own its open state. A [Run Strip Summary](#run-strip-summary) supplies the translated view.

Explained in context: [`frontend.md`](frontend.md#run-strip-summaries-and-the-run-result-strip)

---

### Run Strip Summary

The plain Tracker presentation derivation for one bundle, export or import run. The modules in `apps/tracker/src/app/collections/run-strip-summary/` return an explicitly typed `{ view, details }` object for the [Run Result Strip](#run-result-strip). Each function takes run state and a translation callback. The bundle function also takes the output pattern, bundle name and base locale. Shared helpers select status headlines and gate details. Import helpers count capped messages, calculate attention and order failed issues before skipped issues. Missing persisted fields receive defaults. These functions do not start jobs or change run state.

Explained in context: [`frontend.md`](frontend.md#run-strip-summaries-and-the-run-result-strip)

---

### Run Summary Writer

The [Reported Run](#reported-run) calls this writer before printing results and announces the saved path after diagnostics and completion text. The CLI utility `saveRunSummary(kind, summary, { dryRun })`, which returns the written `path` and a deferred `announce()` so the private [Run Report](#run-report) renderer can cap its lists against the file, in `apps/cli/src/utils/write-run-summary.ts` owns both persistence and announcement of the import or export run's Markdown summary at a temporary path (`writeRunSummary` does the write). Core supplies the text through import's lazy `summary()` or export's `summary`. The summary file always lists every warning and error (no cap), so a Run Report's `... and N more (full list in <path>)` is accurate; its other sections, such as the modified-files list and detailed changes, remain capped. A real run writes and prints `<Kind> summary written to: <path>`; a failed write only warns and never changes the exit code, which comes from the run outcome. A dry run writes nothing and prints `<Kind> summary would be written to: <path>`; export passes `previewOnDryRun` and also prints the summary text as its only preview, while import renders nothing.

Explained in context: [`cli.md`](cli.md#shared-utilities), [`core-library.md`](core-library.md#import-pipeline)

---

## S

### Selection

The CLI choice of one, several, or all named items. `Selection` in `apps/cli/src/utils/prompt-utils.ts` has `kind: 'all'` or `kind: 'some'` with `names`. `selectionPrompt` builds the question with an explicit single or multiple mode. `parseNameSelection` retains literal flags, while `parseListSelection` parses comma-separated flags. Both functions resolve prompt answers, give flags precedence, and return `undefined` for empty input.

Flag records declare selection defaults and prompt errors; commands apply workflow checks. The prompt sentinel stays private to this module. For many collections, the [Command Runner](#command-runner) passes the resolved Selection and opened collections to `run`.

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

The condition where a translation needs review after the [base locale](#base-locale) changes. A mismatched `baseChecksum` is evidence of base drift; the [Locale Freshness](#locale-freshness) rule also records the current checksum when it marks a translation `stale` or an untranslated copy `new`. A stale resource carries `status: "stale"` in its [locale metadata](#locale-metadata) and will fail CI validation by default.

Resource reads expose stored metadata. Base writes and normalization apply the rule; opening or saving a folder alone does not reconcile drift.

Normalize makes the condition explicit. A target translation whose stored `baseChecksum` differs from the base checksum (for example after a git merge, where one branch changed the base and another verified the translation) becomes `stale` and gets the current `baseChecksum`. A translation whose value is a copy of the base becomes `new`, and a `new` translation stays `new`. Normalize does not erase the signal by re-recording the translation with its old status.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`core-library.md`](core-library.md)

---

### Staleness Rule

The domain module `libs/domain/src/lib/staleness.ts` holds both parts of this rule. `applyBaseChange` sets a translation to `stale` when the base value changes. It sets an identical copy to `new`. When a writer omits the status, `recordTranslation` stores `new` for a copy of the base or `translated` for a different value. It keeps every explicit status, including `translated`. [Resource Folder](#resource-folder) applies these rules through `setBase`, `setTranslation` and its private [Locale Freshness](#locale-freshness) helper during normalization. The module also holds `needsTranslation`; the [Import Strategy Policy](#import-strategy-policy) owns `resolveImportStatus`. `needsTranslation` uses the [translation status](#translation-status) module's `isNeedsWorkStatus` predicate for stored statuses and treats missing metadata as work.

Explained in context: [`core-library.md`](core-library.md#resource-crud-flows)

---

### Stored Value Check

The pure module that answers “what is wrong with this value in its own locale?”. `checkStoredValue(value, { rules?, locale? })` in `libs/domain/src/lib/stored-value-check.ts` returns typed findings for braced placeholders, possibly collapsed case bodies, locale-specific ICU compilation failures and base-locale plural portability. `describeStoredValueFinding` owns their shared wording. `StoredValueRule` names the selectable rules; the module runs them in fixed order: collapsed bodies, braced placeholders, compilation, then portability. `CONVERSION_SAFETY_RULES` is the default and includes every conversion-blocking rule. Compilation requires a locale and is skipped when it is absent or a blocking finding already explains the problem. Each finding carries `severity` (`error` or `warning`) and `blocksConversion`, defined once per rule. Portability is a warning; braced placeholders block conversion. Normalize requests collapsed and braced rules. Validate builds its rule list from compilation and base-locale portability options and maps findings by severity. The finders are internal details, reading the [ICU Message](#icu-message) tree; the check adds no parser. Locale support remains a separate configuration question through `isIcuLocaleSupported`.

[Value Admission](#value-admission) owns the stored-entry and machine-translation policies over conversion-blocking findings. Entry Write rejects changed incoming values; Import Run reports failed changes; Resource Folder holds unsafe values instead of converting them; Translator skips unsafe provider output; the Tracker validator rejects it; normalize reports findings without repairing ambiguous damage; Validate Run reports failures and portability warnings. Reporting callers, including import's syntax stage and validation, use Stored Value Check directly. The [Value Check](#value-check) answers a different question: whether a translation preserves its source.

Explained in context: [`core-library.md`](core-library.md#validation-for-cicd)

---

### Stored View Preferences

The pure Tracker module `apps/tracker/src/app/browser/store/view-preferences.ts`. One field schema in `view-preferences.types.ts` defines the persisted type, snapshot fields and validation. `snapshot(state)` copies the eight preferences from plain values or field readers, excluding transient state and copying arrays. Field readers keep the persistence effect subscribed only to those preferences. `restore(saved, ctx)` returns a partial state patch: absent or non-object data is ignored, corrupt fields are omitted independently, and Locale Selection resolves retired `medium` density and locales removed from the collection. An object with no valid fields still resets density to compact and resolves the locale selection against the current collection. Other preference fields remain unchanged. Missing density in a saved object defaults to compact. Restoration never overwrites full-selection memory. The store feature caches one keyed store per collection and owns the persistence effect.

Explained in context: [`frontend.md`](frontend.md#browserstore--feature-composition)

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

A ranked list of existing translations that match candidate terms in a block of base-locale text. In core, `buildGlossary(collections, text, { extractor?, locales?, includeAll? })` reads opened [collections](#collection) through the `glossary` scope of the [Collection Set](#collection-set), extracts unique unigrams and bigrams by default, and matches them against base values. It returns the JSON payload (`baseLocale`, target `locales`, source counts, `matchCount`, `terms`) and separate unreadable-folder `readProblems`. By default, each entry contributes only its own collection's target locales. An explicit locale list can select stored translations outside those targets; only the base locale is removed. New and stale translations are omitted unless `includeAll` is set. An empty collection set raises `GlossaryNoCollectionsError`; different base locales raise `CollectionBaseLocaleMismatchError`, because one glossary has one source language. The CLI selects input and prints or saves the payload, reporting reader problems on stderr.

Explained in context: [`core-library.md`](core-library.md#term-glossary), [`cli.md`](cli.md#glossary-pipeline)

---

### Term List Edit

The direct file-edit side of [Project Terms](#project-terms), owned by core config. Collection create and update can also provide a whole protected-terms list through the [Collection Lifecycle](#collection-lifecycle). Project Terms Update changes `protectedTermsFile` and carries over the old list. [Project Terms Update](#project-terms-update) previews stored terms, paths, warnings and the effective union before a write, so the CLI can print that view. Protected terms use the domain `ListEdit`: `set`, `add` and `remove` hold arrays; the CLI splits its comma-separated `--set` value. Preferred terminology uses a replacement rule array, one `upsert` rule, or one discouraged term to remove. Core checks missing and conflicting structured edits; the CLI maps each typed `problem` to its flag wording. Core checks incomplete preferred rule fields before structured edit conflicts, preserving refusal order. Core applies protected-term lists through the shared [List Edit Merge](#list-edit-merge). Preferred-terminology upsert and removal match discouraged terms without regard to case; a validation error carries its row details and leaves the file untouched.

Protected-term requests use `{ target, change }`. `change.kind: 'replace'` supplies a complete list; `change.kind: 'edit'` supplies a `ListEdit`.

`ProtectedTermsEditProblem` and `PreferredTerminologyEditProblem` define each command’s own problem codes. The [CLI Error Wording](#cli-error-wording) module covers every problem with a presentation rule.

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

A locale-bound [Translation Run](#translation-run) translates a collection's resources that need work for one target locale. A batch with save attempts emits one `reindex`, including partial failures. Its completed result has a [Run Outcome](#run-outcome): `failed` when any resource failed, otherwise `succeeded`. It stores results through [Translation Write-back](#translation-write-back), so writes made during the provider call survive. Changed or removed entries go into `skippedKeys`. Skipped resources and unreadable folders are reported separately.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline), [`api.md`](api.md#translation-job-system)

---

### Timed UI Transients

The timer helpers in `apps/tracker/src/app/shared/timed-transients.ts`. `createRestartableDelay(durationMs)` exposes `schedule`, `cancel`, and `destroy`. A schedule replaces the pending callback and restarts the delay. Cancellation permits another schedule; destruction cancels the callback and rejects later schedules.

`createFlash(durationMs)` exposes a read-only `active` signal, `trigger`, and `destroy`. A trigger activates the signal and restarts its reset delay. Destruction cancels the reset and rejects later triggers without changing the last signal value. Owners must call `destroy()`. The `injectRestartableDelay` and `injectFlash` wrappers register this cleanup with `DestroyRef`.

Explained in context: [`frontend.md`](frontend.md#timed-ui-transients-and-clipboard)

---

### Translation Batch

The internal translate-and-store operation of [Translation Run](#translation-run). The run’s `selectTranslationRow` selects targets with `needsTranslation` and snapshots them for both callers. `translationBatch` in `libs/core/src/lib/translation/translation-batch.ts` takes full keys, source values, per-locale snapshots, target locales, an opened [Translator](#translator), and the caller’s resolved [Mutation Sink](#mutation-sink). It calls the Translator once, groups translated values by folder with `groupByFolder`, and stores each folder through [Translation Write-back](#translation-write-back). It returns one outcome per key and locale: `written`, `skipped` (provider or stale write-back), or `failed` with a `provider` or `write` stage and the original error. A provider failure fails the entire batch; a write failure fails only that folder's translated values. Earlier writes and provider skips keep their outcomes. The run owns the failure policy and retains the original error when reporting or rethrowing it. Entry callers do not import the batch.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline)

---

### Translation Failure Policy

The `failurePolicy` of core-internal `executeTranslationRun`: `tally` records each failed key/locale outcome and continues to later batches; `throw-first` rethrows the first original failed outcome after the batch. A provider failure applies to every requested key and locale in its batch; a write failure applies to its folder. [Translate Locale](#translate-locale) uses `tally`, and single-entry translation uses `throw-first`. Neither policy changes the [Translator](#translator)'s concurrent provider calls across locales.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline)

---

### Translation List View

The Tracker's status filter, sort, per-status counts and needs-work count for a set of [Resource Summaries](#resource-summary). The pure module is `apps/tracker/src/app/browser/translations/utils/translation-list-view.ts`. `resourceStatusScope(items, locales)` returns per-item counts, status counts and a needs-work count. `translationListRows(scope, selection)` filters the scope and delegates sort to `sortTranslationRecords`, which reuses those per-item counts. Status and sort changes preserve the scope and its counts reference.

The filter and counts use one predicate over domain `statusCountsOver` results. Each status count equals the rows that status alone keeps. Counts use the status-unfiltered resources, and needs work counts the union of `new` and `stale` once per resource.

This projection reads List Scope caches. Writes request cache edits through List Scope methods, so rollback validity stays with the cache owner. Per-collection caches and filter state register their resets through `withCollectionState`.

Explained in context: [`frontend.md`](frontend.md#translation-status-summary)

---

### Translation Run

The handle prepared by `prepareTranslationRun(collection, options?)` in `libs/core/src/lib/translation/translation-run.ts`, above [Translation Batch](#translation-batch). Preparation checks enabled auto-translation and configured target locales, and exposes only `targetLocales` for a prompt. `forLocale(locale)` validates a configured, non-base target and returns a bound run with `collectionName`, `targetLocale`, and `execute({ onProgress? })`. Typed errors keep their existing messages. An enabled collection without target locales raises `NoTranslationTargetLocalesError`. Collection and translation config stay inside the handle. Preparation options contain provider, protected terms, and delay. The collection carries the required Mutation Sink. Internal run execution and write-back use that collection. Locale runs bind an internal batch consumer to preserve one reindex per batch.

The bound run reads resources and selects work through the shared `selectTranslationRow` and the shared [Staleness Rule](#staleness-rule), then executes batches and returns `TranslateLocaleResult`. Its counts, progress, and result types live beside the run in `translation-run.ts`; core retains the public progress and result exports. It opens the Translator once and tallies each key/locale outcome once. `TranslateLocaleProgress` carries the resource counts and batch position; the API job embeds it and maps its counters to the unchanged HTTP response. Core-internal `executeTranslationRun` accepts selected rows × locales and a [Translation Failure Policy](#translation-failure-policy) (`failurePolicy`): `tally` records failed outcomes and continues; `throw-first` rethrows the first original provider or write error. The run opens one Translator, partitions rows into batches, and returns counts, outcomes with fresh entry readback, and Translator warnings. `translateExistingResource(collection, key, options?)` and `TranslateExistingResourceResult` live in `translation/translate-existing-resource.ts`. Single-entry translation opens the Resource Folder directly, selects eligible locales and executes a one-row run with `throw-first`; locale runs use `tally`. It returns fresh entry state and ordered skipped locales, and rethrows original provider or write errors. Entry Writes retains imports of Locale Seeding and Translation Write-back for add and edit; single-entry translation does not import Entry Writes. Neither the executor nor the batch types are package exports.

The run uses the configured delay between batches. Tests inject `delay(ms)` instead of a real timer. Locale runs emit one collection `reindex` after each batch with save attempts, including partial failures. The failure policy also preserves mutation delivery: tally runs coalesce save attempts, while throw-first runs retain each precise `upsert` notification and failed-save `reindex`. The CLI prepares before prompts and binds the chosen locale. The API controller binds before queueing, so invalid requests fail before 202.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline), [`api.md`](api.md#translation-job-system), [`cli.md`](cli.md)

---

### Translation Status

A status (`TranslationStatus` in `@simoncodes-ca/domain`) that tracks the review lifecycle of a non-base locale translation. `TRANSLATION_STATUSES` defines the four values, and `isTranslationStatus` checks input at runtime. `NEEDS_WORK_STATUSES` defines `new` and `stale`; `isNeedsWorkStatus` and `isNeedsWorkStatusSelection` test one status or an exact shortcut selection. `DEFAULT_MISSING_METADATA_STATUS` is `new` for a locale with no stored metadata:

| Status | Meaning | CI validation result |
|---|---|---|
| `new` | Resource added but not yet translated (value is a copy of the base) | Failure |
| `translated` | Has a translation value but not reviewed | Failure by default; warning with `--allow-translated` |
| `stale` | Base locale value changed after translation was written | Failure |
| `verified` | Translation reviewed and approved by a language expert | Success |

The lifecycle flows: `new` → `translated` → `verified`. If the base value changes after `verified`, the status becomes `stale`. A caller can explicitly mark an identical copy `translated` or `verified`. Core checks status values on resource writes and checks each export filter value with the same `InvalidTranslationStatusError`. The CLI decodes `--translations` JSON and passes it to domain’s `parseTranslationInputs` to check shape and statuses. It splits `--status`, rejects an empty status split with its flag message, then passes status values to core.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`bundle-generation.md`](bundle-generation.md), [`domain-and-data-model.md`](domain-and-data-model.md)

---

### Translation Status Summary

The roll-up of a set of locale [translation statuses](#translation-status): the number of locales in each status (`StatusCounts`) and the worst status. The pure module `libs/domain/src/lib/translation-status-summary.ts` holds the rules. `countByStatus(statuses)` counts the statuses and ignores a locale with no status. `statusCountsOver(summary, locales)` counts one resource's display statuses over the supplied locales. A target without metadata counts as `new`. Base and unknown locales contribute nothing. `worstStatus(counts)` applies `STATUS_PRECEDENCE`, which is worst first: `stale` > `new` > `translated` > `verified`. Every roll-up in the Tracker UI uses this module: the rollup ring, the screen-reader breakdown, the locale column, the status filter counts, and sort by status. The Tracker counts each locale's domain `displayStatus(target)`: the stored status, or `new` for a locale that needs work and has no metadata. The glyphs and label tokens are presentation. They are in one Tracker table, `shared/translation-status/translation-status-presentation.ts`, which the rows and the translation editor's status labels both use. Every ranking in the UI (filter rail, tooltip rows, sort, ring arc order) uses `STATUS_PRECEDENCE`, stale first. The rollup ring's arc geometry and tooltip row order are pure functions in `rollup-geometry.ts` next to `TranslationRollup`.

Explained in context: [`frontend.md`](frontend.md#translation-status-summary)

---

### Translation Write-back

The shared rule for storing translations after a provider call. The core-internal `snapshotTranslation` records the stored ICU base checksum and target checksum and status before translation. `writeBackTranslations` in `libs/core/src/lib/translation/translation-write-back.ts` reopens the [Resource Folder](#resource-folder) from disk. It skips missing entries, changed base checksums, changed target checksums or statuses, and targets that no longer need translation. The collection carries the required Mutation Sink. One function serves entry and batch writes through the reported Resource Folder save. It writes the remaining values and saves once, only if it wrote a value. It stores translator-admitted values and seeded copies from Locale Seeding. Write-back is deliberately not re-gated through [Value Admission](#value-admission). Sibling entries survive because the folder contains fresh disk state. Write-back is internal to the Translation Run module. Edit seeding uses a narrow internal import of snapshot and write-back functions: it prepares both auto-translated values and untranslated copies with explicit `new` status through [Locale Seeding](#locale-seeding), so it does not execute a provider run for those copies.

The locale-bound run reports skipped keys. Translation Run coalesces save notifications into one `reindex` per batch with save attempts. `translateExistingResource` in Translation Run reports skipped locales and returns the fresh entry with a count of written locales. [Entry Write](#entry-write) edit phase 2 compares against its saved phase-1 state and preserves concurrent edits or deletions. Edit reports skipped locales only when auto-translation ran. Single-entry callers send `upsert` after success, or `reindex` before a failed save throws. A synchronous TOCTOU gap remains between reopening and saving, and the two-file save is not atomic.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline)

---

### Translator

The one way core machine-translates text for a [collection](#collection). In code, `openTranslator(collection, { provider?, protectedTerms? })` in `libs/core/src/lib/machine-translation/translator.ts` returns a `Translator`: `translate(entries, locales) → { values, skipped }`, and `problems` (a named protected-terms file that does not exist). Opening it checks that the collection's translation config is enabled (`AutoTranslationDisabledError`) and, unless a provider is injected, reads the API key (`TranslationError` `MISSING_API_KEY`) and builds the configured provider. For a whole-locale translation, core first prepares a Translation Run: auto-translation must be enabled, target locales must exist, and the target must be a configured, non-base locale. It reads the collection's [Project Terms](#project-terms) once for the protected terms, unless they are passed (`ProtectedTermsFileError` for a malformed file; a named file that does not exist is in `Translator.problems`, which its callers pass on as warnings). `translate` makes one provider call per locale and ignores the base locale. It never sends complex [ICU](#icu-format). It protects simple placeholders and skips a translation if marker restoration fails. It then uses [Value Admission](#value-admission) with `machine-translation` on restored text: conversion safety, ICU normalization, then source agreement. Conversion safety takes precedence over protected terms, which take precedence over argument mismatch. It skips a translation that dropped a [protected term](#protected-term) present in the source. It returns every value normalized to ICU. Each skip carries a reason: `complex-icu`, `placeholder-mismatch` or `protected-term`. [Locale seeding](#locale-seeding), `translateExistingResource` and the locale-bound run all translate through it; they only choose what needs work (the [staleness rule](#staleness-rule)) and store the values. The provider is the seam: `GoogleTranslateV2Provider` in production, `InMemoryTranslationProvider` (a deterministic transform that records its calls, internal to core) in core's specs. Google requests time out after 30 seconds and fail with a retryable `TranslationError` (`TIMEOUT`); a whole-locale run records that batch in `failures` and continues. An invalid timeout option raises `INVALID_REQUEST_TIMEOUT` when the provider is constructed. The locale-bound run, `translateExistingResource`, and phase 2 of `editResource` store results through [Translation Write-back](#translation-write-back). This shared rule preserves writes made during the provider call. Callers report changed or removed entries in `skippedKeys` or `skippedLocales`.

Explained in context: [`core-library.md`](core-library.md#auto-translation-pipeline)

---

### Transloco

The Angular internationalization library ([jsverse/transloco](https://jsverse.github.io/transloco/)) that LingoTracker is designed to integrate with. Transloco consumes locale JSON [bundle](#bundle) files at runtime. LingoTracker converts ICU simple placeholder syntax to Transloco's `{{ varName }}` interpolation syntax during bundle generation.

Explained in context: [`frontend.md`](frontend.md), [`bundle-generation.md`](bundle-generation.md)

---

### Tree Navigation

The pure `tree-navigation.ts` module in `apps/tracker/src/app/browser/store`. `navigateTree(state, key, options)` receives focused-row facts and returns an explicit focus, expand, collapse, select or no-op intent, plus default-event intent. Only picker Up/Down needs the supplied tree and expanded paths to collect visible folders. Sidebar nodes and the collection root supply their own row facts without building a synthetic tree. `expandTreePath` shares the immutable expansion rule with chevrons and explicit store opens. Picker and sidebar options preserve their different keyboard rules: picker Up/Down moves through visible loaded nodes, Left can focus the parent, Right can expand a leaf, and Enter/Space selects without opening. Sidebar Up/Down and collapsed Left do nothing, Right opens only folders with children or the collection root, and Enter/Space selects and opens a folder with children. Picker handles key defaults even for no-ops; sidebar handles only expansion changes. The sidebar collection root selects without opening.

Explained in context: [`frontend.md`](frontend.md#tree-navigation)

---

### Typed Errors

The errors core raises on purpose. `lingo-tracker-error.ts` uses `defineError` to derive constructor arguments, a stable `code`, `kind`, message and readonly `facts`. `facts` views the existing instance payload without a second copy. Descriptor-based clones retain the same view. `ERROR_CATALOGUE` collects exported constructors by their static code, including handwritten classes with custom behaviour, and supplies `ERROR_CODES`. `TranslationError` has a separate catalogue of known provider codes. Named classes retain their instance types and `instanceof` identity.

`ErrorRules<Result>` derives each code’s optional facts from the catalogue constructors. Runtime subclasses can reuse a code without its usual facts. Rules retain their existing fallback wording in that case. `mapTypedError` dispatches a code-specific rule; unknown codes keep adapter defaults. Adapters read `kind`, `code`, `message` and `facts` without subclass checks or property probes. Core owns kinds and facts; the API owns HTTP mapping and the CLI owns wording.

Core converts domain key and target-folder errors once at the [Resolved Key](#resolved-key) seam. Locale validation uses `assertValidLocale` and raises `InvalidLocaleError` with the unchanged domain message. Both errors have kind `invalid` and map to HTTP 400. Delete and relocation report the typed key error's message in their results.

The API maps `kind` to a default HTTP status. An API-owned code table declares message transforms, status overrides, and inclusion of `facts.details` as response `errors`. `ErrorCode` combines domain and known provider codes so both adapters can type-check override keys. All core error classes live in `errors/`, including translation and terminology validation errors. Core exposes domain facts without HTTP metadata. The filter reads these facts without checks for specific subclasses. The API may define its own `LingoTrackerError` subclasses, such as `JobNotFoundError` with kind `not-found`, because the filter reads only `kind`, `code` and `exposeMessage` to select their HTTP mapping. A core spec reserves kind `upstream` for `TranslationError`, so unknown provider codes keep the same prefix and default 502.

Codes without a row use the kind-derived default HTTP status and original body shape and message (including the existing provider prefix), or the original CLI message and default exit behaviour. Both tables hold only deviations, and specs reject overrides that reproduce a default. The deliberate requirement to decide every new code in each adapter is dropped: the catalogue owns kinds, so repeating defaults at each seam adds edits without adding adapter behaviour. Catalogue iteration and focused override cases preserve the existing outcomes while keeping decisions local to each adapter.

A missing move destination is `CollectionNotFoundError` with the same `not-found` kind and a destination-specific message; a read-only destination is `ReadOnlyCollectionError` with kind `forbidden`. `CollectionBaseLocaleMismatchError` has kind `invalid` and maps a whole-collection source-locale disagreement to HTTP 400. Project-term and collection-tag edit errors name data, not CLI flags, and so do the glossary extractor and bundle constant-name errors (`GlossaryExtractorError`, `MultipleBundleConstantNameError`), so the API shows flag-free text; their `problem` fields identify invalid edit combinations so [CLI Error Wording](#cli-error-wording) can supply the exact flag wording. Core converts operational failures at its boundary to typed errors; `CoreOperationError` keeps the CLI message and `String(error)` text of a former plain error while the API keeps its generic 500 body without a message. `ResourceFolder` keeps three programmer-error assertions as plain `Error`. An `InvalidConfigError` still carries a deliberate, client-visible message. On the other side of the wire, the Tracker turns each failed answer back into one [API Error](#api-error).

Transaction rollback preserves the original error type and message. A restoration failure becomes its cause, so existing HTTP status mappings stay unchanged.

`InvalidProjectTermsEditError.problem` accepts `ProtectedTermsEditProblem` or `PreferredTerminologyEditProblem`. The CLI Error Wording tables cover both problem types. The error retains its invalid kind and HTTP 400 mapping.

Explained in context: [`core-library.md`](core-library.md#error-model), [`api.md`](api.md#error-mapping), [`cli.md`](cli.md#errors-and-exit-codes)

---

## V

### Validate Run

One validation of the opened [collections](#collection) for CI. In code, `runValidate(collections, options)` in `libs/core/src/lib/validate/run-validate.ts` uses the `validation` scope of the [Collection Set](#collection-set) for target locales, skipped/unknown-locale handling, terminology rule selection, and flattened resources, reads each collection's [Project Terms](#project-terms), runs status, [Stored Value Check](#stored-value-check), [Value Check](#value-check), and preferred-terminology checks through `validateResources`, and returns the validation result, its summary, and printable warnings. A missing collection set, no target locale, or every target locale skipped returns an in-band failure; a broken preferred-terminology file fails validation. The rule file belongs to the project, so the run uses the first collection whose read has rules. Validation checks collections independently under each base locale and accepts different base locales.

Explained in context: [`core-library.md`](core-library.md#validation-for-cicd), [`cli.md`](cli.md)

---

### Value Admission

The pure storage decision in `libs/domain/src/lib/value-admission.ts`: `admitValue(source, value, policy)` returns `{ admitted: true, value }` or `{ admitted: false, reason, violations }`. The source is optional. Rejection carries one typed primary reason and ordered violations with shared descriptions. Three policies preserve the storage rules: `stored-entry` checks only conversion-blocking [Stored Value Check](#stored-value-check) findings; `import` checks source agreement after [Placeholder Repair](#placeholder-repair), omitting argument mismatch when `referencesResolved` is true; `machine-translation` checks conversion safety, normalizes restored text to ICU, then checks source agreement. Import skips agreement for an absent or empty source. Protected terms are supplied by the caller.

Primary reason precedence is conversion safety, then protected term, then argument mismatch. Conversion failure stops the check. Contract violations retain argument-before-term order for diagnostics. Entry Writes throws, import records failed issues, and Translator maps the primary reason to its existing skip strings. Resource Folder holds a rejected value unchanged. The translator owns marker restoration and skips restoration failures before admission. Validation and import's syntax-reporting stage call Value Check and Stored Value Check directly. Translation Write-back stores translator-admitted values and seeded copies and is deliberately not re-gated.

---

### Value Check

The pure check of whether a translated value preserves its source's ICU argument names and verbatim [protected terms](#protected-term). In code, `checkTranslatedValue(source, value, { protectedTerms })` in `libs/domain/src/lib/check-translated-value.ts` returns typed violations (`argument-mismatch` with missing and unexpected names; `protected-term-dropped` with the terms). [Value Admission](#value-admission) applies the caller policies over these facts. The [Translator](#translator) maps rejection to skips, the [Import Run](#import-run) uses admission as a backstop after ICU auto-fix and maps rejection to failed changes, and the [Validate Run](#validate-run) calls Value Check directly and maps every selected violation to a validation failure. Domain’s `describeValueViolation` supplies the shared import and validation messages. Migration keeps unresolved references as literal placeholders, so import skips argument agreement for that strategy while checking protected terms. Argument repetition and locale-specific plural branches are allowed. The [Stored Value Check](#stored-value-check) separately checks a value’s syntax in its own locale. Provider marker restoration and complex-ICU provider skips belong to the translation process.

Explained in context: [`core-library.md`](core-library.md#validation-for-cicd)

---

## W

### Write Run

The shared cold pipeline for Tracker folder and entry outcome writes in `apps/tracker/src/app/browser/store/write-run.ts`. `writeRun` owns read-only and missing-collection guards, captures the [Browser Session](#browser-session), and reuses `withinSession` to turn late responses or errors into silent `stale-session` outcomes and current errors into a typed `Refusal`. Operations supply their request, success effects, optional rollback and a decision for every result, including guards and refusals with the original error as `cause`; `confirmThenWrite` shares confirmation sequencing, while `editorWrite` preserves the editor's raw response and error contract with session-guarded cache effects. [Confirmed Write](#confirmed-write) renders the decided feedback at the surface, and item-actions translate completes after its host is destroyed: store updates still apply in the original session, while toasts and per-row UI updates are skipped.

Explained in context: [`frontend.md`](frontend.md#optimistic-updates-with-rollback)

---
