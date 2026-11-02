import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type LingoTrackerConfig, loadConfig } from '@simoncodes-ca/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleFormatter } from '../utils';
import { preferredTerminologyCommand } from './preferred-terminology';

vi.mock('@simoncodes-ca/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@simoncodes-ca/core')>()),
  loadConfig: vi.fn(),
}));

// Spy on the real formatter object, which the runner prints errors through too.
for (const method of ['section', 'keyValue', 'indent', 'error', 'warning', 'success'] as const) {
  vi.spyOn(ConsoleFormatter, method).mockImplementation(() => undefined);
}

const FILE_NAME = '.lingo-tracker-preferred-terminology.json';

describe('preferredTerminologyCommand', () => {
  let projectDir: string;
  let filePath: string;
  let config: LingoTrackerConfig;

  const writeRules = (content: unknown) =>
    writeFileSync(filePath, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  const readRules = () => JSON.parse(readFileSync(filePath, 'utf8'));
  const indented = () => vi.mocked(ConsoleFormatter.indent).mock.calls.map((call) => call[0]);
  const errorDetails = (message: string) =>
    vi.mocked(ConsoleFormatter.error).mock.calls.find(([line]) => line === message)?.[1] ?? [];

  beforeEach(() => {
    vi.clearAllMocks();
    projectDir = mkdtempSync(join(tmpdir(), 'lingo-preferred-terminology-'));
    filePath = join(projectDir, FILE_NAME);
    config = {
      exportFolder: 'dist/lingo-export',
      importFolder: 'dist/lingo-import',
      baseLocale: 'en',
      locales: ['en', 'es'],
      collections: {},
    };
    process.env.INIT_CWD = projectDir;
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockImplementation(() => config);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  describe('argument checks', () => {
    it('errors when no option is given', async () => {
      await preferredTerminologyCommand({});

      expect(ConsoleFormatter.error).toHaveBeenCalledWith(
        'Provide one of --list, --add <discouraged> --preferred <preferred>, or --remove <discouraged>',
      );
      expect(process.exitCode).toBe(1);
    });

    it('uses the missing-operation wording for --preferred alone', async () => {
      await preferredTerminologyCommand({ preferred: 'Sign in' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith(
        'Provide one of --list, --add <discouraged> --preferred <preferred>, or --remove <discouraged>',
      );
      expect(process.exitCode).toBe(1);
    });

    it('uses the missing-operation wording for --reason alone', async () => {
      await preferredTerminologyCommand({ reason: 'House style' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith(
        'Provide one of --list, --add <discouraged> --preferred <preferred>, or --remove <discouraged>',
      );
      expect(process.exitCode).toBe(1);
    });

    it('rejects --add combined with --remove', async () => {
      await preferredTerminologyCommand({ add: 'Expenditure', preferred: 'Investment', remove: 'Spend' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('--add and --remove cannot be combined; run them separately');
      expect(process.exitCode).toBe(1);
      expect(existsSync(filePath)).toBe(false);
    });

    it('requires --preferred with --add', async () => {
      await preferredTerminologyCommand({ add: 'Expenditure' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('--add requires --preferred <preferred>');
      expect(process.exitCode).toBe(1);
      expect(existsSync(filePath)).toBe(false);
    });

    it('rejects --preferred or --reason without --add', async () => {
      await preferredTerminologyCommand({ list: true, preferred: 'Investment' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('--preferred and --reason can only be used with --add');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('--list', () => {
    it('prints the file and (none) when there are no rules', async () => {
      await preferredTerminologyCommand({ list: true });

      expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('File', FILE_NAME);
      expect(indented()).toEqual(['(none)']);
      expect(process.exitCode).toBe(0);
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
      expect(ConsoleFormatter.error).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
    });

    it('prints a warning for a missing explicit file and continues', async () => {
      config.preferredTerminologyFile = 'config/terms.json';

      await preferredTerminologyCommand({ list: true });

      expect(ConsoleFormatter.warning).toHaveBeenCalledWith(
        expect.stringContaining('Preferred terminology file not found'),
      );
      expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('File', join('config', 'terms.json'));
      expect(indented()).toEqual(['(none)']);
      expect(process.exitCode).toBe(0);
    });
  });

  describe('--add', () => {
    it('creates the file with a new rule and reports "added"', async () => {
      await preferredTerminologyCommand({ add: ' Expenditure ', preferred: 'Investment', reason: 'Brand voice' });

      expect(readRules()).toEqual([{ discouraged: 'Expenditure', preferred: 'Investment', reason: 'Brand voice' }]);
      expect(ConsoleFormatter.success).toHaveBeenCalledWith(
        `Added preferred terminology rule: Expenditure → Investment — Brand voice (${FILE_NAME})`,
      );
      expect(process.exitCode).toBe(0);
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

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('Preferred terminology not saved:', expect.any(Array));
      const details = errorDetails('Preferred terminology not saved:');
      expect(details.length).toBeGreaterThan(0);
      expect(details[0]).toContain('"Expenditure → Investment":');
      expect(process.exitCode).toBe(1);
      expect(ConsoleFormatter.success).not.toHaveBeenCalled();
      expect(readFileSync(filePath, 'utf8')).toBe(before);
    });

    it('prints the requested list before reporting a rule validation failure', async () => {
      writeRules([{ discouraged: 'Login', preferred: 'Sign in' }]);
      await preferredTerminologyCommand({ list: true, add: 'Expenditure', preferred: '' });
      expect(indented()).toEqual(['Login → Sign in']);
      expect(ConsoleFormatter.error).toHaveBeenCalledWith('Preferred terminology not saved:', expect.any(Array));
      const listOrder = vi.mocked(ConsoleFormatter.indent).mock.invocationCallOrder[0] ?? 0;
      const errorOrder = vi.mocked(ConsoleFormatter.error).mock.invocationCallOrder[0] ?? 0;
      expect(listOrder).toBeLessThan(errorOrder);
      expect(process.exitCode).toBe(1);
    });

    it('refuses to write over a broken file', async () => {
      writeRules('[{"discouraged": 1}]');
      const before = readFileSync(filePath, 'utf8');

      await preferredTerminologyCommand({ add: 'Expenditure', preferred: 'Investment' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith(
        expect.stringContaining('Preferred terminology file has invalid rules'),
      );
      expect(ConsoleFormatter.error).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
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
      expect(process.exitCode).toBe(1);
      expect(readFileSync(filePath, 'utf8')).toBe(before);
    });
  });
});
