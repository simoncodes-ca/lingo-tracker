---
title: Bundling
sidebar_position: 1
---

# Bundle Generation Guide

This guide provides comprehensive examples and best practices for using LingoTracker's bundle generation feature to create optimized translation files for your applications.

## Table of Contents

1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [Bundle Configuration](#bundle-configuration)
4. [Merge Strategies](#merge-strategies)
5. [Pattern Matching](#pattern-matching)
6. [Tag-Based Filtering](#tag-based-filtering)
7. [Framework Integration](#framework-integration)
8. [Build Pipeline Integration](#build-pipeline-integration)
9. [Advanced Use Cases](#advanced-use-cases)
10. [Troubleshooting](#troubleshooting)

---

## Introduction

### What Are Bundles?

LingoTracker stores translations in a structured format optimized for management — version control friendly, metadata-rich, and split across many small files. Your application, however, needs deployment-ready JSON files per locale at runtime. Bundles are that output: **one or more domain-specific translation files** assembled from LingoTracker's source translations.

A single app might ship a `core` bundle loaded eagerly, an `admin` bundle loaded only for admin users, and a `reports` bundle lazy-loaded on demand. Each bundle is independently configured — you control which collections and keys go into it using key patterns, tags, or both. Tags in particular enable a high degree of customization: you can slice your translations by any cross-cutting concern (feature, audience, environment) regardless of how keys are structured in the folder hierarchy.

**Source (LingoTracker)**:
```
translations/
├── apps/
│   └── common/
│       └── buttons/
│           ├── resource_entries.json
│           └── tracker_meta.json
```

**Output (Bundle)**:
```json
{
  "apps": {
    "common": {
      "buttons": {
        "ok": "OK",
        "cancel": "Cancel",
        "apply": "Apply"
      }
    }
  }
}
```

---

## Quick Start

> **Prerequisites**: Complete the [Getting Started](../getting-started.md) guide first. You should already have a `.lingo-tracker.json` with at least one collection configured.

### 1. Add Bundle Configuration

Edit `.lingo-tracker.json`:

```json
{
  "exportFolder": "dist/lingo-export",
  "importFolder": "dist/lingo-import",
  "baseLocale": "en",
  "locales": ["en", "fr-ca", "es"],
  "collections": {
    "Main": {
      "translationsFolder": "translations"
    }
  },
  "bundles": {
    "main": {
      "bundleName": "{locale}",
      "dist": "./src/assets/i18n",
      "collections": "All"
    }
  }
}
```

### 2. Generate Bundles

```bash
lingo-tracker bundle
```

### 3. Output

Generated files:
```
src/assets/i18n/
├── en.json
├── fr-ca.json
└── es.json
```

Each file contains hierarchical JSON with all translations for that locale.

> **Want TypeScript type safety?** Add `typeDistFile` to your bundle config and LingoTracker will generate a typed constants file alongside the JSON bundles. See [Bundle Type Generation](../features/bundle-type-generation.md).

### 4. Add Type-Safe Tokens (Optional)

Extend the bundle config with `typeDistFile`:

```json
{
  "bundles": {
    "main": {
      "bundleName": "{locale}",
      "dist": "./src/assets/i18n",
      "collections": "All",
      "typeDistFile": "./src/generated/main-tokens.ts"
    }
  }
}
```

Running `lingo-tracker bundle` now also generates `src/generated/main-tokens.ts`:

```typescript
// src/generated/main-tokens.ts (auto-generated — do not edit)
export const MAIN_TOKENS = {
  APPS: {
    COMMON: {
      BUTTONS: {
        OK: 'apps.common.buttons.ok',
        CANCEL: 'apps.common.buttons.cancel',
        APPLY: 'apps.common.buttons.apply',
      },
    },
  },
} as const;

export type MainTokens = typeof MAIN_TOKENS;
```

Use the constants in your components — no more hardcoded string keys:

```typescript
import { MAIN_TOKENS } from '@/generated/main-tokens';

@Component({
  template: `
    <h1>{{ tokens.APPS.COMMON.BUTTONS.OK | transloco }}</h1>
    <button>{{ tokens.APPS.COMMON.BUTTONS.CANCEL | transloco }}</button>
  `
})
export class AppComponent {
  readonly tokens = MAIN_TOKENS;
}
```

Or pass individual keys directly:

```typescript
this.translocoService.translate(MAIN_TOKENS.APPS.COMMON.BUTTONS.OK);
```

Your IDE will autocomplete available keys, and renaming a key in LingoTracker regenerates the constant — any stale references become compile errors.

---

## Bundle Configuration

### Basic Bundle Structure

```json
{
  "bundles": {
    "cli-reference-name": {
      "bundleName": "output-filename-pattern",
      "dist": "./output/directory",
      "typeDistFile": "./optional/path/to/generated-tokens.ts",
      "tokenConstantName": "OPTIONAL_CUSTOM_NAME",
      "tokenCasing": "upperCase",
      "collections": "All or array of collection definitions"
    }
  }
}
```

The `tokenCasing` property is optional (default: `"upperCase"`) and controls the casing of keys in generated type files. Accepts `"upperCase"` (SCREAMING_SNAKE_CASE) or `"camelCase"`. Can also be set globally at the root of `.lingo-tracker.json` or overridden via the `--token-casing` CLI flag.

The `tokenConstantName` property is optional and allows you to customize the name of the generated TypeScript constant. Must be a valid JavaScript identifier. When omitted, the name is derived from the bundle key (e.g., `main` → `MAIN_TOKENS`). Can also be overridden via the `--token-constant-name` CLI flag (single bundle only).

See [Bundle Type Generation](../features/bundle-type-generation.md) for details.

### Simple Bundle (All Collections)

Include everything from all collections:

```json
{
  "bundles": {
    "complete": {
      "bundleName": "{locale}",
      "dist": "./dist/i18n",
      "collections": "All"
    }
  }
}
```

**Generates**: `dist/i18n/en.json`, `dist/i18n/fr-ca.json`, etc.

### Multiple Bundles

Generate different bundles for different purposes:

```json
{
  "bundles": {
    "core": {
      "bundleName": "core.{locale}",
      "dist": "./dist/i18n",
      "collections": [
        {
          "name": "Common",
          "entriesSelectionRules": "All"
        }
      ]
    },
    "admin": {
      "bundleName": "admin.{locale}",
      "dist": "./dist/admin/i18n",
      "collections": [
        {
          "name": "Admin",
          "entriesSelectionRules": "All"
        }
      ]
    }
  }
}
```

**Generates**:
- `dist/i18n/core.en.json`, `dist/i18n/core.fr-ca.json`
- `dist/admin/i18n/admin.en.json`, `dist/admin/i18n/admin.fr-ca.json`

### Filename Patterns

The `{locale}` placeholder in `bundleName` is replaced with each locale at generation time:

| `bundleName` | Output files (locales: `en`, `fr-ca`) |
|---|---|
| `{locale}` | `dist/i18n/en.json`, `dist/i18n/fr-ca.json` |
| `app.{locale}` | `dist/app.en.json`, `dist/app.fr-ca.json` |
| `{locale}/main` | `dist/i18n/en/main.json`, `dist/i18n/fr-ca/main.json` |

The subdirectory form (`{locale}/main`) is useful for frameworks that expect one folder per locale.

---

## Merge Strategies

When multiple collections contribute the same key, merge strategies determine which value is used.

### `merge` Strategy (Default)

**First collection wins** - keeps the value from the first collection that defines the key.

```json
{
  "bundles": {
    "combined": {
      "bundleName": "{locale}",
      "dist": "./dist/i18n",
      "collections": [
        {
          "name": "Common",
          "entriesSelectionRules": "All"
        },
        {
          "name": "App",
          "entriesSelectionRules": "All"
        }
      ]
    }
  }
}
```

> `merge` is the default strategy, so you don't need to specify it explicitly.

**Example**:

Common collection has: `apps.buttons.ok = "OK"`
App collection has: `apps.buttons.ok = "Okay"`

**Result**: `apps.buttons.ok = "OK"` (Common wins, it's first)

### `override` Strategy

**Later collection wins** - value from later collection overwrites previous.

```json
{
  "bundles": {
    "customized": {
      "bundleName": "{locale}",
      "dist": "./dist/i18n",
      "collections": [
        {
          "name": "Defaults",
          "entriesSelectionRules": "All",
          "mergeStrategy": "merge"
        },
        {
          "name": "Overrides",
          "entriesSelectionRules": "All",
          "mergeStrategy": "override"
        }
      ]
    }
  }
}
```

**Example**:

Defaults has: `apps.buttons.ok = "OK"`
Overrides has: `apps.buttons.ok = "Confirm"`

**Result**: `apps.buttons.ok = "Confirm"` (Overrides wins, it's later)

### Use Cases

**Use `merge` (default) when**:
- Building a base bundle from common translations
- You want consistent defaults across your app
- First collection provides authoritative values

**Use `override` when**:
- Customizing translations for specific contexts
- Applying overrides or theme-specific translations
- Later collections provide specialized values

---

## Pattern Matching

Pattern matching allows you to filter which translation keys are included in a bundle.

### Match All Keys

```json
{
  "name": "Common",
  "entriesSelectionRules": "All"
}
```

Includes every translation from the Common collection.

### Exact Match

```json
{
  "name": "Common",
  "entriesSelectionRules": [
    {
      "matchingPattern": "apps.common.buttons.ok"
    }
  ]
}
```

Includes only the exact key `apps.common.buttons.ok`.

### Wildcard Match

```json
{
  "name": "Common",
  "entriesSelectionRules": [
    {
      "matchingPattern": "apps.*"
    }
  ]
}
```

Includes:
- `apps` (if it exists)
- `apps.common.buttons.ok`
- `apps.common.buttons.cancel`
- `apps.admin.title`
- Any key starting with `apps.`

### Multiple Patterns

```json
{
  "name": "Common",
  "entriesSelectionRules": [
    {
      "matchingPattern": "apps.*"
    },
    {
      "matchingPattern": "shared.*"
    },
    {
      "matchingPattern": "global.title"
    }
  ]
}
```

Includes keys matching **any** of the patterns (OR logic).

### Pattern Examples

| Pattern | Matches |
|---------|---------|
| `"*"` | All keys |
| `"apps.*"` | `apps`, `apps.title`, `apps.common.ok`, etc. |
| `"apps.common.*"` | `apps.common`, `apps.common.ok`, `apps.common.buttons.cancel` |
| `"apps.common.buttons.ok"` | Only `apps.common.buttons.ok` |

---

## Tag-Based Filtering

Tags allow you to filter translations based on metadata, independent of key structure.

### Basic Tag Filter

```json
{
  "name": "Common",
  "entriesSelectionRules": [
    {
      "matchingPattern": "*",
      "matchingTags": ["ui"]
    }
  ]
}
```

Includes all keys tagged with `ui`.

### Multiple Tags with "Any" Operator

```json
{
  "name": "Common",
  "entriesSelectionRules": [
    {
      "matchingPattern": "*",
      "matchingTags": ["ui", "admin"],
      "matchingTagOperator": "Any"
    }
  ]
}
```

Includes keys with `ui` **OR** `admin` tag.

### Multiple Tags with "All" Operator

```json
{
  "name": "Common",
  "entriesSelectionRules": [
    {
      "matchingPattern": "*",
      "matchingTags": ["ui", "critical"],
      "matchingTagOperator": "All"
    }
  ]
}
```

Includes only keys with **both** `ui` **AND** `critical` tags.

### Combining Patterns and Tags

```json
{
  "name": "Common",
  "entriesSelectionRules": [
    {
      "matchingPattern": "apps.common.*",
      "matchingTags": ["ui", "buttons"],
      "matchingTagOperator": "All"
    }
  ]
}
```

Includes keys that:
- Start with `apps.common.`, **AND**
- Have both `ui` **AND** `buttons` tags

### Match Any Tagged Entry

```json
{
  "name": "Common",
  "entriesSelectionRules": [
    {
      "matchingPattern": "*",
      "matchingTags": ["*"]
    }
  ]
}
```

Includes any key that has **at least one tag** (excludes untagged entries).

---

## Framework Integration

### Transloco (Angular)

**Bundle Configuration**:
```json
{
  "bundles": {
    "transloco": {
      "bundleName": "{locale}",
      "dist": "./src/assets/i18n",
      "collections": "All"
    }
  }
}
```

**Transloco Setup** (`app.config.ts`):
```typescript
import { provideTransloco } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './transloco-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideTransloco({
      config: {
        availableLangs: ['en', 'fr-ca', 'es'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader
    }),
  ],
};
```

**HTTP Loader** (`transloco-loader.ts`):
```typescript
import { inject, Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`/assets/i18n/${lang}.json`);
  }
}
```

**Usage in Components**:
```typescript
@Component({
  template: `
    <h1>{{ 'apps.common.title' | transloco }}</h1>
    <button>{{ 'apps.common.buttons.ok' | transloco }}</button>
  `
})
export class AppComponent {}
```

> LingoTracker currently has first-class integration guidance for Angular/Transloco. Other frameworks (React, Vue, etc.) work the same way — configure `bundleName` and `dist` to match where your i18n library expects to load files from.

---

## Build Pipeline Integration

### NPM Scripts

Add bundle generation to your `package.json`:

```json
{
  "scripts": {
    "build": "npm run bundle && ng build",
    "bundle": "lingo-tracker bundle",
    "bundle:prod": "lingo-tracker bundle --verbose",
    "prebuild": "npm run bundle"
  }
}
```

### Nx Integration

For Nx monorepos, add a target to your `project.json`:

```json
{
  "name": "my-app",
  "targets": {
    "bundle": {
      "executor": "nx:run-commands",
      "options": {
        "command": "lingo-tracker bundle"
      }
    },
    "build": {
      "executor": "@angular-devkit/build-angular:browser",
      "dependsOn": ["bundle"]
    }
  }
}
```

### CI/CD Pipeline

**GitHub Actions Example**:
```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Generate translation bundles
        run: npx lingo-tracker bundle --verbose

      - name: Build application
        run: npm run build

      - name: Deploy
        run: npm run deploy
```

**GitLab CI Example**:
```yaml
build:
  stage: build
  script:
    - npm ci
    - npx lingo-tracker bundle
    - npm run build
  artifacts:
    paths:
      - dist/
```

### Webpack Integration

Add as a pre-build step in `webpack.config.js`:

```javascript
const { execSync } = require('child_process');

module.exports = {
  // ... other config

  plugins: [
    {
      apply: (compiler) => {
        compiler.hooks.beforeCompile.tap('GenerateBundles', () => {
          console.log('Generating translation bundles...');
          execSync('lingo-tracker bundle', { stdio: 'inherit' });
        });
      }
    }
  ]
};
```

### Vite Integration

Create a Vite plugin (`vite.config.ts`):

```typescript
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

function generateBundles() {
  return {
    name: 'generate-bundles',
    buildStart() {
      console.log('Generating translation bundles...');
      execSync('lingo-tracker bundle', { stdio: 'inherit' });
    }
  };
}

export default defineConfig({
  plugins: [generateBundles()]
});
```

---

## Advanced Use Cases

### Lazy-Loaded Modules

Create separate bundles for lazy-loaded routes:

```json
{
  "bundles": {
    "core": {
      "bundleName": "core.{locale}",
      "dist": "./src/assets/i18n",
      "collections": [
        {
          "name": "Common",
          "entriesSelectionRules": [
            { "matchingPattern": "apps.common.*" }
          ]
        }
      ]
    },
    "admin": {
      "bundleName": "admin.{locale}",
      "dist": "./src/assets/i18n",
      "collections": [
        {
          "name": "Admin",
          "entriesSelectionRules": [
            { "matchingPattern": "apps.admin.*" }
          ]
        }
      ]
    },
    "reports": {
      "bundleName": "reports.{locale}",
      "dist": "./src/assets/i18n",
      "collections": [
        {
          "name": "Reports",
          "entriesSelectionRules": [
            { "matchingPattern": "apps.reports.*" }
          ]
        }
      ]
    }
  }
}
```

Load bundles on demand with Transloco:

```typescript
this.translocoService.setActiveLang('en');
this.translocoService.load('admin').subscribe();
```

### Tag-Driven Multi-Bundle Split

Tags let you split a single collection into multiple bundles without relying on key structure. This is useful when translations don't follow a clean folder hierarchy, or when the same key might need to appear in more than one bundle.

In this example, a single `App` collection is tagged per feature area. Each bundle selects only the keys tagged for it:

**Tagging your resources** (in LingoTracker UI or via CLI):
- `apps.common.*` keys → tagged `core`
- `apps.admin.*` keys → tagged `admin`
- `apps.reports.*` keys → tagged `reports`

**Bundle configuration**:

```json
{
  "bundles": {
    "core": {
      "bundleName": "core.{locale}",
      "dist": "./src/assets/i18n",
      "collections": [
        {
          "name": "App",
          "entriesSelectionRules": [
            {
              "matchingPattern": "*",
              "matchingTags": ["core"]
            }
          ]
        }
      ]
    },
    "admin": {
      "bundleName": "admin.{locale}",
      "dist": "./src/assets/i18n",
      "collections": [
        {
          "name": "App",
          "entriesSelectionRules": [
            {
              "matchingPattern": "*",
              "matchingTags": ["admin"]
            }
          ]
        }
      ]
    },
    "reports": {
      "bundleName": "reports.{locale}",
      "dist": "./src/assets/i18n",
      "collections": [
        {
          "name": "App",
          "entriesSelectionRules": [
            {
              "matchingPattern": "*",
              "matchingTags": ["reports"]
            }
          ]
        }
      ]
    }
  }
}
```

The same approach works for any cross-cutting split: by audience (`public` / `internal`), by feature flag, or by release stage. A key can carry multiple tags, so it can appear in more than one bundle if needed.

### Environment-Specific Bundles

Different bundles for different environments:

```json
{
  "bundles": {
    "development": {
      "bundleName": "dev.{locale}",
      "dist": "./dist/dev/i18n",
      "collections": "All"
    },
    "production": {
      "bundleName": "{locale}",
      "dist": "./dist/prod/i18n",
      "collections": [
        {
          "name": "Production",
          "entriesSelectionRules": [
            {
              "matchingPattern": "*",
              "matchingTags": ["production"],
              "matchingTagOperator": "All"
            }
          ]
        }
      ]
    }
  }
}
```

By default `lingo-tracker bundle` generates all configured bundles. Use `--name` to target a single bundle by its key in `.lingo-tracker.json`:

```bash
lingo-tracker bundle --name production
```

Override token casing for a single bundle run:
```bash
lingo-tracker bundle --name core --token-casing camelCase
```

### Multi-Tenant Applications

Different bundles for different tenants:

```json
{
  "bundles": {
    "tenant-a": {
      "bundleName": "tenant-a.{locale}",
      "dist": "./dist/tenants/a/i18n",
      "collections": [
        {
          "name": "Common",
          "bundledKeyPrefix": "common",
          "entriesSelectionRules": "All"
        },
        {
          "name": "TenantA",
          "mergeStrategy": "override",
          "entriesSelectionRules": "All"
        }
      ]
    },
    "tenant-b": {
      "bundleName": "tenant-b.{locale}",
      "dist": "./dist/tenants/b/i18n",
      "collections": [
        {
          "name": "Common",
          "bundledKeyPrefix": "common",
          "entriesSelectionRules": "All"
        },
        {
          "name": "TenantB",
          "mergeStrategy": "override",
          "entriesSelectionRules": "All"
        }
      ]
    }
  }
}
```

### Bundled Key Prefixes

`bundledKeyPrefix` prepends a namespace segment to every key from a collection before merging. This is useful when two collections have overlapping key structures and you need to keep them separate in the output.

For example, if both `AppTranslations` and `LibraryTranslations` have a `buttons.ok` key, including both without a prefix would cause a collision (only one value survives). With `bundledKeyPrefix`, each collection's keys live under their own namespace.

**Example**:

```json
{
  "bundles": {
    "combined": {
      "bundleName": "{locale}",
      "dist": "./dist/i18n",
      "collections": [
        {
          "name": "AppTranslations",
          "bundledKeyPrefix": "app",
          "entriesSelectionRules": "All"
        },
        {
          "name": "LibraryTranslations",
          "bundledKeyPrefix": "lib",
          "entriesSelectionRules": "All"
        }
      ]
    }
  }
}
```

**Result**:
- `apps.buttons.ok` from AppTranslations → `app.apps.buttons.ok`
- `buttons.ok` from LibraryTranslations → `lib.buttons.ok`

---

## Troubleshooting

> **Tip**: Run `lingo-tracker bundle --help` for a full list of flags. Add `--verbose` to any bundle command to see detailed output about which keys each collection contributes.

### Empty Bundle Warning

**Problem**: "Bundle 'main' for locale 'en' is empty"

**Causes**:
1. No translations match the selection rules
2. Collection doesn't exist
3. Pattern doesn't match any keys
4. Tag filter excludes all entries

**Solutions**:
- Check bundle configuration spelling
- Verify collection names match `.lingo-tracker.json`
- Review pattern matching rules
- Use `--verbose` to see detailed warnings
- Run `lingo-tracker bundle --name main --verbose`


### Merge Conflicts

**Problem**: Unexpected values in bundle (wrong value wins)

**Solution**:
- Check merge strategy (`merge` vs `override`)
- Review collection order (first vs last wins)
- Use `--verbose` to see which collection contributes which keys

### Missing Translations

**Problem**: Some keys are missing from bundle

**Causes**:
1. Pattern doesn't match the key structure
2. Tag filter excludes the entry
3. Entry doesn't exist for that locale

**Solutions**:
- Test patterns: use `"*"` to include everything, then narrow down
- Check tags: remove `matchingTags` temporarily to see all entries
- Run normalize: `lingo-tracker normalize --all` to add missing locales

### File Not Found

**Problem**: Bundle file not created at expected location

**Causes**:
1. `dist` path is wrong
2. Empty bundle (no files created for empty bundles)
3. File system permissions

**Solutions**:
- Check `dist` path is relative to project root
- Verify bundle has matching entries with `--verbose`
- Check folder permissions

### Build Errors

**Problem**: Build fails after adding bundle command

**Causes**:
1. Bundle command runs too late
2. Build cache issues
3. Bundle files not gitignored

**Solutions**:
- Add bundle generation to `prebuild` script
- Clear build cache: `rm -rf dist/ .angular/cache/`
- Add bundle output to `.gitignore` if appropriate
- Use `dependsOn` in Nx configuration

---

## Summary

Bundle generation bridges translation management and application deployment: LingoTracker manages your translations in a structured, version-control-friendly format, and `lingo-tracker bundle` produces the runtime files your app actually loads.

**Recommended next step**: Add bundle generation to your `prebuild` npm script so bundles are always up to date before each build:

```json
{
  "scripts": {
    "prebuild": "lingo-tracker bundle"
  }
}
```

**Further reading**:
- [Bundle Type Generation](../features/bundle-type-generation.md) — generate TypeScript constants for type-safe translation keys
- [CLI Reference](../cli.md) — full `bundle` command options and flags
- [Getting Started](../getting-started.md) — initial project setup
