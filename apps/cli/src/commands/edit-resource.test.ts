import { resolve } from 'node:path';
import { ConfigNotFoundError, editResource, loadConfig } from '@simoncodes-ca/core';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInteractiveTerminal } from '../runner/terminal';
import { editResourceCommand } from './edit-resource';

vi.mock('prompts');
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false) }));
vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
    editResource: vi.fn(),
  };
});

const mockEditResource = vi.mocked(editResource);

describe('editResourceCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/test/project';
    process.exitCode = undefined;
    vi.mocked(isInteractiveTerminal).mockReturnValue(false);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  const mockConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: {
      default: {
        translationsFolder: 'src/i18n',
        baseLocale: 'en',
      },
    },
  };

  it('should update a resource successfully', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
    mockEditResource.mockResolvedValue({
      resolvedKey: 'apps.common.buttons.ok',
      updated: true,
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok',
      baseValue: 'OK Updated',
    };

    await editResourceCommand(options);

    expect(mockEditResource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'default',
        translationsFolder: resolve('/test/project', 'src/i18n'),
        baseLocale: 'en',
      }),
      'apps.common.buttons.ok',
      expect.objectContaining({
        baseValue: 'OK Updated',
      }),
    );
  });

  it('should handle no changes detected', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
    mockEditResource.mockResolvedValue({
      resolvedKey: 'apps.common.buttons.ok',
      updated: false,
      message: 'No changes detected',
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok',
      baseValue: 'OK',
    };

    await editResourceCommand(options);

    expect(mockEditResource).toHaveBeenCalled();
  });

  it('should update comment and tags', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
    mockEditResource.mockResolvedValue({
      resolvedKey: 'apps.common.buttons.ok',
      updated: true,
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok',
      comment: 'New comment',
      tags: ['ui', 'buttons'],
    };

    await editResourceCommand(options);

    expect(mockEditResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'default', translationsFolder: resolve('/test/project', 'src/i18n') }),
      'apps.common.buttons.ok',
      expect.objectContaining({
        comment: 'New comment',
        tags: ['ui', 'buttons'],
      }),
    );
  });

  it('should update locale value', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
    mockEditResource.mockResolvedValue({
      resolvedKey: 'apps.common.buttons.ok',
      updated: true,
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok',
      locale: 'fr',
      localeValue: "D'accord",
    };

    await editResourceCommand(options);

    expect(mockEditResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'default', translationsFolder: resolve('/test/project', 'src/i18n') }),
      'apps.common.buttons.ok',
      expect.objectContaining({
        translations: {
          fr: { value: "D'accord" },
        },
      }),
    );
  });

  it('should warn if locale provided without value', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);

    const stderrSpy = vi.spyOn(console, 'error');

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok',
      locale: 'fr',
      // Missing localeValue
    };

    await editResourceCommand(options);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Both --locale and --localeValue must be provided'));
    expect(mockEditResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'default' }),
      'apps.common.buttons.ok',
      expect.not.objectContaining({
        translations: expect.anything(),
      }),
    );
  });

  it('should not update if config does not exist', async () => {
    vi.mocked(loadConfig).mockImplementation(() => {
      throw new ConfigNotFoundError('/test/project/.lingo-tracker.json');
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok',
    };

    await editResourceCommand(options);

    expect(mockEditResource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should not update if collection does not exist', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);

    const options = {
      collection: 'nonexistent',
      key: 'apps.common.buttons.ok',
    };

    await editResourceCommand(options);

    expect(mockEditResource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should prompt for baseValue if not provided', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
    mockEditResource.mockResolvedValue({
      resolvedKey: 'apps.common.buttons.ok',
      updated: true,
    });

    // Mock prompts to return baseValue
    const promptsMock = vi.mocked(prompts);
    promptsMock.mockResolvedValueOnce({
      baseValue: 'Promped Value',
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok',
    };

    vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    await editResourceCommand(options);

    expect(promptsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'baseValue',
          type: 'text',
        }),
      ]),
      expect.any(Object),
    );

    expect(mockEditResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'default', translationsFolder: resolve('/test/project', 'src/i18n') }),
      'apps.common.buttons.ok',
      expect.objectContaining({
        baseValue: 'Promped Value',
      }),
    );
  });

  it('maps --target-folder to moveTo', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
    mockEditResource.mockResolvedValue({ resolvedKey: 'shared.ok', updated: true });

    await editResourceCommand({
      collection: 'default',
      key: 'apps.common.buttons.ok',
      targetFolder: 'shared',
    });

    expect(mockEditResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'default' }),
      'apps.common.buttons.ok',
      expect.objectContaining({ moveTo: 'shared' }),
    );
  });

  it('prints the core error and exits 1 when core throws', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
    mockEditResource.mockRejectedValue(new Error('Resource not found: apps.missing'));

    await editResourceCommand({ collection: 'default', key: 'apps.missing', baseValue: 'x' });

    expect(console.error).toHaveBeenCalledWith('❌ Resource not found: apps.missing');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when --key is missing in non-interactive mode', async () => {
    vi.mocked(loadConfig).mockReturnValue(mockConfig);

    await editResourceCommand({ collection: 'default', baseValue: 'x' });

    expect(mockEditResource).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ Missing required options in non-interactive mode: --key');
    expect(process.exitCode).toBe(1);
  });

  describe('preferred terminology', () => {
    const terminology = {
      findings: [
        {
          key: 'budget.title',
          discouraged: 'Expenditure',
          preferred: 'Investment',
          reason: 'Finance style guide',
          message: 'consider "Investment" instead of "Expenditure"',
        },
      ],
      problems: [],
    };

    beforeEach(() => {
      vi.mocked(loadConfig).mockReturnValue(mockConfig);
    });

    const logged = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((call) => String(call[0]));

    it('prints the findings core returned for the new base value after a successful edit', async () => {
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockEditResource.mockResolvedValue({ resolvedKey: 'budget.title', updated: true, terminology });

      await editResourceCommand({ collection: 'default', key: 'budget.title', baseValue: 'Capital expenditure' });

      expect(logged(stderrSpy)).toContain('⚠️  Preferred terminology: consider "Investment" instead of "Expenditure"');
      expect(logged(stderrSpy)).toContain('  Finance style guide');
      expect(process.exitCode).toBe(0);
      stderrSpy.mockRestore();
    });

    it('prints nothing when the result carries no terminology (no base value in the edit)', async () => {
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockEditResource.mockResolvedValue({ resolvedKey: 'budget.title', updated: true });

      await editResourceCommand({
        collection: 'default',
        key: 'budget.title',
        baseValue: '',
        locale: 'fr',
        localeValue: 'Expenditure',
      });

      expect(logged(stderrSpy).some((line) => line.includes('Preferred terminology'))).toBe(false);
      stderrSpy.mockRestore();
    });

    it('prints one warning per rule-file problem', async () => {
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockEditResource.mockResolvedValue({
        resolvedKey: 'budget.title',
        updated: true,
        terminology: { findings: [], problems: ['Preferred terminology checks skipped: not valid JSON'] },
      });

      await editResourceCommand({ collection: 'default', key: 'budget.title', baseValue: 'Capital expenditure' });

      const lines = logged(stderrSpy);
      expect(lines).toContain('⚠️  Preferred terminology checks skipped: not valid JSON');
      expect(lines.filter((line) => line.includes('Preferred terminology'))).toHaveLength(1);
      stderrSpy.mockRestore();
    });
  });
});
