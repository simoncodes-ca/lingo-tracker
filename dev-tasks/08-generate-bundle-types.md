# Feature: Generate Bundle Types

This feature provides compile-time type safety for referencing translation keys within applications, preventing runtime errors from typos or deleted keys.

## Overview

For each bundle configured in LingoTracker, developers can optionally generate TypeScript type definitions that provide:

1. **Autocomplete** for all translation keys in the bundle
2. **Compile-time validation** ensuring referenced keys exist
3. **Refactoring safety** when renaming or restructuring translation keys

### Business Value

Type generation bridges the gap between translation management and application development:

- **Developer Experience**: IDE autocomplete eliminates need to remember or look up translation keys
- **Code Safety**: Compiler catches missing/typo'd keys before runtime, reducing bugs
- **Maintenance**: Refactoring translations automatically flags all affected code locations
- **Onboarding**: New developers discover available translations through IDE suggestions

### How It Works

The CLI generates TypeScript constant objects with a hierarchical structure matching translation key paths. Each segment of a dot-delimited key (e.g., `common.buttons.ok`) becomes a nested property (e.g., `COMMON.BUTTONS.OK`), with the leaf value being the full translation key string.

**Translation Key**: `common.buttons.ok` → **Type Path**: `COMMON_TOKENS.BUTTONS.OK` → **Value**: `"common.buttons.ok"`

This allows developers to use strongly-typed constants that resolve to the correct translation key strings at runtime.

### Example Usage

```typescript
// Generated file: src/generated/common-tokens.ts
export const COMMON_TOKENS = {
  BUTTONS: {
    OK: 'common.buttons.ok',
    CANCEL: 'common.buttons.cancel',
    CLOSE: 'common.buttons.close',
  },
  MESSAGES: {
    WELCOME: 'common.messages.welcome',
    ERROR: 'common.messages.error',
  },
} as const;

// Application code
import { COMMON_TOKENS } from '@/generated/common-tokens';

class MyComponent {
  // Type-safe reference - IDE autocomplete, compiler validation
  okButtonKey = COMMON_TOKENS.BUTTONS.OK; // "common.buttons.ok"

  // Using with i18n library (Transloco example)
  translate(COMMON_TOKENS.MESSAGES.WELCOME);
}
```

### Configuration

Type generation is controlled by an optional `typeDist` property on each bundle definition in `.lingo-tracker.json`:

```typescript
interface BundleDefinition {
  bundleName: string;
  dist: string;
  collections: 'All' | CollectionBundleDefinition[];

  // NEW: Optional type generation configuration
  typeDist?: string;  // Output path for generated TypeScript file
}
```

**Example Configuration**:
```json
{
  "bundles": {
    "common": {
      "bundleName": "common.{locale}",
      "dist": "./dist/i18n",
      "collections": "All",
      "typeDist": "./src/generated/common-tokens.ts"
    },
    "admin": {
      "bundleName": "admin.{locale}",
      "dist": "./dist/i18n",
      "collections": [{ "name": "admin", "entriesSelectionRules": "All" }],
      "typeDist": "./src/generated/admin-tokens.ts"
    },
    "legacy": {
      "bundleName": "legacy.{locale}",
      "dist": "./dist/i18n",
      "collections": "All"
      // No typeDist - types not generated for this bundle
    }
  }
}
```

### CLI Command

Type generation is **automatically integrated** into the `bundle` command. When you run `lingo-tracker bundle`, types are generated for any bundle that has `typeDist` configured—no separate command needed.

```bash
# Generate JSON bundles + TypeScript types for bundles with typeDist
lingo-tracker bundle

# Generate specific bundle(s) - types included automatically if configured
lingo-tracker bundle --name common
lingo-tracker bundle --name common,admin
```

**Expected Console Output:**

```
Bundles generated successfully:
✓ common: dist/i18n/common.en.json (245 keys)
  └─ Types: src/generated/common-tokens.ts (245 keys)
✓ admin: dist/i18n/admin.en.json (180 keys)
  └─ Types: src/generated/admin-tokens.ts (180 keys)
✓ legacy: dist/i18n/legacy.en.json (95 keys)
  └─ Types: Skipped (no typeDist configured)
```

The output shows:
- Bundle JSON files generated with key counts
- TypeScript type files generated (when `typeDist` is present)
- Bundles that skipped type generation (no `typeDist` configured or empty bundle)

## Technical Context

This feature builds on top of the existing bundle generation system. The `generate-bundle` function already collects all translation keys for a bundle by:

1. Loading resources from collections (via `loadCollectionResources`)
2. Applying pattern and tag filters (via `matchesPattern`, `matchesTags`)
3. Building flat key-value pairs with optional key prefixes

Type generation will reuse this same logic to determine which keys belong to each bundle, then transform them into TypeScript constant objects.

### Related Code

- **Bundle Configuration**: `/Users/simon/git/lingo-tracker/libs/core/src/config/bundle-definition.ts`
- **Bundle Generation**: `/Users/simon/git/lingo-tracker/libs/core/src/lib/bundle/generate-bundle.ts`
- **Resource Loading**: `/Users/simon/git/lingo-tracker/libs/core/src/lib/bundle/resource-loader.ts`
- **Hierarchy Builder**: `/Users/simon/git/lingo-tracker/libs/core/src/lib/bundle/hierarchy-builder.ts`

### Architecture Considerations

- Core type generation logic belongs in `libs/core/src/lib/bundle/`
- CLI integration via existing `bundle` command in `apps/cli/src/commands/bundle.ts`
- Type generation should be independent of locale - keys are the same across all locales
- Generated files should include file header comments with warnings about auto-generation

---

## Implementation Decisions

### 1. Naming and Constant Structure

Bundle keys are converted to SCREAMING_SNAKE_CASE with a `_TOKENS` suffix:
- `"common"` → `COMMON_TOKENS`
- `"core-ui"` → `CORE_UI_TOKENS` (hyphens converted to underscores)

### 2. Key Segment Transformation

Each translation key segment is converted to SCREAMING_SNAKE_CASE:
- Replace hyphens with underscores
- Convert entire segment to uppercase (no camelCase detection)
- Preserve numeric segments as-is (no prepending)
- Preserve leading/trailing underscores
- Allow reserved words (TypeScript permits them as object properties)

**Examples**:
- `common.buttons.ok` → `COMMON.BUTTONS.OK`
- `file-upload.max-size` → `FILE_UPLOAD.MAX_SIZE`
- `someKey.myValue` → `SOMEKEY.MYVALUE`
- `steps.1.title` → `STEPS.1.TITLE`
- `error-messages.404` → `ERROR_MESSAGES.404`
- `_internal.value_` → `_INTERNAL.VALUE_`

### 3. Type Safety and Immutability

Generated types use the hybrid approach (`as const` with derived type export):

```typescript
export const COMMON_TOKENS = {
  BUTTONS: {
    OK: 'common.buttons.ok'
  }
} as const;

export type CommonTokens = typeof COMMON_TOKENS;
```

This provides both runtime immutability and an explicit type for advanced usage.

### 4. Key Prefix Handling

Type generation uses the same key collection logic as bundle generation, processing the final merged key list after prefixes have been applied. The `bundledKeyPrefix` is treated as part of the key itself.

### 5. Empty Bundles and Error Handling

When a bundle has `typeDist` configured but contains zero keys:
- Skip file generation entirely
- Log a warning to console
- Continue processing other bundles normally

### 6. Conflict Resolution

Type generation uses the final merged key list from bundle generation logic. No special conflict handling is needed since merge strategies are already resolved during bundle generation.

### 7. File Header and Code Generation Metadata

Generated files include:
- Auto-generation warning
- Bundle identifier
- Regeneration command (`lingo-tracker bundle`)
- ESLint disable comment (`/* eslint-disable */`)
- Prettier ignore directive

**Excluded from header**:
- Timestamps (to avoid git churn)
- Version numbers
- Bundle configuration details
- Total key count

### 8. Integration with Existing Bundle Command

Type generation is **automatically integrated** into the `bundle` command. When `typeDist` is configured for a bundle, types are generated alongside JSON bundles—no separate command or flag needed.

```bash
lingo-tracker bundle  # Generates JSON + types for bundles with typeDist
```

### 9. Validation and TypeScript Compatibility

Generated TypeScript code is produced without validation. Correctness is ensured through unit tests. No TypeScript compiler API validation or version compatibility configuration is provided.

### 10. Watch Mode and Build Integration

No watch mode is implemented. Developers run the command manually or integrate it into their build pipeline.

**Documentation will include examples for**:
- NPM scripts integration (`"prebuild": "lingo-tracker bundle"`)
- Nx custom target configuration

### 11. Monorepo and Path Resolution

`typeDist` paths are resolved as follows:
- Relative paths are resolved from `.lingo-tracker.json` location
- Absolute paths are supported
- Output directories are created recursively if they don't exist

### 12. Performance and Large Bundles

No special handling for large bundles (10,000+ keys). The system generates the full hierarchy and relies on TypeScript/IDE optimization. Bundle splitting is already available through the existing multi-bundle configuration.

### 13. JavaScript Support

TypeScript-only. Generated files are `.ts` with type definitions. No `.d.ts` generation, JSDoc comments, or JavaScript-specific support.

### 14. Testing Strategy

Unit tests cover:
1. Simple flat keys
2. Deeply nested keys
3. Key prefixes
4. Edge cases (numeric segments, special characters, reserved words)
5. Bundles without `typeDist` (skip generation)
6. Empty bundles
7. File creation with proper directory structure

**Not tested**:
- TypeScript compilation success
- IDE autocomplete functionality
- CLI flag behavior (integrated into existing bundle command tests)

### 15. Backward Compatibility

The feature is fully backward compatible:
- `typeDist` is an optional property on `BundleDefinition`
- Existing bundles without `typeDist` continue working unchanged
- No migration path needed—developers opt-in by adding `typeDist` to their configuration

---

## Phased Implementation Approach

This implementation is structured in four phases, building from core utilities to full CLI integration. Each phase delivers a complete, testable unit of functionality.

### Phase 1: Key Transformation and Naming Utilities

**Goal**: Establish the foundation for converting translation keys into valid TypeScript identifiers and constant names.

**Scope**: Create utility functions for transforming bundle keys and segments into TypeScript-safe names following the confirmed naming conventions.

**Tasks**:
- [ ] Create `libs/core/src/lib/bundle/type-generation/key-transformer.ts` with transformation utilities
  - Implement `bundleKeyToConstantName(bundleKey: string): string` function
    - Converts bundle key to SCREAMING_SNAKE_CASE
    - Example: `"core-ui"` → `"CORE_UI_TOKENS"`
    - Appends `_TOKENS` suffix to constant name
  - Implement `segmentToPropertyName(segment: string): string` function
    - Converts individual key segment to SCREAMING_SNAKE_CASE
    - Replaces hyphens with underscores
    - Converts entire segment to uppercase (no camelCase detection)
    - Preserves numeric segments as-is (no prepending)
    - Preserves leading/trailing underscores
    - Examples:
      - `"buttons"` → `"BUTTONS"`
      - `"file-upload"` → `"FILE_UPLOAD"`
      - `"someKey"` → `"SOMEKEY"`
      - `"404"` → `"404"`
      - `"_internal"` → `"_INTERNAL"`
  - Implement `splitKeyIntoSegments(key: string): string[]` function
    - Splits dot-delimited key into segments
    - Example: `"common.buttons.ok"` → `["common", "buttons", "ok"]`
- [ ] Unit tests for `key-transformer.ts`
  - Test `bundleKeyToConstantName` with simple bundle keys
  - Test `bundleKeyToConstantName` with hyphenated bundle keys
  - Test `segmentToPropertyName` with lowercase segments
  - Test `segmentToPropertyName` with hyphenated segments
  - Test `segmentToPropertyName` with camelCase segments (converts to uppercase)
  - Test `segmentToPropertyName` with numeric segments (preserves as-is)
  - Test `segmentToPropertyName` with special characters and underscores
  - Test `segmentToPropertyName` with reserved words (allows them)
  - Test `splitKeyIntoSegments` with various key formats

**Acceptance Criteria**:
- All transformation functions produce valid TypeScript identifiers
- Edge cases (numerics, special chars, reserved words) handled per confirmed decisions
- 100% test coverage for transformation logic
- Functions are pure (no side effects)

---

### Phase 2: TypeScript Code Generation

**Goal**: Build the core logic for generating TypeScript constant objects from flat key lists.

**Scope**: Create utilities that transform a flat list of translation keys into hierarchical TypeScript object structures with proper formatting.

**Tasks**:
- [ ] Create `libs/core/src/lib/bundle/type-generation/hierarchy-builder.ts`
  - Implement `buildTypeHierarchy(keys: string[]): TypeHierarchyNode` interface and function
    - Defines `TypeHierarchyNode` interface with `children` map and optional `value` for leaf nodes
    - Builds nested object structure from flat key list
    - Uses `splitKeyIntoSegments` to decompose keys
    - Uses `segmentToPropertyName` to transform each segment
    - Example: `["common.buttons.ok", "common.buttons.cancel"]` → nested structure
  - Implement `serializeHierarchy(node: TypeHierarchyNode, constantName: string): string` function
    - Converts hierarchy to formatted TypeScript code string
    - Uses `as const` assertion for immutability
    - Exports `typeof` type definition
    - Properly indents nested objects (2 spaces per level)
    - Leaf values are the original translation key strings
    - Example output:
      ```typescript
      export const COMMON_TOKENS = {
        BUTTONS: {
          OK: 'common.buttons.ok',
          CANCEL: 'common.buttons.cancel',
        },
      } as const;

      export type CommonTokens = typeof COMMON_TOKENS;
      ```
- [ ] Create `libs/core/src/lib/bundle/type-generation/file-header.ts`
  - Implement `generateFileHeader(bundleKey: string): string` function
    - Returns formatted header comment block
    - Includes:
      - Auto-generation warning
      - Bundle identifier
      - Regeneration command
      - ESLint disable comment (`/* eslint-disable */`)
      - Prettier ignore comment (`/* prettier-ignore */` - actually use file-level directive)
    - Does NOT include timestamp or version numbers
    - Example:
      ```typescript
      /* eslint-disable */
      // prettier-ignore
      /**
       * Auto-generated translation keys for bundle: common
       *
       * DO NOT EDIT THIS FILE MANUALLY
       * Changes will be overwritten on next generation
       *
       * To regenerate: lingo-tracker bundle
       */
      ```
- [ ] Unit tests for `hierarchy-builder.ts`
  - Test `buildTypeHierarchy` with single-level keys
  - Test `buildTypeHierarchy` with deeply nested keys (5+ levels)
  - Test `buildTypeHierarchy` with mixed depth keys
  - Test `buildTypeHierarchy` preserves original key values at leaf nodes
  - Test `buildTypeHierarchy` handles numeric and special character segments
  - Test `serializeHierarchy` produces valid TypeScript syntax
  - Test `serializeHierarchy` with proper indentation
  - Test `serializeHierarchy` includes `as const` and type export
- [ ] Unit tests for `file-header.ts`
  - Test header includes all required elements
  - Test header does not include timestamp
  - Test ESLint and Prettier disable comments are present
  - Test header formatting is consistent

**Acceptance Criteria**:
- Hierarchy builder correctly nests keys of any depth
- Serialized TypeScript code is syntactically valid
- File header includes all required warnings and disable comments
- Generated code follows TypeScript formatting conventions (2-space indent)
- 100% test coverage for code generation logic

---

### Phase 3: Bundle Type Generator Integration

**Goal**: Integrate type generation into the existing bundle generation workflow, respecting the `typeDist` configuration.

**Scope**: Create the main type generation orchestrator that uses existing bundle logic to collect keys and generates TypeScript files.

**Tasks**:
- [ ] Update `libs/core/src/config/bundle-definition.ts`
  - Add optional `typeDist?: string` property to `BundleDefinition` interface
  - Update TypeScript types and documentation
- [ ] Create `libs/core/src/lib/bundle/type-generation/generate-types.ts`
  - Implement `generateBundleTypes(bundleKey: string, config: GlobalConfig): Promise<GenerateTypesResult>` function
    - Loads bundle definition from config
    - Returns early if `typeDist` is not configured (no-op)
    - Reuses `loadCollectionResources` and filtering logic from `generate-bundle.ts`
    - Collects all final keys (after prefixes applied) for the bundle
    - Handles empty bundles: logs warning and skips file generation (per Option B)
    - Resolves `typeDist` path relative to `.lingo-tracker.json` location
    - Supports absolute paths in `typeDist`
    - Creates output directory recursively if it doesn't exist
    - Generates TypeScript code using `buildTypeHierarchy` and `serializeHierarchy`
    - Writes file with header from `generateFileHeader`
    - Returns result object with generated file path and key count
  - Define `GenerateTypesResult` interface:
    ```typescript
    interface GenerateTypesResult {
      bundleKey: string;
      typeDist: string | null;
      keysCount: number;
      fileGenerated: boolean;
      skippedReason?: 'no-typeDist' | 'empty-bundle';
    }
    ```
- [ ] Modify `libs/core/src/lib/bundle/generate-bundle.ts`
  - Import `generateBundleTypes` function
  - After successful bundle JSON generation, check if `typeDist` is configured
  - If configured, call `generateBundleTypes` for the bundle
  - Aggregate type generation results in bundle generation output
  - Log type generation status (success/skip/error)
- [ ] Unit tests for `generate-types.ts`
  - Test generates types for bundle with `typeDist` configured
  - Test skips generation when `typeDist` is not configured
  - Test skips generation and logs warning for empty bundle
  - Test resolves relative paths from config file location
  - Test handles absolute paths
  - Test creates output directory if it doesn't exist
  - Test generates file with correct content structure
  - Test applies key prefixes correctly (uses final merged key list)
  - Test file includes proper header with bundle name
- [ ] Update integration tests for `generate-bundle.ts`
  - Test that type generation is invoked when `typeDist` is present
  - Test that bundle generation succeeds even if type generation is skipped
  - Test that bundle generation reports type generation results

**Acceptance Criteria**:
- `typeDist` property added to bundle configuration schema
- Type generation integrates seamlessly with existing bundle generation
- Empty bundles skip file generation with logged warning
- Paths resolve correctly in monorepo scenarios
- Output directories are created automatically
- Type generation is optional and doesn't break existing functionality
- All unit tests pass with 100% coverage for new code

---

### Phase 4: CLI Integration and Documentation

**Goal**: Surface type generation functionality through the CLI and provide comprehensive documentation for users.

**Scope**: Extend the `bundle` command to include type generation reporting and update documentation.

**Tasks**:
- [ ] Update `apps/cli/src/commands/bundle.ts`
  - No new command needed (types generate automatically via Phase 3 integration)
  - Update console output to report type generation results
  - Display which bundles generated types (file paths)
  - Display which bundles skipped types (reason: no typeDist or empty)
  - Example output:
    ```
    Bundles generated successfully:
    ✓ common: dist/i18n/common.en.json (245 keys)
      └─ Types: src/generated/common-tokens.ts (245 keys)
    ✓ admin: dist/i18n/admin.en.json (180 keys)
      └─ Types: src/generated/admin-tokens.ts (180 keys)
    ✓ legacy: dist/i18n/legacy.en.json (95 keys)
      └─ Types: Skipped (no typeDist configured)
    ```
- [ ] Update existing CLI tests for `bundle` command
  - Test console output includes type generation results
  - Test console output shows skipped bundles correctly
- [ ] Create documentation file `docs/features/bundle-type-generation.md`
  - Overview of feature and business value
  - Configuration guide (adding `typeDist` to bundle definitions)
  - Usage examples with code snippets
  - Path resolution rules (relative vs absolute)
  - Edge cases and troubleshooting
  - Integration examples:
    - NPM scripts: `"prebuild": "lingo-tracker bundle"`
    - Nx target configuration for custom build pipeline integration
  - TypeScript usage patterns with generated types
  - Naming conventions and transformation rules
- [ ] Update main README.md
  - Add "Type Generation" section to features list
  - Link to detailed documentation
  - Add example configuration snippet
- [ ] Update CHANGELOG.md
  - Add entry for new `typeDist` configuration option
  - Document integration with `bundle` command
  - Note backward compatibility (optional feature)

**Acceptance Criteria**:
- CLI output clearly communicates type generation results
- Documentation covers all user scenarios and integration patterns
- NPM scripts and Nx integration examples provided
- README updated with feature visibility
- CHANGELOG reflects new functionality
- No breaking changes to existing CLI behavior

---

## Success Criteria

- [ ] All transformation utilities handle edge cases per confirmed decisions
- [ ] Generated TypeScript code is syntactically valid and uses `as const` + `typeof` export
- [ ] Type generation integrates transparently with `bundle` command
- [ ] Empty bundles skip generation with warning (no error)
- [ ] File headers include ESLint/Prettier disable comments, no timestamps
- [ ] Paths resolve correctly for monorepo scenarios
- [ ] Output directories created automatically
- [ ] Backward compatible: bundles without `typeDist` work unchanged
- [ ] All unit tests passing (targeting scenarios 1-6, 8 from testing strategy)
- [ ] Documentation complete with NPM scripts and Nx integration examples

---

## Notes

### Key Design Decisions Summary

1. **Naming Convention**: Bundle key with hyphens → SCREAMING_SNAKE_CASE + `_TOKENS` suffix
   - Example: `"core-ui"` → `CORE_UI_TOKENS`

2. **Segment Transformation**: All segments → SCREAMING_SNAKE_CASE
   - Hyphens → underscores
   - camelCase → uppercase directly (no detection)
   - Numeric segments and special chars: no prepending
   - Reserved words: allowed

3. **Type Safety**: Option C (as const + typeof export)
   ```typescript
   export const COMMON_TOKENS = { ... } as const;
   export type CommonTokens = typeof COMMON_TOKENS;
   ```

4. **Key Prefixes**: Already applied (use final merged key list from bundle generation)

5. **Empty Bundles**: Skip generation, log warning (Option B)

6. **File Header**: No timestamp, include ESLint and Prettier disable comments

7. **Integration**: Always generate types with bundle command when `typeDist` configured (Option C)

8. **Path Resolution**: Relative to config file, support absolute, create directories

9. **TypeScript Only**: No `.d.ts` or JavaScript support

10. **Testing Focus**: Unit tests covering transformation, hierarchy building, file generation, edge cases

### Technical Considerations

- Reuse existing bundle key collection logic (post-prefix, post-filter)
- No watch mode in initial implementation
- No special handling for large bundles (rely on TypeScript/IDE optimization)
- No separate CLI command (integrated into `bundle`)
- Document but don't implement: compilation validation, IDE testing

### Future Enhancements (Not in Scope)

- Watch mode for automatic regeneration
- Bundle splitting for very large key sets
- JavaScript/JSDoc support
- TypeScript compilation validation
- Git hook integration examples
