import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import type { Collection } from '../config/open-collection';
import { writeJsonFile } from '../file-io/json-file-operations';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
import { readCollection } from '../resource/read-collection';
import { editResource } from '../resource/resource-entry';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../resource/resource-folder';
import type { MutationSink } from '../resource/resource-mutation';
import { translateExistingResource } from './translate-existing-resource';
import { executeTranslationRun, prepareTranslationRun, selectTranslationRow } from './translation-run';

vi.mock('../file-io/json-file-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../file-io/json-file-operations')>();
  return { ...actual, writeJsonFile: vi.fn(actual.writeJsonFile) };
});

async function failWrite(filePath: string) {
  const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
    '../file-io/json-file-operations',
  );
  const error = new Error('write failed');
  const writer = vi.mocked(writeJsonFile);
  writer.mockImplementation((options) => {
    if (options.filePath === filePath) throw error;
    return actual.writeJsonFile(options);
  });
  return { error, restore: () => writer.mockImplementation(actual.writeJsonFile) };
}

describe('Translation Run rows × locales', () => {
  const dir = useTempDir('translation-batch-');
  const locales = ['fr', 'es'];
  const translationConfig = { enabled: true, provider: 'google-translate' as const, apiKeyEnv: 'UNUSED' };

  function rows(collection: Collection) {
    return readCollection(collection).resources.map(
      ({ fullKey, entry }) => selectTranslationRow(fullKey, entry, locales).row,
    );
  }

  async function execute(
    collection: Collection,
    provider = new InMemoryTranslationProvider(),
    options: { onMutation?: MutationSink } = {},
  ) {
    return executeTranslationRun({
      collection: { ...collection, onMutation: options.onMutation ?? collection.onMutation },
      translationConfig,
      rows: rows(collection),
      locales,
      failurePolicy: 'tally',
      provider,
    });
  }

  function read(folder: string): Record<string, Record<string, string>> {
    return JSON.parse(readFileSync(join(dir(), folder, RESOURCE_ENTRIES_FILENAME), 'utf8'));
  }

  it('calls the Translator once and writes every key and locale across folders', async () => {
    const collection = testCollection(dir());
    seedResources(collection, {
      'first.ok': { source: 'OK' },
      'first.yes': { source: 'Yes' },
      'second.cancel': { source: 'Cancel' },
    });
    const provider = new InMemoryTranslationProvider();
    const onMutation = vi.fn();
    const { tally } = await execute(collection, provider, { onMutation });
    expect(provider.calls).toEqual(
      locales.map((targetLocale) =>
        ['OK', 'Yes', 'Cancel'].map((text) => ({ text, sourceLocale: 'en', targetLocale })),
      ),
    );
    expect(tally.outcomes).toMatchObject(
      ['first.ok', 'first.yes', 'second.cancel'].flatMap((key) =>
        locales.map((locale) => ({ key, locale, status: 'written' })),
      ),
    );
    expect(tally.translatedCount).toBe(6);
    expect(read('first')['ok']).toMatchObject({ fr: '[fr] OK', es: '[es] OK' });
    expect(read('second')['cancel']).toMatchObject({ fr: '[fr] Cancel', es: '[es] Cancel' });
    expect(onMutation.mock.calls).toEqual([[{ kind: 'reindex', translationsFolder: dir() }]]);
  });

  it('reports a provider skip for one locale while writing the other', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' } });
    const provider = new InMemoryTranslationProvider(({ targetLocale }) => (targetLocale === 'fr' ? '{name}' : 'Bien'));
    const { tally } = await execute(collection, provider);
    expect(tally.outcomes).toMatchObject([
      { key: 'first.ok', locale: 'fr', status: 'skipped' },
      { key: 'first.ok', locale: 'es', status: 'written' },
    ]);
    expect(read('first')['ok']).toEqual({ source: 'OK', es: 'Bien' });
  });

  it('fails every key and locale at the provider stage without writes', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
    const cause = new Error('provider failed');
    const provider = new InMemoryTranslationProvider(() => {
      throw cause;
    });
    const onMutation = vi.fn();
    const { tally } = await execute(collection, provider, { onMutation });
    expect(tally.outcomes).toMatchObject(
      ['first.ok', 'second.cancel'].flatMap((key) =>
        locales.map((locale) => ({ key, locale, status: 'failed', stage: 'provider', error: cause })),
      ),
    );
    for (const failure of tally.failures) expect(failure.error).toBe(cause);
    const throwFirst = new InMemoryTranslationProvider(() => {
      throw cause;
    });
    const delay = vi.fn(async () => undefined);
    await expect(
      executeTranslationRun({
        collection: { ...collection, onMutation },
        translationConfig: { ...translationConfig, batchSize: 1 },
        rows: rows(collection),
        locales,
        failurePolicy: 'throw-first',
        provider: throwFirst,
        delay,
      }),
    ).rejects.toBe(cause);
    expect(throwFirst.calls).toEqual(locales.map((targetLocale) => [{ text: 'OK', sourceLocale: 'en', targetLocale }]));
    expect(delay).not.toHaveBeenCalled();
    expect(onMutation).not.toHaveBeenCalled();
    expect(read('first')['ok']['fr']).toBeUndefined();
    expect(read('second')['cancel']['es']).toBeUndefined();
  });

  it('keeps the first folder written when the second folder write throws', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
    const filePath = join(dir(), 'second', RESOURCE_ENTRIES_FILENAME);
    const provider = new InMemoryTranslationProvider(({ text, targetLocale }) => {
      return `[${targetLocale}] ${text}`;
    });
    const onMutation = vi.fn();
    const { error, restore } = await failWrite(filePath);
    try {
      const { tally } = await execute(collection, provider, { onMutation });
      expect(tally.outcomes).toMatchObject([
        ...locales.map((locale) => ({ key: 'first.ok', locale, status: 'written' })),
        ...locales.map((locale) => ({ key: 'second.cancel', locale, status: 'failed', stage: 'write' })),
      ]);
      expect(tally.failures[0]?.error).toBe(tally.failures[1]?.error);
      expect(tally.failures[0]?.error).toBeInstanceOf(Error);
      expect(tally.failures[0]?.error).toBe(error);
      expect(read('first')['ok']['fr']).toBe('[fr] OK');
      expect(read('second')['cancel']['fr']).toBeUndefined();
      expect(onMutation.mock.calls).toEqual([[{ kind: 'reindex', translationsFolder: dir() }]]);
    } finally {
      restore();
    }
  });

  it('retains the folder read error when every locale was provider-skipped', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' } });
    const filePath = join(dir(), 'first', RESOURCE_ENTRIES_FILENAME);
    const provider = new InMemoryTranslationProvider(() => {
      writeFileSync(filePath, '{ invalid');
      return '{name}';
    });
    const onMutation = vi.fn();
    const { tally } = await execute(collection, provider, { onMutation });
    expect(tally.outcomes).toMatchObject(
      locales.map((locale) => ({ key: 'first.ok', locale, status: 'failed', stage: 'write' })),
    );
    expect(tally.failures[0]?.error).toBe(tally.failures[1]?.error);
    expect(String(tally.failures[0]?.error)).toContain(
      `Reading resource entries: Failed to parse JSON file ${filePath}`,
    );
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('skips stale write-back and preserves a target edited during translation', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' } });
    const provider = new InMemoryTranslationProvider(({ text, targetLocale }) => {
      const folder = openUnreportedResourceFolder(join(dir(), 'first'), collection);
      folder.setTranslation('ok', 'fr', 'Humain', 'verified');
      folder.save();
      return `[${targetLocale}] ${text}`;
    });
    const { tally } = await execute(collection, provider);
    expect(tally.outcomes).toMatchObject([
      { key: 'first.ok', locale: 'fr', status: 'skipped' },
      { key: 'first.ok', locale: 'es', status: 'written' },
    ]);
    expect(read('first')['ok']).toMatchObject({ fr: 'Humain', es: '[es] OK' });
  });

  it('uses the inherited collection sink throughout writes', async () => {
    const inherited = vi.fn();
    const readSink = vi.fn(() => inherited);
    const collection = {
      ...testCollection(dir(), { translationConfig }),
      get onMutation() {
        return readSink();
      },
    };
    seedResources(collection, { 'first.ok': { source: 'OK' } });
    readSink.mockClear();
    inherited.mockClear();
    await execute(collection);
    expect(readSink).toHaveBeenCalled();
    expect(inherited).toHaveBeenCalledTimes(1);
    const folder = openUnreportedResourceFolder(join(dir(), 'first'), collection);
    for (const locale of locales) folder.setStatus('ok', locale, 'new');
    folder.save();
    readSink.mockClear();
    inherited.mockClear();
    await execute(collection, new InMemoryTranslationProvider(), { onMutation: undefined });
    expect(readSink).toHaveBeenCalled();
    expect(inherited).toHaveBeenCalledTimes(1);

    readSink.mockClear();
    inherited.mockClear();
    await translateExistingResource(collection, 'first.ok', {});
    expect(readSink).toHaveBeenCalled();
    expect(inherited).not.toHaveBeenCalled();

    readSink.mockClear();
    await prepareTranslationRun(collection, {}).forLocale('fr').execute();
    expect(readSink).not.toHaveBeenCalled();
    expect(inherited).not.toHaveBeenCalled();

    for (const enabled of [true, false]) {
      const target = {
        ...testCollection(dir(), { translationConfig: enabled ? translationConfig : undefined }),
        get onMutation() {
          return readSink();
        },
      };
      const key = enabled ? 'first.enabled' : 'first.disabled';
      seedResources(target, { [key]: { source: 'Before' } });
      readSink.mockClear();
      inherited.mockClear();
      await editResource(target, key, { baseValue: 'After' }, { provider: new InMemoryTranslationProvider() });
      expect(readSink).toHaveBeenCalled();
      expect(inherited).toHaveBeenCalledTimes(2);
    }
  });
});
