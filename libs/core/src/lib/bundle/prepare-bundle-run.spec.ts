import { resolve } from 'node:path';
import type { BundleDefinition } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { prepareBundleRun } from './prepare-bundle-run';

const definition: BundleDefinition = { bundleName: '{locale}', dist: 'dist', collections: 'All' };
const config: LingoTrackerConfig = {
  exportFolder: 'export',
  importFolder: 'import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: {},
  bundles: { main: definition },
  tokenCasing: 'camelCase',
  transformICUToTransloco: false,
};

describe('prepareBundleRun', () => {
  it.each([
    ['defaults', {}, {}, 'MAIN_TOKENS', 'camelCase', false],
    [
      'definition',
      { tokenCasing: 'upperCase', tokenConstantName: 'DEF_TOKENS', transformICUToTransloco: true },
      {},
      'DEF_TOKENS',
      'upperCase',
      true,
    ],
    [
      'overrides',
      { tokenCasing: 'upperCase', tokenConstantName: 'DEF_TOKENS', transformICUToTransloco: true },
      { tokenCasing: 'camelCase', tokenConstantName: 'CLI_TOKENS', transformICUToTransloco: false },
      'CLI_TOKENS',
      'camelCase',
      false,
    ],
  ] as const)(
    '%s settings win',
    (_label, bundle, overrides, tokenConstantName, tokenCasing, transformICUToTransloco) => {
      const prepared = prepareBundleRun({
        source: 'supplied',
        bundleKey: 'main',
        bundleDefinition: { ...definition, ...bundle },
        config,
        locales: ['fr'],
        ...overrides,
      });
      expect(prepared.settings).toEqual({
        runtime: 'transloco-messageformat',
        tokenConstantName,
        tokenCasing,
        transformICUToTransloco,
      });
      expect(prepared.locales).toEqual(['fr']);
      expect(prepared.collections).toEqual({ collections: [], warnings: [] });
      expect(prepared.warnings).toEqual([]);
    },
  );

  it.each([
    [{ locales: ['xx'] }, 'Unknown locale "xx": must be defined in the project locales'],
    [{ locales: 'en' as never }, 'locales must be an array of strings'],
    [{ bundleDefinition: { ...definition, dist: '' } }, 'dist (output folder) is required.'],
    [{ bundleDefinition: undefined }, 'bundle definition is required.'],
    [{ bundleDefinition: null }, 'bundle definition is required.'],
  ])('rejects invalid input %# with a typed error', (change, message) => {
    expect(() =>
      prepareBundleRun({ source: 'supplied', bundleKey: 'main', bundleDefinition: definition, config, ...change }),
    ).toThrow(message);
  });

  it('warns once per bundle when transloco conversion is off, regardless of locale count', () => {
    for (const bundleKey of ['main', 'second']) {
      const prepared = prepareBundleRun({
        source: 'supplied',
        bundleKey,
        bundleDefinition: definition,
        config: { ...config, runtime: 'transloco' },
      });
      expect(prepared.warnings).toEqual([
        {
          origin: 'config',
          message: `Bundle '${bundleKey}': transformICUToTransloco is off, so the transloco runtime setting does not apply; the bundle holds ICU-quoted text`,
        },
      ]);
      prepared.content();
      prepared.content();
      expect(prepared.warnings).toHaveLength(1);
    }
  });

  it('omits the runtime config warning for messageformat or enabled conversion', () => {
    for (const overrides of [
      { config },
      { config: { ...config, runtime: 'transloco' as const }, transformICUToTransloco: true },
      {
        config: { ...config, runtime: 'transloco' as const },
        bundleDefinition: { ...definition, transformICUToTransloco: true },
      },
    ]) {
      const prepared = prepareBundleRun({
        source: 'supplied',
        bundleKey: 'main',
        bundleDefinition: definition,
        ...overrides,
      });
      expect(prepared.warnings).toEqual([]);
    }
  });

  it('trims supplied keys before validation and settings resolution', () => {
    const prepared = prepareBundleRun({
      source: 'supplied',
      bundleKey: ' main ',
      bundleDefinition: definition,
      config,
    });
    expect(prepared.bundleKey).toBe('main');
    expect(prepared.settings.tokenConstantName).toBe('MAIN_TOKENS');
  });

  it('keeps saved route keys verbatim', () => {
    expect(() => prepareBundleRun({ source: 'saved', bundleKey: ' main ', config })).toThrow(
      'Bundle " main " not found',
    );
  });

  it('normalizes an unsaved definition once', () => {
    const prepared = prepareBundleRun({
      source: 'supplied',
      bundleKey: 'preview',
      bundleDefinition: { ...definition, dist: ' ./dist ' },
      config,
      cwd: 'project',
    });
    expect(prepared.definition).toEqual({ ...definition, dist: './dist' });
    expect(prepared.bundleKey).toBe('preview');
    expect(prepared.cwd).toBe(resolve('project'));
    expect(prepared.locales).toEqual(['en', 'fr']);
  });

  it('finds a saved definition and checks locales without validating its shape', () => {
    const saved = { ...definition, bundleName: 'fixed', tokenConstantName: '1bad' };
    const prepared = prepareBundleRun({
      source: 'saved',
      bundleKey: 'main',
      config: { ...config, bundles: { main: saved } },
      locales: ['fr'],
    });
    expect(prepared.definition).toBe(saved);
    expect(prepared.bundleKey).toBe('main');
    expect(prepared.cwd).toBe(process.cwd());
    expect(prepared.locales).toEqual(['fr']);
    expect(prepared.settings.tokenConstantName).toBe('1bad');
    expect(() => prepareBundleRun({ source: 'saved', bundleKey: 'missing', config })).toThrow(
      'Bundle "missing" not found',
    );
  });

  it('records the legacy typeDist warning without replacing the saved definition', () => {
    const saved = { ...definition, typeDist: 'types/legacy.ts' } as BundleDefinition;
    const prepared = prepareBundleRun({
      source: 'saved',
      bundleKey: 'main',
      config: { ...config, bundles: { main: saved } },
    });
    expect(prepared.definition).toBe(saved);
    expect(prepared.warnings).toEqual([
      {
        origin: 'config',
        message:
          "Warning: Bundle 'main': 'typeDist' is deprecated and will be removed in the next major version. Please rename to 'typeDistFile' in your .lingo-tracker.json config.",
      },
    ]);
  });

  it('defers opening saved collections until the run consumes them', () => {
    const prepared = prepareBundleRun({
      source: 'saved',
      bundleKey: 'main',
      config: {
        ...config,
        collections: { broken: { translationsFolder: 42 as never } },
        bundles: { main: { ...definition, collections: [{ name: 'broken', entriesSelectionRules: 'All' }] } },
      },
    });
    expect(() => prepared.collections).toThrow();
  });
});
