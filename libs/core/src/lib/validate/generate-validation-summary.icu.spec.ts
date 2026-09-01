import { describe, it, expect } from 'vitest';
import { generateValidationSummary } from './generate-validation-summary';
import type { IcuValidationResult, ResourceValidationResult, ValidationOptions } from './types';

const PASSING_STATUS_RESULT: ResourceValidationResult = {
  totalResourcesValidated: 2,
  totalUniqueKeys: 2,
  localesValidated: 1,
  collectionsValidated: 1,
  statusCounts: { new: 0, translated: 0, stale: 0, verified: 2 },
  failures: [],
  warnings: [],
  successes: [],
  passed: true,
};

const EMPTY_ICU: IcuValidationResult = {
  failures: [],
  warnings: [],
  unsupportedLocales: [],
  valuesChecked: 12,
};

const OPTIONS: ValidationOptions = {
  allowTranslated: false,
  icu: { compileValues: true, requirePortablePlurals: false },
};

function summarize(icu: Partial<IcuValidationResult>, passed = false): string {
  const merged = { ...EMPTY_ICU, ...icu };
  return generateValidationSummary({ ...PASSING_STATUS_RESULT, icu: merged, passed }, OPTIONS);
}

describe('generateValidationSummary with ICU results', () => {
  it('reports how many values were compiled', () => {
    expect(summarize({}, true)).toContain('ICU Values Compiled: 12');
  });

  it('omits the compiled count when compilation was switched off', () => {
    // A count of 0 would read as "nothing needed compiling".
    const summary = generateValidationSummary(
      { ...PASSING_STATUS_RESULT, icu: { ...EMPTY_ICU, valuesChecked: 0 } },
      { allowTranslated: false, icu: { compileValues: false, requirePortablePlurals: true } },
    );

    expect(summary).not.toContain('ICU Values Compiled');
  });

  it('says nothing about ICU when the pass did not run', () => {
    const summary = generateValidationSummary(PASSING_STATUS_RESULT, { allowTranslated: false });

    expect(summary).not.toContain('ICU');
  });

  describe('compile failures', () => {
    const failures = [
      {
        key: 'common.count',
        locale: 'ja',
        collection: 'main',
        message: 'The plural case one is not valid in this locale',
      },
      { key: 'common.other', locale: 'ko', collection: 'main', message: "No 'other' form found" },
    ];

    it('lists each failing value with its locale, key and reason', () => {
      const summary = summarize({ failures });

      expect(summary).toContain('common.count');
      expect(summary).toContain('The plural case one is not valid in this locale');
      expect(summary).toContain('ja');
      expect(summary).toContain('ko');
    });

    it('names the collection each failure came from', () => {
      expect(summarize({ failures })).toContain('[main]');
    });

    it('includes the failure count', () => {
      expect(summarize({ failures })).toContain('ICU Failures (2)');
    });
  });

  describe('portability warnings', () => {
    const warnings = [
      {
        key: 'common.count',
        locale: 'en',
        collection: 'main',
        message: "Plural case 'one' on 'count' is locale-dependent; use an exact '=N' match",
      },
    ];

    it('lists the warning without failing the run', () => {
      const summary = summarize({ warnings }, true);

      expect(summary).toContain("Plural case 'one' on 'count' is locale-dependent");
      expect(summary).toContain('✅');
    });

    it('includes the warning count', () => {
      expect(summarize({ warnings }, true)).toContain('ICU Warnings (1)');
    });
  });

  describe('unsupported locales', () => {
    it('names the locales it could not check', () => {
      const summary = summarize({ unsupportedLocales: ['fr_CA'] }, true);

      expect(summary).toContain('fr_CA');
    });

    it('explains that the locale tag is the problem, not the values', () => {
      const summary = summarize({ unsupportedLocales: ['fr_CA'] }, true);

      expect(summary.toLowerCase()).toContain('not a valid locale tag');
    });
  });
});

describe('summary rendering with every ICU section at once', () => {
  it('renders failures, warnings and skipped locales together without collapsing', () => {
    const summary = generateValidationSummary(
      {
        totalResourcesValidated: 3,
        totalUniqueKeys: 3,
        localesValidated: 2,
        collectionsValidated: 1,
        statusCounts: { new: 1, translated: 0, stale: 0, verified: 2 },
        failures: [{ key: 'a.b', locale: 'ja', collection: 'main', status: 'new' }],
        warnings: [],
        successes: [],
        icu: {
          failures: [
            {
              key: 'c.d',
              locale: 'ja',
              collection: 'main',
              message: 'The plural case one is not valid in this locale',
            },
          ],
          warnings: [
            {
              key: 'e.f',
              locale: 'en',
              collection: 'main',
              message: "Plural case 'one' on 'count' is locale-dependent",
            },
          ],
          unsupportedLocales: ['fr_CA'],
          valuesChecked: 6,
        },
        passed: false,
      },
      { allowTranslated: false, icu: { compileValues: true, requirePortablePlurals: true } },
    );

    expect(summary).toContain('❌ Failures (1)');
    expect(summary).toContain('❌ ICU Failures (1)');
    expect(summary).toContain('⚠️  ICU Warnings (1)');
    expect(summary).toContain('⚠️  ICU Skipped Locales (1)');
    expect(summary).toContain('Total ICU Failures: 1');
    expect(summary).toContain('❌ Validation failed');
  });
});
