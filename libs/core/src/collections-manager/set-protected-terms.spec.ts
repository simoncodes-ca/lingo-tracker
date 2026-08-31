import { describe, it, expect, beforeEach, vi } from 'vitest';
import { noop } from 'lodash';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SafeAny } from '../constants';
import { clearProtectedTermsFileCache } from '../lib/config/protected-terms-file';
import {
  setGlobalProtectedTerms,
  setCollectionProtectedTerms,
  setGlobalProtectedTermsFile,
  setCollectionProtectedTermsFile,
} from './set-protected-terms';

vi.mock('node:fs');
vi.mock('./add-locale-to-collection', () => ({
  addLocaleToCollection: vi.fn().mockResolvedValue({ message: 'ok', entriesBackfilled: 0, filesUpdated: 0 }),
}));
vi.mock('./remove-locale-from-collection', () => ({
  removeLocaleFromCollection: vi.fn().mockResolvedValue({ message: 'ok', entriesPurged: 0, filesUpdated: 0 }),
}));

const CONFIG_PATH = path.resolve('/test', '.lingo-tracker.json');
const DEFAULT_TERMS_PATH = path.resolve('/test', '.lingo-tracker-protected-terms.json');

describe('set-protected-terms', () => {
  const baseConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en', 'es'],
    collections: {
      myApp: {
        translationsFolder: './i18n',
        locales: ['en', 'es'],
        tags: ['feature-a'],
      },
    },
  } as SafeAny;

  /** Contents of the last write to `filePath`, parsed. */
  const writtenTo = (filePath: string): SafeAny => {
    const call = vi
      .mocked(fs.writeFileSync)
      .mock.calls.filter((c) => c[0] === filePath)
      .at(-1);
    expect(call).toBeDefined();
    return JSON.parse(call?.[1] as string);
  };

  /**
   * Stubs the filesystem: `files` maps a path to the JSON it reads back, `config` overrides
   * the config file's contents. Any path without a `.json` suffix is treated as an existing
   * directory, so writes never trip the missing-parent guard.
   */
  const givenFiles = (files: Record<string, unknown> = {}, config: SafeAny = baseConfig): void => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === CONFIG_PATH || (p as string) in files || !String(p).endsWith('.json'),
    );
    vi.mocked(fs.readFileSync).mockImplementation(((p: string) => {
      if (p === CONFIG_PATH) return JSON.stringify(config, null, 2);
      if (p in files) return JSON.stringify(files[p]);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as SafeAny);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearProtectedTermsFileCache();
    vi.mocked(fs.writeFileSync).mockImplementation(noop);
    givenFiles({});
  });

  describe('setGlobalProtectedTerms', () => {
    it('writes the list to the default file, normalized and sorted', () => {
      const result = setGlobalProtectedTerms([' Node.js ', 'iPhone', 'iPhone'], { cwd: '/test' });

      expect(result.filePath).toBe(DEFAULT_TERMS_PATH);
      expect(writtenTo(DEFAULT_TERMS_PATH)).toEqual(['iPhone', 'Node.js']);
    });

    it('never touches the config file', () => {
      setGlobalProtectedTerms(['iPhone'], { cwd: '/test' });

      const configWrites = vi.mocked(fs.writeFileSync).mock.calls.filter((c) => c[0] === CONFIG_PATH);
      expect(configWrites).toHaveLength(0);
    });

    it('writes an empty array rather than deleting the file when the list is cleared', () => {
      givenFiles({ [DEFAULT_TERMS_PATH]: ['iPhone'] });

      setGlobalProtectedTerms([], { cwd: '/test' });

      expect(writtenTo(DEFAULT_TERMS_PATH)).toEqual([]);
      expect(vi.mocked(fs.unlinkSync)).not.toHaveBeenCalled();
    });

    it('ends the file with a trailing newline', () => {
      setGlobalProtectedTerms(['iPhone'], { cwd: '/test' });

      const call = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
      expect(call?.[1]).toBe('[\n  "iPhone"\n]\n');
    });
  });

  describe('setCollectionProtectedTerms', () => {
    it('writes to the collection file when one is configured', () => {
      const collectionTermsPath = path.resolve('/test', 'i18n/terms.json');
      givenFiles(
        { [collectionTermsPath]: [] },
        {
          ...baseConfig,
          collections: { myApp: { ...baseConfig.collections.myApp, protectedTermsFile: 'i18n/terms.json' } },
        },
      );

      const result = setCollectionProtectedTerms('myApp', ['iPhone', ' Node.js '], { cwd: '/test' });

      expect(result.filePath).toBe(collectionTermsPath);
      expect(writtenTo(collectionTermsPath)).toEqual(['iPhone', 'Node.js']);
    });

    it('throws when the collection has no protected terms file', () => {
      expect(() => setCollectionProtectedTerms('myApp', ['iPhone'], { cwd: '/test' })).toThrow(
        'has no protected terms file',
      );
    });

    it('throws when the collection does not exist', () => {
      expect(() => setCollectionProtectedTerms('nope', ['iPhone'], { cwd: '/test' })).toThrow(
        'Collection "nope" not found',
      );
    });
  });

  describe('setGlobalProtectedTermsFile', () => {
    it('stores the pointer in config and carries existing terms into the new file', () => {
      const newPath = path.resolve('/test', 'config/terms.json');
      givenFiles({ [DEFAULT_TERMS_PATH]: ['iPhone'] });

      const result = setGlobalProtectedTermsFile('config/terms.json', { cwd: '/test' });

      expect(result.filePath).toBe(newPath);
      expect(writtenTo(CONFIG_PATH).protectedTermsFile).toBe('config/terms.json');
      expect(writtenTo(newPath)).toEqual(['iPhone']);
    });

    it('clears the pointer when passed undefined', () => {
      setGlobalProtectedTermsFile(undefined, { cwd: '/test' });

      expect(writtenTo(CONFIG_PATH).protectedTermsFile).toBeUndefined();
    });

    it('leaves the config untouched when the target directory does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === CONFIG_PATH);

      expect(() => setGlobalProtectedTermsFile('nope/terms.json', { cwd: '/test' })).toThrow(
        'directory does not exist',
      );
      expect(vi.mocked(fs.writeFileSync).mock.calls.filter((c) => c[0] === CONFIG_PATH)).toHaveLength(0);
    });
  });

  describe('setCollectionProtectedTermsFile', () => {
    it('stores the pointer on the collection and creates the file', async () => {
      const newPath = path.resolve('/test', 'i18n/terms.json');

      const result = await setCollectionProtectedTermsFile('myApp', 'i18n/terms.json', { cwd: '/test' });

      expect(result.filePath).toBe(newPath);
      expect(writtenTo(CONFIG_PATH).collections.myApp.protectedTermsFile).toBe('i18n/terms.json');
      expect(writtenTo(newPath)).toEqual([]);
    });

    it('clears the pointer when passed undefined', async () => {
      const result = await setCollectionProtectedTermsFile('myApp', undefined, { cwd: '/test' });

      expect(result.filePath).toBeUndefined();
      expect(writtenTo(CONFIG_PATH).collections.myApp.protectedTermsFile).toBeUndefined();
    });

    it('throws when the collection does not exist', async () => {
      await expect(setCollectionProtectedTermsFile('nope', 'terms.json', { cwd: '/test' })).rejects.toThrow(
        'Collection "nope" not found',
      );
    });

    it('leaves the config untouched when the target directory does not exist', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === CONFIG_PATH);

      await expect(setCollectionProtectedTermsFile('myApp', 'nope/terms.json', { cwd: '/test' })).rejects.toThrow(
        'directory does not exist',
      );
      expect(vi.mocked(fs.writeFileSync).mock.calls.filter((c) => c[0] === CONFIG_PATH)).toHaveLength(0);
    });
  });
});
