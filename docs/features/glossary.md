---
title: Glossary
sidebar_position: 5
---

# Glossary

The `glossary` command takes a block of base-locale text, finds the UI strings it mentions, and writes their existing translations as JSON. It was built for **online help translation**: whoever translates the help can reuse exactly the words the application already uses, instead of inventing a second translation of "Save" or "Settings".

The glossary is a reference that the command generates on demand. It checks nothing. To keep words unchanged in translations, use [protected terms](./protected-terms.md). To flag discouraged wording in your base-locale text, use [preferred terminology](./preferred-terminology.md).

## Usage

```bash
lingo-tracker glossary [options]
```

The input block is resolved with the precedence `--text` → `--input <file>` → piped stdin.

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--text <text>` | Inline text block to extract terms from. | — |
| `--input <file>` | File whose contents are the input block. | — |
| `--output <file>` | Output JSON file path. | `./lingo-tracker-glossary-<timestamp>.json` |
| `--stdout` | Print the glossary JSON to stdout (status to stderr). | Off |
| `--collection <name>` | Limit matching to a single collection. | All collections |
| `--locales <list>` | Comma-separated locales to include. The base locale is always excluded. | All configured locales |
| `--include-all` | Include `new`/`stale` entries. | Off (only `translated` + `verified`) |
| `--extractor <mode>` | Term extraction strategy (`ngram`). | `ngram` |

## Pipeline

```
block → extract candidate terms → match against entries → rank → top-1 per candidate → glossary JSON
```

1. **Extract** — the block is split into sentences and tokenized; stopwords and very short tokens are dropped, leaving content-word **unigrams and bigrams** as candidate terms. Bigrams are formed from adjacent content words (after stopword removal), so "save your changes" yields the candidate "save changes".
2. **Match** — each candidate is matched against entries' **base-locale values only** (key names are ignored). Scoring: an exact value match scores `1.0`; whole-word/phrase containment scores by how much of the value the candidate covers. Matching inside a larger word does not count.
3. **Rank** — the single best entry per candidate is kept. An entry matched by multiple candidates appears once (the higher score wins). Results are sorted by score descending.
4. **Filter & write** — by default only `translated`/`verified` locales are included (`--include-all` adds `new`/`stale`, each tagged with its status). Each collection's base locale (respecting per-collection overrides) is omitted from `translations` since it appears as `base`.

## Output schema

```json
{
  "baseLocale": "en",
  "locales": ["fr", "es"],
  "source": { "chars": 1234, "candidates": 18 },
  "matchCount": 2,
  "terms": [
    {
      "key": "apps.common.buttons.save",
      "collection": "app",
      "base": "Save",
      "matchedTerm": "save",
      "score": 1.0,
      "translations": { "fr": "Enregistrer", "es": "Guardar" },
      "status": { "fr": "verified", "es": "translated" }
    }
  ]
}
```

## Extractors

Only the `ngram` extractor is implemented. `--extractor ai` is reserved and returns an error.

## Design notes & limitations

- **Precision over recall** — matching is deterministic and value-only with no fuzzy matching, so the glossary stays trustworthy for translators. Use `find-similar` when you want fuzzy near-duplicate detection instead.
- **English-oriented stopwords** — the built-in stopword list assumes an English base locale, so extraction quality drops if the base locale is not English.
- **One base locale per run** — the collections searched must share a base locale; use `--collection` to run per collection otherwise.
