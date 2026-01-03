# ICU Format Auto-Fixing During Import

## Overview

The ICU auto-fixer automatically corrects ICU message format placeholders in imported translations that translators have accidentally modified. Instead of rejecting translations with renamed or missing placeholders, the auto-fixer intelligently replaces them with the correct placeholders from the base locale while preserving the translated text.

## Why Auto-Fix?

Professional translation services and individual translators routinely modify ICU placeholders despite instructions to preserve them. Common issues include:

- **Renamed placeholders**: `{count}` becomes `{numero}`, `{cantidad}`, or `{número}`
- **Removed placeholders**: Translator deletes the placeholder entirely
- **Added placeholders**: Translator adds extra placeholders not in source
- **Modified syntax**: Changes to plural/select patterns that break functionality

Rejecting entire translation batches for these issues is disruptive and costly. The auto-fixer solves this by:

1. **Detecting** placeholder mismatches between base and translation
2. **Fixing** them automatically by using base locale placeholders
3. **Preserving** the translated text around the placeholders
4. **Reporting** what was changed so users can review critical translations
5. **Erroring** only when fixes are unsafe (malformed syntax, too many discrepancies)

## Architecture

### Core Modules

```
icu-auto-fixer.ts
├── extractICUPlaceholders()     - Parses ICU patterns from strings
├── hasICUPlaceholders()          - Quick check for ICU presence
├── autoFixICUPlaceholders()      - Main auto-fix logic
└── validateICUSyntax()           - Syntax validation

apply-icu-auto-fix.ts
├── applyICUAutoFixToResource()   - Single resource auto-fix
└── applyICUAutoFixToResources()  - Batch processing

types.ts
├── ICUAutoFix                    - Success record
└── ICUAutoFixError               - Failure record
```

### How It Works

1. **Placeholder Extraction**
   ```typescript
   Base:        "Hello {name}, you have {count} items"
   Extracted:   [{name: "name", ...}, {name: "count", ...}]

   Translation: "Hola {nombre}, tienes {cantidad} elementos"
   Extracted:   [{name: "nombre", ...}, {name: "cantidad", ...}]
   ```

2. **Positional Matching**
   ```typescript
   Match by position:
   Base[0] "name"  → Translation[0] "nombre"
   Base[1] "count" → Translation[1] "cantidad"
   ```

3. **Replacement**
   ```typescript
   Replace translation placeholders with base placeholders:
   Text segments: ["Hola ", ", tienes ", " elementos"]
   Placeholders:  ["{name}", "{count}"]
   Result:        "Hola {name}, tienes {count} elementos"
   ```

4. **Validation**
   ```typescript
   Validate the auto-fixed result has correct ICU syntax
   Report success with description of changes
   ```

## Supported ICU Patterns

### Simple Placeholders
```typescript
Base:        "Hello {name}"
Translation: "Hola {nombre}"
Fixed:       "Hola {name}"
```

### Plural Forms
```typescript
Base:        "{count, plural, one {# item} other {# items}}"
Translation: "{numero, plural, one {# elemento} other {# elementos}}"
Fixed:       "{count, plural, one {# elemento} other {# elementos}}"
```

### Select Statements
```typescript
Base:        "{gender, select, male {he} female {she} other {they}}"
Translation: "{genero, select, male {él} female {ella} other {ellos}}"
Fixed:       "{gender, select, male {él} female {ella} other {ellos}}"
```

### Number/Date/Time Formatters
```typescript
Base:        "Price: {price, number, currency}"
Translation: "Precio: {precio, number, currency}"
Fixed:       "Precio: {price, number, currency}"
```

### Nested Patterns
```typescript
Base:        "{count, plural, one {You have {count} item} other {You have {count} items}}"
Translation: "{numero, plural, one {Tienes {numero} elemento} other {Tienes {numero} elementos}}"
Fixed:       "{count, plural, one {Tienes {count} elemento} other {Tienes {count} elementos}}"
```

## Error Handling

### Safe Errors (Auto-Fix Skipped)

These cases return `ICUAutoFixError` and preserve the original value:

1. **Extra Placeholders**
   ```typescript
   Base:        "Hello {name}"
   Translation: "Hola {name} {extra}"
   Error:       "Translation has 2 placeholders but base has 1. Cannot safely auto-fix extra placeholders."
   ```

2. **Multiple Missing Placeholders**
   ```typescript
   Base:        "Hello {firstName} {lastName}"
   Translation: "Hola"
   Error:       "Translation is missing 2 placeholders from base value. Cannot safely auto-fix."
   ```

3. **Malformed ICU Syntax**
   ```typescript
   Base:        "Hello {name}"
   Translation: "Hola {nombre"  // Unclosed brace
   Error:       "Failed to parse translation value: Unclosed placeholder starting at position 5"
   ```

### Recoverable Cases (Auto-Fixed)

1. **Single Missing Placeholder**
   ```typescript
   Base:        "You have {count} items"
   Translation: "Tienes items"
   Fixed:       "Tienes items {count}"  // Inserted at end
   ```

2. **Renamed Placeholders**
   ```typescript
   Base:        "Hello {firstName} {lastName}"
   Translation: "Hola {nombre} {apellido}"
   Fixed:       "Hola {firstName} {lastName}"
   ```

## Usage Examples

### Basic Auto-Fix

```typescript
import { autoFixICUPlaceholders } from '@lingo-tracker/core';

const baseValue = 'Hello {name}, you have {count} items';
const translatedValue = 'Hola {nombre}, tienes {cantidad} elementos';

const result = autoFixICUPlaceholders(baseValue, translatedValue);

if (result.wasFixed) {
  console.log('Fixed:', result.value);
  // "Hola {name}, tienes {count} elementos"

  console.log('Changes:', result.description);
  // "Replaced placeholders: {nombre} → {name}, {cantidad} → {count}"
} else if (result.error) {
  console.error('Auto-fix failed:', result.error);
}
```

### Batch Processing

```typescript
import { applyICUAutoFixToResources } from '@lingo-tracker/core';

const resources = [
  { key: 'greeting', value: 'Hola {nombre}' },
  { key: 'count', value: '{numero} elementos' },
];

const { resources: fixed, autoFixes, autoFixErrors } = applyICUAutoFixToResources({
  resources,
  getBaseValue: (key) => baseLocaleData[key],
  verbose: true,
  onProgress: (msg) => console.log(msg),
});

console.log(`Fixed ${autoFixes.length} resources`);
console.log(`Failed to fix ${autoFixErrors.length} resources`);
```

### Integration in Import

See `INTEGRATION_EXAMPLE.ts` for complete integration example.

## Testing

### Unit Tests

- `icu-auto-fixer.spec.ts` - Core parsing and auto-fix logic (180+ tests)
- `apply-icu-auto-fix.spec.ts` - Integration helpers (30+ tests)

### Integration Tests

- `icu-auto-fix.integration.spec.ts` - Real-world scenarios (50+ tests)
  - Translation service error patterns
  - Multi-language examples (Spanish, French, German)
  - Complex ICU patterns
  - Performance testing (1000+ resources)

Run tests:
```bash
pnpm nx test core --testFile=src/lib/import/icu-auto-fixer.spec.ts
pnpm nx test core --testFile=src/lib/import/apply-icu-auto-fix.spec.ts
pnpm nx test core --testFile=src/lib/import/icu-auto-fix.integration.spec.ts
```

## Performance

The ICU auto-fixer is designed for performance:

- **Quick filtering**: `hasICUPlaceholders()` uses fast regex check
- **Efficient parsing**: Single-pass placeholder extraction
- **Skip when not needed**: Only processes if base has placeholders
- **Tested at scale**: Handles 1000+ resources in < 5 seconds

Benchmarks (1000 resources):
- All matching (no fixes): ~500ms
- 50% need fixing: ~2-3 seconds
- Complex plural forms: ~3-4 seconds

## User Experience

### Import Summary Report

When auto-fixes are applied, users see:

```markdown
## ICU Auto-Fixes

Auto-fixed 3 translation(s) with modified ICU placeholders. Review these to ensure critical translations are correct.

1. `greeting`
   - **Original**: "Hola {nombre}"
   - **Auto-fixed**: "Hola {name}"
   - **Changes**: {nombre} → {name}

2. `item_count`
   - **Original**: "{numero, plural, one {# elemento} other {# elementos}}"
   - **Auto-fixed**: "{count, plural, one {# elemento} other {# elementos}}"
   - **Changes**: {numero, plural, ...} → {count, plural, ...}
```

### Auto-Fix Errors Section

Resources that couldn't be auto-fixed:

```markdown
## ICU Auto-Fix Errors

The following translations could not be auto-fixed and were skipped. Manual correction required.

1. `problematic.key`
   - **Original**: "Text with {extra} placeholder"
   - **Error**: Translation has 2 placeholders but base has 1. Cannot safely auto-fix extra placeholders.
```

## Best Practices

### For Users

1. **Review Auto-Fixes**: Check the import summary for critical translations
2. **Monitor Patterns**: If many fixes occur, discuss with translation service
3. **Provide Examples**: Give translators examples showing placeholder preservation
4. **Use Dry-Run**: Preview fixes before applying with `--dry-run` flag

### For Developers

1. **Call Early**: Apply auto-fix after extraction but before validation
2. **Provide Base Values**: Ensure `getBaseValue()` can access existing resources
3. **Log Verbosely**: Use verbose mode to see what's being fixed
4. **Test Edge Cases**: Include complex ICU patterns in test data

## Future Enhancements

Potential improvements for future versions:

1. **Semantic Matching**: Match placeholders by name similarity (e.g., `{nombre}` → `{name}`)
2. **Machine Learning**: Learn translation service patterns to predict fixes
3. **Custom Rules**: Allow users to define placeholder renaming rules
4. **Position Heuristics**: Smart insertion of missing placeholders based on text position
5. **Validation Integration**: Tie into existing ICU validation when that feature is added

## Technical Decisions

### Why Positional Matching?

We use positional matching (first → first, second → second) rather than semantic matching because:

1. **Predictable**: Deterministic behavior that's easy to understand
2. **Safe**: Minimizes risk of incorrect placeholder swaps
3. **Fast**: No complex similarity algorithms needed
4. **Works for Most Cases**: Translators rarely reorder placeholders

### Why Allow Single Missing Placeholder?

Inserting a single missing placeholder at the end is safe because:

1. **Common Error**: Translators often delete placeholders by mistake
2. **Low Risk**: One placeholder has obvious location (at end)
3. **User Review**: Import summary alerts users to review
4. **Better Than Rejection**: Allows import to succeed with warning

### Why Error on Multiple Missing?

We don't auto-insert multiple placeholders because:

1. **Unsafe**: Don't know correct positions for multiple placeholders
2. **High Risk**: Could corrupt translation meaning
3. **Better Manual Review**: Requires translator to fix properly

## Related Documentation

- `ICU_AUTO_FIX_INTEGRATION_GUIDE.md` - Integration guide for developers
- `INTEGRATION_EXAMPLE.ts` - Complete code example
- `dev-tasks/10-import.md` - Phase 12 specification
- `import-summary.ts` - Summary report generation

## API Reference

### Types

```typescript
interface ICUAutoFix {
  key: string;                      // Resource key
  originalValue: string;            // Original imported value
  fixedValue: string;               // Auto-fixed value
  description: string;              // Human-readable change description
  originalPlaceholders: string[];   // Original placeholders
  fixedPlaceholders: string[];      // Corrected placeholders
}

interface ICUAutoFixError {
  key: string;                      // Resource key
  error: string;                    // Error message
  originalValue: string;            // Value that couldn't be fixed
}

interface ICUAutoFixResult {
  wasFixed: boolean;                // Whether auto-fix was applied
  value: string;                    // Fixed or original value
  description?: string;             // Change description
  originalPlaceholders?: string[];  // Original placeholders
  fixedPlaceholders?: string[];     // Fixed placeholders
  error?: string;                   // Error if fix failed
}
```

### Functions

```typescript
// Check if value has ICU placeholders
hasICUPlaceholders(value: string): boolean

// Extract ICU placeholders from value
extractICUPlaceholders(value: string): PlaceholderExtractionResult

// Auto-fix placeholders in translation
autoFixICUPlaceholders(
  baseValue: string,
  translationValue: string
): ICUAutoFixResult

// Validate ICU syntax
validateICUSyntax(value: string): boolean

// Apply auto-fix to single resource
applyICUAutoFixToResource(config: {
  resource: ImportedResource;
  baseValue?: string;
  verbose?: boolean;
  onProgress?: (message: string) => void;
}): ApplyICUAutoFixResult

// Apply auto-fix to multiple resources
applyICUAutoFixToResources(params: {
  resources: ImportedResource[];
  getBaseValue: (key: string) => string | undefined;
  verbose?: boolean;
  onProgress?: (message: string) => void;
}): {
  resources: ImportedResource[];
  autoFixes: ICUAutoFix[];
  autoFixErrors: ICUAutoFixError[];
}
```
