import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { describe, expect, it } from 'vitest';
import { type CollectionSettings, collectionNeedsReopen, resolveCollectionSettings } from './collection-settings';

const translation = { enabled: true, provider: 'openai', apiKeyEnv: 'KEY' } as const;

function config(overrides: Partial<LingoTrackerConfigDto> = {}): LingoTrackerConfigDto {
  return {
    exportFolder: 'export',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: { app: { translationsFolder: 'src/i18n' } },
    ...overrides,
  };
}

describe('resolveCollectionSettings', () => {
  it('takes the collection values when it has them', () => {
    const settings = resolveCollectionSettings(
      config({
        translation: { ...translation, enabled: false },
        collections: {
          app: {
            translationsFolder: 'src/i18n',
            baseLocale: 'de',
            locales: ['de', 'ja'],
            translation,
            readOnly: true,
          },
        },
      }),
      'app',
    );

    expect(settings).toEqual({
      name: 'app',
      translationsFolder: 'src/i18n',
      baseLocale: 'de',
      locales: ['de', 'ja'],
      translationEnabled: true,
      readOnly: true,
    });
  });

  it('falls back to the global values, then to the defaults', () => {
    expect(resolveCollectionSettings(config({ translation }), 'app')).toEqual({
      name: 'app',
      translationsFolder: 'src/i18n',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      translationEnabled: true,
      readOnly: false,
    });

    const bare = { ...config(), baseLocale: '', locales: undefined } as unknown as LingoTrackerConfigDto;
    expect(resolveCollectionSettings(bare, 'app')).toMatchObject({ baseLocale: 'en', locales: [] });
  });

  it('inherits an empty collection base locale and an empty collection locale list', () => {
    const settings = resolveCollectionSettings(
      config({ collections: { app: { translationsFolder: 'src/i18n', baseLocale: '', locales: [] } } }),
      'app',
    );

    expect(settings.baseLocale).toBe('en');
    expect(settings.locales).toEqual(['en', 'fr']);
  });

  it('keeps no locales when both collection and global locale lists are empty', () => {
    const settings = resolveCollectionSettings(
      config({ locales: [], collections: { app: { translationsFolder: 'src/i18n', locales: [] } } }),
      'app',
    );

    expect(settings.locales).toEqual([]);
  });

  it('does not merge the translation configs: a disabled collection config wins over an enabled global one', () => {
    const settings = resolveCollectionSettings(
      config({
        translation,
        collections: { app: { translationsFolder: 'src/i18n', translation: { ...translation, enabled: false } } },
      }),
      'app',
    );

    expect(settings.translationEnabled).toBe(false);
  });

  it('resolves an unknown name to the global settings alone', () => {
    expect(resolveCollectionSettings(config(), 'ghost')).toEqual({
      name: 'ghost',
      translationsFolder: '',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      translationEnabled: false,
      readOnly: false,
    });
  });

  it('reads own keys only, so a prototype member name is not a collection', () => {
    expect(resolveCollectionSettings(config(), 'constructor').translationsFolder).toBe('');
    expect(resolveCollectionSettings(config(), '__proto__').translationsFolder).toBe('');
  });
});

describe('collectionNeedsReopen', () => {
  const base: CollectionSettings = {
    name: 'app',
    translationsFolder: 'src/i18n',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    translationEnabled: false,
    readOnly: false,
  };

  it('is false for identical settings', () => {
    expect(collectionNeedsReopen(base, { ...base })).toBe(false);
  });

  it('is false when only readOnly or translationEnabled differ', () => {
    expect(collectionNeedsReopen(base, { ...base, readOnly: true })).toBe(false);
    expect(collectionNeedsReopen(base, { ...base, translationEnabled: true })).toBe(false);
    expect(collectionNeedsReopen(base, { ...base, readOnly: true, translationEnabled: true })).toBe(false);
  });

  it('is true when the locale list changes, in length or in order', () => {
    expect(collectionNeedsReopen(base, { ...base, locales: ['en'] })).toBe(true);
    expect(collectionNeedsReopen(base, { ...base, locales: ['en', 'fr', 'de'] })).toBe(true);
    expect(collectionNeedsReopen(base, { ...base, locales: ['fr', 'en'] })).toBe(true);
  });

  it('is true when the base locale changes', () => {
    expect(collectionNeedsReopen(base, { ...base, baseLocale: 'fr' })).toBe(true);
  });

  it('is true when the translations folder changes', () => {
    expect(collectionNeedsReopen(base, { ...base, translationsFolder: 'moved/i18n' })).toBe(true);
  });
});
