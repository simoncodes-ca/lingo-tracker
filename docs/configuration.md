---
title: Configuration
sidebar_position: 4
---

# Configuration

All settings live in `.lingo-tracker.json` in the project root. `init` creates it. The CLI reads it from `INIT_CWD` when a package manager sets that variable, otherwise from the current directory. `lingo-tracker-app` reads it from the directory it was started in. Neither searches parent folders.

The file is plain JSON. Reading requires only a JSON object. Writes additionally require a `baseLocale`, an array for `locales` and an object for `collections`. When present, `runtime` is also checked on read and write; no other field is checked, so a misspelled field is ignored silently. Compare against this page when a setting has no effect.

Writes by the CLI, API or UI are guarded: if the file changed on disk between read and write, the write is refused with a conflict error instead of overwriting someone else's edit.

## Complete example

```json
{
  "baseLocale": "en",
  "locales": ["en", "fr-ca", "es", "ja"],
  "exportFolder": "dist/lingo-export",
  "importFolder": "dist/lingo-import",
  "tokenCasing": "upperCase",
  "runtime": "transloco-messageformat",
  "transformICUToTransloco": true,
  "protectedTermsFile": ".lingo-tracker-protected-terms.json",
  "preferredTerminologyFile": ".lingo-tracker-preferred-terminology.json",
  "translation": {
    "enabled": true,
    "provider": "google-translate",
    "apiKeyEnv": "GOOGLE_TRANSLATE_API_KEY",
    "batchSize": 5,
    "delayMs": 1000
  },
  "collections": {
    "main": {
      "translationsFolder": "apps/web/src/i18n",
      "tags": ["web"]
    },
    "design": {
      "translationsFolder": "node_modules/@acme/design-system/i18n",
      "readOnly": true,
      "protectedTermsFile": "node_modules/@acme/design-system/protected-terms.json"
    }
  },
  "bundles": {
    "web": {
      "bundleName": "{locale}",
      "dist": "./apps/web/src/assets/i18n",
      "collections": "All",
      "typeDistFile": "./apps/web/src/generated/tokens.ts"
    }
  }
}
```

## Global fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `baseLocale` | string | required | The authoring locale. `init` writes `en` unless told otherwise. |
| `locales` | string[] | `[]` | All supported locales. Include the base locale. **Bundles are generated for this list only**, so a locale added to a single collection with `add-locale` must also be added here before it can be bundled. |
| `exportFolder` | string | `dist/lingo-export` | Default output folder for `export`. |
| `importFolder` | string | `dist/lingo-import` | Folder the UI's Import dialog lists. The CLI `import` takes an explicit `--source`. |
| `tokenCasing` | `"upperCase"` or `"camelCase"` | `upperCase` | Default casing for generated TypeScript keys. Overridable per bundle and by the `--token-casing` flag. |
| `runtime` | `"transloco-messageformat"` or `"transloco"` | `transloco-messageformat` | How the app renders bundles. Global only. Import and bundle both read it. Under `transloco`, a single `{` or `'` is literal text: import quotes it in storage and bundle unquotes it. Values with ICU `plural`, `select` or similar are still bundled in messageformat form, with a warning. `init` detects it from `package.json` (`dependencies` and `devDependencies` only, not `peerDependencies`, so a library repo should pass `--runtime`); any other value fails every command. |
| `transformICUToTransloco` | boolean | `true` | Convert `{name}` to `{{ name }}` in bundles. Overridable per bundle. With `false`, bundles hold stored ICU and `runtime` has no effect on them. |
| `protectedTermsFile` | string | `.lingo-tracker-protected-terms.json` | Path to the global protected-terms file, resolved against the config directory. |
| `preferredTerminologyFile` | string | `.lingo-tracker-preferred-terminology.json` | Path to the preferred-terminology rule file. Global only. |
| `translation` | object | none | Machine translation settings, see below. |
| `collections` | object | required | Collection name to collection entry. |
| `bundles` | object | `init` creates `main` | Bundle name to bundle definition. |

Locale codes must match `language` or `language-region` with two to four letters in the region, such as `en`, `fr-ca` or `zh-hans`, case-insensitive. Codes with three subtags, such as `zh-Hant-TW`, or numeric regions, such as `es-419`, are rejected by `add-locale` and the collection dialog. `init --locales` and hand edits are not validated.

## Collection entry

| Field | Type | Inheritance |
|---|---|---|
| `translationsFolder` | string | Required. Resolved against the config directory. |
| `baseLocale` | string | Collection value, else global. |
| `locales` | string[] | Collection value when non-empty, else global. An empty array means inherit. |
| `translation` | object | **Replaces** the global block entirely. It is not merged, so a per-collection override must repeat `provider` and `apiKeyEnv`. `{ "enabled": false }` alone is valid only because a disabled block is never used. |
| `readOnly` | boolean | `true` blocks every write to the collection's resources. Set automatically by `add-collection` for paths under `node_modules`. |
| `tags` | string[] | Tags every resource in the collection inherits. Normalized on read. |
| `protectedTermsFile` | string | The collection's own protected-terms file. No default. Its terms are added to the global ones. |
| `exportFolder`, `importFolder` | string | Stored, but only `importFolder` is used, by the UI's Import dialog. Export always uses the global folder or `--output`. |

`baseLocale`, `locales`, `exportFolder` and `importFolder` are omitted from the entry when they equal the global value. A `translation` block is stored as supplied. To clear a field through the API or UI, send `""`, `[]` or `false`; the field is then removed and the collection inherits the global value again. A `translation` override cannot be cleared that way; edit the file.

Fields that cannot be set per collection: `bundles`, `tokenCasing`, `transformICUToTransloco`, `preferredTerminologyFile`.

## Translation block

```json
"translation": {
  "enabled": true,
  "provider": "google-translate",
  "apiKeyEnv": "GOOGLE_TRANSLATE_API_KEY",
  "batchSize": 5,
  "delayMs": 1000
}
```

| Field | Default | Notes |
|---|---|---|
| `enabled` | | `false` turns the feature off without deleting the block. |
| `provider` | | Only `google-translate` is implemented. Any other value errors at translation time. |
| `apiKeyEnv` | | Name of the environment variable that holds the key. The key itself never goes in the file. |
| `batchSize` | `5` | Resources per provider request when translating many resources. |
| `delayMs` | `1000` | Pause between those batches. |

See [Auto-Translation](./auto-translation.md).

## Bundle definition

```json
"web": {
  "bundleName": "{locale}",
  "dist": "./apps/web/src/assets/i18n",
  "collections": [
    {
      "name": "main",
      "bundledKeyPrefix": "web",
      "entriesSelectionRules": [
        { "matchingPattern": "apps.web.*", "matchingTags": ["ui"], "matchingTagOperator": "All" }
      ],
      "mergeStrategy": "merge"
    }
  ],
  "typeDistFile": "./apps/web/src/generated/tokens.ts",
  "tokenCasing": "camelCase",
  "tokenConstantName": "WEB_TOKENS",
  "transformICUToTransloco": true
}
```

| Field | Required | Notes |
|---|---|---|
| bundle key | | Letters, digits, `-` and `_`. Used by `bundle --name` and to derive the default constant name. |
| `bundleName` | yes | File name pattern. Must contain `{locale}`. `{locale}/main` writes one folder per locale. |
| `dist` | yes | Output folder, relative to the project root. |
| `collections` | yes | `"All"`, or an ordered list of collection selections. The same collection can appear twice only with different `bundledKeyPrefix` values. |
| `collections[].name` | yes | A collection name from `collections`. |
| `collections[].bundledKeyPrefix` | | Prefix added to every key from this collection. |
| `collections[].entriesSelectionRules` | yes | `"All"`, or a list of rules. An entry is included when any rule matches. |
| rule `matchingPattern` | yes | `*` for every key, `prefix.*` for a key and everything under it, or an exact key. |
| rule `matchingTags` | | Lowercase tags. `["*"]` means "has any tag". |
| rule `matchingTagOperator` | | `Any` (default) or `All`. |
| `collections[].mergeStrategy` | | `merge` (default): an earlier collection's value wins. `override`: this collection's value replaces earlier ones. |
| `typeDistFile` | | A `.ts` path. Enables TypeScript key generation. |
| `tokenCasing` | | Overrides the global value for this bundle. |
| `tokenConstantName` | | A valid JavaScript identifier. Default is the bundle key upper-cased, hyphens turned into underscores, with `_TOKENS` appended: `core-ui` gives `CORE_UI_TOKENS`. |
| `transformICUToTransloco` | | Overrides the global value for this bundle. |

Precedence for `tokenCasing` and `transformICUToTransloco`: CLI flag, then bundle, then global, then default.

See [Bundling](./guides/bundling.md) and [Bundle Type Generation](./features/bundle-type-generation.md).

## Terminology files

Both files are optional and are created on the first `--add`.

`.lingo-tracker-protected-terms.json` is a JSON array of strings, kept sorted:

```json
["Acme", "iPhone", "Node.js"]
```

`.lingo-tracker-preferred-terminology.json` is a JSON array of rules, kept sorted by discouraged term:

```json
[
  { "discouraged": "E-mail", "preferred": "email" },
  { "discouraged": "Expenditure", "preferred": "Investment", "reason": "Current planning term." }
]
```

See [Protected Terms](./features/protected-terms.md) and [Preferred Terminology](./features/preferred-terminology.md).

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| the name in `translation.apiKeyEnv` | CLI, API | Machine translation API key |
| `LINGO_TRACKER_PORT` | `lingo-tracker-app` | Listening port, default `3030`. The `--port` flag wins. |
| `LINGO_TRACKER_HOST` | `lingo-tracker-app` | Bind address, default `127.0.0.1`. The `--host` flag wins. |
| `LINGO_TRACKER_ALLOWED_HOSTS` | `lingo-tracker-app` | Comma-separated host names accepted in the `Host` header besides `localhost` and IP literals. A port in an entry is ignored. |
| `LINGO_TRACKER_REVALIDATE_INTERVAL_MS` | `lingo-tracker-app` | How often the in-memory index checks the disk for outside changes, default `2000`. |
| `LINGO_TRACKER_MAX_CACHED_COLLECTIONS` | `lingo-tracker-app` | Collections kept indexed in memory, default `4`. |
| `INIT_CWD` | CLI | Set by package managers. When present, the CLI uses it as the project root, so `pnpm lingo-tracker …` works from the directory you typed it in. |

## Generated and ignorable files

Commit `.lingo-tracker.json`, the terminology files and every translations folder. Bundle output and the generated token file are build artifacts; most projects generate them in a `prebuild` step and list them in `.gitignore`. Exports and imports default to `dist/`, which is normally ignored already.
