import type { LingoTrackerConfig, ProjectTermsConfigView, ResolvedProtectedTerms } from '@simoncodes-ca/core';
import { mapCollectionToDto, mapDtoToCollection } from './collection.mapper';
import { mapConfigToDto } from './config.mapper';

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

    const snapshot = (overrides: Partial<ProjectTermsConfigView> = {}): ProjectTermsConfigView => ({
      config,
      projectName: '',
      protectedTerms: {
        globalTerms: [],
        globalFilePath: '/project/.lingo-tracker-protected-terms.json',
        collections: {},
      },
      preferredTerminology: { rules: [], filePath: '/project/.lingo-tracker-preferred-terminology.json' },
      ...overrides,
    });

    it('projects config views without applying file refusal policy', () => {
      const dto = mapConfigToDto(
        snapshot({
          protectedTerms: { globalTerms: [], globalFilePath: '/project/broken.json', collections: {} },
        }),
      );
      expect(dto.collections).toEqual({ app: expect.objectContaining({ translationsFolder: './i18n' }) });
    });

    it('exposes the resolved terms and file paths at both levels', () => {
      const dto = mapConfigToDto(snapshot({ config, protectedTerms: resolved }));

      expect(dto.protectedTerms).toEqual(['SimonCodes']);
      expect(dto.protectedTermsFilePath).toBe('/project/.lingo-tracker-protected-terms.json');
      expect(dto.collections.app.protectedTerms).toEqual(['iPhone']);
      expect(dto.collections.app.protectedTermsFilePath).toBe('/project/i18n/terms.json');
    });

    it('keeps the collection pointer so a round-trip cannot drop it', () => {
      const dto = mapConfigToDto(snapshot({ config, protectedTerms: resolved }));

      expect(dto.collections.app.protectedTermsFile).toBe('i18n/terms.json');
      expect(mapDtoToCollection(dto.collections.app).protectedTermsFile).toBe('i18n/terms.json');
    });

    it('omits empty protected terms but keeps their resolved file path', () => {
      const dto = mapConfigToDto(
        snapshot({
          config: {
            exportFolder: 'dist/export',
            importFolder: 'dist/import',
            baseLocale: 'en',
            locales: ['en'],
            collections: {},
          },
        }),
      );

      expect(dto.protectedTerms).toBeUndefined();
      expect(dto.protectedTermsFilePath).toBe('/project/.lingo-tracker-protected-terms.json');
      expect(dto.collections).toEqual({});
    });

    it('omits an empty term list rather than exposing an empty array', () => {
      const dto = mapConfigToDto(
        snapshot({
          config,
          protectedTerms: {
            globalTerms: [],
            globalFilePath: '/project/.lingo-tracker-protected-terms.json',
            collections: { app: { terms: [], filePath: undefined } },
          },
        }),
      );

      expect(dto.protectedTerms).toBeUndefined();
      expect(dto.collections.app.protectedTerms).toBeUndefined();
      expect(dto.protectedTermsFilePath).toBe('/project/.lingo-tracker-protected-terms.json');
    });

    it('maps a present runtime and omits it when absent', () => {
      for (const runtime of ['transloco', 'transloco-messageformat'] as const) {
        expect(mapConfigToDto(snapshot({ config: { ...config, runtime } })).runtime).toBe(runtime);
      }
      expect(mapConfigToDto(snapshot())).not.toHaveProperty('runtime');
    });

    it('maps bundle definitions by name', () => {
      const dto = mapConfigToDto(
        snapshot({
          config: {
            ...config,
            bundles: {
              main: { bundleName: '{locale}', dist: './dist/i18n', collections: 'All', typeDistFile: './dist/main.ts' },
            },
          },
        }),
      );

      expect(dto.bundles).toEqual({
        main: { bundleName: '{locale}', dist: './dist/i18n', collections: 'All', typeDistFile: './dist/main.ts' },
      });
    });

    it('passes bundle definitions through as written, including unknown and deprecated fields', () => {
      // GET /config reports the file as it is; `typeDist` migrates to `typeDistFile` only when
      // the bundle is saved (the domain `normalizeBundleDefinition`), and the Tracker form reads
      // the definition through that same function.
      const legacy = { bundleName: '{locale}', dist: './dist', collections: 'All', typeDist: './src/t.ts', extra: 1 };
      const dto = mapConfigToDto(
        snapshot({
          config: {
            ...config,
            bundles: { legacy: legacy as unknown as NonNullable<LingoTrackerConfig['bundles']>[string] },
          },
        }),
      );

      expect(dto.bundles?.['legacy']).toEqual(legacy);
    });

    it('omits bundles when the config has none', () => {
      const dto = mapConfigToDto(snapshot({ config }));

      expect('bundles' in dto).toBe(false);
    });

    it('maps loaded preferred terminology rules and file path', () => {
      const dto = mapConfigToDto(
        snapshot({
          config,
          protectedTerms: resolved,
          preferredTerminology: {
            rules: [
              { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Planning term.' },
              { discouraged: 'E-mail', preferred: 'email' },
            ],
            filePath: '/project/.lingo-tracker-preferred-terminology.json',
          },
        }),
      );

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
      const dto = mapConfigToDto(
        snapshot({
          config,
          protectedTerms: resolved,
          preferredTerminology: {
            rules: [],
            filePath: '/project/.lingo-tracker-preferred-terminology.json',
          },
        }),
      );

      expect('preferredTerminology' in dto).toBe(false);
      expect(dto.preferredTerminologyFilePath).toBe('/project/.lingo-tracker-preferred-terminology.json');
    });

    it('maps a load error and a missing-file warning to their own fields', () => {
      const broken = mapConfigToDto(
        snapshot({
          config,
          protectedTerms: resolved,
          preferredTerminology: {
            rules: [],
            filePath: '/project/terms.json',
            error: 'Preferred terminology file is not valid JSON',
          },
        }),
      );
      const missing = mapConfigToDto(
        snapshot({
          config,
          protectedTerms: resolved,
          preferredTerminology: {
            rules: [],
            filePath: '/project/terms.json',
            warning: 'Preferred terminology file not found',
          },
        }),
      );

      expect(broken.preferredTerminologyError).toBe('Preferred terminology file is not valid JSON');
      expect('preferredTerminologyWarning' in broken).toBe(false);
      expect(missing.preferredTerminologyWarning).toBe('Preferred terminology file not found');
      expect('preferredTerminologyError' in missing).toBe(false);
    });

    it('omits absent rules and problems but keeps the preferred-terminology path', () => {
      const dto = mapConfigToDto(snapshot({ config, protectedTerms: resolved }));

      expect('preferredTerminology' in dto).toBe(false);
      expect(dto.preferredTerminologyFilePath).toBe('/project/.lingo-tracker-preferred-terminology.json');
      expect('preferredTerminologyError' in dto).toBe(false);
      expect('preferredTerminologyWarning' in dto).toBe(false);
    });

    it('exposes projectName only when provided', () => {
      expect(mapConfigToDto(snapshot({ config, projectName: 'lingo-tracker' })).projectName).toBe('lingo-tracker');
      expect('projectName' in mapConfigToDto(snapshot({ config }))).toBe(false);
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

  it('keeps the required body folder rule in core before mapping', () => {
    expect(() => mapDtoToCollection({} as Parameters<typeof mapDtoToCollection>[0])).toThrow(
      'translationsFolder must be a string',
    );
  });

  it('rejects null DTO-only fields before dropping them', () => {
    const body = { translationsFolder: './i18n', protectedTerms: null } as unknown as Parameters<
      typeof mapDtoToCollection
    >[0];
    expect(() => mapDtoToCollection(body)).toThrow('protectedTerms must not be null');
  });

  it('omits protected-terms fields when the collection has no file', () => {
    const collection = { translationsFolder: './i18n' };

    expect(mapCollectionToDto(collection).protectedTerms).toBeUndefined();
    expect(mapCollectionToDto(collection).protectedTermsFile).toBeUndefined();
    expect(mapCollectionToDto(collection).protectedTermsFilePath).toBeUndefined();
  });
});
