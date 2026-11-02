import { type BracedPlaceholder, describeBracedPlaceholder, findBracedPlaceholders } from './braced-placeholders';
import { type CollapsedCaseBody, findCollapsedCaseBodies } from './collapsed-case-bodies';
import { findIcuCompileError } from './icu-locale-validation';
import type { IcuParseOptions } from './icu-message';
import { findUnportablePluralCases, type UnportablePluralCase } from './portable-plural-categories';

// Locale support is a configuration question, independent of any value.
export { isIcuLocaleSupported } from './icu-locale-validation';

export type StoredValueRule = 'braced-placeholder' | 'collapsed-case-body' | 'icu-compile' | 'portable-plurals';

// Declaration order is the check order, independent of the caller's rule order.
const RULE_PROPERTIES = {
  'collapsed-case-body': { severity: 'error', blocksConversion: false },
  'braced-placeholder': { severity: 'error', blocksConversion: true },
  'icu-compile': { severity: 'error', blocksConversion: false },
  'portable-plurals': { severity: 'warning', blocksConversion: false },
} as const satisfies Record<
  StoredValueRule,
  { readonly severity: 'error' | 'warning'; readonly blocksConversion: boolean }
>;

const RULE_ORDER = Object.keys(RULE_PROPERTIES) as StoredValueRule[];
export const CONVERSION_SAFETY_RULES: readonly StoredValueRule[] = RULE_ORDER.filter(
  (rule) => RULE_PROPERTIES[rule].blocksConversion,
);

export type StoredValueFinding =
  | (BracedPlaceholder & (typeof RULE_PROPERTIES)['braced-placeholder'] & { readonly kind: 'braced-placeholder' })
  | (CollapsedCaseBody & (typeof RULE_PROPERTIES)['collapsed-case-body'] & { readonly kind: 'collapsed-case-body' })
  | (UnportablePluralCase & (typeof RULE_PROPERTIES)['portable-plurals'] & { readonly kind: 'unportable-plural-case' })
  | ((typeof RULE_PROPERTIES)['icu-compile'] & { readonly kind: 'icu-compile-error'; readonly message: string });

export interface StoredValueCheckOptions extends IcuParseOptions {
  /** Rules to run, in the module's fixed order. Default: the conversion-safety rules. */
  readonly rules?: readonly StoredValueRule[];
  /** Required only by 'icu-compile'; that rule is skipped when absent. */
  readonly locale?: string;
}

/** Checks one value's syntax independently of its source. Never throws. */
export function checkStoredValue(value: string, options: StoredValueCheckOptions = {}): readonly StoredValueFinding[] {
  const rules = options.rules ?? CONVERSION_SAFETY_RULES;
  const findings: StoredValueFinding[] = [];
  for (const rule of RULE_ORDER) {
    if (!rules.includes(rule)) continue;
    switch (rule) {
      case 'collapsed-case-body':
        for (const found of findCollapsedCaseBodies(value, options)) {
          findings.push({ kind: 'collapsed-case-body', ...RULE_PROPERTIES[rule], ...found });
        }
        break;
      case 'braced-placeholder':
        for (const found of findBracedPlaceholders(value, options)) {
          findings.push({ kind: 'braced-placeholder', ...RULE_PROPERTIES[rule], ...found });
        }
        break;
      case 'icu-compile': {
        // A braced placeholder explains why conversion is unsafe; do not blame ICU as well.
        if (options.locale === undefined || findings.some((finding) => finding.blocksConversion)) break;
        const message = findIcuCompileError(value, options.locale, options);
        if (message !== undefined) findings.push({ kind: 'icu-compile-error', ...RULE_PROPERTIES[rule], message });
        break;
      }
      case 'portable-plurals':
        for (const found of findUnportablePluralCases(value, options)) {
          findings.push({ kind: 'unportable-plural-case', ...RULE_PROPERTIES[rule], ...found });
        }
        break;
    }
  }
  return findings;
}

/** Shared rule wording; adapters add only their address and policy context. */
export function describeStoredValueFinding(finding: StoredValueFinding): string {
  switch (finding.kind) {
    case 'braced-placeholder':
      return describeBracedPlaceholder(finding);
    case 'collapsed-case-body':
      return `case '${finding.selector}' body {${finding.body}} may have been the placeholder {{${finding.body}}}; earlier versions dropped one brace pair here. If it was a placeholder, edit the value to restore it.`;
    case 'unportable-plural-case':
      return (
        `Plural case '${finding.key}' on '${finding.arg}' is locale-dependent; ` +
        `use an exact '=N' match so the value survives being copied to other locales`
      );
    case 'icu-compile-error':
      return finding.message;
  }
}
