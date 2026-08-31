import type { LingoTrackerConfig, ResolvedProtectedTerms } from '@simoncodes-ca/core';
import { mapConfigToDto, mapDtoToConfigUpdate } from './config.mapper';
import { mapCollectionToDto, mapDtoToCollection } from './collection.mapper';

describe('config.mapper', () => {
  describe('mapConfigToDto', () => {
    const config: LingoTrackerConfig = {
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      baseLocale: 'en',
      locales: ['en', 'es'],
      collections: {
        app: {
          translationsFolder: './i18n',
          protectedTermsFile: 'i18n/terms.json',
        },
      },
    };

    const resolved: ResolvedProtectedTerms = {
      globalTerms: ['SimonCodes'],
      globalFilePath: '/project/.lingo-tracker-protected-terms.json',
      collections: {
        app: { terms: ['iPhone'], filePath: '/project/i18n/terms.json' },
      },
    };

    it('exposes the resolved terms and file paths at both levels', () => {
      const dto = mapConfigToDto(config, resolved);

      expect(dto.protectedTerms).toEqual(['SimonCodes']);
      expect(dto.protectedTermsFilePath).toBe('/project/.lingo-tracker-protected-terms.json');
      expect(dto.collections.app.protectedTerms).toEqual(['iPhone']);
      expect(dto.collections.app.protectedTermsFilePath).toBe('/project/i18n/terms.json');
    });

    it('keeps the collection pointer so a round-trip cannot drop it', () => {
      const dto = mapConfigToDto(config, resolved);

      expect(dto.collections.app.protectedTermsFile).toBe('i18n/terms.json');
      expect(mapDtoToCollection(dto.collections.app).protectedTermsFile).toBe('i18n/terms.json');
    });

    it('omits protected-terms fields when nothing was resolved', () => {
      const dto = mapConfigToDto({
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en'],
        collections: {},
      });

      expect(dto.protectedTerms).toBeUndefined();
      expect(dto.protectedTermsFilePath).toBeUndefined();
      expect(dto.collections).toEqual({});
    });

    it('omits an empty term list rather than exposing an empty array', () => {
      const dto = mapConfigToDto(config, {
        globalTerms: [],
        globalFilePath: '/project/.lingo-tracker-protected-terms.json',
        collections: { app: { terms: [], filePath: undefined } },
      });

      expect(dto.protectedTerms).toBeUndefined();
      expect(dto.collections.app.protectedTerms).toBeUndefined();
      expect(dto.protectedTermsFilePath).toBe('/project/.lingo-tracker-protected-terms.json');
    });
  });

  describe('mapDtoToConfigUpdate', () => {
    it('maps protectedTerms', () => {
      expect(mapDtoToConfigUpdate({ protectedTerms: ['iPhone'] })).toEqual({ protectedTerms: ['iPhone'] });
    });

    it('returns an empty update when no writable fields present', () => {
      expect(mapDtoToConfigUpdate({})).toEqual({});
    });

    it('never maps collections, locales, or baseLocale', () => {
      const update = mapDtoToConfigUpdate({ protectedTerms: ['iPhone'] });
      expect('collections' in update).toBe(false);
      expect('locales' in update).toBe(false);
      expect('baseLocale' in update).toBe(false);
    });
  });
});

describe('collection.mapper', () => {
  it('round-trips the protectedTermsFile pointer', () => {
    const collection = { translationsFolder: './i18n', protectedTermsFile: 'i18n/terms.json' };

    expect(mapCollectionToDto(collection).protectedTermsFile).toBe('i18n/terms.json');
    expect(mapDtoToCollection(mapCollectionToDto(collection)).protectedTermsFile).toBe('i18n/terms.json');
  });

  it('never writes resolved terms back into the config — they belong in the file', () => {
    const dto = mapCollectionToDto(
      { translationsFolder: './i18n', protectedTermsFile: 'i18n/terms.json' },
      { terms: ['iPhone'], filePath: '/project/i18n/terms.json' },
    );

    expect(dto.protectedTerms).toEqual(['iPhone']);
    expect(mapDtoToCollection(dto)).not.toHaveProperty('protectedTerms');
  });

  it('omits protected-terms fields when the collection has no file', () => {
    const collection = { translationsFolder: './i18n' };

    expect(mapCollectionToDto(collection).protectedTerms).toBeUndefined();
    expect(mapCollectionToDto(collection).protectedTermsFile).toBeUndefined();
    expect(mapCollectionToDto(collection).protectedTermsFilePath).toBeUndefined();
  });
});
