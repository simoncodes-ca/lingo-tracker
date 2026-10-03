import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../config/lingo-tracker-config';
import { CONFIG_FILENAME, TRACKER_META_FILENAME } from '../constants';
import { loadConfig } from '../lib/config/load-config';
import { openCollection } from '../lib/config/open-collection';
import {
  CollectionAlreadyExistsError,
  ConfigChangedError,
  InvalidCollectionError,
  ReadOnlyCollectionError,
} from '../lib/errors/lingo-tracker-error';
import type { ResourceMutation } from '../lib/resource/resource-mutation';
import { writeJsonFile } from '../lib/file-io/json-file-operations';
import { seedResources, testCollection } from '../testing/temp-dir.spec-helpers';
import { addLocaleToCollection } from './add-locale-to-collection';
import { changeCollection } from './collection-change';
import { removeLocaleFromCollection } from './remove-locale-from-collection';
import { updateCollection } from './update-collection';

vi.mock('../lib/file-io/json-file-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/file-io/json-file-operations')>();
  return { ...actual, writeJsonFile: vi.fn(actual.writeJsonFile) };
});

describe('Collection Change', () => {
  let cwd: string;
  let mutations: ResourceMutation[];
  const options = () => ({
    onMutation: (mutation: ResourceMutation) => mutations.push(mutation),
  });
  const config = (): LingoTrackerConfig => ({
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'es'],
    collections: { app: { tags: ['app'], translationsFolder: './i18n' } },
  });
  const save = (value: LingoTrackerConfig) => writeFileSync(join(cwd, CONFIG_FILENAME), JSON.stringify(value));
  const open = () => openCollection(loadConfig({ cwd }), 'app', { cwd });

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'collection-change-'));
    mutations = [];
    save(config());
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('does not reindex an equal record with reordered keys, including nested keys', async () => {
    const value = config();
    value.collections['app'].translation = {
      provider: 'google',
      apiKeyEnv: 'KEY',
      enabled: false,
    };
    save(value);
    const result = await changeCollection(
      open(),
      {
        patch: {
          translation: { enabled: false, apiKeyEnv: 'KEY', provider: 'google' },
        },
      },
      options(),
    );
    expect(result).toEqual({
      message: 'Collection "app" updated successfully',
      entriesAdded: 0,
      entriesRemoved: 0,
      filesUpdated: 0,
    });
    expect(mutations).toEqual([]);
  });

  it('still reindexes a record with a changed array order', async () => {
    const value = config();
    value.collections['app'].locales = ['es', 'en'];
    save(value);
    await changeCollection(open(), { patch: { locales: ['en', 'es'] } }, options());
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: join(cwd, 'i18n') }]);
  });

  it('records a successful config and terms write', async () => {
    const result = await changeCollection(
      open(),
      { patch: { protectedTermsFile: 'terms.json' } },
      {
        ...options(),
        protectedTerms: ['Pixel'],
      },
    );
    expect(result.message).toBe('Collection "app" updated successfully');
    expect(loadConfig({ cwd }).collections['app'].protectedTermsFile).toBe('terms.json');
    expect(JSON.parse(readFileSync(join(cwd, 'terms.json'), 'utf8'))).toEqual(['Pixel']);
  });

  it('throws the terms write error after writing config and reporting the mutation', async () => {
    mkdirSync(join(cwd, 'terms.json'));
    await expect(
      changeCollection(
        open(),
        { patch: { protectedTermsFile: 'terms.json' } },
        {
          ...options(),
          protectedTerms: ['Pixel'],
        },
      ),
    ).rejects.toMatchObject({ code: 'EISDIR' });
    expect(loadConfig({ cwd }).collections['app'].protectedTermsFile).toBe('terms.json');
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: join(cwd, 'i18n') }]);
  });

  it('keeps the public update rejection on terms failure with config written and mutation reported', async () => {
    mkdirSync(join(cwd, 'terms.json'));
    await expect(
      updateCollection(
        open(),
        undefined,
        { protectedTermsFile: 'terms.json' },
        {
          ...options(),
          protectedTerms: ['Pixel'],
        },
      ),
    ).rejects.toMatchObject({ code: 'EISDIR' });
    expect(loadConfig({ cwd }).collections['app'].protectedTermsFile).toBe('terms.json');
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: join(cwd, 'i18n') }]);
  });

  it('refuses a stale snapshot before read-only for an update patch', async () => {
    const value = config();
    value.collections['app'].readOnly = true;
    save(value);
    const current = open();
    writeFileSync(join(cwd, CONFIG_FILENAME), `${JSON.stringify(value)}\n`);
    const before = readFileSync(join(cwd, CONFIG_FILENAME), 'utf8');
    await expect(changeCollection(current, { patch: { locales: ['en', 'es', 'de'] } }, options())).rejects.toThrow(
      ConfigChangedError,
    );
    await expect(updateCollection(current, undefined, { locales: ['en', 'es', 'de'] }, options())).rejects.toThrow(
      ConfigChangedError,
    );
    expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(before);
    expect(mutations).toEqual([]);
  });

  it('refuses read-only before a stale snapshot for locale sugar', async () => {
    const value = config();
    value.collections['app'].readOnly = true;
    save(value);
    const current = open();
    writeFileSync(join(cwd, CONFIG_FILENAME), `${JSON.stringify(value)}\n`);
    await expect(
      changeCollection(current, { patch: {}, targetLocales: () => ['en', 'es', 'de'] }, options()),
    ).rejects.toThrow(ReadOnlyCollectionError);
    await expect(addLocaleToCollection(current, 'de', options())).rejects.toThrow(ReadOnlyCollectionError);
    await expect(removeLocaleFromCollection(current, 'es', options())).rejects.toThrow(ReadOnlyCollectionError);
    expect(mutations).toEqual([]);
  });

  it('reports a reindex when locale seeding fails and leaves config unchanged', async () => {
    seedResources(testCollection(join(cwd, 'i18n')), { ok: { source: 'OK' } });
    const before = readFileSync(join(cwd, CONFIG_FILENAME), 'utf8');
    const actual = await vi.importActual<typeof import('../lib/file-io/json-file-operations')>(
      '../lib/file-io/json-file-operations',
    );
    const writer = vi.mocked(writeJsonFile);
    writer.mockImplementation((options) => {
      if (options.filePath.endsWith(TRACKER_META_FILENAME)) throw new Error('seed failed');
      return actual.writeJsonFile(options);
    });
    try {
      await expect(changeCollection(open(), { patch: { locales: ['en', 'es', 'de'] } }, options())).rejects.toThrow(
        'seed failed',
      );
    } finally {
      writer.mockImplementation(actual.writeJsonFile);
    }
    expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(before);
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: join(cwd, 'i18n') }]);
  });

  it('reports both folders when the snapshot becomes stale at config write time', async () => {
    const moved = join(cwd, 'moved');
    seedResources(testCollection(moved), { ok: { source: 'OK' } });
    const current = open();
    const concurrent = `${readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')}\n`;
    const actual = await vi.importActual<typeof import('../lib/file-io/json-file-operations')>(
      '../lib/file-io/json-file-operations',
    );
    const writer = vi.mocked(writeJsonFile);
    writer.mockImplementation((options) => {
      const result = actual.writeJsonFile(options);
      // Simulate an external edit after preflight, during real locale file writes.
      if (options.filePath.endsWith(TRACKER_META_FILENAME)) {
        writeFileSync(join(cwd, CONFIG_FILENAME), concurrent);
      }
      return result;
    });
    try {
      await expect(
        changeCollection(
          current,
          {
            patch: {
              translationsFolder: './moved',
              locales: ['en', 'es', 'de'],
            },
          },
          options(),
        ),
      ).rejects.toThrow(ConfigChangedError);
    } finally {
      writer.mockImplementation(actual.writeJsonFile);
    }
    expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(concurrent);
    expect(mutations).toEqual([
      { kind: 'reindex', translationsFolder: moved },
      { kind: 'reindex', translationsFolder: join(cwd, 'i18n') },
    ]);
  });

  it('reports both old and new folders on rename', async () => {
    const result = await changeCollection(
      open(),
      {
        newName: 'renamed',
        patch: { translationsFolder: './moved' },
      },
      options(),
    );
    expect(result.message).toBe('Collection "app" renamed to "renamed" and updated successfully');
    expect(loadConfig({ cwd }).collections['app']).toBeUndefined();
    expect(loadConfig({ cwd }).collections['renamed'].translationsFolder).toBe('./moved');
    expect(mutations).toEqual([
      { kind: 'reindex', translationsFolder: join(cwd, 'i18n') },
      { kind: 'reindex', translationsFolder: join(cwd, 'moved') },
    ]);
  });

  it('allows an update to a read-only collection when effective locales are unchanged', async () => {
    const value = config();
    value.collections['app'].readOnly = true;
    save(value);
    const result = await changeCollection(
      open(),
      {
        patch: { tags: ['updated'], locales: ['en', 'es'] },
      },
      options(),
    );
    expect(result.message).toBe('Collection "app" updated successfully');
    expect(loadConfig({ cwd }).collections['app'].tags).toEqual(['updated']);
    expect(open().readOnly).toBe(true);
    expect(open().locales).toEqual(['en', 'es']);
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: join(cwd, 'i18n') }]);
  });

  it('refuses invalid protected terms before a stale snapshot', async () => {
    const current = open();
    const concurrent = `${readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')}\n`;
    writeFileSync(join(cwd, CONFIG_FILENAME), concurrent);
    await expect(
      changeCollection(
        current,
        { patch: {} },
        {
          ...options(),
          protectedTerms: ['valid', 42] as unknown as string[],
        },
      ),
    ).rejects.toThrow(InvalidCollectionError);
    expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(concurrent);
    expect(mutations).toEqual([]);
  });

  it('refuses invalid protected terms before read-only', async () => {
    const value = config();
    value.collections['app'].readOnly = true;
    save(value);
    await expect(
      changeCollection(
        open(),
        {
          patch: {},
          targetLocales: () => ['en', 'es', 'de'],
        },
        {
          ...options(),
          protectedTerms: ['valid', 42] as unknown as string[],
        },
      ),
    ).rejects.toThrow(InvalidCollectionError);
    expect(mutations).toEqual([]);
  });

  it('refuses a rename collision before a stale snapshot', async () => {
    const value = config();
    value.collections['taken'] = { translationsFolder: './taken' };
    save(value);
    const current = open();
    const concurrent = `${JSON.stringify(value)}\n`;
    writeFileSync(join(cwd, CONFIG_FILENAME), concurrent);
    await expect(changeCollection(current, { newName: 'taken', patch: {} }, options())).rejects.toThrow(
      CollectionAlreadyExistsError,
    );
    expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(concurrent);
    expect(mutations).toEqual([]);
  });

  it('refuses a stale snapshot before an invalid added locale', async () => {
    const current = open();
    const concurrent = `${readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')}\n`;
    writeFileSync(join(cwd, CONFIG_FILENAME), concurrent);
    await expect(
      changeCollection(
        current,
        {
          patch: { locales: ['en', 'es', '!invalid!'] },
        },
        options(),
      ),
    ).rejects.toThrow(ConfigChangedError);
    expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(concurrent);
    expect(mutations).toEqual([]);
  });

  it('refuses read-only before an invalid added locale', async () => {
    const value = config();
    value.collections['app'].readOnly = true;
    save(value);
    await expect(
      changeCollection(
        open(),
        {
          patch: { locales: ['en', 'es', '!invalid!'] },
        },
        options(),
      ),
    ).rejects.toThrow(ReadOnlyCollectionError);
    expect(mutations).toEqual([]);
  });

  it('does not reindex an otherwise equal record with an undefined-valued patch key', async () => {
    const current = open();
    await changeCollection(current, { patch: { tags: undefined } }, options());
    expect(loadConfig({ cwd }).collections['app']).toEqual(current.sourceConfig.collections['app']);
    expect(mutations).toEqual([]);
  });
});
