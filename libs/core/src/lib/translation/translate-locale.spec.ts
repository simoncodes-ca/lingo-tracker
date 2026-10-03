import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationConfig } from '../../config/translation-config';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import type { Collection } from '../config/open-collection';
import {
  AutoTranslationDisabledError,
  CannotTranslateBaseLocaleError,
  TranslationError,
  TranslationLocaleNotConfiguredError,
} from '../errors/lingo-tracker-error';
import { writeJsonFile } from '../file-io/json-file-operations';
import { openResourceFolder } from '../resource/resource-folder';
import type { ResourceMutation } from '../resource/resource-mutation';
import { InMemoryTranslationProvider } from './in-memory-translation-provider';
import { assertCanTranslateLocale, type TranslateLocaleProgress, translateLocale } from './translate-locale';

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

const AUTO: TranslationConfig = {
  enabled: true,
  provider: 'google-translate',
  apiKeyEnv: 'TRANSLATE_LOCALE_SPEC_KEY',
  delayMs: 0,
};

describe('translateLocale', () => {
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

  describe('start-time preconditions', () => {
    it('accepts an enabled collection and a configured target locale', async () => {
      expect(() => assertCanTranslateLocale(collection(), 'fr')).not.toThrow();
      await expect(translateLocale(collection(), { onMutation, targetLocale: 'fr' })).resolves.toMatchObject({
        totalResources: 0,
      });
    });

    it('rejects disabled auto-translation before checking the locale', async () => {
      const target = collection({ translationConfig: undefined });
      expect(() => assertCanTranslateLocale(target, 'en')).toThrow(AutoTranslationDisabledError);
      await expect(translateLocale(target, { onMutation, targetLocale: 'en' })).rejects.toThrow(
        AutoTranslationDisabledError,
      );
    });

    it('rejects the base locale with the CLI message', async () => {
      const target = collection();
      expect(() => assertCanTranslateLocale(target, 'en')).toThrow(CannotTranslateBaseLocaleError);
      await expect(translateLocale(target, { onMutation, targetLocale: 'en' })).rejects.toThrow(
        'Cannot translate to the base locale "en".',
      );
    });

    it('rejects an unknown locale with the available locales', async () => {
      const target = collection();
      expect(() => assertCanTranslateLocale(target, 'de')).toThrow(TranslationLocaleNotConfiguredError);
      await expect(translateLocale(target, { onMutation, targetLocale: 'de' })).rejects.toThrow(
        'Locale "de" is not configured. Available locales: en, fr',
      );
    });
  });

  describe('when nothing needs translating', () => {
    it('returns zeros for an empty collection, without an API key', async () => {
      const result = await translateLocale(collection(), { onMutation, targetLocale: 'fr' });

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

      const result = await translateLocale(collection(), { onMutation, targetLocale: 'fr' });

      expect(result.totalResources).toBe(0);
    });

    it.each([
      undefined,
      { ...AUTO, enabled: false },
    ])('still refuses a collection whose translation config is %j', async (translationConfig) => {
      await expect(
        translateLocale(collection({ translationConfig }), { onMutation, targetLocale: 'fr' }),
      ).rejects.toThrow(AutoTranslationDisabledError);
    });
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
    const folder = openResourceFolder(dir(), { baseLocale: 'en' });
    folder.setBase('old', 'Older');
    folder.save();
    const provider = new InMemoryTranslationProvider();

    const result = await translateLocale(target, { onMutation, targetLocale: 'fr', provider });

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

    const result = await translateLocale(target, { onMutation, targetLocale: 'fr', provider });

    expect(result.translatedCount).toBe(2);
    expect(collected).toEqual([
      { kind: 'reindex', translationsFolder: dir() },
      { kind: 'reindex', translationsFolder: dir() },
    ]);
    expect(read(RESOURCE_ENTRIES_FILENAME, 'dialogs').greet.fr).toBe('Bonjour {name}');
    expect(read(RESOURCE_ENTRIES_FILENAME, 'buttons').ok.fr).toBe('OK');
    expect(read(TRACKER_META_FILENAME, 'buttons').ok.fr.status).toBe('translated');
  });

  it('keeps translated for a provider result identical to the base', async () => {
    const target = collection();
    seedResources(target, { ok: { source: 'OK', translations: { fr: { value: 'OK', status: 'new' } } } });

    const result = await translateLocale(target, {
      onMutation,
      targetLocale: 'fr',
      provider: new InMemoryTranslationProvider(() => 'OK'),
    });

    expect(result.translatedCount).toBe(1);
    expect(read(TRACKER_META_FILENAME).ok.fr.status).toBe('translated');
    expect((await translateLocale(target, { onMutation, targetLocale: 'fr' })).totalResources).toBe(0);
  });

  describe('batches', () => {
    it('reports each save when separate batches write the collection', async () => {
      seedResources(collection(), { a: { source: 'A' }, b: { source: 'B' } });
      const writes: ResourceMutation[] = [];

      const result = await translateLocale(withBatchSize(1), {
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

      await translateLocale(withBatchSize(1), {
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
      const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
        '../file-io/json-file-operations',
      );
      const writer = vi.mocked(writeJsonFile);
      writer.mockImplementation((options) => {
        if (options.filePath.endsWith(join('second', TRACKER_META_FILENAME))) {
          throw new Error('second metadata write failed');
        }
        actual.writeJsonFile(options);
      });
      const events: string[] = [];

      let result: Awaited<ReturnType<typeof translateLocale>>;
      try {
        result = await translateLocale(withBatchSize(1), {
          targetLocale: 'fr',
          provider: new InMemoryTranslationProvider(),
          onMutation: (mutation) => events.push(mutation.kind),
          onProgress: (progress) => events.push(`batch ${progress.currentBatch}`),
        });
      } finally {
        writer.mockImplementation(actual.writeJsonFile);
      }

      expect(result.failedCount).toBe(1);
      expect(result.failures).toEqual([{ key: 'second.cancel', error: 'second metadata write failed' }]);
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
      const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
        '../file-io/json-file-operations',
      );
      const writer = vi.mocked(writeJsonFile);
      writer.mockImplementation((options) => {
        if (options.filePath.endsWith(join('second', RESOURCE_ENTRIES_FILENAME))) {
          throw new Error('second write failed');
        }
        actual.writeJsonFile(options);
      });
      const progress: TranslateLocaleProgress[] = [];
      try {
        const result = await translateLocale(target, {
          targetLocale: 'fr',
          provider: new InMemoryTranslationProvider(),
          onProgress: (event) => progress.push(event),
        });
        expect(result).toMatchObject({ totalResources: 4, translatedCount: 1, failedCount: 3, skippedCount: 0 });
        expect(result.translatedCount + result.failedCount + result.skippedCount).toBe(result.totalResources);
        expect(result.failures).toEqual([
          { key: 'second.cancel', error: 'second write failed' },
          { key: 'second.close', error: 'second write failed' },
          { key: 'second.items', error: 'second write failed' },
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
        writer.mockImplementation(actual.writeJsonFile);
      }
    });

    it('reports saved folders through onMutation before a later failure', async () => {
      seedResources(collection(), { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
      const reported: ResourceMutation[] = [];

      await expect(
        translateLocale(withBatchSize(1), {
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
      const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
        '../file-io/json-file-operations',
      );
      const writer = vi.mocked(writeJsonFile);
      writer.mockImplementation((options) => {
        if (options.filePath.endsWith(join('second', TRACKER_META_FILENAME))) {
          throw new Error('second metadata write failed');
        }
        actual.writeJsonFile(options);
      });
      const writes: ResourceMutation[] = [];

      let result: Awaited<ReturnType<typeof translateLocale>>;
      try {
        result = await translateLocale(withBatchSize(5), {
          targetLocale: 'fr',
          provider: new InMemoryTranslationProvider(),
          onMutation: (mutation) => writes.push(mutation),
        });
      } finally {
        writer.mockImplementation(actual.writeJsonFile);
      }

      expect(result.failedCount).toBe(1);
      expect(result.failures).toEqual([{ key: 'second.cancel', error: 'second metadata write failed' }]);
      expect(result.outcome).toBe('failed');
      expect(writes).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
      expect(read(RESOURCE_ENTRIES_FILENAME, 'second').cancel.fr).toBe('[fr] Cancel');
      expect(read(TRACKER_META_FILENAME, 'second')).toEqual(originalMeta);
    });

    it('continues with later batches after a folder save fails', async () => {
      seedResources(collection(), { 'first.ok': { source: 'OK' }, 'second.cancel': { source: 'Cancel' } });
      const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
        '../file-io/json-file-operations',
      );
      const writer = vi.mocked(writeJsonFile);
      writer.mockImplementation((options) => {
        if (options.filePath.endsWith(join('first', TRACKER_META_FILENAME))) {
          throw new Error('first metadata write failed');
        }
        actual.writeJsonFile(options);
      });

      let result: Awaited<ReturnType<typeof translateLocale>>;
      try {
        result = await translateLocale(withBatchSize(1), {
          onMutation,
          targetLocale: 'fr',
          provider: new InMemoryTranslationProvider(),
        });
      } finally {
        writer.mockImplementation(actual.writeJsonFile);
      }

      expect(result.failedCount).toBe(1);
      expect(result.failures).toEqual([{ key: 'first.ok', error: 'first metadata write failed' }]);
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

      await translateLocale(withBatchSize(2), {
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

      const result = await translateLocale(withBatchSize(2), { onMutation, targetLocale: 'fr', provider });

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

      const result = await translateLocale(withBatchSize(1), { onMutation, targetLocale: 'fr', provider });

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
        const folder = openResourceFolder(dir(), { baseLocale: 'en' });
        folder.setTranslation('ok', 'fr', 'Humain', 'translated');
        folder.save();
        return 'Machine';
      });

      const result = await translateLocale(target, { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 0, skippedCount: 1, skippedKeys: ['ok'] });
      expect(read(RESOURCE_ENTRIES_FILENAME).ok.fr).toBe('Humain');
      expect(read(TRACKER_META_FILENAME).ok.fr.status).toBe('translated');
    });

    it('preserves a sibling entry written during the provider call', async () => {
      const target = collection();
      seedResources(target, { 'common.ok': { source: 'OK' } });
      const provider = new InMemoryTranslationProvider(() => {
        const folder = openResourceFolder(join(dir(), 'common'), target);
        folder.setBase('cancel', 'Cancel');
        folder.setTranslation('cancel', 'fr', 'Annuler', 'verified');
        folder.save();
        return 'Bien';
      });

      const result = await translateLocale(target, { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 1, skippedCount: 0 });
      expect(read(RESOURCE_ENTRIES_FILENAME, 'common').cancel).toEqual({ source: 'Cancel', fr: 'Annuler' });
      expect(read(TRACKER_META_FILENAME, 'common').cancel.fr.status).toBe('verified');
      expect(collected).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
    });

    it('preserves a target marked verified during the provider call', async () => {
      const target = collection();
      seedResources(target, { ok: { source: 'OK', translations: { fr: { value: 'OK', status: 'new' } } } });
      const provider = new InMemoryTranslationProvider(() => {
        const folder = openResourceFolder(dir(), { baseLocale: 'en' });
        folder.setStatus('ok', 'fr', 'verified');
        folder.save();
        return 'Machine';
      });

      const result = await translateLocale(target, { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 0, skippedCount: 1, skippedKeys: ['ok'] });
      expect(read(RESOURCE_ENTRIES_FILENAME).ok.fr).toBe('OK');
      expect(read(TRACKER_META_FILENAME).ok.fr.status).toBe('verified');
    });

    it('skips an old translation when the base value changes during the provider call', async () => {
      const target = collection();
      seedResources(target, { ok: { source: 'Old', translations: { fr: 'Old' } } });
      const initialFolder = openResourceFolder(dir(), { baseLocale: 'en' });
      initialFolder.setBase('ok', 'Older');
      initialFolder.save();
      const provider = new InMemoryTranslationProvider(({ text }) => {
        const folder = openResourceFolder(dir(), { baseLocale: 'en' });
        folder.setBase('ok', 'New');
        folder.save();
        return `[fr] ${text}`;
      });

      const result = await translateLocale(target, { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ totalResources: 1, translatedCount: 0, skippedCount: 1, skippedKeys: ['ok'] });
      expect(read(RESOURCE_ENTRIES_FILENAME).ok).toMatchObject({ source: 'New', fr: 'Old' });
      expect(read(TRACKER_META_FILENAME).ok.fr.status).toBe('stale');
    });

    it('reports complex ICU resources in skippedKeys and leaves them untouched', async () => {
      const plural = '{count, plural, one {# item} other {# items}}';
      seedResources(collection(), { items: { source: plural }, ok: { source: 'OK' } });
      const provider = new InMemoryTranslationProvider();

      const result = await translateLocale(collection(), { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 1, skippedCount: 1, skippedKeys: ['items'] });
      expect(read(RESOURCE_ENTRIES_FILENAME).items.fr).toBeUndefined();
    });

    it('reports a translation that dropped a protected term in skippedKeys', async () => {
      const target = collection();
      seedResources(target, { buy: { source: 'Buy an iPhone' }, ok: { source: 'OK' } });
      const provider = new InMemoryTranslationProvider(({ text }) => text.replace('iPhone', 'téléphone'));

      const result = await translateLocale(target, {
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
        const folder = openResourceFolder(dir(), { baseLocale: 'en' });
        folder.remove('ok');
        folder.save();
        return text;
      });

      const result = await translateLocale(collection(), { onMutation, targetLocale: 'fr', provider });

      expect(result).toMatchObject({ translatedCount: 0, skippedCount: 1, skippedKeys: ['ok'] });
    });
  });

  it('does not translate a folder the Collection Reader cannot read, and reports it in warnings', async () => {
    writeFolderFiles(dir(), 'broken', { entries: '{ not json' });
    seedResources(collection(), { ok: { source: 'OK' } });

    const result = await translateLocale(collection(), {
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

    const result = await translateLocale(named, {
      onMutation,
      targetLocale: 'fr',
      provider: new InMemoryTranslationProvider(),
    });

    expect(result.translatedCount).toBe(1);
    expect(result.warnings).toEqual([`Protected terms file not found: ${missing}. Treating as an empty list.`]);
  });

  it('reports unreadable folders in warnings even when nothing needs translating', async () => {
    writeFolderFiles(dir(), 'broken', { entries: '{ not json' });

    const result = await translateLocale(collection(), { onMutation, targetLocale: 'fr' });

    expect(result.totalResources).toBe(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('throws MISSING_API_KEY when there is work and no provider is injected', async () => {
    seedResources(collection(), { ok: { source: 'OK' } });

    await expect(translateLocale(collection(), { onMutation, targetLocale: 'fr' })).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
      retryable: false,
    });
  });

  it('reports no write when opening the provider fails', async () => {
    seedResources(collection(), { ok: { source: 'OK' } });
    const onMutation = vi.fn();

    await expect(translateLocale(collection(), { targetLocale: 'fr', onMutation })).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
    });

    expect(onMutation).not.toHaveBeenCalled();
  });
});
