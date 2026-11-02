import type { FolderNodeDto, ResourceSummaryDto, TranslationStatus } from '@simoncodes-ca/data-transfer';
import { describe, expect, it } from 'vitest';
import {
  absorbDottedKey,
  addTag,
  CONTEXT_TREE_ENTRY_LIMIT,
  type ContextTreeInput,
  collisionFor,
  contextTree,
  editedLocales,
  folderEntryKeys,
  hasUnsavedChanges,
  type KeyAbsorption,
  type KnownEntries,
  type LocaleDraft,
  type ResourceEntryDraft,
  removeTag,
  toCreateDto,
  toUpdateDto,
  unrenderableWrites,
} from './resource-entry-draft';

const entry = (fullKey: string): ResourceSummaryDto => {
  const segments = fullKey.split('.');
  const entryKey = segments.pop() ?? '';
  return {
    fullKey,
    folderPath: segments.join('.'),
    entryKey,
    base: { locale: 'en', value: entryKey },
    targets: [],
    tags: [],
    inheritedTags: [],
  };
};

const folder = (fullPath: string, tree?: FolderNodeDto['tree']): FolderNodeDto => ({
  name: fullPath.split('.').at(-1) ?? fullPath,
  fullPath,
  loaded: tree !== undefined,
  tree,
});

const known = (overrides: Partial<KnownEntries> = {}): KnownEntries => ({
  rootFolders: [],
  browserFolderPath: '',
  browserEntries: [],
  fetched: new Map(),
  ...overrides,
});

const draft = (overrides: Partial<ResourceEntryDraft> = {}): ResourceEntryDraft => ({
  key: 'ok',
  folderPath: 'common.buttons',
  baseValue: 'OK',
  comment: 'The affirmative button',
  tags: [],
  translations: [
    { locale: 'fr', value: '', status: 'new' },
    { locale: 'de', value: '', status: 'new' },
  ],
  ...overrides,
});

describe('absorbDottedKey', () => {
  it.each<[string, string, string, string | null, KeyAbsorption | null]>([
    ['a key without dots', 'ok', 'common.buttons', null, null],
    [
      'a pasted full key',
      'apps.common.buttons.ok',
      'common.buttons',
      null,
      { leaf: 'ok', folder: 'apps.common.buttons' },
    ],
    ['a folder typed with its trailing dot', 'apps.', 'common.buttons', null, { leaf: '', folder: 'apps' }],
    ['consecutive dots', 'apps..common...ok', 'common.buttons', null, null],
    ['a leading dot', '.ok', 'common.buttons', null, null],
    ['a lone dot', '.', 'common.buttons', null, null],
    [
      'a prefix pasted before an existing leaf',
      'apps.common.ok',
      'common.buttons',
      null,
      { leaf: 'ok', folder: 'apps.common' },
    ],
    ['an invalid folder segment', 'apps.bad key.ok', 'common.buttons', null, null],
    [
      'an invalid leaf, left for the validator',
      'apps.bad key',
      'common.buttons',
      null,
      { leaf: 'bad key', folder: 'apps' },
    ],
  ])('%s', (_case, rawKey, currentFolder, folderFromKey, expected) => {
    expect(absorbDottedKey(rawKey, currentFolder, folderFromKey)).toEqual(expected);
  });

  describe('continuation rule', () => {
    it('should extend the folder the last absorption produced', () => {
      expect(absorbDottedKey('common.', 'apps', 'apps')).toEqual({ leaf: '', folder: 'apps.common' });
    });

    it('should re-anchor once the user has picked a different folder', () => {
      expect(absorbDottedKey('other.ok', 'picked.folder', 'apps')).toEqual({ leaf: 'ok', folder: 'other' });
    });

    it('should re-anchor when nothing was absorbed before', () => {
      expect(absorbDottedKey('apps.ok', 'apps', null)).toEqual({ leaf: 'ok', folder: 'apps' });
    });
  });
});

describe('folderEntryKeys', () => {
  it('should know nothing about a folder no source has loaded', () => {
    expect(folderEntryKeys('common.errors', known())).toBeUndefined();
  });

  it('should leave out the nested resources a folder listing folds in', () => {
    const keys = folderEntryKeys(
      'common',
      known({ browserFolderPath: 'common', browserEntries: [entry('common.ok'), entry('common.dialog.title')] }),
    );
    expect(keys && [...keys]).toEqual(['ok']);
  });

  it('should prefer the expanded tree over the browser list', () => {
    const keys = folderEntryKeys(
      'common',
      known({
        rootFolders: [folder('common', { path: 'common', resources: [entry('common.fromTree')], children: [] })],
        browserFolderPath: 'common',
        browserEntries: [entry('common.fromList')],
      }),
    );
    expect(keys && [...keys]).toEqual(['fromTree']);
  });
});

describe('collisionFor', () => {
  const tree = [
    folder('common', {
      path: 'common',
      resources: [],
      children: [
        folder('common.buttons', { path: 'common.buttons', resources: [entry('common.buttons.save')], children: [] }),
      ],
    }),
  ];
  const listing = (path: string, ...keys: string[]): KnownEntries =>
    known({ browserFolderPath: path, browserEntries: keys.map((key) => entry(path ? `${path}.${key}` : key)) });
  const buttons = listing('common.buttons', 'ok');

  it.each<[string, string, string, KnownEntries, string | undefined, boolean]>([
    ['an empty key', '', 'common.buttons', buttons, undefined, false],
    ['a blank key', '   ', 'common.buttons', buttons, undefined, false],
    [
      'source 1: an expanded folder in the tree',
      'save',
      'common.buttons',
      known({ rootFolders: tree }),
      undefined,
      true,
    ],
    ['source 2: the folder the browser shows', 'ok', 'common.buttons', buttons, undefined, true],
    ['source 2 at the collection root', 'ok', '', listing('', 'ok'), undefined, true],
    [
      'source 3: a folder the editor fetched',
      'x',
      'common.errors',
      known({ fetched: new Map([['common.errors', ['x']]]) }),
      undefined,
      true,
    ],
    ['a folder no source knows yet', 'ok', 'common.errors', buttons, undefined, false],
    [
      'a nested resource sharing the first segment',
      'confirm',
      'common.buttons',
      listing('common.buttons', 'confirm.title'),
      undefined,
      false,
    ],
    ['a key differing only by case', 'OK', 'common.buttons', buttons, undefined, false],
    ['a key with surrounding spaces', ' ok ', 'common.buttons', buttons, undefined, true],
    ['the entry being edited', 'ok', 'common.buttons', buttons, 'ok', false],
  ])('%s', (_case, key, folderPath, knownEntries, ownKey, expected) => {
    expect(collisionFor(key, folderPath, knownEntries, ownKey)).toBe(expected);
  });
});

describe('contextTree', () => {
  const moreLabel = (hidden: number): string => `+${hidden} more`;
  const input = (overrides: Partial<ContextTreeInput> = {}): ContextTreeInput => ({
    folderPath: 'common.buttons',
    key: '',
    known: known(),
    loadingFolders: new Set(),
    ...overrides,
  });
  const entryNames = (nodes: ReturnType<typeof contextTree>): string[] =>
    nodes.filter((node) => node.kind === 'entry').map((node) => node.name);

  const siblingsTree = [
    folder('common', {
      path: 'common',
      resources: [],
      children: [folder('common.buttons'), folder('common.errors')],
    }),
  ];

  describe('shape', () => {
    it('should list the root folders, then the root entries, for the collection root', () => {
      const nodes = contextTree(
        input({
          folderPath: '',
          key: 'ok',
          known: known({
            rootFolders: [folder('common'), folder('errors')],
            browserFolderPath: '',
            browserEntries: [entry('cancel')],
          }),
        }),
        moreLabel,
      );

      expect(nodes.map((node) => [node.kind, node.name, node.depth])).toEqual([
        ['folder', 'common', 0],
        ['folder', 'errors', 0],
        ['entry', 'cancel', 0],
        ['entry', 'ok', 0],
      ]);
    });

    it('should show the target among its siblings under their expanded parent', () => {
      const nodes = contextTree(input({ key: 'ok', known: known({ rootFolders: siblingsTree }) }), moreLabel);

      expect(
        nodes.map((node) => [node.kind, node.path, node.depth, node.here ?? false, node.expanded ?? false]),
      ).toEqual([
        ['folder', 'common', 0, false, true],
        ['folder', 'common.buttons', 1, true, true],
        ['entry', 'common.buttons.ok', 2, false, false],
        ['folder', 'common.errors', 1, false, false],
      ]);
    });

    it('should still place a target folder the tree does not hold yet', () => {
      const nodes = contextTree(
        input({ folderPath: 'common.fresh', key: 'ok', known: known({ rootFolders: siblingsTree }) }),
        moreLabel,
      );

      const target = nodes.find((node) => node.here);
      expect(target).toMatchObject({ kind: 'folder', name: 'fresh', path: 'common.fresh', depth: 1, expanded: true });
      expect(nodes.at(-1)).toMatchObject({ kind: 'entry', name: 'ok', depth: 2, mark: 'new' });
    });

    it('should show a folder still loading as a folder and nothing more', () => {
      const nodes = contextTree(input({ key: 'ok', loadingFolders: new Set(['common.buttons']) }), moreLabel);

      expect(entryNames(nodes)).toEqual([]);
      expect(nodes.some((node) => node.here)).toBe(true);
    });

    it('should leave nested resources out of the folder row', () => {
      const nodes = contextTree(
        input({
          known: known({
            browserFolderPath: 'common.buttons',
            browserEntries: [entry('common.buttons.ok'), entry('common.buttons.confirm.dialog.title')],
          }),
        }),
        moreLabel,
      );

      expect(entryNames(nodes)).toEqual(['ok']);
    });
  });

  describe('marks', () => {
    const holdingOk = known({
      browserFolderPath: 'common.buttons',
      browserEntries: [entry('common.buttons.ok'), entry('common.buttons.cancel')],
    });

    it.each<[string, Partial<ContextTreeInput>, 'new' | 'exists' | 'editing' | undefined]>([
      ['a free key is new', { key: 'save', known: holdingOk }, 'new'],
      ['a taken key exists', { key: 'ok', known: holdingOk }, 'exists'],
      ['the entry being edited is editing', { key: 'ok', known: holdingOk, ownKey: 'ok' }, 'editing'],
    ])('%s', (_case, overrides, mark) => {
      const nodes = contextTree(input(overrides), moreLabel);
      const written = nodes.find((node) => node.kind === 'entry' && node.name === overrides.key);
      expect(written?.mark).toBe(mark);
    });

    it('should mark nothing before a key is typed', () => {
      const nodes = contextTree(input({ known: holdingOk }), moreLabel);
      expect(nodes.filter((node) => node.mark !== undefined)).toEqual([]);
    });
  });

  describe(`the ${CONTEXT_TREE_ENTRY_LIMIT}-entry window`, () => {
    // k01 … k20, already sorted.
    const twenty = Array.from({ length: 20 }, (_, i) => entry(`common.buttons.k${String(i + 1).padStart(2, '0')}`));
    const full = known({ browserFolderPath: 'common.buttons', browserEntries: twenty });
    const range = (from: number, to: number): string[] =>
      Array.from({ length: to - from + 1 }, (_, i) => `k${String(from + i).padStart(2, '0')}`);

    it.each<[string, string, string[], number]>([
      ['no key: the first entries', '', range(1, 8), 12],
      ['a key sorting first: anchored at the start', 'a', ['a', ...range(1, 7)], 13],
      ['an existing key in the middle: centred on it', 'k10', range(6, 13), 12],
      ['a new key in the middle: centred on where it lands', 'k10a', [...range(7, 10), 'k10a', ...range(11, 13)], 13],
      ['a key sorting last: anchored at the end', 'z', [...range(14, 20), 'z'], 13],
    ])('%s', (_case, key, shown, hidden) => {
      const nodes = contextTree(input({ key, known: full }), moreLabel);

      expect(entryNames(nodes)).toEqual(shown);
      expect(nodes.at(-1)).toEqual({
        kind: 'more',
        name: `+${hidden} more`,
        path: 'common.buttons::more',
        depth: 2,
      });
    });

    it('should list a folder that fits the window without a count', () => {
      const nodes = contextTree(
        input({ key: 'ok', known: known({ browserFolderPath: 'common.buttons', browserEntries: twenty.slice(0, 7) }) }),
        moreLabel,
      );

      expect(entryNames(nodes)).toHaveLength(CONTEXT_TREE_ENTRY_LIMIT);
      expect(nodes.some((node) => node.kind === 'more')).toBe(false);
    });
  });
});

describe('tags', () => {
  it('should add a tag in normalized form', () => {
    expect(addTag(['browser'], '  New Tag ')).toEqual(['browser', 'new-tag']);
  });

  it.each([
    ['a tag already present', 'Browser'],
    ['input that normalizes to nothing', ' !! '],
  ])('should return the same list for %s', (_case, raw) => {
    const tags = ['browser'];
    expect(addTag(tags, raw)).toBe(tags);
  });

  it('should remove an own tag', () => {
    expect(removeTag(['browser', 'dialog'], 'browser', [])).toEqual(['dialog']);
  });

  it('should keep a tag the folder passes down', () => {
    const tags = ['browser'];
    expect(removeTag(tags, 'browser', ['browser'])).toBe(tags);
  });
});

describe('toCreateDto', () => {
  it('should resolve the full key and send only the translations that have a value, all as new', () => {
    const dto = toCreateDto(
      draft({
        translations: [
          { locale: 'fr', value: 'Valeur', status: 'translated' },
          { locale: 'de', value: '   ', status: 'verified' },
        ],
        tags: ['browser'],
      }),
    );

    expect(dto).toEqual({
      key: 'common.buttons.ok',
      baseValue: 'OK',
      comment: 'The affirmative button',
      tags: ['browser'],
      translations: [{ locale: 'fr', value: 'Valeur', status: 'new' }],
    });
  });

  it.each<[string, Partial<ResourceEntryDraft>, Record<string, unknown>]>([
    ['a root-level entry keeps its bare key', { folderPath: '' }, { key: 'ok' }],
    ['a blank comment is omitted', { comment: '   ' }, { comment: undefined }],
    ['a comment is trimmed', { comment: '  Why  ' }, { comment: 'Why' }],
    ['no tags are omitted', { tags: [] }, { tags: undefined }],
    ['no filled translations are omitted', {}, { translations: undefined }],
  ])('%s', (_case, overrides, expected) => {
    expect(toCreateDto(draft(overrides))).toMatchObject(expected);
  });
});

describe('toUpdateDto and editedLocales', () => {
  const original: ResourceSummaryDto = {
    fullKey: 'common.buttons.ok',
    folderPath: 'common.buttons',
    entryKey: 'ok',
    base: { locale: 'en', value: 'OK' },
    targets: [
      { locale: 'fr', value: 'Oui', status: 'translated', needsWork: false, sameAsBase: false },
      { locale: 'de', value: 'Ja', status: 'verified', needsWork: false, sameAsBase: false },
    ],
    tags: [],
    inheritedTags: [],
  };

  const locales = (fr: [string, TranslationStatus], de: [string, TranslationStatus]): LocaleDraft[] => [
    { locale: 'fr', value: fr[0], status: fr[1] },
    { locale: 'de', value: de[0], status: de[1] },
  ];
  /** The locales exactly as the original holds them, minus the values: nothing edited. */
  const untouched = locales(['', 'translated'], ['', 'verified']);

  it.each<[string, LocaleDraft[], Record<string, { value: string; status: string }> | undefined]>([
    ['an unchanged locale with a value is left alone', locales(['Oui', 'translated'], ['', 'verified']), undefined],
    [
      'a status-only change is written even without a value',
      locales(['', 'stale'], ['', 'verified']),
      { fr: { value: '', status: 'stale' } },
    ],
    [
      'an emptied locale with its status untouched is left alone',
      locales(['', 'translated'], ['', 'verified']),
      undefined,
    ],
    ['a locale with no original status counts from new', [{ locale: 'es', value: '', status: 'new' }], undefined],
    [
      'every edited locale is written',
      locales(['Oui!', 'verified'], ['Ja!', 'verified']),
      { fr: { value: 'Oui!', status: 'verified' }, de: { value: 'Ja!', status: 'verified' } },
    ],
  ])('%s', (_case, translations, expected) => {
    const edited = draft({ translations });

    expect(toUpdateDto(edited, original).locales).toEqual(expected);
    expect(editedLocales(edited, original).map((t) => t.locale)).toEqual(Object.keys(expected ?? {}));
  });

  it('should omit untouched translations when only the base value changes', () => {
    const edited = draft({ baseValue: 'Proceed', translations: locales(['Oui', 'translated'], ['Ja', 'verified']) });

    expect(editedLocales(edited, original)).toEqual([]);
    expect(toUpdateDto(edited, original)).not.toHaveProperty('locales');
  });

  it('should send a changed translation value with its draft status', () => {
    const edited = draft({ translations: locales(['Oui!', 'translated'], ['Ja', 'verified']) });

    expect(toUpdateDto(edited, original).locales).toEqual({ fr: { value: 'Oui!', status: 'translated' } });
  });

  it('editing the value of a verified translation keeps verified', () => {
    const edited = draft({ translations: locales(['Oui', 'translated'], ['Ja!', 'verified']) });

    expect(toUpdateDto(edited, original).locales).toEqual({ de: { value: 'Ja!', status: 'verified' } });
  });

  it('should send an explicit status when it moves without a value change', () => {
    const edited = draft({ translations: locales(['Oui', 'verified'], ['Ja', 'verified']) });

    expect(toUpdateDto(edited, original).locales).toEqual({ fr: { value: 'Oui', status: 'verified' } });
  });

  it('should name the entry by its original full key and always send the tags', () => {
    const dto = toUpdateDto(draft({ comment: '  Why  ', translations: untouched }), original);

    expect(dto).toEqual({ key: 'common.buttons.ok', baseValue: 'OK', comment: 'Why', tags: [] });
    expect('moveTo' in dto).toBe(false);
  });

  it('should keep a root-level entry on its bare key', () => {
    expect(toUpdateDto(draft({ folderPath: '' }), entry('ok')).key).toBe('ok');
  });

  it('should send a move to another folder as moveTo, with the full original key', () => {
    const dto = toUpdateDto(draft({ folderPath: 'common.dialogs' }), original);

    expect(dto.key).toBe('common.buttons.ok');
    expect(dto.moveTo).toBe('common.dialogs');
  });

  it('should send a move to the collection root as an empty moveTo', () => {
    expect(toUpdateDto(draft({ folderPath: '' }), original).moveTo).toBe('');
  });

  it('should send a move out of the collection root', () => {
    const dto = toUpdateDto(draft({ folderPath: 'common' }), entry('ok'));

    expect(dto.key).toBe('ok');
    expect(dto.moveTo).toBe('common');
  });
});

describe('hasUnsavedChanges', () => {
  const initial = draft({ tags: ['browser', 'dialog'] });

  it.each<[string, Partial<ResourceEntryDraft>, boolean, boolean]>([
    ['nothing touched', {}, false, false],
    ['a field edited, even back to its value', {}, true, true],
    ['the folder moved', { folderPath: 'common.dialogs' }, false, true],
    ['a tag added', { tags: ['browser', 'dialog', 'footer'] }, false, true],
    ['a tag removed', { tags: ['browser'] }, false, true],
    ['the same tags in a new list', { tags: ['browser', 'dialog'] }, false, false],
    ['the tags reordered', { tags: ['dialog', 'browser'] }, false, true],
  ])('%s', (_case, overrides, fieldsEdited, expected) => {
    const current = draft({ tags: ['browser', 'dialog'], ...overrides });
    expect(hasUnsavedChanges(current, initial, fieldsEdited)).toBe(expected);
  });
});

describe('unrenderableWrites', () => {
  const plural = '{n, plural, one {# a} other {# b}}';
  const select = '{g, select, m {He} other {They}}';
  const draft = (overrides: Partial<ResourceEntryDraft>): ResourceEntryDraft => ({
    key: 'ok',
    folderPath: 'common',
    baseValue: 'OK',
    comment: '',
    tags: [],
    translations: [],
    ...overrides,
  });
  const original: ResourceSummaryDto = {
    fullKey: 'common.ok',
    folderPath: 'common',
    entryKey: 'ok',
    base: { locale: 'en', value: plural },
    targets: [{ locale: 'fr', value: select, status: 'translated', needsWork: false, sameAsBase: false }],
    tags: [],
    inheritedTags: [],
  };

  it('on create flags the base value and every non-empty translation, base first', () => {
    const result = unrenderableWrites(
      draft({
        baseValue: plural,
        translations: [
          { locale: 'fr', value: select, status: 'new' },
          { locale: 'de', value: '   ', status: 'new' },
          { locale: 'es', value: 'Hola', status: 'new' },
        ],
      }),
      undefined,
      'en',
      'transloco',
    );
    expect(result).toEqual([
      { locale: 'en', value: plural, kinds: ['plural'] },
      { locale: 'fr', value: select, kinds: ['select'] },
    ]);
  });

  it('detects constructs behind Transloco interpolation', () => {
    const mixed = 'Hello {{name}}: {n, number}';
    expect(unrenderableWrites(draft({ baseValue: mixed }), undefined, 'en', 'transloco')).toEqual([
      { locale: 'en', value: mixed, kinds: ['number'] },
    ]);
  });

  it('on edit ignores an unchanged base value and an unchanged locale', () => {
    const unchanged = draft({
      baseValue: plural,
      translations: [{ locale: 'fr', value: select, status: 'translated' }],
    });
    expect(unrenderableWrites(unchanged, original, 'en', 'transloco')).toEqual([]);
  });

  it('on edit flags a changed base value and an edited locale', () => {
    const edited = draft({
      baseValue: `${plural} `,
      translations: [{ locale: 'fr', value: `${select} `, status: 'translated' }],
    });
    expect(unrenderableWrites(edited, original, 'en', 'transloco')).toEqual([
      { locale: 'en', value: `${plural} `, kinds: ['plural'] },
      { locale: 'fr', value: `${select} `, kinds: ['select'] },
    ]);
  });

  it('on edit does not flag a status-only change to an unrenderable locale that is otherwise unchanged', () => {
    const statusOnly = draft({
      baseValue: plural,
      translations: [{ locale: 'fr', value: '', status: 'stale' }],
    });
    expect(unrenderableWrites(statusOnly, original, 'en', 'transloco')).toEqual([]);
  });

  it('flags nothing under transloco-messageformat', () => {
    expect(unrenderableWrites(draft({ baseValue: plural }), undefined, 'en', 'transloco-messageformat')).toEqual([]);
  });
});
