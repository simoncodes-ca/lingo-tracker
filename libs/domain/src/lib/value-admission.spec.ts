import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTranslatedValue } from './check-translated-value';
import * as storedValueCheck from './stored-value-check';
import { admitValue } from './value-admission';

const policies = [
  { name: 'stored-entry' },
  { name: 'import', protectedTerms: ['Brand'], referencesResolved: false },
  { name: 'import', protectedTerms: ['Brand'], referencesResolved: true },
  { name: 'machine-translation', protectedTerms: ['Brand'] },
] as const;

afterEach(() => vi.restoreAllMocks());

describe('Value Admission', () => {
  for (const policy of policies) {
    describe(JSON.stringify(policy), () => {
      it.each([
        { kind: 'braced-placeholder', value: '{{{name}}}', rules: ['braced-placeholder'] },
        { kind: 'collapsed-case-body', value: '{p, plural, offset:2other{x}}', rules: ['collapsed-case-body'] },
        { kind: 'icu-compile-error', value: '{n, plural, one {x} other {y}}', rules: ['icu-compile'] },
        { kind: 'unportable-plural-case', value: '{n, plural, one {x} other {y}}', rules: ['portable-plurals'] },
      ] as const)('applies its rules to $kind', ({ kind, value, rules }) => {
        const findings = storedValueCheck.checkStoredValue(value, { rules, locale: 'ja' });
        expect(findings.map((finding) => finding.kind)).toEqual([kind]);

        // Default checks run only conversion safety. Feed real non-blocking findings
        // through admission too, so deleting its blocksConversion filter fails this test.
        if (policy.name === 'stored-entry') {
          vi.spyOn(storedValueCheck, 'checkStoredValue').mockReturnValueOnce(findings);
        }
        const result = admitValue(value, value, policy);
        const rejected = kind === 'braced-placeholder' && policy.name !== 'import';
        expect(result.admitted).toBe(!rejected);
        if (!result.admitted) {
          expect(result.reason.kind).toBe(kind);
          expect(result.violations.map((violation) => violation.kind)).toEqual([kind]);
          expect(result.violations.map((violation) => violation.description)).toEqual(
            findings.map(storedValueCheck.describeStoredValueFinding),
          );
        }
      });

      it.each([
        { kind: 'argument-mismatch', source: 'Hello {name}', value: 'Bonjour {Name}' },
        { kind: 'protected-term-dropped', source: 'Brand', value: 'Marque' },
      ])('applies its rules to $kind', ({ kind, source, value }) => {
        const findings = checkTranslatedValue(source, value, { protectedTerms: ['Brand'] });
        expect(findings.map((finding) => finding.kind)).toEqual([kind]);
        const result = admitValue(source, value, policy);
        const rejected =
          policy.name !== 'stored-entry' &&
          !(kind === 'argument-mismatch' && policy.name === 'import' && policy.referencesResolved);
        expect(result.admitted).toBe(!rejected);
        if (!result.admitted) {
          expect(result.reason.kind).toBe(kind);
          expect(result.violations.map((violation) => violation.kind)).toEqual([kind]);
        }
      });

      it('accepts a valid value', () => {
        expect(admitValue('Hello {name} Brand', 'Bonjour {name} Brand', policy)).toEqual({
          admitted: true,
          value: 'Bonjour {name} Brand',
        });
      });

      it('keeps conversion safety separate from the source contract', () => {
        const result = admitValue('Brand {name}', 'Marque {Name}', policy);
        expect(result.admitted).toBe(policy.name === 'stored-entry');
        if (!result.admitted) {
          expect(result.reason).toEqual({ kind: 'protected-term-dropped', terms: ['Brand'] });
        }
      });
    });
  }

  it.each(policies.filter((policy) => policy.name !== 'stored-entry'))(
    '%j gives protected terms precedence while retaining diagnostic order',
    (policy) => {
      const result = admitValue('Brand {name}', 'Marque {Name}', policy);
      expect(result.admitted).toBe(false);
      if (result.admitted) throw new Error('Expected rejection');
      expect(result.reason).toEqual({ kind: 'protected-term-dropped', terms: ['Brand'] });
      expect(result.violations.map((violation) => violation.kind)).toEqual(
        policy.name === 'import' && policy.referencesResolved
          ? ['protected-term-dropped']
          : ['argument-mismatch', 'protected-term-dropped'],
      );
    },
  );

  it('gives conversion safety precedence over protected terms in machine output', () => {
    const result = admitValue('Brand {name}', 'Marque {{{Name}}}', {
      name: 'machine-translation',
      protectedTerms: ['Brand'],
    });
    expect(result.admitted).toBe(false);
    if (result.admitted) throw new Error('Expected rejection');
    expect(result.reason.kind).toBe('braced-placeholder');
    expect(result.violations.map((violation) => violation.kind)).toEqual(['braced-placeholder']);
  });

  it('normalizes machine output only after checking conversion safety', () => {
    expect(
      admitValue('Hello {name}', 'Bonjour {{ name }}', { name: 'machine-translation', protectedTerms: [] }),
    ).toEqual({
      admitted: true,
      value: 'Bonjour {name}',
    });
    expect(admitValue(undefined, 'Bonjour {{ name }}', { name: 'stored-entry' })).toEqual({
      admitted: true,
      value: 'Bonjour {{ name }}',
    });
  });

  it.each(policies.filter((policy) => policy.name !== 'stored-entry'))(
    '%j preserves its empty and absent source rules',
    (policy) => {
      expect(admitValue(undefined, '{name}', policy)).toEqual({ admitted: true, value: '{name}' });
      expect(admitValue('', '{name}', policy).admitted).toBe(policy.name === 'import');
    },
  );
});
