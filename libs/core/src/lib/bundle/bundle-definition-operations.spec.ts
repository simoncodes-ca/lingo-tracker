import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BundleDefinition } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { CONFIG_FILENAME } from '../../constants';
import { loadConfig } from '../config/config-file-operations';
import { ConfigChangedError, InvalidBundleDefinitionError, InvalidNameError } from '../errors/lingo-tracker-error';
import {
  addBundleDefinition,
  deleteBundleDefinition,
  removeBundleCollectionReferences,
  renameBundleCollectionReferences,
  updateBundleDefinition,
} from './bundle-definition-operations';

const baseConfig = (overrides: Partial<LingoTrackerConfig> = {}): LingoTrackerConfig => ({
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: {
    common: { translationsFolder: './libs/common/i18n' },
    admin: { translationsFolder: './libs/admin/i18n' },
  },
  ...overrides,
});

const validDefinition = (overrides: Partial<BundleDefinition> = {}): BundleDefinition => ({
  bundleName: 'main.{locale}',
  dist: './dist/i18n',
  collections: 'All',
  ...overrides,
});

describe('bundle-definition-operations', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'lingo-bundle-ops-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  const writeConfig = (config: LingoTrackerConfig): void => {
    writeFileSync(join(cwd, CONFIG_FILENAME), JSON.stringify(config, null, 2), 'utf8');
  };

  const readConfig = (): LingoTrackerConfig => JSON.parse(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8'));
  const project = () => ({ projectRoot: cwd, sourceConfig: loadConfig({ cwd }) });

  describe('addBundleDefinition', () => {
    it('adds a bundle to a config without any bundles', () => {
      writeConfig(baseConfig());

      const result = addBundleDefinition(project(), 'main', validDefinition());

      expect(result.message).toBe('Bundle "main" added successfully');
      expect(readConfig().bundles).toEqual({ main: validDefinition() });
    });

    it('appends after existing bundles and keeps their order', () => {
      writeConfig(baseConfig({ bundles: { first: validDefinition(), second: validDefinition() } }));

      addBundleDefinition(project(), 'third', validDefinition());

      expect(Object.keys(readConfig().bundles ?? {})).toEqual(['first', 'second', 'third']);
    });

    it('strips undefined optional fields recursively before writing', () => {
      writeConfig(baseConfig());

      addBundleDefinition(project(), 'main', {
        bundleName: 'main.{locale}',
        dist: './dist/i18n',
        typeDistFile: undefined,
        tokenCasing: undefined,
        collections: [
          {
            name: 'common',
            bundledKeyPrefix: undefined,
            mergeStrategy: undefined,
            entriesSelectionRules: [
              { matchingPattern: 'apps.*', matchingTags: undefined, matchingTagOperator: undefined },
            ],
          },
        ],
      });

      const raw = readFileSync(join(cwd, CONFIG_FILENAME), 'utf8');
      expect(raw).not.toContain('undefined');
      expect(readConfig().bundles?.['main']).toEqual({
        bundleName: 'main.{locale}',
        dist: './dist/i18n',
        collections: [{ name: 'common', entriesSelectionRules: [{ matchingPattern: 'apps.*' }] }],
      });
    });

    it('trims strings and drops empty optionals before writing', () => {
      writeConfig(baseConfig());

      addBundleDefinition(
        project(),
        'main',
        validDefinition({
          bundleName: ' main.{locale} ',
          dist: ' ./dist/i18n ',
          typeDistFile: '',
          tokenConstantName: ' ',
        }),
      );

      expect(readConfig().bundles?.['main']).toEqual(validDefinition());
    });

    it('reports key and definition problems together', () => {
      writeConfig(baseConfig());

      expect(() => addBundleDefinition(project(), 'my bundle', validDefinition({ dist: '' }))).toThrow(
        'Invalid bundle definition: Bundle name may only contain letters, numbers, hyphens and underscores.; ' +
          'dist (output folder) is required.',
      );
    });

    it('trims the key', () => {
      writeConfig(baseConfig());

      addBundleDefinition(project(), '  main  ', validDefinition());

      expect(Object.keys(readConfig().bundles ?? {})).toEqual(['main']);
    });

    it('rejects an existing key', () => {
      writeConfig(baseConfig({ bundles: { main: validDefinition() } }));

      expect(() => addBundleDefinition(project(), 'main', validDefinition())).toThrow('Bundle "main" already exists');
    });

    it('reports an invalid definition before an existing key (400 before 409)', () => {
      writeConfig(baseConfig({ bundles: { main: validDefinition() } }));

      expect(() => addBundleDefinition(project(), 'main', validDefinition({ dist: '' }))).toThrow(
        InvalidBundleDefinitionError,
      );
    });

    it('treats a key that names an Object.prototype member as an ordinary new bundle', () => {
      writeConfig(baseConfig({ bundles: { main: validDefinition() } }));

      expect(addBundleDefinition(project(), 'constructor', validDefinition()).message).toBe(
        'Bundle "constructor" added successfully',
      );
      const bundles = readConfig().bundles ?? {};
      expect(Object.keys(bundles)).toEqual(['main', 'constructor']);
      expect(bundles['constructor']).toEqual(validDefinition());
    });

    it('keeps the create-time blank key error without writing', () => {
      writeConfig(baseConfig());
      const before = readFileSync(join(cwd, CONFIG_FILENAME), 'utf8');
      for (const key of ['', '   ']) {
        expect(() => addBundleDefinition(project(), key, validDefinition())).toThrow(
          new InvalidBundleDefinitionError(['Bundle name is required.']),
        );
        expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(before);
      }
    });

    it('rejects an invalid key without writing', () => {
      const config = baseConfig();
      writeConfig(config);

      expect(() => addBundleDefinition(project(), 'my bundle', validDefinition())).toThrow(
        'Invalid bundle definition: Bundle name may only contain letters, numbers, hyphens and underscores.',
      );
      expect(readConfig()).toEqual(config);
    });

    it('rejects an invalid definition and reports every error', () => {
      const config = baseConfig();
      writeConfig(config);

      expect(() =>
        addBundleDefinition(
          project(),
          'main',
          validDefinition({ bundleName: 'main', collections: [{ name: 'ghost', entriesSelectionRules: 'All' }] }),
        ),
      ).toThrow(
        'Invalid bundle definition: bundleName must include the {locale} placeholder so each locale gets its own file.; ' +
          "Collection 'ghost' does not exist in the configuration.",
      );
      expect(readConfig()).toEqual(config);
    });
  });

  describe('updateBundleDefinition', () => {
    it('rejects empty and whitespace rename targets without writing', () => {
      writeConfig(baseConfig({ bundles: { main: validDefinition() } }));
      const before = readFileSync(join(cwd, CONFIG_FILENAME), 'utf8');
      for (const newKey of ['', '   ']) {
        expect(() => updateBundleDefinition(project(), 'main', validDefinition(), { newKey })).toThrow(
          InvalidNameError,
        );
        expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(before);
      }
      expect(new InvalidNameError().message).toBe('name must be a non-empty string');
      expect(new InvalidNameError().kind).toBe('invalid');
      expect(new InvalidNameError().code).toBe('INVALID_NAME');
    });

    it('reports a missing bundle before a blank rename target', () => {
      writeConfig(baseConfig());
      expect(() => updateBundleDefinition(project(), 'ghost', validDefinition(), { newKey: '' })).toThrow(
        'Bundle "ghost" not found',
      );
    });

    it('trims a padded rename target', () => {
      writeConfig(baseConfig({ bundles: { main: validDefinition() } }));
      const result = updateBundleDefinition(project(), 'main', validDefinition(), { newKey: ' renamed ' });
      expect(result.message).toBe('Bundle "main" renamed to "renamed" and updated successfully');
      expect(Object.keys(readConfig().bundles ?? {})).toEqual(['renamed']);
    });

    it('treats a padded legacy key renamed to itself as a plain update', () => {
      writeConfig(baseConfig({ bundles: { 'legacy key': validDefinition() } }));
      const result = updateBundleDefinition(project(), 'legacy key', validDefinition({ dist: './x' }), {
        newKey: ' legacy key ',
      });
      expect(result.message).toBe('Bundle "legacy key" updated successfully');
      expect(readConfig().bundles?.['legacy key']?.dist).toBe('./x');
    });

    it('replaces the definition in place and keeps key order', () => {
      writeConfig(
        baseConfig({
          bundles: {
            first: validDefinition(),
            second: validDefinition(),
            third: validDefinition(),
          },
        }),
      );

      const updated = validDefinition({ dist: './out', typeDistFile: './src/tokens.ts' });
      const result = updateBundleDefinition(project(), 'second', updated);

      expect(result.message).toBe('Bundle "second" updated successfully');
      const bundles = readConfig().bundles ?? {};
      expect(Object.keys(bundles)).toEqual(['first', 'second', 'third']);
      expect(bundles['second']).toEqual(updated);
    });

    it('renames the bundle while keeping its position', () => {
      writeConfig(
        baseConfig({ bundles: { first: validDefinition(), second: validDefinition(), third: validDefinition() } }),
      );

      const result = updateBundleDefinition(project(), 'second', validDefinition({ dist: './renamed' }), {
        newKey: 'middle',
      });

      expect(result.message).toBe('Bundle "second" renamed to "middle" and updated successfully');
      const bundles = readConfig().bundles ?? {};
      expect(Object.keys(bundles)).toEqual(['first', 'middle', 'third']);
      expect(bundles['middle']?.dist).toBe('./renamed');
      expect(bundles['second']).toBeUndefined();
    });

    it('treats newKey equal to key as a plain update', () => {
      writeConfig(baseConfig({ bundles: { main: validDefinition() } }));

      const result = updateBundleDefinition(project(), 'main', validDefinition({ dist: './x' }), { newKey: 'main' });

      expect(result.message).toBe('Bundle "main" updated successfully');
      expect(readConfig().bundles?.['main']?.dist).toBe('./x');
    });

    it('throws when the bundle does not exist', () => {
      writeConfig(baseConfig({ bundles: { main: validDefinition() } }));

      expect(() => updateBundleDefinition(project(), 'ghost', validDefinition())).toThrow('Bundle "ghost" not found');
    });

    it('throws when the bundles section is missing entirely', () => {
      writeConfig(baseConfig());

      expect(() => updateBundleDefinition(project(), 'main', validDefinition())).toThrow('Bundle "main" not found');
    });

    it('refuses to rename onto an existing key', () => {
      const config = baseConfig({ bundles: { a: validDefinition(), b: validDefinition() } });
      writeConfig(config);

      expect(() => updateBundleDefinition(project(), 'a', validDefinition(), { newKey: 'b' })).toThrow(
        'Bundle "b" already exists',
      );
      expect(readConfig()).toEqual(config);
    });

    it('reports an invalid definition before a rename collision (400 before 409)', () => {
      writeConfig(baseConfig({ bundles: { a: validDefinition(), b: validDefinition() } }));

      expect(() => updateBundleDefinition(project(), 'a', validDefinition({ dist: '' }), { newKey: 'b' })).toThrow(
        InvalidBundleDefinitionError,
      );
    });

    it('updates a stored key that fails the key rule when no newKey is given', () => {
      writeConfig(baseConfig({ bundles: { 'legacy key': validDefinition() } }));

      expect(updateBundleDefinition(project(), 'legacy key', validDefinition({ dist: './x' })).message).toBe(
        'Bundle "legacy key" updated successfully',
      );
      expect(readConfig().bundles?.['legacy key']?.dist).toBe('./x');
    });

    it('does not find a bundle on Object.prototype', () => {
      writeConfig(baseConfig({ bundles: { main: validDefinition() } }));

      expect(() => updateBundleDefinition(project(), 'constructor', validDefinition())).toThrow(
        'Bundle "constructor" not found',
      );
      expect(() => deleteBundleDefinition(project(), 'constructor')).toThrow('Bundle "constructor" not found');
    });

    it('validates the new key', () => {
      writeConfig(baseConfig({ bundles: { a: validDefinition() } }));

      expect(() => updateBundleDefinition(project(), 'a', validDefinition(), { newKey: 'bad key' })).toThrow(
        'Invalid bundle definition:',
      );
    });

    it('reports a missing bundle before an invalid new key', () => {
      writeConfig(baseConfig({ bundles: { a: validDefinition() } }));

      expect(() => updateBundleDefinition(project(), 'ghost', validDefinition(), { newKey: 'bad key' })).toThrow(
        'Bundle "ghost" not found',
      );
    });

    it('validates the definition without writing on failure', () => {
      const config = baseConfig({ bundles: { main: validDefinition() } });
      writeConfig(config);

      expect(() => updateBundleDefinition(project(), 'main', validDefinition({ typeDistFile: 'tokens.js' }))).toThrow(
        'Invalid bundle definition: typeDistFile must end with a .ts extension, but got: tokens.js',
      );
      expect(readConfig()).toEqual(config);
    });
  });

  describe('deleteBundleDefinition', () => {
    it('removes the bundle and keeps the others in order', () => {
      writeConfig(baseConfig({ bundles: { a: validDefinition(), b: validDefinition(), c: validDefinition() } }));

      const result = deleteBundleDefinition(project(), 'b');

      expect(result.message).toBe('Bundle "b" deleted successfully');
      expect(Object.keys(readConfig().bundles ?? {})).toEqual(['a', 'c']);
    });

    it('drops the bundles section when the last bundle is removed', () => {
      writeConfig(baseConfig({ bundles: { only: validDefinition() } }));

      deleteBundleDefinition(project(), 'only');

      expect(readConfig()).not.toHaveProperty('bundles');
    });

    it('throws when the bundle does not exist', () => {
      const config = baseConfig({ bundles: { a: validDefinition() } });
      writeConfig(config);

      expect(() => deleteBundleDefinition(project(), 'ghost')).toThrow('Bundle "ghost" not found');
      expect(readConfig()).toEqual(config);
    });
  });

  it('refuses stale add, update, and delete snapshots', () => {
    writeConfig(baseConfig({ bundles: { main: validDefinition() } }));
    const opened = project();
    const other = `${readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')}\n`;
    writeFileSync(join(cwd, CONFIG_FILENAME), other);
    expect(() => addBundleDefinition(opened, 'new', validDefinition())).toThrow(ConfigChangedError);
    expect(() => updateBundleDefinition(opened, 'main', validDefinition())).toThrow(ConfigChangedError);
    expect(() => deleteBundleDefinition(opened, 'main')).toThrow(ConfigChangedError);
    expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(other);
  });
});

describe('bundle collection reference planning', () => {
  it.each(['rename', 'remove'] as const)('rebuilds a null bundle map as an empty object on %s', (operation) => {
    const config = baseConfig({ bundles: null as unknown as LingoTrackerConfig['bundles'] });
    if (operation === 'rename') renameBundleCollectionReferences(config, 'common', 'renamed');
    else removeBundleCollectionReferences(config, 'common');
    expect(config).toHaveProperty('bundles', {});
    expect(JSON.parse(JSON.stringify(config))).toHaveProperty('bundles', {});
  });

  it.each(['rename', 'remove'] as const)('preserves absent and empty maps on %s', (operation) => {
    for (const config of [baseConfig(), baseConfig({ bundles: {} })]) {
      const before = JSON.stringify(config);
      if (operation === 'rename') renameBundleCollectionReferences(config, 'common', 'renamed');
      else removeBundleCollectionReferences(config, 'common');
      expect(JSON.stringify(config)).toBe(before);
    }
  });

  it.each(['rename', 'remove'] as const)(
    'preserves null bundles, empty lists and source objects on %s',
    (operation) => {
      const source = JSON.parse(
        JSON.stringify({
          ...baseConfig(),
          bundles: {
            nullBundle: null,
            empty: validDefinition({ collections: [] }),
            malformed: { ...validDefinition(), collections: 42 },
            all: validDefinition(),
            constructor: validDefinition({
              collections: [
                null,
                { name: 'common', entriesSelectionRules: 'All', bundledKeyPrefix: 'a' },
                { name: 'common', entriesSelectionRules: 'All', bundledKeyPrefix: 'b' },
              ] as unknown as BundleDefinition['collections'],
            }),
          },
        }),
      ) as LingoTrackerConfig;
      const before = JSON.stringify(source);
      const config = { ...source };
      if (operation === 'rename') renameBundleCollectionReferences(config, 'common', 'renamed');
      else removeBundleCollectionReferences(config, 'common');
      expect(JSON.stringify(source)).toBe(before);
      expect(Object.keys(config.bundles ?? {})).toEqual(['nullBundle', 'empty', 'malformed', 'all', 'constructor']);
      expect(config.bundles?.['nullBundle']).toBeNull();
      expect(config.bundles?.['empty']?.collections).toEqual([]);
      expect(config.bundles?.['malformed']?.collections).toBe(42);
      expect(config.bundles?.['all']?.collections).toBe('All');
      expect(config.bundles?.['constructor']?.collections).toEqual(
        operation === 'rename'
          ? [
              null,
              { name: 'renamed', entriesSelectionRules: 'All', bundledKeyPrefix: 'a' },
              { name: 'renamed', entriesSelectionRules: 'All', bundledKeyPrefix: 'b' },
            ]
          : [null],
      );
    },
  );

  it.each(['rename', 'remove'] as const)('leaves the original map intact when %s is refused', (operation) => {
    const config = baseConfig({
      bundles: {
        safe: validDefinition({
          collections: [
            { name: 'common', entriesSelectionRules: 'All' },
            { name: 'admin', entriesSelectionRules: 'All' },
          ],
        }),
        blocked: validDefinition({
          collections: [{ name: operation === 'rename' ? 'renamed' : 'common', entriesSelectionRules: 'All' }],
        }),
      },
    });
    const bundles = config.bundles;
    const before = JSON.stringify(config);
    expect(() => {
      if (operation === 'rename') renameBundleCollectionReferences(config, 'common', 'renamed');
      else removeBundleCollectionReferences(config, 'common');
    }).toThrow();
    expect(config.bundles).toBe(bundles);
    expect(JSON.stringify(config)).toBe(before);
  });

  it('keeps the map untouched when the collection name is unchanged', () => {
    const config = baseConfig({
      bundles: { main: validDefinition({ collections: [{ name: 'common', entriesSelectionRules: 'All' }] }) },
    });
    const bundles = config.bundles;
    renameBundleCollectionReferences(config, 'common', 'common');
    expect(config.bundles).toBe(bundles);
  });
});
