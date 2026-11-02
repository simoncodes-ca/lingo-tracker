import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { BundleDefinition } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { type SeedResource, seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { planBundle } from './plan-bundle';

describe('planBundle (real fs)', () => {
  const root = useTempDir('bundle-plan-');

  const definition: BundleDefinition = {
    bundleName: 'main.{locale}',
    dist: './dist/i18n',
    collections: 'All',
  };

  function seed(name: string, resources: Record<string, SeedResource>): string {
    const folder = path.join(root(), name);
    seedResources(testCollection(folder, { name, locales: ['en', 'fr'] }), resources);
    return folder;
  }

  function config(
    collections: Record<string, string>,
    overrides: Partial<LingoTrackerConfig> = {},
  ): LingoTrackerConfig {
    return {
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: Object.fromEntries(
        Object.entries(collections).map(([name, translationsFolder]) => [name, { translationsFolder }]),
      ),
      ...overrides,
    };
  }

  it('trims a supplied key in the plan and generated token path', () => {
    const common = seed('common', { 'buttons.ok': { source: 'OK' } });
    const plan = planBundle({
      bundleKey: ' main ',
      bundleDefinition: { ...definition, typeDistFile: 'types.ts' },
      config: config({ common }),
      cwd: root(),
    });
    expect(plan.bundleKey).toBe('main');
    expect(plan.exampleKey?.tokenPath).toBe('MAIN_TOKENS.BUTTONS.OK');
  });

  it('lists one bundle file per locale with configured and resolved paths and exists flags', () => {
    const common = seed('common', {
      'buttons.ok': { source: 'OK', translations: { fr: "D'accord" } },
    });
    const existing = path.join(root(), 'dist/i18n/main.en.json');
    mkdirSync(path.dirname(existing), { recursive: true });
    writeFileSync(existing, '{}');

    const plan = planBundle({
      bundleKey: 'main',
      bundleDefinition: definition,
      config: config({ common }),
      cwd: root(),
    });

    expect(plan.bundleKey).toBe('main');
    expect(plan.locales).toEqual(['en', 'fr']);
    expect(plan.files).toEqual([
      {
        path: 'dist/i18n/main.en.json',
        absolutePath: path.resolve(root(), 'dist/i18n/main.en.json'),
        kind: 'bundle',
        locale: 'en',
        exists: true,
        keysCount: 1,
      },
      {
        path: 'dist/i18n/main.fr.json',
        absolutePath: path.resolve(root(), 'dist/i18n/main.fr.json'),
        kind: 'bundle',
        locale: 'fr',
        exists: false,
        keysCount: 1,
      },
    ]);
    expect(plan.keysPerLocale).toEqual({ en: 1, fr: 1 });
  });

  it('respects a locales subset while still using base keys for the example', () => {
    const common = seed('common', { a: { source: 'A', translations: { fr: 'Un' } } });

    const plan = planBundle({
      bundleKey: 'main',
      bundleDefinition: definition,
      config: config({ common }),
      cwd: root(),
      locales: ['fr'],
    });

    expect(plan.locales).toEqual(['fr']);
    expect(plan.files.map((file) => file.locale)).toEqual(['fr']);
    expect(plan.keysPerLocale).toEqual({ fr: 1 });
    expect(plan.exampleKey).toEqual({ collectionName: 'common', sourceKey: 'a', bundledKey: 'a' });
  });

  it('never writes bundle directories or the configured types file', () => {
    const common = seed('common', { a: { source: 'A', translations: { fr: 'Un' } } });

    planBundle({
      bundleKey: 'main',
      bundleDefinition: { ...definition, typeDistFile: './src/tokens.ts' },
      config: config({ common }),
      cwd: root(),
    });

    expect(existsSync(path.join(root(), 'dist'))).toBe(false);
    expect(existsSync(path.join(root(), 'src/tokens.ts'))).toBe(false);
  });

  it('omits the types file when types are not configured', () => {
    const common = seed('common', { a: { source: 'A' } });
    const plan = planBundle({
      bundleKey: 'main',
      bundleDefinition: definition,
      config: config({ common }),
      cwd: root(),
    });

    expect(plan.files.filter((file) => file.kind === 'types')).toEqual([]);
    expect(plan.exampleKey?.tokenPath).toBeUndefined();
  });

  it('adds a types file with the base-locale key count', () => {
    const common = seed('common', { a: { source: 'A' }, b: { source: 'B' } });
    const plan = planBundle({
      bundleKey: 'main',
      bundleDefinition: { ...definition, typeDistFile: './src/tokens.ts' },
      config: config({ common }),
      cwd: root(),
    });

    const typesFile = plan.files.find((file) => file.kind === 'types');
    expect(typesFile).toBeDefined();
    expect(typesFile).toEqual({
      path: './src/tokens.ts',
      absolutePath: path.resolve(root(), 'src/tokens.ts'),
      kind: 'types',
      exists: false,
      keysCount: 2,
    });
    expect(typesFile?.locale).toBeUndefined();
  });

  it('warns about empty locales and reports zero keys', () => {
    const plan = planBundle({
      bundleKey: 'main',
      bundleDefinition: definition,
      config: config({}),
      cwd: root(),
    });

    expect(plan.keysPerLocale).toEqual({ en: 0, fr: 0 });
    expect(plan.warnings).toContain("Bundle 'main' for locale 'en' is empty");
    expect(plan.warnings).toContain("Bundle 'main' for locale 'fr' is empty");
    expect(plan.exampleKey).toBeUndefined();
  });

  function conflictSetup(): { common: string; admin: string } {
    return {
      common: seed('common', {
        'shared.title': { source: 'Common title', translations: { fr: 'Titre commun' } },
        'z.only': { source: 'Only in common', translations: { fr: 'Seulement commun' } },
      }),
      admin: seed('admin', {
        'shared.title': { source: 'Admin title', translations: { fr: 'Titre admin' } },
      }),
    };
  }

  describe('conflicts', () => {
    it('records conflicting keys once regardless of locale count', () => {
      const folders = conflictSetup();
      const plan = planBundle({
        bundleKey: 'main',
        bundleDefinition: definition,
        config: config(folders),
        cwd: root(),
      });

      expect(plan.conflictsCount).toBe(1);
      expect(plan.conflictKeys).toEqual(['shared.title']);
      expect(plan.keysPerLocale).toEqual({ en: 2, fr: 2 });
    });

    it('attributes the example key to the first collection under merge', () => {
      const folders = conflictSetup();
      const plan = planBundle({
        bundleKey: 'main',
        bundleDefinition: {
          ...definition,
          collections: [
            { name: 'common', entriesSelectionRules: 'All' },
            { name: 'admin', entriesSelectionRules: 'All', mergeStrategy: 'merge' },
          ],
        },
        config: config(folders),
        cwd: root(),
      });

      expect(plan.conflictKeys).toEqual(['shared.title']);
      expect(plan.exampleKey).toEqual({
        collectionName: 'common',
        sourceKey: 'shared.title',
        bundledKey: 'shared.title',
      });
    });

    it('attributes the example key to the overriding collection under override', () => {
      const folders = conflictSetup();
      const plan = planBundle({
        bundleKey: 'main',
        bundleDefinition: {
          ...definition,
          collections: [
            { name: 'common', entriesSelectionRules: 'All' },
            { name: 'admin', entriesSelectionRules: 'All', mergeStrategy: 'override' },
          ],
        },
        config: config(folders),
        cwd: root(),
      });

      expect(plan.exampleKey).toEqual({
        collectionName: 'admin',
        sourceKey: 'shared.title',
        bundledKey: 'shared.title',
      });
    });

    it('reports no conflicts when prefixes separate collections', () => {
      const folders = conflictSetup();
      const plan = planBundle({
        bundleKey: 'main',
        bundleDefinition: {
          ...definition,
          collections: [
            { name: 'common', entriesSelectionRules: 'All' },
            { name: 'admin', entriesSelectionRules: 'All', bundledKeyPrefix: 'admin' },
          ],
        },
        config: config(folders),
        cwd: root(),
      });

      expect(plan.conflictsCount).toBe(0);
      expect(plan.conflictKeys).toEqual([]);
      expect(plan.keysPerLocale['en']).toBe(3);
    });
  });

  describe('hierarchical conflicts', () => {
    it('reports and warns about a key that is both a leaf and a parent', () => {
      const common = seed('common', {
        'buttons.ok': { source: 'OK' },
        'buttons.ok.label': { source: 'OK label' },
      });
      const plan = planBundle({
        bundleKey: 'main',
        bundleDefinition: definition,
        config: config({ common }),
        cwd: root(),
      });

      expect(plan.hierarchicalConflicts).toEqual(['buttons.ok']);
      expect(plan.conflictsCount).toBe(0);
      expect(plan.conflictKeys).toEqual([]);
      expect(
        plan.warnings.some((warning) => warning.includes('Hierarchical conflict') && warning.includes('buttons.ok')),
      ).toBe(true);
    });

    it('reports a hierarchical collision introduced by a prefix', () => {
      const common = seed('common', { ok: { source: 'OK' } });
      const admin = seed('admin', { 'ok.label': { source: 'OK label' } });
      const plan = planBundle({
        bundleKey: 'main',
        bundleDefinition: {
          ...definition,
          collections: [
            { name: 'common', entriesSelectionRules: 'All', bundledKeyPrefix: 'buttons' },
            { name: 'admin', entriesSelectionRules: 'All', bundledKeyPrefix: 'buttons' },
          ],
        },
        config: config({ common, admin }),
        cwd: root(),
      });

      expect(plan.hierarchicalConflicts).toEqual(['buttons.ok']);
    });

    it('reports no hierarchical conflicts for well-formed keys', () => {
      const common = seed('common', {
        'buttons.ok': { source: 'OK', translations: { fr: "D'accord" } },
        'buttons.cancel': { source: 'Cancel', translations: { fr: 'Annuler' } },
      });
      const plan = planBundle({
        bundleKey: 'main',
        bundleDefinition: definition,
        config: config({ common }),
        cwd: root(),
      });

      expect(plan.hierarchicalConflicts).toEqual([]);
      expect(plan.warnings).toEqual([]);
    });
  });

  function exampleSetup(): { common: string; prefixed: BundleDefinition } {
    const common = seed('common', { 'buttons.file-upload': { source: 'Upload' } });
    return {
      common,
      prefixed: {
        ...definition,
        collections: [{ name: 'common', entriesSelectionRules: 'All', bundledKeyPrefix: 'shared' }],
      },
    };
  }

  describe('exampleKey', () => {
    it('is the first key the selection produced, even when a later key is numeric-like', () => {
      const first = seed('first', { welcome: { source: 'Welcome' } });
      const second = seed('second', { '404': { source: 'Not found' } });

      const plan = planBundle({
        bundleKey: 'main',
        bundleDefinition: definition,
        config: config({ first, second }),
        cwd: root(),
      });

      // A plain object would list '404' first; the selection keeps collection then folder order.
      expect(plan.exampleKey).toEqual({ collectionName: 'first', sourceKey: 'welcome', bundledKey: 'welcome' });
    });

    it('includes the prefix in bundledKey but not sourceKey', () => {
      const { common, prefixed } = exampleSetup();
      const plan = planBundle({
        bundleKey: 'main',
        bundleDefinition: prefixed,
        config: config({ common }),
        cwd: root(),
      });

      expect(plan.exampleKey).toEqual({
        collectionName: 'common',
        sourceKey: 'buttons.file-upload',
        bundledKey: 'shared.buttons.file-upload',
      });
    });

    it('builds an upperCase tokenPath from the derived constant name', () => {
      const { common, prefixed } = exampleSetup();
      const plan = planBundle({
        bundleKey: 'core-ui',
        bundleDefinition: { ...prefixed, typeDistFile: './src/tokens.ts' },
        config: config({ common }),
        cwd: root(),
      });

      expect(plan.exampleKey?.tokenPath).toBe('CORE_UI_TOKENS.SHARED.BUTTONS.FILE_UPLOAD');
    });

    it('honours casing and constant-name precedence from parameter through definition and config', () => {
      const { common, prefixed } = exampleSetup();
      const withTypes: BundleDefinition = {
        ...prefixed,
        typeDistFile: './src/tokens.ts',
        tokenCasing: 'upperCase',
        tokenConstantName: 'DEF_TOKENS',
      };
      const fromDefinition = planBundle({
        bundleKey: 'main',
        bundleDefinition: withTypes,
        config: config({ common }, { tokenCasing: 'camelCase' }),
        cwd: root(),
      });
      const fromParams = planBundle({
        bundleKey: 'main',
        bundleDefinition: withTypes,
        config: config({ common }),
        cwd: root(),
        tokenCasing: 'camelCase',
        tokenConstantName: 'paramTokens',
      });
      const fromConfig = planBundle({
        bundleKey: 'main',
        bundleDefinition: { ...prefixed, typeDistFile: './src/tokens.ts' },
        config: config({ common }, { tokenCasing: 'camelCase' }),
        cwd: root(),
      });

      expect(fromDefinition.exampleKey?.tokenPath).toBe('DEF_TOKENS.SHARED.BUTTONS.FILE_UPLOAD');
      expect(fromParams.exampleKey?.tokenPath).toBe('paramTokens.shared.buttons.fileUpload');
      expect(fromConfig.exampleKey?.tokenPath).toBe('MAIN_TOKENS.shared.buttons.fileUpload');
    });
  });

  it('rejects an unknown collection before planning locales', () => {
    expect(() =>
      planBundle({
        bundleKey: 'main',
        bundleDefinition: { ...definition, collections: [{ name: 'ghost', entriesSelectionRules: 'All' }] },
        config: config({}),
        cwd: root(),
      }),
    ).toThrow("Invalid bundle definition: Collection 'ghost' does not exist in the configuration.");
  });

  it('defaults cwd to process.cwd() for exists checks', () => {
    const common = seed('common', { a: { source: 'A' } });
    const plan = planBundle({
      bundleKey: 'main',
      bundleDefinition: definition,
      config: config({ common }),
      locales: ['en'],
    });

    expect(plan.files[0]?.absolutePath).toBe(path.resolve(process.cwd(), 'dist/i18n/main.en.json'));
  });
});
