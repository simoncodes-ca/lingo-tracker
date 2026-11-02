import { describe, expect, it } from 'vitest';
import {
  type BundleDefinition,
  bundleKeyToConstantName,
  bundleOutputFile,
  checkBundleDefinition,
  findBundleDefinition,
  hasBundleCollections,
  hasBundleRules,
  hasLocalePlaceholder,
  hasTypeDistConfigured,
  isTypeScriptFile,
  normalizeBundleDefinition,
  validateBundleDefinition,
  validateBundleKey,
} from './bundle-definition';

const collectionNames = ['common', 'admin'];

type EntryRules = Exclude<BundleDefinition['collections'], 'All'>[number]['entriesSelectionRules'];

const validDefinition = (overrides: Partial<BundleDefinition> = {}): BundleDefinition => ({
  bundleName: 'main.{locale}',
  dist: './dist/i18n',
  collections: 'All',
  ...overrides,
});

describe('bundle selection requirements', () => {
  it('accepts All or a non-empty collection list', () => {
    expect(hasBundleCollections('All')).toBe(true);
    expect(hasBundleCollections([{ name: 'common', entriesSelectionRules: 'All' }])).toBe(true);
    expect(hasBundleCollections([])).toBe(false);
    expect(hasBundleCollections('other')).toBe(false);
  });

  it('accepts All or a non-empty rule list', () => {
    expect(hasBundleRules('All')).toBe(true);
    expect(hasBundleRules([{ matchingPattern: '*' }])).toBe(true);
    expect(hasBundleRules([])).toBe(false);
    expect(hasBundleRules('other')).toBe(false);
  });
});

describe('validateBundleKey', () => {
  it('accepts letters, numbers, hyphens and underscores', () => {
    expect(validateBundleKey('main')).toEqual([]);
    expect(validateBundleKey('core-ui_2')).toEqual([]);
  });

  it('rejects an empty or whitespace-only key', () => {
    expect(validateBundleKey('')).toEqual(['Bundle name is required.']);
    expect(validateBundleKey('   ')).toEqual(['Bundle name is required.']);
  });

  it('rejects keys with other characters', () => {
    expect(validateBundleKey('my bundle')).toEqual([
      'Bundle name may only contain letters, numbers, hyphens and underscores.',
    ]);
    expect(validateBundleKey('a.b')).toHaveLength(1);
    expect(validateBundleKey('a/b')).toHaveLength(1);
  });
});

describe('validateBundleDefinition', () => {
  it('returns no errors for a valid "All" definition', () => {
    expect(validateBundleDefinition(validDefinition(), collectionNames)).toEqual([]);
  });

  it('returns no errors for a valid explicit collection list', () => {
    const definition = validDefinition({
      collections: [
        { name: 'common', entriesSelectionRules: 'All' },
        {
          name: 'admin',
          bundledKeyPrefix: 'admin',
          mergeStrategy: 'override',
          entriesSelectionRules: [{ matchingPattern: 'apps.*', matchingTags: ['ui'], matchingTagOperator: 'Any' }],
        },
      ],
      typeDistFile: './src/tokens.ts',
      tokenConstantName: 'MY_TOKENS',
    });

    expect(validateBundleDefinition(definition, collectionNames)).toEqual([]);
  });

  it('reports a missing bundleName', () => {
    const errors = validateBundleDefinition(validDefinition({ bundleName: '' }), collectionNames);
    expect(errors).toContain('bundleName is required.');
  });

  it('reports a bundleName without the {locale} placeholder', () => {
    const errors = validateBundleDefinition(validDefinition({ bundleName: 'main' }), collectionNames);
    expect(errors).toContain('bundleName must include the {locale} placeholder so each locale gets its own file.');
  });

  it('reports a missing dist', () => {
    const errors = validateBundleDefinition(validDefinition({ dist: '  ' }), collectionNames);
    expect(errors).toContain('dist (output folder) is required.');
  });

  it('reports collections that are neither "All" nor a non-empty array', () => {
    expect(validateBundleDefinition(validDefinition({ collections: [] }), collectionNames)).toContain(
      "collections must be 'All' or a non-empty array of collection definitions.",
    );
    expect(
      validateBundleDefinition(validDefinition({ collections: 'everything' as unknown as 'All' }), collectionNames),
    ).toContain("collections must be 'All' or a non-empty array of collection definitions.");
  });

  it('reports a typeDistFile that does not end in .ts', () => {
    const errors = validateBundleDefinition(validDefinition({ typeDistFile: './src/tokens.js' }), collectionNames);
    expect(errors).toEqual(['typeDistFile must end with a .ts extension, but got: ./src/tokens.js']);
  });

  it('reports an invalid tokenConstantName', () => {
    const errors = validateBundleDefinition(validDefinition({ tokenConstantName: '1bad' }), collectionNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^tokenConstantName is invalid: /);
    expect(errors[0]).toContain('must start with a letter');
  });

  it('reports a reserved word used as tokenConstantName', () => {
    const errors = validateBundleDefinition(validDefinition({ tokenConstantName: 'class' }), collectionNames);
    expect(errors[0]).toContain('reserved word');
  });

  it('reports a collection that does not exist in the configuration', () => {
    const errors = validateBundleDefinition(
      validDefinition({ collections: [{ name: 'ghost', entriesSelectionRules: 'All' }] }),
      collectionNames,
    );
    expect(errors).toEqual(["Collection 'ghost' does not exist in the configuration."]);
  });

  it('reports a collection without a name', () => {
    const errors = validateBundleDefinition(
      validDefinition({ collections: [{ name: '', entriesSelectionRules: 'All' }] }),
      collectionNames,
    );
    expect(errors).toEqual(['Collection at index 0 is missing a name.']);
  });

  it('reports an empty entriesSelectionRules array', () => {
    const errors = validateBundleDefinition(
      validDefinition({ collections: [{ name: 'common', entriesSelectionRules: [] }] }),
      collectionNames,
    );
    expect(errors).toEqual(["Collection 'common': entriesSelectionRules must be 'All' or a non-empty array of rules."]);
  });

  it('reports a rule without a matchingPattern', () => {
    const errors = validateBundleDefinition(
      validDefinition({
        collections: [{ name: 'common', entriesSelectionRules: [{ matchingPattern: '' }] }],
      }),
      collectionNames,
    );
    expect(errors).toEqual(["Collection 'common': rule at index 0 is missing a matchingPattern."]);
  });

  it('reports an invalid matchingTagOperator', () => {
    const errors = validateBundleDefinition(
      validDefinition({
        collections: [
          {
            name: 'common',
            entriesSelectionRules: [{ matchingPattern: '*', matchingTagOperator: 'Some' as unknown as 'All' }],
          },
        ],
      }),
      collectionNames,
    );
    expect(errors).toEqual([
      "Collection 'common': rule at index 0 has an invalid matchingTagOperator 'Some' (expected 'All' or 'Any').",
    ]);
  });

  it('reports an invalid mergeStrategy', () => {
    const errors = validateBundleDefinition(
      validDefinition({
        collections: [{ name: 'common', entriesSelectionRules: 'All', mergeStrategy: 'replace' as unknown as 'merge' }],
      }),
      collectionNames,
    );
    expect(errors).toEqual(["Collection 'common': mergeStrategy must be 'merge' or 'override', but got: replace"]);
  });

  it('reports the same collection included twice with the same prefix', () => {
    const errors = validateBundleDefinition(
      validDefinition({
        collections: [
          { name: 'common', entriesSelectionRules: 'All', bundledKeyPrefix: 'shared' },
          { name: 'common', entriesSelectionRules: [{ matchingPattern: 'x.*' }], bundledKeyPrefix: 'shared' },
        ],
      }),
      collectionNames,
    );
    expect(errors).toEqual(["Collection 'common' is included more than once with the same bundledKeyPrefix 'shared'."]);
  });

  it('reports the same collection included twice without a prefix', () => {
    const errors = validateBundleDefinition(
      validDefinition({
        collections: [
          { name: 'common', entriesSelectionRules: 'All' },
          { name: 'common', entriesSelectionRules: 'All' },
        ],
      }),
      collectionNames,
    );
    expect(errors).toEqual(["Collection 'common' is included more than once without a bundledKeyPrefix."]);
  });

  it('allows the same collection twice with different prefixes', () => {
    const errors = validateBundleDefinition(
      validDefinition({
        collections: [
          { name: 'common', entriesSelectionRules: 'All', bundledKeyPrefix: 'a' },
          { name: 'common', entriesSelectionRules: 'All', bundledKeyPrefix: 'b' },
        ],
      }),
      collectionNames,
    );
    expect(errors).toEqual([]);
  });

  it('accumulates every applicable message', () => {
    const errors = validateBundleDefinition(
      {
        bundleName: 'main',
        dist: '',
        collections: [{ name: 'ghost', entriesSelectionRules: [] }],
        typeDistFile: 'tokens.json',
        tokenConstantName: 'my-tokens',
      },
      collectionNames,
    );

    expect(errors).toHaveLength(6);
  });
});

describe('hasLocalePlaceholder / isTypeScriptFile', () => {
  it('detects the {locale} placeholder', () => {
    expect(hasLocalePlaceholder('main.{locale}')).toBe(true);
    expect(hasLocalePlaceholder('main.locale')).toBe(false);
  });

  it('accepts only .ts paths', () => {
    expect(isTypeScriptFile('./src/tokens.ts')).toBe(true);
    expect(isTypeScriptFile('./src/tokens.js')).toBe(false);
  });
});

describe('hasTypeDistConfigured', () => {
  it('is true for typeDistFile and for the deprecated typeDist', () => {
    expect(hasTypeDistConfigured(validDefinition({ typeDistFile: './src/tokens.ts' }))).toBe(true);
    expect(hasTypeDistConfigured({ ...validDefinition(), typeDist: './src' } as BundleDefinition)).toBe(true);
    expect(hasTypeDistConfigured(validDefinition())).toBe(false);
  });
});

describe('bundleOutputFile', () => {
  it('joins dist and the locale-substituted bundle name', () => {
    expect(bundleOutputFile({ dist: 'dist/i18n', bundleName: 'main.{locale}' }, 'fr-ca')).toBe(
      'dist/i18n/main.fr-ca.json',
    );
    expect(bundleOutputFile({ dist: 'dist', bundleName: '{locale}/main' }, 'en')).toBe('dist/en/main.json');
  });

  it('drops a leading ./, duplicate and trailing slashes', () => {
    expect(bundleOutputFile({ dist: './dist//i18n/', bundleName: '{locale}' }, 'en')).toBe('dist/i18n/en.json');
    expect(bundleOutputFile({ dist: '.', bundleName: '{locale}' }, 'en')).toBe('en.json');
  });

  it('keeps absolute and parent-relative folders', () => {
    expect(bundleOutputFile({ dist: '/var/www/i18n', bundleName: '{locale}' }, 'en')).toBe('/var/www/i18n/en.json');
    expect(bundleOutputFile({ dist: '../shared/./i18n', bundleName: '{locale}' }, 'en')).toBe('../shared/i18n/en.json');
    expect(bundleOutputFile({ dist: 'dist/tmp/..', bundleName: '{locale}' }, 'en')).toBe('dist/en.json');
  });

  it('handles an empty dist and a bundleName without the placeholder', () => {
    expect(bundleOutputFile({ dist: '', bundleName: 'main.{locale}' }, 'en')).toBe('main.en.json');
    expect(bundleOutputFile({ dist: 'dist', bundleName: 'main' }, 'en')).toBe('dist/main.json');
    expect(bundleOutputFile({ dist: '/abs/dist/', bundleName: 'main' }, 'en')).toBe('/abs/dist/main.json');
  });

  it('shows the pattern itself when given the placeholder as the locale', () => {
    expect(bundleOutputFile({ dist: './dist', bundleName: 'main.{locale}' }, '{locale}')).toBe(
      'dist/main.{locale}.json',
    );
  });
});

describe('normalizeBundleDefinition', () => {
  it('trims strings and drops empty optionals and empty tags', () => {
    const definition = normalizeBundleDefinition({
      bundleName: '  main.{locale} ',
      dist: ' ./dist ',
      collections: [
        {
          name: ' app ',
          bundledKeyPrefix: '   ',
          entriesSelectionRules: [{ matchingPattern: ' apps.* ', matchingTags: [' ui ', ''] }],
        },
      ],
      typeDistFile: '',
      tokenConstantName: '  ',
    });

    expect(definition).toEqual({
      bundleName: 'main.{locale}',
      dist: './dist',
      collections: [{ name: 'app', entriesSelectionRules: [{ matchingPattern: 'apps.*', matchingTags: ['ui'] }] }],
    });
    expect('typeDistFile' in definition).toBe(false);
    expect('tokenConstantName' in definition).toBe(false);
  });

  it('removes undefined optionals recursively', () => {
    const definition = normalizeBundleDefinition({
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

    expect(JSON.stringify(definition)).toBe(
      JSON.stringify({
        bundleName: 'main.{locale}',
        dist: './dist/i18n',
        collections: [{ name: 'common', entriesSelectionRules: [{ matchingPattern: 'apps.*' }] }],
      }),
    );
  });

  it("keeps explicit false, token casing and the 'All' literals", () => {
    const definition = normalizeBundleDefinition({
      bundleName: '{locale}',
      dist: './dist',
      collections: [{ name: 'app', entriesSelectionRules: 'All', mergeStrategy: 'override' }],
      transformICUToTransloco: false,
      tokenCasing: 'upperCase',
    });

    expect(definition.transformICUToTransloco).toBe(false);
    expect(definition.tokenCasing).toBe('upperCase');
    expect(definition.collections).toEqual([{ name: 'app', entriesSelectionRules: 'All', mergeStrategy: 'override' }]);
    expect(normalizeBundleDefinition(validDefinition()).collections).toBe('All');
  });

  it('does not alias arrays from the input and leaves unknown fields behind', () => {
    const tags = ['ui'];
    const input = {
      ...validDefinition({
        collections: [{ name: 'app', entriesSelectionRules: [{ matchingPattern: '*', matchingTags: tags }] }],
      }),
      extra: true,
    };

    const definition = normalizeBundleDefinition(input);
    const [collection] = definition.collections as Exclude<BundleDefinition['collections'], 'All'>;
    const [rule] = collection.entriesSelectionRules as Exclude<typeof collection.entriesSelectionRules, 'All'>;

    expect(rule.matchingTags).toEqual(['ui']);
    expect(rule.matchingTags).not.toBe(tags);
    expect('extra' in definition).toBe(false);
  });

  it('tolerates loosely-typed input so validation can report it', () => {
    const definition = normalizeBundleDefinition({ collections: 'everything' } as unknown as BundleDefinition);

    expect(definition).toEqual({ bundleName: '', dist: '', collections: 'everything' });
    expect(validateBundleDefinition(definition, collectionNames)).toEqual([
      'bundleName is required.',
      'dist (output folder) is required.',
      "collections must be 'All' or a non-empty array of collection definitions.",
    ]);
  });

  it('keeps a full definition unchanged', () => {
    const full: BundleDefinition = {
      bundleName: 'main.{locale}',
      dist: './dist/i18n',
      collections: [
        {
          name: 'app',
          bundledKeyPrefix: 'app',
          entriesSelectionRules: [{ matchingPattern: 'apps.*', matchingTags: ['ui'], matchingTagOperator: 'All' }],
          mergeStrategy: 'override',
        },
      ],
      typeDistFile: './dist/i18n-types/main.ts',
      tokenCasing: 'camelCase',
      tokenConstantName: 'MAIN_KEYS',
      transformICUToTransloco: false,
    };

    expect(normalizeBundleDefinition(full)).toEqual(full);
  });

  it('drops an empty matchingTags list', () => {
    const definition = normalizeBundleDefinition(
      validDefinition({
        collections: [{ name: 'common', entriesSelectionRules: [{ matchingPattern: '*', matchingTags: [] }] }],
      }),
    );

    expect(definition.collections).toEqual([{ name: 'common', entriesSelectionRules: [{ matchingPattern: '*' }] }]);
  });

  it('leaves __proto__ and constructor fields behind without touching the prototype', () => {
    const input = JSON.parse(
      '{"bundleName":"main.{locale}","dist":"dist","collections":"All","__proto__":{"polluted":true},"constructor":"x"}',
    ) as BundleDefinition;

    const definition = normalizeBundleDefinition(input);

    expect(Object.keys(definition)).toEqual(['bundleName', 'dist', 'collections']);
    expect(Object.getPrototypeOf(definition)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('migrates a legacy typeDist to typeDistFile unless typeDistFile is set', () => {
    const legacy = { ...validDefinition(), typeDist: ' ./src/tokens.ts ' } as BundleDefinition;

    const migrated = normalizeBundleDefinition(legacy);
    expect(migrated.typeDistFile).toBe('./src/tokens.ts');
    expect('typeDist' in migrated).toBe(false);

    expect(normalizeBundleDefinition({ ...legacy, typeDistFile: './src/new.ts' }).typeDistFile).toBe('./src/new.ts');
    expect(normalizeBundleDefinition({ ...validDefinition(), typeDist: '  ' } as BundleDefinition)).not.toHaveProperty(
      'typeDistFile',
    );
  });

  it('turns a non-object input into an empty definition', () => {
    for (const input of [null, undefined, 'main', 42, []]) {
      const definition = normalizeBundleDefinition(input as unknown as BundleDefinition);

      expect(definition.bundleName).toBe('');
      expect(definition.dist).toBe('');
      expect(validateBundleDefinition(definition, collectionNames)).toEqual([
        'bundleName is required.',
        'dist (output folder) is required.',
        "collections must be 'All' or a non-empty array of collection definitions.",
      ]);
    }
  });

  it('turns a non-object collection into an empty one, reported with its index', () => {
    const definition = normalizeBundleDefinition(
      validDefinition({ collections: [null, 'common'] as unknown as BundleDefinition['collections'] }),
    );

    expect(definition.collections).toEqual([{ name: '' }, { name: '' }]);
    expect(validateBundleDefinition(definition, collectionNames)).toEqual([
      'Collection at index 0 is missing a name.',
      "Collection at index 0: entriesSelectionRules must be 'All' or a non-empty array of rules.",
      'Collection at index 1 is missing a name.',
      "Collection at index 1: entriesSelectionRules must be 'All' or a non-empty array of rules.",
    ]);
  });

  it('turns a non-object rule into an empty one, reported with its index', () => {
    const definition = normalizeBundleDefinition(
      validDefinition({
        collections: [{ name: 'common', entriesSelectionRules: [null] as unknown as EntryRules }],
      }),
    );

    expect(definition.collections).toEqual([{ name: 'common', entriesSelectionRules: [{ matchingPattern: '' }] }]);
    expect(validateBundleDefinition(definition, collectionNames)).toEqual([
      "Collection 'common': rule at index 0 is missing a matchingPattern.",
    ]);
  });
});

describe('validateBundleDefinition — tokenCasing', () => {
  it('accepts the two casings and rejects anything else', () => {
    expect(validateBundleDefinition(validDefinition({ tokenCasing: 'upperCase' }), collectionNames)).toEqual([]);
    expect(validateBundleDefinition(validDefinition({ tokenCasing: 'camelCase' }), collectionNames)).toEqual([]);
    expect(
      validateBundleDefinition(validDefinition({ tokenCasing: 'bogus' as unknown as 'upperCase' }), collectionNames),
    ).toEqual(["tokenCasing must be 'upperCase' or 'camelCase', but got: bogus"]);
    expect(
      validateBundleDefinition(
        normalizeBundleDefinition(validDefinition({ tokenCasing: null as unknown as 'upperCase' })),
        collectionNames,
      ),
    ).toEqual(["tokenCasing must be 'upperCase' or 'camelCase', but got: null"]);
  });
});

describe('checkBundleDefinition', () => {
  it('returns the normalized definition and every problem, key errors first', () => {
    const result = checkBundleDefinition(
      validDefinition({ dist: ' ', bundleName: ' main.{locale} ' }),
      collectionNames,
      'my bundle',
    );

    expect(result.definition).toEqual({ bundleName: 'main.{locale}', dist: '', collections: 'All' });
    expect(result.errors).toEqual([
      'Bundle name may only contain letters, numbers, hyphens and underscores.',
      'dist (output folder) is required.',
    ]);
  });

  it('skips the key rule when no key is given', () => {
    expect(checkBundleDefinition(validDefinition(), collectionNames).errors).toEqual([]);
  });
});

describe('findBundleDefinition', () => {
  it('finds own bundles only', () => {
    const bundles = { main: validDefinition() };

    expect(findBundleDefinition(bundles, 'main')).toBe(bundles.main);
    expect(findBundleDefinition(bundles, 'constructor')).toBeUndefined();
    expect(findBundleDefinition(bundles, '__proto__')).toBeUndefined();
    expect(findBundleDefinition(bundles, 'toString')).toBeUndefined();
    expect(findBundleDefinition(undefined, 'main')).toBeUndefined();
  });
});

describe('bundleKeyToConstantName', () => {
  it('should convert simple bundle key to constant name', () => {
    expect(bundleKeyToConstantName('common')).toBe('COMMON_TOKENS');
  });

  it('should convert hyphenated bundle key to constant name', () => {
    expect(bundleKeyToConstantName('core-ui')).toBe('CORE_UI_TOKENS');
  });

  it('should handle mixed case bundle keys', () => {
    expect(bundleKeyToConstantName('adminPanel')).toBe('ADMINPANEL_TOKENS');
  });
});
