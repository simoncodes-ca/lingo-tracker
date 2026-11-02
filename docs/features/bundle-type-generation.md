---
title: Bundle Type Generation
sidebar_position: 1
---

# Bundle Type Generation

When a bundle has a `typeDistFile`, `lingo-tracker bundle` also writes a TypeScript file that exports a constant tree of your translation keys. Reference keys through the constant instead of typing strings, and a wrong or deleted key becomes a compile error with autocomplete along the way.

The constant holds the key strings, not the translations, so it is small and safe to import anywhere.

## Configuration

To enable type generation, add the `typeDistFile` property to your bundle definition in `.lingo-tracker.json`. This property specifies the output file path for the generated TypeScript file. The path must end with `.ts` and must point to a file, not a directory. Intermediate directories are created automatically if they do not exist.

```json
{
  "bundles": {
    "common": {
      "bundleName": "common.{locale}",
      "dist": "./dist/i18n",
      "collections": "All",
      "typeDistFile": "./src/generated/common-tokens.ts",
      "tokenCasing": "upperCase"
    }
  }
}
```

The `tokenCasing` property is optional and defaults to `"upperCase"`. It can also be set at the global level (root of `.lingo-tracker.json`) to apply to all bundles. Per-bundle settings override the global value.

## Usage

Type generation is automatically triggered when you run the `bundle` command for any bundle that has `typeDistFile` configured.

```bash
# Generate bundles and types
lingo-tracker bundle
```

### Output

Generated files export a constant object with the structure of your translation keys. The casing of the keys depends on the `tokenCasing` setting.

### `upperCase` (default)

Each key segment is upper-cased and hyphens become underscores. Segments are not split on inner capitals: `docsLabel` becomes `DOCSLABEL`, not `DOCS_LABEL`. Use hyphenated or lowercase segments in keys if you want readable upper-case tokens.

**Example Translation Key**: `common.buttons.ok`

**Generated TypeScript**:

```typescript
// src/generated/common-tokens.ts
export const COMMON_TOKENS = {
  COMMON: {
    BUTTONS: {
      OK: 'common.buttons.ok',
    },
  },
} as const;

export type CommonTokens = typeof COMMON_TOKENS;
```

Every key segment becomes a level, including the first one.

**Usage in Code**:

```typescript
import { COMMON_TOKENS } from '@/generated/common-tokens';

// Type-safe reference
const key = COMMON_TOKENS.COMMON.BUTTONS.OK; // "common.buttons.ok"
```

### `camelCase`

Keys are converted to `camelCase`. Note that the const name remains `SCREAMING_SNAKE_CASE` (`COMMON_TOKENS`) and the type name remains PascalCase (`CommonTokens`); only the nested key segments use camelCase.

**Example Translation Key**: `common.buttons.ok`

**Generated TypeScript**:

```typescript
// src/generated/common-tokens.ts
export const COMMON_TOKENS = {
  common: {
    buttons: {
      ok: 'common.buttons.ok',
    },
  },
} as const;

export type CommonTokens = typeof COMMON_TOKENS;
```

To use camelCase, set `tokenCasing` in your bundle config or pass `--token-casing camelCase` to the `bundle` CLI command:

```bash
lingo-tracker bundle --token-casing camelCase
```

**Property path comparison** (arrows indicate nested object levels):

| Translation Key | `upperCase` (default) | `camelCase` |
|---|---|---|
| `file-upload` | `FILE_UPLOAD` | `fileUpload` |
| `docsLabel` | `DOCSLABEL` | `docsLabel` |
| `common.buttons.ok` | `COMMON` → `BUTTONS` → `OK` | `common` → `buttons` → `ok` |

## Token Casing Precedence

The `tokenCasing` value is resolved in the following order (first match wins):

1. CLI flag: `--token-casing <casing>`
2. Per-bundle config: `tokenCasing` inside the bundle definition
3. Global config: `tokenCasing` at the root of `.lingo-tracker.json`
4. Default: `"upperCase"`

## Custom Constant Name

By default, the generated constant name is derived from the bundle key (e.g., `common` → `COMMON_TOKENS`). You can override this with the `tokenConstantName` property in your bundle definition.

The value must be a valid JavaScript identifier using only ASCII characters (letters A–Z/a–z, digits, underscores `_`, and dollar signs `$`). Any casing is accepted — the type name is always auto-derived as PascalCase from whatever you provide.

```json
{
  "bundles": {
    "common": {
      "bundleName": "common.{locale}",
      "dist": "./dist/i18n",
      "collections": "All",
      "typeDistFile": "./src/generated/common-tokens.ts",
      "tokenConstantName": "MY_KEYS"
    }
  }
}
```

**Generated output:**

```typescript
export const MY_KEYS = {
  COMMON: {
    BUTTONS: {
      OK: 'common.buttons.ok',
    },
  },
} as const;

export type MyKeys = typeof MY_KEYS;
```

**Derivation examples:**

| `tokenConstantName` | Constant | Type |
|---|---|---|
| `MY_KEYS` | `MY_KEYS` | `MyKeys` |
| `myKeys` | `myKeys` | `MyKeys` |
| `MyKeys` | `MyKeys` | `MyKeys` |
| `APP_TRANSLATION_TOKENS` | `APP_TRANSLATION_TOKENS` | `AppTranslationTokens` |

You can also override at the CLI level with `--token-constant-name`. This flag requires exactly one bundle to be targeted via `--name`; it is not compatible with multi-bundle runs or "all bundles" mode:

```bash
lingo-tracker bundle --name common --token-constant-name MY_KEYS
```

## Naming Conventions

- **Const Name**: By default, `SCREAMING_SNAKE_CASE` with `_TOKENS` suffix (e.g., `common` -> `COMMON_TOKENS`). Can be overridden with `tokenConstantName`.
- **Type Name**: Always PascalCase, derived from the constant name (e.g., `COMMON_TOKENS` -> `CommonTokens`).
- **Key Segments (upperCase)**: upper-cased with hyphens turned into underscores (`buttons` -> `BUTTONS`, `file-upload` -> `FILE_UPLOAD`, `docsLabel` -> `DOCSLABEL`).
- **Key Segments (camelCase)**: kept as written unless they contain hyphens (`file-upload` -> `fileUpload`).
- **Numeric Segments**: preserved (`steps.1.title` -> `STEPS.1.TITLE`).
- **Colliding tokens**: two keys that map to the same token path, such as `fileUpload` and `fileupload` under `upperCase`, fail the bundle with a conflict error.
- **Hierarchical conflicts**: a key that is both a value and a parent (`buttons` and `buttons.ok`) fails the bundle before anything is written, because nested JSON and a nested constant cannot hold both.
- **Empty bundles**: when a bundle resolves to zero keys, no `.ts` file is written and a warning is printed.

## Integration

### NPM Scripts

Add it to your build process:

```json
{
  "scripts": {
    "prebuild": "lingo-tracker bundle"
  }
}
```

### Nx

Configure a target in your `project.json`:

```json
"targets": {
  "i18n": {
    "executor": "nx:run-commands",
    "options": {
      "command": "lingo-tracker bundle"
    }
  }
}
```
