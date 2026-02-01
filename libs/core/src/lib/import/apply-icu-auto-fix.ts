import type { ImportedResource, ICUAutoFix, ICUAutoFixError } from './types';
import { autoFixICUPlaceholders, hasICUPlaceholders } from './icu-auto-fixer';

/**
 * Configuration for applying ICU auto-fixes to imported resources
 */
interface ApplyICUAutoFixConfig {
  /** The imported resource to potentially auto-fix */
  resource: ImportedResource;
  /** Base locale value (source of truth for placeholders) */
  baseValue?: string;
  /** Verbose logging enabled */
  verbose?: boolean;
  /** Progress callback */
  onProgress?: (message: string) => void;
}

/**
 * Result of applying ICU auto-fix to a single resource
 */
interface ApplyICUAutoFixResult {
  /** The resource with potentially auto-fixed value */
  resource: ImportedResource;
  /** Auto-fix record if a fix was applied */
  autoFix?: ICUAutoFix;
  /** Auto-fix error if fix failed */
  autoFixError?: ICUAutoFixError;
}

/**
 * Applies ICU auto-fixing to a single imported resource if needed.
 *
 * This function:
 * 1. Checks if base value has ICU placeholders (skip if not)
 * 2. Attempts to auto-fix the imported translation value
 * 3. Updates the resource value if auto-fix was successful
 * 4. Returns auto-fix record or error for reporting
 *
 * @param config - Configuration with resource, base value, and options
 * @returns Result with potentially modified resource and auto-fix records
 *
 * @example
 * ```typescript
 * const result = applyICUAutoFixToResource({
 *   resource: { key: 'greeting', value: 'Hola {nombre}' },
 *   baseValue: 'Hello {name}'
 * });
 *
 * if (result.autoFix) {
 *   console.log('Auto-fixed:', result.autoFix.description);
 *   // Use result.resource.value (now "Hola {name}")
 * }
 * ```
 */
export function applyICUAutoFixToResource(config: ApplyICUAutoFixConfig): ApplyICUAutoFixResult {
  const { resource, baseValue, verbose, onProgress } = config;

  if (!baseValue || !hasICUPlaceholders(baseValue)) {
    return { resource };
  }

  if (verbose && onProgress) {
    onProgress(`  Checking ICU placeholders for ${resource.key}...`);
  }

  // Attempt auto-fix
  const autoFixResult = autoFixICUPlaceholders(baseValue, resource.value);

  // Handle auto-fix error
  if (autoFixResult.error) {
    if (verbose && onProgress) {
      onProgress(`  ❌ ICU auto-fix failed for ${resource.key}: ${autoFixResult.error}`);
    }

    const autoFixError: ICUAutoFixError = {
      key: resource.key,
      error: autoFixResult.error,
      originalValue: resource.value,
    };

    return { resource, autoFixError };
  }

  // Handle successful auto-fix
  if (autoFixResult.wasFixed) {
    if (verbose && onProgress) {
      onProgress(`  ✓ Auto-fixed ICU placeholders for ${resource.key}: ${autoFixResult.description}`);
    }

    const autoFix: ICUAutoFix = {
      key: resource.key,
      originalValue: resource.value,
      fixedValue: autoFixResult.value,
      description: autoFixResult.description || '',
      originalPlaceholders: autoFixResult.originalPlaceholders || [],
      fixedPlaceholders: autoFixResult.fixedPlaceholders || [],
    };

    // Update resource value with auto-fixed value
    const fixedResource: ImportedResource = {
      ...resource,
      value: autoFixResult.value,
    };

    return { resource: fixedResource, autoFix };
  }

  // No fix needed (placeholders already match)
  return { resource };
}

/**
 * Applies ICU auto-fixing to multiple imported resources.
 *
 * Processes all resources and returns arrays of auto-fixes and errors
 * for summary reporting. Also returns the resources with auto-fixed values.
 *
 * @param params - Parameters for batch auto-fixing
 * @param params.resources - Array of imported resources
 * @param params.getBaseValue - Function to get base value for a resource key
 * @param params.verbose - Enable verbose logging
 * @param params.onProgress - Progress callback
 * @returns Object with auto-fixed resources and auto-fix records
 *
 * @example
 * ```typescript
 * const result = applyICUAutoFixToResources({
 *   resources: importedResources,
 *   getBaseValue: (key) => baseLocaleData[key],
 *   verbose: true,
 *   onProgress: (msg) => console.log(msg)
 * });
 *
 * console.log(`Auto-fixed ${result.autoFixes.length} resources`);
 * console.log(`Failed to auto-fix ${result.autoFixErrors.length} resources`);
 * ```
 */
export function applyICUAutoFixToResources(params: {
  resources: ImportedResource[];
  getBaseValue: (key: string) => string | undefined;
  verbose?: boolean;
  onProgress?: (message: string) => void;
}): {
  resources: ImportedResource[];
  autoFixes: ICUAutoFix[];
  autoFixErrors: ICUAutoFixError[];
} {
  const { resources, getBaseValue, verbose, onProgress } = params;

  const autoFixes: ICUAutoFix[] = [];
  const autoFixErrors: ICUAutoFixError[] = [];
  const fixedResources: ImportedResource[] = [];

  if (verbose && onProgress) {
    onProgress('\nChecking for ICU placeholder issues...');
  }

  for (const resource of resources) {
    const baseValue = getBaseValue(resource.key) || resource.baseValue;

    const result = applyICUAutoFixToResource({
      resource,
      baseValue,
      verbose,
      onProgress,
    });

    fixedResources.push(result.resource);

    if (result.autoFix) {
      autoFixes.push(result.autoFix);
    }

    if (result.autoFixError) {
      autoFixErrors.push(result.autoFixError);
    }
  }

  if (verbose && onProgress) {
    if (autoFixes.length > 0) {
      onProgress(`\n✓ Auto-fixed ${autoFixes.length} translation(s) with modified ICU placeholders`);
    }
    if (autoFixErrors.length > 0) {
      onProgress(`\n❌ Failed to auto-fix ${autoFixErrors.length} translation(s) - manual correction required`);
    }
  }

  return {
    resources: fixedResources,
    autoFixes,
    autoFixErrors,
  };
}
