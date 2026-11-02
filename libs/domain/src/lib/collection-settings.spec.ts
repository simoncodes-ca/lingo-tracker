import { describe, expect, it } from 'vitest';
import { findCollectionEntry, inheritCollectionSettings } from './collection-settings';

interface Translation {
  enabled?: boolean;
  provider?: string;
  key?: string;
}

interface Settings {
  baseLocale?: string;
  locales?: readonly string[];
  translation?: Translation;
  readOnly?: boolean;
}

interface Case {
  name: string;
  collection: Settings | undefined;
  global: Settings;
  expected: ReturnType<typeof inheritCollectionSettings<Translation>>;
}

const globalTranslation = Object.freeze({ enabled: true, provider: 'global', key: 'GLOBAL_KEY' });
const collectionTranslation = Object.freeze({ enabled: false });
const globalSettings = Object.freeze({
  baseLocale: 'fr',
  locales: Object.freeze(['fr', 'es']),
  translation: globalTranslation,
});
const inherited = { ...globalSettings, readOnly: false };
const defaults = { baseLocale: 'en', locales: [], translation: undefined, readOnly: false };

const cases: Case[] = [
  {
    name: 'uses every collection value',
    collection: { baseLocale: 'de', locales: ['de', 'ja'], translation: collectionTranslation, readOnly: true },
    global: globalSettings,
    expected: { baseLocale: 'de', locales: ['de', 'ja'], translation: collectionTranslation, readOnly: true },
  },
  { name: 'inherits absent collection fields', collection: {}, global: globalSettings, expected: inherited },
  { name: 'defaults absent fields', collection: {}, global: {}, expected: defaults },
  { name: 'inherits with an undefined collection', collection: undefined, global: globalSettings, expected: inherited },
  { name: 'defaults with an undefined collection', collection: undefined, global: {}, expected: defaults },
  {
    name: 'inherits an empty collection base locale',
    collection: { baseLocale: '' },
    global: globalSettings,
    expected: inherited,
  },
  {
    name: 'defaults when both base locales are empty',
    collection: { baseLocale: '' },
    global: { baseLocale: '' },
    expected: defaults,
  },
  {
    name: 'defaults an empty global base locale',
    collection: undefined,
    global: { baseLocale: '' },
    expected: defaults,
  },
  {
    name: 'keeps whitespace in the collection base locale',
    collection: { baseLocale: ' ' },
    global: globalSettings,
    expected: { ...inherited, baseLocale: ' ' },
  },
  {
    name: 'inherits an empty collection locale array',
    collection: { locales: [] },
    global: globalSettings,
    expected: inherited,
  },
  {
    name: 'keeps an empty global locale array with an empty collection array',
    collection: { locales: [] },
    global: { locales: [] },
    expected: defaults,
  },
  {
    name: 'defaults an empty collection locale array without a global array',
    collection: { locales: [] },
    global: {},
    expected: defaults,
  },
  {
    name: 'keeps an empty global locale array',
    collection: {},
    global: { locales: [] },
    expected: defaults,
  },
  {
    name: 'replaces translation settings without merging global fields',
    collection: { translation: collectionTranslation },
    global: globalSettings,
    expected: { ...inherited, translation: collectionTranslation },
  },
  {
    name: 'keeps an empty translation object',
    collection: { translation: {} },
    global: globalSettings,
    expected: { ...inherited, translation: {} },
  },
  {
    name: 'keeps explicit false read-only and ignores global read-only',
    collection: { readOnly: false },
    global: { ...globalSettings, readOnly: true },
    expected: inherited,
  },
  {
    name: 'does not inherit global read-only',
    collection: undefined,
    global: { ...globalSettings, readOnly: true },
    expected: inherited,
  },
  {
    name: 'inherits explicitly undefined fields',
    collection: { baseLocale: undefined, locales: undefined, translation: undefined, readOnly: undefined },
    global: globalSettings,
    expected: inherited,
  },
];

describe('inheritCollectionSettings', () => {
  for (const { name, collection, global, expected } of cases) {
    it(name, () => {
      if (collection) Object.freeze(collection);
      Object.freeze(global);

      const settings = inheritCollectionSettings(collection, global);

      expect(settings).toEqual(expected);
      if (collection?.locales?.length) {
        expect(settings.locales).toBe(collection.locales);
      } else if (global.locales) {
        expect(settings.locales).toBe(global.locales);
      }
      expect(settings.translation).toBe(collection?.translation ?? global.translation);
    });
  }
});

describe('findCollectionEntry', () => {
  const entry = { baseLocale: 'fr' };

  it('returns the named own entry without copying it', () => {
    expect(findCollectionEntry({ app: entry }, 'app')).toBe(entry);
  });

  it('returns undefined for missing entries and an undefined collection map', () => {
    expect(findCollectionEntry({ app: entry }, 'missing')).toBeUndefined();
    expect(findCollectionEntry({}, 'app')).toBeUndefined();
    expect(findCollectionEntry(undefined, 'app')).toBeUndefined();
  });

  it('does not resolve Object.prototype members, including constructor and __proto__', () => {
    expect(findCollectionEntry({}, 'constructor')).toBeUndefined();
    expect(findCollectionEntry({}, '__proto__')).toBeUndefined();
    expect(findCollectionEntry({}, 'toString')).toBeUndefined();
  });

  it('returns constructor and __proto__ when they are registered as own entries', () => {
    const collections = { constructor: entry, ['__proto__']: entry };
    expect(findCollectionEntry(collections, 'constructor')).toBe(entry);
    expect(findCollectionEntry(collections, '__proto__')).toBe(entry);
  });

  it('does not resolve entries inherited from a custom prototype', () => {
    const collections = Object.create({ app: entry }) as Record<string, typeof entry>;
    expect(findCollectionEntry(collections, 'app')).toBeUndefined();
  });

  it('supports a map with a null prototype and a shadowed hasOwnProperty', () => {
    const collections = Object.create(null) as Record<string, typeof entry>;
    collections['app'] = entry;
    Object.defineProperty(collections, 'hasOwnProperty', { value: entry, enumerable: true });
    expect(findCollectionEntry(collections, 'app')).toBe(entry);
    expect(findCollectionEntry(collections, 'hasOwnProperty')).toBe(entry);
    expect(findCollectionEntry(collections, 'constructor')).toBeUndefined();
  });
});
