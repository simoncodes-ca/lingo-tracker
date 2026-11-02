import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { LocaleNotFoundError, ProtectedTermsFileError } from '../errors/lingo-tracker-error';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
import { assertCollectionLocales, seedLocales, withTranslatorProblems } from './locale-seeding';

describe('locale seeding', () => {
  const dir = useTempDir('locale-seeding-');
  const collection = (enabled = false) =>
    testCollection(dir(), {
      locales: ['en', 'fr', 'de', 'es'],
      translationConfig: { enabled, provider: 'google-translate', apiKeyEnv: 'UNUSED_SEEDING_KEY' },
    });

  it('copies the base only for unsupplied targets needing work without a value worth keeping', async () => {
    const result = await seedLocales(collection(), {
      baseValue: 'Save',
      supplied: ['fr'],
      needsWork: (locale) => locale !== 'de',
    });
    expect(result).toEqual({ translations: [{ locale: 'es', value: 'Save', status: 'new' }] });
    expect(await seedLocales(collection(), { baseValue: 'Save', supplied: [], keepsValue: () => true })).toEqual({
      translations: [],
    });
  });

  it('uses translations before fallback, even when a stored value is worth keeping', async () => {
    const provider = new InMemoryTranslationProvider();
    const result = await seedLocales(
      collection(true),
      { baseValue: 'Save', supplied: ['fr'], needsWork: (locale) => locale !== 'es', keepsValue: () => true },
      { provider },
    );
    expect(result).toEqual({
      translations: [{ locale: 'de', value: '[de] Save', status: 'translated' }],
      skippedLocales: [],
      problems: [],
    });
    expect(provider.calls.flat().map((request) => request.targetLocale)).toEqual(['de']);
  });

  it('reports provider skips and copies the base only where no real translation needs preserving', async () => {
    const baseValue = '{count, plural, one {One} other {Many}}';
    const result = await seedLocales(
      collection(true),
      { baseValue, supplied: ['es'], keepsValue: (locale) => locale === 'de' },
      { provider: new InMemoryTranslationProvider() },
    );
    expect(result.translations).toEqual([{ locale: 'fr', value: baseValue, status: 'new' }]);
    expect(result.skippedLocales).toEqual(['fr', 'de']);
  });

  it('does not open a translator when all targets are supplied', async () => {
    expect(await seedLocales(collection(true), { baseValue: 'Save', supplied: ['fr', 'de', 'es'] })).toEqual({
      translations: [],
    });
  });

  it('propagates provider and malformed term file errors before returning values', async () => {
    const failure = new Error('provider failed');
    const provider = new InMemoryTranslationProvider(() => {
      throw failure;
    });
    await expect(seedLocales(collection(true), { baseValue: 'Save', supplied: [] }, { provider })).rejects.toBe(
      failure,
    );
    const target = collection(true);
    writeFileSync(target.termFiles.protectedTerms.path, '{');
    await expect(
      seedLocales(target, { baseValue: 'Save', supplied: [] }, { provider: new InMemoryTranslationProvider() }),
    ).rejects.toThrow(ProtectedTermsFileError);
  });

  it('accepts base and target locales and refuses other supplied locales', () => {
    expect(() => assertCollectionLocales(collection(), ['en', 'fr'])).not.toThrow();
    expect(() => assertCollectionLocales(collection(), ['it'])).toThrow(LocaleNotFoundError);
  });

  it('appends translator problems without changing the terminology result', () => {
    const terminology = { problems: ['existing'], findings: [] };
    expect(withTranslatorProblems(terminology)).toBe(terminology);
    expect(withTranslatorProblems(terminology, ['translator'])).toEqual({
      ...terminology,
      problems: ['existing', 'translator'],
    });
    expect(terminology.problems).toEqual(['existing']);
  });
});
