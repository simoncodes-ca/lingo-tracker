import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BundleDefinition } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { generatePreparedBundle } from './generate-bundle';
import { prepareBundleRun } from './prepare-bundle-run';
import { planBundle } from './plan-bundle';

/**
 * A collection whose base locale differs from the global one has no stored value for the global
 * base locale. Its keys must still count in the plan's key set and appear in the debug-keys bundle.
 */
describe('bundles with a collection that overrides the base locale (real fs)', () => {
  const root = useTempDir('bundle-mixed-base-');

  function setup(): { config: LingoTrackerConfig; definition: BundleDefinition } {
    const commonFolder = join(root(), 'common');
    const frenchFolder = join(root(), 'french');
    seedResources(testCollection(commonFolder, { locales: ['en', 'fr'] }), {
      'shared.title': { source: 'Title', translations: { fr: 'Titre' } },
      'common.ok': { source: 'OK', translations: { fr: "D'accord" } },
    });
    seedResources(testCollection(frenchFolder, { baseLocale: 'fr', locales: ['fr', 'en'] }), {
      'shared.title': { source: 'Titre (fr)' },
      'french.bonjour': { source: 'Bonjour' },
    });

    return {
      config: {
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en', 'fr'],
        collections: {
          common: { translationsFolder: commonFolder },
          french: { translationsFolder: frenchFolder, baseLocale: 'fr', locales: ['fr', 'en'] },
        },
      },
      definition: {
        bundleName: '{locale}',
        dist: join(root(), 'dist'),
        collections: 'All',
        typeDistFile: join(root(), 'types', 'tokens.ts'),
      },
    };
  }

  it("counts the collection's keys in the plan's key set, types count and conflicts", () => {
    const { config, definition } = setup();

    const plan = planBundle({ bundleKey: 'main', bundleDefinition: definition, config, cwd: root() });

    expect(plan.files.find((file) => file.kind === 'types')?.keysCount).toBe(3);
    expect(plan.conflictKeys).toEqual(['shared.title']);
    // The en file itself only holds keys that have an en value.
    expect(plan.keysPerLocale).toEqual({ en: 2, fr: 3 });
  });

  it('includes the collection in the debug-keys bundle', async () => {
    const { config, definition } = setup();

    const result = await generatePreparedBundle(
      prepareBundleRun({
        source: 'saved',
        bundleKey: 'main',
        config: { ...config, bundles: { main: { ...definition, typeDistFile: undefined } } },
        locales: ['en'],
      }),
      { debugKeysLocale: '99' },
    );

    expect(result.keysPerLocale['99']).toBe(3);
    expect(JSON.parse(readFileSync(join(root(), 'dist', '99.json'), 'utf8'))).toEqual({
      shared: { title: 'shared.title' },
      common: { ok: 'common.ok' },
      french: { bonjour: 'french.bonjour' },
    });
  });
});
