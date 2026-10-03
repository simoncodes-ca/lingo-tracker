import { Command } from 'commander';
import { commaListOption } from '../runner/options';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_FILENAME, type LingoTrackerConfig } from '@simoncodes-ca/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleFormatter } from '../utils';
import { protectedTermsCommand } from './protected-terms';

for (const method of ['section', 'keyValue', 'error', 'success', 'warning'] as const) {
  vi.spyOn(ConsoleFormatter, method).mockImplementation(() => undefined);
}

const BASE_CONFIG: LingoTrackerConfig = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'es'],
  collections: { main: { translationsFolder: 'src/i18n' } },
};

describe('protectedTermsCommand (real core)', () => {
  let projectDir: string;
  const configPath = () => join(projectDir, CONFIG_FILENAME);
  const globalPath = () => join(projectDir, '.lingo-tracker-protected-terms.json');
  const collectionPath = () => join(projectDir, 'i18n/terms.json');
  const readJson = (filePath: string): unknown => JSON.parse(readFileSync(filePath, 'utf8'));
  const writeConfig = (config: LingoTrackerConfig = BASE_CONFIG): void => {
    writeFileSync(configPath(), JSON.stringify(config));
  };
  const readConfig = (): LingoTrackerConfig => readJson(configPath()) as LingoTrackerConfig;
  const withCollectionFile = (): void => {
    writeConfig({
      ...BASE_CONFIG,
      collections: { main: { ...BASE_CONFIG.collections['main'], protectedTermsFile: 'i18n/terms.json' } },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    projectDir = mkdtempSync(join(tmpdir(), 'lingo-cli-protected-'));
    mkdirSync(join(projectDir, 'i18n'));
    mkdirSync(join(projectDir, 'config'));
    process.env.INIT_CWD = projectDir;
    process.exitCode = undefined;
    writeConfig();
  });
  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('writes a trimmed --set comma list', async () => {
    const cli = new Command();
    commaListOption({ flags: '--set <terms>' })(cli);
    cli.parse(['--set', 'a, b'], { from: 'user' });
    await protectedTermsCommand(cli.opts<{ set?: string[] }>());
    expect(readJson(globalPath())).toEqual(['a', 'b']);
    expect(process.exitCode).toBe(0);
  });

  it('errors when --set is combined with --add', async () => {
    await protectedTermsCommand({ set: ['iPhone'], add: ['C++'] });
    expect(ConsoleFormatter.error).toHaveBeenCalledWith('--set cannot be combined with --add or --remove');
    expect(process.exitCode).toBe(1);
  });
  it('errors when no operation is given', async () => {
    await protectedTermsCommand({});
    expect(ConsoleFormatter.error).toHaveBeenCalledWith(
      'Provide at least one of --add, --remove, --set, --list, or --file',
    );
    expect(process.exitCode).toBe(1);
  });
  it('passes global additions to core and prints the resulting list', async () => {
    await protectedTermsCommand({ add: [' iPhone ', 'iPhone'] });
    expect(readJson(globalPath())).toEqual(['iPhone']);
    expect(ConsoleFormatter.success).toHaveBeenCalledWith(
      'Global protected terms updated: iPhone (.lingo-tracker-protected-terms.json)',
    );
    expect(process.exitCode).toBe(0);
  });
  it('refuses a config changed after load and leaves term files untouched', async () => {
    vi.mocked(ConsoleFormatter.section).mockImplementationOnce(() => {
      writeFileSync(configPath(), `${JSON.stringify(BASE_CONFIG)}\n`);
    });
    await protectedTermsCommand({ list: true, add: ['Pixel'] });
    expect(ConsoleFormatter.error).toHaveBeenCalledWith(
      'The configuration file changed after it was read; run the command again',
    );
    expect(process.exitCode).toBe(1);
    expect(existsSync(globalPath())).toBe(false);
  });
  it('passes collection additions to core', async () => {
    withCollectionFile();
    await protectedTermsCommand({ collection: 'main', add: ['iPhone', 'C++'] });
    expect(readJson(collectionPath())).toEqual(['C++', 'iPhone']);
  });
  it('passes removals to core', async () => {
    writeFileSync(globalPath(), '["iPhone","C++"]');
    await protectedTermsCommand({ remove: ['iPhone'] });
    expect(readJson(globalPath())).toEqual(['C++']);
  });
  it('passes replacements to core', async () => {
    writeFileSync(globalPath(), '["C++"]');
    await protectedTermsCommand({ set: ['iPhone', 'Node.js'] });
    expect(readJson(globalPath())).toEqual(['iPhone', 'Node.js']);
  });
  it('prints a cleared list', async () => {
    await protectedTermsCommand({ set: [] });
    expect(readJson(globalPath())).toEqual([]);
    expect(ConsoleFormatter.success).toHaveBeenCalledWith(
      'Global protected terms cleared (.lingo-tracker-protected-terms.json)',
    );
  });
  it('errors when the collection does not exist', async () => {
    await protectedTermsCommand({ collection: 'missing', add: ['iPhone'] });
    expect(ConsoleFormatter.error).toHaveBeenCalledWith('Collection "missing" not found');
    expect(process.exitCode).toBe(1);
  });
  it('lists global terms and the file path', async () => {
    writeFileSync(globalPath(), '["iPhone"]');
    await protectedTermsCommand({ list: true });
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Scope', 'Global');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('File', '.lingo-tracker-protected-terms.json');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Terms', 'iPhone');
  });
  it('lists the effective union for a collection, naming both files', async () => {
    withCollectionFile();
    writeFileSync(globalPath(), '["SimonCodes"]');
    writeFileSync(collectionPath(), '["iPhone"]');
    await protectedTermsCommand({ collection: 'main', list: true });
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Global file', '.lingo-tracker-protected-terms.json');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Collection file', 'i18n/terms.json');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Effective', 'SimonCodes, iPhone');
  });
  it('prints the global pointer change', async () => {
    await protectedTermsCommand({ file: 'config/terms.json' });
    expect(readConfig().protectedTermsFile).toBe('config/terms.json');
    expect(ConsoleFormatter.success).toHaveBeenCalledWith(
      `Global protected terms file set to ${join(projectDir, 'config/terms.json')}`,
    );
  });
  it('passes an empty --file pointer to core', async () => {
    writeConfig({ ...BASE_CONFIG, protectedTermsFile: 'config/terms.json' });
    await protectedTermsCommand({ file: '' });
    expect(readConfig().protectedTermsFile).toBeUndefined();
    expect(existsSync(globalPath())).toBe(true);
  });
  it('passes a collection pointer to core', async () => {
    await protectedTermsCommand({ collection: 'main', file: 'i18n/terms.json' });
    expect(readConfig().collections['main'].protectedTermsFile).toBe('i18n/terms.json');
    expect(readJson(collectionPath())).toEqual([]);
  });
  it('passes pointer and add together to core', async () => {
    writeFileSync(globalPath(), '["iPhone"]');
    await protectedTermsCommand({ file: 'config/terms.json', add: ['Pixel'] });
    expect(readConfig().protectedTermsFile).toBe('config/terms.json');
    expect(readJson(join(projectDir, 'config/terms.json'))).toEqual(['iPhone', 'Pixel']);
    expect(readJson(globalPath())).toEqual(['iPhone']);
    const calls = vi.mocked(ConsoleFormatter.success).mock.invocationCallOrder;
    expect(calls[0]).toBeLessThan(calls[1] ?? 0);
    expect(ConsoleFormatter.success).toHaveBeenNthCalledWith(
      1,
      `Global protected terms file set to ${join(projectDir, 'config/terms.json')}`,
    );
    expect(ConsoleFormatter.success).toHaveBeenNthCalledWith(
      2,
      'Global protected terms updated: iPhone, Pixel (config/terms.json)',
    );
  });
  it('warns when a file write fails after the pointer changes', async () => {
    const destination = join(projectDir, 'config/terms.json');
    mkdirSync(destination);

    await protectedTermsCommand({ file: 'config/terms.json', add: ['Pixel'] });

    expect(ConsoleFormatter.warning).toHaveBeenCalledWith('Protected terms file change was reverted.');
    expect(readConfig().protectedTermsFile).toBeUndefined();
    expect(existsSync(destination)).toBe(true);
    expect(process.exitCode).toBe(1);
  });
  it('warns about a missing named file on list and write', async () => {
    writeConfig({ ...BASE_CONFIG, protectedTermsFile: 'typo.json' });
    await protectedTermsCommand({ list: true });
    await protectedTermsCommand({ add: ['iPhone'] });
    expect(ConsoleFormatter.warning).toHaveBeenCalledTimes(2);
    expect(ConsoleFormatter.warning).toHaveBeenCalledWith(
      `Protected terms file not found: ${join(projectDir, 'typo.json')}. Treating as an empty list.`,
    );
    expect(process.exitCode).not.toBe(1);
  });
  it('reports a malformed terms file without printing success', async () => {
    writeFileSync(globalPath(), '{broken');
    await protectedTermsCommand({ add: ['iPhone'] });
    expect(ConsoleFormatter.error).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    expect(process.exitCode).toBe(1);
    expect(ConsoleFormatter.success).not.toHaveBeenCalled();
    expect(readFileSync(globalPath(), 'utf8')).toBe('{broken');
  });
  it('reports a collection with no terms file', async () => {
    await protectedTermsCommand({ collection: 'main', add: ['iPhone'] });
    expect(ConsoleFormatter.error).toHaveBeenCalledWith(expect.stringContaining('has no protected terms file'));
    expect(process.exitCode).toBe(1);
  });
  it('refuses a collection list edit without a file before printing the preview', async () => {
    writeConfig({ ...BASE_CONFIG, protectedTermsFile: 'missing.json' });
    await protectedTermsCommand({ collection: 'main', list: true, add: ['Pixel'] });
    expect(ConsoleFormatter.warning).not.toHaveBeenCalled();
    expect(ConsoleFormatter.section).not.toHaveBeenCalled();
    expect(ConsoleFormatter.keyValue).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it('does not print a pointer success line when the new view cannot be read', async () => {
    writeFileSync(globalPath(), '{broken');
    await protectedTermsCommand({ collection: 'main', file: 'i18n/terms.json', add: ['Pixel'] });
    expect(ConsoleFormatter.success).not.toHaveBeenCalled();
    expect(ConsoleFormatter.warning).not.toHaveBeenCalledWith('Protected terms file change was reverted.');
    expect(ConsoleFormatter.error).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    expect(readConfig().collections['main'].protectedTermsFile).toBeUndefined();
  });

  it('refuses clearing a collection pointer with a list edit before printing success', async () => {
    withCollectionFile();
    await protectedTermsCommand({ collection: 'main', file: '', add: ['Pixel'] });
    expect(ConsoleFormatter.success).not.toHaveBeenCalled();
    expect(ConsoleFormatter.warning).not.toHaveBeenCalledWith('Protected terms file change was reverted.');
    expect(readConfig().collections['main'].protectedTermsFile).toBe('i18n/terms.json');
    expect(process.exitCode).toBe(1);
  });

  it('reports a malformed list before any list output or write', async () => {
    writeFileSync(globalPath(), '{broken');
    await protectedTermsCommand({ list: true, add: ['Pixel'] });
    expect(ConsoleFormatter.error).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    expect(ConsoleFormatter.section).not.toHaveBeenCalled();
    expect(ConsoleFormatter.success).not.toHaveBeenCalled();
    expect(readFileSync(globalPath(), 'utf8')).toBe('{broken');
  });
});
