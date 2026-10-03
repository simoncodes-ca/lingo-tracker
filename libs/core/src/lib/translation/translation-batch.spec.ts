import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import type { Collection } from '../config/open-collection';
import { readResourceEntries, writeJsonFile } from '../file-io/json-file-operations';
import { readCollection } from '../resource/read-collection';
import { openResourceFolder } from '../resource/resource-folder';
import { translationBatch } from './translation-batch';
import { snapshotTranslation } from './translation-write-back';
import type { Translator } from './translator';

vi.mock('../file-io/json-file-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../file-io/json-file-operations')>();
  return {
    ...actual,
    readResourceEntries: vi.fn(actual.readResourceEntries),
    writeJsonFile: vi.fn(actual.writeJsonFile),
  };
});

describe('translationBatch', () => {
  const dir = useTempDir('translation-batch-');
  const locales = ['fr', 'es'];

  function rows(collection: Collection) {
    return readCollection(collection).resources.map(({ fullKey, entry }) => ({
      key: fullKey,
      source: entry.source,
      snapshots: Object.fromEntries(
        locales.map((locale) => [locale, snapshotTranslation(entry.source, entry.metadata[locale])]),
      ),
    }));
  }

  function translator(): Translator {
    return {
      problems: [],
      translate: vi.fn<Translator['translate']>(async (entries, targets) => ({
        values: entries.flatMap(({ key, source }) =>
          targets.map((locale) => ({ key, locale, value: `[${locale}] ${source}` })),
        ),
        skipped: [],
      })),
    };
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
    const opened = translator();
    const onMutation = vi.fn();
    const outcomes = await translationBatch(collection, rows(collection), locales, opened, { onMutation });

    expect(opened.translate).toHaveBeenCalledTimes(1);
    expect(outcomes).toMatchObject(
      ['first.ok', 'first.yes', 'second.cancel'].flatMap((key) =>
        locales.map((locale) => ({ key, locale, status: 'written' })),
      ),
    );
    expect(read('first')['ok']).toMatchObject({ fr: '[fr] OK', es: '[es] OK' });
    expect(read('second')['cancel']).toMatchObject({ fr: '[fr] Cancel', es: '[es] Cancel' });
    expect(onMutation).toHaveBeenCalledTimes(3);
    expect(onMutation.mock.calls.map(([mutation]) => mutation)).toMatchObject([
      { kind: 'upsert', key: 'first.ok' },
      { kind: 'upsert', key: 'first.yes' },
      { kind: 'upsert', key: 'second.cancel' },
    ]);
  });

  it('reports a provider skip for one locale while writing the other', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' } });
    const opened: Translator = {
      problems: [],
      translate: async () => ({
        values: [{ key: 'first.ok', locale: 'es', value: 'Bien' }],
        skipped: [{ key: 'first.ok', locale: 'fr', reason: 'protected-term' }],
      }),
    };
    const outcomes = await translationBatch(collection, rows(collection), locales, opened);

    expect(outcomes).toMatchObject([
      { key: 'first.ok', locale: 'fr', status: 'skipped' },
      { key: 'first.ok', locale: 'es', status: 'written' },
    ]);
    expect(read('first')['ok']).toEqual({ source: 'OK', es: 'Bien' });
  });

  it('fails every key and locale at the provider stage without writes', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
    const cause = new Error('provider failed');
    const opened: Translator = {
      problems: [],
      translate: async () => {
        throw cause;
      },
    };
    const onMutation = vi.fn();
    const outcomes = await translationBatch(collection, rows(collection), locales, opened, { onMutation });

    expect(outcomes).toMatchObject(
      ['first.ok', 'second.cancel'].flatMap((key) =>
        locales.map((locale) => ({ key, locale, status: 'failed', stage: 'provider', error: cause })),
      ),
    );
    expect(onMutation).not.toHaveBeenCalled();
    expect(read('first')['ok']['fr']).toBeUndefined();
    expect(read('second')['cancel']['es']).toBeUndefined();
  });

  it('keeps the first folder written when the second folder write throws', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
    const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
      '../file-io/json-file-operations',
    );
    const cause = new Error('second write failed');
    const writer = vi.mocked(writeJsonFile);
    writer.mockImplementation((options) => {
      if (options.filePath === join(dir(), 'second', RESOURCE_ENTRIES_FILENAME)) throw cause;
      actual.writeJsonFile(options);
    });
    const onMutation = vi.fn();
    try {
      const outcomes = await translationBatch(collection, rows(collection), locales, translator(), { onMutation });
      expect(outcomes).toMatchObject([
        ...locales.map((locale) => ({ key: 'first.ok', locale, status: 'written' })),
        ...locales.map((locale) => ({
          key: 'second.cancel',
          locale,
          status: 'failed',
          stage: 'write',
          error: cause,
        })),
      ]);
      expect(read('first')['ok']['fr']).toBe('[fr] OK');
      expect(read('second')['cancel']['fr']).toBeUndefined();
      expect(onMutation).toHaveBeenCalledTimes(2);
    } finally {
      writer.mockImplementation(actual.writeJsonFile);
    }
  });

  it('retains the folder read error when every locale was provider-skipped', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' } });
    const pendingRows = rows(collection);
    const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
      '../file-io/json-file-operations',
    );
    const reader = vi.mocked(readResourceEntries);
    const error = new Error('folder read failed');
    const opened: Translator = {
      problems: [],
      translate: async (entries, targets) => {
        reader.mockImplementation(() => {
          throw error;
        });
        return {
          values: [],
          skipped: entries.flatMap(({ key }) =>
            targets.map((locale) => ({
              key,
              locale,
              reason: 'complex-icu' as const,
            })),
          ),
        };
      },
    };
    const onMutation = vi.fn();
    try {
      const outcomes = await translationBatch(collection, pendingRows, locales, opened, { onMutation });
      expect(outcomes).toEqual(
        locales.map((locale) => ({
          key: 'first.ok',
          locale,
          status: 'failed',
          stage: 'write',
          error,
        })),
      );
      for (const outcome of outcomes) {
        if (outcome.status === 'failed') expect(outcome.error).toBe(error);
      }
      expect(onMutation).not.toHaveBeenCalled();
    } finally {
      reader.mockImplementation(actual.readResourceEntries);
    }
  });

  it('skips stale write-back and preserves a target edited during translation', async () => {
    const collection = testCollection(dir());
    seedResources(collection, { 'first.ok': { source: 'OK' } });
    const opened = translator();
    const translate = opened.translate;
    opened.translate = async (entries, targets) => {
      const folder = openResourceFolder(join(dir(), 'first'), collection);
      folder.setTranslation('ok', 'fr', 'Humain', 'verified');
      folder.save();
      return translate(entries, targets);
    };
    const outcomes = await translationBatch(collection, rows(collection), locales, opened);

    expect(outcomes).toMatchObject([
      { key: 'first.ok', locale: 'fr', status: 'skipped' },
      { key: 'first.ok', locale: 'es', status: 'written' },
    ]);
    expect(read('first')['ok']).toMatchObject({ fr: 'Humain', es: '[es] OK' });
  });
});
