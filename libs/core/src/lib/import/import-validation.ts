import { ImportedResource, ImportChange } from './types';
import { validateImportKey, isKeyTooLong, isEmptyValue, detectHierarchicalConflicts, detectDuplicateKeys } from './import-common';

/**
 * Configuration for import validation process.
 */
export interface ValidationConfig {
  /** Whether to skip empty values */
  skipEmptyValues: boolean;
  /** Whether to warn on long keys */
  warnOnLongKeys: boolean;
}

/**
 * Result of the validation process containing valid resources and any issues found.
 */
export interface ValidationResult {
  /** Resources that passed all validation checks */
  validResources: ImportedResource[];
  /** Non-fatal warnings that don't prevent import */
  warnings: string[];
  /** Fatal errors for specific resources */
  errors: string[];
  /** Change records for failed validations */
  failedChanges: ImportChange[];
}

/**
 * Validates a collection of imported resources for format, conflicts, and data quality.
 *
 * This function performs comprehensive validation of resources before they are processed
 * for import. It acts as a gatekeeper to ensure data quality and prevent invalid resources
 * from corrupting the translation storage.
 *
 * The validation process performs these checks:
 *
 * 1. **Duplicate Key Detection**: Identifies resources with the same key appearing multiple times
 *    in the import data. The last occurrence is used, and a warning is generated.
 *
 * 2. **Hierarchical Conflict Detection**: Finds keys that conflict with the hierarchical folder
 *    structure (e.g., 'common.ok' as both a value and a parent of 'common.ok.label'). These
 *    are fatal errors that prevent import.
 *
 * 3. **Key Format Validation**: Ensures each key follows the required format (alphanumeric,
 *    dots, hyphens, underscores). Invalid keys generate errors and are excluded.
 *
 * 4. **Key Length Validation**: Warns about excessively long keys that may cause issues
 *    with file systems or tools (configurable via warnOnLongKeys).
 *
 * 5. **Empty Value Detection**: Identifies and optionally skips resources with empty or
 *    whitespace-only values (configurable via skipEmptyValues).
 *
 * Resources that fail validation are recorded in failedChanges with specific reasons,
 * making it easy to identify and fix issues in the source data.
 *
 * @param resources - Array of imported resources to validate
 * @param config - Validation configuration controlling warning and skip behavior
 * @returns ValidationResult containing valid resources, warnings, errors, and failed changes
 *
 * @example
 * ```typescript
 * const resources: ImportedResource[] = [
 *   { key: 'common.ok', value: 'OK' },
 *   { key: 'common.ok', value: 'Okay' },  // Duplicate
 *   { key: 'invalid key!', value: 'Bad' }, // Invalid format
 *   { key: 'empty', value: '   ' },        // Empty value
 *   { key: 'very.long.key.with.many.segments.that.exceeds.limits', value: 'Long' }
 * ];
 *
 * const result = validateImportResources(resources, {
 *   skipEmptyValues: true,
 *   warnOnLongKeys: true
 * });
 *
 * console.log(`Valid: ${result.validResources.length}`);
 * console.log(`Warnings: ${result.warnings.length}`);
 * console.log(`Errors: ${result.errors.length}`);
 * console.log(`Failed: ${result.failedChanges.length}`);
 * ```
 */
export function validateImportResources(
  resources: ImportedResource[],
  config: ValidationConfig
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const failedChanges: ImportChange[] = [];
  const validResources: ImportedResource[] = [];

  // Detect duplicates
  const keys = resources.map(r => r.key);
  const duplicates = detectDuplicateKeys(keys);
  if (duplicates.size > 0) {
    for (const [key, count] of duplicates) {
      warnings.push(`Duplicate key in import file: "${key}" (used last occurrence, appeared ${count} times)`);
    }
  }

  // Detect hierarchical conflicts
  const conflicts = detectHierarchicalConflicts(keys);
  if (conflicts.length > 0) {
    for (const key of conflicts) {
      errors.push(`Hierarchical conflict: "${key}" (has value and child keys)`);
    }
  }

  // Validate each resource
  for (const resource of resources) {
    // Skip if part of hierarchical conflict
    if (conflicts.includes(resource.key)) {
      failedChanges.push({
        key: resource.key,
        type: 'failed',
        reason: 'Hierarchical conflict (has value and child keys)',
      });
      continue;
    }

    // Validate key format
    try {
      validateImportKey(resource.key);
    } catch (error) {
      errors.push(`Invalid key format: "${resource.key}" (${error})`);
      failedChanges.push({
        key: resource.key,
        type: 'failed',
        reason: `Invalid key format: ${error}`,
      });
      continue;
    }

    // Warn on long keys
    if (config.warnOnLongKeys && isKeyTooLong(resource.key)) {
      warnings.push(`Very long key: "${resource.key}" (${resource.key.length} characters)`);
    }

    // Skip empty values if configured
    if (config.skipEmptyValues && isEmptyValue(resource.value)) {
      warnings.push(`Empty value skipped: "${resource.key}"`);
      failedChanges.push({
        key: resource.key,
        type: 'skipped',
        reason: 'Empty value',
      });
      continue;
    }

    // Resource passed all validations
    validResources.push(resource);
  }

  return {
    validResources,
    warnings,
    errors,
    failedChanges,
  };
}
