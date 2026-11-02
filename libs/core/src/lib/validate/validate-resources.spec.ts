import { join } from 'node:path';
import type { TranslationStatus } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import {
  type SeedResource,
  seedResources,
  testCollection,
  useTempDir,
  writeFolderFiles,
} from '../../testing/temp-dir.spec-helpers';
import { readCollectionSet } from '../collection-set/collection-set';
import type { Collection } from '../config/open-collection';
import { type ProjectTerms, readProjectTerms } from '../config/project-terms';
import { validateResources } from './validate-resources';

describe('validateResources (real fs)', () => {
  const root = useTempDir('validate-resources-');
  const termsByCollection = new Map<Collection, ProjectTerms>();

  /** A collection in its own subfolder of the temp dir; targets `es` and `fr` unless told otherwise. */
  function collection(name = 'main', overrides: Partial<Collection> = {}): Collection {
    const opened = testCollection(join(root(), name), { name, locales: ['en', 'es', 'fr'], ...overrides });
    termsByCollection.set(opened, readProjectTerms(opened));
    return opened;
  }

  /** A resource whose translations all have the given status. */
  function withStatus(source: string, statuses: Record<string, TranslationStatus>): SeedResource {
    return {
      source,
      translations: Object.fromEntries(
        Object.entries(statuses).map(([locale, status]) => [locale, { value: `${source} (${locale})`, status }]),
      ),
    };
  }

  describe('status', () => {
    it('passes when every resource is verified in every target locale', () => {
      const main = collection();
      seedResources(main, {
        'common.ok': withStatus('OK', { es: 'verified', fr: 'verified' }),
        'common.cancel': withStatus('Cancel', { es: 'verified', fr: 'verified' }),
      });

      const result = validateResources([main], { allowTranslated: false }, termsByCollection);

      expect(result.passed).toBe(true);
      expect(result.successes).toHaveLength(4);
      expect(result.failures).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.totalResourcesValidated).toBe(4);
      expect(result.totalUniqueKeys).toBe(2);
      expect(result.localesValidated).toBe(2);
      expect(result.collectionsValidated).toBe(1);
      expect(result.statusCounts).toEqual({ new: 0, translated: 0, stale: 0, verified: 4 });
      expect(result.unreadableFolders).toEqual([]);
    });

    it('passes for a collection without resources', () => {
      const result = validateResources([collection()], { allowTranslated: false }, termsByCollection);

      expect(result.passed).toBe(true);
      expect(result.totalResourcesValidated).toBe(0);
      expect(result.totalUniqueKeys).toBe(0);
    });

    it('fails new and stale translations', () => {
      const main = collection();
      seedResources(main, { 'common.ok': withStatus('OK', { es: 'new', fr: 'stale' }) });

      const result = validateResources([main], { allowTranslated: false }, termsByCollection);

      expect(result.passed).toBe(false);
      expect(result.failures).toEqual([
        { key: 'common.ok', locale: 'es', collection: 'main', status: 'new' },
        { key: 'common.ok', locale: 'fr', collection: 'main', status: 'stale' },
      ]);
      expect(result.statusCounts).toEqual({ new: 1, translated: 0, stale: 1, verified: 0 });
    });

    it('treats a locale without a status as new, including an entry without metadata', () => {
      const main = collection();
      seedResources(main, { 'common.ok': withStatus('OK', { es: 'verified' }) });
      writeFolderFiles(main.translationsFolder, 'loose', { entries: { orphan: { source: 'Orphan' } } });

      const result = validateResources([main], { allowTranslated: false }, termsByCollection);

      expect(result.failures.map((failure) => `${failure.key}/${failure.locale}/${failure.status}`)).toEqual([
        'common.ok/fr/new',
        'loose.orphan/es/new',
        'loose.orphan/fr/new',
      ]);
    });

    it('fails translated resources by default and warns with allowTranslated', () => {
      const main = collection();
      seedResources(main, { 'common.ok': withStatus('OK', { es: 'translated', fr: 'verified' }) });

      const strict = validateResources([main], { allowTranslated: false }, termsByCollection);
      const relaxed = validateResources([main], { allowTranslated: true }, termsByCollection);

      expect(strict.passed).toBe(false);
      expect(strict.failures).toEqual([{ key: 'common.ok', locale: 'es', collection: 'main', status: 'translated' }]);
      expect(relaxed.passed).toBe(true);
      expect(relaxed.warnings).toEqual([{ key: 'common.ok', locale: 'es', collection: 'main', status: 'translated' }]);
      expect(relaxed.successes).toHaveLength(1);
    });

    it('collects every failure without stopping early', () => {
      const main = collection('main', { locales: ['en', 'es', 'fr', 'de'] });
      seedResources(
        main,
        Object.fromEntries(
          Array.from({ length: 20 }, (_, index) => [`ns.key${index}`, withStatus(`V${index}`, { es: 'new' })]),
        ),
      );

      const result = validateResources([main], { allowTranslated: false }, termsByCollection);

      // es is new; fr and de have no status at all
      expect(result.failures).toHaveLength(60);
      expect(result.statusCounts.new).toBe(60);
    });
  });

  describe('per collection', () => {
    it('validates each collection against its own target locales and counts distinct locales', () => {
      const common = collection('common');
      const admin = collection('admin', { locales: ['en', 'de'] });
      seedResources(common, { ok: withStatus('OK', { es: 'verified', fr: 'verified' }) });
      seedResources(admin, { users: withStatus('Users', { de: 'new' }) });

      const result = validateResources([common, admin], { allowTranslated: false }, termsByCollection);

      expect(result.successes.map((detail) => `${detail.collection}/${detail.locale}`)).toEqual([
        'common/es',
        'common/fr',
      ]);
      expect(result.failures).toEqual([{ key: 'users', locale: 'de', collection: 'admin', status: 'new' }]);
      expect(result.totalResourcesValidated).toBe(3);
      expect(result.localesValidated).toBe(3);
      expect(result.collectionsValidated).toBe(2);
    });

    it('validates a key present in two collections in both', () => {
      const first = collection('first');
      const second = collection('second');
      seedResources(first, { 'shared.title': withStatus('Title', { es: 'verified', fr: 'verified' }) });
      seedResources(second, { 'shared.title': withStatus('Title', { es: 'new', fr: 'verified' }) });

      const result = validateResources([first, second], { allowTranslated: false }, termsByCollection);

      expect(result.totalUniqueKeys).toBe(2);
      expect(result.totalResourcesValidated).toBe(4);
      expect(result.failures).toEqual([{ key: 'shared.title', locale: 'es', collection: 'second', status: 'new' }]);
    });

    it('treats the base locale of a collection as its source, not as a target', () => {
      const french = collection('french', { baseLocale: 'fr', locales: ['fr', 'en'] });
      seedResources(french, { ok: withStatus('Bien', { en: 'verified' }) });

      const result = validateResources([french], { allowTranslated: false }, termsByCollection);

      expect(result.passed).toBe(true);
      expect(result.successes).toEqual([{ key: 'ok', locale: 'en', collection: 'french', status: 'verified' }]);
    });

    it('leaves skipped locales out of every collection', () => {
      const main = collection();
      seedResources(main, { ok: withStatus('OK', { es: 'verified', fr: 'new' }) });

      const result = validateResources(
        [main],
        { allowTranslated: false },
        termsByCollection,
        readCollectionSet([main], { scope: 'validation', skippedLocales: ['fr'] }),
      );

      expect(result.passed).toBe(true);
      expect(result.localesValidated).toBe(1);
      expect(result.totalResourcesValidated).toBe(1);
    });

    it('validates nothing for a collection whose target locales are all skipped', () => {
      const main = collection('main', { locales: ['en', 'es'] });
      seedResources(main, { ok: withStatus('OK', { es: 'new' }) });

      const result = validateResources(
        [main],
        { allowTranslated: false },
        termsByCollection,
        readCollectionSet([main], { scope: 'validation', skippedLocales: ['es'] }),
      );

      expect(result.passed).toBe(true);
      expect(result.totalResourcesValidated).toBe(0);
      expect(result.localesValidated).toBe(0);
    });
  });

  describe('unreadable folders', () => {
    it('fails validation and names the folder and file', () => {
      const main = collection();
      seedResources(main, { 'good.ok': withStatus('OK', { es: 'verified', fr: 'verified' }) });
      writeFolderFiles(main.translationsFolder, 'bad', { entries: { x: { source: 'X' } }, meta: '{ broken' });

      const result = validateResources([main], { allowTranslated: false }, termsByCollection);

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(0);
      expect(result.successes).toHaveLength(2);
      expect(result.unreadableFolders).toHaveLength(1);
      expect(result.unreadableFolders?.[0]).toMatchObject({ collection: 'main', folderPath: 'bad' });
      expect(result.unreadableFolders?.[0]?.message).toContain('tracker_meta.json');
    });
  });

  describe('ICU and placeholders', () => {
    it("compiles each collection's base values under its own base locale", () => {
      const main = collection('main', { locales: ['en', 'es'] });
      const japanese = collection('japanese', { baseLocale: 'ja', locales: ['ja', 'en'] });
      const plural = '{count, plural, one {# item} other {# items}}';
      seedResources(main, { count: { source: plural, translations: { es: { value: plural, status: 'verified' } } } });
      seedResources(japanese, {
        count: { source: plural, translations: { en: { value: plural, status: 'verified' } } },
      });

      const result = validateResources(
        [main, japanese],
        {
          allowTranslated: false,
          icu: { compileValues: true, requirePortablePlurals: true },
        },
        termsByCollection,
      );

      expect(result.icu?.valuesChecked).toBe(4);
      // The portability rule reads base values only, each under its own collection's base locale.
      expect(result.icu?.warnings.map((warning) => `${warning.collection}/${warning.locale}`)).toEqual([
        'main/en',
        'japanese/ja',
      ]);
    });

    it("compares each translation with its collection's base value", () => {
      const french = collection('french', { baseLocale: 'fr', locales: ['fr', 'en'] });
      seedResources(french, {
        greeting: { source: 'Bonjour {name}', translations: { en: { value: 'Hello {nom}', status: 'verified' } } },
      });

      const result = validateResources([french], { allowTranslated: false, placeholders: true }, termsByCollection);

      expect(result.passed).toBe(false);
      expect(result.placeholders?.valuesChecked).toBe(1);
      expect(result.placeholders?.failures).toMatchObject([
        { key: 'greeting', locale: 'en', collection: 'french', missing: ['name'], unexpected: ['nom'] },
      ]);
    });

    it('leaves the ICU and placeholder results undefined when not requested', () => {
      const result = validateResources([collection()], { allowTranslated: false }, termsByCollection);

      expect(result.icu).toBeUndefined();
      expect(result.placeholders).toBeUndefined();
    });
  });

  describe('dotted simple arguments', () => {
    for (const runtime of ['transloco', 'transloco-messageformat'] as const) {
      it(`validates dotted simple arguments according to ${runtime}`, () => {
        const main = collection('main', { runtime, locales: ['en', 'es'] });
        seedResources(main, {
          greeting: {
            source: 'Hello {user.name}',
            translations: { es: { value: 'Hola {user.name}', status: 'verified' } },
          },
        });
        const result = validateResources(
          [main],
          {
            allowTranslated: false,
            icu: { compileValues: true, requirePortablePlurals: false },
            placeholders: true,
          },
          termsByCollection,
        );
        expect(result.passed).toBe(runtime === 'transloco');
        expect(result.icu?.failures).toHaveLength(runtime === 'transloco' ? 0 : 2);
        expect(result.placeholders?.failures).toEqual([]);
      });
    }

    it('reports dotted argument renames and retains the runtime warning for a plural', () => {
      const main = collection('main', { runtime: 'transloco', locales: ['en', 'es'] });
      seedResources(main, {
        count: {
          source: '{user.name} has {n, plural, other {# items}}',
          translations: { es: { value: '{user.nam} tiene {n, plural, other {# cosas}}', status: 'verified' } },
        },
      });
      const result = validateResources(
        [main],
        {
          allowTranslated: false,
          icu: { compileValues: true, requirePortablePlurals: false },
          placeholders: true,
        },
        termsByCollection,
      );
      expect(result.icu?.failures).toHaveLength(2);
      expect(result.icu?.failures.every((failure) => failure.kind === 'runtime-unrenderable')).toBe(true);
      expect(result.placeholders?.failures).toMatchObject([{ missing: ['user.name'], unexpected: ['user.nam'] }]);
    });
  });

  describe('runtime renderability', () => {
    const plural = '{n, plural, one {# item} other {# items}}';

    it('fails each stored locale under transloco and lists runtime failures with ICU failures', () => {
      const main = collection('main', { runtime: 'transloco' });
      seedResources(main, {
        count: {
          source: plural,
          translations: {
            es: { value: plural, status: 'verified' },
            fr: { value: plural, status: 'verified' },
          },
        },
      });
      const result = validateResources(
        [main],
        {
          allowTranslated: false,
          icu: { compileValues: true, requirePortablePlurals: false },
        },
        termsByCollection,
      );
      expect(result.passed).toBe(false);
      expect(result.failures).toEqual([]);
      expect(result.icu?.failures).toEqual(
        ['en', 'es', 'fr'].map((locale) => ({
          kind: 'runtime-unrenderable',
          key: 'count',
          locale,
          collection: 'main',
          message:
            'Uses ICU plural, which the transloco runtime cannot render. Set runtime to transloco-messageformat or rewrite the value without ICU constructs.',
        })),
      );
      expect(result.icu?.valuesChecked).toBe(3);
    });

    it('passes plurals when the runtime check is skipped or the default runtime is used', () => {
      for (const runtime of ['transloco', 'transloco-messageformat'] as const) {
        const main = collection(runtime, { runtime });
        seedResources(main, { count: withStatus(plural, { es: 'verified', fr: 'verified' }) });
        const result = validateResources(
          [main],
          {
            allowTranslated: false,
            runtime: runtime !== 'transloco',
            icu: { compileValues: true, requirePortablePlurals: false },
          },
          termsByCollection,
        );
        expect(result.passed).toBe(true);
        expect(result.icu?.failures).toEqual([]);
      }
    });

    it('checks the base locale and explicit translations, leaving skipped and missing values out', () => {
      const main = collection('main', { runtime: 'transloco' });
      seedResources(main, {
        count: { source: plural, translations: { es: { value: 'Items', status: 'verified' }, fr: plural } },
        missing: { source: 'Plain' },
      });
      const result = validateResources(
        [main],
        { allowTranslated: false },
        termsByCollection,
        readCollectionSet([main], { scope: 'validation', skippedLocales: ['fr'] }),
      );
      expect(result.icu?.failures).toMatchObject([{ kind: 'runtime-unrenderable', key: 'count', locale: 'en' }]);
      expect(result.icu?.failures).toHaveLength(1);
    });

    it('uses explicit base-locale values and accepts renderable ICU-quoted literals', () => {
      const main = collection('main', { runtime: 'transloco', locales: ['en', 'es'] });
      writeFolderFiles(main.translationsFolder, '', {
        entries: {
          count: { source: plural, en: "Showing '{'first'}' entries", es: 'Hello {name}' },
        },
      });
      const result = validateResources([main], { allowTranslated: false }, termsByCollection);
      expect(result.icu).toBeUndefined();
    });
  });

  describe('preferred terminology', () => {
    const rules = [{ discouraged: 'Expenditure', preferred: 'Investment' }];
    const budget: SeedResource = withStatus('Capital expenditure', { es: 'verified', fr: 'verified' });

    it('reports a finding once across every target locale and still passes', () => {
      const main = collection();
      seedResources(main, { 'budget.title': budget });

      const result = validateResources([main], { allowTranslated: false, terminology: { rules } }, termsByCollection);

      expect(result.passed).toBe(true);
      expect(result.terminology?.warnings).toHaveLength(1);
      expect(result.terminology?.warnings[0]).toMatchObject({ key: 'budget.title', locale: 'en' });
      expect(result.terminology?.valuesChecked).toBe(1);
    });

    it('reports each collection under its own base locale', () => {
      const main = collection();
      const legacy = collection('legacy', { baseLocale: 'en-GB', locales: ['en-GB', 'es', 'fr'] });
      seedResources(main, { 'budget.title': budget });
      seedResources(legacy, { 'legacy.title': budget });

      const result = validateResources(
        [main, legacy],
        { allowTranslated: false, terminology: { rules } },
        termsByCollection,
      );

      expect(result.terminology?.warnings.map((warning) => `${warning.collection}:${warning.locale}`)).toEqual([
        'main:en',
        'legacy:en-GB',
      ]);
    });

    it('fails when the rule file could not be loaded', () => {
      const main = collection();
      seedResources(main, { 'budget.title': budget });

      const result = validateResources(
        [main],
        {
          allowTranslated: false,
          terminology: { rules: [], loadError: 'broken' },
        },
        termsByCollection,
      );

      expect(result.passed).toBe(false);
      expect(result.terminology?.configError).toBe('broken');
      expect(result.failures).toHaveLength(0);
    });

    it('leaves the terminology result undefined when not requested', () => {
      expect(
        validateResources([collection()], { allowTranslated: false }, termsByCollection).terminology,
      ).toBeUndefined();
    });
  });
});
