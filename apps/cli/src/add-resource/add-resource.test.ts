import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addResourceCommand } from './add-resource';
import * as fs from 'node:fs';
import prompts from 'prompts';

// Mock prompts to avoid interactive input
vi.mock('prompts', () => ({
  default: vi.fn(),
}));

vi.mock('node:fs');
vi.mock('@simoncodes-ca/core', () => ({
  CONFIG_FILENAME: '.lingo-tracker.json',
  addResource: vi.fn().mockResolvedValue({ resolvedKey: 'test.key', created: true }),
  resolveResourceKey: vi.fn((key: string, targetFolder?: string) => {
    return targetFolder ? `${targetFolder}.${key}` : key;
  }),
  splitResolvedKey: vi.fn((key: string) => {
    const parts = key.split('.');
    const entryKey = parts.pop() || key;
    return { folderPath: parts, entryKey };
  }),
}));

describe('addResourceCommand', () => {
  beforeEach(() => {
    process.env.INIT_CWD = '/test';
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });
    vi.mocked(prompts).mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.INIT_CWD;
  });

  it('should show error when config file does not exist', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    await addResourceCommand({
      collection: 'test-collection',
      key: 'buttons.ok',
      value: 'OK',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No Lingo Tracker configuration found')
    );

    consoleSpy.mockRestore();
  });

  it('should validate key format - config check happens first', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    // Invalid key, but config doesn't exist so that error comes first
    await addResourceCommand({
      collection: 'test-collection',
      key: 'invalid key with spaces',
      value: 'Test',
    });

    // Config error is checked before key validation
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No Lingo Tracker configuration found')
    );

    consoleSpy.mockRestore();
  });

  it('should handle command with all parameters', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    await addResourceCommand({
      collection: 'test-collection',
      key: 'buttons.ok',
      value: 'OK',
      comment: 'Ok button',
      tags: 'ui,buttons',
      targetFolder: 'common',
    });

    // Command should execute (config doesn't exist, but parameters are valid and will be parsed)
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should show error when collection does not exist', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const config = {
      collections: {
        ExistingCollection: { translationsFolder: 'translations' },
      },
    };
    vi.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path.includes('.lingo-tracker.json')) {
        return JSON.stringify(config);
      }
      throw new Error('File not found');
    });

    await addResourceCommand({
      collection: 'NonExistentCollection',
      key: 'buttons.ok',
      value: 'OK',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Collection "NonExistentCollection" not found')
    );

    consoleSpy.mockRestore();
  });

  it('should handle translations array format', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const { addResource } = await import('@simoncodes-ca/core');
    const config = {
      collections: {
        TestCollection: {
          translationsFolder: 'translations',
          baseLocale: 'en',
          locales: ['en', 'fr-ca', 'es'],
        },
      },
      baseLocale: 'en',
      locales: ['en', 'fr-ca', 'es'],
    };
    vi.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path.includes('.lingo-tracker.json')) {
        return JSON.stringify(config);
      }
      throw new Error('File not found');
    });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'buttons.ok',
      value: 'OK',
      translations: [
        { locale: 'fr-ca', value: 'D\'accord', status: 'translated' },
        { locale: 'es', value: 'Aceptar', status: 'verified' },
      ],
    });

    // Should call addResource with translations array
    expect(addResource).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        translations: expect.arrayContaining([
          expect.objectContaining({ locale: 'fr-ca', value: 'D\'accord', status: 'translated' }),
          expect.objectContaining({ locale: 'es', value: 'Aceptar', status: 'verified' }),
        ]),
      }),
      expect.any(Object)
    );

    consoleSpy.mockRestore();
  });

  it('should prompt for overwrite confirmation when resource exists in interactive mode', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const config = {
      collections: {
        TestCollection: {
          translationsFolder: 'translations',
          baseLocale: 'en',
        },
      },
      baseLocale: 'en',
    };
    vi.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path.includes('.lingo-tracker.json')) {
        return JSON.stringify(config);
      }
      if (path.includes('resource_entries.json')) {
        return JSON.stringify({ ok: { source: 'OK' } });
      }
      throw new Error('File not found');
    });
    
    // Mock resource file exists and contains the entry
    vi.mocked(fs.existsSync).mockImplementation((path: string) => {
      return path.includes('resource_entries.json');
    });

    // Mock TTY to simulate interactive mode
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
    });

    // Mock prompt to return false (user cancels)
    vi.mocked(prompts).mockResolvedValueOnce({ value: false });

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'buttons.ok',
      value: 'OK',
    });

    expect(prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        message: expect.stringContaining('already exists'),
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Add resource cancelled')
    );

    // Restore
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
    });

    consoleSpy.mockRestore();
  });

  it('should create entries for all locales when no translations provided', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const { addResource } = await import('@simoncodes-ca/core');
    const config = {
      collections: {
        TestCollection: {
          translationsFolder: 'translations',
          baseLocale: 'en',
          locales: ['en', 'fr-ca', 'es', 'de'],
        },
      },
      baseLocale: 'en',
      locales: ['en', 'fr-ca', 'es', 'de'],
    };
    vi.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path.includes('.lingo-tracker.json')) {
        return JSON.stringify(config);
      }
      throw new Error('File not found');
    });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Mock non-interactive mode
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
    });

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'buttons.ok',
      value: 'OK',
    });

    // Should call addResource with translations for all non-base locales
    expect(addResource).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        translations: expect.arrayContaining([
          expect.objectContaining({ locale: 'fr-ca', value: 'OK', status: 'new' }),
          expect.objectContaining({ locale: 'es', value: 'OK', status: 'new' }),
          expect.objectContaining({ locale: 'de', value: 'OK', status: 'new' }),
        ]),
      }),
      expect.any(Object)
    );

    // Restore
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
    });

    consoleSpy.mockRestore();
  });
});
