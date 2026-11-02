import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BundleDefinition } from '@simoncodes-ca/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTempDir } from '../../../testing/temp-dir.spec-helpers';
import { BundleHierarchicalConflictError } from '../../errors/internal';
import { generateBundleTypes, legacyTypeDistWarning } from './generate-types';

describe('generateBundleTypes (real fs)', () => {
  const root = useTempDir('bundle-types-');

  afterEach(() => vi.restoreAllMocks());

  function definition(overrides: Partial<BundleDefinition> = {}): BundleDefinition {
    return {
      bundleName: 'main',
      dist: 'dist/i18n',
      collections: 'All',
      typeDistFile: 'src/generated/main-tokens.ts',
      ...overrides,
    };
  }

  function generate(
    overrides: Partial<Parameters<typeof generateBundleTypes>[0]> = {},
  ): ReturnType<typeof generateBundleTypes> {
    return generateBundleTypes({
      bundleKey: 'main',
      definition: definition(),
      keys: ['buttons.ok'],
      tokenCasing: 'upperCase',
      cwd: root(),
      ...overrides,
    });
  }

  it('rejects hierarchical conflicts with a typed error before creating the output directory', () => {
    for (const keys of [
      ['a', 'a.b'],
      ['a.b', 'a'],
    ]) {
      expect(() => generate({ keys })).toThrow(BundleHierarchicalConflictError);
      expect(existsSync(join(root(), 'src'))).toBe(false);
    }
  });

  it('skips generation when typeDistFile is not configured', () => {
    const result = generate({ definition: definition({ typeDistFile: undefined }) });

    expect(result).toMatchObject({
      status: 'not-configured',
    });
    expect(existsSync(join(root(), 'src/generated/main-tokens.ts'))).toBe(false);
  });

  it('generates a type file with its header, constant, sorted keys, and type alias', () => {
    const result = generate({ keys: ['buttons.ok', 'buttons.cancel'] });
    const output = readFileSync(join(root(), 'src/generated/main-tokens.ts'), 'utf8');

    expect(result).toMatchObject({ status: 'written', keysCount: 2 });
    expect(output).toContain('Auto-generated translation keys for bundle: main');
    expect(output).toContain('export const MAIN_TOKENS');
    expect(output).toContain("CANCEL: 'buttons.cancel'");
    expect(output).toContain("OK: 'buttons.ok'");
    expect(output).toContain('export type MainTokens = typeof MAIN_TOKENS');
  });

  it('sorts keys supplied in an arbitrary order', () => {
    generate({ keys: ['z.last', 'a.first', 'm.middle'] });
    const output = readFileSync(join(root(), 'src/generated/main-tokens.ts'), 'utf8');

    expect(output.indexOf('A: {')).toBeLessThan(output.indexOf('M: {'));
    expect(output.indexOf('M: {')).toBeLessThan(output.indexOf('Z: {'));
  });

  it('skips an empty bundle without writing a file or logging', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = generate({ keys: [] });

    expect(result).toEqual({ status: 'skipped', reason: 'empty-bundle' });
    expect(result.status).toBe('skipped');
    expect(warn).not.toHaveBeenCalled();
    expect(existsSync(join(root(), 'src/generated/main-tokens.ts'))).toBe(false);
  });

  it('creates the output directory when it does not exist', () => {
    const result = generate({ definition: definition({ typeDistFile: 'new/deep/tokens.ts' }) });

    expect(result.status).toBe('written');
    expect(existsSync(join(root(), 'new/deep/tokens.ts'))).toBe(true);
  });

  it('generates camelCase property names', () => {
    generate({ keys: ['file-upload'], tokenCasing: 'camelCase' });
    const output = readFileSync(join(root(), 'src/generated/main-tokens.ts'), 'utf8');

    expect(output).toContain("fileUpload: 'file-upload'");
    expect(output).not.toContain('FILE_UPLOAD');
  });

  it('preserves non-hyphenated mixed-case keys in camelCase mode', () => {
    generate({ keys: ['agGrid'], tokenCasing: 'camelCase' });
    const output = readFileSync(join(root(), 'src/generated/main-tokens.ts'), 'utf8');

    expect(output).toContain("agGrid: 'agGrid'");
    expect(output).not.toContain('aggrid');
    expect(output).not.toContain('AGGRID');
  });

  it('returns an error when typeDistFile points to an existing directory', () => {
    mkdirSync(join(root(), 'types.ts'));
    const result = generate({ definition: definition({ typeDistFile: 'types.ts' }) });

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' ? result.reason : undefined).toMatch(/typeDistFile must be a file path/);
    expect(result.status === 'failed' ? result.reason : undefined).toContain(join(root(), 'types.ts'));
  });

  it('returns an error containing the configured value when typeDistFile is not a .ts file', () => {
    const result = generate({ definition: definition({ typeDistFile: 'src/generated/tokens.js' }) });

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' ? result.reason : undefined).toMatch(
      /typeDistFile must end with a \.ts extension/,
    );
    expect(result.status === 'failed' ? result.reason : undefined).toContain('src/generated/tokens.js');
    expect(existsSync(join(root(), 'src/generated/tokens.js'))).toBe(false);
  });

  it('resolves relative typeDistFile against cwd and returns its project-relative path', () => {
    const result = generate({ definition: definition({ typeDistFile: 'types/tokens.ts' }) });

    expect(result.status === 'written' ? result.path : undefined).toBe('types/tokens.ts');
    expect(existsSync(join(root(), 'types/tokens.ts'))).toBe(true);
  });

  it('uses the tokenConstantName parameter', () => {
    generate({ tokenConstantName: 'MY_CUSTOM_TOKENS' });
    expect(readFileSync(join(root(), 'src/generated/main-tokens.ts'), 'utf8')).toContain(
      'export const MY_CUSTOM_TOKENS',
    );
  });

  it('derives a PascalCase type name from a SCREAMING_SNAKE constant name', () => {
    generate({ tokenConstantName: 'MY_CUSTOM_TOKENS' });
    expect(readFileSync(join(root(), 'src/generated/main-tokens.ts'), 'utf8')).toContain(
      'export type MyCustomTokens = typeof MY_CUSTOM_TOKENS',
    );
  });

  it('derives a PascalCase type name from a camelCase constant name', () => {
    generate({ tokenConstantName: 'myCustomTokens' });
    const output = readFileSync(join(root(), 'src/generated/main-tokens.ts'), 'utf8');

    expect(output).toContain('export const myCustomTokens');
    expect(output).toContain('export type MyCustomTokens = typeof myCustomTokens');
  });

  it('uses tokenConstantName from the definition when no parameter is provided', () => {
    generate({ definition: definition({ tokenConstantName: 'APP_TOKENS' }) });
    const output = readFileSync(join(root(), 'src/generated/main-tokens.ts'), 'utf8');

    expect(output).toContain('export const APP_TOKENS');
    expect(output).toContain('export type AppTokens = typeof APP_TOKENS');
  });

  it('prefers the tokenConstantName parameter over the definition', () => {
    generate({
      definition: definition({ tokenConstantName: 'CONFIG_TOKENS' }),
      tokenConstantName: 'CLI_OVERRIDE_TOKENS',
    });
    expect(readFileSync(join(root(), 'src/generated/main-tokens.ts'), 'utf8')).toContain(
      'export const CLI_OVERRIDE_TOKENS',
    );
  });

  it('returns an error for an invalid tokenConstantName parameter', () => {
    const result = generate({ tokenConstantName: 'my-bad-name' });

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' ? result.reason : undefined).toMatch(/Invalid tokenConstantName/);
    expect(existsSync(join(root(), 'src/generated/main-tokens.ts'))).toBe(false);
  });

  it('returns an error for an invalid tokenConstantName in the definition', () => {
    const result = generate({ definition: definition({ tokenConstantName: '1bad' }) });

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' ? result.reason : undefined).toMatch(/Invalid tokenConstantName/);
    expect(existsSync(join(root(), 'src/generated/main-tokens.ts'))).toBe(false);
  });

  it('treats a non-string legacy typeDist value as not configured', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const legacy = { ...definition({ typeDistFile: undefined }), typeDist: null } as unknown as BundleDefinition;
    const result = generate({ definition: legacy });

    expect(result).toEqual({ status: 'not-configured' });
    expect(result.status).toBe('not-configured');
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses typeDistFile without warning when both current and legacy keys are present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const withBoth = {
      ...definition({ typeDistFile: 'types/current.ts' }),
      typeDist: 'types/legacy.ts',
    } as unknown as BundleDefinition;
    const result = generate({ definition: withBoth });

    expect(result.status === 'written' ? result.path : undefined).toBe('types/current.ts');
    expect(existsSync(join(root(), 'types/current.ts'))).toBe(true);
    expect(existsSync(join(root(), 'types/legacy.ts'))).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('supports deprecated typeDist while preparation owns its deprecation warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const legacy = {
      ...definition({ typeDistFile: undefined }),
      typeDist: 'types/legacy.ts',
    } as unknown as BundleDefinition;
    const result = generate({ definition: legacy });

    expect(result.status).toBe('written');
    expect(existsSync(join(root(), 'types/legacy.ts'))).toBe(true);
    expect(legacyTypeDistWarning('main', legacy)).toContain("Bundle 'main'");
    expect(legacyTypeDistWarning('main', legacy)).toContain("'typeDist' is deprecated");
    expect(legacyTypeDistWarning('main', legacy)).toContain("'typeDistFile'");
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the preparation warning available when creating the type directory fails', () => {
    writeFileSync(join(root(), 'blocked'), 'a file');
    const legacy = {
      ...definition({ typeDistFile: undefined }),
      typeDist: 'blocked/legacy.ts',
    } as unknown as BundleDefinition;

    const result = generate({ definition: legacy });

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' ? result.reason : undefined).toBeDefined();
    expect(legacyTypeDistWarning('main', legacy)).toContain("'typeDist' is deprecated");
  });
});
