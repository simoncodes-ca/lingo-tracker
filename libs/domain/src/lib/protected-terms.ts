import { escapeRegExp } from './escape-regexp';

/**
 * Normalizes a list of protected terms: trims each, drops empty/whitespace-only
 * entries, and dedupes case-sensitively (preserving the first occurrence).
 * Casing and internal punctuation are preserved verbatim — this intentionally
 * does NOT reuse `normalizeTags`, which lowercases and hyphenates and would
 * corrupt values like `iPhone` or `Node.js`.
 */
export function normalizeProtectedTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of terms) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Returns the union of the global and per-collection protected-term lists,
 * normalized and deduped. Mirrors `effectiveTags`: `collection` is the
 * collection-specific list, `global` is the shared list.
 */
export function effectiveProtectedTerms(global?: string[], collection?: string[]): string[] {
  return normalizeProtectedTerms([...(global ?? []), ...(collection ?? [])]);
}

/**
 * Builds a word-boundary regex for a single term. The term is regex-escaped so
 * internal punctuation (`Node.js`, `C++`) is literal, then wrapped in Unicode
 * lookarounds so it only matches as a standalone word (e.g. `iPhone` but not
 * `iPhones` or `appleiPhone`). Flags are `gu`, plus `i` when requested.
 */
export function buildProtectedTermRegex(term: string, opts: { caseInsensitive: boolean }): RegExp {
  const escaped = escapeRegExp(term);
  const pattern = `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;
  return new RegExp(pattern, `gu${opts.caseInsensitive ? 'i' : ''}`);
}

/**
 * Finds which of the given terms appear in `value`, case-insensitively. Returns
 * the stored canonical term (not the matched substring) for each term found,
 * preserving input order and deduped.
 */
export function findProtectedTerms(value: string, terms: string[]): string[] {
  const found = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    if (found.has(term)) {
      continue;
    }
    if (buildProtectedTermRegex(term, { caseInsensitive: true }).test(value)) {
      found.add(term);
      result.push(term);
    }
  }
  return result;
}

/**
 * For each term present in `sourceValue` (case-insensitive), checks whether it
 * appears verbatim (case-sensitively) in `translatedValue`. Returns the terms
 * that are present in the source but absent verbatim from the translation.
 */
export function findProtectedTermViolations(sourceValue: string, translatedValue: string, terms: string[]): string[] {
  const violations: string[] = [];
  for (const term of terms) {
    const presentInSource = buildProtectedTermRegex(term, { caseInsensitive: true }).test(sourceValue);
    if (!presentInSource) {
      continue;
    }
    const presentVerbatim = buildProtectedTermRegex(term, { caseInsensitive: false }).test(translatedValue);
    if (!presentVerbatim) {
      violations.push(term);
    }
  }
  return violations;
}
