import type { ProjectTermsUpdate } from '@simoncodes-ca/core';
import type { ProtectedTermsOptions } from './protected-terms';

/** Map flags to the selected scope and list edit; core owns admission. */
export function protectedTermsRequestFromFlags(
  options: ProtectedTermsOptions,
): NonNullable<ProjectTermsUpdate['protectedTerms']> {
  return {
    target: { collection: options.collection },
    change: { kind: 'edit', edit: { add: options.add, remove: options.remove, set: options.set } },
    list: options.list,
    file: options.file,
  };
}
