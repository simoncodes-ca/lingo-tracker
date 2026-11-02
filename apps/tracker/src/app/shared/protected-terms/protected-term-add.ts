import { normalizeProtectedTerms } from '@simoncodes-ca/domain';

/** The shared normalization and exact-match duplicate rule for a newly entered term. */
export function prepareProtectedTermAdd(
  existing: readonly string[],
  input: string,
): { kind: 'blank' } | { kind: 'duplicate' | 'added'; term: string } {
  const [term] = normalizeProtectedTerms([input]);
  if (!term) return { kind: 'blank' };
  return { kind: existing.includes(term) ? 'duplicate' : 'added', term };
}
