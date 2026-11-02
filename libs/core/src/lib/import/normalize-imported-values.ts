import { type AppRuntime, type ImportStrategyPolicy, toStoredIcu, translocoToICU } from '@simoncodes-ca/domain';
import type { ImportedResource } from './types';

/**
 * Normalizes values and base values to stored ICU using the strategy's source syntax.
 *
 * Returns a new array; the original resources are not mutated. Resources whose
 * values and base values need no conversion are returned by reference (same object identity).
 *
 * Stored sources retain today's lenient Transloco normalization for every runtime.
 */
export function normalizeImportedValues(
  resources: ImportedResource[],
  { runtime, valueSyntax }: { readonly runtime: AppRuntime; readonly valueSyntax: ImportStrategyPolicy['valueSyntax'] },
): ImportedResource[] {
  const normalize = (value: string): string =>
    valueSyntax === 'runtime' ? toStoredIcu(value, runtime) : translocoToICU(value);
  return resources.map((resource) => {
    const normalizedValue = normalize(resource.value);
    const normalizedBaseValue = resource.baseValue === undefined ? undefined : normalize(resource.baseValue);

    if (normalizedValue === resource.value && normalizedBaseValue === resource.baseValue) {
      return resource;
    }

    return {
      ...resource,
      value: normalizedValue,
      ...(normalizedBaseValue === undefined ? {} : { baseValue: normalizedBaseValue }),
    };
  });
}
