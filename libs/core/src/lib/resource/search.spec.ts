import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCollection } from './read-collection';
import type { ResourceTreeEntry, ResourceTreeNode } from './resource-tree-types';
import { normalizeSearchRequest, type SearchableResource, searchPage, searchResources, treeResources } from './search';

const EN = { baseLocale: 'en' };

function resource(
  fullKey: string,
  source: string,
  extra: Partial<Omit<ResourceTreeEntry, 'key' | 'source'>> = {},
): SearchableResource {
  return {
    fullKey,
    entry: { key: fullKey.slice(fullKey.lastIndexOf('.') + 1), source, translations: {}, metadata: {}, ...extra },
  };
}

const keys = (results: { key: string }[]): string[] => results.map((result) => result.key);

it('applies the shared limit to direct matcher calls', () => {
  const resources = Array.from({ length: 501 }, (_, i) => resource(`key${i}`, 'value'));
  expect(searchResources(resources, EN, 'key', { limit: 1000 })).toHaveLength(500);
});

it.each([
  { query: '', mode: 'text', limit: 1, defaultLimit: 100, expected: { kind: 'blank' } },
  { query: '  ', mode: 'text', limit: 1, defaultLimit: 100, expected: { kind: 'blank' } },
  {
    query: ' Save ',
    mode: 'similar-value',
    limit: 7,
    defaultLimit: 100,
    expected: { kind: 'search', query: 'Save', mode: 'similar-value', limit: 7 },
  },
  {
    query: 'save',
    mode: 'text',
    limit: 0,
    defaultLimit: 100,
    expected: { kind: 'search', query: 'save', mode: 'text', limit: 100 },
  },
  {
    query: 'save',
    mode: 'text',
    limit: -2,
    defaultLimit: 100,
    expected: { kind: 'search', query: 'save', mode: 'text', limit: 100 },
  },
  {
    query: 'save',
    mode: 'text',
    limit: 501,
    defaultLimit: 100,
    expected: { kind: 'search', query: 'save', mode: 'text', limit: 500 },
  },
  {
    query: 'save',
    mode: 'text',
    limit: 2.5,
    defaultLimit: 100,
    expected: { kind: 'search', query: 'save', mode: 'text', limit: 100 },
  },
  {
    query: 'save',
    mode: 'text',
    limit: Number.NaN,
    defaultLimit: 100,
    expected: { kind: 'search', query: 'save', mode: 'text', limit: 100 },
  },
  {
    query: 'save',
    mode: 'text',
    limit: undefined,
    defaultLimit: 100,
    expected: { kind: 'search', query: 'save', mode: 'text', limit: 100 },
  },
  {
    query: 'save',
    mode: 'similar-value',
    limit: undefined,
    defaultLimit: 5,
    expected: { kind: 'search', query: 'save', mode: 'similar-value', limit: 5 },
  },
] as const)(
  'normalizes a search request: $query, $mode, $limit, default $defaultLimit',
  ({ query, mode, limit, defaultLimit, expected }) => {
    expect(normalizeSearchRequest({ query, mode, limit }, defaultLimit)).toEqual(expected);
  },
);

describe('searchPage', () => {
  it('reports the true total after ranking and limiting', () => {
    const resources = Array.from({ length: 501 }, (_, i) => resource(`key${i}`, 'value'));
    const page = searchPage(resources, EN, { kind: 'search', query: 'key', mode: 'text', limit: 500 });
    expect(page.results).toHaveLength(500);
    expect(page).toMatchObject({ limited: true, limit: 500, totalFound: 501 });
  });

  it('searches in similar-value mode', () => {
    const page = searchPage([resource('common.save', 'Save')], EN, {
      kind: 'search',
      query: 'Save',
      mode: 'similar-value',
      limit: 11,
    });
    expect(page.results[0]?.matchType).toBe('similar-value');
    expect(page).toMatchObject({ limited: false, totalFound: 1 });
  });

  it.each([1, 2])('returns exactly the requested page size %s', (limit) => {
    const page = searchPage([resource('key.a', 'x'), resource('key.b', 'x')], EN, {
      kind: 'search',
      query: 'key',
      mode: 'text',
      limit,
    });
    expect(page.results).toHaveLength(limit);
    expect(page.totalFound).toBe(2);
  });

  it('returns an empty page when there are no matches', () => {
    expect(searchPage([], EN, { kind: 'search', query: 'save', mode: 'text', limit: 7 })).toEqual({
      results: [],
      limited: false,
      limit: 7,
      totalFound: 0,
    });
  });
});

describe('searchResources — text mode', () => {
  describe('match types', () => {
    it('finds an exact key match, case-insensitively', () => {
      const results = searchResources([resource('buttons.ok', 'OK')], EN, 'Buttons.OK');

      expect(results).toHaveLength(1);
      expect(results[0]?.key).toBe('buttons.ok');
      expect(results[0]?.matchType).toBe('exact-key');
      expect(results[0]?.matchedLocales).toBeUndefined();
    });

    it('finds a partial key match', () => {
      const results = searchResources([resource('common.buttons.save', 'Store')], EN, 'buttons');

      expect(results[0]?.matchType).toBe('partial-key');
    });

    it('reports a key match even when a value matches too', () => {
      const results = searchResources([resource('buttons.save', 'save')], EN, 'save');

      expect(results[0]?.matchType).toBe('partial-key');
    });

    it('finds an exact value match in a translation and names the locale', () => {
      const results = searchResources(
        [resource('buttons.ok', 'OK', { translations: { es: 'Aceptar' } })],
        EN,
        'aceptar',
      );

      expect(results[0]?.matchType).toBe('exact-value');
      expect(results[0]?.matchedLocales).toEqual(['es']);
    });

    it('finds a partial value match in a translation', () => {
      const results = searchResources(
        [resource('messages.welcome', 'Welcome', { translations: { es: 'Bienvenido a la aplicación' } })],
        EN,
        'aplica',
      );

      expect(results[0]?.matchType).toBe('partial-value');
      expect(results[0]?.matchedLocales).toEqual(['es']);
    });

    it('always searches the base value, under the collection base locale', () => {
      const results = searchResources(
        [resource('greetings.hello', 'Bonjour tout le monde')],
        { baseLocale: 'fr' },
        'tout',
      );

      expect(results[0]?.matchType).toBe('partial-value');
      expect(results[0]?.matchedLocales).toEqual(['fr']);
    });

    it('lists every locale whose value matched, and prefers exact over partial', () => {
      const results = searchResources(
        [resource('a.b', 'Cancel', { translations: { es: 'cancel', fr: 'Annuler' } })],
        EN,
        'cancel',
      );

      expect(results[0]?.matchType).toBe('exact-value');
      expect(results[0]?.matchedLocales).toEqual(['en', 'es']);
    });

    it('returns no results when nothing matches', () => {
      expect(searchResources([resource('buttons.ok', 'OK', { translations: { es: 'Aceptar' } })], EN, 'zzz')).toEqual(
        [],
      );
    });

    it.each(['', '   '])('returns no results for the blank query %j', (query) => {
      expect(searchResources([resource('buttons.ok', 'OK')], EN, query)).toEqual([]);
    });

    it('trims the query', () => {
      expect(keys(searchResources([resource('buttons.ok', 'OK')], EN, '  buttons.ok  '))).toEqual(['buttons.ok']);
    });
  });

  describe('result', () => {
    it('carries the entry: base value, translations, metadata, comment and tags', () => {
      const metadata = { es: { checksum: 'b', baseChecksum: 'a', status: 'verified' as const } };
      const results = searchResources(
        [
          resource('buttons.cancel', 'Cancel', {
            translations: { es: 'Cancelar' },
            metadata,
            comment: 'Used in dialogs',
            tags: ['dialog'],
          }),
        ],
        EN,
        'cancel',
      );

      expect(results[0]).toEqual({
        key: 'buttons.cancel',
        source: 'Cancel',
        translations: { es: 'Cancelar' },
        metadata,
        matchType: 'partial-key',
        comment: 'Used in dialogs',
        tags: ['dialog'],
      });
    });

    it('copies the translations, so a caller cannot change the source entry', () => {
      const stored = resource('buttons.ok', 'OK', { translations: { es: 'Aceptar' } });
      const [result] = searchResources([stored], EN, 'ok');

      expect(result).toBeDefined();
      if (result) result.translations['es'] = 'changed';
      expect(stored.entry.translations['es']).toBe('Aceptar');
    });
  });

  describe('ranking and limit', () => {
    const mixed = [
      resource('z.partialValue', 'Press save to continue'),
      resource('m.save.button', 'Store'),
      resource('b.exactValue', 'Save'),
      resource('save', 'Store it'),
      resource('a.partialValue', 'Autosave'),
    ];

    it('ranks exact-key, exact-value, partial-key, partial-value, then by key', () => {
      const results = searchResources(mixed, EN, 'save');

      expect(results.map((result) => [result.key, result.matchType])).toEqual([
        ['save', 'exact-key'],
        ['b.exactValue', 'exact-value'],
        ['m.save.button', 'partial-key'],
        ['a.partialValue', 'partial-value'],
        ['z.partialValue', 'partial-value'],
      ]);
    });

    it('ranks every match before it applies the limit', () => {
      // The exact-key match is read last, behind more partial matches than the limit.
      const partials = Array.from({ length: 10 }, (_, i) => resource(`noise.item${i}`, `Save item ${i}`));

      const results = searchResources([...partials, resource('save', 'Store it')], EN, 'save', { limit: 3 });

      expect(keys(results)).toEqual(['save', 'noise.item0', 'noise.item1']);
    });

    it.each([0, -2, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('reads the limit %s as 100', (limit) => {
      const many = Array.from({ length: 150 }, (_, i) => resource(`key.item${i}`, 'value'));

      expect(searchResources(many, EN, 'item', { limit })).toHaveLength(100);
    });

    it('returns at most 100 results by default', () => {
      const many = Array.from({ length: 150 }, (_, i) => resource(`key.item${i}`, 'value'));

      expect(searchResources(many, EN, 'item')).toHaveLength(100);
    });
  });
});

describe('treeResources', () => {
  const entry = (key: string, source: string): ResourceTreeEntry => ({ key, source, translations: {}, metadata: {} });

  const tree: ResourceTreeNode = {
    folderPathSegments: [],
    resources: [entry('rootKey', 'Root')],
    children: [
      {
        name: 'buttons',
        fullPathSegments: ['buttons'],
        loaded: true,
        tree: {
          folderPathSegments: ['buttons'],
          resources: [entry('ok', 'OK')],
          children: [
            {
              name: 'icons',
              fullPathSegments: ['buttons', 'icons'],
              loaded: true,
              tree: { folderPathSegments: ['buttons', 'icons'], resources: [entry('close', 'Close')], children: [] },
            },
          ],
        },
      },
      { name: 'lazy', fullPathSegments: ['lazy'], loaded: false },
    ],
  };

  it('yields every resource of the loaded folders with its full key', () => {
    expect([...treeResources(tree)].map((resource) => resource.fullKey)).toEqual([
      'rootKey',
      'buttons.ok',
      'buttons.icons.close',
    ]);
  });

  it('skips a child that is not loaded, even when it carries a tree', () => {
    const withStaleChild: ResourceTreeNode = {
      folderPathSegments: [],
      resources: [],
      children: [
        {
          name: 'stale',
          fullPathSegments: ['stale'],
          loaded: false,
          tree: { folderPathSegments: ['stale'], resources: [entry('hidden', 'Hidden')], children: [] },
        },
      ],
    };

    expect([...treeResources(withStaleChild)]).toEqual([]);
  });

  it('keys a subtree from its own folder path', () => {
    const subtree = tree.children[0]?.tree;
    expect(subtree).toBeDefined();

    expect([...treeResources(subtree ?? tree)].map((resource) => resource.fullKey)).toEqual([
      'buttons.ok',
      'buttons.icons.close',
    ]);
  });

  it('is a search source like any other', () => {
    expect(keys(searchResources(treeResources(tree), EN, 'close'))).toEqual(['buttons.icons.close']);
  });
});

describe('searchResources — similar-value mode', () => {
  const similar = (resources: SearchableResource[], query: string, limit?: number) =>
    searchResources(resources, EN, query, { mode: 'similar-value', limit });

  it('scores an identical base value 1, as a similar-value match in the base locale', () => {
    const results = similar([resource('common.ok', 'OK')], 'OK');

    expect(results).toHaveLength(1);
    expect(results[0]?.matchType).toBe('similar-value');
    expect(results[0]?.similarity).toBe(1);
    expect(results[0]?.matchedLocales).toEqual(['en']);
  });

  it('folds case and trims both texts', () => {
    expect(similar([resource('labels.greeting', ' Hello World ')], '  hello world')[0]?.similarity).toBe(1);
  });

  it('keeps a Levenshtein score exactly on the 0.8 threshold', () => {
    expect(similar([resource('btn.save', 'saved')], 'save')[0]?.similarity).toBeCloseTo(0.8);
  });

  it('drops a value below the threshold that neither text contains', () => {
    expect(similar([resource('labels.risk', 'delete risk')], 'remove risk')).toEqual([]);
  });

  it('keeps a value that contains the query as whole words, scored shorter / longer', () => {
    const results = similar([resource('btn.saveDraft', 'Save draft')], 'Save');

    expect(results[0]?.similarity).toBeCloseTo(0.4);
  });

  it('keeps a value that the query contains as whole words', () => {
    const results = similar([resource('common.actions.save', 'Save')], 'Save draft');

    expect(results[0]?.similarity).toBeCloseTo(0.4);
  });

  it('does not count a word fragment as containment', () => {
    expect(similar([resource('errors.lost', 'Connection lost')], 'connect')).toEqual([]);
    expect(similar([resource('common.no', 'No')], 'Cannot')).toEqual([]);
  });

  it('counts an apostrophe as part of a word', () => {
    const results = similar([resource('dialogs.dontSave', "Don't save"), resource('errors.cant', 'can’t')], 'don');

    expect(results).toEqual([]);
    expect(similar([resource('errors.cant', 'I can’t')], 'can')).toEqual([]);
  });

  it('keeps a containment match scored exactly at the 0.4 floor', () => {
    expect(similar([resource('btn.saveDraft', 'Save draft')], 'save')[0]?.similarity).toBeCloseTo(0.4);
  });

  it('drops a short value inside a long typed sentence', () => {
    // "delete" is a word of the query, but 6 / 25 = 0.24 is below the containment floor.
    expect(similar([resource('common.delete', 'Delete')], 'Delete the selected file?')).toEqual([]);
  });

  it('drops a long stored sentence around a short query', () => {
    // 4 / 50 = 0.08.
    const sentence = 'Save your work often so that nothing is ever lost.';
    expect(sentence).toHaveLength(50);

    expect(similar([resource('help.saveOften', sentence)], 'Save')).toEqual([]);
  });

  it('compares the base value only, not the key or the translations', () => {
    const results = similar([resource('buttons.save', 'Store', { translations: { fr: 'save' } })], 'save');

    expect(results).toEqual([]);
  });

  it('never matches an empty base value', () => {
    expect(similar([resource('x.empty', '')], 'a')).toEqual([]);
  });

  it('ranks by similarity, highest first', () => {
    const results = similar(
      [resource('a.contains', 'Save draft'), resource('b.near', 'saved'), resource('c.exact', 'save')],
      'save',
    );

    expect(keys(results)).toEqual(['c.exact', 'b.near', 'a.contains']);
  });

  it('breaks a tie in favour of a key that contains the query, then by key', () => {
    const results = similar(
      [
        resource('dialogs.secondary', 'Connect'),
        resource('b.other', 'Connect'),
        resource('common.button.connect', 'Connect'),
      ],
      'connect',
    );

    expect(keys(results)).toEqual(['common.button.connect', 'b.other', 'dialogs.secondary']);
  });

  it('ranks every match before it applies the limit', () => {
    const weaker = Array.from({ length: 10 }, (_, i) => resource(`noise.item${i}`, `Cancel ${i}`));

    const results = similar([...weaker, resource('zz.dismiss', 'Cancel')], 'Cancel', 2);

    expect(keys(results)).toEqual(['zz.dismiss', 'noise.item0']);
  });

  it('returns no results for a blank query', () => {
    expect(similar([resource('x.empty', '')], '   ')).toEqual([]);
  });
});

describe('searchResources over the Collection Reader', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'lingo-search-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it.each([
    ['text', 'broken', ['broken.noSource', 'broken.numberSource', 'broken.save']],
    ['similar-value', 'save', ['broken.save']],
  ] as const)('does not fail on a hand-edited entry without a string source (%s mode)', (mode, query, expected) => {
    mkdirSync(join(testDir, 'broken'), { recursive: true });
    writeFileSync(
      join(testDir, 'broken', 'resource_entries.json'),
      JSON.stringify({ noSource: { es: 'Hola' }, numberSource: { source: 5 }, save: { source: 'Save' } }),
    );
    const collection = {
      name: 'main',
      translationsFolder: testDir,
      baseLocale: 'en',
      tags: [],
      runtime: 'transloco-messageformat' as const,
    };

    const results = searchResources(readCollection(collection).resources, collection, query, { mode });

    expect(keys(results)).toEqual(expected);
    expect(results.every((result) => typeof result.source === 'string')).toBe(true);
  });

  it('gives an entry without a string source the base value ""', () => {
    mkdirSync(join(testDir, 'broken'), { recursive: true });
    writeFileSync(join(testDir, 'broken', 'resource_entries.json'), JSON.stringify({ hola: { es: 'Bienvenido' } }));
    const collection = {
      name: 'main',
      translationsFolder: testDir,
      baseLocale: 'en',
      tags: [],
      runtime: 'transloco-messageformat' as const,
    };

    const results = searchResources(readCollection(collection).resources, collection, 'hola');

    expect(results.map((result) => [result.key, result.source, result.matchType])).toEqual([
      ['broken.hola', '', 'partial-key'],
    ]);
    expect(searchResources(readCollection(collection).resources, collection, 'bienVENIDO')[0]?.matchedLocales).toEqual([
      'es',
    ]);
  });

  it('searches what the reader read and leaves its problems to the caller', () => {
    mkdirSync(join(testDir, 'good'), { recursive: true });
    writeFileSync(
      join(testDir, 'good', 'resource_entries.json'),
      JSON.stringify({ save: { source: 'Save', es: 'Guardar' } }),
    );
    mkdirSync(join(testDir, 'bad'), { recursive: true });
    writeFileSync(join(testDir, 'bad', 'resource_entries.json'), '{ nope');
    const collection = {
      name: 'main',
      translationsFolder: testDir,
      baseLocale: 'en',
      tags: [],
      runtime: 'transloco-messageformat' as const,
    };

    const { resources, problems } = readCollection(collection);
    const results = searchResources(resources, collection, 'guardar');

    expect(problems).toHaveLength(1);
    expect(results.map((result) => [result.key, result.matchType, result.metadata])).toEqual([
      ['good.save', 'exact-value', {}],
    ]);
  });
});
