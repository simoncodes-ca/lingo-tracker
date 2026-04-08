import type { ImportedResource } from './types';
import { normalizeTranslocoSyntax } from '@simoncodes-ca/domain';
export { normalizeTranslocoSyntax } from '@simoncodes-ca/domain';

/**
 * Applies Transloco-to-ICU syntax normalization to every resource in the array.
 *
 * Returns a new array; the original resources are not mutated. Resources whose
 * values do not contain Transloco syntax are returned by reference (same object identity).
 *
 * @param resources - Imported resources whose `value` fields may contain Transloco syntax.
 * @returns A new array of resources with normalized `value` fields.
 */
export function normalizeTranslocoSyntaxInResources(resources: ImportedResource[]): ImportedResource[] {
  return resources.map((resource) => {
    const normalizedValue = normalizeTranslocoSyntax(resource.value);

    if (normalizedValue === resource.value) {
      return resource;
    }

    return { ...resource, value: normalizedValue };
  });
}
