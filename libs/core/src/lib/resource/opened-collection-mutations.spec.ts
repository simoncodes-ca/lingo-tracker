import * as fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeCollection } from '../../collections-manager/collection-change';
import { CONFIG_FILENAME } from '../../constants';
import {
  addCollection,
  addLocaleToCollection,
  addResource,
  addResources,
  createFolder,
  deleteCollection,
  deleteFolder,
  deleteResource,
  editResource,
  executeMove,
  executeMoves,
  normalizeCollections,
  type OpenedCollection,
  openCollection,
  prepareTranslationRun,
  type ResourceMutation,
  removeLocaleFromCollection,
  runImport,
  translateExistingResource,
  updateCollection,
} from '../../index';
import { seedResources, useTempDir } from '../../testing/temp-dir.spec-helpers';
import * as json from '../file-io/json-file-operations';
import { importResources } from '../import/import-resources';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
import { normalize } from '../normalize/normalize';
import { pruneEmptyFolders } from './folder-pruning';
import { removeEntry } from './resource-entry';
import { openResourceFolder, openUnreportedResourceFolder } from './resource-folder';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(actual.writeFileSync),
    mkdirSync: vi.fn(actual.mkdirSync),
    rmSync: vi.fn(actual.rmSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  };
});
vi.mock('../file-io/json-file-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../file-io/json-file-operations')>();
  return { ...actual, writeJsonFile: vi.fn(actual.writeJsonFile) };
});

type Write = {
  readonly name: string;
  readonly failure?: 'unlink' | 'mkdir' | 'rm' | 'prune' | 'config' | 'terms';
  readonly kinds?: readonly ResourceMutation['kind'][];
  /** Legacy import/normalize and failed pruning intentionally do not notify consumers. */
  readonly silentFailure?: boolean;
  readonly crossCollection?: boolean;
  readonly success?: (collection: OpenedCollection) => readonly ResourceMutation[];
  readonly prepare?: (collection: OpenedCollection) => void;
  readonly run: (collection: OpenedCollection) => unknown;
};
const provider = new InMemoryTranslationProvider();
// Public resource-file writers, plus their internal remove/import/normalize entry points.
// Locale/config edits keep their existing broad reindex contract.
const writes: readonly Write[] = [
  {
    name: 'add collection',
    failure: 'config',
    silentFailure: true,
    success: (c) => [{ kind: 'reindex', translationsFolder: join(c.projectRoot, 'registered') }],
    run: (c) => addCollection(c, 'registered', { translationsFolder: 'registered' }),
  },
  {
    name: 'add collection terms failure',
    failure: 'terms',
    silentFailure: true,
    success: (c) => [{ kind: 'reindex', translationsFolder: join(c.projectRoot, 'registered') }],
    run: (c) =>
      addCollection(
        c,
        'registered',
        { translationsFolder: 'registered', protectedTermsFile: 'terms.json' },
        { protectedTerms: ['Brand'] },
      ),
  },
  {
    name: 'change collection terms after locales',
    failure: 'terms',
    kinds: ['reindex'],
    run: (c) =>
      changeCollection(
        c,
        { patch: { protectedTermsFile: 'terms.json', locales: ['en', 'de'] } },
        { protectedTerms: ['Brand'] },
      ),
  },
  {
    name: 'delete collection',
    failure: 'config',
    kinds: ['reindex'],
    silentFailure: true,
    run: (c) => deleteCollection(c),
  },
  {
    name: 'change collection',
    failure: 'config',
    kinds: ['reindex'],
    run: (c) => changeCollection(c, { patch: { tags: ['updated'] } }),
  },
  { name: 'add', run: (c) => addResource(c, { key: 'common.added', baseValue: 'Added' }, { provider }) },
  { name: 'add batch', run: (c) => addResources(c, [{ key: 'common.added', baseValue: 'Added' }], { provider }) },
  { name: 'edit', run: (c) => editResource(c, 'common.ok', { comment: 'Updated' }) },
  {
    name: 'edit and move',
    kinds: ['remove', 'upsert', 'remove-folder'],
    run: (c) => editResource(c, 'common.ok', { moveTo: 'destination' }),
  },
  { name: 'remove entry', kinds: ['remove'], failure: 'unlink', run: (c) => removeEntry(c, 'common.ok') },
  {
    name: 'delete resources',
    kinds: ['remove', 'remove-folder'],
    failure: 'unlink',
    run: (c) => deleteResource(c, { keys: ['common.ok'] }),
  },
  {
    name: 'move resource',
    kinds: ['remove', 'upsert', 'remove-folder'],
    run: (c) => executeMove(c, { source: 'common.ok', destination: 'destination.ok' }),
  },
  {
    name: 'move to another collection',
    kinds: ['remove', 'upsert', 'remove-folder'],
    crossCollection: true,
    run: (c) => executeMove(c, { source: 'common.ok', destination: 'destination.ok', toCollection: 'other' }),
  },
  {
    name: 'move pattern',
    kinds: ['remove', 'upsert', 'remove-folder'],
    run: (c) => executeMove(c, { source: 'common.*', destination: 'destination' }),
  },
  {
    name: 'move batch',
    kinds: ['remove', 'upsert', 'remove-folder'],
    run: (c) => executeMoves(c, [{ source: 'common.ok', destination: 'destination.ok' }]),
  },
  {
    name: 'move folder',
    kinds: ['remove', 'upsert', 'remove-folder'],
    run: (c) => executeMove(c, { kind: 'folder', source: 'common', destination: 'destination' }),
  },
  {
    name: 'delete folder',
    kinds: ['remove-folder'],
    failure: 'rm',
    run: (c) => deleteFolder(c, { folderPath: 'common' }),
  },
  {
    name: 'create folder',
    kinds: ['add-folder'],
    failure: 'mkdir',
    run: (c) => createFolder(c, { folderName: 'created' }),
  },
  {
    name: 'import',
    kinds: [],
    silentFailure: true,
    run: (c) => runImport(c, { source: join(c.projectRoot, 'source.json'), locale: 'fr' }),
  },
  {
    name: 'import resources',
    kinds: [],
    silentFailure: true,
    run: (c) => importResources(c, [{ key: 'common.ok', value: 'Oui' }], { locale: 'fr' }),
  },
  {
    name: 'prune folder',
    silentFailure: true,
    kinds: ['remove-folder'],
    failure: 'prune',
    prepare: (c) => {
      const path = join(c.translationsFolder, 'empty');
      fs.mkdirSync(path);
      fs.writeFileSync(join(path, 'resource_entries.json'), '{}');
      fs.writeFileSync(join(path, 'tracker_meta.json'), '{}');
    },
    run: (c) => pruneEmptyFolders(c),
  },
  { name: 'normalize', kinds: [], silentFailure: true, run: (c) => normalize(c) },
  { name: 'normalize collections', kinds: [], silentFailure: true, run: (c) => normalizeCollections([c]) },
  { name: 'translate resource write-back', run: (c) => translateExistingResource(c, 'common.ok', { provider }) },
  {
    name: 'translate locale write-back',
    kinds: ['reindex'],
    run: (c) => prepareTranslationRun(c, { provider }).forLocale('fr').execute(),
  },
  { name: 'add locale', kinds: ['reindex'], run: (c) => addLocaleToCollection(c, 'de') },
  { name: 'remove locale', kinds: ['reindex'], run: (c) => removeLocaleFromCollection(c, 'fr') },
  {
    name: 'update collection locales',
    kinds: ['reindex'],
    run: (c) => updateCollection(c, undefined, { locales: ['en', 'de'] }),
  },
  {
    name: 'Resource Folder save',
    run: async (c) => {
      const folder = openResourceFolder(join(c.translationsFolder, 'common'), c);
      folder.setDetails('ok', { comment: 'Saved directly' });
      return folder.save();
    },
  },
];

/** Full expected payloads, including stored metadata; readback never saves. */
function successMutations(write: Write, collection: OpenedCollection): readonly ResourceMutation[] {
  if (write.success) return write.success(collection);
  const root = collection.translationsFolder;
  return (write.kinds ?? ['upsert']).map((kind): ResourceMutation => {
    if (kind === 'reindex') return { kind, translationsFolder: root };
    if (kind === 'remove') return { kind, translationsFolder: root, key: 'common.ok' };
    if (kind === 'add-folder' || kind === 'remove-folder') {
      const path = write.name === 'create folder' ? 'created' : write.name === 'prune folder' ? 'empty' : 'common';
      return { kind, translationsFolder: root, path };
    }
    const targetRoot = write.crossCollection ? join(collection.projectRoot, 'other') : root;
    const key =
      write.name === 'add' || write.name === 'add batch'
        ? 'common.added'
        : write.name === 'move folder'
          ? 'destination.common.ok'
          : write.name.startsWith('move') || write.name === 'edit and move'
            ? 'destination.ok'
            : 'common.ok';
    const segments = key.split('.');
    const entryKey = segments.pop() ?? key;
    // Assertion readback never saves resource files.
    const folder = openUnreportedResourceFolder(join(targetRoot, ...segments), {
      runtime: 'transloco-messageformat',
      baseLocale: collection.baseLocale,
      translationsFolder: targetRoot,
    });
    const entry = folder.treeEntry(entryKey);
    if (!entry) throw new Error(`Missing expected stored entry ${key}`);
    return { kind: 'upsert', translationsFolder: targetRoot, key, entry };
  });
}

describe('Opened Collection guarantees Resource Mutations', () => {
  const directory = useTempDir('opened-mutations-');
  let collection: OpenedCollection;
  const mutations: ResourceMutation[] = [];

  beforeEach(() => {
    const config = {
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      translation: { enabled: true, provider: 'google-translate' as const, apiKeyEnv: 'UNUSED_TEST_KEY' },
      collections: { main: { translationsFolder: 'translations' }, other: { translationsFolder: 'other' } },
    };
    fs.writeFileSync(join(directory(), CONFIG_FILENAME), JSON.stringify(config));
    collection = openCollection(config, 'main', { cwd: directory(), onMutation: (m) => mutations.push(m) });
    seedResources(collection, { 'common.ok': { source: 'OK', translations: { fr: { value: 'OK', status: 'new' } } } });
    fs.writeFileSync(join(directory(), 'source.json'), JSON.stringify({ 'common.ok': 'Oui' }));
    mutations.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it('rejects the old sinkless write shape at the reported opener', () => {
    const sinkless = { baseLocale: collection.baseLocale, translationsFolder: collection.translationsFolder };
    expect(() => {
      // @ts-expect-error Reported writes require the collection's Mutation Sink.
      openResourceFolder(collection.translationsFolder, sinkless);
    }).toThrow(TypeError);
    expect(mutations).toEqual([]);
  });

  it('reports only changed keys after rejected and no-op folder edits', () => {
    seedResources(collection, { 'common.other': { source: 'Other' } });
    const folder = openResourceFolder(join(collection.translationsFolder, 'common'), collection);
    expect(folder.remove('missing')).toBe(false);
    expect(() => folder.setTranslation('other', 'en', 'Invalid')).toThrow('Cannot set a translation');
    expect(() => folder.setStatus('other', 'fr', 'verified')).toThrow('No metadata');
    expect(folder.setBase('other', 'Other')).toBe(false);
    expect(folder.setDetails('other', {})).toBe(false);
    folder.setStatus('ok', 'fr', 'new');
    folder.setTranslation('ok', 'fr', 'OK', 'new');
    folder.normalizeEntry('ok', ['fr']);
    folder.save();
    expect(mutations).toEqual([]);

    folder.setDetails('ok', { comment: 'Updated' });
    folder.save();
    expect(mutations).toEqual([
      {
        kind: 'upsert',
        translationsFolder: collection.translationsFolder,
        key: 'common.ok',
        entry: folder.treeEntry('ok'),
      },
    ]);
  });

  for (const write of writes) {
    it(`${write.name} preserves its success mutation sequence`, async () => {
      write.prepare?.(collection);
      await write.run(collection);
      expect(mutations).toEqual(successMutations(write, collection));
    });

    it(`${write.name} preserves its failed-write mutation sequence`, async () => {
      const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
      const actualJson = await vi.importActual<typeof import('../file-io/json-file-operations')>(
        '../file-io/json-file-operations',
      );
      write.prepare?.(collection);
      const failure = new Error('Injected partial write failure');
      let failed = false;
      const fail = (): never => {
        failed = true;
        throw failure;
      };
      if (write.failure === 'config' || write.failure === 'terms') {
        vi.mocked(fs.writeFileSync).mockImplementation((path, ...args) => {
          if (String(path).endsWith(write.failure === 'terms' ? 'terms.json' : CONFIG_FILENAME)) fail();
          return actualFs.writeFileSync(path, ...args);
        });
      } else if (write.failure === 'unlink' || write.failure === 'prune') {
        vi.mocked(fs.unlinkSync).mockImplementation((path) => {
          if (String(path).endsWith(write.failure === 'prune' ? 'resource_entries.json' : 'tracker_meta.json')) fail();
          actualFs.unlinkSync(path);
        });
      } else if (write.failure === 'rm') {
        vi.mocked(fs.rmSync).mockImplementation((path, options) => {
          actualFs.rmSync(path, options);
          fail();
        });
      } else if (write.failure === 'mkdir') {
        vi.mocked(fs.mkdirSync).mockImplementation((path) => {
          const result = actualFs.mkdirSync(path, { recursive: true });
          if (String(path).endsWith('created')) fail();
          return result;
        });
      } else {
        vi.mocked(json.writeJsonFile).mockImplementation((options) => {
          if (options.filePath.endsWith('tracker_meta.json')) fail();
          actualJson.writeJsonFile(options);
        });
      }
      try {
        await write.run(collection);
      } catch (error) {
        // Some operations throw; others return an operational failure in their result.
        expect(error).toBeDefined();
      } finally {
        vi.mocked(fs.writeFileSync).mockImplementation(actualFs.writeFileSync);
        vi.mocked(fs.unlinkSync).mockImplementation(actualFs.unlinkSync);
        vi.mocked(fs.rmSync).mockImplementation(actualFs.rmSync);
        vi.mocked(fs.mkdirSync).mockImplementation(actualFs.mkdirSync);
        vi.mocked(json.writeJsonFile).mockImplementation(actualJson.writeJsonFile);
      }
      expect(failed).toBe(true);
      expect(mutations).toEqual(
        write.silentFailure
          ? []
          : [
              ...(write.crossCollection ? [{ kind: 'reindex', translationsFolder: join(directory(), 'other') }] : []),
              { kind: 'reindex', translationsFolder: collection.translationsFolder },
            ],
      );
    });
  }
});
