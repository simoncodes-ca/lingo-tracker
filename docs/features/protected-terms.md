---
title: Protected Terms
sidebar_position: 6
---

# Protected Terms

A protected term is a word that must stay unchanged through translation. Brand names, product names, and technical jargon all qualify. `iPhone` stays `iPhone` in every locale, and `Node.js` stays `Node.js`.

LingoTracker applies the list in two places.

- **Export** marks each exported string with the protected terms found in its source. Translators and machine-translation services then see which words to leave alone.
- **Import** rejects an incoming translation when a protected term from the source is missing from it.

The terms live in a **JSON file** of their own, outside `.lingo-tracker.json`. A terminology list grows to hundreds of entries. It also changes on a different schedule from the rest of your configuration. A separate file keeps your configuration diffs short, and it lets reviewers read the terminology on its own.

## The file

A protected-terms file holds a bare JSON array of strings.

```json
[
  "Acme",
  "C++",
  "iPhone",
  "Node.js"
]
```

The global list lives in **`.lingo-tracker-protected-terms.json`** by default. That file sits beside `.lingo-tracker.json`. You can use it straight away, because adding your first term creates it.

To keep the list somewhere else, name the path in your configuration with `protectedTermsFile`.

```json
{
  "baseLocale": "en",
  "locales": ["en", "es"],
  "protectedTermsFile": "config/protected-terms.json",
  "collections": {
    "app": { "translationsFolder": "src/i18n" }
  }
}
```

LingoTracker resolves the path against the directory that holds `.lingo-tracker.json`. The path therefore works from any directory you run the CLI in.

### How LingoTracker writes the file

Every write replaces the whole file. The CLI, the API, and the web UI all behave the same way.

LingoTracker sorts the terms alphabetically. Adding one term therefore produces a one-line diff. Each term sits on its own line, indented by two spaces, and the file ends with a newline.

LingoTracker also drops empty entries and whitespace-only entries. It removes duplicates and keeps the first of each. The order in the file means nothing on its own. LingoTracker treats the list as a set when it reads the file.

## Per-collection terms

A collection can carry a file of its own. LingoTracker adds those terms to the global ones.

```json
{
  "protectedTermsFile": "config/protected-terms.json",
  "collections": {
    "app": {
      "translationsFolder": "src/i18n",
      "protectedTermsFile": "src/i18n/protected-terms.json"
    }
  }
}
```

Resources in `app` now match against both files. A vendored design-system collection wants exactly this. It keeps its own brand terms, and it still gets everything the repository protects.

A collection has **no default path**, unlike the global list. A collection without `protectedTermsFile` contributes no terms of its own, and it still receives the global list. Give a collection a file before you add terms to it.

```bash
lingo-tracker protected-terms --collection app --file src/i18n/protected-terms.json
```

## CLI

```bash
# List the global terms and the file that holds them
lingo-tracker protected-terms --list

# Add terms. The file is created if it is absent.
lingo-tracker protected-terms --add iPhone --add Node.js

# Remove a term
lingo-tracker protected-terms --remove Node.js

# Replace the whole list
lingo-tracker protected-terms --set "iPhone,Node.js,Acme"

# Empty the list
lingo-tracker protected-terms --set ""

# Move the list to a different file, carrying the existing terms across
lingo-tracker protected-terms --file config/protected-terms.json

# Any of the above, scoped to one collection
lingo-tracker protected-terms --collection app --add Widget
lingo-tracker protected-terms --collection app --list
```

`--list` on a collection prints three lists. It shows the global terms, the collection's own terms, and the combined set. It names the file behind each one.

The [CLI reference](../cli.md#protected-terms) holds the full option table.

## Matching rules

A term matches only as a whole word. `iPhone` matches in `Buy an iPhone today`. It stays unmatched in `iPhones` and in `myiPhone`.

Punctuation inside a term is literal. `Node.js` and `C++` therefore match exactly as you wrote them.

The two directions differ on purpose.

| Step | Matching |
|------|----------|
| Finding terms in the **source** | Case-insensitive. `IPHONE` in a source string still flags the term. |
| Checking the **translation** | Case-sensitive. The translation must hold the term exactly as you stored it. |

That difference is the whole point of the check. It catches a translator who changes `iPhone` to `iphone` or to `Iphone`.

## Export behavior

Export marks every target-locale row with the protected terms it finds in the source value.

- **JSON (rich)** adds a `doNotTranslate` array to each entry.
- **XLIFF** adds a `Do not translate: …` note.

Base-locale rows stay unmarked, because a base-locale row holds nothing to translate. To turn off marking entirely, pass `--no-protect-notes`.

```bash
lingo-tracker export --format json --rich --locale es
```

```json
{
  "app.checkout.title": {
    "value": "Comprar con iPhone",
    "base": "Buy with iPhone",
    "doNotTranslate": ["iPhone"]
  }
}
```

The [Export](./export.md) page holds the full format reference.

## Import behavior

On import, LingoTracker checks every incoming translation against the protected terms for its collection.

A term may appear in the stored source value but be missing from the incoming translation. That entry then **fails**, and LingoTracker reports it as `Protected term(s) altered: …`. The rest of the import continues normally.

Base-locale imports skip the check. A base-locale import defines the source rather than translating it.

The [Import](./import.md) page explains how LingoTracker reports failures.

## Web UI

**Settings** edits the global list as chips. It names the file underneath the field.

The **collection dialog** does the same for one collection. It requires that collection to have a `protectedTermsFile`. Without one, LingoTracker has nowhere to save the terms. The chips are then disabled, and the dialog says why. Set the file with the CLI first.

## Error handling

| Situation | Behavior |
|-----------|----------|
| The file is absent at the default path | LingoTracker reads an empty list and stays quiet. This is the normal state before you add your first term. |
| The file is absent at a path you configured | LingoTracker reads an empty list and warns you. A pointer at nothing is usually a typo. |
| The JSON is malformed | LingoTracker reports an error. |
| The JSON holds something other than an array of strings | LingoTracker reports an error. |
| The parent directory of the target path is absent | LingoTracker reports an error. It creates no directories for you, and it leaves your configuration unchanged. |

A corrupt file is a hard error rather than an empty list, and this is deliberate. An empty list would protect nothing. Altered brand names would then reach your resources through import, and nobody would see it happen.
