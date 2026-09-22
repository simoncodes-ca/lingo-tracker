import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearPreferredTerminologyCache } from '@simoncodes-ca/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preferredTerminologyCommand } from './preferred-terminology';

vi.mock('../utils', () => ({
  loadConfiguration: vi.fn(),
  ConsoleFormatter: {
    section: vi.fn(),
    keyValue: vi.fn(),
    indent: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

import { ConsoleFormatter, loadConfiguration } from '../utils';

const FILE_NAME = '.lingo-tracker-preferred-terminology.json';

describe('preferredTerminologyCommand', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  let projectDir: string;
  let filePath: string;
  let config: Record<string, unknown>;

  const writeRules = (content: unknown) =>
    writeFileSync(filePath, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  const readRules = () => JSON.parse(readFileSync(filePath, 'utf8'));
  const indented = () => vi.mocked(ConsoleFormatter.indent).mock.calls.map((call) => call[0]);

  beforeEach(() => {
    vi.clearAllMocks();
    clearPreferredTerminologyCache();
    projectDir = mkdtempSync(join(tmpdir(), 'lingo-preferred-terminology-'));
    filePath = join(projectDir, FILE_NAME);
    config = { baseLocale: 'en', locales: ['en', 'es'], collections: {} };
    vi.mocked(loadConfiguration).mockImplementation(() => ({ config, cwd: projectDir }) as never);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe('argument checks', () => {
    it('errors when no option is given', async () => {
      await preferredTerminologyCommand({});

      expect(ConsoleFormatter.error).toHaveBeenCalledWith(
        'Provide one of --list, --add <discouraged> --preferred <preferred>, or --remove <discouraged>',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('rejects --add combined with --remove', async () => {
      await preferredTerminologyCommand({ add: 'Expenditure', preferred: 'Investment', remove: 'Spend' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('--add and --remove cannot be combined; run them separately');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(existsSync(filePath)).toBe(false);
    });

    it('requires --preferred with --add', async () => {
      await preferredTerminologyCommand({ add: 'Expenditure' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('--add requires --preferred <preferred>');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(existsSync(filePath)).toBe(false);
    });

    it('rejects --preferred or --reason without --add', async () => {
      await preferredTerminologyCommand({ list: true, preferred: 'Investment' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('--preferred and --reason can only be used with --add');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('--list', () => {
    it('prints the file and (none) when there are no rules', async () => {
      await preferredTerminologyCommand({ list: true });

      expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('File', FILE_NAME);
      expect(indented()).toEqual(['(none)']);
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('prints one rule per line, with the reason only when present', async () => {
      writeRules([
        { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Brand voice' },
        { discouraged: 'Login', preferred: 'Sign in' },
      ]);

      await preferredTerminologyCommand({ list: true });

      expect(indented()).toEqual(['Expenditure → Investment — Brand voice', 'Login → Sign in']);
    });

    it('prints the load error and exits 1 for a broken file', async () => {
      writeRules('{ not json');

      await preferredTerminologyCommand({ list: true });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith(
        expect.stringContaining('Preferred terminology file is not valid JSON'),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('prints a warning for a missing explicit file and continues', async () => {
      config.preferredTerminologyFile = 'config/terms.json';

      await preferredTerminologyCommand({ list: true });

      expect(ConsoleFormatter.warning).toHaveBeenCalledWith(
        expect.stringContaining('Preferred terminology file not found'),
      );
      expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('File', join('config', 'terms.json'));
      expect(indented()).toEqual(['(none)']);
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  describe('--add', () => {
    it('creates the file with a new rule and reports "added"', async () => {
      await preferredTerminologyCommand({ add: ' Expenditure ', preferred: 'Investment', reason: 'Brand voice' });

      expect(readRules()).toEqual([{ discouraged: 'Expenditure', preferred: 'Investment', reason: 'Brand voice' }]);
      expect(ConsoleFormatter.success).toHaveBeenCalledWith(
        `Added preferred terminology rule: Expenditure → Investment — Brand voice (${FILE_NAME})`,
      );
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('updates an existing rule matched case-insensitively, replacing it entirely', async () => {
      writeRules([
        { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Old reason' },
        { discouraged: 'Login', preferred: 'Sign in' },
      ]);

      await preferredTerminologyCommand({ add: 'expenditure', preferred: 'Spending' });

      expect(readRules()).toEqual([
        { discouraged: 'expenditure', preferred: 'Spending' },
        { discouraged: 'Login', preferred: 'Sign in' },
      ]);
      expect(ConsoleFormatter.success).toHaveBeenCalledWith(
        `Updated preferred terminology rule: expenditure → Spending (${FILE_NAME})`,
      );
    });

    it('prints each validation error and leaves the file untouched', async () => {
      const original = [{ discouraged: 'Expenditure', preferred: 'Investment' }];
      writeRules(original);
      const before = readFileSync(filePath, 'utf8');

      // Investment → Capital would make "Investment" both preferred and discouraged: a chain.
      await preferredTerminologyCommand({ add: 'Investment', preferred: 'Capital' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('Preferred terminology not saved:');
      expect(indented().length).toBeGreaterThan(0);
      expect(indented()[0]).toContain('"Expenditure → Investment":');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(ConsoleFormatter.success).not.toHaveBeenCalled();
      expect(readFileSync(filePath, 'utf8')).toBe(before);
    });

    it('refuses to write over a broken file', async () => {
      writeRules('[{"discouraged": 1}]');
      const before = readFileSync(filePath, 'utf8');

      await preferredTerminologyCommand({ add: 'Expenditure', preferred: 'Investment' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith(
        expect.stringContaining('Preferred terminology file has invalid rules'),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(readFileSync(filePath, 'utf8')).toBe(before);
    });
  });

  describe('--remove', () => {
    it('removes a rule matched case-insensitively', async () => {
      writeRules([
        { discouraged: 'Expenditure', preferred: 'Investment' },
        { discouraged: 'Login', preferred: 'Sign in' },
      ]);

      await preferredTerminologyCommand({ remove: 'EXPENDITURE' });

      expect(readRules()).toEqual([{ discouraged: 'Login', preferred: 'Sign in' }]);
      expect(ConsoleFormatter.success).toHaveBeenCalledWith(
        `Removed preferred terminology rule: Expenditure → Investment (${FILE_NAME})`,
      );
    });

    it('errors on an unknown term and leaves the file untouched', async () => {
      writeRules([{ discouraged: 'Login', preferred: 'Sign in' }]);
      const before = readFileSync(filePath, 'utf8');

      await preferredTerminologyCommand({ remove: 'Expenditure' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith(
        `No preferred terminology rule for "Expenditure" (${FILE_NAME})`,
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(readFileSync(filePath, 'utf8')).toBe(before);
    });
  });
});
