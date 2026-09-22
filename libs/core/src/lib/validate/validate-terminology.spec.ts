import type { PreferredTermRule } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import type { LoadedResource } from '../export/export-common';
import { validateTerminology } from './validate-terminology';

const resource = (overrides: Partial<LoadedResource> = {}): LoadedResource => ({
  key: 'title',
  fullKey: 'budget.title',
  source: 'Capital expenditure',
  translations: { fr: 'Dépenses en capital', de: 'Investitionsausgaben' },
  status: { fr: 'verified', de: 'verified' },
  collection: 'main',
  ...overrides,
});

const expenditure: PreferredTermRule = {
  discouraged: 'Expenditure',
  preferred: 'Investment',
  reason: 'Finance style guide',
};
const email: PreferredTermRule = { discouraged: 'e-mail', preferred: 'email' };

describe('validateTerminology', () => {
  it('reports a discouraged term in the base value once, with the suggestion', () => {
    const result = validateTerminology([resource()], {
      rules: [expenditure],
      baseLocaleByCollection: { main: 'en' },
    });

    expect(result.warnings).toEqual([
      {
        key: 'budget.title',
        collection: 'main',
        locale: 'en',
        discouraged: 'Expenditure',
        preferred: 'Investment',
        reason: 'Finance style guide',
        message: 'consider "Investment" instead of "Expenditure"',
      },
    ]);
    expect(result.valuesChecked).toBe(1);
    expect(result.configError).toBeUndefined();
  });

  it('reports once per key however many target locales exist', () => {
    const result = validateTerminology([resource({ translations: { fr: 'a', de: 'b', es: 'c', ja: 'd' } })], {
      rules: [expenditure],
      baseLocaleByCollection: { main: 'en' },
    });

    expect(result.warnings).toHaveLength(1);
  });

  it('reports once per key however many times the term occurs', () => {
    const result = validateTerminology([resource({ source: 'Expenditure, expenditure, and more EXPENDITURE' })], {
      rules: [expenditure],
      baseLocaleByCollection: { main: 'en' },
    });

    expect(result.warnings).toHaveLength(1);
  });

  it('reports each matching rule separately', () => {
    const result = validateTerminology([resource({ source: 'Send the expenditure report by e-mail' })], {
      rules: [expenditure, email],
      baseLocaleByCollection: { main: 'en' },
    });

    expect(result.warnings.map((w) => w.discouraged)).toEqual(['Expenditure', 'e-mail']);
    expect(result.warnings[1]).not.toHaveProperty('reason');
  });

  it('never scans target-locale values', () => {
    const result = validateTerminology(
      [resource({ source: 'Capital spending', translations: { fr: 'Expenditure' } })],
      { rules: [expenditure], baseLocaleByCollection: { main: 'en' } },
    );

    expect(result.warnings).toEqual([]);
  });

  it("labels each finding with its collection's own base locale", () => {
    const result = validateTerminology(
      [resource({ collection: 'main' }), resource({ collection: 'legacy', fullKey: 'legacy.title' })],
      { rules: [expenditure], baseLocaleByCollection: { main: 'en', legacy: 'en-GB' } },
    );

    expect(result.warnings.map((w) => [w.collection, w.locale])).toEqual([
      ['main', 'en'],
      ['legacy', 'en-GB'],
    ]);
  });

  it('reports nothing and scans nothing when there are no rules', () => {
    const result = validateTerminology([resource()], { rules: [], baseLocaleByCollection: { main: 'en' } });

    expect(result).toEqual({ warnings: [], valuesChecked: 0 });
  });

  it('carries a load error through as a config error and scans nothing', () => {
    const result = validateTerminology([resource()], {
      rules: [],
      loadError: 'Preferred terminology file is not valid JSON',
      baseLocaleByCollection: { main: 'en' },
    });

    expect(result).toEqual({
      warnings: [],
      configError: 'Preferred terminology file is not valid JSON',
      valuesChecked: 0,
    });
  });
});
