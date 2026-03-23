import { describe, it, expect, beforeEach, vi } from 'vitest';
import { editResource } from './edit-resource';
import * as fs from 'node:fs';
import { type SafeAny, RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../constants';

vi.mock('node:fs');
vi.mock('../lib/translation/auto-translate-resources');

import { autoTranslateResource } from '../lib/translation/auto-translate-resources';

describe('editResource', () => {
  const translationsFolder = 'translations';
  const cwd = '/test';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  });

  it('should throw error if resource file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(editResource(translationsFolder, { key: 'buttons.save', cwd })).rejects.toThrow(/Resource not found/);
  });

  it('should throw error if resource entry does not exist in file', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));
    await expect(editResource(translationsFolder, { key: 'buttons.save', cwd })).rejects.toThrow(/Resource not found/);
  });

  it('should return updated: false if no changes are made', async () => {
    const initialResources = {
      save: { source: 'Save' },
    };
    const initialMeta = {
      save: { en: { checksum: 'abc' } },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    const result = await editResource(translationsFolder, {
      key: 'buttons.save',
      baseValue: 'Save',
      cwd,
    });

    expect(result.updated).toBe(false);
  });

  it('should update base value and mark other locales as stale', async () => {
    const initialResources = {
      save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
    };
    const initialMeta = {
      save: {
        en: { checksum: 'old_base_hash' },
        'fr-ca': {
          checksum: 'fr_hash',
          baseChecksum: 'old_base_hash',
          status: 'translated',
        },
      },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    const result = await editResource(translationsFolder, {
      key: 'buttons.save',
      baseValue: 'Save Item',
      cwd,
    });

    expect(result.updated).toBe(true);

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedMeta = JSON.parse(writeCall[1][1] as string);

    expect(updatedMeta.save.en.checksum).not.toBe('old_base_hash');
    expect(updatedMeta.save['fr-ca'].status).toBe('stale');
    expect(updatedMeta.save['fr-ca'].baseChecksum).toBe(updatedMeta.save.en.checksum);

    const updatedResources = JSON.parse(writeCall[0][1] as string);
    expect(updatedResources.save.source).toBe('Save Item');
  });

  it('should update comment and tags', async () => {
    const initialResources = {
      save: { source: 'Save' },
    };
    const initialMeta = {
      save: { en: { checksum: 'abc' } },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    const result = await editResource(translationsFolder, {
      key: 'buttons.save',
      comment: 'New comment',
      tags: ['ui', 'action'],
      cwd,
    });

    expect(result.updated).toBe(true);

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedResources = JSON.parse(writeCall[0][1] as string);
    expect(updatedResources.save.comment).toBe('New comment');
    expect(updatedResources.save.tags).toEqual(['ui', 'action']);
  });

  it('should default status to "translated" when no status is supplied', async () => {
    const initialResources = {
      save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
    };
    const initialMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': {
          checksum: 'old_fr_hash',
          baseChecksum: 'base_hash',
          status: 'stale',
        },
      },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    const result = await editResource(translationsFolder, {
      key: 'buttons.save',
      locales: { 'fr-ca': { value: 'Enregistrer' } },
      cwd,
    });

    expect(result.updated).toBe(true);

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedResources = JSON.parse(writeCall[0][1] as string);
    expect(updatedResources.save['fr-ca']).toBe('Enregistrer');

    const updatedMeta = JSON.parse(writeCall[1][1] as string);
    expect(updatedMeta.save['fr-ca'].status).toBe('translated');
    expect(updatedMeta.save['fr-ca'].checksum).not.toBe('old_fr_hash');
  });

  it('should persist caller-supplied status', async () => {
    const initialResources = {
      save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
    };
    const initialMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': {
          checksum: 'old_fr_hash',
          baseChecksum: 'base_hash',
          status: 'stale',
        },
      },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    const result = await editResource(translationsFolder, {
      key: 'buttons.save',
      locales: { 'fr-ca': { value: 'Enregistrer', status: 'verified' } },
      cwd,
    });

    expect(result.updated).toBe(true);

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedMeta = JSON.parse(writeCall[1][1] as string);
    expect(updatedMeta.save['fr-ca'].status).toBe('verified');
  });

  it('should update status when only status changes', async () => {
    const initialResources = {
      save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
    };
    const initialMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': {
          checksum: 'existing_fr_hash',
          baseChecksum: 'base_hash',
          status: 'translated',
        },
      },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    const result = await editResource(translationsFolder, {
      key: 'buttons.save',
      locales: { 'fr-ca': { value: 'Sauvegarder', status: 'verified' } },
      cwd,
    });

    expect(result.updated).toBe(true);

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedMeta = JSON.parse(writeCall[1][1] as string);
    expect(updatedMeta.save['fr-ca'].status).toBe('verified');
  });

  it('should convert Transloco syntax to ICU format when updating base value', async () => {
    const initialResources = {
      save: { source: 'Save' },
    };
    const initialMeta = {
      save: { en: { checksum: 'abc' } },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    await editResource(translationsFolder, {
      key: 'buttons.save',
      baseValue: 'Hello {{ name }}',
      cwd,
    });

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedResources = JSON.parse(writeCall[0][1] as string);
    expect(updatedResources.save.source).toBe('Hello {name}');
  });

  it('should convert Transloco syntax to ICU format when updating a locale translation', async () => {
    const initialResources = {
      save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
    };
    const initialMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': {
          checksum: 'old_fr_hash',
          baseChecksum: 'base_hash',
          status: 'stale',
        },
      },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    await editResource(translationsFolder, {
      key: 'buttons.save',
      locales: { 'fr-ca': { value: 'Bonjour {{ name }}' } },
      cwd,
    });

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedResources = JSON.parse(writeCall[0][1] as string);
    expect(updatedResources.save['fr-ca']).toBe('Bonjour {name}');
  });

  it('should preserve already-ICU-formatted baseValue unchanged', async () => {
    const initialResources = {
      save: { source: 'Save' },
    };
    const initialMeta = {
      save: { en: { checksum: 'abc' } },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    await editResource(translationsFolder, {
      key: 'buttons.save',
      baseValue: 'Hello {name}',
      cwd,
    });

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedResources = JSON.parse(writeCall[0][1] as string);
    expect(updatedResources.save.source).toBe('Hello {name}');
  });

  it('should preserve already-ICU-formatted locale value unchanged', async () => {
    const initialResources = {
      save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
    };
    const initialMeta = {
      save: {
        en: { checksum: 'base_hash' },
        'fr-ca': {
          checksum: 'old_fr_hash',
          baseChecksum: 'base_hash',
          status: 'stale',
        },
      },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    await editResource(translationsFolder, {
      key: 'buttons.save',
      locales: { 'fr-ca': { value: 'Bonjour {name}' } },
      cwd,
    });

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedResources = JSON.parse(writeCall[0][1] as string);
    expect(updatedResources.save['fr-ca']).toBe('Bonjour {name}');
  });

  it('should not auto-translate when translationConfig is disabled', async () => {
    const initialResources = {
      save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
    };
    const initialMeta = {
      save: {
        en: { checksum: 'old_base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'old_base_hash', status: 'translated' },
      },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    const result = await editResource(translationsFolder, {
      key: 'buttons.save',
      baseValue: 'Save Item',
      cwd,
      translationConfig: { enabled: false, provider: 'google-translate', apiKeyEnv: 'GOOGLE_API_KEY' },
      allLocales: ['en', 'fr-ca'],
    });

    expect(result.updated).toBe(true);

    // With disabled config the locale remains stale (auto-translate did not run)
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    const updatedMeta = JSON.parse(writeCall[1][1] as string);
    expect(updatedMeta.save['fr-ca'].status).toBe('stale');
  });

  it('should normalize Transloco syntax returned by auto-translation provider to ICU format', async () => {
    const initialResources = {
      save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
    };
    const initialMeta = {
      save: {
        en: { checksum: 'old_base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'old_base_hash', status: 'translated' },
      },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    // Provider returns Transloco-style {{ }} — storage contract requires ICU {}.
    vi.mocked(autoTranslateResource).mockResolvedValue({
      translations: [{ locale: 'fr-ca', value: 'Bonjour {{ name }}', status: 'translated' }],
      skippedLocales: [],
    });

    await editResource(translationsFolder, {
      key: 'buttons.save',
      baseValue: 'Hello {name}',
      cwd,
      translationConfig: { enabled: true, provider: 'google-translate', apiKeyEnv: 'GOOGLE_API_KEY' },
      allLocales: ['en', 'fr-ca'],
    });

    const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
    const lastResourcesWrite = JSON.parse(writeCalls[writeCalls.length - 2][1] as string);
    expect(lastResourcesWrite.save['fr-ca']).toBe('Bonjour {name}');

    // Checksum must be computed from the normalized ICU value, not the raw provider output.
    const lastMetaWrite = JSON.parse(writeCalls[writeCalls.length - 1][1] as string);
    const { calculateChecksum } = await import('./checksum');
    expect(lastMetaWrite.save['fr-ca'].checksum).toBe(calculateChecksum('Bonjour {name}'));
  });

  it('should auto-translate and write translated values when translationConfig is enabled and base value changes', async () => {
    const initialResources = {
      save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
    };
    const initialMeta = {
      save: {
        en: { checksum: 'old_base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'old_base_hash', status: 'translated' },
      },
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
      if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
      if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
      return '{}';
    });

    vi.mocked(autoTranslateResource).mockResolvedValue({
      translations: [{ locale: 'fr-ca', value: "Enregistrer l'élément", status: 'translated' }],
      skippedLocales: [],
    });

    const result = await editResource(translationsFolder, {
      key: 'buttons.save',
      baseValue: 'Save Item',
      cwd,
      translationConfig: { enabled: true, provider: 'google-translate', apiKeyEnv: 'GOOGLE_API_KEY' },
      allLocales: ['en', 'fr-ca'],
    });

    expect(result.updated).toBe(true);
    expect(autoTranslateResource).toHaveBeenCalledWith({
      baseValue: 'Save Item',
      baseLocale: 'en',
      targetLocales: ['fr-ca'],
      translationConfig: { enabled: true, provider: 'google-translate', apiKeyEnv: 'GOOGLE_API_KEY' },
    });

    // writeFileSync is called twice: once for the initial save, once after auto-translation.
    // The second pair of calls contains the auto-translated values.
    const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
    const lastResourcesWrite = JSON.parse(writeCalls[writeCalls.length - 2][1] as string);
    const lastMetaWrite = JSON.parse(writeCalls[writeCalls.length - 1][1] as string);

    expect(lastResourcesWrite.save['fr-ca']).toBe("Enregistrer l'élément");
    expect(lastMetaWrite.save['fr-ca'].status).toBe('translated');
    // Checksum must be recalculated — it should differ from the stale one
    expect(lastMetaWrite.save['fr-ca'].checksum).not.toBe('fr_hash');
    // baseChecksum must reflect the new base value
    expect(lastMetaWrite.save['fr-ca'].baseChecksum).toBe(lastMetaWrite.save.en.checksum);
  });
});
