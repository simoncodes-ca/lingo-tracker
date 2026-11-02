import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BundleDefinition } from '@simoncodes-ca/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { BundleHierarchicalConflictError } from '../errors/internal';
import * as bundleSelection from './bundle-selection';
import { generatePreparedBundle } from './generate-bundle';
import { planPreparedBundle } from './plan-bundle';
import { prepareBundleRun } from './prepare-bundle-run';

describe('prepared bundle run', () => {
  const root = useTempDir('bundle-run-');
  afterEach(() => vi.restoreAllMocks());

  it('shares warnings and populated key counts while planning empty locales', async () => {
    const folder = join(root(), 'common');
    seedResources(testCollection(folder, { name: 'common', locales: ['en', 'fr', 'es'] }), {
      'messages.greeting': { source: 'Hello {name}', translations: { fr: 'Bonjour {name}' } },
      'messages.broken': { source: 'Broken {', translations: { fr: 'Cassé {' } },
    });
    const definition: BundleDefinition = {
      bundleName: '{locale}',
      dist: 'out',
      collections: 'All',
      typeDistFile: 'types/tokens.ts',
    };
    const config: LingoTrackerConfig = {
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { common: { translationsFolder: folder } },
      bundles: { main: definition },
    };

    const prepared = prepareBundleRun({
      source: 'saved',
      bundleKey: 'main',
      config,
      cwd: root(),
      locales: ['fr', 'es'],
      tokenConstantName: 'CUSTOM_TOKENS',
    });
    const plan = planPreparedBundle(prepared);
    expect(plan.files.map((file) => file.path)).toEqual(['out/fr.json', 'types/tokens.ts']);
    expect(prepared.content()).toBe(prepared.content());
    // A later edit is outside this already selected run.
    seedResources(testCollection(folder), { later: { source: 'Later', translations: { fr: 'Plus tard' } } });
    const generated = await generatePreparedBundle(prepared);
    expect(JSON.parse(readFileSync(join(root(), 'out/fr.json'), 'utf8'))).toEqual({
      messages: { greeting: 'Bonjour {{ name }}', broken: 'Cassé {' },
    });
    expect(readFileSync(join(root(), 'types/tokens.ts'), 'utf8')).not.toContain('later');
    expect(generated.writtenFiles).toEqual(plan.files.map((file) => file.path));
    expect(existsSync(join(root(), 'out/es.json'))).toBe(false);

    expect(prepared.bundleKey).toBe('main');
    expect(prepared.cwd).toBe(root());
    expect(plan.locales).toEqual(['fr', 'es']);
    expect(plan.keysPerLocale).toEqual({ fr: 2, es: 0 });
    expect(generated.keysPerLocale).toEqual({ fr: plan.keysPerLocale['fr'] });
    expect(generated.findings.byOrigin.generation).toEqual(plan.warnings);
    expect(plan.exampleKey?.tokenPath).toMatch(/^CUSTOM_TOKENS\./);
    expect(generated.writtenFiles).toEqual(['out/fr.json', 'types/tokens.ts']);
    expect(generated.findings.types).toMatchObject({ status: 'written', keysCount: 2 });
  });

  it('deduplicates only identical runtime warnings across locales within each bundle run', async () => {
    const folder = join(root(), 'common');
    const plural = '{n, plural, other {# items}}';
    seedResources(testCollection(folder, { runtime: 'transloco', locales: ['en', 'fr', 'es'] }), {
      count: { source: plural, translations: { fr: plural, es: plural } },
      later: { source: 'Plain', translations: { fr: plural, es: plural } },
      broken: { source: 'Broken {', translations: { fr: 'Broken {', es: 'Broken {' } },
    });
    const definition: BundleDefinition = { bundleName: '{locale}', dist: 'out', collections: 'All' };
    const config: LingoTrackerConfig = {
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      runtime: 'transloco',
      collections: { common: { translationsFolder: folder } },
      bundles: { first: definition, second: { ...definition, dist: 'second' } },
    };
    for (const bundleKey of ['first', 'second']) {
      const prepared = prepareBundleRun({ source: 'saved', bundleKey, config, cwd: root() });
      const plan = planPreparedBundle(prepared);
      expect(plan.warnings.filter((warning) => warning.includes('which the transloco runtime cannot render'))).toEqual([
        "Key 'count': uses ICU plural, which the transloco runtime cannot render; the bundled value is written in messageformat form. Set runtime to transloco-messageformat or rewrite the value without ICU constructs.",
        "Key 'later': uses ICU plural, which the transloco runtime cannot render; the bundled value is written in messageformat form. Set runtime to transloco-messageformat or rewrite the value without ICU constructs.",
      ]);
      expect(plan.warnings.filter((warning) => warning.includes('malformed ICU syntax'))).toHaveLength(3);
      const generated = await generatePreparedBundle(prepared);
      expect(generated.findings.byOrigin.generation).toEqual(plan.warnings);
    }
  });

  it('returns legacy and type-outcome warnings exactly once', async () => {
    const definition = {
      bundleName: '{locale}',
      dist: 'out',
      collections: 'All' as const,
      typeDist: 'types/tokens.ts',
    };
    const config: LingoTrackerConfig = {
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en'],
      collections: {},
      bundles: { main: definition },
    };
    const prepared = prepareBundleRun({ source: 'saved', bundleKey: 'main', config, cwd: root() });
    const result = await generatePreparedBundle(prepared);

    expect(result.findings.types).toEqual({ status: 'skipped', reason: 'bundle is empty' });
    expect(prepared.warnings).toEqual([{ origin: 'config', message: expect.any(String) }]);
    expect(result.findings.messages).toEqual([
      "Bundle 'main' for locale 'en' is empty",
      ...prepared.warnings.map((warning) => warning.message),
      "Type generation skipped for 'main': bundle is empty",
    ]);
  });

  it('rejects a later locale conflict before creating any output, in either key order', async () => {
    for (const reverse of [false, true]) {
      const folder = join(root(), `conflict-${reverse}`);
      const entries = [
        ['a.b', { source: 'Parent', translations: { fr: 'Parent' } }],
        ['a.b.c', { source: 'Child', translations: { fr: 'Child' } }],
      ] as const;
      seedResources(testCollection(folder), { safe: { source: 'Safe', translations: { es: 'Seguro' } } });
      seedResources(testCollection(folder), Object.fromEntries(reverse ? [...entries].reverse() : entries));
      const definition: BundleDefinition = {
        bundleName: '{locale}',
        dist: `out-${reverse}`,
        collections: 'All',
        typeDistFile: `types-${reverse}/tokens.ts`,
      };
      const config: LingoTrackerConfig = {
        exportFolder: 'export',
        importFolder: 'import',
        baseLocale: 'en',
        locales: ['es', 'fr'],
        collections: { common: { translationsFolder: folder } },
        bundles: { main: definition },
      };
      const prepared = prepareBundleRun({ source: 'saved', bundleKey: 'main', config, cwd: root() });
      const plan = planPreparedBundle(prepared);
      expect(plan.keysPerLocale['es']).toBe(1);
      expect(plan.hierarchicalConflicts).toEqual(['a.b']);
      await expect(generatePreparedBundle(prepared, { debugKeysLocale: '99' })).rejects.toBeInstanceOf(
        BundleHierarchicalConflictError,
      );
      expect(existsSync(join(root(), `out-${reverse}`))).toBe(false);
      expect(existsSync(join(root(), `types-${reverse}`))).toBe(false);
    }
  });

  it('reports source keys for parent conflicts introduced by token casing before writing', async () => {
    const folder = join(root(), 'common');
    seedResources(testCollection(folder), {
      'foo-bar': { source: 'Parent' },
      'foo_bar.child': { source: 'Child' },
    });
    const definition: BundleDefinition = {
      bundleName: '{locale}',
      dist: 'out',
      collections: 'All',
      typeDistFile: 'types/tokens.ts',
    };
    const config: LingoTrackerConfig = {
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en'],
      collections: { common: { translationsFolder: folder } },
      bundles: { main: definition },
    };
    const prepared = prepareBundleRun({ source: 'saved', bundleKey: 'main', config, cwd: root() });
    const plan = planPreparedBundle(prepared);
    expect(plan.hierarchicalConflicts).toEqual(['foo-bar']);
    await expect(generatePreparedBundle(prepared)).rejects.toMatchObject({
      code: 'BUNDLE_HIERARCHICAL_CONFLICT',
      conflicts: ['foo-bar'],
    });
    expect(existsSync(join(root(), 'out'))).toBe(false);
    expect(existsSync(join(root(), 'types'))).toBe(false);
  });

  it('reports locale selection progress before reading, and completes preflight before writing', async () => {
    const folder = join(root(), 'common');
    seedResources(testCollection(folder), { greeting: { source: 'Hello', translations: { fr: 'Bonjour' } } });
    const definition: BundleDefinition = { bundleName: '{locale}', dist: 'out', collections: 'All' };
    const config: LingoTrackerConfig = {
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: { common: { translationsFolder: folder } },
      bundles: { main: definition },
    };
    const trace: string[] = [];
    const select = bundleSelection.selectBundleEntries;
    vi.spyOn(bundleSelection, 'selectBundleEntries').mockImplementation((collections, locale, options) => {
      trace.push(`select:${typeof locale === 'string' ? locale : 'base'}`);
      expect(existsSync(join(root(), 'out'))).toBe(false);
      return select(collections, locale, options);
    });
    const prepared = prepareBundleRun({ source: 'saved', bundleKey: 'main', config, cwd: root() });
    await generatePreparedBundle(prepared, {
      debugKeysLocale: '99',
      onProgress: (event) => {
        trace.push(`progress:${event.locale}`);
        expect(event.file).toBe(`out/${event.locale}.json`);
        expect(event.total).toBe(3);
        expect(existsSync(join(root(), 'out'))).toBe(false);
      },
    });
    expect(trace).toEqual(['progress:en', 'select:en', 'progress:fr', 'select:fr', 'progress:99', 'select:base']);
    expect(existsSync(join(root(), 'out/99.json'))).toBe(true);
  });

  it('blocks base-only conflicts only when types or debug keys consume the base tree', async () => {
    const folder = join(root(), 'common');
    seedResources(testCollection(folder), {
      a: { source: 'Parent', translations: { fr: 'Parent FR' } },
      'a.b': { source: 'Child' },
    });
    const definition: BundleDefinition = { bundleName: '{locale}', dist: 'out', collections: 'All' };
    const config: LingoTrackerConfig = {
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: { common: { translationsFolder: folder } },
      bundles: { main: definition },
    };
    const prepared = prepareBundleRun({ source: 'saved', bundleKey: 'main', config, locales: ['fr'], cwd: root() });
    const plan = planPreparedBundle(prepared);
    expect(plan.hierarchicalConflicts).toEqual([]);
    expect(plan.warnings.some((warning) => warning.includes('Hierarchical conflict'))).toBe(false);
    const generated = await generatePreparedBundle(prepared);
    expect(generated.findings.byOrigin.generation).toEqual(plan.warnings);
    expect(JSON.parse(readFileSync(join(root(), 'out/fr.json'), 'utf8'))).toEqual({ a: 'Parent FR' });
    const debugPlan = planPreparedBundle(prepared, { debugKeysLocale: '99' });
    expect(debugPlan.hierarchicalConflicts).toEqual(['a']);
    expect(debugPlan.warnings[0]).toContain("Remove the entry or its children from bundle 'main'");
    await expect(generatePreparedBundle(prepared, { debugKeysLocale: '99' })).rejects.toMatchObject({
      bundleKey: 'main',
      conflicts: ['a'],
      message: debugPlan.warnings[0],
    });
    expect(existsSync(join(root(), 'out/99.json'))).toBe(false);
    const withTypes = prepareBundleRun({
      source: 'saved',
      bundleKey: 'main',
      config: {
        ...config,
        bundles: { main: { ...definition, dist: 'typed-out', typeDistFile: 'types/tokens.ts' } },
      },
      locales: ['fr'],
      cwd: root(),
    });
    expect(planPreparedBundle(withTypes).hierarchicalConflicts).toEqual(['a']);
    await expect(generatePreparedBundle(withTypes)).rejects.toBeInstanceOf(BundleHierarchicalConflictError);
    expect(existsSync(join(root(), 'typed-out'))).toBe(false);
    expect(existsSync(join(root(), 'types'))).toBe(false);
  });

  it('refuses colliding token paths and names both source keys in the plan and error', async () => {
    for (const reverse of [false, true]) {
      const folder = join(root(), `tokens-${reverse}`);
      const entries = [
        ['foo-bar.ok', { source: 'First' }],
        ['foo_bar.ok', { source: 'Second' }],
      ] as const;
      seedResources(testCollection(folder), Object.fromEntries(reverse ? [...entries].reverse() : entries));
      const definition: BundleDefinition = {
        bundleName: '{locale}',
        dist: `out-${reverse}`,
        collections: 'All',
        typeDistFile: `types-${reverse}/tokens.ts`,
      };
      const config: LingoTrackerConfig = {
        exportFolder: 'export',
        importFolder: 'import',
        baseLocale: 'en',
        locales: ['en'],
        collections: { common: { translationsFolder: folder } },
        bundles: { main: definition },
      };
      const prepared = prepareBundleRun({ source: 'saved', bundleKey: 'main', config, cwd: root() });
      const plan = planPreparedBundle(prepared);
      expect(plan.hierarchicalConflicts).toEqual(['foo-bar.ok', 'foo_bar.ok']);
      expect(plan.warnings.some((warning) => warning.includes('foo-bar.ok, foo_bar.ok'))).toBe(true);
      const promise = generatePreparedBundle(prepared);
      await expect(promise).rejects.toMatchObject({ conflicts: ['foo-bar.ok', 'foo_bar.ok'] });
      await expect(promise).rejects.toThrow('foo-bar.ok, foo_bar.ok');
      expect(existsSync(join(root(), `out-${reverse}`))).toBe(false);
      expect(existsSync(join(root(), `types-${reverse}`))).toBe(false);
    }
  });
});
