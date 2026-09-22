import type { LingoTrackerConfig, ResolvedProtectedTerms } from '@simoncodes-ca/core';
import { mapCollectionToDto, mapDtoToCollection } from './collection.mapper';
import { mapConfigToDto, mapDtoToConfigUpdate } from './config.mapper';

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

    it('maps bundle definitions by name', () => {
      const dto = mapConfigToDto({
        ...config,
        bundles: {
          main: { bundleName: '{locale}', dist: './dist/i18n', collections: 'All', typeDistFile: './dist/main.ts' },
        },
      });

      expect(dto.bundles).toEqual({
        main: { bundleName: '{locale}', dist: './dist/i18n', collections: 'All', typeDistFile: './dist/main.ts' },
      });
    });

    it('omits bundles when the config has none', () => {
      const dto = mapConfigToDto(config);

      expect('bundles' in dto).toBe(false);
    });

    it('maps loaded preferred terminology rules and file path', () => {
      const dto = mapConfigToDto(config, resolved, undefined, {
        rules: [
          { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Planning term.' },
          { discouraged: 'E-mail', preferred: 'email' },
        ],
        filePath: '/project/.lingo-tracker-preferred-terminology.json',
      });

      expect(dto.preferredTerminology).toEqual([
        { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Planning term.' },
        { discouraged: 'E-mail', preferred: 'email' },
      ]);
      expect(dto.preferredTerminology?.[1]).not.toHaveProperty('reason');
      expect(dto.preferredTerminologyFilePath).toBe('/project/.lingo-tracker-preferred-terminology.json');
      expect('preferredTerminologyError' in dto).toBe(false);
      expect('preferredTerminologyWarning' in dto).toBe(false);
    });

    it('omits an empty rule list but keeps the file path', () => {
      const dto = mapConfigToDto(config, resolved, undefined, {
        rules: [],
        filePath: '/project/.lingo-tracker-preferred-terminology.json',
      });

      expect('preferredTerminology' in dto).toBe(false);
      expect(dto.preferredTerminologyFilePath).toBe('/project/.lingo-tracker-preferred-terminology.json');
    });

    it('maps a load error and a missing-file warning to their own fields', () => {
      const broken = mapConfigToDto(config, resolved, undefined, {
        rules: [],
        filePath: '/project/terms.json',
        error: 'Preferred terminology file is not valid JSON',
      });
      const missing = mapConfigToDto(config, resolved, undefined, {
        rules: [],
        filePath: '/project/terms.json',
        warning: 'Preferred terminology file not found',
      });

      expect(broken.preferredTerminologyError).toBe('Preferred terminology file is not valid JSON');
      expect('preferredTerminologyWarning' in broken).toBe(false);
      expect(missing.preferredTerminologyWarning).toBe('Preferred terminology file not found');
      expect('preferredTerminologyError' in missing).toBe(false);
    });

    it('omits every preferred-terminology field when nothing was loaded', () => {
      const dto = mapConfigToDto(config, resolved);

      expect('preferredTerminology' in dto).toBe(false);
      expect('preferredTerminologyFilePath' in dto).toBe(false);
    });

    it('exposes projectName only when provided', () => {
      expect(mapConfigToDto(config, undefined, 'lingo-tracker').projectName).toBe('lingo-tracker');
      expect('projectName' in mapConfigToDto(config)).toBe(false);
    });
  });

  describe('mapDtoToConfigUpdate', () => {
    it('maps protectedTerms', () => {
      expect(mapDtoToConfigUpdate({ protectedTerms: ['iPhone'] })).toEqual({ protectedTerms: ['iPhone'] });
    });

    it('maps preferredTerminology', () => {
      const rules = [{ discouraged: 'Expenditure', preferred: 'Investment' }];
      expect(mapDtoToConfigUpdate({ preferredTerminology: rules })).toEqual({ preferredTerminology: rules });
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
