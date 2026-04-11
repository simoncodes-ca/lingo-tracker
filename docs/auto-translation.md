# Auto-Translation

LingoTracker can automatically translate new and stale resources using machine translation providers. This feature is opt-in and configured per-project or per-collection in `.lingo-tracker.json`.

## Overview

When auto-translation is enabled, adding or editing a resource automatically triggers machine translation for all target locales — provided no explicit translations are supplied by the caller. The system classifies each string by its ICU content and applies the appropriate translation strategy:

- **Plain text** is sent directly to the translation provider.
- **Simple placeholders** (`{name}`, `{{ count }}`) are protected with markers before translation, then restored afterward.
- **Complex ICU** (plural, select, number, date, time) is skipped entirely -- these strings cannot be translated reliably with Google Cloud Translate as of yet.

Translated entries receive the `translated` status. Skipped entries retain their current status (typically `new` or `stale`) so they surface clearly in the UI and CLI for manual handling.

## Supported Providers

| Provider | Config value | API |
|---|---|---|
| Google Cloud Translation | `google-translate` | [v2 REST API](https://cloud.google.com/translate/docs/reference/rest/v2/translations/translate) |

Additional providers can be added by implementing the `TranslationProvider` interface in `libs/core/src/lib/translation/translation-provider.ts`.

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
    "apiKeyEnv": "GOOGLE_TRANSLATE_API_KEY"
  },
  "collections": {
    "Main": {
      "translationsFolder": "apps/web/src/assets/i18n"
    }
  }
}
```

The `translation` block accepts three fields:

| Field | Type | Description |
|---|---|---|
| `enabled` | `boolean` | Whether auto-translation is active. Set to `false` to disable without removing the config. |
| `provider` | `string` | The translation provider to use. Currently only `"google-translate"` is supported. |
| `apiKeyEnv` | `string` | Name of the environment variable that holds the API key. The key is never stored in the config file. |

### 2. Per-collection overrides

A collection can override the global translation config. This is useful when different collections target different provider accounts or when you want to disable auto-translation for a specific collection:

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

If the environment variable is not set when a translation is requested, the system throws a `TranslationError` with code `MISSING_API_KEY`.

## How It Works

### Translation Orchestrator

The translation orchestrator sits between callers and the translation provider. For each string, it:

1. **Classifies** the string using the ICU classifier (see below).
2. **Routes** the string based on classification:
   1. `plain` -- sends to the provider directly.
   2. `simple-placeholders` -- protects placeholders, sends, then restores.
   3. `complex-icu` -- returns the original value unchanged with `kind: 'skipped'`.
3. **Returns** a result with `kind` indicating what happened:
   - `'translated'` -- plain text was translated.
   - `'translated-with-placeholders'` -- simple-placeholder text was translated with marker protection.
   - `'skipped'` -- complex ICU or a marker restoration failure; the value is unchanged.

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

The classifier normalizes Transloco's double-brace format (`{{ name }}`) to single-brace (`{name}`) before analysis. Both formats are treated identically for classification purposes. The placeholder protector preserves the original format in the translated output -- if your source uses `{{ name }}`, the translated string will too.

## Usage

### CLI (add-resource and edit-resource)

Auto-translation runs automatically during the `add-resource` and `edit-resource` CLI commands when `translation.enabled` is `true` in your config. No extra flags are needed.

- **add-resource**: When no explicit translations are provided (interactively or via flags), the command delegates all target locales to the translation provider instead of populating them with the base value.
- **edit-resource**: When the base value is updated, the command triggers translation for any locale whose status is `new` or `stale`.

Skipped locales (complex ICU strings) are left at their current status and surfaced in the CLI output for manual handling.

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

If the base value uses complex ICU, `skippedLocales` will list the locales that could not be auto-translated:

```json
{
  "resource": { ... },
  "translatedCount": 0,
  "skippedLocales": ["fr", "de", "es"]
}
```

### Which locales are translated?

Auto-translation targets locales where the translation status is `new` or `stale`, or where no metadata entry exists yet. Locales with status `translated` or `verified` are left unchanged. The base locale is always excluded.

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

2. **Translate complex ICU strings manually.** When `skippedLocales` is non-empty, those strings need a human translator who understands plural rules, gender selection, and other ICU constructs for the target language.

3. **Use environment variables for API keys.** Never commit API keys to `.lingo-tracker.json` or any other file in version control.

4. **Start with a dry run.** Before enabling auto-translation across a large resource set, test with a small collection to verify the provider setup and review output quality.

5. **Normalize after bulk translation.** If you auto-translate many resources at once, run `lingo-tracker normalize` to ensure all checksums and statuses are consistent.

6. **Be mindful of API costs.** Each string sent to the provider incurs a charge. Strings classified as `complex-icu` are not sent, so they do not incur costs.

7. **Consider per-collection overrides.** Disable auto-translation for collections that contain primarily complex ICU strings or that require specialized translation quality.
