import type { ImportedResource, ICUAutoFix, ICUAutoFixError } from './types';
import {
  autoFixICUPlaceholders,
  hasICUPlaceholders,
  autoFixTranslocoPlaceholders,
  hasTranslocoPlaceholders,
} from './icu-auto-fixer';

/**
 * Configuration for applying ICU auto-fixes to imported resources
 */
interface ApplyICUAutoFixConfig {
  /** The imported resource to potentially auto-fix */
  resource: ImportedResource;
  /**
   * Base locale value loaded from the stored resource file on disk.
   * This is the reliable source of truth used for both ICU and Transloco auto-fixing.
   */
  storedBaseValue?: string;
  /**
   * Base locale value supplied inside the import JSON itself (rich-format `baseValue` field).
   * Used only as a fallback for ICU auto-fixing. NOT used for Transloco auto-fixing because
   * import files from migration workflows may contain unresolved Transloco reference strings
   * (e.g., `{{greeting}}`) in this field, which must not be mistaken for runtime parameters.
   */
  importedBaseValue?: string;
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
 *   storedBaseValue: 'Hello {name}'
 * });
 *
 * if (result.autoFix) {
 *   console.log('Auto-fixed:', result.autoFix.description);
 *   // Use result.resource.value (now "Hola {name}")
 * }
 * ```
 */
export function applyICUAutoFixToResource(config: ApplyICUAutoFixConfig): ApplyICUAutoFixResult {
  const { resource, storedBaseValue, importedBaseValue, verbose, onProgress } = config;

  // Transloco `{{ varName }}` and ICU `{name}` are mutually exclusive.
  // Transloco auto-fix only uses the stored base value — the imported baseValue field
  // may contain unresolved reference strings (e.g., `{{greeting}}` in migration imports)
  // that must not be treated as runtime parameter placeholders.
  if (storedBaseValue && hasTranslocoPlaceholders(storedBaseValue)) {
    if (verbose && onProgress) {
      onProgress(`  Checking Transloco placeholders for ${resource.key}...`);
    }

    const translocoResult = autoFixTranslocoPlaceholders(storedBaseValue, resource.value);

    if (translocoResult.error) {
      if (verbose && onProgress) {
        onProgress(`  ❌ Transloco auto-fix failed for ${resource.key}: ${translocoResult.error}`);
      }

      return {
        resource,
        autoFixError: {
          key: resource.key,
          error: translocoResult.error,
          originalValue: resource.value,
        },
      };
    }

    if (translocoResult.wasFixed) {
      if (verbose && onProgress) {
        onProgress(`  ✓ Auto-fixed Transloco placeholders for ${resource.key}: ${translocoResult.description}`);
      }

      return {
        resource: { ...resource, value: translocoResult.value },
        autoFix: {
          key: resource.key,
          originalValue: resource.value,
          fixedValue: translocoResult.value,
          description: translocoResult.description || '',
          originalPlaceholders: translocoResult.originalPlaceholders || [],
          fixedPlaceholders: translocoResult.fixedPlaceholders || [],
        },
      };
    }

    // Placeholders already match — no fix needed
    return { resource };
  }

  // ICU auto-fix uses stored base value first, falling back to the imported baseValue field.
  const icuBaseValue = storedBaseValue ?? importedBaseValue;

  if (!icuBaseValue || !hasICUPlaceholders(icuBaseValue)) {
    return { resource };
  }

  if (verbose && onProgress) {
    onProgress(`  Checking ICU placeholders for ${resource.key}...`);
  }

  // Attempt auto-fix
  const autoFixResult = autoFixICUPlaceholders(icuBaseValue, resource.value);

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
    onProgress('\nChecking for placeholder issues...');
  }

  for (const resource of resources) {
    const result = applyICUAutoFixToResource({
      resource,
      storedBaseValue: getBaseValue(resource.key),
      importedBaseValue: resource.baseValue,
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
      onProgress(`\n✓ Auto-fixed ${autoFixes.length} translation(s) with modified placeholders`);
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
