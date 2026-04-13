---
title: Bundle Type Generation
sidebar_position: 1
---

# Bundle Type Generation

LingoTracker can automatically generate TypeScript type definitions for your translation bundles. This provides compile-time type safety, autocomplete, and refactoring support for your translation keys.

## Features

- **Type Safety**: Catch missing or typo'd keys at compile time.
- **Autocomplete**: Discover available translation keys in your IDE.
- **Refactoring**: Safely rename keys and update all usages automatically.
- **Zero Config Integration**: Works seamlessly with the existing `bundle` command.

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

Keys are converted to `SCREAMING_SNAKE_CASE`.

**Example Translation Key**: `common.buttons.ok`

**Generated TypeScript**:

```typescript
// src/generated/common-tokens.ts
export const COMMON_TOKENS = {
  BUTTONS: {
    OK: 'common.buttons.ok',
  },
} as const;

export type CommonTokens = typeof COMMON_TOKENS;
```

**Usage in Code**:

```typescript
import { COMMON_TOKENS } from '@/generated/common-tokens';

// Type-safe reference
const key = COMMON_TOKENS.BUTTONS.OK; // "common.buttons.ok"
```

### `camelCase`

Keys are converted to `camelCase`. Note that the const name remains `SCREAMING_SNAKE_CASE` (`COMMON_TOKENS`) and the type name remains PascalCase (`CommonTokens`); only the nested key segments use camelCase.

**Example Translation Key**: `common.buttons.ok`

**Generated TypeScript**:

```typescript
// src/generated/common-tokens.ts
export const COMMON_TOKENS = {
  buttons: {
    ok: 'common.buttons.ok',
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
  BUTTONS: {
    OK: 'common.buttons.ok',
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
- **Key Segments (upperCase)**: Converted to `SCREAMING_SNAKE_CASE` (e.g., `buttons` -> `BUTTONS`, `file-upload` -> `FILE_UPLOAD`).
- **Key Segments (camelCase)**: Converted to `camelCase` (e.g., `buttons` -> `buttons`, `file-upload` -> `fileUpload`).
- **Numeric Segments**: Preserved as-is (e.g., `steps.1.title` -> `STEPS.1.TITLE` or `steps.1.title`).
- **Mixed nodes** (a key that is both a leaf and a parent, e.g., `buttons` and `buttons.ok` both exist): the leaf value is dropped and only the children are emitted. Standard i18n usage does not produce such keys.
- **Empty bundles**: if the bundle resolves to zero keys, type generation is skipped and a warning is printed. No `.ts` file is written.

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
