import { type IcuParseOptions, repairPlaceholders } from '@simoncodes-ca/domain';
import type { ICUAutoFix, ICUAutoFixError, ImportedResource } from './types';

/**
 * Configuration for applying ICU auto-fixes to imported resources
 */
interface ApplyICUAutoFixConfig extends IcuParseOptions {
  /** The imported resource to potentially auto-fix */
  resource: ImportedResource;
  /**
   * Base locale value loaded from the stored resource file on disk.
   * This is the reliable source of truth used for both ICU and Transloco auto-fixing.
   */
  storedBaseValue?: string;
  /**
   * Base locale value supplied inside the import JSON itself (rich-format `baseValue` field).
   * Domain placeholder repair decides whether this base can be used.
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
 * Applies placeholder repair to a single imported resource if needed.
 *
 * Delegates engine choice, base trust, and repair to repairPlaceholders.
 * Maps the repair result to the resource value, auto-fix or error records,
 * and verbose progress lines.
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

  const repair = repairPlaceholders(
    {
      translation: resource.value,
      storedBase: storedBaseValue,
      importedBase: importedBaseValue,
    },
    config,
  );

  if (repair.outcome === 'skipped') return { resource };

  const engine = repair.engine === 'transloco' ? 'Transloco' : 'ICU';
  if (verbose && onProgress) {
    onProgress(`  Checking ${engine} placeholders for ${resource.key}...`);
  }

  if (repair.outcome === 'failed') {
    if (verbose && onProgress) {
      onProgress(`  ❌ ${engine} auto-fix failed for ${resource.key}: ${repair.error}`);
    }
    return {
      resource,
      autoFixError: { key: resource.key, error: repair.error, originalValue: resource.value },
    };
  }

  if (repair.outcome === 'fixed') {
    if (verbose && onProgress) {
      onProgress(`  ✓ Auto-fixed ${engine} placeholders for ${resource.key}: ${repair.description}`);
    }
    return {
      resource: { ...resource, value: repair.value },
      autoFix: {
        key: resource.key,
        originalValue: resource.value,
        fixedValue: repair.value,
        description: repair.description,
        originalPlaceholders: repair.originalPlaceholders,
        fixedPlaceholders: repair.fixedPlaceholders,
      },
    };
  }

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
export function applyICUAutoFixToResources(
  params: IcuParseOptions & {
    resources: ImportedResource[];
    getBaseValue: (key: string) => string | undefined;
    verbose?: boolean;
    onProgress?: (message: string) => void;
  },
): {
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
      simpleArgumentPaths: params.simpleArgumentPaths,
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
