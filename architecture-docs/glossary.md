# Glossary

Alphabetical reference for every domain term used in LingoTracker documentation. Each entry links to the spoke document where the concept is explained in full context.

Return to [architecture README](README.md).

---

## B

### Base Locale

The authoritative source language for all translation resources — the locale whose values are treated as the ground truth for staleness detection. Configured globally in `.lingo-tracker.json` as `baseLocale` (e.g. `"en"`) and overridable per collection. The base locale's value is what all other locale translations are derived from.

Tracker metadata for the base locale omits `status` and `baseChecksum`; only `checksum` is stored (the MD5 of the base value itself).

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md)

---

### Bundle

A generated JSON file (one per locale) that aggregates translation values from one or more [collections](#collection) into a flat or hierarchical format consumable by the Angular Transloco library. Bundles are defined in the `bundles` section of `.lingo-tracker.json`. Each bundle specifies a `dist` output directory, a `bundleName` pattern (e.g. `{locale}`), and which collections (or `"All"`) to include.

During bundle generation, ICU simple placeholder syntax (`{varName}`) is converted to Transloco double-brace syntax (`{{ varName }}`); complex ICU constructs (`plural`, `select`) pass through unchanged.

Explained in context: [`bundle-generation.md`](bundle-generation.md), [`core-library.md`](core-library.md)

---

## C

### Checksum

An MD5 hash of a translation value, stored in [`tracker_meta.json`](#tracker-metadata) for every locale. Two checksums are tracked per non-base locale entry:

- **`checksum`** — MD5 of the current translation value for that locale.
- **`baseChecksum`** — MD5 of the [base locale](#base-locale) value at the time the translation was last written.

When the base value changes, a new `checksum` is computed for it. If `baseChecksum` no longer matches the base locale's current `checksum`, the translation is automatically marked [stale](#staleness).

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`core-library.md`](core-library.md)

---

### Collection

A named group of translation [resources](#resource-entry) that share a common `translationsFolder` on disk and optional configuration overrides (base locale, locales, import/export folders, auto-translation settings). Collections are defined under the `collections` key in `.lingo-tracker.json`.

Example collections from the project's own config: `trackerResources` (the Tracker UI's own strings), `TestDataPlayground`, and `mockDesignSystem`.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`cli.md`](cli.md)

---

## I

### ICU Format

The [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) standard for representing locale-sensitive strings. LingoTracker stores translation values in ICU format internally. Simple placeholders use single braces: `Hello {name}`. Complex constructs use keyword-based syntax: `{count, plural, one {# item} other {# items}}`.

During [bundle](#bundle) generation, simple `{varName}` placeholders are converted to Transloco's `{{ varName }}` syntax. Complex ICU constructs are passed through as-is because Transloco's messageformat pipe handles them natively.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`bundle-generation.md`](bundle-generation.md)

---

## L

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

## R

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

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md)

---

### Resource Key

A dot-delimited string that uniquely identifies a [resource entry](#resource-entry) within a [collection](#collection). Segments may contain only alphanumeric characters, underscores, and hyphens (`[A-Za-z0-9_-]`).

Example: `apps.common.buttons.ok`

All segments except the last define the folder hierarchy on disk; the last segment is the entry key within `resource_entries.json`. See also [resolved key](#resolved-key).

Explained in context: [`libs-domain.md`](libs-domain.md)

---

### Resolved Key

The fully qualified dot-delimited key after combining an input key with an optional [target folder](#target-folder). Resolution is additive: `resolvedKey = targetFolder + "." + key` (or just `key` if no target folder is specified).

Example: key `ok` with target folder `apps.common.buttons` resolves to `apps.common.buttons.ok`.

The resolved key determines the filesystem path: `apps/common/buttons/` folder, entry key `ok` in `resource_entries.json`.

Explained in context: [`libs-domain.md`](libs-domain.md)

---

## S

### Staleness

The condition where a translation's `baseChecksum` no longer matches the [base locale](#base-locale)'s current [checksum](#checksum). This means the source text changed after the translation was written, so the translation is out of sync. A stale resource carries `status: "stale"` in its [locale metadata](#locale-metadata) and will fail CI validation by default.

Staleness is detected automatically during resource reads — no explicit re-scan is required.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`core-library.md`](core-library.md)

---

## T

### Target Folder

An optional dot-delimited path prefix that scopes an input [resource key](#resource-key) to a specific folder within the collection's translation hierarchy. Used in `add-resource`, `edit-resource`, and the REST API to place a short key (e.g. `ok`) at a specific location (e.g. `apps.common.buttons`) without repeating the full path in the key itself.

Validated to the same segment rules as a resource key (`[A-Za-z0-9_-]`). An empty string means no folder scoping.

Explained in context: [`libs-domain.md`](libs-domain.md), [`apps-cli.md`](apps-cli.md)

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

### Transloco

The Angular internationalization library ([jsverse/transloco](https://jsverse.github.io/transloco/)) that LingoTracker is designed to integrate with. Transloco consumes locale JSON [bundle](#bundle) files at runtime. LingoTracker converts ICU simple placeholder syntax to Transloco's `{{ varName }}` interpolation syntax during bundle generation.

Explained in context: [`frontend.md`](frontend.md), [`bundle-generation.md`](bundle-generation.md)

---

### Translation Status

An enum (`TranslationStatus` in `@simoncodes-ca/domain`) that tracks the review lifecycle of a non-base locale translation. Four possible values:

| Status | Meaning | CI validation result |
|---|---|---|
| `new` | Resource added but not yet translated (value is a copy of the base) | Failure |
| `translated` | Has a translation value but not reviewed | Failure by default; warning with `--allow-translated` |
| `stale` | Base locale value changed after translation was written | Failure |
| `verified` | Translation reviewed and approved by a language expert | Success |

The lifecycle flows: `new` → `translated` → `verified`. If the base value changes after `verified`, the status automatically reverts to `stale`.

Explained in context: [`domain-and-data-model.md`](domain-and-data-model.md), [`bundle-generation.md`](bundle-generation.md), [`domain-and-data-model.md`](domain-and-data-model.md)
