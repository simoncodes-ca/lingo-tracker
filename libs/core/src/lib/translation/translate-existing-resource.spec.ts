import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationConfig } from '../../config/translation-config';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import type { Collection } from '../config/open-collection';
import { AutoTranslationDisabledError, ResourceNotFoundError, TranslationError } from '../errors/lingo-tracker-error';
import { writeJsonFile } from '../file-io/json-file-operations';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../resource/resource-folder';
import type { ResourceMutation } from '../resource/resource-mutation';
import { translateExistingResource } from './translate-existing-resource';

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
  apiKeyEnv: 'TRANSLATE_EXISTING_SPEC_KEY',
};

describe('translateExistingResource', () => {
  const dir = useTempDir('translate-existing-');

  function collection(overrides: Partial<Collection> = {}): Collection {
    return testCollection(dir(), { locales: ['en', 'fr', 'es', 'de'], translationConfig: AUTO, ...overrides });
  }

  function read(file: string, ...segments: string[]) {
    return JSON.parse(readFileSync(join(dir(), ...segments, file), 'utf8'));
  }

  /** `common.save`: fr translated, es new (copy), de missing. */
  function seedSave(target: Collection, source = 'Save'): void {
    seedResources(target, {
      'common.save': {
        source,
        translations: { fr: 'Sauvegarder', es: { value: source, status: 'new' } },
      },
    });
  }

  it('reports a named protected-terms file that does not exist in warnings', async () => {
    const missing = join(dir(), 'typo.json');
    const named = collection({
      termFiles: { ...collection().termFiles, protectedTerms: { path: missing, explicit: true } },
    });
    seedSave(named);

    const result = await translateExistingResource(
      { ...named, onMutation: onMutation ?? named.onMutation },
      'common.save',
      { provider: new InMemoryTranslationProvider() },
    );

    expect(result.translatedCount).toBe(2);
    expect(result.warnings).toEqual([`Protected terms file not found: ${missing}. Treating as an empty list.`]);
  });

  it('throws AutoTranslationDisabledError when auto-translation is disabled', async () => {
    const disabled = collection({ translationConfig: { ...AUTO, enabled: false } });
    seedSave(disabled);

    await expect(
      translateExistingResource({ ...disabled, onMutation: onMutation ?? disabled.onMutation }, 'common.save', {}),
    ).rejects.toThrow(AutoTranslationDisabledError);
  });

  it('throws MISSING_API_KEY when no provider is injected and the env var is unset', async () => {
    const target = collection();
    seedSave(target);

    await expect(
      translateExistingResource({ ...target, onMutation: onMutation ?? target.onMutation }, 'common.save', {}),
    ).rejects.toThrow(TranslationError);
  });

  it('returns without an API key when no locale needs work', async () => {
    const target = collection({ locales: ['en', 'fr'] });
    seedResources(target, { 'common.save': { source: 'Save', translations: { fr: 'Sauvegarder' } } });

    const result = await translateExistingResource(
      { ...target, onMutation: onMutation ?? target.onMutation },
      'common.save',
      {},
    );

    expect(result).toMatchObject({ translatedCount: 0, skippedLocales: [] });
    expect(collected).toEqual([]);
  });

  it('throws ResourceNotFoundError when the folder or the entry does not exist', async () => {
    const target = collection();
    seedSave(target);
    const provider = new InMemoryTranslationProvider();

    await expect(
      translateExistingResource({ ...target, onMutation: onMutation ?? target.onMutation }, 'nowhere.save', {
        provider,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
    await expect(
      translateExistingResource({ ...target, onMutation: onMutation ?? target.onMutation }, 'common.missing', {
        provider,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('translates only the locales that need work (new, stale, or no metadata), with status translated', async () => {
    const target = collection();
    seedResources(target, {
      'common.save': {
        source: 'Save',
        translations: {
          fr: { value: 'Sauvegarder', status: 'verified' },
          es: { value: 'Save', status: 'new' },
        },
      },
    });
    const provider = new InMemoryTranslationProvider();

    const result = await translateExistingResource(
      { ...target, onMutation: onMutation ?? target.onMutation },
      'common.save',
      { provider },
    );

    expect(provider.calls.map((call) => call.map(({ targetLocale }) => targetLocale))).toEqual([['es'], ['de']]);
    expect(result.translatedCount).toBe(2);
    expect(result.skippedLocales).toEqual([]);
    expect(read(RESOURCE_ENTRIES_FILENAME, 'common').save).toEqual({
      source: 'Save',
      fr: 'Sauvegarder',
      es: '[es] Save',
      de: '[de] Save',
    });
    const meta = read(TRACKER_META_FILENAME, 'common').save;
    expect(meta.fr.status).toBe('verified');
    expect(meta.es.status).toBe('translated');
    expect(meta.de.status).toBe('translated');
    expect(result.entry.translations).toMatchObject({ es: '[es] Save', de: '[de] Save' });
    expect(collected).toEqual([{ kind: 'upsert', translationsFolder: dir(), key: 'common.save', entry: result.entry }]);
  });

  it('translates a stale locale', async () => {
    const target = collection({ locales: ['en', 'fr'] });
    seedResources(target, { 'common.save': { source: 'Save', translations: { fr: 'Sauvegarder' } } });
    const folder = openUnreportedResourceFolder(join(dir(), 'common'), {
      runtime: 'transloco-messageformat',
      baseLocale: 'en',
    });
    folder.setBase('save', 'Save all');
    folder.save();
    expect(read(TRACKER_META_FILENAME, 'common').save.fr.status).toBe('stale');
    const provider = new InMemoryTranslationProvider(() => 'Tout sauvegarder');

    const result = await translateExistingResource(
      { ...target, onMutation: onMutation ?? target.onMutation },
      'common.save',
      { provider },
    );

    expect(result.translatedCount).toBe(1);
    expect(read(RESOURCE_ENTRIES_FILENAME, 'common').save.fr).toBe('Tout sauvegarder');
    expect(read(TRACKER_META_FILENAME, 'common').save.fr.status).toBe('translated');
  });

  it('stores translated when the translator returns the base value and skips it on the next run', async () => {
    const target = collection({ locales: ['en', 'fr'] });
    seedResources(target, {
      'common.save': { source: 'Save', translations: { fr: { value: 'Save', status: 'new' } } },
    });

    const result = await translateExistingResource(
      { ...target, onMutation: onMutation ?? target.onMutation },
      'common.save',
      { provider: new InMemoryTranslationProvider(() => 'Save') },
    );

    expect(result.translatedCount).toBe(1);
    expect(read(TRACKER_META_FILENAME, 'common').save.fr.status).toBe('translated');
    expect(
      (await translateExistingResource({ ...target, onMutation: onMutation ?? target.onMutation }, 'common.save', {}))
        .translatedCount,
    ).toBe(0);
  });

  it('returns the current entry and writes nothing when no locale needs work', async () => {
    const target = collection({ locales: ['en', 'fr'] });
    seedResources(target, { 'common.save': { source: 'Save', translations: { fr: 'Sauvegarder' } } });
    const before = readFileSync(join(dir(), 'common', TRACKER_META_FILENAME), 'utf8');
    const provider = new InMemoryTranslationProvider();

    const result = await translateExistingResource(
      { ...target, onMutation: onMutation ?? target.onMutation },
      'common.save',
      { provider },
    );

    expect(result).toMatchObject({ translatedCount: 0, skippedLocales: [] });
    expect(collected).toEqual([]);
    expect(result.entry.source).toBe('Save');
    expect(provider.calls).toEqual([]);
    expect(readFileSync(join(dir(), 'common', TRACKER_META_FILENAME), 'utf8')).toBe(before);
  });

  it('reports complex ICU locales as skipped and leaves them untouched', async () => {
    const target = collection();
    const plural = '{count, plural, one {# file} other {# files}}';
    seedSave(target, plural);
    const provider = new InMemoryTranslationProvider();

    const result = await translateExistingResource(
      { ...target, onMutation: onMutation ?? target.onMutation },
      'common.save',
      { provider },
    );

    expect(result.translatedCount).toBe(0);
    expect(result.skippedLocales).toEqual(['es', 'de']);
    expect(collected).toEqual([]);
    expect(read(RESOURCE_ENTRIES_FILENAME, 'common').save.es).toBe(plural);
  });

  it('skips a locale whose translation dropped a protected term', async () => {
    const target = collection({ locales: ['en', 'fr', 'es'] });
    seedResources(target, { 'common.buy': { source: 'Buy an iPhone' } });
    const provider = new InMemoryTranslationProvider(({ targetLocale }) =>
      targetLocale === 'fr' ? 'Acheter un téléphone' : 'Comprar un iPhone',
    );

    const result = await translateExistingResource(
      { ...target, onMutation: onMutation ?? target.onMutation },
      'common.buy',
      { provider, protectedTerms: ['iPhone'] },
    );

    expect(result.skippedLocales).toEqual(['fr']);
    expect(read(RESOURCE_ENTRIES_FILENAME, 'common').buy).toEqual({ source: 'Buy an iPhone', es: 'Comprar un iPhone' });
  });

  it('stores values normalised to ICU, even when the stored base value is Transloco syntax', async () => {
    const target = collection({ locales: ['en', 'fr'] });
    seedResources(target, { 'common.greet': { source: 'Hello {{ name }}' } });
    const provider = new InMemoryTranslationProvider(({ text }) => text.replace('Hello', 'Bonjour'));

    await translateExistingResource({ ...target, onMutation: onMutation ?? target.onMutation }, 'common.greet', {
      provider,
    });

    expect(read(RESOURCE_ENTRIES_FILENAME, 'common').greet.fr).toBe('Bonjour {name}');
  });
  describe('writes made during the provider call', () => {
    function prepare(): Collection {
      const target = collection({ locales: ['en', 'fr', 'es'] });
      seedResources(target, {
        'common.save': { source: 'Save', translations: { fr: { value: 'Save', status: 'new' } } },
      });
      return target;
    }

    it('preserves a sibling added meanwhile and reports one upsert with the fresh entry', async () => {
      const target = prepare();
      const provider = new InMemoryTranslationProvider(({ targetLocale }) => {
        const folder = openUnreportedResourceFolder(join(dir(), 'common'), target);
        folder.setBase('cancel', 'Cancel');
        folder.setDetails('save', { comment: 'Added meanwhile' });
        folder.save();
        return `[${targetLocale}] Save`;
      });
      const result = await translateExistingResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        'common.save',
        { provider },
      );

      expect(result.translatedCount).toBe(2);
      expect(read(RESOURCE_ENTRIES_FILENAME, 'common').cancel).toEqual({ source: 'Cancel' });
      expect(result.entry.comment).toBe('Added meanwhile');
      expect(collected).toEqual([
        { kind: 'upsert', translationsFolder: dir(), key: 'common.save', entry: result.entry },
      ]);
    });

    it('keeps a manual fr translation and reports it in skippedLocales', async () => {
      const target = prepare();
      const provider = new InMemoryTranslationProvider(({ targetLocale }) => {
        const folder = openUnreportedResourceFolder(join(dir(), 'common'), target);
        folder.setTranslation('save', 'fr', 'Humain', 'translated');
        folder.save();
        return targetLocale === 'es' ? 'Guardar' : 'Machine';
      });
      const result = await translateExistingResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        'common.save',
        { provider },
      );

      expect(result.translatedCount).toBe(1);
      expect(result.skippedLocales).toEqual(['fr']);
      expect(result.entry.translations).toEqual({ fr: 'Humain', es: 'Guardar' });
      expect(read(RESOURCE_ENTRIES_FILENAME, 'common').save.fr).toBe('Humain');
      expect(read(TRACKER_META_FILENAME, 'common').save.fr.status).toBe('translated');
      expect(collected).toEqual([
        { kind: 'upsert', translationsFolder: dir(), key: 'common.save', entry: result.entry },
      ]);
    });

    it('skips all pending translations after a base change and returns the entry on disk', async () => {
      const target = prepare();
      const provider = new InMemoryTranslationProvider(() => {
        const folder = openUnreportedResourceFolder(join(dir(), 'common'), target);
        folder.setBase('save', 'Save all');
        folder.save();
        return 'Machine';
      });
      const result = await translateExistingResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        'common.save',
        { provider },
      );

      expect(result.translatedCount).toBe(0);
      expect(result.skippedLocales).toEqual(['fr', 'es']);
      expect(result.entry).toEqual(openUnreportedResourceFolder(join(dir(), 'common'), target).treeEntry('save'));
      expect(result.entry.source).toBe('Save all');
      expect(collected).toEqual([]);
    });

    it('throws ResourceNotFoundError after deletion without resurrecting the entry', async () => {
      const target = prepare();
      const provider = new InMemoryTranslationProvider(() => {
        const folder = openUnreportedResourceFolder(join(dir(), 'common'), target);
        folder.remove('save');
        folder.save();
        return 'Machine';
      });
      await expect(
        translateExistingResource({ ...target, onMutation: onMutation ?? target.onMutation }, 'common.save', {
          provider,
        }),
      ).rejects.toThrow(ResourceNotFoundError);
      expect(openUnreportedResourceFolder(join(dir(), 'common'), target).has('save')).toBe(false);
      expect(collected).toEqual([]);
    });

    it('reports translator skips before locales changed on disk', async () => {
      const target = prepare();
      const provider = new InMemoryTranslationProvider(({ targetLocale }) => {
        const folder = openUnreportedResourceFolder(join(dir(), 'common'), target);
        folder.setTranslation('save', 'fr', 'Humain', 'new');
        folder.save();
        return targetLocale === 'es' ? 'Machine' : 'Save';
      });
      const result = await translateExistingResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        'common.save',
        { provider, protectedTerms: ['Save'] },
      );
      expect(result.translatedCount).toBe(0);
      expect(result.skippedLocales).toEqual(['es', 'fr']);
      expect(result.entry.translations['fr']).toBe('Humain');
      expect(collected).toEqual([]);
    });
  });
  it('rethrows the original provider failure from a one-row Translation Run', async () => {
    const target = collection();
    seedSave(target);
    const error = new TranslationError('original provider failure', 'TIMEOUT', true);
    const provider = new InMemoryTranslationProvider(({ targetLocale }) => {
      throw targetLocale === 'es' ? error : new Error('later provider failure');
    });
    await expect(
      translateExistingResource({ ...target, onMutation: onMutation ?? target.onMutation }, 'common.save', {
        provider,
      }),
    ).rejects.toBe(error);
    expect(provider.calls).toEqual([
      [{ text: 'Save', sourceLocale: 'en', targetLocale: 'es' }],
      [{ text: 'Save', sourceLocale: 'en', targetLocale: 'de' }],
    ]);
    expect(collected).toEqual([]);
    expect(read(RESOURCE_ENTRIES_FILENAME, 'common').save).toEqual({ source: 'Save', fr: 'Sauvegarder', es: 'Save' });
  });

  it('rethrows the original write failure from a one-row Translation Run', async () => {
    const target = collection();
    seedSave(target);
    const metadataPath = join(dir(), 'common', TRACKER_META_FILENAME);
    const provider = new InMemoryTranslationProvider(({ targetLocale, text }) => {
      return `[${targetLocale}] ${text}`;
    });
    const { error, restore } = await failWrite(metadataPath);
    try {
      await expect(
        translateExistingResource({ ...target, onMutation: onMutation ?? target.onMutation }, 'common.save', {
          provider,
        }),
      ).rejects.toBe(error);
    } finally {
      restore();
    }
    expect(provider.calls).toEqual([
      [{ text: 'Save', sourceLocale: 'en', targetLocale: 'es' }],
      [{ text: 'Save', sourceLocale: 'en', targetLocale: 'de' }],
    ]);
    expect(collected).toEqual([{ kind: 'reindex', translationsFolder: dir() }]);
    expect(read(RESOURCE_ENTRIES_FILENAME, 'common').save.es).toBe('[es] Save');
  });
});
