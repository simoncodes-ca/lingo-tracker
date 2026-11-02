import { validateKey } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import { testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
import { prepareTranslationRun } from '../translation/translation-run';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from './resource-folder';

// Stored keys use path resolution, not the submitted-key validation seam.
describe('locale translation of stored keys', () => {
  const root = useTempDir('stored-key-translation-');

  it('translates and saves valid siblings and a malformed stored key in the same batch', async () => {
    const collection = testCollection(root(), {
      locales: ['en', 'fr'],
      translationConfig: {
        enabled: true,
        provider: 'google-translate',
        apiKeyEnv: 'STORED_KEY_TRANSLATION_SPEC_KEY',
        batchSize: 10,
        delayMs: 0,
      },
    });
    writeFolderFiles(root(), '', {
      entries: {
        first: { source: 'First' },
        'bad@key': { source: 'Stored' },
        last: { source: 'Last' },
      },
    });
    expect(() => validateKey('bad@key')).toThrow('Invalid key segment');
    const provider = new InMemoryTranslationProvider();
    const result = await prepareTranslationRun(collection, { provider }).forLocale('fr').execute();
    expect(result).toMatchObject({ outcome: 'succeeded', totalResources: 3, translatedCount: 3, failedCount: 0 });
    expect(provider.calls).toEqual([
      [
        { text: 'First', sourceLocale: 'en', targetLocale: 'fr' },
        { text: 'Stored', sourceLocale: 'en', targetLocale: 'fr' },
        { text: 'Last', sourceLocale: 'en', targetLocale: 'fr' },
      ],
    ]);
    const reopened = openUnreportedResourceFolder(root(), collection);
    for (const [key, source] of [
      ['first', 'First'],
      ['bad@key', 'Stored'],
      ['last', 'Last'],
    ]) {
      expect(reopened.get(key)?.entry).toEqual({ source, fr: `[fr] ${source}` });
      expect(reopened.get(key)?.meta?.['fr']?.status).toBe('translated');
    }
  });
});
