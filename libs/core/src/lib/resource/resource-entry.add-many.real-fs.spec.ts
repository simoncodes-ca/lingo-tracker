import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { openCollection } from '../config/open-collection';
import {
  BracedPlaceholderError,
  InvalidBaseValueError,
  InvalidResourceKeyError,
  LocaleNotFoundError,
  ResourceAlreadyExistsError,
  TranslationError,
} from '../errors/lingo-tracker-error';
import { writeJsonFile } from '../file-io/json-file-operations';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
import { calculateChecksum as md5 } from './checksum';
import { addResource, addResources } from './resource-entry';
import * as resourceFolder from './resource-folder';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from './resource-folder';
import type { ResourceMutation } from './resource-mutation';

const collected: ResourceMutation[] = [];
const onMutation = (mutation: ResourceMutation): void => {
  collected.push(mutation);
};
beforeEach(() => {
  collected.length = 0;
});

vi.mock('../file-io/json-file-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../file-io/json-file-operations')>();
  return { ...actual, writeJsonFile: vi.fn(actual.writeJsonFile) };
});

describe('addResources (real fs)', () => {
  let root: string;
  const config = (): LingoTrackerConfig => ({
    exportFolder: 'dist',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en', 'fr', 'de'],
    collections: { main: { translationsFolder: join(root, 'translations') } },
  });
  const collection = (overrides: Partial<LingoTrackerConfig> = {}) =>
    openCollection({ ...config(), ...overrides }, 'main', { cwd: root });
  const file = (folder: string, name: 'resource_entries.json' | 'tracker_meta.json') =>
    join(root, 'translations', folder, name);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'add-resources-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('preflights every base value before any batch writes or translation', async () => {
    const provider = new InMemoryTranslationProvider();
    const target = collection({ translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' } });
    for (const baseValue of ['', '   ']) {
      const items = [
        { key: 'common.ok', baseValue: 'OK' },
        { key: 'new.bad', baseValue },
      ];
      await expect(
        addResources({ ...target, onMutation: onMutation ?? target.onMutation }, items, { provider }),
      ).rejects.toThrow(InvalidBaseValueError);
      expect(existsSync(join(root, 'translations'))).toBe(false);
    }
    await addResource(collection(), { key: 'common.existing', baseValue: 'Existing' });
    const paths = ['resource_entries.json', 'tracker_meta.json'].map((name) =>
      join(root, 'translations', 'common', name),
    );
    const before = paths.map((path) => readFileSync(path));
    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'common.ok', baseValue: 'OK' },
          { key: 'new.bad', baseValue: '   ' },
        ],
        { provider },
      ),
    ).rejects.toThrow('Base value must not be empty.');
    expect(paths.map((path) => readFileSync(path))).toEqual(before);
    expect(existsSync(join(root, 'translations', 'new'))).toBe(false);
    expect(provider.calls).toEqual([]);
    expect(collected).toEqual([]);
  });

  it('rejects a braced value in a later batch item before any writes', async () => {
    await expect(
      addResources(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        [
          { key: 'common.ok', baseValue: 'OK' },
          { key: 'common.bad', baseValue: 'Bad', translations: [{ locale: 'fr', value: '{{{a}}}' }] },
        ],
        {},
      ),
    ).rejects.toThrow(BracedPlaceholderError);
    expect(existsSync(join(root, 'translations'))).toBe(false);
    expect(collected).toEqual([]);
    await addResource(collection(), { key: 'common.existing', baseValue: 'Existing' });
    const paths = ['resource_entries.json', 'tracker_meta.json'].map((name) =>
      join(root, 'translations', 'common', name),
    );
    const before = paths.map((path) => readFileSync(path));
    await expect(
      addResources(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        [
          { key: 'common.ok', baseValue: 'OK' },
          { key: 'common.bad', baseValue: '{{{a}}}' },
        ],
        {},
      ),
    ).rejects.toThrow(BracedPlaceholderError);
    expect(paths.map((path) => readFileSync(path))).toEqual(before);
    expect(collected).toEqual([]);
  });

  it('stores accepted placeholder-only case bodies and their metadata in a batch', async () => {
    const value = '{n, plural, other {{{a}}}}';
    const stored = '{n, plural, other {{a}}}';
    await addResources(collection(), [
      { key: 'common.ok', baseValue: value, translations: [{ locale: 'fr', value, status: 'verified' }] },
    ]);
    expect(JSON.parse(readFileSync(file('common', 'resource_entries.json'), 'utf8'))).toEqual({
      ok: { source: stored, fr: stored, de: stored },
    });
    expect(JSON.parse(readFileSync(file('common', 'tracker_meta.json'), 'utf8'))).toEqual({
      ok: {
        en: { checksum: md5(stored) },
        fr: { checksum: md5(stored), baseChecksum: md5(stored), status: 'verified' },
        de: { checksum: md5(stored), baseChecksum: md5(stored), status: 'new' },
      },
    });
  });
  it('validates supplied locales before existence and batch duplicate checks', async () => {
    const provider = new InMemoryTranslationProvider();
    const target = collection({ translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' } });
    const invalid = { key: 'common.ok', baseValue: 'Bad', translations: [{ locale: 'es', value: 'Mal' }] };
    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [{ key: 'common.ok', baseValue: 'First' }, invalid],
        { provider },
      ),
    ).rejects.toThrow(LocaleNotFoundError);
    expect(existsSync(join(root, 'translations'))).toBe(false);
    await addResource(collection(), { key: 'common.ok', baseValue: 'Existing' });
    const entries = readFileSync(file('common', 'resource_entries.json'));
    const meta = readFileSync(file('common', 'tracker_meta.json'));
    await expect(
      addResources({ ...target, onMutation: onMutation ?? target.onMutation }, [invalid], { provider }),
    ).rejects.toThrow(LocaleNotFoundError);
    expect(readFileSync(file('common', 'resource_entries.json'))).toEqual(entries);
    expect(readFileSync(file('common', 'tracker_meta.json'))).toEqual(meta);
    expect(provider.calls).toEqual([]);
    expect(collected).toEqual([]);
  });

  it('opens and checks the folder before refusing a duplicate batch key', async () => {
    const original = resourceFolder.openResourceFolder;
    const failure = new Error('unreadable second folder read');
    const opened = vi.spyOn(resourceFolder, 'openResourceFolder');
    opened.mockImplementationOnce(original).mockImplementationOnce(() => {
      throw failure;
    });
    try {
      await expect(
        addResources(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          [
            { key: 'common.ok', baseValue: 'First' },
            { key: 'common.ok', baseValue: 'Duplicate' },
          ],
          {},
        ),
      ).rejects.toBe(failure);
      expect(opened).toHaveBeenCalledTimes(2);
      expect(existsSync(join(root, 'translations'))).toBe(false);
      expect(collected).toEqual([]);
    } finally {
      opened.mockRestore();
    }
  });

  it('writes nothing when the third item has an invalid key, including both files of touched folders', async () => {
    const target = collection();
    await addResource(target, { key: 'existing.keep', baseValue: 'Keep' });
    const beforeEntries = readFileSync(file('existing', 'resource_entries.json'), 'utf8');
    const beforeMeta = readFileSync(file('existing', 'tracker_meta.json'), 'utf8');

    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'existing.new', baseValue: 'New' },
          { key: 'fresh.first', baseValue: 'First' },
          { key: 'invalid@key', baseValue: 'Bad' },
        ],
        {},
      ),
    ).rejects.toThrow(InvalidResourceKeyError);

    expect(readFileSync(file('existing', 'resource_entries.json'), 'utf8')).toBe(beforeEntries);
    expect(readFileSync(file('existing', 'tracker_meta.json'), 'utf8')).toBe(beforeMeta);
    expect(existsSync(file('fresh', 'resource_entries.json'))).toBe(false);
    expect(existsSync(file('fresh', 'tracker_meta.json'))).toBe(false);
  });

  it('rejects duplicate resolved keys but allows parent/child keys in a batch and on disk', async () => {
    const target = collection();
    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'ok', targetFolder: 'common', baseValue: 'OK' },
          { key: 'common.ok', baseValue: 'Again' },
        ],
        {},
      ),
    ).rejects.toThrow(ResourceAlreadyExistsError);
    expect(existsSync(join(root, 'translations'))).toBe(false);

    await addResource(target, { key: 'common.deep.item', baseValue: 'Existing child' });
    const result = await addResources(target, [
      { key: 'common', baseValue: 'Parent' },
      { key: 'common.ok', baseValue: 'Child' },
    ]);
    expect(result.entriesCreated).toBe(2);
    expect(JSON.parse(readFileSync(join(root, 'translations', 'resource_entries.json'), 'utf8')).common.source).toBe(
      'Parent',
    );
    expect(JSON.parse(readFileSync(file('common', 'resource_entries.json'), 'utf8')).ok.source).toBe('Child');
  });

  it('writes nothing when a later item has an invalid target folder', async () => {
    const target = collection();
    await addResource(target, { key: 'existing.keep', baseValue: 'Keep' });
    const beforeEntries = readFileSync(file('existing', 'resource_entries.json'), 'utf8');
    const beforeMeta = readFileSync(file('existing', 'tracker_meta.json'), 'utf8');

    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'existing.new', baseValue: 'New' },
          { key: 'fresh.first', baseValue: 'First' },
          { key: 'last', targetFolder: 'bad@folder', baseValue: 'Bad' },
        ],
        {},
      ),
    ).rejects.toThrow(InvalidResourceKeyError);

    expect(readFileSync(file('existing', 'resource_entries.json'), 'utf8')).toBe(beforeEntries);
    expect(readFileSync(file('existing', 'tracker_meta.json'), 'utf8')).toBe(beforeMeta);
    expect(existsSync(file('fresh', 'resource_entries.json'))).toBe(false);
    expect(existsSync(file('fresh', 'tracker_meta.json'))).toBe(false);
  });

  it('writes nothing when a later item supplies a locale outside the collection', async () => {
    const target = collection();
    await addResource(target, { key: 'existing.keep', baseValue: 'Keep' });
    const beforeEntries = readFileSync(file('existing', 'resource_entries.json'), 'utf8');
    const beforeMeta = readFileSync(file('existing', 'tracker_meta.json'), 'utf8');

    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'existing.new', baseValue: 'New' },
          { key: 'fresh.first', baseValue: 'First' },
          { key: 'last', baseValue: 'Bad', translations: [{ locale: 'es', value: 'Mal', status: 'translated' }] },
        ],
        {},
      ),
    ).rejects.toThrow(LocaleNotFoundError);

    expect(readFileSync(file('existing', 'resource_entries.json'), 'utf8')).toBe(beforeEntries);
    expect(readFileSync(file('existing', 'tracker_meta.json'), 'utf8')).toBe(beforeMeta);
    expect(existsSync(file('fresh', 'resource_entries.json'))).toBe(false);
    expect(existsSync(file('fresh', 'tracker_meta.json'))).toBe(false);
  });

  it('writes nothing when the translation provider fails on a later item', async () => {
    await addResource(collection(), { key: 'existing.keep', baseValue: 'Keep' });
    const beforeEntries = readFileSync(file('existing', 'resource_entries.json'), 'utf8');
    const beforeMeta = readFileSync(file('existing', 'tracker_meta.json'), 'utf8');
    const target = collection({ translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' } });
    const provider = new InMemoryTranslationProvider(({ text }) => {
      if (text === 'Fail') throw new TranslationError('provider failed', 'SERVER_ERROR', true);
      return text;
    });

    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'existing.new', baseValue: 'New' },
          { key: 'fresh.first', baseValue: 'First' },
          { key: 'fresh.last', baseValue: 'Fail' },
        ],
        { provider },
      ),
    ).rejects.toThrow(TranslationError);

    expect(readFileSync(file('existing', 'resource_entries.json'), 'utf8')).toBe(beforeEntries);
    expect(readFileSync(file('existing', 'tracker_meta.json'), 'utf8')).toBe(beforeMeta);
    expect(existsSync(file('fresh', 'resource_entries.json'))).toBe(false);
    expect(existsSync(file('fresh', 'tracker_meta.json'))).toBe(false);
  });

  it('replaces an existing exact key through the same write path as addResource', async () => {
    const target = collection();
    await addResource(target, { key: 'common.ok', baseValue: 'Old', comment: 'Old note' });

    const result = await addResources(
      { ...target, onMutation: onMutation ?? target.onMutation },
      [{ key: 'common.ok', baseValue: 'New' }],
      { onExisting: 'replace' },
    );

    expect(result.entriesCreated).toBe(0);
    expect(result.created).toBe(false);
    expect(collected).toEqual([expect.objectContaining({ kind: 'upsert', key: 'common.ok' })]);
    expect(JSON.parse(readFileSync(file('common', 'resource_entries.json'), 'utf8')).ok).toEqual({
      source: 'New',
      fr: 'New',
      de: 'New',
    });
    expect(JSON.parse(readFileSync(file('common', 'resource_entries.json'), 'utf8')).ok.comment).toBeUndefined();
    expect(JSON.parse(readFileSync(file('common', 'tracker_meta.json'), 'utf8')).ok.en.checksum).toBeDefined();
  });

  it('refuses an on-disk key before translating any item or writing either file', async () => {
    await addResource(collection(), { key: 'common.ok', baseValue: 'Old' });
    const entriesBefore = readFileSync(file('common', 'resource_entries.json'));
    const metaBefore = readFileSync(file('common', 'tracker_meta.json'));
    const target = collection({ translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' } });
    const provider = new InMemoryTranslationProvider();

    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'fresh.first', baseValue: 'First' },
          { key: 'common.ok', baseValue: 'New' },
        ],
        { provider, onExisting: 'fail' },
      ),
    ).rejects.toMatchObject({ key: 'common.ok' });

    expect(provider.calls).toEqual([]);
    expect(readFileSync(file('common', 'resource_entries.json'))).toEqual(entriesBefore);
    expect(readFileSync(file('common', 'tracker_meta.json'))).toEqual(metaBefore);
    expect(existsSync(file('fresh', 'resource_entries.json'))).toBe(false);
  });

  it('writes no batch item when a key appears during translation', async () => {
    await addResource(collection(), { key: 'stable.keep', baseValue: 'Keep' });
    const stableEntriesPath = file('stable', 'resource_entries.json');
    const stableMetaPath = file('stable', 'tracker_meta.json');
    const stableEntriesBefore = readFileSync(stableEntriesPath);
    const stableMetaBefore = readFileSync(stableMetaPath);
    const target = collection({ translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' } });
    const entriesPath = file('common', 'resource_entries.json');
    const metaPath = file('common', 'tracker_meta.json');
    let entriesAfterProvider: Buffer | undefined;
    let metaAfterProvider: Buffer | undefined;
    const provider = new InMemoryTranslationProvider(() => {
      const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      });
      folder.setEntry('ok', { source: 'Concurrent' }, {});
      folder.setBase('ok', 'Concurrent');
      folder.save();
      entriesAfterProvider = readFileSync(entriesPath);
      metaAfterProvider = readFileSync(metaPath);
      return 'Translated';
    });

    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'fresh.first', baseValue: 'First' },
          { key: 'common.ok', baseValue: 'Requested' },
        ],
        { provider, onExisting: 'fail' },
      ),
    ).rejects.toMatchObject({ key: 'common.ok' });

    expect(provider.calls.length).toBeGreaterThan(0);
    expect(existsSync(file('fresh', 'resource_entries.json'))).toBe(false);
    expect(readFileSync(entriesPath)).toEqual(entriesAfterProvider);
    expect(readFileSync(metaPath)).toEqual(metaAfterProvider);
    expect(readFileSync(stableEntriesPath)).toEqual(stableEntriesBefore);
    expect(readFileSync(stableMetaPath)).toEqual(stableMetaBefore);
  });

  it('refuses duplicate resolved keys within a batch even with replace', async () => {
    const target = collection();
    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'ok', targetFolder: 'common', baseValue: 'First' },
          { key: 'common.ok', baseValue: 'Second' },
        ],
        { onExisting: 'replace' },
      ),
    ).rejects.toThrow(ResourceAlreadyExistsError);
    expect(existsSync(join(root, 'translations'))).toBe(false);
  });

  it('keeps earlier writes when a later target folder path is an existing file', async () => {
    const target = collection();
    mkdirSync(join(root, 'translations'));
    const blockedPath = join(root, 'translations', 'blocked');
    writeFileSync(blockedPath, 'ordinary file', 'utf8');

    await expect(
      addResources(
        { ...target, onMutation: onMutation ?? target.onMutation },
        [
          { key: 'created.ok', baseValue: 'OK' },
          { key: 'later', targetFolder: 'blocked', baseValue: 'Later' },
        ],
        {},
      ),
    ).rejects.toThrow(/Creating resource folder/);

    expect(JSON.parse(readFileSync(file('created', 'resource_entries.json'), 'utf8'))).toEqual({
      ok: { source: 'OK', fr: 'OK', de: 'OK' },
    });
    expect(JSON.parse(readFileSync(file('created', 'tracker_meta.json'), 'utf8')).ok.en.checksum).toBeDefined();
    expect(readFileSync(blockedPath, 'utf8')).toBe('ordinary file');
    expect(existsSync(file('blocked', 'resource_entries.json'))).toBe(false);
    expect(existsSync(file('blocked', 'tracker_meta.json'))).toBe(false);
    expect(collected).toEqual([expect.objectContaining({ kind: 'upsert', key: 'created.ok' })]);
  });

  it('delivers a reindex when a folder save fails after its first file', async () => {
    const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
      '../file-io/json-file-operations',
    );
    const writer = vi.mocked(writeJsonFile);
    writer.mockImplementation((options) => {
      if (options.filePath.endsWith(join('second', 'tracker_meta.json'))) {
        throw new Error('second metadata write failed');
      }
      return actual.writeJsonFile(options);
    });
    try {
      await expect(
        addResources(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          [
            { key: 'first.ok', baseValue: 'OK' },
            { key: 'second.later', baseValue: 'Later' },
          ],
          {},
        ),
      ).rejects.toThrow('second metadata write failed');
    } finally {
      writer.mockImplementation(actual.writeJsonFile);
    }
    expect(collected).toEqual([
      expect.objectContaining({ kind: 'upsert', key: 'first.ok' }),
      { kind: 'reindex', translationsFolder: collection().translationsFolder },
    ]);
  });

  it('merges skipped locales and terminology and returns every mutation in input order', async () => {
    writeFileSync(
      join(root, '.lingo-tracker-preferred-terminology.json'),
      JSON.stringify([{ discouraged: 'Expenditure', preferred: 'Investment' }]),
    );
    const target = collection({
      protectedTermsFile: 'missing-terms.json',
      translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' },
    });
    const provider = new InMemoryTranslationProvider();

    const result = await addResources(
      { ...target, onMutation: onMutation ?? target.onMutation },
      [
        { key: 'budget.one', baseValue: 'Expenditure {count, plural, other {items}}' },
        { key: 'budget.two', baseValue: 'More expenditure {count, plural, other {items}}' },
      ],
      { provider },
    );

    expect(result.entriesCreated).toBe(2);
    expect(result.created).toBe(true);
    expect(result.skippedLocales).toEqual(['fr', 'de']);
    expect(result.terminology.findings.map(({ key }) => key)).toEqual(['budget.one', 'budget.two']);
    expect(result.terminology.problems).toHaveLength(1);
    expect(collected.map(({ kind }) => kind)).toEqual(['upsert', 'upsert']);
    expect(collected.map((mutation) => (mutation.kind === 'upsert' ? mutation.key : ''))).toEqual([
      'budget.one',
      'budget.two',
    ]);
  });
});
