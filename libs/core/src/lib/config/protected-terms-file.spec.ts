import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LingoTrackerCollection } from '../../config/lingo-tracker-collection';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { ProtectedTermsFileError } from '../errors/lingo-tracker-error';
import {
  DEFAULT_PROTECTED_TERMS_FILENAME,
  readCollectionProtectedTerms,
  readGlobalProtectedTerms,
  requireProtectedTermsFile,
  resolveCollectionProtectedTermsFilePath,
  resolveGlobalProtectedTermsFile,
  resolveGlobalProtectedTermsFilePath,
} from './protected-terms-file';

const baseConfig = (overrides: Partial<LingoTrackerConfig> = {}): LingoTrackerConfig => ({
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'es'],
  collections: {},
  ...overrides,
});

// The read, missing-file and write rules are the term file's, covered in term-file.spec.ts.
describe('protected-terms-file', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'lingo-protected-terms-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  const write = (relativePath: string, contents: string): string => {
    const filePath = join(cwd, relativePath);
    writeFileSync(filePath, contents, 'utf8');
    return filePath;
  };

  describe('path resolution', () => {
    it('falls back to the default file, as not explicit, when the global config names none', () => {
      expect(resolveGlobalProtectedTermsFile(baseConfig(), cwd)).toEqual({
        path: resolve(cwd, DEFAULT_PROTECTED_TERMS_FILENAME),
        explicit: false,
      });
      expect(resolveGlobalProtectedTermsFilePath(baseConfig(), cwd)).toBe(
        resolve(cwd, DEFAULT_PROTECTED_TERMS_FILENAME),
      );
    });

    it('marks a named global file as explicit, even when it does not exist yet', () => {
      mkdirSync(join(cwd, 'config'));

      expect(resolveGlobalProtectedTermsFile(baseConfig({ protectedTermsFile: 'config/terms.json' }), cwd)).toEqual({
        path: join(cwd, 'config/terms.json'),
        explicit: true,
      });
    });

    it('has no default path for a collection', () => {
      expect(resolveCollectionProtectedTermsFilePath({}, cwd)).toBeUndefined();
      expect(resolveCollectionProtectedTermsFilePath({ protectedTermsFile: 'terms.json' }, cwd)).toBe(
        join(cwd, 'terms.json'),
      );
    });
  });

  describe('stored-list readers (for the commands that show or rewrite a file)', () => {
    it('throw ProtectedTermsFileError, naming the file, when it is not a JSON array of strings', () => {
      const filePath = write('terms.json', '["iPhone",');

      expect(() => requireProtectedTermsFile({ path: filePath, explicit: false })).toThrow(
        expect.objectContaining({ code: 'INVALID_PROTECTED_TERMS_FILE', filePath }),
      );
      expect(() => requireProtectedTermsFile({ path: filePath, explicit: false })).toThrow(ProtectedTermsFileError);
    });

    it('read a missing file as an empty list, warning when the config names it', () => {
      expect(readGlobalProtectedTerms(baseConfig({ protectedTermsFile: 'absent.json' }), cwd)).toEqual({
        terms: [],
        warning: `Protected terms file not found: ${join(cwd, 'absent.json')}. Treating as an empty list.`,
      });
      expect(readGlobalProtectedTerms(baseConfig(), cwd)).toEqual({ terms: [] });
      expect(readCollectionProtectedTerms({ protectedTermsFile: 'gone.json' }, cwd)).toEqual({
        terms: [],
        warning: `Protected terms file not found: ${join(cwd, 'gone.json')}. Treating as an empty list.`,
      });
    });

    it('honour an explicit global pointer over the default path', () => {
      write(DEFAULT_PROTECTED_TERMS_FILENAME, '["Ignored"]');
      write('custom.json', '["Used"]');

      expect(readGlobalProtectedTerms(baseConfig({ protectedTermsFile: 'custom.json' }), cwd)).toEqual({
        terms: ['Used'],
      });
    });

    it('contribute nothing from a collection with no pointer', () => {
      const collection: LingoTrackerCollection = { translationsFolder: './i18n' };

      expect(readCollectionProtectedTerms(collection, cwd)).toEqual({ terms: [] });
    });
  });
});
