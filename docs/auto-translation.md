---
title: Auto-Translation
sidebar_position: 8
---

# Auto-Translation

LingoTracker can machine-translate `new` and `stale` resources through Google Cloud Translation. The feature is off until you configure it, and it only ever produces the `translated` status, so a human review step stays in the workflow.

## Overview

When auto-translation is enabled, adding a resource machine-translates every target locale for which the caller supplied no translation, and editing the source text machine-translates every locale that needs work. The system classifies each string by its ICU content and applies the appropriate translation strategy:

- **Plain text** is sent directly to the translation provider.
- **Simple placeholders** (`{name}`, `{{ count }}`) are protected with markers before translation, then restored afterward.
- **Complex ICU** (plural, select, number, date, time) is skipped entirely. A machine translator would translate the branch keywords and break the message, so these strings are left for a person.

A translation is also skipped when the provider loses a placeholder marker, or when it drops a [protected term](./features/protected-terms.md) that is in the source (the same check that import applies).

Translated entries receive the `translated` status and are stored in ICU format. Skipped entries retain their current status (typically `new` or `stale`) so they surface clearly in the UI and CLI for manual handling.

## Supported Providers

| Provider | Config value | API |
|---|---|---|
| Google Cloud Translation | `google-translate` | [v2 REST API](https://cloud.google.com/translate/docs/reference/rest/v2/translations/translate) |

Only this provider is implemented. Any other `provider` value fails with `UNKNOWN_PROVIDER` when a translation is requested.

## Configuration

### 1. Enable auto-translation in `.lingo-tracker.json`

Add a `translation` block at the top level of your config file:

```json
{
  "exportFolder": "dist/lingo-export",
  "importFolder": "dist/lingo-import",
  "baseLocale": "en",
  "locales": ["en", "fr", "de", "es"],
  "translation": {
    "enabled": true,
    "provider": "google-translate",
    "apiKeyEnv": "GOOGLE_TRANSLATE_API_KEY",
    "batchSize": 5,
    "delayMs": 1000
  },
  "collections": {
    "Main": {
      "translationsFolder": "apps/web/src/assets/i18n"
    }
  }
}
```

The `translation` block accepts the following fields:

| Field | Type | Description |
|---|---|---|
| `enabled` | `boolean` | Whether auto-translation is active. Set to `false` to disable without removing the config. |
| `provider` | `string` | The translation provider to use. Currently only `"google-translate"` is supported. |
| `apiKeyEnv` | `string` | Name of the environment variable that holds the API key. The key is never stored in the config file. |
| `batchSize` | `number` | Number of resources to translate per API batch during bulk locale translation. Default: `5`. |
| `delayMs` | `number` | Milliseconds to wait between batches during bulk locale translation. Default: `1000`. |

### 2. Per-collection overrides

A collection can carry its own `translation` block. The block **replaces** the global one rather than merging with it, so an override that enables translation must repeat `provider` and `apiKeyEnv`. Disabling is the common case and needs only `enabled: false`:

```json
{
  "translation": {
    "enabled": true,
    "provider": "google-translate",
    "apiKeyEnv": "GOOGLE_TRANSLATE_API_KEY"
  },
  "collections": {
    "Main": {
      "translationsFolder": "apps/web/src/assets/i18n"
    },
    "Admin": {
      "translationsFolder": "apps/admin/src/assets/i18n",
      "translation": {
        "enabled": false
      }
    }
  }
}
```

### 3. Set the API key

Store the API key in the environment variable named by `apiKeyEnv`. Never commit API keys to version control.

```bash
export GOOGLE_TRANSLATE_API_KEY="your-api-key-here"
```

For CI/CD pipelines, use your platform's secret management (e.g., GitHub Actions secrets, GitLab CI variables).

If the variable is unset when a translation is requested, the operation fails with `MISSING_API_KEY`. The CLI exits 1 and the API returns 500. Nothing is written for `add-resource`; an `edit-resource` keeps the saved edit.

## How It Works

### The Translator

Every auto-translation (add-resource, edit-resource, translate one resource, translate a locale) goes through one Translator, opened for the collection. It reads the API key, and then for each string it:

1. **Classifies** the string using the ICU classifier (see below).
2. **Routes** the string based on classification:
   1. `plain` -- sends to the provider directly.
   2. `simple-placeholders` -- protects placeholders, sends, then restores.
   3. `complex-icu` -- does not send it; the string is skipped.
3. **Checks** the translation: a lost or duplicated placeholder marker, or a dropped protected term, skips the string.
4. **Normalizes** the translation to ICU (`{{ name }}` becomes `{name}`).

For add-resource, edit-resource and translating one resource, all strings for one locale go to the provider in one request. `translate-locale` sends one request per batch of `batchSize` resources (default 5), with `delayMs` between batches. The provider may split a request further (Google: chunks of 128).

### Placeholder Protection

When a string contains simple placeholders like `{name}` or `{{ count }}`, those placeholders must survive the machine translation unchanged. The placeholder protector handles this in three steps:

1. **Extract**: Each placeholder is replaced with a numbered marker wrapped in a `notranslate` HTML span:
   ```
   Hello {name}, you have {count} items
   -->
   Hello <span class="notranslate">__PH0__</span>, you have <span class="notranslate">__PH1__</span> items
   ```

2. **Translate**: The protected string is sent to the provider. Most machine translation engines respect `notranslate` spans and leave them intact.

3. **Restore**: After translation, the markers are replaced with the original placeholder text:
   ```
   Hallo <span class="notranslate">__PH0__</span>, Sie haben <span class="notranslate">__PH1__</span> Artikel
   -->
   Hallo {name}, Sie haben {count} Artikel
   ```

If the provider drops, duplicates, or corrupts any marker, the restore step detects the mismatch and the string is treated as skipped. This ensures that a broken translation never overwrites existing data.

### ICU Classification

The ICU classifier examines each string and assigns one of three classifications:

| Classification | Description | Example | Auto-translatable? |
|---|---|---|---|
| `plain` | No ICU syntax | `Hello world` | Yes |
| `simple-placeholders` | Only simple variable substitutions | `Hello {name}` or `Hello {{ name }}` | Yes, with protection |
| `complex-icu` | Plural, select, number, date, time, or mixed | `{count, plural, one {# item} other {# items}}` | No -- skipped |

#### What counts as complex ICU?

A string is classified as `complex-icu` when it contains any of:

- A **comma inside a brace group** at the outermost depth, indicating a formatter keyword (`plural`, `select`, `number`, `date`, `time`, `selectordinal`).
- An **empty brace group** `{}`.
- An **unclosed brace** (malformed input).
- A **mix** of simple placeholders and complex ICU syntax in the same string.

Examples of complex ICU strings that are skipped:

```
{count, plural, one {# item} other {# items}}
{gender, select, male {he} female {she} other {they}}
{price, number, currency}
{date, date, short}
{time, time, medium}
{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}
Hello {name}, {count, plural, one {# item} other {# items}}
```

#### Why complex ICU is not auto-translated

Machine translation providers treat the entire string as natural language. They cannot understand ICU branch structure, which means:

- Branch keywords (`one`, `other`, `male`, `female`) would be translated as words.
- The `#` placeholder inside plural branches would be treated as literal text.
- Nested brace structure would be corrupted.
- The resulting string would be syntactically invalid ICU.

For this reason, complex ICU strings are always skipped and left for human translators who understand the branching structure.

#### Transloco double-brace format

The classifier normalizes Transloco's double-brace format (`{{ name }}`) to single-brace (`{name}`) before analysis. Both formats are treated identically for classification purposes. Translations are always stored in ICU format: if your source uses `{{ name }}`, the stored translation uses `{name}`.

## Usage

### CLI (add-resource and edit-resource)

Auto-translation runs automatically during the `add-resource` and `edit-resource` CLI commands when `translation.enabled` is `true` in your config. No extra flags are needed.

- **add-resource**: Each target locale without an explicitly supplied translation goes to the provider instead of being filled with the base value. Locales you supply are stored as given.
- **edit-resource**: When the base value is updated, the command triggers translation for any locale whose status is `new` or `stale`.

Skipped locales (complex ICU, a lost placeholder, or a dropped protected term) are surfaced in the CLI output for manual handling. On add, a skipped locale gets a copy of the base value with status `new`. On edit, a skipped locale that has no value, or only an untranslated copy of the old base value, gets the new base value with status `new`; a locale that holds a real translation keeps it, marked `stale`.

### Web UI

In the translation browser, the row menu of a resource has **Translate** when the collection has auto-translation enabled. It translates every locale of that resource that is `new` or `stale` and reports skipped locales. The editor also fills locales you leave empty when creating a resource. There is no whole-locale translation in the UI; use `translate-locale` for that.

### Translating existing resources via the API

The API exposes an endpoint to translate an existing resource entry. Send a POST request with the resource key:

```
POST /api/collections/:collectionName/resources/translate
Content-Type: application/json

{
  "key": "apps.common.buttons.ok"
}
```

The response includes the updated resource, the number of locales translated, and any locales that were skipped:

```json
{
  "resource": { ... },
  "translatedCount": 3,
  "skippedLocales": []
}
```

If the base value uses complex ICU (or a translation lost a placeholder or a protected term), `skippedLocales` will list the locales that could not be auto-translated:

```json
{
  "resource": { ... },
  "translatedCount": 0,
  "skippedLocales": ["fr", "de", "es"]
}
```

### Which locales are translated?

Auto-translation targets locales where the translation status is `new` or `stale`, or where no metadata entry exists yet. Locales with status `translated` or `verified` are left unchanged. The base locale is always excluded.

## Bulk Locale Translation

The `translate-locale` operation translates **all** `new` and `stale` resources in a collection for a single target locale in one command. This is useful for bootstrapping a new locale or catching up after a large batch of authoring changes.

### CLI

```bash
lingo-tracker translate-locale --collection <name> --locale <locale> [--verbose]
```

In interactive mode (TTY), the command prompts for the collection and locale when they are not provided. In non-interactive mode, pass `--locale`, and also `--collection` when more than one collection is configured.

**Summary mode (default):**

```
Translating locale 'fr' in collection 'playground'...
Done.

Translated: 45 resources
Skipped (needs human translation): 3 resources
Failed: 0 resources
```

**Verbose mode (`--verbose`):**

```
[batch 1/9] translated: 5, skipped: 0, failed: 0
[batch 2/9] translated: 10, skipped: 0, failed: 0
...
```

### API

Bulk locale translation is exposed as an async job because large collections can take tens of seconds to translate. The workflow is:

1. **Start the job** — `POST` to receive a `202 Accepted` response with a `jobId`.
2. **Poll for status** — `GET` with the `jobId` every 2–5 seconds until the status is `completed` or `failed`.

See the [API reference](./api.md) for full endpoint documentation.

### Throttling

The `batchSize` and `delayMs` config fields control how aggressively the bulk operation calls the translation provider:

- **`batchSize`** — how many resources are sent in each API call. Larger batches are faster but increase the risk of hitting per-request quotas.
- **`delayMs`** — how long to wait between batches. A non-zero delay smooths out rate-limit exposure over time.

**Recommended settings:**

| Tier | `batchSize` | `delayMs` |
|---|---|---|
| Free tier | `5` | `1000` |
| Paid tier | `50` | `0` |

Start with the free-tier defaults and increase `batchSize` once you have confirmed your quota headroom.

## Error Handling

The translation system uses typed `TranslationError` instances with error codes:

| Code | Meaning | Retryable? |
|---|---|---|
| `MISSING_API_KEY` | The environment variable specified by `apiKeyEnv` is not set | No |
| `UNKNOWN_PROVIDER` | The `provider` value in the config is not recognized | No |
| `INVALID_REQUEST` | The translation provider rejected the request (HTTP 400) | No |
| `AUTH_ERROR` | Invalid or expired API key (HTTP 403) | No |
| `RATE_LIMIT` | Provider rate or daily quota exceeded (HTTP 403 with rate limit reason) | Yes |
| `SERVER_ERROR` | Provider server error (HTTP 500/503) or unexpected error | Yes |

The `retryable` flag indicates whether the caller can meaningfully retry the operation.

## Google Translate Provider Details

The Google Translate v2 provider:

- Authenticates via the `X-goog-api-key` header (the API key never appears in URLs or server logs).
- Batches requests sharing the same target locale, up to 128 strings per API call (matching Google's documented limit).
- Sends requests with `format: "text"` (plain text input mode).

## Best Practices

1. **Always review auto-translated strings.** Machine translation provides a starting point, not a final result. Use the `translated` status to distinguish auto-translated strings from human-`verified` ones.

2. **Translate skipped strings manually.** When `skippedLocales` is non-empty, those strings need a human translator: complex ICU needs someone who understands plural rules, gender selection, and other ICU constructs for the target language, and a translation that lost a protected term must keep it.

3. **Use environment variables for API keys.** Never commit API keys to `.lingo-tracker.json` or any other file in version control.

4. **Start small.** Enable the feature on one collection first and read the output before turning it on everywhere.

5. **Be mindful of API costs.** Each string sent to the provider is billed. Strings classified as `complex-icu` are not sent.

6. **Disable it where it does not help.** A per-collection `translation` block with `enabled: false` turns it off for collections that are mostly plurals or need specialist translators.
