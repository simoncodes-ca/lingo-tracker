import { describe, expect, it } from 'vitest';
import { bundleCards, type CollectionCardEntry, collectionCards, toCollectionCardView } from './collection-cards';
import type { BundleEntry } from './store/features/with-bundles.feature';

const entry: CollectionCardEntry = {
  name: 'alpha',
  config: { translationsFolder: 'sample/alpha' },
  baseLocale: 'en',
  locales: ['fr', 'en', 'es', 'de', 'ja', 'ru'],
};

describe('collection cards', () => {
  const cases = [
    {
      name: 'base locale first, remaining locale order preserved',
      locales: entry.locales,
      visible: ['en', 'fr', 'es'],
      overflow: ['de', 'ja', 'ru'],
    },
    {
      name: 'four locales fit without overflow',
      locales: ['fr', 'es', 'en', 'de'],
      visible: ['en', 'fr', 'es', 'de'],
      overflow: [],
    },
    {
      name: 'five locales reserve a chip for overflow',
      locales: ['en', 'fr', 'es', 'de', 'ja'],
      visible: ['en', 'fr', 'es'],
      overflow: ['de', 'ja'],
    },
    {
      name: 'absent base locale is not added',
      locales: ['fr', 'es'],
      visible: ['fr', 'es'],
      overflow: [],
    },
    { name: 'empty locale list', locales: [], visible: [], overflow: [] },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const locales = [...testCase.locales];
      const card = toCollectionCardView({ ...entry, locales });
      expect(card.visibleLocales).toEqual(testCase.visible);
      expect(card.overflowLocales).toEqual(testCase.overflow);
      expect(card.baseLocale).toBe('en');
      expect(locales).toEqual(testCase.locales);
    });
  }

  it('keeps display fields and marks read-only only when true', () => {
    expect(toCollectionCardView(entry)).toMatchObject({
      name: 'alpha',
      translationsFolder: 'sample/alpha',
      readOnly: false,
    });
    expect(
      toCollectionCardView({
        ...entry,
        config: { ...entry.config, readOnly: true },
      }).readOnly,
    ).toBe(true);
  });

  it('sorts names by locale with case-insensitive comparison without mutating entries', () => {
    const entries = ['zulu', 'Éclair', 'alpha', 'Bravo'].map((name) => ({
      ...entry,
      name,
    }));
    expect(collectionCards(entries, '').map((card) => card.name)).toEqual(['alpha', 'Bravo', 'Éclair', 'zulu']);
    expect(entries.map((item) => item.name)).toEqual(['zulu', 'Éclair', 'alpha', 'Bravo']);
  });

  it('trims and filters case-insensitively by name or translations folder', () => {
    const entries = [
      entry,
      {
        ...entry,
        name: 'Bravo',
        config: { translationsFolder: 'vendor/bravo' },
      },
    ];
    expect(collectionCards(entries, ' BRAV ').map((card) => card.name)).toEqual(['Bravo']);
    expect(collectionCards(entries, ' SAMPLE/ ').map((card) => card.name)).toEqual(['alpha']);
    expect(collectionCards(entries, '  ')).toHaveLength(2);
    expect(collectionCards(entries, 'missing')).toEqual([]);
  });
});

describe('bundle cards', () => {
  const entries: readonly BundleEntry[] = [
    {
      name: 'main',
      definition: { dist: 'dist', bundleName: '{locale}', collections: 'All' },
    },
    {
      name: 'tracker',
      definition: {
        dist: 'dist',
        bundleName: '{locale}',
        collections: [{ name: 'alpha', entriesSelectionRules: 'All' }],
      },
    },
  ];

  it('resolves All from every collection in input order and keeps bundle order', () => {
    const cards = bundleCards(entries, ['zulu', 'alpha', 'Bravo'], ['en', 'fr']);
    expect(cards.map((card) => card.entry)).toEqual(entries);
    expect(cards[0]?.collectionNames).toEqual(['zulu', 'alpha', 'Bravo']);
    expect(cards[1]?.collectionNames).toEqual(['alpha']);
    expect(cards.map((card) => card.localeCount)).toEqual([2, 2]);
  });

  it('resolves All and locale count to empty when none are configured', () => {
    expect(bundleCards(entries, [], [])[0]).toEqual({
      entry: entries[0],
      collectionNames: [],
      localeCount: 0,
    });
    expect(bundleCards([], ['alpha'], ['en'])).toEqual([]);
  });
});
