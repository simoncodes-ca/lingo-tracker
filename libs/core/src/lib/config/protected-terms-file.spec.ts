import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import {
  DEFAULT_PROTECTED_TERMS_FILENAME,
  clearProtectedTermsFileCache,
  readCollectionProtectedTerms,
  readEffectiveProtectedTerms,
  readGlobalProtectedTerms,
  readProtectedTermsFile,
  resolveCollectionProtectedTermsFilePath,
  resolveGlobalProtectedTermsFilePath,
  resolveProtectedTermsFilePath,
  resolveProtectedTermsForConfig,
  writeProtectedTermsFile,
} from './protected-terms-file';

const baseConfig = (overrides: Partial<LingoTrackerConfig> = {}): LingoTrackerConfig => ({
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'es'],
  collections: {},
  ...overrides,
});

describe('protected-terms-file', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'lingo-protected-terms-'));
    clearProtectedTermsFileCache();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const write = (relativePath: string, contents: string): string => {
    const filePath = join(cwd, relativePath);
    writeFileSync(filePath, contents, 'utf8');
    return filePath;
  };

  describe('path resolution', () => {
    it('resolves a relative pointer against the config directory', () => {
      expect(resolveProtectedTermsFilePath('config/terms.json', cwd)).toBe(join(cwd, 'config/terms.json'));
    });

    it('uses an absolute pointer as-is', () => {
      expect(resolveProtectedTermsFilePath('/etc/terms.json', cwd)).toBe('/etc/terms.json');
    });

    it('falls back to the default filename when the global config names no file', () => {
      expect(resolveGlobalProtectedTermsFilePath(baseConfig(), cwd)).toBe(
        resolve(cwd, DEFAULT_PROTECTED_TERMS_FILENAME),
      );
    });

    it('has no default path for a collection', () => {
      expect(resolveCollectionProtectedTermsFilePath({}, cwd)).toBeUndefined();
      expect(resolveCollectionProtectedTermsFilePath({ protectedTermsFile: 'terms.json' }, cwd)).toBe(
        join(cwd, 'terms.json'),
      );
    });
  });

  describe('readProtectedTermsFile', () => {
    it('reads, trims, and dedupes a bare array', () => {
      const filePath = write('terms.json', '[" iPhone ", "iPhone", "Node.js", "  "]');

      expect(readProtectedTermsFile(filePath)).toEqual(['iPhone', 'Node.js']);
    });

    it('returns an empty list for a missing file at the default path, without warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(readProtectedTermsFile(join(cwd, 'absent.json'))).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('warns when an explicitly configured file is missing', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(readProtectedTermsFile(join(cwd, 'absent.json'), { explicit: true })).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('absent.json'));
    });

    it('throws on malformed JSON', () => {
      const filePath = write('terms.json', '["iPhone",');

      expect(() => readProtectedTermsFile(filePath)).toThrow('not valid JSON');
    });

    it('throws when the payload is not an array', () => {
      const filePath = write('terms.json', '{ "terms": ["iPhone"] }');

      expect(() => readProtectedTermsFile(filePath)).toThrow('must contain a JSON array of strings');
    });

    it('throws when an element is not a string', () => {
      const filePath = write('terms.json', '["iPhone", 42]');

      expect(() => readProtectedTermsFile(filePath)).toThrow('must contain only strings');
    });

    it('serves a second read from cache without touching disk again', () => {
      const filePath = write('terms.json', '["iPhone"]');
      expect(readProtectedTermsFile(filePath)).toEqual(['iPhone']);

      writeFileSync(filePath, '["Android"]', 'utf8');

      expect(readProtectedTermsFile(filePath)).toEqual(['iPhone']);
      clearProtectedTermsFileCache();
      expect(readProtectedTermsFile(filePath)).toEqual(['Android']);
    });

    it('hands back a copy, so a caller mutating the result cannot poison the cache', () => {
      const filePath = write('terms.json', '["iPhone"]');

      readProtectedTermsFile(filePath).push('Android');

      expect(readProtectedTermsFile(filePath)).toEqual(['iPhone']);
    });
  });

  describe('writeProtectedTermsFile', () => {
    it('writes sorted, normalized, 2-space JSON with a trailing newline', () => {
      const filePath = join(cwd, 'terms.json');

      writeProtectedTermsFile(filePath, ['Node.js', ' iPhone ', 'iPhone', '  ']);

      expect(readFileSync(filePath, 'utf8')).toBe('[\n  "iPhone",\n  "Node.js"\n]\n');
    });

    it('creates the file when it does not exist', () => {
      const filePath = join(cwd, 'terms.json');

      writeProtectedTermsFile(filePath, ['iPhone']);

      expect(readProtectedTermsFile(filePath)).toEqual(['iPhone']);
    });

    it('throws when the parent directory is missing', () => {
      expect(() => writeProtectedTermsFile(join(cwd, 'nested/terms.json'), ['iPhone'])).toThrow(
        'directory does not exist',
      );
    });

    it('refreshes the cache so a following read sees the new terms', () => {
      const filePath = write('terms.json', '["iPhone"]');
      expect(readProtectedTermsFile(filePath)).toEqual(['iPhone']);

      writeProtectedTermsFile(filePath, ['Android']);

      expect(readProtectedTermsFile(filePath)).toEqual(['Android']);
    });
  });

  describe('effective terms', () => {
    it('unions the global and collection files, deduped', () => {
      write(DEFAULT_PROTECTED_TERMS_FILENAME, '["SimonCodes", "iPhone"]');
      write('collection-terms.json', '["iPhone", "Node.js"]');
      const collection = { translationsFolder: './i18n', protectedTermsFile: 'collection-terms.json' };

      expect(readEffectiveProtectedTerms(baseConfig(), collection, cwd)).toEqual(['SimonCodes', 'iPhone', 'Node.js']);
    });

    it('returns the global list alone when no collection is given', () => {
      write(DEFAULT_PROTECTED_TERMS_FILENAME, '["SimonCodes"]');

      expect(readEffectiveProtectedTerms(baseConfig(), undefined, cwd)).toEqual(['SimonCodes']);
    });

    it('contributes nothing from a collection with no pointer', () => {
      write(DEFAULT_PROTECTED_TERMS_FILENAME, '["SimonCodes"]');

      expect(readCollectionProtectedTerms({ translationsFolder: './i18n' }, cwd)).toEqual([]);
      expect(readEffectiveProtectedTerms(baseConfig(), { translationsFolder: './i18n' }, cwd)).toEqual(['SimonCodes']);
    });

    it('honours an explicit global pointer over the default path', () => {
      write(DEFAULT_PROTECTED_TERMS_FILENAME, '["Ignored"]');
      write('custom.json', '["Used"]');

      expect(readGlobalProtectedTerms(baseConfig({ protectedTermsFile: 'custom.json' }), cwd)).toEqual(['Used']);
    });
  });

  describe('resolveProtectedTermsForConfig', () => {
    it('reads every scope in one pass, reporting terms and paths', () => {
      write(DEFAULT_PROTECTED_TERMS_FILENAME, '["SimonCodes"]');
      write('app-terms.json', '["iPhone"]');
      const config = baseConfig({
        collections: {
          app: { translationsFolder: './i18n', protectedTermsFile: 'app-terms.json' },
          other: { translationsFolder: './other' },
        },
      });

      const resolved = resolveProtectedTermsForConfig(config, cwd);

      expect(resolved.globalTerms).toEqual(['SimonCodes']);
      expect(resolved.globalFilePath).toBe(resolve(cwd, DEFAULT_PROTECTED_TERMS_FILENAME));
      expect(resolved.collections.app).toEqual({ terms: ['iPhone'], filePath: join(cwd, 'app-terms.json') });
      expect(resolved.collections.other).toEqual({ terms: [], filePath: undefined });
    });
  });

  it('reports the global file path even when the file does not exist yet', () => {
    mkdirSync(join(cwd, 'config'));

    expect(resolveGlobalProtectedTermsFilePath(baseConfig({ protectedTermsFile: 'config/terms.json' }), cwd)).toBe(
      join(cwd, 'config/terms.json'),
    );
  });
});
