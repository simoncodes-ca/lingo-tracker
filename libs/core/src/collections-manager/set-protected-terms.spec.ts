import { describe, it, expect, beforeEach, vi } from 'vitest';
import { noop } from 'lodash';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SafeAny } from '../constants';
import { setGlobalProtectedTerms, setCollectionProtectedTerms } from './set-protected-terms';

vi.mock('node:fs');
vi.mock('./add-locale-to-collection', () => ({
  addLocaleToCollection: vi.fn().mockResolvedValue({ message: 'ok', entriesBackfilled: 0, filesUpdated: 0 }),
}));
vi.mock('./remove-locale-from-collection', () => ({
  removeLocaleFromCollection: vi.fn().mockResolvedValue({ message: 'ok', entriesPurged: 0, filesUpdated: 0 }),
}));

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

  const lastWritten = (): SafeAny => {
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
    return JSON.parse(writeCall?.[1] as string);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(baseConfig, null, 2) as SafeAny);
    vi.mocked(fs.writeFileSync).mockImplementation(noop);
  });

  describe('setGlobalProtectedTerms', () => {
    it('persists the global list normalized, leaving collections untouched', () => {
      setGlobalProtectedTerms([' iPhone ', 'iPhone', 'Node.js'], { cwd: '/test' });

      const written = lastWritten();
      expect(written.protectedTerms).toEqual(['iPhone', 'Node.js']);
      expect(written.collections).toEqual(baseConfig.collections);
      expect(written.exportFolder).toBe(baseConfig.exportFolder);
    });

    it('drops the global key when the list is empty', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ ...baseConfig, protectedTerms: ['iPhone'] }, null, 2) as SafeAny,
      );

      setGlobalProtectedTerms([], { cwd: '/test' });

      expect(lastWritten().protectedTerms).toBeUndefined();
    });

    it('writes to the expected config path', () => {
      setGlobalProtectedTerms(['iPhone'], { cwd: '/project' });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
      expect(writeCall?.[0]).toBe(path.resolve('/project', '.lingo-tracker.json'));
    });
  });

  describe('setCollectionProtectedTerms', () => {
    it('round-trips a collection list verbatim (casing/punctuation preserved)', async () => {
      await setCollectionProtectedTerms('myApp', ['iPhone', ' Node.js '], { cwd: '/test' });

      const written = lastWritten();
      expect(written.collections.myApp.protectedTerms).toEqual(['iPhone', 'Node.js']);
      expect(written.collections.myApp.translationsFolder).toBe('./i18n');
    });

    it('drops the collection key when the list is empty', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(
          {
            ...baseConfig,
            collections: {
              myApp: { translationsFolder: './i18n', protectedTerms: ['iPhone'] },
            },
          },
          null,
          2,
        ) as SafeAny,
      );

      await setCollectionProtectedTerms('myApp', [], { cwd: '/test' });

      expect(lastWritten().collections.myApp.protectedTerms).toBeUndefined();
    });

    it('throws when the collection does not exist', async () => {
      await expect(setCollectionProtectedTerms('nope', ['iPhone'], { cwd: '/test' })).rejects.toThrow(
        'Collection "nope" not found',
      );
    });
  });
});
