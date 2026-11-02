---
title: Concepts
sidebar_position: 3
---

# Concepts

This page explains the model behind LingoTracker: collections, keys and folders, the two files per folder, translation status, and how tags and ICU messages are handled.

## Collections

A **collection** is one translations folder with its own settings. The project config names each collection and points it at a folder:

```json
{
  "collections": {
    "main":   { "translationsFolder": "apps/web/src/i18n" },
    "admin":  { "translationsFolder": "apps/admin/src/i18n", "baseLocale": "en-GB" },
    "design": { "translationsFolder": "node_modules/@acme/design-system/i18n", "readOnly": true }
  }
}
```

A collection inherits the global `baseLocale`, `locales` and translation settings unless it sets its own. Values equal to the global ones are not stored, so a collection entry stays short. A `translation` block is the exception: it is stored as supplied.

Use more than one collection when:

- several applications in a monorepo keep separate strings
- a shared component library ships its translations and the consuming app only reads them
- different teams own different folders and you want separate review paths

Bundles can combine collections, so splitting storage does not force you to split runtime files.

**Read-only collections.** A collection with `readOnly: true` can be browsed, bundled, exported and validated, but not changed. The CLI, API and UI all refuse edits, imports, moves and auto-translation. `add-collection` turns this on automatically when the folder path contains a `node_modules` segment, which is the typical case for a vendored library. The flag is the single source of truth: an existing collection is never made read-only at run time because of its path.

## Keys and folders

A resource key is dot-delimited. Each segment can contain letters, digits, hyphens and underscores. There is no length limit on add, no reserved words, and keys are case-sensitive. Imports reject keys that break this rule.

The key decides the storage location. All segments except the last name a folder path; the last segment is the entry key inside that folder:

| Key | Folder | Entry |
|---|---|---|
| `common.buttons.save` | `common/buttons/` | `save` |
| `common.title` | `common/` | `title` |
| `welcome` | the collection root | `welcome` |

`--target-folder` on `add-resource` prepends a folder path to the key. `--target-folder common.buttons --key save` stores `common.buttons.save`.

**Hierarchical conflicts.** Storage allows `common` and `common.ok` to coexist, because they live in different folders. Nested JSON cannot represent both, so `bundle` fails with an error when a bundle contains such a pair, and hierarchical JSON export reports a conflict. Avoid keys that are both a value and a parent.

## The two files per folder

Each folder with at least one entry holds exactly two files.

### `resource_entries.json`

Values, comments and tags. The source text is always stored under the property `source`, never under the base locale's code. `comment` is a string and `tags` is an array. Every other property is a locale code with its translation.

```json
{
  "save": {
    "source": "Save",
    "comment": "Button label on every edit form",
    "tags": ["ui", "buttons"],
    "fr-ca": "Enregistrer",
    "es": "Save"
  }
}
```

Here `es` still holds a copy of the source: it has not been translated yet.

### `tracker_meta.json`

Checksums and statuses. The base locale has only a `checksum`. Each target locale has the checksum of its own value, a `baseChecksum` that LingoTracker keeps in step with the source, and a status.

```json
{
  "save": {
    "en":    { "checksum": "c9cc8cce247e49bae79f15173ce97354" },
    "fr-ca": { "checksum": "aed88202e2432ee2a613f9120ef7486b", "baseChecksum": "c9cc8cce247e49bae79f15173ce97354", "status": "translated" },
    "es":    { "checksum": "c9cc8cce247e49bae79f15173ce97354", "baseChecksum": "c9cc8cce247e49bae79f15173ce97354", "status": "new" }
  }
}
```

Checksums are MD5 hashes of the stored value. They exist to detect change, not for security.

Keeping metadata in a second file has two effects. Diffs of `resource_entries.json` show only wording changes. Tools that only need values, including a quick `cat` or a hand edit, are not distracted by bookkeeping. The cost is that the two files must agree. LingoTracker writes them together, and `normalize` repairs them when they drift, for example after a merge conflict was resolved by hand.

## Translation status

Every target locale of every resource has one of four statuses:

| Status | Meaning |
|---|---|
| `new` | No translation yet. The value is usually a copy of the source. |
| `translated` | A translation exists but no one has approved it. Machine translation and vendor imports produce this status. |
| `stale` | The source changed after this translation was made. |
| `verified` | A person approved this translation for the current source. |

### How statuses change

| Event | Effect on the locale |
|---|---|
| Resource added, locale left empty | `new`, value copied from source, or `translated` if auto-translation filled it |
| Translation written without an explicit status | `translated`, or `new` if the value equals the source |
| Import with `translation-service` strategy | `translated` |
| Import with `verification` strategy | `verified` |
| Status set explicitly (editor status menu, `--translations` JSON, API) | the given status |
| **Source value changes** | every translation becomes `stale`, including `verified` ones; copies of the old source become `new`, or are machine-translated when auto-translation is on |
| Source edited again back to a translation's original source | stays `stale`; nothing re-approves automatically |

The rule is mechanical. A source edit marks every translation whose value differs from the new source as `stale`, marks copies as `new`, and sets every `baseChecksum` to the new source checksum. The stored status then records the review state. `normalize` uses the same rule to catch source changes made outside LingoTracker: a locale whose `baseChecksum` no longer matches the source checksum is treated as if the source had just been edited.

`verified` is a human claim. Nothing in LingoTracker checks the wording. It can be set by the editor, by an import, or by an explicit status. It is revoked by a change to the source, by any new value written for that locale without an explicit status, which yields `translated`, or by an explicit status.

### Why this matters

- `validate` fails on `new` and `stale`, and on `translated` unless you allow it. That is your release gate.
- `export` defaults to `new,stale`, which is exactly the set a translator needs to see.
- The UI's **Needs work** filter is `new` plus `stale`.
- Auto-translation only touches locales that are `new`, `stale` or have no metadata, so it never overwrites a `translated` or `verified` string. Note the consequence: a source edit makes every translation `stale`, so with auto-translation on, editing a source string machine-translates over all of its existing translations.

## Tags

Resources can carry tags, and a collection can define tags that every resource in it inherits. Tags are normalized and deduplicated on write. For example, ` UI Buttons! ` becomes `ui-buttons`. Only `a-z`, `0-9` and `-` survive, and a tag is at most 50 characters.

Tags drive selection: bundles can include only entries with given tags, and export can filter by tag. Inherited collection tags are not written into entry files; they are applied when resources are read, so they count for filtering without touching the files. Tag filters compare the normalized form, so pass lowercase tags to `--tags` and `matchingTags`.

## ICU messages and Transloco syntax

Values are stored as [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/). A simple placeholder is `{name}`; plurals and selects use the ICU forms.

Transloco uses `{{ name }}` for interpolation. LingoTracker converts between the two at the edges:

| Direction | When |
|---|---|
| `{{ name }}` to `{name}` | Whenever a value is written: add, edit, import, machine translation, normalize |
| `{name}` to `{{ name }}` | During `bundle`, when `transformICUToTransloco` is on (the default) |

So you can type `{{ count }}` or `{count}` when authoring; storage is always ICU. Bundles use the syntax of the configured `runtime`: Transloco with `transloco-messageformat` by default, or plain Transloco with `"runtime": "transloco"`, where a single brace is literal text. See [Configuration](./configuration.md). Plural and select structures pass through conversion unchanged. For a runtime that consumes ICU directly, set `transformICUToTransloco: false` globally or per bundle, or pass `--no-transform-icu-to-transloco` to the CLI `bundle` command.

One shape is rejected on write because conversion would corrupt it: a placeholder wrapped in literal braces, such as `{{{name}}}`. The error message tells you how to quote the braces instead. `normalize` additionally reports a plural or select branch whose body collapsed to a bare placeholder.

The `validate` command compiles every stored value as ICU under its own locale. Plural categories differ by language. `{count, plural, one {…} other {…}}` is valid in English and fails to compile in Japanese, where `one` does not exist. That check is the main reason to run `validate` even on verified translations.

## Project layout at a glance

```
.lingo-tracker.json                     project config (committed)
.lingo-tracker-protected-terms.json     optional, created when you add a term
.lingo-tracker-preferred-terminology.json  optional, created when you add a rule
src/i18n/                               a collection's translations folder (committed)
  common/
    buttons/
      resource_entries.json
      tracker_meta.json
src/assets/i18n/en.json                 bundle output (usually generated, often ignored by Git)
src/generated/translation-tokens.ts     generated key constants
dist/lingo-export/                      default export folder
dist/lingo-import/                      default import folder
```
