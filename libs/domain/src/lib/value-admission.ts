import { checkTranslatedValue, describeValueViolation, type TranslatedValueViolation } from './check-translated-value';
import type { IcuParseOptions } from './icu-message';
import { checkStoredValue, describeStoredValueFinding, type StoredValueFinding } from './stored-value-check';
import { translocoToICU } from './transloco-to-icu';

type Policy =
  | { readonly name: 'stored-entry' }
  | { readonly name: 'import'; readonly protectedTerms: readonly string[]; readonly referencesResolved: boolean }
  | { readonly name: 'machine-translation'; readonly protectedTerms: readonly string[] };
type Violation = StoredValueFinding | TranslatedValueViolation;
type Admission =
  | { readonly admitted: true; readonly value: string }
  | {
      readonly admitted: false;
      readonly reason: Violation;
      readonly violations: readonly (Violation & { readonly description: string })[];
    };

/**
 * Decides storage under the caller's policy. Stored entries check conversion safety only;
 * import checks source agreement after repair, ignoring arguments when references were resolved.
 * Machine output must be restored already; it passes conversion safety before ICU normalization
 * and source agreement. Import skips agreement for an absent or empty source.
 *
 * The admitted value is ICU-converted only under `machine-translation`. Under `stored-entry`
 * and `import`, it is the unchanged input. Resource Folder converts after admission itself.
 *
 * Primary reason precedence: conversion safety, protected terms, then argument mismatch.
 * Conversion failure stops the check. Contract violations keep argument-before-term diagnostic
 * order. Descriptions use the existing shared wording so callers only add outcome context.
 */
export function admitValue(
  source: string | undefined,
  value: string,
  policy: Policy,
  options: IcuParseOptions = {},
): Admission {
  if (policy.name !== 'import') {
    const findings = checkStoredValue(value, options).filter((finding) => finding.blocksConversion);
    const reason = findings[0];
    if (reason) return reject(reason, findings);
    if (policy.name === 'stored-entry') return { admitted: true, value };
    value = translocoToICU(value);
  }

  const violations =
    source === undefined || (policy.name === 'import' && !source)
      ? []
      : checkTranslatedValue(source, value, { ...options, protectedTerms: policy.protectedTerms }).filter(
          (violation) =>
            policy.name !== 'import' || !policy.referencesResolved || violation.kind !== 'argument-mismatch',
        );
  const reason = violations.find((violation) => violation.kind === 'protected-term-dropped') ?? violations[0];
  return reason ? reject(reason, violations) : { admitted: true, value };
}

function reject(reason: Violation, violations: readonly Violation[]): Admission {
  return {
    admitted: false,
    reason,
    violations: violations.map((violation) => ({
      ...violation,
      description:
        violation.kind === 'argument-mismatch' || violation.kind === 'protected-term-dropped'
          ? describeValueViolation(violation)
          : describeStoredValueFinding(violation),
    })),
  };
}
