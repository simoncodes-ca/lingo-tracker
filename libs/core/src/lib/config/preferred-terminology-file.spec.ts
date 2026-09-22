import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import {
  clearPreferredTerminologyCache,
  DEFAULT_PREFERRED_TERMINOLOGY_FILENAME,
  loadPreferredTerminology,
  PreferredTerminologyValidationError,
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

describe('preferred-terminology-file', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'lingo-preferred-terminology-'));
    clearPreferredTerminologyCache();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  const write = (relativePath: string, contents: string): string => {
    const filePath = join(cwd, relativePath);
    writeFileSync(filePath, contents, 'utf8');
    return filePath;
  };

  describe('resolvePreferredTerminologyFilePath', () => {
    it('falls back to the default filename when the config names no file', () => {
      expect(resolvePreferredTerminologyFilePath(baseConfig(), cwd)).toBe(
        resolve(cwd, DEFAULT_PREFERRED_TERMINOLOGY_FILENAME),
      );
    });

    it('resolves a relative pointer against the config directory', () => {
      expect(
        resolvePreferredTerminologyFilePath(baseConfig({ preferredTerminologyFile: 'config/terms.json' }), cwd),
      ).toBe(join(cwd, 'config/terms.json'));
    });

    it('uses an absolute pointer as-is', () => {
      expect(
        resolvePreferredTerminologyFilePath(baseConfig({ preferredTerminologyFile: '/etc/terms.json' }), cwd),
      ).toBe('/etc/terms.json');
    });
  });

  describe('loadPreferredTerminology', () => {
    it('returns an empty list, silently, when the default file is missing', () => {
      const result = loadPreferredTerminology(baseConfig(), cwd);

      expect(result).toEqual({ rules: [], filePath: resolve(cwd, DEFAULT_PREFERRED_TERMINOLOGY_FILENAME) });
    });

    it('warns, with an empty list, when an explicitly configured file is missing', () => {
      const result = loadPreferredTerminology(baseConfig({ preferredTerminologyFile: 'absent.json' }), cwd);

      expect(result.rules).toEqual([]);
      expect(result.error).toBeUndefined();
      expect(result.warning).toContain(join(cwd, 'absent.json'));
    });

    it('reads, normalizes, and keeps file order for a valid file', () => {
      write(
        DEFAULT_PREFERRED_TERMINOLOGY_FILENAME,
        JSON.stringify([
          { discouraged: ' Wallet ', preferred: 'Account', reason: '  ' },
          { discouraged: 'Expenditure', preferred: 'Investment', reason: ' Brand voice ' },
        ]),
      );

      const result = loadPreferredTerminology(baseConfig(), cwd);

      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();
      expect(result.rules).toEqual([
        { discouraged: 'Wallet', preferred: 'Account' },
        { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Brand voice' },
      ]);
    });

    it('reads an explicitly configured file at an absolute path', () => {
      const filePath = write('custom.json', '[{ "discouraged": "Expenditure", "preferred": "Investment" }]');

      const result = loadPreferredTerminology(baseConfig({ preferredTerminologyFile: filePath }), '/elsewhere');

      expect(result.filePath).toBe(filePath);
      expect(result.rules).toEqual([{ discouraged: 'Expenditure', preferred: 'Investment' }]);
    });

    it('reports malformed JSON as an error with no rules', () => {
      const filePath = write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, '[{ "discouraged": ');

      const result = loadPreferredTerminology(baseConfig(), cwd);

      expect(result.rules).toEqual([]);
      expect(result.error).toContain('not valid JSON');
      expect(result.error).toContain(filePath);
    });

    it('reports a non-array payload as an error', () => {
      write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, '{ "rules": [] }');

      const result = loadPreferredTerminology(baseConfig(), cwd);

      expect(result.rules).toEqual([]);
      expect(result.error).toContain('must contain a JSON array of rules');
    });

    it('reports a non-object element as an error', () => {
      write(
        DEFAULT_PREFERRED_TERMINOLOGY_FILENAME,
        '[{ "discouraged": "Expenditure", "preferred": "Investment" }, 42]',
      );

      const result = loadPreferredTerminology(baseConfig(), cwd);

      expect(result.rules).toEqual([]);
      expect(result.error).toContain('row 2 rule: Rule must be an object.');
    });

    it('lists every invalid row in the error, including the file path', () => {
      const filePath = write(
        DEFAULT_PREFERRED_TERMINOLOGY_FILENAME,
        JSON.stringify([
          { discouraged: 'Expenditure', preferred: 'Investment' },
          { discouraged: 'Email', preferred: 'email' },
          { discouraged: 'Wallet', preferred: '' },
        ]),
      );

      const result = loadPreferredTerminology(baseConfig(), cwd);

      expect(result.rules).toEqual([]);
      expect(result.error).toContain(filePath);
      expect(result.error).toContain('row 2 preferred:');
      expect(result.error).toContain('row 3 preferred: Preferred term is required.');
    });

    it('does not cache a broken file, so a fix is picked up on the next load', () => {
      write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, 'not json');
      expect(loadPreferredTerminology(baseConfig(), cwd).error).toBeDefined();

      write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, '[{ "discouraged": "Expenditure", "preferred": "Investment" }]');

      expect(loadPreferredTerminology(baseConfig(), cwd).rules).toHaveLength(1);
    });

    it('serves a second load from cache and hands back copies', () => {
      const filePath = write(
        DEFAULT_PREFERRED_TERMINOLOGY_FILENAME,
        '[{ "discouraged": "Expenditure", "preferred": "Investment" }]',
      );
      const first = loadPreferredTerminology(baseConfig(), cwd);
      first.rules[0].preferred = 'Mutated';
      first.rules.push({ discouraged: 'Extra', preferred: 'Row' });

      writeFileSync(filePath, '[]', 'utf8');

      expect(loadPreferredTerminology(baseConfig(), cwd).rules).toEqual([
        { discouraged: 'Expenditure', preferred: 'Investment' },
      ]);
      clearPreferredTerminologyCache();
      expect(loadPreferredTerminology(baseConfig(), cwd).rules).toEqual([]);
    });
  });

  describe('writePreferredTerminology', () => {
    it('writes sorted, normalized, 2-space JSON with a trailing newline and no empty reason', () => {
      const filePath = join(cwd, DEFAULT_PREFERRED_TERMINOLOGY_FILENAME);

      writePreferredTerminology(filePath, [
        { discouraged: 'wallet', preferred: 'Account', reason: '  ' },
        { discouraged: ' Expenditure ', preferred: 'Investment', reason: ' Brand voice ' },
        { discouraged: 'Client', preferred: 'Customer' },
      ]);

      expect(readFileSync(filePath, 'utf8')).toBe(
        `${JSON.stringify(
          [
            { discouraged: 'Client', preferred: 'Customer' },
            { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Brand voice' },
            { discouraged: 'wallet', preferred: 'Account' },
          ],
          null,
          2,
        )}\n`,
      );
    });

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

    it('throws when the parent directory is missing', () => {
      expect(() =>
        writePreferredTerminology(join(cwd, 'nested/terms.json'), [
          { discouraged: 'Expenditure', preferred: 'Investment' },
        ]),
      ).toThrow('directory does not exist');
    });

    it('refreshes the cache so a following load sees the new rules', () => {
      const filePath = write(
        DEFAULT_PREFERRED_TERMINOLOGY_FILENAME,
        '[{ "discouraged": "Expenditure", "preferred": "Investment" }]',
      );
      expect(loadPreferredTerminology(baseConfig(), cwd).rules).toHaveLength(1);

      writePreferredTerminology(filePath, [
        { discouraged: 'Wallet', preferred: 'Account' },
        { discouraged: 'Client', preferred: 'Customer' },
      ]);

      expect(loadPreferredTerminology(baseConfig(), cwd).rules).toEqual([
        { discouraged: 'Client', preferred: 'Customer' },
        { discouraged: 'Wallet', preferred: 'Account' },
      ]);
    });
  });
});
