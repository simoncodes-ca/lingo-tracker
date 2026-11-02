import type { ProjectTermsUpdate } from '@simoncodes-ca/core';
import type { PreferredTerminologyOptions } from './preferred-terminology';

/** Map flags without discarding incomplete rule fields; core owns admission. */
export function preferredTerminologyRequestFromFlags(
  options: PreferredTerminologyOptions,
): NonNullable<ProjectTermsUpdate['preferredTerminology']> {
  return {
    list: options.list === true,
    ...(options.add !== undefined && options.preferred !== undefined
      ? { upsert: { discouraged: options.add, preferred: options.preferred, reason: options.reason } }
      : options.add !== undefined || options.preferred !== undefined || options.reason !== undefined
        ? { rule: { discouraged: options.add, preferred: options.preferred, reason: options.reason } }
        : {}),
    ...(options.remove !== undefined && { remove: options.remove }),
  };
}
