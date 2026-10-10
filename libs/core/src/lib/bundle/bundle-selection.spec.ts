import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BundleDefinition, CollectionBundleDefinition } from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import type { Collection } from '../config/open-collection';
import {
  type SeedResource,
  seedResources,
  testCollection,
  useTempDir,
  writeFolderFiles,
} from '../../testing/temp-dir.spec-helpers';
import {
  type BundleCollection,
  resolveBundleCollections,
  selectBundleEntries,
  selectionValues,
} from './bundle-selection';
import { COLLECTION_BASE_LOCALE, type CollectionReadCache } from './resource-loader';

describe('Bundle Selection (real fs)', () => {
  const root = useTempDir('bundle-selection-');

  function seeded(
    name: string,
    resources: Record<string, SeedResource>,
    overrides: Partial<Collection> = {},
  ): Collection {
    const collection = testCollection(join(root(), name), { name, ...overrides });
    seedResources(collection, resources);
    return collection;
  }

  function bundled(collection: Collection, definition: Partial<CollectionBundleDefinition> = {}): BundleCollection {
    return { collection, definition: { name: collection.name, entriesSelectionRules: 'All', ...definition } };
  }

  const noTransform = { transformICUToTransloco: false } as const;

  describe('resolveBundleCollections', () => {
    const config: LingoTrackerConfig = {
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: {
        common: { translationsFolder: 'translations/common' },
        french: { translationsFolder: 'translations/french', baseLocale: 'fr' },
      },
    };

    function definition(collections: BundleDefinition['collections']): BundleDefinition {
      return { bundleName: '{locale}', dist: 'dist', collections };
    }

    it("expands 'All' to every configured collection with every entry and no prefix, opened against cwd", () => {
      const { collections, warnings } = resolveBundleCollections(definition('All'), config, { cwd: root() });

      expect(warnings).toEqual([]);
      expect(collections.map(({ definition: d }) => d)).toEqual([
        { name: 'common', entriesSelectionRules: 'All' },
        { name: 'french', entriesSelectionRules: 'All' },
      ]);
      expect(collections[0]?.collection.translationsFolder).toBe(join(root(), 'translations/common'));
      expect(collections[1]?.collection.baseLocale).toBe('fr');
    });

    it('keeps an explicit list in order with its settings, and reports a missing collection once', () => {
      const french: CollectionBundleDefinition = {
        name: 'french',
        entriesSelectionRules: [{ matchingPattern: 'a.*' }],
        bundledKeyPrefix: 'fr',
        mergeStrategy: 'override',
      };

      const { collections, warnings } = resolveBundleCollections(
        definition([french, { name: 'nonexistent', entriesSelectionRules: 'All' }]),
        config,
        { cwd: root() },
      );

      expect(collections.map(({ definition: d }) => d)).toEqual([french]);
      expect(warnings).toEqual(["Collection 'nonexistent' not found in config"]);
    });
  });

  describe('selectBundleEntries', () => {
    it("reads each collection's value for the locale and leaves out entries without one", () => {
      const common = seeded('common', {
        'buttons.ok': { source: 'OK', translations: { fr: "D'accord" } },
        'buttons.cancel': { source: 'Cancel' },
      });

      expect(selectionValues(selectBundleEntries([bundled(common)], 'en', noTransform))).toEqual({
        'buttons.ok': 'OK',
        'buttons.cancel': 'Cancel',
      });
      expect(selectionValues(selectBundleEntries([bundled(common)], 'fr', noTransform))).toEqual({
        'buttons.ok': "D'accord",
      });
    });

    it("reads every collection's own base value for COLLECTION_BASE_LOCALE", () => {
      const common = seeded('common', { title: { source: 'Title', translations: { fr: 'Titre' } } });
      const french = seeded('french', { bonjour: { source: 'Bonjour' } }, { baseLocale: 'fr', locales: ['fr', 'en'] });

      const selection = selectBundleEntries([bundled(common), bundled(french)], COLLECTION_BASE_LOCALE, noTransform);

      expect(selectionValues(selection)).toEqual({ title: 'Title', bonjour: 'Bonjour' });
    });

    it('keeps the entries matching any rule: key pattern and tags together', () => {
      const common = seeded(
        'common',
        {
          'apps.welcome': { source: 'Welcome', tags: ['ui'] },
          'apps.untagged': { source: 'Untagged' },
          'apps.both': { source: 'Both', tags: ['ui', 'critical'] },
          'other.title': { source: 'Title', tags: ['ui'] },
          'labels.title': { source: 'Label' },
        },
        { tags: [] },
      );
      const rules = (entriesSelectionRules: CollectionBundleDefinition['entriesSelectionRules']): string[] =>
        Array.from(
          selectBundleEntries([bundled(common, { entriesSelectionRules })], 'en', noTransform).entries.keys(),
        ).sort();

      expect(rules([{ matchingPattern: 'apps.*' }])).toEqual(['apps.both', 'apps.untagged', 'apps.welcome']);
      expect(rules([{ matchingPattern: 'apps.*', matchingTags: ['ui'] }])).toEqual(['apps.both', 'apps.welcome']);
      expect(rules([{ matchingPattern: '*', matchingTags: ['ui', 'critical'], matchingTagOperator: 'All' }])).toEqual([
        'apps.both',
      ]);
      expect(rules([{ matchingPattern: 'apps.*', matchingTags: ['*'] }])).toEqual(['apps.both', 'apps.welcome']);
      expect(rules([{ matchingPattern: 'labels.title' }, { matchingPattern: 'other.*' }])).toEqual([
        'labels.title',
        'other.title',
      ]);
    });

    it("matches tags against the collection's tags united with the entry's own", () => {
      const common = seeded('common', { ok: { source: 'OK' } }, { tags: ['shared'] });

      const selection = selectBundleEntries(
        [bundled(common, { entriesSelectionRules: [{ matchingPattern: '*', matchingTags: ['shared'] }] })],
        'en',
        noTransform,
      );

      expect(Array.from(selection.entries.keys())).toEqual(['ok']);
    });

    it('prefixes the final key and keeps the source key in the origin', () => {
      const common = seeded('common', { 'buttons.ok': { source: 'OK' } });

      const selection = selectBundleEntries([bundled(common, { bundledKeyPrefix: 'ds' })], 'en', noTransform);

      expect(selection.entries.get('ds.buttons.ok')).toEqual({
        value: 'OK',
        origin: { collectionName: 'common', sourceKey: 'buttons.ok' },
      });
    });

    describe('merging', () => {
      function twoCollections(): { first: Collection; second: Collection } {
        return {
          // Folder 'shared' is read before folder 'zzz', so the shared key comes first.
          first: seeded('first', { 'shared.title': { source: 'First' }, 'zzz.only': { source: 'Only' } }),
          second: seeded('second', { 'shared.title': { source: 'Second' } }),
        };
      }

      it("keeps the first value under 'merge' (the default) and reports the conflict", () => {
        const { first, second } = twoCollections();

        const selection = selectBundleEntries([bundled(first), bundled(second)], 'en', noTransform);

        expect(selection.entries.get('shared.title')).toEqual({
          value: 'First',
          origin: { collectionName: 'first', sourceKey: 'shared.title' },
        });
        expect(Array.from(selection.conflicts)).toEqual(['shared.title']);
      });

      it("takes the later value under 'override', keeping the key's first position", () => {
        const { first, second } = twoCollections();

        const selection = selectBundleEntries(
          [bundled(first), bundled(second, { mergeStrategy: 'override' })],
          'en',
          noTransform,
        );

        expect(Array.from(selection.entries.keys())).toEqual(['shared.title', 'zzz.only']);
        expect(selection.entries.get('shared.title')).toEqual({
          value: 'Second',
          origin: { collectionName: 'second', sourceKey: 'shared.title' },
        });
        expect(Array.from(selection.conflicts)).toEqual(['shared.title']);
      });

      it('reports no conflict when prefixes separate the collections', () => {
        const { first, second } = twoCollections();

        const selection = selectBundleEntries(
          [bundled(first), bundled(second, { bundledKeyPrefix: 'second' })],
          'en',
          noTransform,
        );

        expect(selection.conflicts.size).toBe(0);
        expect(selection.entries.has('second.shared.title')).toBe(true);
      });
    });

    it('treats keys named like Object.prototype members as ordinary keys, not conflicts', () => {
      const common = seeded('common', { constructor: { source: 'Builder' }, toString: { source: 'Text' } });

      const selection = selectBundleEntries([bundled(common)], 'en', noTransform);

      expect(selection.conflicts.size).toBe(0);
      expect(selectionValues(selection)).toEqual({ constructor: 'Builder', toString: 'Text' });
    });

    describe('ICU to Transloco', () => {
      it('converts values when asked, and leaves them as stored otherwise', () => {
        const common = seeded('common', { greeting: { source: 'Hello {name}' } });

        expect(
          selectBundleEntries([bundled(common)], 'en', { transformICUToTransloco: true }).entries.get('greeting')
            ?.value,
        ).toBe('Hello {{ name }}');
        expect(selectBundleEntries([bundled(common)], 'en', noTransform).entries.get('greeting')?.value).toBe(
          'Hello {name}',
        );
      });

      it('warns about quoted interpolation delimiters and preserves the emitted value', () => {
        for (const value of [
          "'{{ name }}'",
          "'{{'a'}}'",
          "{n, plural, other {'{{ name }}'}}",
          "{n, plural, other {'{{' x}}",
        ]) {
          const common = seeded('common', { literal: { source: value } });
          const converted = selectBundleEntries([bundled(common)], 'en', { transformICUToTransloco: true });
          expect(converted.warnings).toEqual([
            "Key 'literal': quoted literal '{{' or '}}' will be consumed by Transloco interpolation",
          ]);
          expect(converted.entries.get('literal')?.value).toBe(value);
          expect(selectBundleEntries([bundled(common)], 'en', noTransform).warnings).toEqual([]);
        }
        for (const value of ["'}}'", "{n, plural, one {'{{' x} other {# y}}"]) {
          const common = seeded('common', { literal: { source: value } });
          expect(selectBundleEntries([bundled(common)], 'en', { transformICUToTransloco: true }).warnings).toEqual([]);
        }
      });

      it('warns about a malformed value and includes it as-is, only when converting', () => {
        const common = seeded('common', { broken: { source: 'Hello {name' } });

        const converted = selectBundleEntries([bundled(common)], 'en', { transformICUToTransloco: true });

        expect(converted.warnings).toEqual(["Key 'broken': value has malformed ICU syntax and was included as-is"]);
        expect(converted.entries.has('broken')).toBe(true);
        expect(selectBundleEntries([bundled(common)], 'en', noTransform).warnings).toEqual([]);
      });

      it('warns about unquoted literal braces in an ICU branch and includes the value as-is', () => {
        const value = '{count, plural, one {x} other {{}}}';
        const common = seeded('common', { broken: { source: value } });
        const converted = selectBundleEntries([bundled(common)], 'en', { transformICUToTransloco: true });

        expect(converted.entries.get('broken')?.value).toBe(value);
        expect(converted.warnings).toContain("Key 'broken': value has malformed ICU syntax and was included as-is");
        expect(selectBundleEntries([bundled(common)], 'en', noTransform).warnings).toEqual([]);
      });
    });

    it('reports an unreadable folder in the first selection of a run only', () => {
      const common = seeded('common', { ok: { source: 'OK', translations: { fr: 'Bien' } } });
      writeFolderFiles(common.translationsFolder, 'bad', { entries: '{ invalid json }' });
      const cache: CollectionReadCache = new Map();

      const en = selectBundleEntries([bundled(common)], 'en', { ...noTransform, cache });
      const fr = selectBundleEntries([bundled(common)], 'fr', { ...noTransform, cache });

      expect(en.warnings).toHaveLength(1);
      expect(en.warnings[0]).toContain("Collection 'common': Skipped unreadable folder");
      expect(fr.warnings).toEqual([]);
    });
  });
});
