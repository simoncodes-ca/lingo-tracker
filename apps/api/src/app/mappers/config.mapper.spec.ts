import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { mapConfigToDto, mapDtoToConfigUpdate } from './config.mapper';
import { mapCollectionToDto, mapDtoToCollection } from './collection.mapper';

describe('config.mapper', () => {
  describe('mapConfigToDto', () => {
    it('maps protectedTerms on the top level and inside collections', () => {
      const config: LingoTrackerConfig = {
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        protectedTerms: ['SimonCodes'],
        collections: {
          app: {
            translationsFolder: './i18n',
            protectedTerms: ['iPhone'],
          },
        },
      };

      const dto = mapConfigToDto(config);
      expect(dto.protectedTerms).toEqual(['SimonCodes']);
      expect(dto.collections.app.protectedTerms).toEqual(['iPhone']);
    });

    it('omits protectedTerms when absent', () => {
      const dto = mapConfigToDto({
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en'],
        collections: {},
      });
      expect(dto.protectedTerms).toBeUndefined();
      expect(dto.collections).toEqual({});
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
  it('maps protectedTerms in both directions', () => {
    const collection = {
      translationsFolder: './i18n',
      protectedTerms: ['iPhone', 'C++'],
    };

    expect(mapCollectionToDto(collection).protectedTerms).toEqual(['iPhone', 'C++']);
    expect(mapDtoToCollection(mapCollectionToDto(collection)).protectedTerms).toEqual(['iPhone', 'C++']);
  });

  it('omits protectedTerms when absent', () => {
    const collection = { translationsFolder: './i18n' };
    expect(mapCollectionToDto(collection).protectedTerms).toBeUndefined();
    expect(mapDtoToCollection(mapCollectionToDto(collection)).protectedTerms).toBeUndefined();
  });
});
