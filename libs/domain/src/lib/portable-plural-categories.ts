import { parse, type Token } from '@messageformat/parser';
import { normalizeTranslocoSyntax } from './normalize-transloco-syntax';

/**
 * Base-locale plural portability.
 *
 * The base-locale value is what gets copied into every translation slot, so an
 * unsafe shape there propagates on every import. A keyword plural category is
 * unsafe in exactly that way: `one {1 warning} other {# warnings}}` reads
 * correctly in the base locale, but the moment it is copied into a `ja` or
 * `ko` slot — where the `one` category does not exist — ICU rejects the whole
 * message and the string renders nothing.
 *
 * `=1 {1 warning} other {# warnings}` is portable: an exact match is valid in
 * every locale. Translations keep their own categories; `one` is correct
 * wherever the locale defines it. This rule is about the base locale only.
 *
 * @module portable-plural-categories
 */

/**
 * A plural branch selected by locale-dependent category rather than exact match.
 */
export interface UnportablePluralCase {
  /** The argument the plural switches on (e.g. `'count'`). */
  readonly arg: string;

  /** The category keyword used (e.g. `'one'`, `'few'`). */
  readonly key: string;
}

/**
 * Finds plural branches whose selection depends on the locale's category rules.
 *
 * Only `plural` arguments are considered. `selectordinal` is deliberately
 * excluded: its categories are ordinal rules, and English ordinal `one`
 * selects 1, 21, 31 … so rewriting it as `=1` would silently change
 * behaviour rather than preserve it. `select` is excluded too — its case names
 * are application values that merely look like categories.
 *
 * Values that do not parse yield no results. An unparseable value is the
 * compile check's business, and reporting it twice helps nobody.
 *
 * Note that `=N` and a category are equivalent only where the locale's rule
 * for that category selects exactly N — true for `one` in `en` or `de`, but
 * not in `fr`, where `one` covers both 0 and 1. This function reports the
 * shape; whether the rewrite is safe is a judgement about the base locale,
 * which is why callers surface it as a warning rather than a failure.
 *
 * @param value - The base-locale value, in ICU or Transloco syntax.
 * @returns One entry per locale-dependent branch, in source order.
 *
 * @example
 * ```typescript
 * findUnportablePluralCases('{count, plural, one {1 warning} other {# warnings}}');
 * // → [{ arg: 'count', key: 'one' }]
 *
 * findUnportablePluralCases('{count, plural, =1 {1 warning} other {# warnings}}');
 * // → []
 * ```
 */
export function findUnportablePluralCases(value: string): readonly UnportablePluralCase[] {
  let tokens: Token[];
  try {
    tokens = parse(normalizeTranslocoSyntax(value));
  } catch {
    return [];
  }

  const found: UnportablePluralCase[] = [];
  collectUnportableCases(tokens, found);
  return found;
}

/**
 * Walks a parsed token tree, appending every locale-dependent plural branch.
 *
 * Recurses through the branch bodies of every `plural`, `selectordinal` and
 * `select`, so a plural nested inside a `select` branch is reported too.
 *
 * @internal
 */
function collectUnportableCases(tokens: readonly Token[], found: UnportablePluralCase[]): void {
  for (const token of tokens) {
    if (token.type !== 'plural' && token.type !== 'selectordinal' && token.type !== 'select') {
      continue;
    }

    for (const branch of token.cases) {
      // `other` is defined by every locale, and `=N` is an exact match; both travel.
      if (token.type === 'plural' && branch.key !== 'other' && !branch.key.startsWith('=')) {
        found.push({ arg: token.arg, key: branch.key });
      }

      collectUnportableCases(branch.tokens, found);
    }
  }
}
