import type { ExportRunResult, LingoTrackerConfig } from '@simoncodes-ca/core';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  generateBundles: vi.fn(),
  deleteResource: vi.fn(),
  runExport: vi.fn(),
  addResource: vi.fn(),
}));
const terminalMock = vi.hoisted(() => vi.fn(() => false));
vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return { ...actual, ...coreMocks };
});
vi.mock('./runner/terminal', () => ({ isInteractiveTerminal: terminalMock }));
vi.mock('prompts', () => ({ default: vi.fn() }));

const config: LingoTrackerConfig = {
  baseLocale: 'en',
  locales: ['en'],
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  collections: { main: { translationsFolder: 'translations' } },
  bundles: { core: { bundleName: '{locale}', dist: 'dist/bundles', collections: 'All' } },
};
const exportResult: ExportRunResult = {
  outcome: 'succeeded',
  format: 'json',
  filesCreated: [],
  resourcesExported: 0,
  warnings: [],
  errors: [],
  collections: ['main'],
  locales: [],
  outputDirectory: 'dist/export',
  omittedResources: [],
  malformedFiles: [],
  hierarchicalConflicts: [],
  localeResults: [],
  summary: '',
};
const originalArgv = process.argv;
const originalInitCwd = process.env.INIT_CWD;

async function runCli(...args: string[]): Promise<void> {
  process.argv = ['node', 'lingo-tracker', ...args];
  vi.resetModules();
  await import('./main');
  await vi.waitFor(() => expect(process.exitCode).toBeDefined());
}

function askedNames(): unknown[] {
  const [asked] = vi.mocked(prompts).mock.calls[0] ?? [];
  return (Array.isArray(asked) ? asked : [asked]).map((question) => question?.name);
}

describe('registered empty optional lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    process.env.INIT_CWD = '/project';
    coreMocks.loadConfig.mockReturnValue(config);
    coreMocks.generateBundles.mockResolvedValue({
      outcome: 'succeeded',
      outcomes: [],
      totals: { bundlesProcessed: 0, filesGenerated: 0, warningsCount: 0 },
    });
    coreMocks.deleteResource.mockReturnValue({ entriesDeleted: 1 });
    coreMocks.runExport.mockResolvedValue(exportResult);
    coreMocks.addResource.mockResolvedValue({
      resolvedKey: 'a.b',
      created: true,
      terminology: { findings: [], problems: [] },
    });
    terminalMock.mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (originalInitCwd === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = originalInitCwd;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('prompts for a bundle when --name is empty in a TTY', async () => {
    vi.mocked(prompts).mockResolvedValue({ bundleOrAll: 'core' });
    await runCli('bundle', '--name', '');
    expect(askedNames()).toContain('bundleOrAll');
    expect(coreMocks.generateBundles).toHaveBeenCalledWith(config, expect.objectContaining({ names: ['core'] }));
    expect(process.exitCode).toBe(0);
  });

  it('prompts for deletion keys when --key is empty in a TTY', async () => {
    vi.mocked(prompts).mockResolvedValue({ key: ' a.b, , ' });
    await runCli('delete-resource', '--key', '', '--yes');
    expect(askedNames()).toContain('key');
    expect(coreMocks.deleteResource).toHaveBeenCalledWith(expect.objectContaining({ name: 'main' }), { keys: ['a.b'] });
    expect(process.exitCode).toBe(0);
  });

  it('keeps the missing-key diagnostic when --key is empty outside a TTY', async () => {
    terminalMock.mockReturnValue(false);
    await runCli('delete-resource', '--key', '', '--yes');
    expect(console.error).toHaveBeenCalledWith('❌ Missing required options in non-interactive mode: --key');
    expect(coreMocks.deleteResource).not.toHaveBeenCalled();
    expect(prompts).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ['-c', 'collections'],
    ['-l', 'locales'],
    ['-t', 'tags'],
  ])('prompts for an empty export %s flag in a TTY', async (flag, questionName) => {
    vi.mocked(prompts).mockResolvedValue({
      collections: ['__ALL__'],
      locales: ['__ALL__'],
      statusFilter: ['new'],
      tags: ' a, b ',
    });
    await runCli('export', '--format', 'json', flag, '');
    expect(askedNames()).toContain(questionName);
    expect(coreMocks.runExport).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ tags: ['a', 'b'] }));
    expect(process.exitCode).toBe(0);
  });

  it('prompts for resource tags when --tags is empty in a TTY', async () => {
    vi.mocked(prompts).mockResolvedValue({ tags: ' a, b ' });
    await runCli('add-resource', '--key', 'a.b', '--value', 'OK', '--tags', '');
    expect(askedNames()).toContain('tags');
    expect(coreMocks.addResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'main' }),
      expect.objectContaining({ tags: ['a', 'b'] }),
      { onExisting: 'fail' },
    );
    expect(process.exitCode).toBe(0);
  });

  it('does not prompt for a comma-only bundle name in a TTY', async () => {
    await runCli('bundle', '--name', ' , ');
    expect(prompts).not.toHaveBeenCalled();
    expect(coreMocks.generateBundles).toHaveBeenCalledWith(config, expect.objectContaining({ names: undefined }));
    expect(process.exitCode).toBe(0);
  });

  it.each([true, false])('rejects comma-only deletion keys without prompting (TTY: %j)', async (interactive) => {
    terminalMock.mockReturnValue(interactive);
    await runCli('delete-resource', '--key', ' , ', '--yes');
    expect(prompts).not.toHaveBeenCalled();
    expect(coreMocks.deleteResource).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ No valid keys provided.');
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ['-c', 'collections'],
    ['-l', 'locales'],
    ['-t', 'tags'],
  ])('does not prompt for comma-only export %s in a TTY', async (flag, questionName) => {
    vi.mocked(prompts).mockResolvedValue({ collections: ['__ALL__'], locales: ['__ALL__'] });
    await runCli('export', '--format', 'json', '--status', 'new', flag, ' , ');
    expect(askedNames()).not.toContain(questionName);
    expect(coreMocks.runExport).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ locales: undefined, tags: undefined }),
    );
    expect(process.exitCode).toBe(0);
  });

  it('does not prompt for comma-only resource tags in a TTY', async () => {
    vi.mocked(prompts).mockResolvedValue({});
    await runCli('add-resource', '--key', 'a.b', '--value', 'OK', '--tags', ' , ');
    expect(askedNames()).not.toContain('tags');
    expect(coreMocks.addResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'main' }),
      expect.objectContaining({ tags: undefined }),
      { onExisting: 'fail' },
    );
    expect(process.exitCode).toBe(0);
  });
});
