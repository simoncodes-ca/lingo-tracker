import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadResourceTree } from './load-resource-tree';
import type * as fs from 'node:fs';

const mockFs = vi.hoisted(() => {
  return new Map<string, string | 'directory'>([
    // Root directory and files
    ['/test/translations', 'directory'],
    ['/test/translations/resource_entries.json', JSON.stringify({
      title: {
        source: 'App Title',
        es: 'Título de la Aplicación',
        fr: "Titre de l'Application"
      }
    })],
    ['/test/translations/tracker_meta.json', JSON.stringify({
      title: {
        en: { checksum: 'abc123' },
        es: { status: 'translated', checksum: 'def456', baseChecksum: 'abc123' },
        fr: { status: 'stale', checksum: 'ghi789', baseChecksum: 'abc123' }
      }
    })],

    // apps directory
    ['/test/translations/apps', 'directory'],

    // apps/common directory and files
    ['/test/translations/apps/common', 'directory'],
    ['/test/translations/apps/common/resource_entries.json', JSON.stringify({
      header: {
        source: 'Common Header',
        es: 'Encabezado Común',
        fr: 'En-tête Commun',
        tags: ['ui', 'common'],
        comment: 'Main header text'
      }
    })],
    ['/test/translations/apps/common/tracker_meta.json', JSON.stringify({
      header: {
        en: { checksum: 'aaa111' },
        es: { status: 'verified', checksum: 'bbb222', baseChecksum: 'aaa111' },
        fr: { status: 'translated', checksum: 'ccc333', baseChecksum: 'aaa111' }
      }
    })],

    // apps/common/buttons directory and files
    ['/test/translations/apps/common/buttons', 'directory'],
    ['/test/translations/apps/common/buttons/resource_entries.json', JSON.stringify({
      ok: {
        source: 'OK',
        es: 'Aceptar',
        fr: "D'accord"
      },
      cancel: {
        source: 'Cancel',
        es: 'Cancelar',
        fr: 'Annuler',
        tags: ['button']
      }
    })],
    ['/test/translations/apps/common/buttons/tracker_meta.json', JSON.stringify({
      ok: {
        en: { checksum: 'ok111' },
        es: { status: 'verified', checksum: 'ok222', baseChecksum: 'ok111' },
        fr: { status: 'translated', checksum: 'ok333', baseChecksum: 'ok111' }
      },
      cancel: {
        en: { checksum: 'can111' },
        es: { status: 'translated', checksum: 'can222', baseChecksum: 'can111' },
        fr: { status: 'new', checksum: '', baseChecksum: 'can111' }
      }
    })]
  ]);
});

const createMockFileSystem = () => {
  return new Map<string, string | 'directory'>([
    // Root directory and files
    ['/test/translations', 'directory'],
    ['/test/translations/resource_entries.json', JSON.stringify({
      title: {
        source: 'App Title',
        es: 'Título de la Aplicación',
        fr: "Titre de l'Application"
      }
    })],
    ['/test/translations/tracker_meta.json', JSON.stringify({
      title: {
        en: { checksum: 'abc123' },
        es: { status: 'translated', checksum: 'def456', baseChecksum: 'abc123' },
        fr: { status: 'stale', checksum: 'ghi789', baseChecksum: 'abc123' }
      }
    })],

    // apps directory
    ['/test/translations/apps', 'directory'],

    // apps/common directory and files
    ['/test/translations/apps/common', 'directory'],
    ['/test/translations/apps/common/resource_entries.json', JSON.stringify({
      header: {
        source: 'Common Header',
        es: 'Encabezado Común',
        fr: 'En-tête Commun',
        tags: ['ui', 'common'],
        comment: 'Main header text'
      }
    })],
    ['/test/translations/apps/common/tracker_meta.json', JSON.stringify({
      header: {
        en: { checksum: 'aaa111' },
        es: { status: 'verified', checksum: 'bbb222', baseChecksum: 'aaa111' },
        fr: { status: 'translated', checksum: 'ccc333', baseChecksum: 'aaa111' }
      }
    })],

    // apps/common/buttons directory and files
    ['/test/translations/apps/common/buttons', 'directory'],
    ['/test/translations/apps/common/buttons/resource_entries.json', JSON.stringify({
      ok: {
        source: 'OK',
        es: 'Aceptar',
        fr: "D'accord"
      },
      cancel: {
        source: 'Cancel',
        es: 'Cancelar',
        fr: 'Annuler',
        tags: ['button']
      }
    })],
    ['/test/translations/apps/common/buttons/tracker_meta.json', JSON.stringify({
      ok: {
        en: { checksum: 'ok111' },
        es: { status: 'verified', checksum: 'ok222', baseChecksum: 'ok111' },
        fr: { status: 'translated', checksum: 'ok333', baseChecksum: 'ok111' }
      },
      cancel: {
        en: { checksum: 'can111' },
        es: { status: 'translated', checksum: 'can222', baseChecksum: 'can111' },
        fr: { status: 'new', checksum: '', baseChecksum: 'can111' }
      }
    })]
  ]);
};

vi.mock('node:fs', () => ({
  existsSync: vi.fn((filePath: fs.PathLike) => {
    return mockFs.has(filePath.toString());
  }),
  readFileSync: vi.fn((filePath: fs.PathLike) => {
    const content = mockFs.get(filePath.toString());
    if (content === 'directory' || content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    return content;
  }),
  realpathSync: vi.fn((filePath: fs.PathLike) => {
    return filePath.toString();
  }),
  readdirSync: vi.fn((dirPath: fs.PathLike, options?: any) => {
    const dirPathStr = dirPath.toString();
    const entries: fs.Dirent[] = [];

    for (const [fsPath, type] of mockFs.entries()) {
      const pathParts = fsPath.split('/').filter(Boolean);
      const dirParts = dirPathStr.split('/').filter(Boolean);

      // Check if this is a direct child of dirPath
      if (pathParts.length === dirParts.length + 1 &&
          fsPath.startsWith(dirPathStr + '/')) {
        const name = pathParts[pathParts.length - 1];
        const isDirectory = type === 'directory';

        entries.push({
          name,
          isDirectory: () => isDirectory,
          isFile: () => !isDirectory,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isSymbolicLink: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          parentPath: dirPathStr,
          path: dirPathStr
        } as fs.Dirent);
      }
    }

    return entries;
  })
}));

describe('loadResourceTree', () => {
  const translationsFolder = '/test/translations';

  beforeEach(() => {
    // Reset the mock filesystem to initial state
    mockFs.clear();
    const initialFs = createMockFileSystem();
    for (const [key, value] of initialFs.entries()) {
      mockFs.set(key, value);
    }
  });

  describe('depth=0 (current folder only)', () => {
    it('should load root folder resources with children marked unloaded', () => {
      const result = loadResourceTree({
        translationsFolder,
        path: '',
        depth: 0,
        cwd: '/'
      });

      // Should have root resources
      expect(result.folderPathSegments).toEqual([]);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].key).toBe('title');
      expect(result.resources[0].source).toBe('App Title');
      expect(result.resources[0].translations).toEqual({
        es: 'Título de la Aplicación',
        fr: 'Titre de l\'Application'
      });

      // Should list children but not load them
      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe('apps');
      expect(result.children[0].fullPathSegments).toEqual(['apps']);
      expect(result.children[0].loaded).toBe(false);
      expect(result.children[0].tree).toBeUndefined();
    });
  });

  describe('depth=2 (recursive loading)', () => {
    it('should recursively load folders up to depth 2', () => {
      const result = loadResourceTree({
        translationsFolder,
        path: '',
        depth: 2,
        cwd: '/'
      });

      // Root level
      expect(result.folderPathSegments).toEqual([]);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].key).toBe('title');

      // First level children (apps) should be loaded
      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe('apps');
      expect(result.children[0].loaded).toBe(true);
      expect(result.children[0].tree).toBeDefined();

      // Second level (apps.common) should be loaded
      const appsTree = result.children[0].tree!;
      expect(appsTree.children).toHaveLength(1);
      expect(appsTree.children[0].name).toBe('common');
      expect(appsTree.children[0].loaded).toBe(true);
      expect(appsTree.children[0].tree).toBeDefined();

      // Second level resources
      const commonTree = appsTree.children[0].tree!;
      expect(commonTree.resources).toHaveLength(1);
      expect(commonTree.resources[0].key).toBe('header');
      expect(commonTree.resources[0].tags).toEqual(['ui', 'common']);
      expect(commonTree.resources[0].comment).toBe('Main header text');

      // Third level (apps.common.buttons) should NOT be loaded (depth exceeded)
      expect(commonTree.children).toHaveLength(1);
      expect(commonTree.children[0].name).toBe('buttons');
      expect(commonTree.children[0].loaded).toBe(false);
      expect(commonTree.children[0].tree).toBeUndefined();
    });
  });

  describe('nested path loading', () => {
    it('should load from nested folder path', () => {
      const result = loadResourceTree({
        translationsFolder,
        path: 'apps.common',
        depth: 1,
        cwd: '/'
      });

      // Should load apps/common as root
      expect(result.folderPathSegments).toEqual(['apps', 'common']);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].key).toBe('header');

      // Should load buttons folder at depth 1
      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe('buttons');
      expect(result.children[0].loaded).toBe(true);
      expect(result.children[0].tree).toBeDefined();

      const buttonsTree = result.children[0].tree!;
      expect(buttonsTree.resources).toHaveLength(2);
      expect(buttonsTree.resources.map(r => r.key)).toContain('ok');
      expect(buttonsTree.resources.map(r => r.key)).toContain('cancel');
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent folder', () => {
      expect(() => loadResourceTree({
        translationsFolder,
        path: 'nonexistent.folder',
        depth: 1,
        cwd: '/'
      })).toThrow('Folder not found');
    });

    it('should handle folders with no resource files', () => {
      // Use the apps folder which has no resource files at the root level
      const result = loadResourceTree({
        translationsFolder,
        path: 'apps',
        depth: 0,
        cwd: '/'
      });

      expect(result.resources).toHaveLength(0);
      expect(result.children).toHaveLength(1); // Has 'common' subfolder
    });
  });

  describe('metadata extraction', () => {
    it('should extract metadata for all locales', () => {
      const result = loadResourceTree({
        translationsFolder,
        path: '',
        depth: 0,
        cwd: '/'
      });

      const titleResource = result.resources[0];
      // Base locale has checksum but no status or baseChecksum
      expect(titleResource.metadata['en'].checksum).toBe('abc123');
      expect(titleResource.metadata['en'].status).toBeUndefined();
      expect(titleResource.metadata['en'].baseChecksum).toBeUndefined();

      // Non-base locales have checksum, baseChecksum, and status
      expect(titleResource.metadata['es'].checksum).toBe('def456');
      expect(titleResource.metadata['es'].baseChecksum).toBe('abc123');
      expect(titleResource.metadata['es'].status).toBe('translated');

      expect(titleResource.metadata['fr'].checksum).toBe('ghi789');
      expect(titleResource.metadata['fr'].baseChecksum).toBe('abc123');
      expect(titleResource.metadata['fr'].status).toBe('stale');
    });
  });
});
