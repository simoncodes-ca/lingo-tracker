import { resolve } from 'node:path';
import { ConfigNotFoundError, deleteResource, loadConfig } from '@simoncodes-ca/core';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInteractiveTerminal } from '../runner/terminal';
import { deleteResourceCommand } from './delete-resource';

vi.mock('prompts');
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false) }));
vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return { ...actual, loadConfig: vi.fn(), deleteResource: vi.fn() };
});

const mockDeleteResource = vi.mocked(deleteResource);
const mockPrompts = vi.mocked(prompts);

const mockConfig = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: {
    default: { translationsFolder: 'src/i18n' },
  },
};

const expectedCollection = expect.objectContaining({
  name: 'default',
  translationsFolder: resolve('/test/project', 'src/i18n'),
});

describe('deleteResourceCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/test/project';
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
    vi.mocked(isInteractiveTerminal).mockReturnValue(false);
    mockDeleteResource.mockReturnValue({ outcome: 'succeeded', entriesDeleted: 1 });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('deletes a single resource and exits 0', async () => {
    await deleteResourceCommand({ collection: 'default', key: ['apps.common.buttons.ok'], yes: true });

    expect(mockDeleteResource).toHaveBeenCalledWith(expectedCollection, { keys: ['apps.common.buttons.ok'] });
    expect(process.exitCode).toBe(0);
  });

  it('trims comma-separated keys and drops empty ones', async () => {
    await deleteResourceCommand({
      collection: 'default',
      key: ['apps.common.buttons.ok', 'apps.common.buttons.cancel'],
      yes: true,
    });

    expect(mockDeleteResource).toHaveBeenCalledWith(expectedCollection, {
      keys: ['apps.common.buttons.ok', 'apps.common.buttons.cancel'],
    });
  });

  it('exits 1 when some keys could not be deleted', async () => {
    mockDeleteResource.mockReturnValue({
      outcome: 'failed',
      entriesDeleted: 1,
      errors: [{ key: 'apps.common.invalid', error: 'Resource not found' }],
    });

    await deleteResourceCommand({ collection: 'default', key: ['apps.common.ok', 'apps.common.invalid'], yes: true });

    expect(mockDeleteResource).toHaveBeenCalledWith(expectedCollection, {
      keys: ['apps.common.ok', 'apps.common.invalid'],
    });
    expect(console.error).toHaveBeenCalledWith('❌ Errors (1):');
    expect(console.error).toHaveBeenCalledWith('  - apps.common.invalid: Resource not found');
    expect(process.exitCode).toBe(1);
  });

  it('warns on zero deletions and exits 1 for the key that failed', async () => {
    mockDeleteResource.mockReturnValue({
      outcome: 'failed',
      entriesDeleted: 0,
      errors: [{ key: 'apps.common.notfound', error: 'Resource not found' }],
    });

    await deleteResourceCommand({ collection: 'default', key: ['apps.common.notfound'], yes: true });

    expect(mockDeleteResource).toHaveBeenCalledWith(expectedCollection, { keys: ['apps.common.notfound'] });
    expect(console.error).toHaveBeenCalledWith('⚠️  No resources were deleted.');
    expect(process.exitCode).toBe(1);
  });

  it('deletes several comma-separated keys in one call', async () => {
    await deleteResourceCommand({
      collection: 'default',
      key: ['apps.common.buttons.ok', 'apps.common.buttons.cancel', 'apps.common.buttons.save'],
      yes: true,
    });

    expect(mockDeleteResource).toHaveBeenCalledWith(expectedCollection, {
      keys: ['apps.common.buttons.ok', 'apps.common.buttons.cancel', 'apps.common.buttons.save'],
    });
    expect(console.log).toHaveBeenCalledWith('✅ Deleted 1 resource(s)');
  });

  it('exits 1 when core throws', async () => {
    mockDeleteResource.mockImplementation(() => {
      throw new Error('disk full');
    });

    await deleteResourceCommand({ collection: 'default', key: ['a.b'], yes: true });

    expect(console.error).toHaveBeenCalledWith('❌ disk full');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 without deleting when the config is missing', async () => {
    vi.mocked(loadConfig).mockImplementation(() => {
      throw new ConfigNotFoundError('/test/project/.lingo-tracker.json');
    });

    await deleteResourceCommand({ collection: 'default', key: ['a.b'], yes: true });

    expect(mockDeleteResource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 without deleting when the collection does not exist', async () => {
    await deleteResourceCommand({ collection: 'nonexistent', key: ['a.b'], yes: true });

    expect(mockDeleteResource).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ Collection "nonexistent" not found');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when --key is missing in non-interactive mode', async () => {
    await deleteResourceCommand({ collection: 'default' });

    expect(mockDeleteResource).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ Missing required options in non-interactive mode: --key');
    expect(process.exitCode).toBe(1);
  });

  describe('interactive', () => {
    beforeEach(() => {
      vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    });

    it('asks for the key, then for confirmation', async () => {
      mockPrompts.mockResolvedValueOnce({ key: ' a.b, , ' }).mockResolvedValueOnce({ confirmed: true });

      await deleteResourceCommand({ collection: 'default' });

      expect(mockDeleteResource).toHaveBeenCalledWith(expectedCollection, { keys: ['a.b'] });
      expect(process.exitCode).toBe(0);
    });

    it('declining the confirmation cancels with exit 0', async () => {
      mockPrompts.mockResolvedValueOnce({ confirmed: false });

      await deleteResourceCommand({ collection: 'default', key: ['a.b'] });

      expect(mockDeleteResource).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('❌ Delete resource cancelled.');
      expect(process.exitCode).toBe(0);
    });

    it('--yes skips the confirmation', async () => {
      await deleteResourceCommand({ collection: 'default', key: ['a.b'], yes: true });

      expect(mockPrompts).not.toHaveBeenCalled();
      expect(mockDeleteResource).toHaveBeenCalled();
    });
  });
});
