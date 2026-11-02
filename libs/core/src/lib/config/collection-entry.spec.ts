import { describe, expect, it } from 'vitest';
import type { LingoTrackerCollection } from '../../config/lingo-tracker-collection';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import {
  CollectionAlreadyExistsError,
  CollectionNotFoundError,
  InvalidCollectionError,
  InvalidNameError,
} from '../errors/lingo-tracker-error';
import { addCollectionEntry, patchCollectionEntry, toCollectionEntry } from './collection-entry';

const GLOBAL: LingoTrackerConfig = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' },
  collections: {
    first: { translationsFolder: './first' },
    app: { translationsFolder: './i18n', locales: ['en', 'es'], tags: ['team-x'] },
    last: { translationsFolder: './last' },
  },
};

describe('toCollectionEntry', () => {
  it('stores translationsFolder (trimmed) and nothing else when every setting matches the global config', () => {
    const entry = toCollectionEntry(GLOBAL, {
      translationsFolder: '  ./src/i18n  ',
      exportFolder: 'dist/lingo-export',
      importFolder: 'dist/lingo-import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      readOnly: false,
      tags: [],
      protectedTermsFile: '  ',
    });

    expect(entry).toEqual({ translationsFolder: './src/i18n' });
  });

  it('keeps every setting that differs from the global config', () => {
    const collection: LingoTrackerCollection = {
      translationsFolder: './i18n',
      exportFolder: 'custom/export',
      importFolder: 'custom/import',
      baseLocale: 'fr',
      locales: ['fr', 'en'],
      translation: { enabled: false, provider: 'none', apiKeyEnv: 'X' },
      readOnly: true,
      tags: ['Team X', 'feature-a', 'Team X'],
      protectedTermsFile: ' i18n/terms.json ',
    };

    expect(toCollectionEntry(GLOBAL, collection)).toEqual({
      ...collection,
      tags: ['team-x', 'feature-a'],
      protectedTermsFile: 'i18n/terms.json',
    });
  });

  it('keeps the translation override even when it equals the global block', () => {
    const entry = toCollectionEntry(GLOBAL, { translationsFolder: './i18n', translation: GLOBAL.translation });

    expect(entry.translation).toEqual(GLOBAL.translation);
  });

  it('compares locales as ordered lists', () => {
    expect(toCollectionEntry(GLOBAL, { translationsFolder: './i18n', locales: ['fr', 'en'] }).locales).toEqual([
      'fr',
      'en',
    ]);
  });

  it('drops an empty locales list, which means inherit, not "no locales"', () => {
    expect(toCollectionEntry(GLOBAL, { translationsFolder: './i18n', locales: [] })).toEqual({
      translationsFolder: './i18n',
    });
  });

  it('throws InvalidCollectionError for a missing or blank translationsFolder', () => {
    expect(() => toCollectionEntry(GLOBAL, { translationsFolder: '   ' })).toThrow(InvalidCollectionError);
    expect(() => toCollectionEntry(GLOBAL, {} as LingoTrackerCollection)).toThrow('translationsFolder is required');
  });
});

describe('addCollectionEntry', () => {
  it('registers the minimal record without touching the other collections', () => {
    const next = addCollectionEntry(GLOBAL, 'admin', { translationsFolder: './admin', baseLocale: 'en' });

    expect(next.collections['admin']).toEqual({ translationsFolder: './admin' });
    expect(next.collections['app']).toBe(GLOBAL.collections['app']);
    expect(GLOBAL.collections['admin']).toBeUndefined();
  });

  it('defaults a folder under node_modules to read-only unless the caller decides', () => {
    const vendored = 'node_modules/lib/i18n';

    expect(addCollectionEntry(GLOBAL, 'v', { translationsFolder: vendored }).collections['v'].readOnly).toBe(true);
    expect(addCollectionEntry(GLOBAL, 'v', { translationsFolder: ` ${vendored} ` }).collections['v'].readOnly).toBe(
      true,
    );
    expect(
      addCollectionEntry(GLOBAL, 'v', { translationsFolder: vendored, readOnly: false }).collections['v'].readOnly,
    ).toBeUndefined();
    expect(addCollectionEntry(GLOBAL, 'v', { translationsFolder: './src' }).collections['v'].readOnly).toBeUndefined();
  });

  it('throws CollectionAlreadyExistsError for a taken name', () => {
    expect(() => addCollectionEntry(GLOBAL, 'app', { translationsFolder: './x' })).toThrow(
      CollectionAlreadyExistsError,
    );
  });
});

describe('patchCollectionEntry', () => {
  const translation = { enabled: false, provider: 'none', apiKeyEnv: 'X' };
  const stored: LingoTrackerCollection = {
    translationsFolder: './i18n',
    exportFolder: 'custom/export',
    importFolder: 'custom/import',
    locales: ['en', 'es'],
    translation,
    readOnly: true,
    tags: ['team-x'],
    protectedTermsFile: 'i18n/terms.json',
  };
  const config: LingoTrackerConfig = { ...GLOBAL, collections: { app: stored } };

  it('keeps every field the patch leaves out', () => {
    const next = patchCollectionEntry(config, 'app', { tags: ['new'] });

    expect(next.collections['app']).toEqual({ ...stored, tags: ['new'] });
  });

  it('keeps translation, exportFolder and importFolder for a client that never sends them (the Tracker form)', () => {
    const next = patchCollectionEntry(config, 'app', {
      translationsFolder: './i18n',
      locales: ['en', 'es'],
      readOnly: true,
      tags: ['team-x'],
      protectedTermsFile: 'i18n/terms.json',
    });

    expect(next.collections['app']).toEqual(stored);
  });

  it('clears a setting with its empty value: [] tags, false readOnly, "" pointer, [] locales', () => {
    const next = patchCollectionEntry(config, 'app', {
      tags: [],
      readOnly: false,
      protectedTermsFile: '',
      locales: [],
    });

    expect(next.collections['app']).toEqual({
      translationsFolder: './i18n',
      exportFolder: 'custom/export',
      importFolder: 'custom/import',
      translation,
    });
  });

  it('clears exportFolder, importFolder and baseLocale with "" (the collection inherits the global value)', () => {
    const withBase: LingoTrackerConfig = { ...GLOBAL, collections: { app: { ...stored, baseLocale: 'es' } } };

    const next = patchCollectionEntry(withBase, 'app', { exportFolder: '', importFolder: ' ', baseLocale: '' });

    expect(next.collections['app']).toEqual({
      translationsFolder: './i18n',
      locales: ['en', 'es'],
      translation,
      readOnly: true,
      tags: ['team-x'],
      protectedTermsFile: 'i18n/terms.json',
    });
  });

  it.each(['locales', 'translation', 'tags', 'exportFolder', 'readOnly'])(
    'throws InvalidCollectionError for %s: null (a JSON body), and stores nothing',
    (field) => {
      // JSON.parse, as the API would: the type has no null, a request body can.
      const patch: Partial<LingoTrackerCollection> = JSON.parse(`{ "${field}": null }`);

      expect(() => patchCollectionEntry(config, 'app', patch)).toThrow(
        new InvalidCollectionError(`${field} must not be null`, { field }),
      );
    },
  );

  it('treats an undefined value like a key left out (the `{ locales }` shorthand of a caller with nothing to say)', () => {
    const next = patchCollectionEntry(config, 'app', {
      locales: undefined,
      tags: undefined,
      readOnly: undefined,
      protectedTermsFile: undefined,
      translation: undefined,
    });

    expect(next.collections['app']).toEqual(stored);
  });

  it('re-minimizes: a value now equal to the global one is stored as inherited', () => {
    const next = patchCollectionEntry(config, 'app', { exportFolder: GLOBAL.exportFolder, locales: GLOBAL.locales });

    expect(next.collections['app']).toEqual({ ...stored, exportFolder: undefined, locales: undefined });
    expect(next.collections['app']).not.toHaveProperty('exportFolder');
    expect(next.collections['app']).not.toHaveProperty('locales');
  });

  it('does not mutate the config it was given', () => {
    patchCollectionEntry(config, 'app', { tags: [] });

    expect(config.collections['app']).toEqual(stored);
  });

  it('renames in place, keeping the collection order', () => {
    const next = patchCollectionEntry(GLOBAL, 'app', { translationsFolder: './i18n' }, 'renamed');

    expect(Object.keys(next.collections)).toEqual(['first', 'renamed', 'last']);
    expect(next.collections['renamed']).toEqual({
      translationsFolder: './i18n',
      locales: ['en', 'es'],
      tags: ['team-x'],
    });
  });

  it('rejects an empty new name', () => {
    expect(() => patchCollectionEntry(GLOBAL, 'app', {}, '')).toThrow(InvalidNameError);
  });

  it('rejects a whitespace new name', () => {
    expect(() => patchCollectionEntry(GLOBAL, 'app', {}, '   ')).toThrow(InvalidNameError);
  });

  it('trims a padded rename target and treats the same name as a plain update', () => {
    expect(Object.keys(patchCollectionEntry(GLOBAL, 'app', {}, ' renamed ').collections)).toEqual([
      'first',
      'renamed',
      'last',
    ]);
    expect(Object.keys(patchCollectionEntry(GLOBAL, 'app', {}, ' app ').collections)).toEqual(['first', 'app', 'last']);
  });

  it('throws InvalidCollectionError when the patch blanks translationsFolder', () => {
    expect(() => patchCollectionEntry(GLOBAL, 'app', { translationsFolder: ' ' })).toThrow(InvalidCollectionError);
  });

  it('throws CollectionNotFoundError for an unknown collection', () => {
    expect(() => patchCollectionEntry(GLOBAL, 'nope', { translationsFolder: './x' })).toThrow(CollectionNotFoundError);
  });

  it('throws CollectionAlreadyExistsError when renaming onto a taken name', () => {
    expect(() => patchCollectionEntry(GLOBAL, 'app', { translationsFolder: './x' }, 'last')).toThrow(
      CollectionAlreadyExistsError,
    );
  });
});
