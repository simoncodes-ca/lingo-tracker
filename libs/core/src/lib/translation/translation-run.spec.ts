import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationConfig } from '../../config/translation-config';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import type { Collection } from '../config/open-collection';
import { AutoTranslationDisabledError, TranslationError } from '../errors/lingo-tracker-error';
import { writeJsonFile } from '../file-io/json-file-operations';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../resource/resource-folder';
import type { ResourceMutation } from '../resource/resource-mutation';
import type { TranslateLocaleProgress } from './translation-run';
import {
  prepareTranslationRun,
  type TranslationRunExecutionOptions,
  type TranslationRunOptions,
} from './translation-run';

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

const executeLocale = async (
  collection: Collection,
  params: TranslationRunOptions &
    TranslationRunExecutionOptions & { targetLocale: string; onMutation?: (mutation: ResourceMutation) => void },
) => {
  const { targetLocale, onProgress, onMutation, ...options } = params;
  return prepareTranslationRun(
    { ...collection, onMutation: onMutation ?? collection.onMutation },
    { ...options, delay: async () => undefined },
  )
    .forLocale(targetLocale)
    .execute({ onProgress });
};

const collected: ResourceMutation[] = [];
const onMutation = (mutation: ResourceMutation): void => {
  collected.push(mutation);
};
beforeEach(() => {
  collected.length = 0;
});

const AUTO: TranslationConfig = {
  enabled: true,
  provider: 'google-translate',
  apiKeyEnv: 'TRANSLATE_LOCALE_SPEC_KEY',
  delayMs: 0,
};

describe('Translation Run', () => {
  const dir = useTempDir('translate-locale-');

  function collection(overrides: Partial<Collection> = {}): Collection {
    return testCollection(dir(), { locales: ['en', 'fr'], translationConfig: AUTO, ...overrides });
  }

  function withBatchSize(batchSize: number): Collection {
    return collection({ translationConfig: { ...AUTO, batchSize } });
  }

  function read(file: string, ...segments: string[]) {
    return JSON.parse(readFileSync(join(dir(), ...segments, file), 'utf8'));
  }

  it.each([
    {
      label: 'enabled target',
      overrides: {
        baseLocale: 'de',
        locales: ['de', 'fr'],
        translationConfig: { ...AUTO, batchSize: 1, delayMs: 4321 },
      },
      locale: 'fr',
      error: undefined,
    },
    {
      label: 'disabled first',
      overrides: { translationConfig: undefined },
      locale: 'en',
      error: 'Auto-translation is not enabled',
    },
    { label: 'no targets', overrides: { locales: ['en'] }, locale: 'fr', error: 'No target locales configured' },
    { label: 'base', overrides: {}, locale: 'en', error: 'Cannot translate to the base locale' },
    { label: 'unknown', overrides: {}, locale: 'de', error: 'Locale "de" is not configured' },
  ])('prepareTranslationRun: $label', async ({ overrides, locale, error }) => {
    const target = collection(overrides);
    const provider = new InMemoryTranslationProvider();
    const delays: number[] = [];
    const prepare = () =>
      prepareTranslationRun(target, {
        provider,
        delay: async (ms) => {
          delays.push(ms);
        },
      }).forLocale(locale);
    if (error) expect(prepare).toThrow(error);
    else {
      seedResources(target, { a: { source: 'First' }, b: { source: 'Second' } });
      const run = prepare();
      expect(run).toMatchObject({
        collectionName: target.name,
        targetLocale: 'fr',
        execute: expect.any(Function),
      });
      await expect(run.execute()).resolves.toMatchObject({ outcome: 'succeeded', translatedCount: 2 });
      expect(provider.calls).toEqual([
        [{ text: 'First', sourceLocale: 'de', targetLocale: 'fr' }],
        [{ text: 'Second', sourceLocale: 'de', targetLocale: 'fr' }],
      ]);
      expect(delays).toEqual([4321]);
      expect(read(RESOURCE_ENTRIES_FILENAME)).toMatchObject({
        a: { source: 'First', fr: '[fr] First' },
        b: { source: 'Second', fr: '[fr] Second' },
      });
    }
  });

  it('emits one reindex for a batch that writes several folders', async () => {
    const target = collection({ translationConfig: { ...AUTO, batchSize: 5 }, onMutation });
    seedResources(target, { 'a.one': { source: 'One' }, 'b.two': { source: 'Two' }, 'c.three': { source: 'Three' } });
    const result = await prepareTranslationRun(target, {
      provider: new InMemoryTranslationProvider(),
      delay: async () => undefined,
    })
      .forLocale('fr')
      .execute();
    expect(result.translatedCount).toBe(3);
    expect(result.outcome).toBe('succeeded');
    expect(collected).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
  });

  it('emits one reindex when a folder fails and another folder succeeds in the same batch', async () => {
    const target = withBatchSize(5);
    seedResources(target, { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
    const failedPath = join(dir(), 'first', TRACKER_META_FILENAME);
    const { error, restore } = await failWrite(failedPath);
    try {
      const result = await executeLocale(target, {
        targetLocale: 'fr',
        provider: new InMemoryTranslationProvider(),
        onMutation,
      });
      expect(collected).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
      expect(result).toMatchObject({
        outcome: 'failed',
        totalResources: 2,
        translatedCount: 1,
        failedCount: 1,
        skippedCount: 0,
        failures: [{ key: 'first.ok', error: error.message }],
      });
      expect(read(RESOURCE_ENTRIES_FILENAME, 'second').cancel.fr).toBe('[fr] Cancel');
    } finally {
      restore();
    }
  });

  it('preserves an execution error without repeating mutation delivery', async () => {
    const target = collection();
    seedResources(target, { ok: { source: 'OK' } });
    const originalError = new Error('progress failed');
    const reported: ResourceMutation[] = [];
    await expect(
      executeLocale(target, {
        targetLocale: 'fr',
        provider: new InMemoryTranslationProvider(),
        onProgress: () => {
          throw originalError;
        },
        onMutation: (mutation) => {
          reported.push(mutation);
        },
      }),
    ).rejects.toBe(originalError);
    expect(reported).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
  });

  it('prepares availability before a prompt and selects the final locale afterward', async () => {
    const target = collection();
    const prepared = prepareTranslationRun(target, { delay: async () => undefined });
    expect(prepared.targetLocales).toEqual(['fr']);
    expect(prepared).not.toHaveProperty('targetLocale');
    expect(prepared).not.toHaveProperty('collection');
    expect(prepared).not.toHaveProperty('translationConfig');
    await expect(prepared.forLocale('fr').execute()).resolves.toMatchObject({ totalResources: 0 });
    expect(() => prepared.forLocale('en')).toThrow('Cannot translate to the base locale "en".');
    expect(() => prepared.forLocale('de')).toThrow('Locale "de" is not configured. Available locales: en, fr');
  });

  it('tallies written, skipped, and failed outcomes once across a run', async () => {
    const target = withBatchSize(1);
    seedResources(target, {
      a: { source: 'Written' },
      b: { source: '{count, plural, one {# item} other {# items}}' },
      c: { source: 'Failed' },
    });
    const progress: TranslateLocaleProgress[] = [];
    const result = await prepareTranslationRun(
      { ...target, onMutation: onMutation ?? target.onMutation },
      {
        provider: new InMemoryTranslationProvider(({ text }) => {
          if (text === 'Failed') throw new Error('provider failed');
          return `[fr] ${text}`;
        }),
        delay: async () => undefined,
      },
    )
      .forLocale('fr')
      .execute({ onProgress: (event) => progress.push(event) });
    expect(result).toMatchObject({
      outcome: 'failed',
      totalResources: 3,
      translatedCount: 1,
      skippedCount: 1,
      failedCount: 1,
      skippedKeys: ['b'],
      failures: [{ key: 'c', error: 'provider failed' }],
    });
    expect(progress).toHaveLength(3);
    expect(progress[2]).toEqual({
      totalResources: 3,
      translatedCount: 1,
      skippedCount: 1,
      failedCount: 1,
      currentBatch: 3,
      totalBatches: 3,
    });
    expect(collected).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
  });

  it('injects the configured delay only between batches', async () => {
    const target = collection({ translationConfig: { ...AUTO, batchSize: 1, delayMs: 4321 } });
    seedResources(target, { a: { source: 'A' }, b: { source: 'B' }, c: { source: 'C' } });
    const delays: number[] = [];
    await prepareTranslationRun(target, {
      provider: new InMemoryTranslationProvider(),
      delay: async (ms) => {
        delays.push(ms);
      },
    })
      .forLocale('fr')
      .execute();
    expect(delays).toEqual([4321, 4321]);
  });

  describe('start-time preconditions', () => {
    it('accepts an enabled collection and a configured target locale', async () => {
      await expect(executeLocale(collection(), { onMutation, targetLocale: 'fr' })).resolves.toMatchObject({
        totalResources: 0,
      });
    });

    it('rejects disabled auto-translation before checking the locale', async () => {
      const target = collection({ translationConfig: undefined });
      await expect(executeLocale(target, { onMutation, targetLocale: 'en' })).rejects.toThrow(
        AutoTranslationDisabledError,
      );
    });

    it('rejects the base locale with the CLI message', async () => {
      const target = collection();
      await expect(executeLocale(target, { onMutation, targetLocale: 'en' })).rejects.toThrow(
        'Cannot translate to the base locale "en".',
      );
    });

    it('rejects an unknown locale with the available locales', async () => {
      const target = collection();
      await expect(executeLocale(target, { onMutation, targetLocale: 'de' })).rejects.toThrow(
        'Locale "de" is not configured. Available locales: en, fr',
      );
    });
  });

  describe('when nothing needs translating', () => {
    it('returns zeros for an empty collection, without an API key', async () => {
      const result = await executeLocale(collection(), { onMutation, targetLocale: 'fr' });

      expect(result).toEqual({
        outcome: 'succeeded',
        totalResources: 0,
        translatedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        failures: [],
        skippedKeys: [],
        warnings: [],
      });
      expect(collected).toEqual([]);
    });

    it('returns zeros when every resource is translated or verified', async () => {
      seedResources(collection(), {
        ok: { source: 'OK', translations: { fr: 'OK fr' } },
        cancel: { source: 'Cancel', translations: { fr: { value: 'Annuler', status: 'verified' } } },
      });

      const result = await executeLocale(collection(), { onMutation, targetLocale: 'fr' });

      expect(result.totalResources).toBe(0);
    });

    it.each([undefined, { ...AUTO, enabled: false }])(
      'still refuses a collection whose translation config is %j',
      async (translationConfig) => {
        await expect(
          executeLocale(collection({ translationConfig }), { onMutation, targetLocale: 'fr' }),
        ).rejects.toThrow(AutoTranslationDisabledError);
      },
    );
  });

  it('translates new, stale and metadata-less resources, and leaves translated and verified ones', async () => {
    const target = collection();
    seedResources(target, {
      fresh: { source: 'Fresh', translations: { fr: { value: 'Fresh', status: 'new' } } },
      done: { source: 'Done', translations: { fr: 'Fait' } },
      checked: { source: 'Checked', translations: { fr: { value: 'Vérifié', status: 'verified' } } },
      missing: { source: 'Missing' },
      old: { source: 'Old', translations: { fr: 'Vieux' } },
    });
    const folder = openUnreportedResourceFolder(dir(), { runtime: 'transloco-messageformat', baseLocale: 'en' });
    folder.setBase('old', 'Older');
    folder.save();
    const provider = new InMemoryTranslationProvider();

    const result = await executeLocale(target, { onMutation, targetLocale: 'fr', provider });

    expect(result).toMatchObject({ totalResources: 3, translatedCount: 3, failedCount: 0, skippedCount: 0 });
    const entries = read(RESOURCE_ENTRIES_FILENAME);
    expect(entries.fresh.fr).toBe('[fr] Fresh');
    expect(entries.missing.fr).toBe('[fr] Missing');
    expect(entries.old.fr).toBe('[fr] Older');
    expect(entries.done.fr).toBe('Fait');
    expect(entries.checked.fr).toBe('Vérifié');
    const meta = read(TRACKER_META_FILENAME);
    expect(meta.fresh.fr.status).toBe('translated');
    expect(meta.old.fr.status).toBe('translated');
    expect(meta.checked.fr.status).toBe('verified');
  });

  it('writes each folder it translates into, with values normalised to ICU', async () => {
    const target = collection();
    seedResources(target, {
      'dialogs.greet': { source: 'Hello {{ name }}' },
      'buttons.ok': { source: 'OK' },
    });
    const provider = new InMemoryTranslationProvider(({ text }) => text.replace('Hello', 'Bonjour'));

    const result = await executeLocale(target, { onMutation, targetLocale: 'fr', provider });

    expect(result.translatedCount).toBe(2);
    expect(collected).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
    expect(read(RESOURCE_ENTRIES_FILENAME, 'dialogs').greet.fr).toBe('Bonjour {name}');
    expect(read(RESOURCE_ENTRIES_FILENAME, 'buttons').ok.fr).toBe('OK');
    expect(read(TRACKER_META_FILENAME, 'buttons').ok.fr.status).toBe('translated');
  });

  it('keeps translated for a provider result identical to the base', async () => {
    const target = collection();
    seedResources(target, { ok: { source: 'OK', translations: { fr: { value: 'OK', status: 'new' } } } });

    const result = await executeLocale(target, {
      onMutation,
      targetLocale: 'fr',
      provider: new InMemoryTranslationProvider(() => 'OK'),
    });

    expect(result.translatedCount).toBe(1);
    expect(read(TRACKER_META_FILENAME).ok.fr.status).toBe('translated');
    expect((await executeLocale(target, { onMutation, targetLocale: 'fr' })).totalResources).toBe(0);
  });

  describe('batches', () => {
    it('reports each save when separate batches write the collection', async () => {
      seedResources(collection(), { a: { source: 'A' }, b: { source: 'B' } });
      const writes: ResourceMutation[] = [];

      const result = await executeLocale(withBatchSize(1), {
        targetLocale: 'fr',
        provider: new InMemoryTranslationProvider(),
        onMutation: (mutation) => writes.push(mutation),
      });

      expect(result.translatedCount).toBe(2);
      expect(writes).toEqual([
        { kind: 'reindex', translationsFolder: dir() },
        { kind: 'reindex', translationsFolder: dir() },
      ]);
    });

    it('reports the last folder save after two batches write different folders', async () => {
      seedResources(collection(), { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
      const events: string[] = [];

      await executeLocale(withBatchSize(1), {
        targetLocale: 'fr',
        provider: new InMemoryTranslationProvider(),
        onMutation: (mutation) => events.push(mutation.kind),
        onProgress: (progress) => events.push(`batch ${progress.currentBatch}`),
      });

      expect(events).toEqual(['reindex', 'batch 1', 'reindex', 'batch 2']);
      expect(read(RESOURCE_ENTRIES_FILENAME, 'second').cancel.fr).toBe('[fr] Cancel');
    });

    it('reports a failed save in the last folder after an earlier batch saved', async () => {
      seedResources(collection(), { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
      const failedPath = join(dir(), 'second', TRACKER_META_FILENAME);
      const { error, restore } = await failWrite(failedPath);
      const events: string[] = [];

      let result: Awaited<ReturnType<typeof executeLocale>>;
      try {
        result = await executeLocale(withBatchSize(1), {
          targetLocale: 'fr',
          provider: new InMemoryTranslationProvider(),
          onMutation: (mutation) => events.push(mutation.kind),
          onProgress: (progress) => events.push(`batch ${progress.currentBatch}`),
        });
      } finally {
        restore();
      }

      expect(result.failedCount).toBe(1);
      expect(result.failures).toEqual([{ key: 'second.cancel', error: error.message }]);
      expect(events).toEqual(['reindex', 'batch 1', 'reindex', 'batch 2']);
      expect(read(RESOURCE_ENTRIES_FILENAME, 'second').cancel.fr).toBe('[fr] Cancel');
    });

    it('counts each resource once when a later folder in the same batch fails', async () => {
      const target = withBatchSize(5);
      seedResources(target, {
        'first.ok': { source: 'OK' },
        'second.cancel': { source: 'Cancel' },
        'second.close': { source: 'Close' },
        'second.items': { source: '{count, plural, one {# item} other {# items}}' },
      });
      const failedPath = join(dir(), 'second', RESOURCE_ENTRIES_FILENAME);
      const { error, restore } = await failWrite(failedPath);
      const progress: TranslateLocaleProgress[] = [];
      try {
        const result = await executeLocale(target, {
          targetLocale: 'fr',
          provider: new InMemoryTranslationProvider(),
          onProgress: (event) => progress.push(event),
        });
        expect(result).toMatchObject({ totalResources: 4, translatedCount: 1, failedCount: 3, skippedCount: 0 });
        expect(result.translatedCount + result.failedCount + result.skippedCount).toBe(result.totalResources);
        expect(result.failures).toEqual([
          { key: 'second.cancel', error: error.message },
          { key: 'second.close', error: error.message },
          { key: 'second.items', error: error.message },
        ]);
        expect(result.skippedKeys).toEqual([]);
        expect(read(RESOURCE_ENTRIES_FILENAME, 'first').ok.fr).toBe('[fr] OK');
        expect(progress).toEqual([
          {
            totalResources: 4,
            translatedCount: 1,
            failedCount: 3,
            skippedCount: 0,
            currentBatch: 1,
            totalBatches: 1,
          },
        ]);
      } finally {
        restore();
      }
    });

    it('reports saved folders through onMutation before a later failure', async () => {
      seedResources(collection(), { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
      const reported: ResourceMutation[] = [];

      await expect(
        executeLocale(withBatchSize(1), {
          targetLocale: 'fr',
          provider: new InMemoryTranslationProvider(),
          onMutation: (mutation) => reported.push(mutation),
          onProgress: () => {
            throw new Error('stopped after first batch');
          },
        }),
      ).rejects.toThrow('stopped after first batch');

      expect(reported).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
      expect(read(RESOURCE_ENTRIES_FILENAME, 'first').ok.fr).toBe('[fr] OK');
      expect(read(RESOURCE_ENTRIES_FILENAME, 'second').cancel.fr).toBeUndefined();
    });

    it('reports the mutation when a folder saves only resource entries', async () => {
      seedResources(collection(), { 'second.cancel': { source: 'Cancel' } });
      const originalMeta = read(TRACKER_META_FILENAME, 'second');
      const failedPath = join(dir(), 'second', TRACKER_META_FILENAME);
      const { error, restore } = await failWrite(failedPath);
      const writes: ResourceMutation[] = [];

      let result: Awaited<ReturnType<typeof executeLocale>>;
      try {
        result = await executeLocale(withBatchSize(5), {
          targetLocale: 'fr',
          provider: new InMemoryTranslationProvider(),
          onMutation: (mutation) => writes.push(mutation),
        });
      } finally {
        restore();
      }

      expect(result.failedCount).toBe(1);
      expect(result.failures).toEqual([{ key: 'second.cancel', error: error.message }]);
      expect(result.outcome).toBe('failed');
      expect(writes).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
      expect(read(RESOURCE_ENTRIES_FILENAME, 'second').cancel.fr).toBe('[fr] Cancel');
      expect(read(TRACKER_META_FILENAME, 'second')).toEqual(originalMeta);
    });

    it('continues with later batches after a folder save fails', async () => {
      seedResources(collection(), { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
      const failedPath = join(dir(), 'first', TRACKER_META_FILENAME);
      const { error, restore } = await failWrite(failedPath);

      let result: Awaited<ReturnType<typeof executeLocale>>;
      try {
        result = await executeLocale(withBatchSize(1), {
          onMutation,
          targetLocale: 'fr',
          provider: new InMemoryTranslationProvider(),
        });
      } finally {
        restore();
      }

      expect(result.failedCount).toBe(1);
      expect(result.failures).toEqual([{ key: 'first.ok', error: error.message }]);
      expect(result.translatedCount).toBe(1);
      expect(result.outcome).toBe('failed');
      expect(collected).toEqual([
        { kind: 'reindex', translationsFolder: dir() },
        { kind: 'reindex', translationsFolder: dir() },
      ]);
      expect(read(RESOURCE_ENTRIES_FILENAME, 'second').cancel.fr).toBe('[fr] Cancel');
    });

    it('sends one provider call per batch of batchSize, and reports progress after each', async () => {
      seedResources(collection(), { a: { source: 'A' }, b: { source: 'B' }, c: { source: 'C' } });
      const provider = new InMemoryTranslationProvider();
      const progress: TranslateLocaleProgress[] = [];

      await executeLocale(withBatchSize(2), {
        onMutation,
        targetLocale: 'fr',
        provider,
        onProgress: (event) => progress.push(event),
      });

      expect(provider.calls.map((call) => call.map(({ text }) => text))).toEqual([['A', 'B'], ['C']]);
      expect(progress).toEqual([
        { totalResources: 3, translatedCount: 2, failedCount: 0, skippedCount: 0, currentBatch: 1, totalBatches: 2 },
        { totalResources: 3, translatedCount: 3, failedCount: 0, skippedCount: 0, currentBatch: 2, totalBatches: 2 },
      ]);
    });

    it('marks every resource of a failed batch as failed and continues with the next batch', async () => {
      seedResources(collection(), { a: { source: 'A' }, b: { source: 'B' }, c: { source: 'C' } });
      let calls = 0;
      const provider = new InMemoryTranslationProvider(({ text }) => {
        if (calls++ === 0) {
          throw new TranslationError('quota exceeded', 'RATE_LIMIT', true);
        }
        return `${text}-fr`;
      });

      const result = await executeLocale(withBatchSize(2), { onMutation, targetLocale: 'fr', provider });

      expect(result.failedCount).toBe(2);
      expect(result.outcome).toBe('failed');
      expect(result.failures).toEqual([
        { key: 'a', error: 'quota exceeded' },
        { key: 'b', error: 'quota exceeded' },
      ]);
      expect(result.translatedCount).toBe(1);
      expect(read(RESOURCE_ENTRIES_FILENAME).c.fr).toBe('C-fr');
      expect(read(RESOURCE_ENTRIES_FILENAME).a.fr).toBeUndefined();
    });

    it('records a timed-out batch as failed and continues with the next batch', async () => {
      seedResources(collection(), { a: { source: 'A' }, b: { source: 'B' } });
      let calls = 0;
      const provider = new InMemoryTranslationProvider(({ text }) => {
        if (calls++ === 0) {
          throw new TranslationError('Google Translate request timed out', 'TIMEOUT', true);
        }
        return `${text}-fr`;
      });

      const result = await executeLocale(withBatchSize(1), { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({
        totalResources: 2,
        translatedCount: 1,
        failedCount: 1,
        failures: [{ key: 'a', error: 'Google Translate request timed out' }],
      });
      expect(read(RESOURCE_ENTRIES_FILENAME).b.fr).toBe('B-fr');
    });
  });

  describe('skips', () => {
    it('preserves a manual target value saved during the provider call', async () => {
      const target = collection();
      seedResources(target, { ok: { source: 'OK' } });
      const provider = new InMemoryTranslationProvider(() => {
        const folder = openUnreportedResourceFolder(dir(), { runtime: 'transloco-messageformat', baseLocale: 'en' });
        folder.setTranslation('ok', 'fr', 'Humain', 'translated');
        folder.save();
        return 'Machine';
      });

      const result = await executeLocale(target, { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 0, skippedCount: 1, skippedKeys: ['ok'] });
      expect(read(RESOURCE_ENTRIES_FILENAME).ok.fr).toBe('Humain');
      expect(read(TRACKER_META_FILENAME).ok.fr.status).toBe('translated');
    });

    it('preserves a sibling entry written during the provider call', async () => {
      const target = collection();
      seedResources(target, { 'common.ok': { source: 'OK' } });
      const provider = new InMemoryTranslationProvider(() => {
        const folder = openUnreportedResourceFolder(join(dir(), 'common'), target);
        folder.setBase('cancel', 'Cancel');
        folder.setTranslation('cancel', 'fr', 'Annuler', 'verified');
        folder.save();
        return 'Bien';
      });

      const result = await executeLocale(target, { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 1, skippedCount: 0 });
      expect(read(RESOURCE_ENTRIES_FILENAME, 'common').cancel).toEqual({ source: 'Cancel', fr: 'Annuler' });
      expect(read(TRACKER_META_FILENAME, 'common').cancel.fr.status).toBe('verified');
      expect(collected).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
    });

    it('preserves a target marked verified during the provider call', async () => {
      const target = collection();
      seedResources(target, { ok: { source: 'OK', translations: { fr: { value: 'OK', status: 'new' } } } });
      const provider = new InMemoryTranslationProvider(() => {
        const folder = openUnreportedResourceFolder(dir(), { runtime: 'transloco-messageformat', baseLocale: 'en' });
        folder.setStatus('ok', 'fr', 'verified');
        folder.save();
        return 'Machine';
      });

      const result = await executeLocale(target, { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 0, skippedCount: 1, skippedKeys: ['ok'] });
      expect(read(RESOURCE_ENTRIES_FILENAME).ok.fr).toBe('OK');
      expect(read(TRACKER_META_FILENAME).ok.fr.status).toBe('verified');
    });

    it('skips an old translation when the base value changes during the provider call', async () => {
      const target = collection();
      seedResources(target, { ok: { source: 'Old', translations: { fr: 'Old' } } });
      const initialFolder = openUnreportedResourceFolder(dir(), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      });
      initialFolder.setBase('ok', 'Older');
      initialFolder.save();
      const provider = new InMemoryTranslationProvider(({ text }) => {
        const folder = openUnreportedResourceFolder(dir(), { runtime: 'transloco-messageformat', baseLocale: 'en' });
        folder.setBase('ok', 'New');
        folder.save();
        return `[fr] ${text}`;
      });

      const result = await executeLocale(target, { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ totalResources: 1, translatedCount: 0, skippedCount: 1, skippedKeys: ['ok'] });
      expect(read(RESOURCE_ENTRIES_FILENAME).ok).toMatchObject({ source: 'New', fr: 'Old' });
      expect(read(TRACKER_META_FILENAME).ok.fr.status).toBe('stale');
    });

    it('reports complex ICU resources in skippedKeys and leaves them untouched', async () => {
      const plural = '{count, plural, one {# item} other {# items}}';
      seedResources(collection(), { items: { source: plural }, ok: { source: 'OK' } });
      const provider = new InMemoryTranslationProvider();

      const result = await executeLocale(collection(), { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 1, skippedCount: 1, skippedKeys: ['items'] });
      expect(read(RESOURCE_ENTRIES_FILENAME).items.fr).toBeUndefined();
    });

    it('reports a translation that dropped a protected term in skippedKeys', async () => {
      const target = collection();
      seedResources(target, { buy: { source: 'Buy an iPhone' }, ok: { source: 'OK' } });
      const provider = new InMemoryTranslationProvider(({ text }) => text.replace('iPhone', 'téléphone'));

      const result = await executeLocale(target, {
        onMutation,
        targetLocale: 'fr',
        provider,
        protectedTerms: ['iPhone'],
      });

      expect(result).toMatchObject({ translatedCount: 1, skippedCount: 1, skippedKeys: ['buy'] });
      expect(read(RESOURCE_ENTRIES_FILENAME).buy.fr).toBeUndefined();
    });

    it('skips a resource whose entry was removed from disk while it was being translated', async () => {
      seedResources(collection(), { ok: { source: 'OK' } });
      const provider = new InMemoryTranslationProvider(({ text }) => {
        const folder = openUnreportedResourceFolder(dir(), { runtime: 'transloco-messageformat', baseLocale: 'en' });
        folder.remove('ok');
        folder.save();
        return text;
      });

      const result = await executeLocale(collection(), { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 0, skippedCount: 1, skippedKeys: ['ok'] });
    });
  });

  it('does not translate a folder the Collection Reader cannot read, and reports it in warnings', async () => {
    writeFolderFiles(dir(), 'broken', { entries: '{ not json' });
    seedResources(collection(), { ok: { source: 'OK' } });

    const result = await executeLocale(collection(), {
      onMutation,
      targetLocale: 'fr',
      provider: new InMemoryTranslationProvider(),
    });

    expect(result).toMatchObject({ totalResources: 1, translatedCount: 1 });
    expect(result.warnings).toEqual([expect.stringContaining("Folder 'broken' was not translated:")]);
    expect(result.warnings[0]).toContain(RESOURCE_ENTRIES_FILENAME);
  });

  it('reports a named protected-terms file that does not exist in warnings', async () => {
    const missing = join(dir(), 'typo.json');
    const named = collection({
      termFiles: { ...collection().termFiles, protectedTerms: { path: missing, explicit: true } },
    });
    seedResources(named, { ok: { source: 'OK' } });

    const result = await executeLocale(named, {
      onMutation,
      targetLocale: 'fr',
      provider: new InMemoryTranslationProvider(),
    });

    expect(result.translatedCount).toBe(1);
    expect(result.warnings).toEqual([`Protected terms file not found: ${missing}. Treating as an empty list.`]);
  });

  it('reports unreadable folders in warnings even when nothing needs translating', async () => {
    writeFolderFiles(dir(), 'broken', { entries: '{ not json' });

    const result = await executeLocale(collection(), { onMutation, targetLocale: 'fr' });

    expect(result.totalResources).toBe(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('throws MISSING_API_KEY when there is work and no provider is injected', async () => {
    seedResources(collection(), { ok: { source: 'OK' } });

    await expect(executeLocale(collection(), { onMutation, targetLocale: 'fr' })).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
      retryable: false,
    });
  });

  it('reports no write when opening the provider fails', async () => {
    seedResources(collection(), { ok: { source: 'OK' } });
    const onMutation = vi.fn();

    await expect(executeLocale(collection(), { targetLocale: 'fr', onMutation })).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
    });

    expect(onMutation).not.toHaveBeenCalled();
  });
});
