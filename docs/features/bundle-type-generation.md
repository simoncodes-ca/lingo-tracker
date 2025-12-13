# Bundle Type Generation

LingoTracker can automatically generate TypeScript type definitions for your translation bundles. This provides compile-time type safety, autocomplete, and refactoring support for your translation keys.

## Features

- **Type Safety**: Catch missing or typo'd keys at compile time.
- **Autocomplete**: Discover available translation keys in your IDE.
- **Refactoring**: Safely rename keys and update all usages automatically.
- **Zero Config Integration**: Works seamlessly with the existing `bundle` command.

## Configuration

To enable type generation, add the `typeDist` property to your bundle definition in `.lingo-tracker.json`. This property specifies the output path for the generated TypeScript file.

```json
{
  "bundles": {
    "common": {
      "bundleName": "common.{locale}",
      "dist": "./dist/i18n",
      "collections": "All",
      "typeDist": "./src/generated/common-tokens.ts"
    }
  }
}
```

## Usage

Type generation is automatically triggered when you run the `bundle` command for any bundle that has `typeDist` configured.

```bash
# Generate bundles and types
lingo-tracker bundle
```

### Output

Generated files export a constant object with the structure of your translation keys, converted to `SCREAMING_SNAKE_CASE`.

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

## Naming Conventions

- **Bundle Keys**: Converted to `SCREAMING_SNAKE_CASE` with `_TOKENS` suffix (e.g., `common` -> `COMMON_TOKENS`).
- **Key Segments**: Converted to `SCREAMING_SNAKE_CASE` (e.g., `buttons` -> `BUTTONS`, `file-upload` -> `FILE_UPLOAD`).
- **Numeric Segments**: Preserved as-is (e.g., `steps.1.title` -> `STEPS.1.TITLE`).

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
