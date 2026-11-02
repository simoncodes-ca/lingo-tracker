import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { InvalidConfigError, PreferredTerminologyValidationError } from '../errors/lingo-tracker-error';
import {
  DEFAULT_PREFERRED_TERMINOLOGY_FILENAME,
  loadPreferredTerminology,
  resolvePreferredTerminologyFile,
  resolvePreferredTerminologyFilePath,
  writePreferredTerminology,
} from './preferred-terminology-file';

const baseConfig = (overrides: Partial<LingoTrackerConfig> = {}): LingoTrackerConfig => ({
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'es'],
  collections: {},
  ...overrides,
});

// The read, missing-file and write rules are the term file's, covered in term-file.spec.ts.
describe('preferred-terminology-file', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'lingo-preferred-terminology-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  const write = (relativePath: string, contents: string): string => {
    const filePath = join(cwd, relativePath);
    writeFileSync(filePath, contents, 'utf8');
    return filePath;
  };

  describe('file resolution', () => {
    it('falls back to the default filename, as not explicit, when the config names no file', () => {
      expect(resolvePreferredTerminologyFile(baseConfig(), cwd)).toEqual({
        path: resolve(cwd, DEFAULT_PREFERRED_TERMINOLOGY_FILENAME),
        explicit: false,
      });
      expect(resolvePreferredTerminologyFilePath(baseConfig(), cwd)).toBe(
        resolve(cwd, DEFAULT_PREFERRED_TERMINOLOGY_FILENAME),
      );
    });

    it('resolves a relative pointer against the config directory, as explicit', () => {
      expect(
        resolvePreferredTerminologyFile(baseConfig({ preferredTerminologyFile: 'config/terms.json' }), cwd),
      ).toEqual({ path: join(cwd, 'config/terms.json'), explicit: true });
    });

    it('uses an absolute pointer as-is', () => {
      expect(
        resolvePreferredTerminologyFilePath(baseConfig({ preferredTerminologyFile: '/etc/terms.json' }), cwd),
      ).toBe('/etc/terms.json');
    });

    it('treats a null pointer like an unset one', () => {
      expect(resolvePreferredTerminologyFile(baseConfig({ preferredTerminologyFile: null as never }), cwd)).toEqual({
        path: resolve(cwd, DEFAULT_PREFERRED_TERMINOLOGY_FILENAME),
        explicit: false,
      });
    });

    it.each([
      ['a number', 42, 'number'],
      ['a boolean', true, 'boolean'],
      ['an object', {}, 'object'],
      ['an array', [], 'array'],
    ])('records %s pointer as invalid on the file, and throws from the path resolver', (_label, pointer, type) => {
      const config = baseConfig({ preferredTerminologyFile: pointer as never });
      const message = `"preferredTerminologyFile" in .lingo-tracker.json must be a string path (got ${type})`;

      expect(resolvePreferredTerminologyFile(config, cwd)).toEqual({
        path: resolve(cwd, DEFAULT_PREFERRED_TERMINOLOGY_FILENAME),
        explicit: false,
        invalid: message,
      });
      expect(() => resolvePreferredTerminologyFilePath(config, cwd)).toThrow(InvalidConfigError);
      expect(() => resolvePreferredTerminologyFilePath(config, cwd)).toThrow(message);
    });
  });

  describe('loadPreferredTerminology', () => {
    it('returns the rules and the path, in file order', () => {
      const filePath = write(
        DEFAULT_PREFERRED_TERMINOLOGY_FILENAME,
        JSON.stringify([
          { discouraged: 'Wallet', preferred: 'Account' },
          { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Brand voice' },
        ]),
      );

      expect(loadPreferredTerminology(baseConfig(), cwd)).toEqual({
        filePath,
        rules: [
          { discouraged: 'Wallet', preferred: 'Account' },
          { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Brand voice' },
        ],
      });
    });

    it('reports a problem in-band, with no rules', () => {
      write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, 'not json');

      const result = loadPreferredTerminology(baseConfig(), cwd);

      expect(result.rules).toEqual([]);
      expect(result.error).toContain('not valid JSON');
    });

    it('reports an invalid pointer as an error at the default path, without throwing', () => {
      const result = loadPreferredTerminology(baseConfig({ preferredTerminologyFile: 42 as never }), cwd);

      expect(result).toEqual({
        rules: [],
        filePath: resolve(cwd, DEFAULT_PREFERRED_TERMINOLOGY_FILENAME),
        error: '"preferredTerminologyFile" in .lingo-tracker.json must be a string path (got number)',
      });
    });

    it('reports an empty pointer, which resolves to the config directory, as an unreadable file', () => {
      const result = loadPreferredTerminology(baseConfig({ preferredTerminologyFile: '' }), cwd);

      expect(result.rules).toEqual([]);
      expect(result.error).toContain('cannot be read');
      expect(result.error).toContain('EISDIR');
    });
  });

  describe('writePreferredTerminology', () => {
    it('throws a validation error carrying the per-row errors, leaving the file untouched', () => {
      const filePath = write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, '[]\n');

      let thrown: unknown;
      try {
        writePreferredTerminology(filePath, [
          { discouraged: 'Expenditure', preferred: 'Investment' },
          { discouraged: 'Investment', preferred: 'Capital' },
        ]);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(PreferredTerminologyValidationError);
      const errors = thrown instanceof PreferredTerminologyValidationError ? thrown.errors : [];
      expect(errors).toEqual([expect.objectContaining({ index: 0, field: 'preferred', code: 'chain' })]);
      expect(readFileSync(filePath, 'utf8')).toBe('[]\n');
    });
  });
});
