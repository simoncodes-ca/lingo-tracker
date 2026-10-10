import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BundleDefinition } from '@simoncodes-ca/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { type SeedResource, seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import type { Collection } from '../config/open-collection';
import { BundleNotFoundError, type InvalidBundleLocalesError } from '../errors';
import {
  type BundleProgressEvent,
  type BundleTypeOutcome,
  type GenerateBundleParams,
  bundleTypeOutcomeDetail,
  generateBundle as generateBundleByName,
  generatePreparedBundle,
} from './generate-bundle';
import { prepareBundleRun, validateBundleLocales } from './prepare-bundle-run';

describe('bundleTypeOutcomeDetail', () => {
  it('returns details for every status without status words, framing or deprecated-setting warnings', () => {
    const cases: ReadonlyArray<{ outcome: BundleTypeOutcome; detail: string }> = [
      {
        outcome: { status: 'written', path: 'types/main.ts', keysCount: 2 },
        detail: 'types/main.ts (2 keys)',
      },
      {
        outcome: { status: 'skipped', reason: 'empty-bundle' },
        detail: 'bundle is empty',
      },
      {
        outcome: { status: 'not-configured' },
        detail: 'no typeDistFile configured',
      },
      {
        outcome: { status: 'failed', reason: 'disk full' },
        detail: 'disk full',
      },
    ];

    for (const { outcome, detail } of cases) {
      expect(bundleTypeOutcomeDetail(outcome)).toBe(detail);
    }
  });
});

async function generateBundle(params: GenerateBundleParams & { bundleDefinition: BundleDefinition }) {
  const { bundleDefinition, ...request } = params;
  return generateBundleByName({
    ...request,
    config: { ...request.config, bundles: { ...request.config.bundles, [request.bundleKey]: bundleDefinition } },
  });
}

describe('generateBundle (real fs)', () => {
  const root = useTempDir('bundle-generate-');

  afterEach(() => vi.restoreAllMocks());

  function seed(name: string, resources: Record<string, SeedResource>, overrides: Partial<Collection> = {}): string {
    const folder = join(root(), name);
    seedResources(testCollection(folder, { name, ...overrides }), resources);
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
      locales: ['en', 'fr', 'es'],
      collections: Object.fromEntries(
        Object.entries(collections).map(([name, translationsFolder]) => [name, { translationsFolder }]),
      ),
      ...overrides,
    };
  }

  function definition(overrides: Partial<BundleDefinition> = {}): BundleDefinition {
    return { bundleName: '{locale}', dist: 'dist/bundles', collections: 'All', ...overrides };
  }

  function readJson(path: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  }

  it('rejects an unknown saved bundle name before writing', async () => {
    await expect(
      generateBundleByName({ bundleKey: 'missing', config: config({}), cwd: root() }),
    ).rejects.toBeInstanceOf(BundleNotFoundError);
    expect(existsSync(join(root(), 'dist/bundles/en.json'))).toBe(false);
  });

  it.each(['constructor', '__proto__'])('rejects prototype-member bundle name %s', async (bundleKey) => {
    await expect(
      generateBundleByName({ bundleKey, config: config({}, { bundles: { main: definition() } }), cwd: root() }),
    ).rejects.toBeInstanceOf(BundleNotFoundError);
  });

  it('rejects an unconfigured locale filter with the API message', async () => {
    await expect(
      generateBundleByName({
        bundleKey: 'main',
        config: config({}, { bundles: { main: definition() } }),
        locales: ['en', 'xx'],
        cwd: root(),
      }),
    ).rejects.toMatchObject({
      name: 'InvalidBundleLocalesError',
      message: 'Unknown locale "xx": must be defined in the project locales',
    } satisfies Partial<InvalidBundleLocalesError>);
  });

  it('reports multiple unconfigured locales with the plural API message', async () => {
    await expect(
      generateBundleByName({
        bundleKey: 'main',
        config: config({}, { bundles: { main: definition() } }),
        locales: ['xx', 'yy'],
        cwd: root(),
      }),
    ).rejects.toThrow('Unknown locales "xx", "yy": must be defined in the project locales');
  });

  it('lists an output outside cwd with a leading parent segment', async () => {
    const common = seed('common', { welcome: { source: 'Welcome' } });
    const result = await generateBundleByName({
      bundleKey: 'main',
      config: config({ common }, { bundles: { main: definition({ dist: '../shared' }) } }),
      locales: ['en'],
      cwd: join(root(), 'project'),
    });

    expect(result.writtenFiles).toEqual(['../shared/en.json']);
    expect(existsSync(join(root(), 'shared/en.json'))).toBe(true);
  });

  it('rejects a malformed locale filter with the API message', () => {
    expect(() => validateBundleLocales('en' as never, config({}))).toThrow('locales must be an array of strings');
  });

  it('generates every configured locale by default', async () => {
    const common = seed('common', {
      welcome: { source: 'Welcome', translations: { fr: 'Bienvenue', es: 'Bienvenido' } },
    });

    const result = await generateBundle({
      bundleKey: 'main',
      bundleDefinition: definition(),
      config: config({ common }),
      cwd: root(),
    });

    expect(result.filesGenerated).toBe(3);
    expect(result.writtenFiles).toEqual(['dist/bundles/en.json', 'dist/bundles/fr.json', 'dist/bundles/es.json']);
    expect(result.localesProcessed).toEqual(['en', 'fr', 'es']);
    expect(result.warnings).toEqual([]);
  });

  it('generates from the prepared bundle key and root', async () => {
    const common = seed('common', { welcome: { source: 'Welcome' } });
    const prepared = prepareBundleRun({
      source: 'saved',
      bundleKey: 'prepared',
      config: config({ common }, { bundles: { prepared: definition({ typeDistFile: 'types/prepared.ts' }) } }),
      locales: ['en'],
      cwd: root(),
    });

    const result = await generatePreparedBundle(prepared);

    expect(result.bundleKey).toBe('prepared');
    expect(result.writtenFiles).toEqual(['dist/bundles/en.json', 'types/prepared.ts']);
    expect(existsSync(join(root(), 'dist/bundles/en.json'))).toBe(true);
    expect(existsSync(join(root(), 'types/prepared.ts'))).toBe(true);
  });

  it('generates only the requested locale subset', async () => {
    const common = seed('common', {
      welcome: { source: 'Welcome', translations: { fr: 'Bienvenue', es: 'Bienvenido' } },
    });
    const result = await generateBundle({
      bundleKey: 'main',
      bundleDefinition: definition(),
      config: config({ common }),
      locales: ['en', 'fr'],
      cwd: root(),
    });

    expect(result.filesGenerated).toBe(2);
    expect(result.localesProcessed).toEqual(['en', 'fr']);
    expect(existsSync(join(root(), 'dist/bundles/es.json'))).toBe(false);
  });

  it('warns for every empty locale and generates no files', async () => {
    const result = await generateBundle({
      bundleKey: 'main',
      bundleDefinition: definition(),
      config: config({}),
      cwd: root(),
    });

    expect(result.filesGenerated).toBe(0);
    expect(result.warnings).toContain("Bundle 'main' for locale 'en' is empty");
    expect(result.warnings).toContain("Bundle 'main' for locale 'fr' is empty");
    expect(result.warnings).toContain("Bundle 'main' for locale 'es' is empty");
  });

  it('warns for a missing collection once per run and writes the remaining files', async () => {
    const common = seed('common', {
      welcome: { source: 'Welcome', translations: { fr: 'Bienvenue' } },
    });
    const result = await generateBundle({
      bundleKey: 'main',
      bundleDefinition: definition({
        collections: [
          { name: 'nonexistent', entriesSelectionRules: 'All' },
          { name: 'common', entriesSelectionRules: 'All' },
        ],
      }),
      config: config({ common }, { locales: ['en', 'fr'] }),
      cwd: root(),
    });
    expect(
      result.warnings.filter((warning) => warning === "Collection 'nonexistent' not found in config"),
    ).toHaveLength(1);
    expect(result.writtenFiles).toEqual(['dist/bundles/en.json', 'dist/bundles/fr.json']);
    expect(readJson(join(root(), 'dist/bundles/en.json'))).toEqual({ welcome: 'Welcome' });
  });

  it.each([
    { label: 'legacy bundle key', bundleKey: 'legacy.name', overrides: {} },
    { label: 'filename without a locale placeholder', bundleKey: 'main', overrides: { bundleName: 'fixed' } },
    {
      label: 'duplicate collection without a prefix',
      bundleKey: 'main',
      overrides: {
        collections: [
          { name: 'common', entriesSelectionRules: 'All' as const },
          { name: 'common', entriesSelectionRules: 'All' as const },
        ],
      },
    },
    {
      label: 'unknown merge strategy',
      bundleKey: 'main',
      overrides: {
        collections: [{ name: 'common', entriesSelectionRules: 'All' as const, mergeStrategy: 'unknown' as never }],
      },
    },
    { label: 'unknown token casing', bundleKey: 'main', overrides: { tokenCasing: 'unknown' as never } },
    {
      label: 'unknown tag operator',
      bundleKey: 'main',
      overrides: {
        collections: [
          {
            name: 'common',
            entriesSelectionRules: [
              { matchingPattern: '*', matchingTags: ['ui'], matchingTagOperator: 'unknown' as never },
            ],
          },
        ],
      },
    },
  ])('still generates JSON from a saved bundle with $label', async ({ bundleKey, overrides }) => {
    const common = seed('common', { welcome: { source: 'Welcome', tags: ['ui'] } });
    const result = await generateBundle({
      bundleKey,
      bundleDefinition: definition(overrides as Partial<BundleDefinition>),
      config: config({ common }),
      locales: ['en'],
      cwd: root(),
    });
    const file = 'bundleName' in overrides && overrides.bundleName === 'fixed' ? 'fixed.json' : 'en.json';
    expect(result.writtenFiles).toEqual([`dist/bundles/${file}`]);
    expect(readJson(join(root(), 'dist/bundles', file))).toEqual({ welcome: 'Welcome' });
  });

  it('uses {locale} in a filename', async () => {
    const common = seed('common', { welcome: { source: 'Welcome' } });
    await generateBundle({
      bundleKey: 'main',
      bundleDefinition: definition({ bundleName: 'main.{locale}' }),
      config: config({ common }),
      locales: ['en'],
      cwd: root(),
    });

    expect(existsSync(join(root(), 'dist/bundles/main.en.json'))).toBe(true);
  });

  it('uses {locale} in a subdirectory and creates missing output directories', async () => {
    const common = seed('common', { welcome: { source: 'Welcome' } });
    await generateBundle({
      bundleKey: 'main',
      bundleDefinition: definition({ bundleName: '{locale}/main' }),
      config: config({ common }),
      locales: ['en'],
      cwd: root(),
    });

    expect(existsSync(join(root(), 'dist/bundles/en/main.json'))).toBe(true);
  });

  it('writes two-space-formatted JSON with nested dot-key hierarchy', async () => {
    const common = seed('common', {
      'buttons.ok': { source: 'OK' },
      'buttons.cancel': { source: 'Cancel' },
    });
    await generateBundle({
      bundleKey: 'main',
      bundleDefinition: definition(),
      config: config({ common }),
      locales: ['en'],
      cwd: root(),
    });

    const expected = { buttons: { ok: 'OK', cancel: 'Cancel' } };
    expect(readFileSync(join(root(), 'dist/bundles/en.json'), 'utf8')).toBe(JSON.stringify(expected, null, 2));
  });

  it('resolves relative dist and typeDistFile paths against cwd', async () => {
    const common = seed('common', { welcome: { source: 'Welcome' } });
    const result = await generateBundle({
      bundleKey: 'main',
      bundleDefinition: definition({ typeDistFile: 'types/tokens.ts' }),
      config: config({ common }),
      locales: ['en'],
      cwd: root(),
    });

    expect(existsSync(join(root(), 'dist/bundles/en.json'))).toBe(true);
    expect(existsSync(join(root(), 'types/tokens.ts'))).toBe(true);
    expect(result.typeOutcome).toMatchObject({ status: 'written', path: 'types/tokens.ts' });
    expect(result.writtenFiles).toEqual(['dist/bundles/en.json', 'types/tokens.ts']);
  });

  it('uses cwd to resolve a relative collection translationsFolder', async () => {
    seed('translations/common', { welcome: { source: 'Welcome' } });
    const result = await generateBundle({
      bundleKey: 'main',
      bundleDefinition: definition(),
      config: config({ common: 'translations/common' }),
      locales: ['en'],
      cwd: root(),
    });

    expect(result.filesGenerated).toBe(1);
    expect(readJson(join(root(), 'dist/bundles/en.json'))).toEqual({ welcome: 'Welcome' });
  });

  describe('type generation', () => {
    it('separates config warnings from ordered run warnings for every type status', async () => {
      for (const legacy of [false, true]) {
        for (const status of ['written', 'skipped', 'failed', 'not-configured'] as const) {
          const name = `${status}-${legacy}`;
          const folder = seed(name, status === 'skipped' ? {} : { hello: { source: 'Hello' } });
          const typePath =
            status === 'not-configured' ? '' : status === 'failed' ? 'types/invalid.txt' : `types/${name}.ts`;
          const bundleDefinition = {
            ...definition({
              collections: [
                { name: 'deleted', entriesSelectionRules: 'All' },
                { name, entriesSelectionRules: 'All' },
              ],
            }),
            ...(legacy ? { typeDist: typePath } : { typeDistFile: typePath }),
          };
          const result = await generateBundle({
            bundleKey: 'main',
            bundleDefinition,
            config: config({ [name]: folder }),
            locales: ['en'],
            cwd: root(),
          });
          const preparedWarning =
            "Warning: Bundle 'main': 'typeDist' is deprecated and will be removed in the next major version. Please rename to 'typeDistFile' in your .lingo-tracker.json config.";
          const ordinary = [
            "Collection 'deleted' not found in config",
            ...(status === 'skipped' ? ["Bundle 'main' for locale 'en' is empty"] : []),
          ];
          const outcomeWarning =
            status === 'skipped'
              ? ["Type generation skipped for 'main': bundle is empty"]
              : status === 'failed'
                ? [
                    "Type generation failed for 'main': typeDistFile must end with a .ts extension (e.g. './src/types/tokens.ts'), but got: types/invalid.txt",
                  ]
                : [];
          expect(result.typeOutcome.status).toBe(status);
          expect(result.configWarning).toBe(legacy ? preparedWarning : undefined);
          expect(result.warnings).toEqual(ordinary);
          expect(result.typeWarning).toBe(outcomeWarning[0]);
        }
      }
    });

    it('writes types and reports the generated file and key count when configured', async () => {
      const common = seed('common', { 'buttons.ok': { source: 'OK' }, 'buttons.cancel': { source: 'Cancel' } });
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ typeDistFile: 'types/main.ts' }),
        config: config({ common }),
        locales: ['en'],
        cwd: root(),
      });

      expect(result.typeOutcome.status).toBe('written');
      expect(result.typeOutcome).toMatchObject({ status: 'written', keysCount: 2 });
      expect(result.typeOutcome).toMatchObject({ status: 'written', path: 'types/main.ts' });
      expect(existsSync(join(root(), 'types/main.ts'))).toBe(true);
    });

    it('does not run type generation when no type output is configured', async () => {
      const common = seed('common', { welcome: { source: 'Welcome' } });
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition(),
        config: config({ common }),
        locales: ['en'],
        cwd: root(),
      });

      expect(result.typeOutcome.status).toBe('not-configured');
    });

    it('supports deprecated typeDist and returns its deprecation warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const common = seed('common', { welcome: { source: 'Welcome' } });
      const legacy = { ...definition(), typeDist: 'types/legacy.ts' } as unknown as BundleDefinition;
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: legacy,
        config: config({ common }),
        locales: ['en'],
        cwd: root(),
      });

      expect(result.typeOutcome.status).toBe('written');
      expect(existsSync(join(root(), 'types/legacy.ts'))).toBe(true);
      expect(result.configWarning).toContain("'typeDist' is deprecated");
      expect(result.warnings).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('uses typeDistFile without warning when current and deprecated keys are both present', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const common = seed('common', { welcome: { source: 'Welcome' } });
      const withBoth = {
        ...definition({ typeDistFile: 'types/current.ts' }),
        typeDist: 'types/legacy.ts',
      } as unknown as BundleDefinition;
      await generateBundle({
        bundleKey: 'main',
        bundleDefinition: withBoth,
        config: config({ common }),
        locales: ['en'],
        cwd: root(),
      });

      expect(existsSync(join(root(), 'types/current.ts'))).toBe(true);
      expect(existsSync(join(root(), 'types/legacy.ts'))).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it('passes tokenConstantName to the generated file', async () => {
      const common = seed('common', { welcome: { source: 'Welcome' } });
      await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ typeDistFile: 'types/main.ts' }),
        config: config({ common }),
        locales: ['en'],
        tokenConstantName: 'CUSTOM_TOKENS',
        cwd: root(),
      });

      expect(readFileSync(join(root(), 'types/main.ts'), 'utf8')).toContain('export const CUSTOM_TOKENS');
    });

    it('describes thrown type generation errors from the structured outcome', async () => {
      const common = seed('common', { welcome: { source: 'Welcome' } });
      writeFileSync(join(root(), 'blocked'), 'not a directory');
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ typeDistFile: 'blocked/tokens.ts' }),
        config: config({ common }),
        locales: ['en'],
        cwd: root(),
      });

      expect(result.typeOutcome).toMatchObject({ status: 'failed' });
      expect(result.outcome).toBe('failed');
      expect(result.warnings).toEqual([]);
      expect(result.typeWarning).toMatch(/^Type generation failed for 'main': /);
    });

    it('describes a rejected type file path as a failed outcome', async () => {
      const common = seed('common', { welcome: { source: 'Welcome' } });
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ typeDistFile: 'types/main.txt' }),
        config: config({ common }),
        locales: ['en'],
        cwd: root(),
      });
      expect(result.typeOutcome).toMatchObject({ status: 'failed', reason: expect.stringContaining('.ts extension') });
      expect(result.outcome).toBe('failed');
      expect(result.warnings).toEqual([]);
      expect(result.typeWarning).toMatch(/^Type generation failed for 'main': /);
      expect(result.writtenFiles).toEqual(['dist/bundles/en.json']);
    });

    it('writes JSON and reports a failed type outcome for an invalid saved constant name', async () => {
      const common = seed('common', { welcome: { source: 'Welcome' } });
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ typeDistFile: 'types/main.ts', tokenConstantName: '1bad' }),
        config: config({ common }),
        locales: ['en'],
        cwd: root(),
      });
      expect(result.writtenFiles).toEqual(['dist/bundles/en.json']);
      expect(result.typeOutcome).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('Invalid tokenConstantName'),
      });
      expect(readJson(join(root(), 'dist/bundles/en.json'))).toEqual({ welcome: 'Welcome' });
    });

    it('reports an empty type key set as a skipped outcome', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const empty = join(root(), 'empty');
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ typeDistFile: 'types/main.ts' }),
        config: config({ empty }, { locales: [] }),
        cwd: root(),
      });

      expect(result.typeOutcome).toEqual({ status: 'skipped', reason: 'empty-bundle' });
      expect(result.warnings).toEqual([]);
      expect(result.typeWarning).toBe("Type generation skipped for 'main': bundle is empty");
      expect(existsSync(join(root(), 'types/main.ts'))).toBe(false);
    });

    it.each([
      {
        name: 'CLI parameter over bundle and global config',
        parameter: 'camelCase' as const,
        bundle: 'upperCase' as const,
        global: 'upperCase' as const,
        expected: 'buttons: {',
      },
      {
        name: 'bundle config over global config',
        parameter: undefined,
        bundle: 'camelCase' as const,
        global: 'upperCase' as const,
        expected: 'buttons: {',
      },
      {
        name: 'global config when no higher override exists',
        parameter: undefined,
        bundle: undefined,
        global: 'camelCase' as const,
        expected: 'buttons: {',
      },
      {
        name: 'upperCase by default',
        parameter: undefined,
        bundle: undefined,
        global: undefined,
        expected: 'BUTTONS: {',
      },
    ])('uses $name for token casing', async ({ parameter, bundle, global, expected }) => {
      const common = seed('common', { 'buttons.ok': { source: 'OK' } });
      await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ typeDistFile: 'types/main.ts', tokenCasing: bundle }),
        config: config({ common }, { tokenCasing: global }),
        locales: ['en'],
        tokenCasing: parameter,
        cwd: root(),
      });

      expect(readFileSync(join(root(), 'types/main.ts'), 'utf8')).toContain(expected);
    });
  });

  describe('progress and key counts', () => {
    it('emits ordered 1-based progress events with configured output paths', async () => {
      const common = seed('common', {
        welcome: { source: 'Welcome', translations: { fr: 'Bienvenue' } },
      });
      const events: BundleProgressEvent[] = [];
      const bundleDefinition = definition({ bundleName: 'main.{locale}' });
      await generateBundle({
        bundleKey: 'main',
        bundleDefinition,
        config: config({ common }),
        locales: ['en', 'fr'],
        onProgress: (event) => events.push(event),
        cwd: root(),
      });

      expect(events).toEqual([
        { locale: 'en', index: 1, total: 2, file: 'dist/bundles/main.en.json' },
        { locale: 'fr', index: 2, total: 2, file: 'dist/bundles/main.fr.json' },
      ]);
    });

    it('counts the debug locale in progress and emits it last', async () => {
      const common = seed('common', { welcome: { source: 'Welcome' } });
      const events: BundleProgressEvent[] = [];
      const bundleDefinition = definition();
      await generateBundle({
        bundleKey: 'main',
        bundleDefinition,
        config: config({ common }),
        locales: ['en'],
        debugKeysLocale: '99',
        onProgress: (event) => events.push(event),
        cwd: root(),
      });

      expect(events).toEqual([
        { locale: 'en', index: 1, total: 2, file: 'dist/bundles/en.json' },
        { locale: '99', index: 2, total: 2, file: 'dist/bundles/99.json' },
      ]);
    });

    it('emits progress for a locale that turns out empty', async () => {
      const events: BundleProgressEvent[] = [];
      await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition(),
        config: config({}),
        locales: ['en'],
        onProgress: (event) => events.push(event),
        cwd: root(),
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ locale: 'en', index: 1, total: 1 });
    });

    it('reports key counts for each processed locale', async () => {
      const common = seed('common', {
        one: { source: 'One', translations: { fr: 'Un' } },
        two: { source: 'Two', translations: { fr: 'Deux' } },
      });
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition(),
        config: config({ common }),
        locales: ['en', 'fr'],
        cwd: root(),
      });

      expect(result.keysPerLocale).toEqual({ en: 2, fr: 2 });
    });

    it('omits empty locales from key counts and includes the debug locale', async () => {
      const common = seed('common', { one: { source: 'One' } });
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition(),
        config: config({ common }),
        locales: ['en', 'fr'],
        debugKeysLocale: '99',
        cwd: root(),
      });

      expect(result.keysPerLocale).toEqual({ en: 1, '99': 1 });
    });
  });

  describe('debugKeysLocale', () => {
    it('lists locale, debug and type files in write order', async () => {
      const common = seed('common', { welcome: { source: 'Welcome' } });
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ typeDistFile: 'types/main.ts' }),
        config: config({ common }),
        locales: ['en'],
        debugKeysLocale: '99',
        cwd: root(),
      });

      expect(result.writtenFiles).toEqual(['dist/bundles/en.json', 'dist/bundles/99.json', 'types/main.ts']);
      expect(result.typeOutcome).toEqual({ status: 'written', path: 'types/main.ts', keysCount: 1 });
    });

    it('emits one extra file whose values equal their keys', async () => {
      const common = seed('common', {
        'buttons.ok': { source: 'OK' },
        'buttons.cancel': { source: 'Cancel' },
      });
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition(),
        config: config({ common }),
        locales: ['en'],
        debugKeysLocale: '99',
        cwd: root(),
      });

      expect(result.filesGenerated).toBe(2);
      expect(result.writtenFiles).toEqual(['dist/bundles/en.json', 'dist/bundles/99.json']);
      expect(readJson(join(root(), 'dist/bundles/99.json'))).toEqual({
        buttons: { ok: 'buttons.ok', cancel: 'buttons.cancel' },
      });
    });

    it('uses prefixed bundled keys as debug values', async () => {
      const common = seed('common', { 'buttons.ok': { source: 'OK' } });
      await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({
          collections: [{ name: 'common', entriesSelectionRules: 'All', bundledKeyPrefix: 'shared' }],
        }),
        config: config({ common }),
        locales: [],
        debugKeysLocale: 'debug',
        cwd: root(),
      });

      expect(readJson(join(root(), 'dist/bundles/debug.json'))).toEqual({
        shared: { buttons: { ok: 'shared.buttons.ok' } },
      });
    });

    it('uses a custom locale code in the filename', async () => {
      const common = seed('common', { welcome: { source: 'Welcome' } });
      await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ bundleName: 'main.{locale}' }),
        config: config({ common }),
        locales: [],
        debugKeysLocale: 'keys',
        cwd: root(),
      });

      expect(existsSync(join(root(), 'dist/bundles/main.keys.json'))).toBe(true);
    });

    it('warns and writes no debug file for an empty bundle', async () => {
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition(),
        config: config({}),
        locales: [],
        debugKeysLocale: '99',
        cwd: root(),
      });

      expect(result.warnings).toContain("Bundle 'main' debug bundle is empty");
      expect(result.filesGenerated).toBe(0);
      expect(existsSync(join(root(), 'dist/bundles/99.json'))).toBe(false);
    });

    it('reports base-selection ICU warnings during the debug-only pass', async () => {
      const common = seed('common', { greeting: { source: 'Hello {name' } });
      const result = await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition(),
        config: config({ common }),
        locales: [],
        debugKeysLocale: '99',
        transformICUToTransloco: true,
        cwd: root(),
      });

      expect(readJson(join(root(), 'dist/bundles/99.json'))).toEqual({ greeting: 'greeting' });
      expect(result.warnings.some((warning) => warning.includes("Key 'greeting'"))).toBe(true);
    });
  });

  describe('transformICUToTransloco precedence', () => {
    it.each([
      { name: 'true parameter', parameter: true, bundle: undefined, global: undefined, expected: 'Hello {{ name }}' },
      { name: 'false parameter', parameter: false, bundle: undefined, global: undefined, expected: 'Hello {name}' },
      { name: 'default', parameter: undefined, bundle: undefined, global: undefined, expected: 'Hello {{ name }}' },
      { name: 'bundle setting', parameter: undefined, bundle: false, global: undefined, expected: 'Hello {name}' },
      { name: 'global setting', parameter: undefined, bundle: undefined, global: false, expected: 'Hello {name}' },
      {
        name: 'parameter over bundle and global',
        parameter: true,
        bundle: false,
        global: false,
        expected: 'Hello {{ name }}',
      },
    ])('uses the $name', async ({ parameter, bundle, global, expected }) => {
      const common = seed('common', { greeting: { source: 'Hello {name}' } });
      await generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition({ transformICUToTransloco: bundle }),
        config: config({ common }, { transformICUToTransloco: global }),
        locales: ['en'],
        transformICUToTransloco: parameter,
        cwd: root(),
      });

      expect(readJson(join(root(), 'dist/bundles/en.json'))).toEqual({ greeting: expected });
    });
  });

  describe('branch bodies the bundler cannot rewrite', () => {
    const UNBUNDLABLE_VALUE = '{count, plural, =1 {{n, number}} other {# items}}';
    const UNRESOLVABLE_NAME_VALUE = '{a, plural, one {{some text}} other {z}}';
    const EXPANDED_VALUE =
      'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.';
    const EXPANDED_OUTPUT =
      'This will delete {nameExists, select, hasName {{{name}}} other {this item}} and cannot be undone.';
    const SELECTORDINAL_CASES: readonly { description: string; stored: string; emitted: string }[] = [
      {
        description: 'a selectordinal group with its branches intact',
        stored: '{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}',
        emitted: '{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}',
      },
      {
        description: 'a bare-argument selectordinal branch body as the triple',
        stored: '{rank, selectordinal, one {{itemName}} other {#th}}',
        emitted: '{rank, selectordinal, one {{{itemName}}} other {#th}}',
      },
    ];
    const SAFE_VALUES: readonly string[] = [
      'x {{name} extra}',
      'x {pre {name}}',
      'x {{b, plural, one {p} other {q}}}',
      '{a, plural, one {{b, plural, one {p} other {q}}} other {z}}',
    ];

    function branchBodyWarnings(warnings: readonly string[]): string[] {
      return warnings.filter((warning) => warning.includes('cannot be carried to a Transloco runtime'));
    }

    async function bundleValue(
      key: string,
      source: string,
      options: { translations?: Record<string, string>; locales?: string[]; transform?: boolean } = {},
    ): Promise<Awaited<ReturnType<typeof generateBundle>>> {
      const common = seed('common', {
        [key]: { source, ...(options.translations && { translations: options.translations }) },
      });
      return generateBundle({
        bundleKey: 'main',
        bundleDefinition: definition(),
        config: config({ common }, { locales: options.locales ?? ['en'] }),
        locales: options.locales ?? ['en'],
        transformICUToTransloco: options.transform ?? true,
        cwd: root(),
      });
    }

    it('warns once for a format-carrying branch body', async () => {
      const result = await bundleValue('itemCount', UNBUNDLABLE_VALUE);
      const reported = branchBodyWarnings(result.warnings);

      expect(reported).toHaveLength(1);
      expect(reported[0]).toContain("Key 'itemCount':");
      expect(reported[0]).toContain('does not render as written');
      expect(reported[0]).toContain('an argument carrying a format');
      expect(reported[0]).toContain(`value: ${UNBUNDLABLE_VALUE}`);
      expect(reported[0]).not.toContain('malformed');
    });

    it('warns and emits malformed selector/body structure unchanged, including nested values', async () => {
      for (const malformed of [
        '{n, plural, one x other {y}}',
        '{n, select, a {x} {y} other {z}}',
        '{n, plural, other {x}{y}}',
        '{n, plural, }',
      ]) {
        for (const value of [malformed, `{outer, select, other {${malformed}}}`]) {
          const result = await bundleValue('choice', value);
          expect(result.warnings).toContain("Key 'choice': value has malformed ICU syntax and was included as-is");
          expect(readJson(join(root(), 'dist/bundles/en.json'))).toEqual({ choice: value });
        }
      }
    });

    it('warns for a double-brace branch run that is not a parameter name', async () => {
      const result = await bundleValue('choice', UNRESOLVABLE_NAME_VALUE);
      const reported = branchBodyWarnings(result.warnings);

      expect(reported).toHaveLength(1);
      expect(reported[0]).toContain("Key 'choice':");
      expect(reported[0]).toContain('a run that is no parameter name');
      expect(reported[0]).toContain(`value: ${UNRESOLVABLE_NAME_VALUE}`);
      expect(result.warnings).toContain("Key 'choice': value has malformed ICU syntax and was included as-is");
      expect(readJson(join(root(), 'dist/bundles/en.json'))).toEqual({ choice: UNRESOLVABLE_NAME_VALUE });
    });

    it('warns once per key per locale and once across each locale', async () => {
      const result = await bundleValue('itemCount', UNBUNDLABLE_VALUE, {
        translations: { fr: UNBUNDLABLE_VALUE },
        locales: ['en', 'fr'],
      });

      expect(branchBodyWarnings(result.warnings)).toHaveLength(2);
    });

    it('bundles the emitted value and still generates the file', async () => {
      const result = await bundleValue('itemCount', UNBUNDLABLE_VALUE);

      expect(result.filesGenerated).toBe(1);
      expect(readJson(join(root(), 'dist/bundles/en.json'))).toEqual({ itemCount: UNBUNDLABLE_VALUE });
    });

    it('does not warn when ICU transformation is disabled', async () => {
      const result = await bundleValue('itemCount', UNBUNDLABLE_VALUE, { transform: false });
      expect(branchBodyWarnings(result.warnings)).toHaveLength(0);
    });

    it('bundles a bare-argument branch body as the triple', async () => {
      const result = await bundleValue('deleteConfirm', EXPANDED_VALUE);

      expect(branchBodyWarnings(result.warnings)).toHaveLength(0);
      expect(readJson(join(root(), 'dist/bundles/en.json'))).toEqual({ deleteConfirm: EXPANDED_OUTPUT });
    });

    for (const { description, stored, emitted } of SELECTORDINAL_CASES) {
      it(`bundles ${description}`, async () => {
        const result = await bundleValue('rank', stored);

        expect(branchBodyWarnings(result.warnings)).toHaveLength(0);
        expect(readJson(join(root(), 'dist/bundles/en.json'))).toEqual({ rank: emitted });
      });
    }

    for (const value of SAFE_VALUES) {
      it(`does not warn for ${value}`, async () => {
        const result = await bundleValue('safe', value);
        expect(branchBodyWarnings(result.warnings)).toHaveLength(0);
      });
    }
  });

  describe('the icu-edge-cases fixture collection', () => {
    const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
    const FIXTURE_COLLECTION = 'icuEdgeCases';
    const EXPECTED_FIXTURE_LOCALES: readonly string[] = ['en', 'fr-ca', 'ja'];
    const FORMAT_CARRYING_KEY = 'status.syncedRecordCount';

    interface FixtureConfigFile {
      readonly baseLocale: string;
      readonly locales?: string[];
      readonly collections: Record<string, { readonly translationsFolder: string; readonly locales?: string[] }>;
    }

    function fixture(): { config: LingoTrackerConfig; locales: string[] } {
      const raw = JSON.parse(readFileSync(join(REPO_ROOT, '.lingo-tracker.json'), 'utf8')) as FixtureConfigFile;
      const collection = raw.collections[FIXTURE_COLLECTION];
      expect(collection).toBeDefined();
      const locales = collection?.locales ?? raw.locales ?? [];
      return {
        locales,
        config: {
          exportFolder: 'dist/export',
          importFolder: 'dist/import',
          baseLocale: raw.baseLocale,
          locales,
          collections: collection
            ? {
                [FIXTURE_COLLECTION]: {
                  ...collection,
                  translationsFolder: resolve(REPO_ROOT, collection.translationsFolder),
                },
              }
            : {},
        },
      };
    }

    function flattenBundle(data: Record<string, unknown>, prefix = ''): Record<string, string> {
      const flat: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'string') flat[fullKey] = value;
        else if (value && typeof value === 'object') {
          Object.assign(flat, flattenBundle(value as Record<string, unknown>, fullKey));
        }
      }
      return flat;
    }

    async function bundleFixtureLocale(
      locale: string,
    ): Promise<{ emitted: Record<string, string>; warnings: readonly string[] }> {
      const fixtureData = fixture();
      const result = await generateBundle({
        bundleKey: 'icu-edge-cases',
        bundleDefinition: { bundleName: '{locale}', dist: join(root(), 'fixture-bundles'), collections: 'All' },
        config: fixtureData.config,
        locales: [locale],
        transformICUToTransloco: true,
        cwd: root(),
      });
      expect(result.filesGenerated).toBe(1);
      return {
        emitted: flattenBundle(readJson(join(root(), 'fixture-bundles', `${locale}.json`))),
        warnings: result.warnings,
      };
    }

    it('produces one file per configured locale, including ja', async () => {
      const fixtureData = fixture();
      expect(fixtureData.locales).toEqual(EXPECTED_FIXTURE_LOCALES);

      const result = await generateBundle({
        bundleKey: 'icu-edge-cases',
        bundleDefinition: { bundleName: '{locale}', dist: join(root(), 'fixture-bundles'), collections: 'All' },
        config: fixtureData.config,
        locales: fixtureData.locales,
        transformICUToTransloco: true,
        cwd: root(),
      });

      expect(result.filesGenerated).toBe(fixtureData.locales.length);
      expect(result.localesProcessed).toEqual(fixtureData.locales);
      for (const locale of fixtureData.locales) {
        expect(existsSync(join(root(), 'fixture-bundles', `${locale}.json`))).toBe(true);
      }
    });

    it('carries both branch-body shapes based on position rather than key', async () => {
      const base = await bundleFixtureLocale('en');
      const japanese = await bundleFixtureLocale('ja');

      expect(base.emitted['errors.restrictedChildren']).toContain('=1 {{itemName} contains}');
      expect(japanese.emitted['errors.restrictedChildren']).toContain('=1 {{{itemName}}}');
    });

    it('bundles every value and reports distinct locale and base warnings only for the format-carrying key', async () => {
      const { locales } = fixture();
      const warned: string[] = [];

      for (const locale of locales) {
        const { emitted, warnings } = await bundleFixtureLocale(locale);
        expect(Object.keys(emitted).length).toBeGreaterThan(0);
        for (const warning of warnings) warned.push(`${locale}:${warning}`);
      }

      // The French value differs from the base value, so its run reports both.
      expect(warned).toHaveLength(locales.length + 1);
      for (const locale of locales) {
        const localeWarnings = warned.filter((warning) => warning.startsWith(`${locale}:`));
        expect(localeWarnings).toHaveLength(locale === 'fr-ca' ? 2 : 1);
        expect(localeWarnings.filter((warning) => warning.includes('value: Synced '))).toHaveLength(1);
        if (locale === 'fr-ca') {
          expect(localeWarnings.filter((warning) => warning.includes('value: Synchronisé '))).toHaveLength(1);
        }
      }
      for (const warning of warned) {
        expect(warning).toContain(`Key '${FORMAT_CARRYING_KEY}'`);
        expect(warning).toContain('cannot be carried to a Transloco runtime');
      }
    });
  });
});
