import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { ResourceNotFoundError } from '../errors/lingo-tracker-error';
import * as fileIO from '../file-io/json-file-operations';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../resource/resource-folder';
import type { ResourceMutation } from '../resource/resource-mutation';
import { translateExistingResource } from './translate-existing-resource';

describe('translateExistingResource (real fs)', () => {
  const root = useTempDir('translate-existing-real-fs-');
  afterEach(() => vi.restoreAllMocks());
  const collection = () => testCollection(root());
  const automatic = () =>
    testCollection(root(), {
      translationConfig: { enabled: true, provider: 'google-translate', apiKeyEnv: 'ENTRY_WRITE_TEST_KEY' },
    });
  const folder = () => openUnreportedResourceFolder(join(root(), 'buttons'), collection());
  const seed = () =>
    seedResources(collection(), {
      'buttons.ok': { source: 'OK', translations: { fr: { value: 'OK', status: 'new' }, es: 'Aceptar' } },
      'buttons.keep': { source: 'Keep' },
    });

  it('skips all phase-two writes when the base changes and returns fresh disk state', async () => {
    seed();
    const result = await translateExistingResource(automatic(), 'buttons.ok', {
      provider: new InMemoryTranslationProvider(() => {
        const current = folder();
        current.setBase('ok', 'Concurrent');
        current.save();
        return 'Translated';
      }),
    });
    expect(result.translatedCount).toBe(0);
    expect(result.skippedLocales).toEqual(['fr']);
    expect(result.entry?.source).toBe('Concurrent');
    expect(result.entry).toEqual(folder().treeEntry('ok'));
  });

  it('returns translator skips and warnings without writing skipped targets', async () => {
    seedResources(collection(), { 'buttons.ok': { source: '{count, plural, one {One} other {Many}}' } });
    const provider = new InMemoryTranslationProvider();
    const result = await translateExistingResource(
      testCollection(root(), {
        translationConfig: { enabled: true, provider: 'google-translate', apiKeyEnv: 'ENTRY_WRITE_TEST_KEY' },
        termFiles: {
          ...collection().termFiles,
          protectedTerms: { path: join(root(), 'missing.json'), explicit: true },
        },
      }),
      'buttons.ok',
      { provider },
    );
    expect(result.translatedCount).toBe(0);
    expect(result.skippedLocales).toEqual(['fr', 'es']);
    expect(result.warnings).toHaveLength(1);
    expect(provider.calls).toEqual([]);
    expect(result.entry.translations).toEqual({});
  });

  it('skips a target edited during translation and returns its fresh value with unchanged siblings', async () => {
    seed();
    const mutations: ResourceMutation[] = [];
    const result = await translateExistingResource(
      { ...automatic(), onMutation: (mutation) => mutations.push(mutation) ?? automatic().onMutation },
      'buttons.ok',
      {
        provider: new InMemoryTranslationProvider(() => {
          const current = folder();
          current.setTranslation('ok', 'fr', 'Manual', 'verified');
          current.setBase('sibling', 'Sibling');
          current.save();
          return 'Translated';
        }),
      },
    );
    expect(result.translatedCount).toBe(0);
    expect(result.skippedLocales).toEqual(['fr']);
    expect(result.entry.translations).toEqual({ fr: 'Manual', es: 'Aceptar' });
    expect(result.entry.metadata['fr'].status).toBe('verified');
    expect(result.entry).toEqual(folder().treeEntry('ok'));
    expect(folder().has('sibling')).toBe(true);
    expect(mutations).toEqual([]);
  });

  it('throws for an entry deleted during a translate write without resurrecting it', async () => {
    seed();
    const mutations: ResourceMutation[] = [];
    await expect(
      translateExistingResource(
        { ...automatic(), onMutation: (mutation) => mutations.push(mutation) ?? automatic().onMutation },
        'buttons.ok',
        {
          provider: new InMemoryTranslationProvider(() => {
            const current = folder();
            current.remove('ok');
            current.save();
            return 'Translated';
          }),
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
    expect(folder().has('ok')).toBe(false);
    expect(folder().has('keep')).toBe(true);
    expect(mutations).toEqual([]);
  });

  it('reports reindex and rethrows a failing translate write-back save', async () => {
    seed();
    const mutations: ResourceMutation[] = [];
    const failure = new Error('second file failed');
    const original = fileIO.writeJsonFile;
    let writes = 0;
    vi.spyOn(fileIO, 'writeJsonFile').mockImplementation((params) => {
      writes++;
      if (writes === 2) throw failure;
      return original(params);
    });
    await expect(
      translateExistingResource(
        { ...automatic(), onMutation: (mutation) => mutations.push(mutation) ?? automatic().onMutation },
        'buttons.ok',
        { provider: new InMemoryTranslationProvider() },
      ),
    ).rejects.toBe(failure);
    expect(writes).toBe(2);
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: root() }]);
    expect(folder().get('ok')?.entry['fr']).toBe('[fr] OK');
    expect(folder().get('ok')?.meta?.['fr'].status).toBe('new');
    expect(folder().has('keep')).toBe(true);
  });
});
