import { describe, it, expect, beforeEach, vi } from 'vitest';
import { translateExistingResource } from './translate-existing-resource';
import * as fs from 'node:fs';
import { type SafeAny, RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import type { TranslationConfig } from '../../config/translation-config';

vi.mock('node:fs');
vi.mock('./auto-translate-resources');

import { autoTranslateResource } from './auto-translate-resources';

describe('translateExistingResource', () => {
  const translationsFolder = 'translations';
  const cwd = '/test';

  const enabledTranslationConfig: TranslationConfig = {
    enabled: true,
    provider: 'google-translate',
    apiKeyEnv: 'GOOGLE_TRANSLATE_API_KEY',
  };

  const baseResourceEntries = {
    save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
  };

  const _baseTrackerMeta = {
    save: {
      en: { checksum: 'base_hash' },
      'fr-ca': { checksum: 'fr_hash', baseChecksum: 'base_hash', status: 'translated' },
      es: { checksum: 'es_empty_hash', baseChecksum: 'base_hash', status: 'new' },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    vi.mocked(autoTranslateResource).mockResolvedValue({
      translations: [],
      skippedLocales: [],
    });
  });

  function mockFileSystem(resourceEntries: SafeAny, trackerMeta: SafeAny) {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: SafeAny) => {
      if ((filePath as string).includes(RESOURCE_ENTRIES_FILENAME)) {
        return JSON.stringify(resourceEntries);
      }
      if ((filePath as string).includes(TRACKER_META_FILENAME)) {
        return JSON.stringify(trackerMeta);
      }
      return '{}';
    });
  }

  it('should throw when the resource files do not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(
      translateExistingResource({
        key: 'buttons.save',
        translationsFolder,
        translationConfig: enabledTranslationConfig,
        allLocales: ['en', 'fr-ca', 'es'],
        baseLocale: 'en',
        cwd,
      }),
    ).rejects.toThrow(/Resource not found/);
  });

  it('should throw when the entry key is not present in the files', async () => {
    mockFileSystem({}, {});

    await expect(
      translateExistingResource({
        key: 'buttons.save',
        translationsFolder,
        translationConfig: enabledTranslationConfig,
        allLocales: ['en', 'fr-ca'],
        baseLocale: 'en',
        cwd,
      }),
    ).rejects.toThrow(/Resource not found/);
  });

  it('should return translatedCount 0 when no locales have new or stale status', async () => {
    const allTranslatedMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'base_hash', status: 'translated' },
        es: { checksum: 'es_hash', baseChecksum: 'base_hash', status: 'verified' },
      },
    };
    mockFileSystem(baseResourceEntries, allTranslatedMeta);

    const result = await translateExistingResource({
      key: 'buttons.save',
      translationsFolder,
      translationConfig: enabledTranslationConfig,
      allLocales: ['en', 'fr-ca', 'es'],
      baseLocale: 'en',
      cwd,
    });

    expect(result.translatedCount).toBe(0);
    expect(result.skippedLocales).toEqual([]);
    expect(autoTranslateResource).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should return the current entry when no locales need translation', async () => {
    const resourceEntries = { save: { source: 'Save', 'fr-ca': 'Sauvegarder' } };
    const allVerifiedMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'base_hash', status: 'verified' },
      },
    };
    mockFileSystem(resourceEntries, allVerifiedMeta);

    const result = await translateExistingResource({
      key: 'buttons.save',
      translationsFolder,
      translationConfig: enabledTranslationConfig,
      allLocales: ['en', 'fr-ca'],
      baseLocale: 'en',
      cwd,
    });

    expect(result.entry.key).toBe('save');
    expect(result.entry.source).toBe('Save');
    expect(result.entry.translations['fr-ca']).toBe('Sauvegarder');
  });

  it('should translate locales with new status', async () => {
    const newLocaleMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'base_hash', status: 'new' },
        es: { checksum: 'es_hash', baseChecksum: 'base_hash', status: 'new' },
      },
    };
    const resourceEntries = { save: { source: 'Save', 'fr-ca': 'Save', es: 'Save' } };
    mockFileSystem(resourceEntries, newLocaleMeta);

    vi.mocked(autoTranslateResource).mockResolvedValue({
      translations: [
        { locale: 'fr-ca', value: 'Sauvegarder', status: 'translated' },
        { locale: 'es', value: 'Guardar', status: 'translated' },
      ],
      skippedLocales: [],
    });

    const result = await translateExistingResource({
      key: 'buttons.save',
      translationsFolder,
      translationConfig: enabledTranslationConfig,
      allLocales: ['en', 'fr-ca', 'es'],
      baseLocale: 'en',
      cwd,
    });

    expect(result.translatedCount).toBe(2);
    expect(result.skippedLocales).toEqual([]);
    expect(result.entry.translations['fr-ca']).toBe('Sauvegarder');
    expect(result.entry.translations.es).toBe('Guardar');
  });

  it('should translate locales with stale status', async () => {
    const staleMeta = {
      save: {
        en: { checksum: 'new_base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'old_base_hash', status: 'stale' },
      },
    };
    const resourceEntries = { save: { source: 'Save It', 'fr-ca': 'Sauvegarder' } };
    mockFileSystem(resourceEntries, staleMeta);

    vi.mocked(autoTranslateResource).mockResolvedValue({
      translations: [{ locale: 'fr-ca', value: 'Enregistrer', status: 'translated' }],
      skippedLocales: [],
    });

    const result = await translateExistingResource({
      key: 'buttons.save',
      translationsFolder,
      translationConfig: enabledTranslationConfig,
      allLocales: ['en', 'fr-ca'],
      baseLocale: 'en',
      cwd,
    });

    expect(result.translatedCount).toBe(1);
    expect(result.entry.translations['fr-ca']).toBe('Enregistrer');
    expect(autoTranslateResource).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLocales: ['fr-ca'],
      }),
    );
  });

  it('should skip verified and translated locales and only translate new/stale ones', async () => {
    const mixedMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'base_hash', status: 'verified' },
        es: { checksum: 'es_hash', baseChecksum: 'base_hash', status: 'translated' },
        de: { checksum: 'de_hash', baseChecksum: 'base_hash', status: 'new' },
      },
    };
    const resourceEntries = { save: { source: 'Save', 'fr-ca': 'Sauvegarder', es: 'Guardar', de: 'Save' } };
    mockFileSystem(resourceEntries, mixedMeta);

    vi.mocked(autoTranslateResource).mockResolvedValue({
      translations: [{ locale: 'de', value: 'Speichern', status: 'translated' }],
      skippedLocales: [],
    });

    const result = await translateExistingResource({
      key: 'buttons.save',
      translationsFolder,
      translationConfig: enabledTranslationConfig,
      allLocales: ['en', 'fr-ca', 'es', 'de'],
      baseLocale: 'en',
      cwd,
    });

    expect(autoTranslateResource).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLocales: ['de'],
      }),
    );
    expect(result.translatedCount).toBe(1);
    expect(result.entry.translations.de).toBe('Speichern');
  });

  it('should return skipped locales for ICU content', async () => {
    const newLocaleMeta = {
      plural: {
        en: { checksum: 'base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'base_hash', status: 'new' },
        es: { checksum: 'es_hash', baseChecksum: 'base_hash', status: 'new' },
      },
    };
    const icuValue = 'You have {count, plural, one {# item} other {# items}}';
    const resourceEntries = { plural: { source: icuValue, 'fr-ca': icuValue, es: icuValue } };
    mockFileSystem(resourceEntries, newLocaleMeta);

    vi.mocked(autoTranslateResource).mockResolvedValue({
      translations: [],
      skippedLocales: ['fr-ca', 'es'],
    });

    const result = await translateExistingResource({
      key: 'messages.plural',
      translationsFolder,
      translationConfig: enabledTranslationConfig,
      allLocales: ['en', 'fr-ca', 'es'],
      baseLocale: 'en',
      cwd,
    });

    expect(result.translatedCount).toBe(0);
    expect(result.skippedLocales).toEqual(['fr-ca', 'es']);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should write updated files when translations are applied', async () => {
    const newLocaleMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': { checksum: 'save_hash', baseChecksum: 'base_hash', status: 'new' },
      },
    };
    mockFileSystem({ save: { source: 'Save', 'fr-ca': 'Save' } }, newLocaleMeta);

    vi.mocked(autoTranslateResource).mockResolvedValue({
      translations: [{ locale: 'fr-ca', value: 'Sauvegarder', status: 'translated' }],
      skippedLocales: [],
    });

    await translateExistingResource({
      key: 'buttons.save',
      translationsFolder,
      translationConfig: enabledTranslationConfig,
      allLocales: ['en', 'fr-ca'],
      baseLocale: 'en',
      cwd,
    });

    const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
    expect(writeCalls).toHaveLength(2);

    const updatedResources = JSON.parse(writeCalls[0][1] as string);
    expect(updatedResources.save['fr-ca']).toBe('Sauvegarder');

    const updatedMeta = JSON.parse(writeCalls[1][1] as string);
    expect(updatedMeta.save['fr-ca'].status).toBe('translated');
    expect(updatedMeta.save['fr-ca'].baseChecksum).toBe('base_hash');
  });

  it('should pass the base value and base locale to autoTranslateResource', async () => {
    const newLocaleMeta = {
      greeting: {
        en: { checksum: 'base_hash' },
        de: { checksum: 'de_hash', baseChecksum: 'base_hash', status: 'new' },
      },
    };
    mockFileSystem({ greeting: { source: 'Hello World', de: 'Hello World' } }, newLocaleMeta);

    vi.mocked(autoTranslateResource).mockResolvedValue({
      translations: [{ locale: 'de', value: 'Hallo Welt', status: 'translated' }],
      skippedLocales: [],
    });

    await translateExistingResource({
      key: 'messages.greeting',
      translationsFolder,
      translationConfig: enabledTranslationConfig,
      allLocales: ['en', 'de'],
      baseLocale: 'en',
      cwd,
    });

    expect(autoTranslateResource).toHaveBeenCalledWith({
      baseValue: 'Hello World',
      baseLocale: 'en',
      targetLocales: ['de'],
      translationConfig: enabledTranslationConfig,
    });
  });
});
