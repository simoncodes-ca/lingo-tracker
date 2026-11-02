import { describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { DEFAULT_CONFIG } from '../../constants';
import { patchCollectionEntry, toCollectionEntry } from './collection-entry';
import { openCollection } from './open-collection';

describe('collection inheritance and storage', () => {
  it('inherits global locales and omits folders equal to global values', () => {
    const config: LingoTrackerConfig = {
      baseLocale: 'fr',
      locales: ['fr', 'de'],
      exportFolder: 'out',
      importFolder: 'in',
      collections: { main: { translationsFolder: 'translations' } },
    };
    expect(openCollection(config, 'main')).toMatchObject({ baseLocale: 'fr', locales: ['fr', 'de'] });
    expect(
      toCollectionEntry(config, { translationsFolder: 'translations', exportFolder: 'out', importFolder: 'in' }),
    ).toEqual({ translationsFolder: 'translations' });
  });

  it('inherits built-in locales and omits folders equal to defaults when globals are absent', () => {
    const config = { collections: { main: { translationsFolder: 'translations' } } } as unknown as LingoTrackerConfig;
    expect(openCollection(config, 'main')).toMatchObject({
      baseLocale: DEFAULT_CONFIG.baseLocale,
      locales: DEFAULT_CONFIG.locales,
    });
    expect(
      toCollectionEntry(config, {
        translationsFolder: 'translations',
        exportFolder: DEFAULT_CONFIG.exportFolder,
        importFolder: DEFAULT_CONFIG.importFolder,
      }),
    ).toEqual({ translationsFolder: 'translations' });
  });

  it('omits accepted built-in defaults when globals are absent', () => {
    const config = { collections: {} } as unknown as LingoTrackerConfig;
    expect(toCollectionEntry(config, { translationsFolder: 'translations', ...DEFAULT_CONFIG })).toEqual({
      translationsFolder: 'translations',
    });
  });

  it('keeps overrides that differ from built-in defaults', () => {
    const config = { collections: {} } as unknown as LingoTrackerConfig;
    const entry = {
      translationsFolder: 'translations',
      baseLocale: 'fr',
      locales: ['fr'],
      exportFolder: 'out',
      importFolder: 'in',
    };
    expect(toCollectionEntry(config, entry)).toEqual(entry);
    expect(openCollection({ collections: { main: entry } } as unknown as LingoTrackerConfig, 'main')).toMatchObject({
      baseLocale: 'fr',
      locales: ['fr'],
    });
  });

  it('re-applies the effective default rule when patching an existing entry', () => {
    const config = {
      collections: {
        main: {
          translationsFolder: 'translations',
          baseLocale: 'fr',
          exportFolder: 'out',
          importFolder: 'in',
          locales: ['fr'],
        },
      },
    } as unknown as LingoTrackerConfig;
    const updated = patchCollectionEntry(config, 'main', { ...DEFAULT_CONFIG });
    expect(updated.collections['main']).toEqual({ translationsFolder: 'translations' });
  });
});
