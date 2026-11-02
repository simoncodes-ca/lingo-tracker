# Domain and Data Model

LingoTracker stores all translation data as plain JSON files on disk, organized by a dot-delimited [resource key](#resource-key-anatomy) that maps directly to a folder hierarchy. This document explains how keys decompose into filesystem paths, what the two JSON files in each folder contain, how the entity relationships are modeled in TypeScript, and how the [ICU format](glossary.md#icu-format) used internally relates to the [Transloco](glossary.md#transloco) format emitted in bundles.

Return to [architecture README](README.md).

---

## Table of Contents

- [Resource Key Anatomy](#resource-key-anatomy)
- [Storage Format on Disk](#storage-format-on-disk)
  - [resource_entries.json](#resource_entriesjson)
  - [tracker_meta.json](#tracker_metajson)
  - [Folder layout example](#folder-layout-example)
- [Entity Diagram](#entity-diagram)
- [Entry Change](#entry-change)
- [Bundle Definition](#bundle-definition)
- [ICU vs Transloco Format](#icu-vs-transloco-format)
- [Translation Status Lifecycle](#translation-status-lifecycle)
- [Checksum-Driven Staleness Detection](#checksum-driven-staleness-detection)
- [Protected Terms](#protected-terms)

---

## Resource Key Anatomy

A [resource key](glossary.md#resource-key) is a dot-delimited string that uniquely identifies a single translatable string within a [collection](glossary.md#collection). Each dot-separated segment may contain only alphanumeric characters, underscores, and hyphens (`[A-Za-z0-9_-]`).

```
apps.common.buttons.ok
│    │      │       └── entryKey   — property name in resource_entries.json
│    │      └────────── folder segment
│    └───────────────── folder segment
└────────────────────── folder segment
```

**The last segment is always the entry key.** All preceding segments are folder path components. The key `apps.common.buttons.ok` resolves to:

```
<translationsFolder>/
└── apps/
    └── common/
        └── buttons/
            ├── resource_entries.json   ← contains the "ok" entry
            └── tracker_meta.json       ← contains checksums and status for "ok"
```

A [resolved key](glossary.md#resolved-key) is formed by prepending an optional [target folder](glossary.md#target-folder): `resolvedKey = targetFolder + "." + key`. For example, key `ok` with target folder `apps.common.buttons` resolves to `apps.common.buttons.ok` before the folder path is computed. The resolution logic lives in `resolveResourceKey()` in `@simoncodes-ca/domain`. Only creation (`addResource`) takes a target folder; an edit names the full existing key and changes folder with `moveTo` (see [core-library.md](core-library.md#collection-bound-operations)).

A single-segment key (e.g. `title`) places the entry at the root of the collection's `translationsFolder` — no subdirectory is created.

---

## Storage Format on Disk

Each folder in the translation hierarchy contains exactly two JSON files written side-by-side.

### resource_entries.json

Holds the actual translation values. The top-level object is keyed by entry key (the final segment of the [resource key](glossary.md#resource-key)). Each value is a `ResourceEntry` object:

```typescript
interface ResourceEntry {
  source: string;           // Base locale value — always required
  comment?: string;         // Optional context for translators
  tags?: string[];          // Optional tags for bundle/export filtering
  [locale: string]: string | string[] | undefined;  // Translation values keyed by locale code
}
```

**Tag normalization rules** (`libs/domain/src/lib/normalize-tags.ts` is the single source of truth):
- Lowercased, whitespace replaced with hyphens, non-`[a-z0-9-]` characters stripped
- Repeated hyphens collapsed; leading/trailing hyphens removed
- Maximum 50 characters per tag (truncated before cleanup)
- Duplicates removed (case-insensitive after normalization), first-occurrence wins
- Tags are coerced on write by `addResource` / `editResource` (core) and on `normalize` (CLI)
- The Tracker UI chip input normalizes each tag on commit

**Collection-level (inherited) tags:**

Collections can declare `tags?: string[]` in `.lingo-tracker.json` config. These tags are inherited by every resource in the collection at read time — they are never stored on individual `resource_entries.json` files. The merge is performed by `effectiveTags(collectionTags, resourceTags)` in `libs/domain/src/lib/effective-tags.ts`:

```typescript
effectiveTags(['team-x'], ['feature-a'])  // → ['team-x', 'feature-a']
effectiveTags(['team-x'], ['team-x', 'ui'])  // → ['team-x', 'ui']  (deduped)
```

Inherited tags are:
- **Additive only** — no negative/override syntax; all collection tags apply to all resources
- **Transparent to export/bundle filtering** — `--tags team-x` matches resources whose collection carries that tag
- **Not materialized in bundle files** — the destination collection's own config re-applies its tags on import
- **Displayed distinctly in the Tracker UI** — shown as dashed-border chips with an "Inherited from collection" tooltip; cannot be removed per-resource

Real example from `apps/tracker/src/i18n/browser/dialog/deleteResource/resource_entries.json`:

```json
{
  "title": {
    "source": "Delete Resource",
    "comment": "Title of the confirmation dialog when deleting a resource",
    "tags": ["browser"],
    "es": "Eliminar recurso",
    "fr-ca": "Supprimer la ressource",
    "ru": "Удалить ресурс",
    "ja": "リソースを削除する",
    "de": "Ressource löschen"
  },
  "messageX": {
    "source": "Are you sure you want to delete the resource \"{key}\"? This action cannot be undone.",
    "comment": "Confirmation message when deleting a resource, interpolated with the resource key",
    "tags": ["browser"],
    "es": "¿Seguro que desea eliminar el recurso \"{key}\"? Esta acción no se puede deshacer.",
    "fr-ca": "Êtes-vous certain de vouloir supprimer la ressource « {key} » ? Cette action est irréversible.",
    "ru": "Вы уверены, что хотите удалить ресурс \"{key}\"? Это действие необратимо.",
    "ja": "リソース「{key}」を削除してもよろしいですか？この操作は元に戻せません。",
    "de": "Sind Sie sicher, dass Sie die Ressource \"{key}\" löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden."
  }
}
```

Note that translation values use [ICU format](glossary.md#icu-format) internally — single braces `{key}` are ICU placeholders, not Transloco syntax.

---

### tracker_meta.json

Holds [tracker metadata](glossary.md#tracker-metadata) — checksums and [translation status](glossary.md#translation-status) — for every entry in the sibling `resource_entries.json`. The structure is a two-level object: entry key → locale code → [`LocaleMetadata`](glossary.md#locale-metadata).

```typescript
// TrackerMetadata  (tracker_meta.json root object)
interface TrackerMetadata {
  [entryKey: string]: ResourceEntryMetadata;
}

// ResourceEntryMetadata  (per-entry object)
interface ResourceEntryMetadata {
  [locale: string]: LocaleMetadata;
}

// LocaleMetadata  (per-locale object — defined in @simoncodes-ca/domain)
interface LocaleMetadata {
  checksum: string;         // MD5 of this locale's current value
  baseChecksum?: string;    // MD5 of the base locale value at write time (non-base only)
  status?: TranslationStatus; // absent for the base locale
}
```

Real example from the same folder (`tracker_meta.json`):

```json
{
  "title": {
    "en": {
      "checksum": "7091aa93a78122401125a34800f9a1ac"
    },
    "es": {
      "checksum": "ee896d033ef40229535db90ef2b19656",
      "baseChecksum": "7091aa93a78122401125a34800f9a1ac",
      "status": "translated"
    },
    "fr-ca": {
      "checksum": "a56e2e5c2d55f4ee33b68aa628d0fa3e",
      "baseChecksum": "7091aa93a78122401125a34800f9a1ac",
      "status": "translated"
    }
  },
  "messageX": {
    "en": {
      "checksum": "ac83571aec2e065433da7fd905696d5f"
    },
    "es": {
      "checksum": "37dc1cb6432bff8549cb94e6f94d5dba",
      "baseChecksum": "ac83571aec2e065433da7fd905696d5f",
      "status": "stale"
    },
    "fr-ca": {
      "checksum": "8c4dc291d4e9879be2c9a5e2faae5df7",
      "baseChecksum": "ac83571aec2e065433da7fd905696d5f",
      "status": "stale"
    }
  }
}
```

Key observations:

- The [base locale](glossary.md#base-locale) entry (`en`) has only `checksum` — no `status` or `baseChecksum`.
- Non-base locale entries carry both `checksum` (MD5 of their own value) and `baseChecksum` (MD5 of the base value at the time they were last written).
- The `messageX` entry for `es` and `fr-ca` has `status: "stale"` because the English source changed after those translations were written, so `baseChecksum` no longer matches the current English `checksum`.

---

### Folder layout example

For a collection with `translationsFolder: "src/i18n"` and resources `browser.dialog.deleteResource.title` and `browser.dialog.deleteResource.messageX`:

```
src/i18n/
└── browser/
    └── dialog/
        └── deleteResource/
            ├── resource_entries.json
            └── tracker_meta.json
```

Both entries live in the same `resource_entries.json` because they share the same folder path (`browser/dialog/deleteResource/`). They are distinguished only by their entry keys (`title` and `messageX`).

---

## Entity Diagram

<!-- ER diagram showing the relationships between the core domain entities -->

```mermaid
erDiagram
    ResourceEntries {
        string entryKey PK "Final key segment (e.g. 'title')"
    }

    ResourceEntry {
        string source "Base locale value — required"
        string comment "Translator context — optional"
        string_array tags "Filter tags — optional"
        string locale_value "Per-locale translation value (dynamic keys)"
    }

    TrackerMetadata {
        string entryKey PK "Matches ResourceEntries key"
    }

    ResourceEntryMetadata {
        string locale PK "Locale code (e.g. 'en', 'fr-ca')"
    }

    LocaleMetadata {
        string checksum "MD5 of this locale's current value"
        string baseChecksum "MD5 of base value at write time (non-base only)"
        string status "new | translated | stale | verified (non-base only)"
    }

    ResourceEntries ||--|{ ResourceEntry : "keyed by entryKey"
    ResourceEntry ||--|{ locale_value : "one per locale"
    TrackerMetadata ||--|{ ResourceEntryMetadata : "keyed by entryKey"
    ResourceEntryMetadata ||--|{ LocaleMetadata : "keyed by locale code"
    ResourceEntries ||--|| TrackerMetadata : "paired on disk (same folder)"
    ResourceEntry ||--|| ResourceEntryMetadata : "same entryKey"
    locale_value ||--|| LocaleMetadata : "same locale code"
```

`ResourceEntries` and `TrackerMetadata` are always paired: one `resource_entries.json` and one `tracker_meta.json` per folder, never one without the other. The relationship between `ResourceEntry` and `ResourceEntryMetadata` is by shared entry key; the relationship between a locale value in `ResourceEntry` and a `LocaleMetadata` object is by shared locale code.

### Read model: Resource Summary

Readers outside core do not see the stored pair. They see a [Resource Summary](glossary.md#resource-summary) (`libs/domain/src/lib/resource-summary.ts`), built from one entry and its opened `Collection`:

```typescript
interface ResourceSummary {
  fullKey: string;      // "apps.common.buttons.ok"
  folderPath: string;   // "apps.common.buttons" ('' at the root)
  entryKey: string;     // "ok"
  base: { locale: string; value: string };      // the collection's base locale and `source`
  targets: Array<{                               // every collection target locale, in collection order
    locale: string;
    value?: string;                              // absent when the entry has no value
    status?: TranslationStatus;                  // absent when there is no metadata
    needsWork: boolean;                          // needsTranslation(meta): no metadata, new or stale
    sameAsBase: boolean;                         // isUntranslatedCopy on trimmed, non-empty values
  }>;
  comment?: string;
  tags: string[];          // the resource's own tags
  inheritedTags: string[]; // the collection's tags
}
```

A target locale without a value still has a row. Values for locales the collection does not have are not shown.

---

## Entry Change

`entryChange(intent, input)` in `libs/domain/src/lib/entry-change.ts` owns the comment and tags presence rule. CLI add-resource, CLI edit-resource and API update use this pure function. It has no platform dependencies. Missing values return `undefined`. Non-empty values pass through without normalization.

On edit, `comment: ''` clears the comment and `tags: []` removes tags. On add, empty values return `undefined` because there is nothing to clear. Core retains all storage and tag normalization rules. API update preserves its existing behavior.

Edit-resource prompts only for missing key and base value. Comment and tags come from flags. The flag-record boundary converts exactly empty `--tags ""` to `undefined`, while comma-only `--tags ,` supplies an empty list.

## Bundle Definition

A [bundle](glossary.md#bundle) is configured by one entry under `bundles` in `.lingo-tracker.json`, keyed by the bundle name. The [Bundle Definition](glossary.md#bundle-definition) type and its rules live in `libs/domain/src/lib/bundle-definition.ts`, so all four consumers use the same ones: core (`LingoTrackerConfig.bundles`, the add/update/delete operations, generation), the API (the dry run and generate; `BundleDefinitionDto` is an alias), the CLI (`init`, `bundle`) and the Tracker bundle form.

```typescript
interface BundleDefinition {
  bundleName: string;                       // file name pattern with {locale}, e.g. "main.{locale}"
  dist: string;                             // output folder, relative to the project root or absolute
  collections: 'All' | Array<{
    name: string;                           // an existing collection
    bundledKeyPrefix?: string;              // prepended to every key from this collection
    entriesSelectionRules: 'All' | Array<{
      matchingPattern: string;              // "*", "apps.*" or an exact key
      matchingTags?: string[];
      matchingTagOperator?: 'All' | 'Any';  // default 'Any'
    }>;
    mergeStrategy?: 'merge' | 'override';   // default 'merge' (first collection wins)
  }>;
  typeDistFile?: string;                    // .ts file for generated token constants
  tokenCasing?: TokenCasing;                // overrides the global setting
  tokenConstantName?: string;               // a JavaScript identifier
  transformICUToTransloco?: boolean;        // overrides the global setting (default true)
}
```

| Function | Rule |
|---|---|
| `validateBundleKey(key)` | The bundle name is required and uses only letters, digits, hyphens and underscores. |
| `validateBundleDefinition(definition, collectionNames)` | Returns every problem, never throws: `bundleName` is required and has `{locale}`; `dist` is required; `collections` is `'All'` or a non-empty list of existing collections, each at most once per `bundledKeyPrefix`; rules are `'All'` or a non-empty list, each with a `matchingPattern` and a valid tag operator; `mergeStrategy` is `merge` or `override`; `tokenCasing` is `upperCase` or `camelCase`; `typeDistFile` ends in `.ts`; `tokenConstantName` passes `validateJavaScriptIdentifier`. |
| `normalizeBundleDefinition(definition)` | The stored form: strings trimmed, empty or undefined optionals and empty tags dropped, unknown fields dropped, `'All'` kept, and a legacy `typeDist` moved to `typeDistFile` when that is absent. It never throws: a non-object input becomes an empty definition, and a non-object collection or rule becomes `{ name: '' }` / `{ matchingPattern: '' }`, which validation reports with its index. |
| `checkBundleDefinition(definition, collectionNames, key?)` | The one check every writer runs (core add/update, the API dry run, the Tracker form): the normalized `definition` and `errors`, key errors first. |
| `findBundleDefinition(bundles, key)` | The stored definition for a key, own properties only, so `constructor` finds nothing. |
| `bundleOutputFile(definition, locale)` | `<dist>/<bundleName with {locale} replaced>.json` with `/` separators, no `.` segments or duplicate slashes. Config paths use `/`; backslashes are not normalized. Core resolves the result against the project directory to write the file. |
| `hasLocalePlaceholder`, `isTypeScriptFile`, `hasTypeDistConfigured` | The small checks the validator and the Tracker form share; `hasTypeDistConfigured` also accepts the deprecated `typeDist`. |

---

## ICU vs Transloco Format

LingoTracker uses two formats at different points in the pipeline:

| Format | Syntax | Where used |
|---|---|---|
| [ICU format](glossary.md#icu-format) | `Hello {name}`, `{count, plural, one {# item} other {# items}}` | Stored in `resource_entries.json`; used throughout the CLI, API, and Tracker UI |
| [Transloco](glossary.md#transloco) syntax | `Hello {{ name }}` (simple vars only) | Emitted in generated bundle JSON files consumed by Angular apps |

**Why store in ICU format?** ICU is the most expressive and unambiguous format for locale-sensitive strings. Storing ICU internally means the data model is not coupled to Transloco's specific interpolation syntax — it could generate output for other i18n libraries in the future.

**The conversion happens at bundle time**, not at write time. When `core` generates a [bundle](glossary.md#bundle), it calls `icuToTransloco()` from `@simoncodes-ca/domain` on each value before writing the output file. The conversion rules are:

- **Simple placeholders** — `{varName}` (no comma inside the braces) → `{{ varName }}`
- **Complex ICU constructs** — `{count, plural, ...}`, `{gender, select, ...}` — keep their structure, because Transloco's messageformat pipe handles these natively
- **Branch bodies that are one argument** — `{count, plural, =1 {{itemName}} other {# items}}` → `{count, plural, =1 {{{itemName}}} other {# items}}`. Transloco interpolates `{{…}}` before the ICU compiler runs, so the single-brace form loses its branch brace and the compiler rejects the message. The extra brace pair leaves the branch wrapper standing and adds no character to the rendered text. The stored value keeps the single-brace form.
- **ICU quote escaping** — `''` and `'{'...'}'` syntax is unescaped to produce literal characters in the output, so `'{'name'}'` becomes `{name}` in the bundle

**Going the other direction**: when importing external translation files (XLIFF or JSON), `transloco-to-icu.ts` converts Transloco `{{ varName }}` back to ICU `{varName}` before the values are stored.

**The `runtime` setting.** Both conversions assume `@jsverse/transloco-messageformat`. The global `runtime` field (`AppRuntime`, `app-runtime.ts`) selects the pair: `toStoredIcu` and `toRuntimeValue` in `runtime-conversion.ts` dispatch on it, and `unrenderableIcuConstructs` reports ICU that plain Transloco cannot render. Under `transloco`, import quotes literal `{`, `}` and `'` into ICU and bundle unquotes them, so storage stays ICU for every runtime. Only the `migration` import strategy applies `toStoredIcu`, because its source is app syntax; other strategies read exported, already-stored ICU. The round trip is identity apart from whitespace inside `{{ }}`. See [ADR-0003](../docs/adr/0003-app-runtime-setting.md).

The `transformICUToTransloco` flag in `BundleDefinition` (default `true`) controls whether conversion happens for a given bundle. Setting it to `false` emits raw ICU format — useful for non-Transloco consumers.

See [bundle-generation.md](bundle-generation.md) *(phase 5, coming soon)* for the full bundle pipeline including how `icuToTransloco()` is called in context.

---

## Translation Status Lifecycle

Every non-base locale entry has a [translation status](glossary.md#translation-status) stored in its `LocaleMetadata`. The base locale has no status — it is always the source of truth.

<!-- State transition diagram for the translation status lifecycle -->

```mermaid
flowchart TD
    START([Resource created]) --> NEW

    NEW["new\nValue copied from base locale\nNo human translation yet"]
    TRANSLATED["translated\nHuman translation written\nNot yet reviewed"]
    STALE["stale\nBase value changed\nafter translation was written"]
    VERIFIED["verified\nReviewed and approved\nby a language expert"]

    NEW -- "Different value written without status" --> TRANSLATED
    NEW -- "Explicit translated status" --> TRANSLATED
    NEW -- "Identical copy verified" --> VERIFIED
    TRANSLATED -- "Reviewed and approved" --> VERIFIED
    VERIFIED -- "Reviewed and approved" --> VERIFIED
    TRANSLATED -- "Base locale value changes" --> STALE
    VERIFIED -- "Base locale value changes" --> STALE
    STALE -- "Different value written without status" --> TRANSLATED
    STALE -- "Base copy written without status" --> NEW

    style NEW fill:#fff3cd,stroke:#ffc107,color:#000
    style TRANSLATED fill:#d1ecf1,stroke:#17a2b8,color:#000
    style STALE fill:#f8d7da,stroke:#dc3545,color:#000
    style VERIFIED fill:#d4edda,stroke:#28a745,color:#000
```

Status in CI validation:

| Status | Default CI result |
|---|---|
| `new` | Failure |
| `translated` | Failure (warning with `--allow-translated` flag) |
| `stale` | Failure |
| `verified` | Pass |

Only `verified` entries pass CI validation without flags. This forces an explicit human review step before a translation is considered production-ready.

The status is stored in `tracker_meta.json` — never in `resource_entries.json`. Separating content from metadata means translation values can be diffed cleanly in Git without checksum noise. When a writer omits the status, `recordTranslation` in `libs/domain/src/lib/staleness.ts` infers `new` for a base copy or `translated` for another value. It keeps an explicit status, including `translated`, when the values match.

---

## Checksum-Driven Staleness Detection

[Staleness](glossary.md#staleness) is detected automatically by comparing two [checksums](glossary.md#checksum) stored in `tracker_meta.json`:

1. **`checksum`** — MD5 of the entry's own locale value at the last write.
2. **`baseChecksum`** — MD5 of the base locale value at the time this translation was last written.

When the base locale value changes, `core` computes its new checksum. `applyBaseChange` in `libs/domain/src/lib/staleness.ts` updates each target locale's `baseChecksum`. It sets the status to `stale`, or to `new` when the translation checksum equals the new base checksum. `ResourceFolder.setBase` applies this rule during edit, import, and normalize.

**Why MD5?** LingoTracker uses MD5 solely as a fast, deterministic, fixed-length content fingerprint — not as a cryptographic security primitive. MD5 produces a 32-character hex digest (`calculateChecksum` uses `node:crypto` via `crypto.createHash('md5').update(value).digest('hex')`). Collision resistance is not required here: the values being hashed are human-readable translation strings, and a collision would at worst suppress a stale detection for one entry. MD5 is faster than SHA-256 for this high-frequency, low-risk use case, and its 32-character output is compact enough to keep `tracker_meta.json` files readable in Git diffs.

See [core-library.md](core-library.md) for the CRUD operations that read, compute, and write these checksums as part of `add-resource`, `edit-resource`, and import flows.

---

## Protected Terms

A protected term is a string that must stay unchanged through translation. Brand names, product names, and jargon all qualify.

A protected term is **not** part of a resource. Nothing about it reaches `resource_entries.json` or `tracker_meta.json`. The list is project configuration. It lives in a standalone JSON file, and LingoTracker applies it to resources at read time.

### Storage

A protected-terms file holds a bare JSON array of strings. Core sorts it alphabetically and ends the file with a newline.

```json
[
  "Acme",
  "C++",
  "iPhone",
  "Node.js"
]
```

`.lingo-tracker.json` names such a file with `protectedTermsFile`. The setting exists at the global level, and optionally on each collection. Omit it globally and the list falls back to `.lingo-tracker-protected-terms.json` beside the config. A collection has no default. Core resolves every path against the config file's directory.

The list for a resource combines the global file with its collection's file, deduped. This mirrors `effectiveTags(collectionTags, resourceTags)`, one level further up the hierarchy.

### Normalization

`normalizeProtectedTerms()` trims each entry and drops the empty ones. It dedupes **case-sensitively** and keeps the first occurrence of each term. Casing and internal punctuation stay exactly as written.

This deliberately avoids `normalizeTags()`, which lowercases and hyphenates. `normalizeTags()` would turn `iPhone` into `iphone` and `Node.js` into `node-js`. That would destroy the exact thing this feature protects.

For list edits, domain `listEditProblem()` checks the shared add/remove/set conflict rule, and `mergeListEdit()` applies the merge. Core gives it `normalizeProtectedTerms()` here and `normalizeTags()` for collection tags, so the two lists keep their own value rules.

### Matching

`buildProtectedTermRegex(term, { caseInsensitive })` escapes the term for use in a regular expression. `Node.js` and `C++` therefore match literally. It then wraps the term in Unicode lookarounds, `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`.

A term therefore matches only as a whole word. `iPhone` matches in `Buy an iPhone`. It stays unmatched in `iPhones` and in `myiPhone`.

Two functions use the regular expression, with opposite case sensitivity:

| Function | Case handling | Used by |
|---|---|---|
| `findProtectedTerms(value, terms)` | Case-**insensitive** — returns the stored canonical term, not the matched substring | Export annotation |
| `findProtectedTermViolations(source, translation, terms)` | Source matched case-insensitively; translation matched case-**sensitively** | Import verification; the [Translator](glossary.md#translator)'s protected-term guard |

That difference is the mechanism. LingoTracker flags a source string however it was typed. It then requires the translation to hold the term exactly as stored. This is what catches `iPhone` returning from a translation service as `iphone` or as `Iphone`.

All of this lives in `libs/domain/src/lib/protected-terms.ts`, and all of it is pure. Resolving and reading the files is core's job. See [core-library.md — Protected Terms Resolution](core-library.md#protected-terms-resolution).

## Key Tree

The domain [Key Tree](glossary.md#key-tree) converts flat dot-delimited entries to nested JSON and back. It has no Node dependencies, so browser callers can use the same rules. Branches have null prototypes; rich leaf objects remain opaque. Conflict detection is independent of key order. An optional path transformation reports distinct source keys that map to the same output path. Flattening preserves empty segments. Parent leaves win, and callers choose whether to reject or report the conflicts.
