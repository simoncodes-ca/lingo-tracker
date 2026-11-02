import { type ArgumentMismatch, compareIcuArguments } from './icu-arguments';
import type { IcuParseOptions } from './icu-message';
import { findProtectedTermViolations } from './protected-terms';

/** Facts about a translated value that violates its source's contract. */
export type TranslatedValueViolation =
  | ({ readonly kind: 'argument-mismatch' } & ArgumentMismatch)
  | {
      readonly kind: 'protected-term-dropped';
      readonly terms: readonly string[];
    };

export interface ValueCheckOptions extends IcuParseOptions {
  readonly protectedTerms: readonly string[];
}

/**
 * Checks the value's argument names and verbatim protected terms against its source.
 * Argument repetition is allowed. Unparseable ICU is left to syntax validation.
 * Provider markers and provider eligibility belong to the translation process.
 */
export function checkTranslatedValue(
  source: string,
  value: string,
  { protectedTerms, ...options }: ValueCheckOptions,
): readonly TranslatedValueViolation[] {
  const violations: TranslatedValueViolation[] = [];
  const mismatch = compareIcuArguments(source, value, options);
  if (mismatch) violations.push({ kind: 'argument-mismatch', ...mismatch });
  const terms = findProtectedTermViolations(source, value, protectedTerms);
  if (terms.length > 0) violations.push({ kind: 'protected-term-dropped', terms });
  return violations;
}

/** Describes a Value Check violation consistently for import and validation. */
export function describeValueViolation(violation: TranslatedValueViolation): string {
  if (violation.kind === 'protected-term-dropped') {
    return `Protected term(s) altered: ${violation.terms.join(', ')}`;
  }
  return describeMismatch(violation.missing, violation.unexpected);
}

function describeMismatch(missing: readonly string[], unexpected: readonly string[]): string {
  if (missing.length === 1 && unexpected.length === 1) {
    return `Placeholder '{${missing[0]}}' was renamed to '{${unexpected[0]}}'; it renders as empty text`;
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing ${quoteAll(missing)}`);
  }
  if (unexpected.length > 0) {
    parts.push(`unexpected ${quoteAll(unexpected)}`);
  }

  return `Placeholders disagree with the base value: ${parts.join(', ')}`;
}

/** Renders argument names as they appear in a value, for a log line. @internal */
function quoteAll(args: readonly string[]): string {
  return args.map((arg) => `'{${arg}}'`).join(', ');
}
