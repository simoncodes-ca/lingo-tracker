import type { BundleDefinitionDto, CollectionBundleDefinitionDto } from '@simoncodes-ca/data-transfer';
import { describe, expect, it } from 'vitest';
import {
  bundleDraftErrors,
  bundleDryRunRequest,
  toBundleDefinition,
  toBundleDraft,
  toBundleResult,
} from './bundle-draft';

const definition: BundleDefinitionDto = {
  dist: './dist',
  bundleName: 'main.{locale}',
  collections: [{ name: 'main', entriesSelectionRules: 'All' }],
};
const collection: CollectionBundleDefinitionDto = { name: 'main', entriesSelectionRules: 'All' };

describe('Bundle Draft', () => {
  it('seeds the first available collection only when supplied, and preserves All', () => {
    expect(toBundleDraft(undefined, ['main', 'extra']).collections).toEqual([
      { name: 'main', bundledKeyPrefix: '', mergeStrategy: 'merge', allEntries: true, rules: [] },
    ]);
    expect(toBundleDraft({ ...definition, collections: [] }, []).collections).toEqual([]);
    expect(toBundleDraft({ ...definition, collections: 'All' }, ['main']).allCollections).toBe(true);
    expect(toBundleDraft({ ...definition, collections: 'All' }, ['main']).collections).toEqual([]);
  });

  it('normalizes legacy type settings and round-trips explicit rules and options', () => {
    const legacy = {
      ...definition,
      typeDist: ' ./types.ts ',
      tokenCasing: 'camelCase' as const,
      tokenConstantName: ' MAIN_KEYS ',
      transformICUToTransloco: false,
      collections: [
        {
          ...collection,
          bundledKeyPrefix: ' app ',
          mergeStrategy: 'override' as const,
          entriesSelectionRules: [
            { matchingPattern: ' app.* ', matchingTags: ['ui'], matchingTagOperator: 'All' as const },
          ],
        },
      ],
    };
    const draft = { ...toBundleDraft(legacy, []), name: ' main ' };
    expect(toBundleResult(draft)).toEqual({
      name: 'main',
      bundle: {
        ...definition,
        typeDistFile: './types.ts',
        tokenCasing: 'camelCase',
        tokenConstantName: 'MAIN_KEYS',
        transformICUToTransloco: false,
        collections: [
          {
            ...collection,
            bundledKeyPrefix: 'app',
            mergeStrategy: 'override',
            entriesSelectionRules: [{ matchingPattern: 'app.*', matchingTags: ['ui'], matchingTagOperator: 'All' }],
          },
        ],
      },
    });
    expect(legacy.collections[0]?.bundledKeyPrefix).toBe(' app ');
  });

  it('omits hidden type choices, inherited ICU, default merge and empty tags', () => {
    const draft = toBundleDraft(
      {
        ...definition,
        typeDistFile: './types.ts',
        tokenCasing: 'camelCase',
        tokenConstantName: 'MAIN_KEYS',
        collections: [
          {
            ...collection,
            mergeStrategy: 'merge',
            entriesSelectionRules: [{ matchingPattern: '*', matchingTags: [], matchingTagOperator: 'All' }],
          },
        ],
      },
      [],
    );
    draft.typesEnabled = false;
    expect(toBundleDefinition(draft)).toEqual({
      ...definition,
      collections: [{ ...collection, entriesSelectionRules: [{ matchingPattern: '*' }] }],
    });
  });

  it.each(['name', 'dist', 'bundleName'] as const)('gates dry runs on a nonblank %s only', (field) => {
    const draft = { ...toBundleDraft(definition, []), name: 'main' };
    expect(bundleDryRunRequest(draft)).toEqual(toBundleResult(draft));
    expect(bundleDryRunRequest({ ...draft, [field]: ' ' })).toBeUndefined();
    // Other domain errors still reach the dry run for feedback.
    expect(bundleDryRunRequest({ ...draft, collections: [] })).toBeDefined();
  });

  const cases: { label: string; name?: string; bundle?: Partial<BundleDefinitionDto>; error: string }[] = [
    { label: 'blank key', name: ' ', error: 'Bundle name is required.' },
    {
      label: 'invalid key',
      name: 'bad.name',
      error: 'Bundle name may only contain letters, numbers, hyphens and underscores.',
    },
    { label: 'blank pattern', bundle: { bundleName: ' ' }, error: 'bundleName is required.' },
    {
      label: 'missing locale',
      bundle: { bundleName: 'main' },
      error: 'bundleName must include the {locale} placeholder so each locale gets its own file.',
    },
    { label: 'blank folder', bundle: { dist: ' ' }, error: 'dist (output folder) is required.' },
    {
      label: 'empty collections',
      bundle: { collections: [] },
      error: "collections must be 'All' or a non-empty array of collection definitions.",
    },
    {
      label: 'missing collection name',
      bundle: { collections: [{ ...collection, name: ' ' }] },
      error: 'Collection at index 0 is missing a name.',
    },
    {
      label: 'unknown collection',
      bundle: { collections: [{ ...collection, name: 'ghost' }] },
      error: "Collection 'ghost' does not exist in the configuration.",
    },
    {
      label: 'empty rules',
      bundle: { collections: [{ ...collection, entriesSelectionRules: [] }] },
      error: "Collection 'main': entriesSelectionRules must be 'All' or a non-empty array of rules.",
    },
    {
      label: 'blank rule pattern',
      bundle: { collections: [{ ...collection, entriesSelectionRules: [{ matchingPattern: ' ' }] }] },
      error: "Collection 'main': rule at index 0 is missing a matchingPattern.",
    },
    {
      label: 'invalid tag operator',
      bundle: {
        collections: [
          { ...collection, entriesSelectionRules: [{ matchingPattern: '*', matchingTagOperator: 'invalid' as 'Any' }] },
        ],
      },
      error:
        "Collection 'main': rule at index 0 has an invalid matchingTagOperator 'invalid' (expected 'All' or 'Any').",
    },
    {
      label: 'invalid merge strategy',
      bundle: { collections: [{ ...collection, mergeStrategy: 'invalid' as 'merge' }] },
      error: "Collection 'main': mergeStrategy must be 'merge' or 'override', but got: invalid",
    },
    {
      label: 'duplicate without prefix',
      bundle: { collections: [collection, { ...collection, bundledKeyPrefix: ' ' }] },
      error: "Collection 'main' is included more than once without a bundledKeyPrefix.",
    },
    {
      label: 'duplicate with prefix',
      bundle: {
        collections: [
          { ...collection, bundledKeyPrefix: 'app' },
          { ...collection, bundledKeyPrefix: ' app ' },
        ],
      },
      error: "Collection 'main' is included more than once with the same bundledKeyPrefix 'app'.",
    },
    {
      label: 'invalid casing',
      bundle: { tokenCasing: 'invalid' as 'camelCase' },
      error: "tokenCasing must be 'upperCase' or 'camelCase', but got: invalid",
    },
    {
      label: 'invalid type extension',
      bundle: { typeDistFile: './types.js' },
      error: 'typeDistFile must end with a .ts extension, but got: ./types.js',
    },
  ];
  it.each(cases)('validates $label as plain values', ({ name = 'main', bundle, error }) => {
    expect(bundleDraftErrors({ name, bundle: { ...definition, ...bundle } }, ['main'], true)).toEqual([error]);
  });

  it.each(['1BAD', 'class', 'type', 'await', 'undefined'])('validates constant identifier %s', (tokenConstantName) => {
    const errors = bundleDraftErrors({ name: 'main', bundle: { ...definition, tokenConstantName } }, ['main'], true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^tokenConstantName is invalid:/);
  });

  it('checks the key only when editable, retaining all definition errors in order', () => {
    const result = { name: 'bad.name', bundle: { ...definition, dist: '', bundleName: '' } };
    expect(bundleDraftErrors(result, ['main'], false)).toEqual([
      'bundleName is required.',
      'dist (output folder) is required.',
    ]);
    expect(bundleDraftErrors(result, ['main'], true)).toEqual([
      'Bundle name may only contain letters, numbers, hyphens and underscores.',
      'bundleName is required.',
      'dist (output folder) is required.',
    ]);
    expect(bundleDraftErrors({ name: 'main', bundle: definition }, ['main'], true)).toEqual([]);
    expect(bundleDraftErrors({ name: 'main', bundle: { ...definition, collections: 'All' } }, [], true)).toEqual([]);
    expect(
      bundleDraftErrors(
        {
          name: 'main',
          bundle: { ...definition, collections: [collection, { ...collection, bundledKeyPrefix: 'app' }] },
        },
        ['main'],
        true,
      ),
    ).toEqual([]);
  });
});
