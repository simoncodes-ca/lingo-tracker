# App runtime setting

Status: Accepted

Date: 2026-10-30

Issue: #151. Related: #149 (JSON import parser, merged in #155), #150 (round-trip warnings, merged in #156).

## Context

LingoTracker stores every value as an ICU message and converts at two boundaries.
Import converts `{{ name }}` to `{name}` with `translocoToICU` (`libs/domain/src/lib/transloco-to-icu.ts`).
Bundle converts `{name}` back to `{{ name }}` with `icuToTransloco` (`libs/domain/src/lib/icu-to-transloco.ts`).
Both assume the app renders bundles through `@jsverse/transloco-messageformat`, where a single brace is ICU syntax.

Many Transloco apps use plain `@jsverse/transloco` without messageformat.
Booklore and Kavita are two such apps, each on `@jsverse/transloco` ^8.4.0 only.
In plain Transloco, `{first}` and `'` are literal text, and only `{{ … }}` is syntax.
Importing Booklore's `Showing {first} to {last} of {totalRecords} entries` stores three ICU arguments that the source never had.
Bundling writes `Showing {{ first }} to {{ last }} of {{ totalRecords }} entries`, and the app renders `Showing  to  of  entries`.
Kavita's `Use {Native} for the provider's native title` breaks the same way.

Nothing in `.lingo-tracker.json` names the runtime.
The only related switch is `transformICUToTransloco` (`libs/core/src/config/lingo-tracker-config.ts`, `libs/domain/src/lib/bundle-definition.ts`), which turns the bundle conversion off entirely and says nothing to import.
Config reading validates only `baseLocale`, `locales` and `collections` (`validateConfig` in `libs/core/src/lib/config/config-file-operations.ts`); every other field passes through unchecked.

The ICU parser in `libs/domain/src/lib/icu-message.ts` (`parseIcuMessage`, `icuQuotedRuns`) already treats quoted runs as literal text.
A quoted run starts at `'` followed by `{`, `}` or `#` and ends at a `'` not followed by another `'`; `''` is one literal apostrophe.
This is the rule the spec builds on, so `'{'first'}'` stores literal `{first}` without a new storage format.

## Decision

Add one global setting, `runtime`, to `.lingo-tracker.json`.
Its values are `"transloco-messageformat"` (the default and today's behaviour) and `"transloco"`.
Storage stays ICU for every runtime.
The setting selects boundary conversions and permits dotted simple arguments in stored-value checks under `transloco`.
Both boundaries read the same setting, so import and bundle cannot disagree.
A missing field means `transloco-messageformat`, so existing projects behave exactly as before.

Under `transloco`, import stores every literal `{`, `}` and `'` as ICU-quoted text, and bundle unquotes them.
Values whose ICU constructs plain Transloco cannot render (`plural`, `select`, `selectordinal`, `number`, `date`, `time`, `duration`) are still bundled, in today's messageformat form, with a generation warning.
Authoring paths (CLI `add-resource`/`edit-resource`, the Tracker editor, machine translation, `normalize`) keep writing ICU.
Their stored-value checks accept dotted simple arguments under `transloco`.

## Config contract

| Item | Decision |
|---|---|
| Field | `runtime` at the top level of `.lingo-tracker.json`. |
| Type | `AppRuntime = 'transloco-messageformat' \| 'transloco'`, a new domain module `libs/domain/src/lib/app-runtime.ts` exporting `APP_RUNTIMES`, `DEFAULT_APP_RUNTIME`, `isAppRuntime`. Domain is browser-safe, so the Tracker and DTOs reuse the type. |
| Default | `transloco-messageformat`. |
| Scope | Global only. Not per collection, not per bundle. |
| Validation | `validateConfig` rejects a present value outside `APP_RUNTIMES` with `InvalidConfigError`, message `runtime must be one of: transloco-messageformat, transloco`. This is the first optional field read and write both check, because a typo here silently changes import semantics. `docs/configuration.md` line 9 ("no other field is checked") is updated. |
| Accessor | `appRuntimeOf(config)` in core returns the resolved value and is the one place the default lives. `Collection` (`libs/core/src/lib/config/open-collection.ts`) gains `readonly runtime: AppRuntime`, resolved by `openCollection`, so import, machine translation and validate read it without threading config. `resolveBundleSettings` (`libs/core/src/lib/bundle/resolve-bundle-settings.ts`) adds `runtime` to its `Pick` and to `BundleSettings`. |
| DTO | `LingoTrackerConfigDto` (`libs/data-transfer/src/lib/lingo-tracker-config.dto.ts`) gains `runtime?: AppRuntime`; `mapConfigToDto` (`apps/api/src/app/mappers/config.mapper.ts`) spreads it like `tokenCasing`. `UpdateConfigDto` does not gain it in this issue; `PUT /api/config` keeps writing only the two term lists. |

Why global only.
Import has no bundle in scope, so a per-bundle runtime cannot reach it, and the issue's whole point is that the two sides agree.
Every real project found so far has one runtime; a project with two runtimes consuming one store has no coherent storage choice anyway.
The `tokenCasing` precedence chain is about output shape, not value semantics, so it is not a precedent.

Interaction with `transformICUToTransloco`.
`transformICUToTransloco` stays the "convert at all" switch; `runtime` selects which conversion runs when it is on.
With `transformICUToTransloco: false`, bundle emits the stored ICU verbatim and `runtime` has no effect on bundle output.
Under `runtime: transloco`, that combination writes `'{'first'}'` to a runtime that will show the quotes, so `prepareBundleRun`'s `configWarnings` (`libs/core/src/lib/bundle/prepare-bundle-run.ts`) emits one config-origin warning per bundle: `Bundle '<key>': transformICUToTransloco is off, so the transloco runtime setting does not apply; the bundle holds ICU-quoted text`.
It is a warning, not an error, because `--no-transform-icu-to-transloco` is a legitimate debugging flag.
Import ignores `transformICUToTransloco`, as it does today.

## Converters

Two new domain functions sit beside the existing pair and dispatch on runtime.
They are the contract that the JSON parser's output (#149) and the round-trip check (#150) plug into.

```ts
// libs/domain/src/lib/runtime-conversion.ts
export function toStoredIcu(value: string, runtime: AppRuntime): string;     // import side
export function toRuntimeValue(value: string, runtime: AppRuntime): string;  // bundle side
export function unrenderableIcuConstructs(value: string, runtime: AppRuntime): readonly IcuConstructKind[];
```

`IcuConstructKind` is `'plural' | 'select' | 'selectordinal' | 'number' | 'date' | 'time' | 'duration'`, drawn from `SubMessageKeyword` and `IcuFormat` in `icu-message.ts`.

For `transloco-messageformat`, `toStoredIcu` is `translocoToICU` and `toRuntimeValue` is `icuToTransloco`, unchanged, and `unrenderableIcuConstructs` always returns `[]`.
`translocoToICU` keeps its export; nothing that calls it today changes behaviour.
The `icuToTransloco` domain barrel export was dropped because it has no outside consumer; `toRuntimeValue(v, 'transloco-messageformat')` is the public form.

### `toStoredIcu(value, 'transloco')`

The input is plain Transloco syntax, where the only syntax is `{{ name }}`.

1. Find interpolations with the parser's `INTERPOLATION` pattern, `\{\{\s*(\w+(?:\.\w+)*)\s*\}\}`, the same shape `translocoToICU` accepts today. Each becomes the ICU argument `{name}`.
2. Everything else is literal text. Each maximal run of literal brace characters becomes one quoted run: `{` becomes `'{'`, `}}` becomes `'}}'`, `}{` becomes `'}{'`. Runs must merge, because `'{'` directly followed by `'{'` lexes as one run whose body holds an escaped apostrophe.
   A run also spans apostrophes between brace characters, so `{'}` is stored as `'{''}'`. A `{{ … }}` whose body is not an identifier path (Booklore's `{{ '{' }}`) is literal text and its braces follow this rule.
3. A run of k apostrophes in literal text becomes `''` repeated k times when k ≥ 2, or when the character before or after the run is `{` or `}`, or when the character after it is `#`. Otherwise it stays a single `'`.

Rule 3 is derived from `icuQuotedRuns`: an apostrophe is only syntax when it is doubled or when it opens a run before `{`, `}` or `#`.
A natural apostrophe (`Don't`, `It's {{ name }}`) therefore stays as typed, which keeps stored values readable and matches what `prepareTextSegment` in `icu-to-transloco.ts` already assumes.
Doubling beside a brace is required because `'` + `'{'` would lex as the pair `''` followed by an unquoted `{`.
Worked results:

| Source (plain Transloco) | Stored ICU |
|---|---|
| `Showing {first} to {last} of {totalRecords} entries` | `Showing '{'first'}' to '{'last'}' of '{'totalRecords'}' entries` |
| `Use {Native} for the provider's native title` | `Use '{'Native'}' for the provider's native title` |
| `Don't` | `Don't` |
| `It's {{ name }}` | `It's {name}` |
| `''` | `''''` |
| `'{'` | `'''{'''` |
| `{{ count }} of {total}` | `{count} of '{'total'}'` |
| `{{ '{' }}SeriesName{{ '}' }}` | `'{{' '''{''' '}}'SeriesName'{{' '''}''' '}}'` |
| `{{ a }}{b}` | `{a}'{'b'}'` |

The function is total and never throws.
It is not idempotent, which is why only the import boundary may call it (see Import).

### `toRuntimeValue(value, 'transloco')`

The input is stored ICU.
Parse with `parseIcuMessage(value, { simpleArgumentPaths: true })` in strict mode.
`simpleArgumentPaths` is a new opt-in option that accepts dotted arguments, so `{user.name}` bundles as `{{ user.name }}`; `unrenderableIcuConstructs` parses with it too.
When the parse is not ok, return the value unchanged; `bundle-selection.ts` already warns on that case.
Walk the top-level nodes.
A simple argument `{name}` becomes `{{ name }}`.
A literal node is unquoted: each quoted run yields its content with `''` collapsed to `'`, and outside runs `''` collapses to `'`.
A group or a formatted argument is emitted exactly as `icuToTransloco` emits it today, so the key is present and `unrenderableIcuConstructs` reports it.
Under `transloco` the round trip is identity modulo whitespace inside `{{ }}` (`{{name}}` returns as `{{ name }}`); the property test asserts this.

`unrenderableIcuConstructs(value, 'transloco')` returns the kinds of every top-level and nested `group` node and every argument with a `format`, deduplicated and in source order.
It returns `[]` for an unparsable value, which the malformed-ICU warning already covers.

### Dotted arguments

Under `transloco`, every strict stored-value check accepts simple argument names that match `\w+(?:\.\w+)*`, including `{user.name}`.
Argument agreement, placeholder repair, admission, locale compilation, bundle checks and editor validation use the same rule.
Only simple arguments accept dotted names, including simple arguments inside plural or select branches.
Plural, select and formatter argument names keep their existing rules.
Under `transloco-messageformat`, all checks keep their existing behavior.

## Import

Import entry points are the CLI `import` (`apps/cli/src/commands/import-cmd.ts`), the API import job (`apps/api/src/app/imports/import-job.service.ts`, used by the Tracker import dialog in `apps/tracker/src/app/collections/import-dialog`), and both go through core `runImport` and `importResources` (`libs/core/src/lib/import/run-import.ts`, `import-resources.ts`).
The one conversion point is `normalizeTranslocoSyntaxInResources` (`libs/core/src/lib/import/normalize-transloco-syntax.ts`), which today calls `translocoToICU` on `value` only.

Which values are in runtime syntax is a property of the import strategy, not the file format.
`ImportStrategyPolicy` (`libs/domain/src/lib/import-strategy-policy.ts`) gains `readonly valueSyntax: 'runtime' | 'stored'`.
`migration` is `runtime`: its source is the app's own translation files.
`translation-service`, `verification` and `update` are `stored`: their sources are files LingoTracker exported, which carry ICU verbatim (`exportToXliff` and `export-to-json.ts` never convert).
This matters because `toStoredIcu(…, 'transloco')` is not idempotent; applying it to an exported `'{'first'}'` would double-quote it.

`normalizeTranslocoSyntaxInResources` becomes `normalizeImportedValues(resources, { runtime, valueSyntax })`.
For `stored` it applies `translocoToICU`, today's lenient normalization, for every runtime.
For `runtime` it applies `toStoredIcu(value, runtime)`.
It converts `baseValue` as well as `value`; today only `value` is converted, which is a latent defect that the `Base value mismatch` warning in `process-resource-group.ts` would surface loudly under `transloco`.
`runtime` comes from `session.collection.runtime`.
XLIFF with `--strategy migration` follows the same rule, since the policy row, not `detectImportFormat`, decides.

Under `transloco`, migration imports check unsafe stored values after conversion, so `Use {{{ name }}}` imports.
Order within `importResources` is otherwise unchanged: `resolveImportReferences`, `rejectUnsafeStoredValues`, normalization, `repairImportPlaceholders`, validation, `warnAboutRoundTripLoss`, `applyResourceGroups`.
Reference resolution (`libs/domain/src/lib/reference-resolver.ts`) runs before normalization and matches `{{t('key')}}` and `{{key}}` by regex; single braces never match, so plain-Transloco literals do not interact with it.
The ICU auto-fixer (`libs/domain/src/lib/icu-auto-fixer.ts`, `extractICUPlaceholders`) runs after normalization on quote-aware parses, so quoted literals are not placeholders to repair.
`admitValue` with the `import` policy (`libs/domain/src/lib/value-admission.ts`) compares arguments with `compareIcuArguments`, which is quote-aware, so `'{'first'}'` on both sides agrees.
`ResourceFolder.setTranslation` (`libs/core/src/lib/resource/resource-folder.ts`) still calls `translocoToICU` on write; on an already-stored ICU value this is a no-op for both runtimes.

#149 (merged in #155) rewrote `parse-json-import.ts`.
`parseJsonImport(filePath, options: ImportParseOptions)` returns a `ParsedImport` whose `resources` hold raw file strings in `value` and `baseValue`, with no syntax conversion; `ImportParseOptions` carries only `onProgress`.
That contract stays: the parsers do not receive `runtime`, and this spec owns everything after the parser.

## Bundle

`toTransloco` in `libs/core/src/lib/bundle/bundle-selection.ts` becomes runtime-aware through `SelectBundleEntriesOptions.runtime`, supplied from `prepared.settings.runtime` by `selectPreparedContent`.
It calls `toRuntimeValue(resource.value, runtime)` instead of `icuToTransloco`.
Its three existing warnings stay for every runtime.
Under `transloco` it adds, per key with a non-empty `unrenderableIcuConstructs` result, one generation warning per bundled key (including `bundledKeyPrefix`) and set of construct kinds per bundle run, rather than per locale:
`Key '<key>': uses ICU <kinds>, which the transloco runtime cannot render; the bundled value is written in messageformat form. Set runtime to transloco-messageformat or rewrite the value without ICU constructs.`

A value with an unrenderable construct is bundled entirely through the messageformat conversion, so its literals stay ICU-quoted.
That conversion parses with `icuParseOptionsFor(runtime)`, so a top-level dotted argument still becomes `{{ user.name }}`.
Under `transloco` the quoted-`{{` warning is skipped, because quoted braces are the stored form of literal text.
The value is written, not skipped, so the key exists and the app shows the raw ICU rather than a missing-key fallback.
Warnings do not change the exit code; `generate-bundles.ts` fails a bundle only on a thrown error or a failed type outcome, and this spec keeps that.
`validate` is the strict gate (next section).

Surfaces are unchanged in shape.
CLI: `printBundleEvent` (`apps/cli/src/commands/bundle-report.ts`) counts them in `Warnings: N` and lists them under `--verbose`; the config-origin mismatch warning prints immediately through `CommandOutput.warn`.
API: `mapGenerateBundleResultToJobResult` and `mapBundlePlanToDto` (`apps/api/src/app/mappers/bundle.mapper.ts`) already pass `findings.messages` and `plan.warnings` as `warnings: string[]`, so `POST /api/bundles/:name/generate`, `GET /api/bundles/jobs/:id` and `POST /api/bundles/dry-run` carry them without a DTO change.
Tracker: the bundle card already renders job warnings.
The debug-keys bundle and `transformICUToTransloco: false` skip conversion as they do today.

## Other value paths

| Path | Runtime awareness | Why |
|---|---|---|
| Tracker editor (`apps/tracker/src/app/browser/dialogs/translation-editor/`) | Dotted arguments and advisory | Users author ICU in LingoTracker; the editor's ICU hint (`ICUHINTX`) documents it. Under `transloco`, `EditorAdvisories` (`editor-advisories.ts`) adds a non-blocking advisory from `unrenderableIcuConstructs(value, store.config()?.runtime ?? DEFAULT_APP_RUNTIME)`, for the base value and beside each editable locale textarea, announced as a polite status and linked through `aria-describedby`, and the hint text gains one sentence on `'{'` quoting. The existing `bracedPlaceholderValidator` passes the runtime to stored-value checks for dotted simple arguments. |
| CLI/API `add-resource`, `edit-resource` (`libs/core/src/lib/resource/resource-entry.ts`) | Dotted arguments only | Admission accepts dotted simple arguments under `transloco`. Inputs are ICU; `translocoToICU` on `{{ x }}` stays a convenience for every runtime. Adding runtime conversion here would make `{first}` mean different things in the editor and the import file, with no way to tell which the user meant. |
| `validate` (`libs/core/src/lib/validate/`) | Yes, fails | The ICU compile check accepts dotted simple arguments under `transloco`, while retaining locale checks. New check `validateRuntimeRenderability` in `validate-resources.ts`: under `transloco`, a value with non-empty `unrenderableIcuConstructs` is a failure of kind `runtime-unrenderable`, per locale, listed with the ICU failures. `--skip-runtime` disables it, mirroring `--skip-icu`. Under `transloco-messageformat` the check is a no-op. Exit code follows `exitForRunOutcome`, so CI fails. |
| Machine translation (`libs/core/src/lib/machine-translation/`) | Dotted arguments and quoted-run protection | Classification and admission accept dotted simple arguments under `transloco`. `classifyICUContent` (`libs/domain/src/lib/icu-classifier.ts`) is quote-aware and classifies `'{'first'}'` as `plain`, so the whole value goes to the provider raw. The provider may turn `'` into `’` or drop it, which `admitValue` cannot detect because `compareIcuArguments` returns `null` on the then-unparsable value. Fix in `placeholder-protector.ts`: `protectPlaceholders` also wraps every `icuQuotedRuns` span as a `notranslate` marker, and `prepare` in `translator.ts` sends a value through the protector whenever it has a placeholder or a quoted run. This is storage-level and applies to every runtime, so it is not keyed on the setting. |
| Placeholder validation (`icu-arguments.ts`, `check-translated-value.ts`, `stored-value-check.ts`) | Dotted arguments only | Parse-based and quote-aware. Under `transloco`, argument agreement, admission and placeholder repair accept dotted simple arguments. |
| XLIFF export/import (`export-to-xliff.ts`, `parse-xliff-import.ts`) | No | Export writes stored ICU verbatim; import is a `stored`-syntax strategy. Translators of a `transloco` project see `'{'first'}'`; see Open questions. |
| JSON export (`export-to-json.ts`) | No | Same as XLIFF. |
| API/DTOs (`libs/data-transfer`) | Read-only field | `LingoTrackerConfigDto.runtime`, mapped by `mapConfigToDto`. `BundleGenerateJobResultDto.warnings` and `ImportResultDto.warnings` already exist. |
| `find-similar` (`libs/core/src/lib/resource/search.ts`) | No | Scores raw lowercased text; quotes cost a few edit-distance points, acceptable. |
| Glossary (`libs/core/src/lib/glossary/`) | No | Tokenises `[\p{L}\p{N}]+`; `first` inside `'{'first'}'` is a token either way, as `{first}` is today. |
| Protected terms (`libs/domain/src/lib/protected-terms.ts`) | No | Word-boundary regex over raw text, unaffected by quoting. |
| Preferred terminology (`libs/domain/src/lib/preferred-terminology.ts`) | No | `extractVisibleTextRanges` is parse-based; quoted runs are visible text, which is correct for literals. |
| `normalize` (`libs/core/src/lib/normalize/`) | Dotted arguments only | Stored-value checks accept dotted simple arguments under `transloco`. Rewrites stored values through `translocoToICU` only; stored ICU is runtime-neutral. It does not touch the config. |

## Init and existing configs

`init` detects the runtime before asking.
`initProject` gains a detection step in `apps/cli/src/init/init.ts`, kept in the CLI because reading the host project's `package.json` is a CLI concern, not core.
Detection reads `<cwd>/package.json` once, tolerating absence or invalid JSON.
If `@jsverse/transloco-messageformat` or `@ngneat/transloco-messageformat` is in `dependencies` or `devDependencies`, the detected value is `transloco-messageformat`.
Otherwise, if `@jsverse/transloco` or `@ngneat/transloco` is present, the detected value is `transloco`.
Otherwise there is no detection and the default applies.
Detection reads `dependencies` and `devDependencies` only, not `peerDependencies`, so a library repo should pass `--runtime`.

Interactive mode prints the same detection line once, before the select prompt, when detection found a value and `--runtime` was not supplied.
Interactive mode adds a `select` prompt after `locales` and before `setupBundle`, in the `whenUninitialized` style of `tokenCasing` in `init-flags.ts`: message `App runtime`, choices `transloco-messageformat (ICU plural/select in bundles)` and `transloco (plain; single braces are literal text)`, with `initial` set to the detected value when there is one, else to the default.
Non-interactive mode uses `--runtime <value>` when supplied, else the detected value, else the default, and prints `Detected runtime: transloco (from package.json)` through `ConsoleFormatter.info` when detection decided; interactive mode prints the same line through the same call.
`--runtime` is validated against `APP_RUNTIMES` by the flag record; an invalid value exits 1 with the allowed list.
`initProject` writes `runtime` only when it differs from the default or was supplied explicitly, so a messageformat project's file does not gain a line it does not need.
The field is written only when `--runtime` is passed explicitly or the resolved value is `transloco`.
A detected or interactively selected `transloco-messageformat` is not written.

Existing configs need no migration.
A missing field is `transloco-messageformat`, which is today's behaviour.
No command writes the field on its own; `normalize` stays out of the config.
Documentation (`docs/configuration.md`, `docs/cli.md`, `docs/guides/migration.md`, `docs/guides/bundling.md`, `docs/api.md`, `README.md` line 92, `architecture-docs/bundle-generation.md`, `architecture-docs/domain-and-data-model.md`) gains the field, and the migration guide tells a plain-Transloco project to set it before the first import.

Breaking changes: none for existing projects.
Flagged changes: `validateConfig` now rejects one optional field; a hand-typed `"runtime": "Transloco"` fails every command with a clear message instead of silently importing wrong.

## Coordination with #150

#150 merged in #156.
It added `bundledFormIfLost(value)` in `libs/domain/src/lib/icu-round-trip.ts`, which returns `icuToTransloco(translocoToICU(value))` when that differs from `value` outside `{{ }}` whitespace, else `undefined`.
`warnAboutRoundTripLoss` in `libs/core/src/lib/import/import-resources.ts` calls it for accepted keys, `migration` strategy only, on the resolved source values before normalization, and pushes `Key '<key>': value will not survive the ICU round trip and bundles as written below. …`.
On the bundle side #156 added only a test; the existing malformed-ICU warning in `bundle-selection.ts` is unchanged.

The check hard-codes the messageformat pair, so under `transloco` it would warn on Booklore and Kavita even after this ADR stores them correctly.
This ADR's implementation changes it as follows:
- `bundledFormIfLost(value, runtime)` computes `toRuntimeValue(toStoredIcu(value, runtime), runtime)`; the `runtime` parameter is required, so the domain helper stays pure and no caller silently keeps the old behaviour.
- `warnAboutRoundTripLoss` passes `session.collection.runtime`.
- Its `migration`-only gate stays and matches this ADR's `valueSyntax: 'runtime'` row; once `valueSyntax` exists the gate reads it instead of `resolvesReferences`.
- The warning text drops "ICU" (`value will not survive the round trip to the <runtime> runtime …`) so it names the configured runtime.

Under `transloco-messageformat` the result is byte-identical to today.
Under `transloco` the pair is lossless by construction, so the check never fires and the Booklore and Kavita values stop being warnings.

What counts as lossy per runtime:

| Runtime | Lossy at import | Reported at bundle |
|---|---|---|
| `transloco-messageformat` | Round trip differs (literal braces, i18next formatters and `$t()`, `{{ '{' }}`) | Malformed ICU, quoted `{{`, unbundlable branch body (today's three) |
| `transloco` | Nothing (lossless pair) | Malformed ICU and unbundlable branch body (quoted `{{` is skipped), plus `unrenderableIcuConstructs` |

#156's grouped `Unresolved parameters kept as placeholders` line comes from reference resolution, which runs before conversion and is runtime-independent; it needs no change.

## Future: i18next

`i18next` is out of scope and the shape leaves room for it.
`AppRuntime` is a closed string union, so adding `'i18next'` is one entry in `APP_RUNTIMES` and one row in each dispatch.
`toStoredIcu` and `toRuntimeValue` dispatch on runtime, so i18next's `{{x, currency}}` formatters, `$t()` nesting and `_one`/`_other` context keys would be handled by a third pair without touching the Transloco pairs.
Those forms need pass-through tokens that ICU cannot express, which is why they are a separate decision and probably a storage extension.
`unrenderableIcuConstructs` already answers "which ICU constructs can this runtime not render", which i18next will also need.
Nothing in this ADR hard-codes two values outside the union and its tests.

## Test plan

Fixtures are the real values: Booklore `Showing {first} to {last} of {totalRecords} entries`, Kavita `Use {Native} for the provider's native title`, Booklore `<strong>{{ fileCount }}</strong> … {{ '{' }}SeriesName{{ '}' }}`.

Domain (`libs/domain`, vitest):
- `app-runtime.spec.ts`: `isAppRuntime` accepts both values and rejects `'Transloco'`, `''`, `undefined`, `1`.
- `runtime-conversion.spec.ts`: every row of the worked-results table in both directions; `toStoredIcu` under `transloco-messageformat` equals `translocoToICU` and `toRuntimeValue` equals `icuToTransloco` on the existing spec corpus.
- Apostrophes: `Don't`, `It's {{ name }}`, `''`, `'{'`, `{'`, `'}'`, `a'{b`, `#` after an apostrophe, apostrophe at string end.
- Mixed: `{{ count }} of {total}`, `{{ a }}{b}{{ c }}`, `{{ a.b }} {c.d}`.
- Property test (`runtime-conversion.property.spec.ts`, fast-check as in `icu-message.property.spec.ts`): `toRuntimeValue(toStoredIcu(v, 'transloco'), 'transloco')` equals `v` modulo whitespace inside `{{ }}` for arbitrary strings over the alphabet `{ } ' # a-z space`, and `parseIcuMessage(toStoredIcu(v, 'transloco')).ok` is true for all of them.
- `unrenderableIcuConstructs`: plural, select, selectordinal, `{n, number}`, `{d, date, short}`, nested group inside select, returns `[]` for simple arguments, literals and malformed input, and `[]` under `transloco-messageformat`.
- `icu-round-trip.spec.ts`: #156's five cases keep their exact bundled form under `transloco-messageformat`; under `transloco`, Booklore, Kavita, `{{ '{' }}SeriesName{{ '}' }}` and `Don't` return `undefined`.
- Round trip through the Transloco replica in `transloco-runtime-round-trip.spec.ts`: bundling Booklore's value under `transloco` and running pass 1 only yields the source text unchanged.

Core (`libs/core`):
- `config-file-operations.spec.ts`: read and write reject an invalid `runtime`; missing field reads as default; `appRuntimeOf`.
- `open-collection.spec.ts`: `Collection.runtime` resolves from the global config.
- `normalize-transloco-syntax.spec.ts` (renamed with the function): `migration` under `transloco` quotes literals in `value` and `baseValue`; `translation-service` under `transloco` leaves `'{'first'}'` alone; `migration` under `transloco-messageformat` is byte-identical to today's output on the existing corpus.
- `import-resources.pipeline.spec.ts`: Booklore and Kavita files imported with `--strategy migration` under both runtimes; assert the stored `resource_entries.json` and that no `argument-mismatch` or auto-fix fires under `transloco`; the round-trip warning fires for Kavita under `transloco-messageformat` (#156's regression) and not under `transloco`.
- `bundle-selection.spec.ts`: Booklore value under `transloco` bundles to the source text with zero warnings; under `transloco-messageformat` bundles to `{{ first }}` form (regression); a plural under `transloco` bundles in messageformat form with the new warning; `transformICUToTransloco: false` plus `transloco` emits the config warning once per bundle.
- `validate-resources.spec.ts`: plural under `transloco` fails with `runtime-unrenderable`, passes with `--skip-runtime`, passes under the default runtime.
- `placeholder-protector.spec.ts`: `'{'first'}'` and `'{'a'}' {b}` are protected as markers and restored; a provider that returns `’` inside a marker cannot corrupt the value because the marker is restored from the original.
- `translator.spec.ts`: an `InMemoryTranslationProvider` that mangles apostrophes leaves `'{'first'}'` intact end to end.

CLI (`apps/cli`, `runCommand` with a temporary project from `testing/command-project.ts`):
- `init.test.ts`: `package.json` with `@jsverse/transloco` only writes `runtime: "transloco"` and prints the detection line; with `@jsverse/transloco-messageformat` writes nothing for the field; `--runtime transloco` beats detection; `--runtime bogus` exits 1 naming the allowed values; interactive select is offered with the detected initial; no `package.json` asks with the default initial.
- `import-cmd.test.ts`: Booklore file under `transloco` imports with no warnings and the expected file on disk.
- `bundle.test.ts` and `bundle-output.test.ts`: plural under `transloco` exits 0 and prints `Warnings: 1`, detail under `--verbose`; the config mismatch warning prints without `--verbose`.
- `validate.test.ts`: plural under `transloco` exits 1; `--skip-runtime` exits 0.
- `cli-help-baseline.json` and `main.snapshot.spec.ts` snapshots updated for `--runtime` and `--skip-runtime`.

API (`apps/api`, jest):
- `config.mapper.spec.ts`: `runtime` is mapped when present and omitted when absent.
- `bundles.controller` job test: generate under `transloco` with a plural returns the warning in `BundleGenerateJobResultDto.warnings`.
- `import-job.service.spec.ts`: a `migration` import under `transloco` stores quoted literals.

Tracker (`apps/tracker`):
- `editor-advisories.spec.ts`: a plural value shows the runtime advisory when `config().runtime === 'transloco'` and nothing under the default.
- `api-contract.spec.ts` picks up the DTO field.

E2E (`apps/tracker-e2e`): not warranted; the Tracker changes are one advisory and one read-only DTO field, both covered by unit tests. Add a case only if the Settings page later edits `runtime`.

## Consequences

A plain-Transloco project sets one field and its literal braces survive import and bundle unchanged.
A messageformat project changes nothing and sees no new warnings.
Storage stays ICU, so every parse-based check, the editor, machine translation and `normalize` keep one syntax to reason about.
The `migration` strategy becomes the only path that reads app-runtime syntax, which the docs must state plainly; a plain-Transloco team that re-imports an exported JSON with `--strategy migration` will double-quote its literals.
`validate` gains a failing check for one runtime, so a `transloco` project that authored plurals in the editor sees CI fail until it rewrites them or passes `--skip-runtime`.
`validateConfig` now checks an optional field for the first time, a small step away from "only three fields are checked".
Under `transloco`, exported XLIFF and JSON show translators ICU quoting such as `'{'first'}'`, which is correct but unfamiliar.
The merged round-trip check (#150) gains a `runtime` parameter and is otherwise unchanged.
The `AppRuntime` union and the dispatching pair give `i18next` a place to land without reopening this decision.

## Open questions

1. Should `validate` fail or only warn on unrenderable constructs under `transloco`? Recommendation: fail, with `--skip-runtime`, because `validate` is the CI gate and a plural that renders as raw ICU is a shipped bug; bundle keeps exit 0 so a build is never blocked.
2. Should export emit runtime syntax under `transloco` so translators see `{first}` rather than `'{'first'}'`? Recommendation: not now; it would make the exchange formats runtime-dependent and reopen idempotence at import. Revisit with a `--syntax runtime|stored` export flag if translators complain.
3. Should the Tracker Settings page edit `runtime`? Recommendation: no; changing it on a populated store changes nothing stored and only confuses the next import. It is an init-time decision, hand-editable like `tokenCasing`.
4. Should `init` ever write `runtime: "transloco-messageformat"` explicitly? Recommendation: only when `--runtime` is passed; detection or default leaves the field out so existing-style configs stay minimal. If the project later wants self-documenting configs, write it always.
5. Should `toStoredIcu(…, 'transloco')` treat a non-identifier `{{ … }}` (Booklore's `{{ '{' }}`) as literal text, as specified, or as an interpolation whose body is kept verbatim? Recommendation: literal text; it is lossless and matches what Transloco's `getValue` would fail to resolve anyway, and #150's check reports nothing because the round trip holds.
6. Should the machine-translation protector change ship in this issue or separately? Recommendation: in this issue; without it, auto-translation on a `transloco` project can silently corrupt quoted literals, and the change is small and runtime-independent.
7. Should the detection also inspect `transloco.config.js` or `app.config.ts` for `provideTranslocoMessageformat`? Recommendation: no; `package.json` is sufficient for every project tested, and the prompt covers the rest.
