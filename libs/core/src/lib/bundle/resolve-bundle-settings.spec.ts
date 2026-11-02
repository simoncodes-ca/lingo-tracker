import type { BundleDefinition } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { resolveBundleSettings } from './resolve-bundle-settings';

const base: LingoTrackerConfig = {
  exportFolder: 'export',
  importFolder: 'import',
  baseLocale: 'en',
  locales: ['en'],
  collections: {},
};
const definition: BundleDefinition = { bundleName: '{locale}', dist: 'dist', collections: 'All' };

describe('resolveBundleSettings', () => {
  it.each([
    ['defaults', {}, {}, {}, 'upperCase', 'MAIN_TOKENS', true],
    ['global', { tokenCasing: 'camelCase', transformICUToTransloco: false }, {}, {}, 'camelCase', 'MAIN_TOKENS', false],
    [
      'definition',
      { tokenCasing: 'upperCase', transformICUToTransloco: true },
      { tokenCasing: 'camelCase', transformICUToTransloco: false },
      {},
      'camelCase',
      'MAIN_TOKENS',
      false,
    ],
    [
      'overrides',
      { tokenCasing: 'upperCase', transformICUToTransloco: true },
      { tokenCasing: 'upperCase', tokenConstantName: 'DEF_TOKENS', transformICUToTransloco: true },
      { tokenCasing: 'camelCase', tokenConstantName: 'CLI_TOKENS', transformICUToTransloco: false },
      'camelCase',
      'CLI_TOKENS',
      false,
    ],
  ] as const)(
    '%s wins in precedence',
    (_label, global, bundle, overrides, tokenCasing, tokenConstantName, transformICUToTransloco) => {
      expect(resolveBundleSettings('main', { ...base, ...global }, { ...definition, ...bundle }, overrides)).toEqual({
        runtime: 'transloco-messageformat',
        tokenCasing,
        tokenConstantName,
        transformICUToTransloco,
      });
    },
  );
});

it('resolves the global runtime without a bundle or command override', () => {
  expect(resolveBundleSettings('main', { runtime: 'transloco' }, definition).runtime).toBe('transloco');
});
