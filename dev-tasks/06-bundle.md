# Feature: Bundle Translation Resources for Application Deployment

This feature enables users to generate optimized translation bundles for consumption by i18n libraries like Transloco. Bundles are deployment artifacts that package translation data in the hierarchical format expected by applications.

## Overview

LingoTracker stores translation resources in JSON files across folders and includes tags and comments. However, applications need translations in a **hierarchical format** optimized for loading and lazy-loading. This feature bridges that gap by generating customizable translation bundles.

### What is a Bundle?

A **bundle** is a generated JSON file containing translation data structured as nested objects matching your resource key hierarchy. Each bundle:
- Contains translations for a **single locale**
- Merges data from one or more **collections**
- Structures keys hierarchically (e.g., `apps.common.buttons.ok` → `{apps: {common: {buttons: {ok: "OK"}}}}`)
- Can be filtered by key patterns and tags
- Includes only translation values, not metadata

### Collections vs. Bundles

| Aspect | Collections                                                          | Bundles |
|--------|----------------------------------------------------------------------|---------|
| **Purpose** | Source organization                                                  | Deployment artifacts |
| **Structure** | JSON files in hierarchical folder structure with metadata | Hierarchical JSON objects |
| **Content** | Source values, translations, checksums, status, tags                 | Translation values only |
| **Scope** | Organizational boundary                                              | Delivery boundary (can span collections) |
| **Usage** | LingoTracker internal                                                | Application runtime consumption |

## Business Value

### Performance Optimization
- **Lazy Loading**: Split translations into feature-specific bundles loaded on demand
- **Smaller Initial Bundles**: Reduce time-to-interactive by loading only essential translations upfront

### Use Cases

**Small Applications**: Single bundle containing all translations
```json
// bundle-config.json
{
  "main": {
    "bundleName": "main",
    "dist": "./dist/i18n",
    "collections": "All"
  }
}
```

**Large Applications**: Feature-based bundles with lazy loading
```json
{
  "core": { /* Common UI strings loaded upfront */ },
  "admin": { /* Admin panel loaded when accessed */ },
  "reports": { /* Reports module loaded on demand */ }
}
```

**Micro-Frontends**: Application-specific bundles from shared collections
```json
{
  "app-shell": { /* Only shell resources */ },
  "product-catalog": { /* Only catalog resources */ },
  "checkout": { /* Only checkout resources */ }
}
```

## How Bundling Works

### Bundle Generation Process

1. **Read Configuration**: Load bundle definitions from `.lingo-tracker.json`
2. **For Each Bundle**:
   - Determine which collections to include
   - Load all resources for the collection as a flat key value pair list
   - Apply entry selection rules (patterns, tags)
   - Extract translation values for target locale
3. **Build Hierarchy**: Transform flat keys into nested object structure
4. **Apply Key Prefix** (optional): Rename keys in output (e.g., `buttons.ok` → `common.buttons.ok`)
5. **Write Output**: Generate one JSON file per locale per bundle

### Example Flow

**Source Data** (filesystem):
```
translations/
  apps/
    common/
      buttons/
        resource_entries.json → {"ok": {"source": "OK", "fr": "D'accord"}}
      messages/
        resource_entries.json → {"welcome": {"source": "Welcome", "fr": "Bienvenue"}}
  admin/
    users/
      resource_entries.json → {"title": {"source": "User Management", "fr": "Gestion des utilisateurs"}}
```

**Bundle Configuration**:
```json
{
  "core": {
    "bundleName": "core.{locale}",
    "dist": "./dist/i18n",
    "collections": [{
      "name": "default",
      "entriesSelectionRules": [{
        "matchingPattern": "apps.common.*"
      }]
    }]
  }
}
```

**Generated Bundle** (`./dist/i18n/core.fr.json`):
```json
{
  "apps": {
    "common": {
      "buttons": {
        "ok": "D'accord"
      },
      "messages": {
        "welcome": "Bienvenue"
      }
    }
  }
}
```

## Configuration

### Bundle Configuration Schema

Bundles are defined in `.lingo-tracker.json` under the `bundles` property:

```typescript
interface LingoTrackerConfig {
  // ... existing config properties
  bundles?: Record<string, BundleDefinition>;
}
```

### BundleDefinition

```typescript
interface BundleDefinition {
  /**
   * Name pattern for output files
   * Must be filesystem-safe (alphanumeric, hyphens, underscores, dots)
   * Use {locale} placeholder to control locale placement in filename
   *
   * Examples:
   * - "main.{locale}" → main.en.json, main.fr.json
   * - "{locale}/main" → en/main.json, fr/main.json
   * - "{locale}" → en.json, fr.json
   * - "translations-{locale}" → translations-en.json, translations-fr.json
   *
   * Default pattern: "{bundleName}.{locale}" where bundleName is the key in bundles config
   */
  bundleName: string;

  /**
   * Output directory for generated bundle files
   * Can be absolute or relative to project root
   * Example: "./dist/i18n" or "/var/www/app/assets/i18n"
   */
  dist: string;

  /**
   * Collections to include in this bundle
   * - "All": Include all entries from all collections
   * - Array: Fine-grained control with selection rules per collection
   */
  collections: 'All' | CollectionBundleDefinition[];
}
```

### CollectionBundleDefinition

```typescript
interface CollectionBundleDefinition {
  /**
   * Name of the collection to pull entries from
   * Must match an existing collection in the project
   */
  name: string;

  /**
   * Optional prefix to prepend to all keys from this collection
   * Example: "common" transforms "buttons.ok" → "common.buttons.ok" in bundle
   * Useful when merging collections with conflicting key names
   */
  bundledKeyPrefix?: string;

  /**
   * Rules determining which entries to include
   * - "All": Include all entries from this collection
   * - Array: Apply pattern and tag filters
   */
  entriesSelectionRules: 'All' | EntrySelectionRule[];

  /**
   * Strategy for merging entries when multiple collections define the same key
   * - "merge": First collection wins when keys conflict (default)
   * - "override": This collection's values override any previously defined keys
   *
   * Default: "merge"
   */
  mergeStrategy?: 'merge' | 'override';
}
```

### EntrySelectionRule

```typescript
interface EntrySelectionRule {
  /**
   * Pattern to match entry keys
   * - "*" matches all entries at collection root
   * - "apps.*" matches all entries under "apps" (any depth)
   * - "apps.common.*" matches all entries under "apps.common"
   * - "apps.common.buttons.ok" matches exact key (no wildcard)
   *
   * Patterns are prefix-based: "apps.*" includes "apps.common.buttons.ok"
   * Exact matching is supported by omitting the wildcard
   */
  matchingPattern: string;

  /**
   * Optional array of tags to filter by
   * - Use "*" to match any tagged entry (excludes untagged entries)
   * - Use specific tags like ["ui", "critical"] with matchingTagOperator
   */
  matchingTags?: string[];

  /**
   * How to combine multiple tags (ignored if matchingTags not specified)
   * - "All": Entry must have ALL specified tags
   * - "Any": Entry must have ANY of the specified tags
   *
   * Default: "Any"
   */
  matchingTagOperator?: 'All' | 'Any';
}
```

## Configuration Examples

### Example 1: Single Bundle (All Collections, All Entries)

**Use Case**: Small application, load everything upfront

```json
{
  "bundles": {
    "main": {
      "bundleName": "main.{locale}",
      "dist": "./dist/i18n",
      "collections": "All"
    }
  }
}
```

**Output**:
- `./dist/i18n/main.en.json`
- `./dist/i18n/main.fr.json`
- `./dist/i18n/main.es.json`

### Example 2: Multiple Bundles by Feature Area

**Use Case**: Large app with lazy-loaded modules

```json
{
  "bundles": {
    "core": {
      "bundleName": "core.{locale}",
      "dist": "./dist/i18n",
      "collections": [{
        "name": "default",
        "entriesSelectionRules": [{
          "matchingPattern": "apps.common.*"
        }]
      }]
    },
    "admin": {
      "bundleName": "admin.{locale}",
      "dist": "./dist/i18n",
      "collections": [{
        "name": "default",
        "entriesSelectionRules": [{
          "matchingPattern": "apps.admin.*"
        }]
      }]
    },
    "reports": {
      "bundleName": "reports.{locale}",
      "dist": "./dist/i18n",
      "collections": [{
        "name": "default",
        "entriesSelectionRules": [{
          "matchingPattern": "apps.reports.*"
        }]
      }]
    }
  }
}
```

**Output**:
- `./dist/i18n/core.{locale}.json` - Common UI loaded immediately
- `./dist/i18n/admin.{locale}.json` - Loaded when admin accessed
- `./dist/i18n/reports.{locale}.json` - Loaded when reports viewed

### Example 3: Tag-Based Bundle (Critical UI Strings)

**Use Case**: Load only critical/high-priority strings initially

```json
{
  "bundles": {
    "critical": {
      "bundleName": "critical.{locale}",
      "dist": "./dist/i18n",
      "collections": [{
        "name": "default",
        "entriesSelectionRules": [{
          "matchingPattern": "*",
          "matchingTags": ["critical"]
        }]
      }]
    },
    "full": {
      "bundleName": "full.{locale}",
      "dist": "./dist/i18n",
      "collections": "All"
    }
  }
}
```

**Workflow**:
1. App loads `critical.{locale}.json` immediately
2. App lazy-loads `full.{locale}.json` in background
3. Transloco falls back to critical bundle while full bundle loads

### Example 4: Multiple Collections with Key Prefixes

**Use Case**: Merge shared collection with app-specific collection, avoid key conflicts

```json
{
  "bundles": {
    "app": {
      "bundleName": "app.{locale}",
      "dist": "./dist/i18n",
      "collections": [
        {
          "name": "shared-ui",
          "bundledKeyPrefix": "shared",
          "entriesSelectionRules": "All"
        },
        {
          "name": "my-app",
          "entriesSelectionRules": "All"
        }
      ]
    }
  }
}
```

**Input**:
- Collection `shared-ui`: `buttons.ok`, `buttons.cancel`
- Collection `my-app`: `dashboard.title`, `dashboard.subtitle`

**Output** (`app.en.json`):
```json
{
  "shared": {
    "buttons": {
      "ok": "OK",
      "cancel": "Cancel"
    }
  },
  "dashboard": {
    "title": "Dashboard",
    "subtitle": "Overview"
  }
}
```

### Example 5: Complex Multi-Collection, Multi-Rule Bundle

**Use Case**: Admin bundle pulling from multiple collections with mixed rules

```json
{
  "bundles": {
    "admin-panel": {
      "bundleName": "admin-panel.{locale}",
      "dist": "./public/assets/i18n",
      "collections": [
        {
          "name": "default",
          "entriesSelectionRules": [
            {
              "matchingPattern": "apps.admin.*"
            }
          ]
        },
        {
          "name": "shared-components",
          "bundledKeyPrefix": "shared",
          "entriesSelectionRules": [
            {
              "matchingPattern": "*",
              "matchingTags": ["admin", "ui"],
              "matchingTagOperator": "All"
            }
          ]
        },
        {
          "name": "help-docs",
          "bundledKeyPrefix": "help",
          "entriesSelectionRules": [
            {
              "matchingPattern": "admin.*"
            }
          ]
        }
      ]
    }
  }
}
```

**Explanation**:
- Includes ALL `apps.admin.*` entries from `default` collection
- Includes entries from `shared-components` that have BOTH `admin` AND `ui` tags, prefixed with `shared`
- Includes `admin.*` entries from `help-docs`, prefixed with `help`

### Example 6: Merge Strategy Control

**Use Case**: Control how collections handle duplicate keys

```json
{
  "bundles": {
    "app": {
      "bundleName": "app.{locale}",
      "dist": "./dist/i18n",
      "collections": [
        {
          "name": "base-ui",
          "entriesSelectionRules": "All",
          "mergeStrategy": "merge"
        },
        {
          "name": "theme-overrides",
          "entriesSelectionRules": "All",
          "mergeStrategy": "override"
        },
        {
          "name": "legacy-fallbacks",
          "entriesSelectionRules": "All",
          "mergeStrategy": "merge"
        }
      ]
    }
  }
}
```

**Behavior**:
- `base-ui`: First collection, establishes baseline keys
- `theme-overrides`: Replaces any previously defined keys (overrides base-ui)
- `legacy-fallbacks`: Only adds keys that don't already exist (merge strategy, first wins)

### Example 7: Custom Bundle Naming Patterns

**Use Case**: Different naming conventions for different frameworks

```json
{
  "bundles": {
    "transloco-style": {
      "bundleName": "{locale}",
      "dist": "./src/assets/i18n",
      "collections": "All"
    },
    "locale-folders": {
      "bundleName": "{locale}/translations",
      "dist": "./public/locales",
      "collections": "All"
    },
    "hyphenated": {
      "bundleName": "app-{locale}",
      "dist": "./dist/i18n",
      "collections": "All"
    }
  }
}
```

**Generated Files**:
- Transloco style: `./src/assets/i18n/en.json`, `./src/assets/i18n/fr.json`
- Locale folders: `./public/locales/en/translations.json`, `./public/locales/fr/translations.json`
- Hyphenated: `./dist/i18n/app-en.json`, `./dist/i18n/app-fr.json`

## Default Bundle Behavior

If no `bundles` configuration is provided in `.lingo-tracker.json`, LingoTracker will automatically generate a default bundle:

```typescript
// Implicit default when bundles is undefined or empty
{
  "bundles": {
    "default": {
      "bundleName": "{locale}",
      "dist": "./dist/i18n",
      "collections": "All"
    }
  }
}
```

**Generated Files**:
- `./dist/i18n/en.json`
- `./dist/i18n/fr.json`
- (One file per configured locale)

**Rationale**: This provides zero-configuration bundling for simple projects while allowing advanced users to customize as needed.

## Bundle Generation Report

After generating bundles, LingoTracker outputs a detailed report containing:

### Success Summary
```
Bundle Generation Complete
Generated 3 bundles (9 files total)

  ✓ core.en.json (45 KB) - 234 keys
  ✓ core.fr.json (48 KB) - 234 keys
  ✓ core.es.json (47 KB) - 234 keys
  ...
```

### Missing Translations
```
Missing Translations:
  Bundle: admin
    Locale: fr
      - apps.admin.users.delete (key present in en, missing in fr)
      - apps.admin.settings.advanced (key present in en, missing in fr)
```

### Skipped Collections
```
Warnings:
  ✓ Collection 'legacy-components' not found (referenced in bundle 'admin')
  ✓ Bundle 'reports' generated 0 entries (pattern matched no keys)
```

### Collection Processing Details (Verbose Mode)
```
Bundle: admin-panel
  Collection: default
    Pattern: apps.admin.* → 45 entries matched
  Collection: shared-components (prefix: shared)
    Pattern: *, tags: [admin, ui] (All) → 12 entries matched
    Merge Strategy: override
  Collection: help-docs (prefix: help)
    Pattern: admin.* → 8 entries matched
  Total: 65 entries in 3 locales
```

## Error Handling and Recovery

### Non-Existent Collections

**Scenario**: Bundle references a collection that doesn't exist

```json
{
  "bundles": {
    "app": {
      "collections": [
        {"name": "ui-components", "entriesSelectionRules": "All"},
        {"name": "non-existent-collection", "entriesSelectionRules": "All"}
      ]
    }
  }
}
```

**Behavior**:
- ⚠️ Warning logged: `Collection 'non-existent-collection' not found`
- Collection is skipped
- Bundle generation continues with remaining collections
- Warning included in generation report

### Zero Entry Matches

**Scenario**: Selection rules match no entries

```json
{
  "bundles": {
    "admin": {
      "collections": [{
        "name": "default",
        "entriesSelectionRules": [{
          "matchingPattern": "admin.nonexistent.*"
        }]
      }]
    }
  }
}
```

**Behavior**:
- ⚠️ Warning logged: `Bundle 'admin' matched 0 entries`
- Empty bundle files are NOT created
- Bundle is skipped
- Warning included in generation report

### Missing Translations

**Scenario**: Entry exists in base locale but translation is missing

**Behavior**:
- Key is **omitted** from the bundle for that locale
- Missing translation logged in report
- i18n library's fallback mechanism will handle missing key

**Example**:
```json
// en.json (has all keys)
{"welcome": "Welcome", "goodbye": "Goodbye"}

// fr.json (missing translation for goodbye)
{"welcome": "Bienvenue"}
// "goodbye" key omitted, Transloco will fall back to "en"
```

## CLI/API Interface

### CLI Commands

```bash
# Generate all configured bundles
lingo-tracker bundle

# Generate specific bundle(s) by name
lingo-tracker bundle --name core
lingo-tracker bundle --name core,admin,reports

# Generate bundles for specific locale(s) only
lingo-tracker bundle --locale en,fr

# Verbose output
lingo-tracker bundle --verbose
```

## Integration with i18n Libraries

### Transloco Example

**Bundle Configuration**:
```json
{
  "bundles": {
    "core": {
      "bundleName": "{locale}",  // Transloco expects locale as filename
      "dist": "./src/assets/i18n",
      "collections": "All"
    }
  }
}
```

**Generated Files**:
- `./src/assets/i18n/en.json`
- `./src/assets/i18n/fr.json`

**Transloco Config**:
```typescript
provideTransloco({
  config: {
    availableLangs: ['en', 'fr'],
    defaultLang: 'en',
    reRenderOnLangChange: true,
    prodMode: environment.production,
  },
  loader: TranslocoHttpLoader
})
```

**Lazy Loading Example**:
```typescript
// Core bundle loaded immediately
{
  "core": {
    "bundleName": "en",
    "dist": "./src/assets/i18n",
    "collections": [{ "name": "default", "entriesSelectionRules": [{ "matchingPattern": "core.*" }] }]
  }
}

// Admin scope lazy-loaded
this.translocoService.load('admin').subscribe(() => {
  // Admin translations available
});
```

## Build Pipeline Integration

Bundle generation is designed to be integrated into your build process, not run automatically by LingoTracker.

### Example Build Scripts

**package.json**:
```json
{
  "scripts": {
    "prebuild": "lingo-tracker bundle",
    "build": "ng build",
    "dev": "concurrently \"lingo-tracker bundle\" \"ng serve\""
  }
}
```

**CI/CD Pipeline** (GitHub Actions):
```yaml
- name: Generate translation bundles
  run: pnpm lingo-tracker bundle

- name: Check for missing translations
  run: |
    if grep -q "Missing Translations:" bundle-report.txt; then
      echo "::warning::Some translations are missing"
    fi

- name: Build application
  run: pnpm build
```

### Notes on Caching and Versioning

- **No versioning**: Bundles are not versioned or tracked by LingoTracker
- **Build-time generation**: Bundles are generated during build, not served dynamically
- **User responsibility**: Application developers control when/how bundles are generated
- **Cache busting**: Use build tool's content hashing for bundle cache invalidation

---

## Implementation Status

**Status**: PHASE 1 COMPLETE

### Implementation Phases

#### Phase 1: Core Bundle Generation ✅ **COMPLETED**
- [x] Implement bundle configuration schema in `libs/core/src/lib/config`
  - [x] Add `BundleDefinition` interface with `{locale}` placeholder support
  - [x] Add `CollectionBundleDefinition` with `mergeStrategy` property
  - [x] Add `EntrySelectionRule` interface
  - [x] Update `LingoTrackerConfig` to include `bundles` property
- [x] Create bundle generator in `libs/core/src/lib/bundle/`
  - [x] Pattern matching engine for `matchingPattern` (supports wildcards and exact matching) - `pattern-matcher.ts`
  - [x] Tag filtering logic with `matchingTagOperator` - `tag-filter.ts`
  - [x] Key prefix application for `bundledKeyPrefix`
  - [x] Merge strategy implementation (`merge`, `override`) - Note: `noop` strategy removed as redundant with `merge`
  - [x] Hierarchical JSON builder from flat entries - `hierarchy-builder.ts`
  - [x] Bundle naming with `{locale}` placeholder replacement
  - [x] File system operations (read resources, write bundles)
  - [x] Resource loader for loading collection resources - `resource-loader.ts`
- [x] Error handling and reporting
  - [x] Skip non-existent collections with warning
  - [x] Skip empty bundles with warning
  - [x] Warning system in place (omit missing translations will be in CLI layer)
- [x] Unit tests for bundle generation logic
  - [x] Test pattern matching (wildcard and exact) - 10 tests
  - [x] Test tag filtering (All/Any operators) - 14 tests
  - [x] Test hierarchy builder - 10 tests
  - [x] Test resource loader - 8 tests
  - [x] Test bundle generation - 15 tests
  - [x] All 200 tests passing in core library

#### Phase 2: CLI Integration ✅ COMPLETE
- [x] Create `bundle` command in `apps/cli/src/commands/`
- [x] Support `--name`, `--locale`, `--verbose` flags
- [x] Progress indicators for large bundle operations
- [x] Bundle generation report output (success, warnings, missing translations)
- [x] Error reporting with skip-and-continue behavior
- [x] Unit tests for CLI command

**Implementation Details:**
- Created `apps/cli/src/commands/bundle.ts` (256 lines) with full CLI integration
- Registered command in `apps/cli/src/main.ts` with Commander.js
- Comprehensive test suite: `apps/cli/src/commands/bundle.test.ts` (23 tests, all passing)
- Command supports:
  - `--name <names>`: Single or comma-separated bundle names (e.g., `--name core,admin`)
  - `--locale <locales>`: Filter by locale (e.g., `--locale en,fr`)
  - `--verbose`: Show detailed output including all warnings
- Interactive mode (TTY): Prompts for bundle selection with "All bundles" option
- Non-interactive mode: Defaults to all bundles, perfect for CI/CD
- Human-readable output: Progress indicators, success messages, warnings, and summary
- Error handling: Skip-and-continue behavior for failed bundles
- **Note**: Removed `--json` flag - bundles always produce JSON output files, CLI shows human-readable console output
- **Bug Fix**: Fixed base locale empty bundle warning - base locale now correctly uses `source` property instead of locale key
- All 298 tests passing (51 CLI + 42 API + 200 core + 5 tracker)
- Zero ESLint errors/warnings
- Build successful

#### Phase 3: Documentation and Examples ✅ COMPLETE
- [x] Update `docs/cli.md` with bundle command
- [x] Update `docs/api.md` with bundle endpoints (N/A - bundle is CLI-only feature)
- [x] Create `docs/guides/bundling.md` with comprehensive examples
  - [x] Default bundle behavior
  - [x] Merge strategy examples
  - [x] Bundle naming patterns
  - [x] Error handling and recovery
- [x] Add Transloco integration example
- [x] Add Angular i18n integration example
- [x] Add react-i18next integration example
- [x] Document build pipeline integration patterns

**Implementation Details:**
- Updated `docs/cli.md` with comprehensive bundle command documentation (188 lines)
  - Command usage and options
  - Configuration structure and examples
  - Merge strategies, pattern matching, and tag filtering
  - Output format examples
  - Link to comprehensive guide
- Created `docs/guides/bundling.md` (1000+ lines) with:
  - Introduction and quick start
  - Complete bundle configuration reference
  - Detailed merge strategy examples with use cases
  - Pattern matching guide with examples table
  - Tag-based filtering with AND/OR operators
  - Framework integration guides:
    - Transloco (Angular) - full setup with HTTP loader
    - Angular i18n - configuration and usage
    - react-i18next - setup with HttpBackend
  - Build pipeline integration:
    - NPM scripts
    - Nx monorepo integration
    - CI/CD (GitHub Actions, GitLab CI)
    - Webpack plugin example
    - Vite plugin example
  - Advanced use cases:
    - Lazy-loaded modules
    - Environment-specific bundles
    - Multi-tenant applications
    - Bundled key prefixes
  - Troubleshooting section with common issues and solutions
- Note: API documentation update not needed - bundle generation is a CLI-only feature

#### Phase 4: Advanced Features (Future)
- [ ] Watch mode for auto-regeneration
- [ ] Content-based hash filenames for caching
- [ ] Build tool plugins (Webpack, Vite)

---

**Design Philosophy**: Bundles bridge the gap between LingoTracker's developer-friendly source management and application runtime requirements. By separating source structure from deployment artifacts, we enable Git-friendly workflows while delivering optimized, framework-agnostic translation files for any i18n library.
