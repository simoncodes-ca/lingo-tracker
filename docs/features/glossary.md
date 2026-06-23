---
title: Glossary
sidebar_position: 5
---

# Glossary Feature

The Glossary feature extracts a glossary of relevant translations from a block of text. It was built to support **online help translation**: when help documentation is translated, the translators must reuse the same terminology that already exists in the app's UI so the help stays consistent with the product.

Given a paragraph of base-locale text, the `glossary` command pulls out the meaningful terms, finds the matching translation entries, and writes a JSON glossary containing each term's translations across all locales. That glossary can be handed to whoever (or whatever) translates the help content.

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

## The extraction seam

Extraction is a swappable stage. Internally it is a single boundary — `CandidateExtractor = (block) => Candidate[]` — with the deterministic n-gram extractor as the default implementation. The `--extractor` flag reserves room for a future **AI-based extractor** (for example, Claude pulling key terms and short phrases out of each sentence) to drop in behind the same interface without changing the matching, ranking, or output stages. Passing `--extractor ai` today returns a clear "not yet implemented" message.

## Design notes & limitations

- **Precision over recall** — matching is deterministic and value-only with no fuzzy matching, so the glossary stays trustworthy for translators. Use `find-similar` when you want fuzzy near-duplicate detection instead.
- **English-oriented stopwords** — the built-in stopword list assumes an English base locale, so extraction quality drops if the base locale is not English. The AI extractor seam is the long-term answer.
