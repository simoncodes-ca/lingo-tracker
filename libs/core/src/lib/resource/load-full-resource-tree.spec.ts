import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFullResourceTree } from './load-full-resource-tree';
import * as fs from 'node:fs';

const mockFs = vi.hoisted(() => {
  return new Map<string, string | 'directory'>([
    // Root directory and files
    ['/test/translations', 'directory'],
    ['/test/translations/resource_entries.json', JSON.stringify({
      rootKey: {
        source: 'Root Value',
        es: 'Valor Raíz'
      }
    })],
    ['/test/translations/tracker_meta.json', JSON.stringify({
      rootKey: {
        en: { checksum: 'root123' },
        es: { status: 'translated', checksum: 'root456', baseChecksum: 'root123' }
      }
    })],

    // Level 1: apps directory
    ['/test/translations/apps', 'directory'],
    ['/test/translations/apps/resource_entries.json', JSON.stringify({
      appsKey: {
        source: 'Apps Value',
        es: 'Valor Apps'
      }
    })],
    ['/test/translations/apps/tracker_meta.json', JSON.stringify({
      appsKey: {
        en: { checksum: 'apps123' },
        es: { status: 'verified', checksum: 'apps456', baseChecksum: 'apps123' }
      }
    })],

    // Level 2: apps/common directory
    ['/test/translations/apps/common', 'directory'],
    ['/test/translations/apps/common/resource_entries.json', JSON.stringify({
      commonKey: {
        source: 'Common Value',
        es: 'Valor Común'
      }
    })],
    ['/test/translations/apps/common/tracker_meta.json', JSON.stringify({
      commonKey: {
        en: { checksum: 'common123' },
        es: { status: 'translated', checksum: 'common456', baseChecksum: 'common123' }
      }
    })],

    // Level 3: apps/common/buttons directory
    ['/test/translations/apps/common/buttons', 'directory'],
    ['/test/translations/apps/common/buttons/resource_entries.json', JSON.stringify({
      ok: {
        source: 'OK',
        es: 'Aceptar'
      }
    })],
    ['/test/translations/apps/common/buttons/tracker_meta.json', JSON.stringify({
      ok: {
        en: { checksum: 'ok123' },
        es: { status: 'verified', checksum: 'ok456', baseChecksum: 'ok123' }
      }
    })],

    // Level 4: apps/common/buttons/actions directory
    ['/test/translations/apps/common/buttons/actions', 'directory'],
    ['/test/translations/apps/common/buttons/actions/resource_entries.json', JSON.stringify({
      submit: {
        source: 'Submit',
        es: 'Enviar'
      }
    })],
    ['/test/translations/apps/common/buttons/actions/tracker_meta.json', JSON.stringify({
      submit: {
        en: { checksum: 'submit123' },
        es: { status: 'translated', checksum: 'submit456', baseChecksum: 'submit123' }
      }
    })],

    // Level 5: apps/common/buttons/actions/primary directory
    ['/test/translations/apps/common/buttons/actions/primary', 'directory'],
    ['/test/translations/apps/common/buttons/actions/primary/resource_entries.json', JSON.stringify({
      save: {
        source: 'Save',
        es: 'Guardar'
      }
    })],
    ['/test/translations/apps/common/buttons/actions/primary/tracker_meta.json', JSON.stringify({
      save: {
        en: { checksum: 'save123' },
        es: { status: 'verified', checksum: 'save456', baseChecksum: 'save123' }
      }
    })],

    // Level 6: apps/common/buttons/actions/primary/forms directory
    ['/test/translations/apps/common/buttons/actions/primary/forms', 'directory'],
    ['/test/translations/apps/common/buttons/actions/primary/forms/resource_entries.json', JSON.stringify({
      create: {
        source: 'Create',
        es: 'Crear'
      }
    })],
    ['/test/translations/apps/common/buttons/actions/primary/forms/tracker_meta.json', JSON.stringify({
      create: {
        en: { checksum: 'create123' },
        es: { status: 'translated', checksum: 'create456', baseChecksum: 'create123' }
      }
    })]
  ]);
});

const createMockFileSystem = () => {
  return new Map<string, string | 'directory'>([
    // Root directory and files
    ['/test/translations', 'directory'],
    ['/test/translations/resource_entries.json', JSON.stringify({
      rootKey: {
        source: 'Root Value',
        es: 'Valor Raíz'
      }
    })],
    ['/test/translations/tracker_meta.json', JSON.stringify({
      rootKey: {
        en: { checksum: 'root123' },
        es: { status: 'translated', checksum: 'root456', baseChecksum: 'root123' }
      }
    })],

    // Level 1
    ['/test/translations/apps', 'directory'],
    ['/test/translations/apps/resource_entries.json', JSON.stringify({
      appsKey: {
        source: 'Apps Value',
        es: 'Valor Apps'
      }
    })],
    ['/test/translations/apps/tracker_meta.json', JSON.stringify({
      appsKey: {
        en: { checksum: 'apps123' },
        es: { status: 'verified', checksum: 'apps456', baseChecksum: 'apps123' }
      }
    })],

    // Level 2
    ['/test/translations/apps/common', 'directory'],
    ['/test/translations/apps/common/resource_entries.json', JSON.stringify({
      commonKey: {
        source: 'Common Value',
        es: 'Valor Común'
      }
    })],
    ['/test/translations/apps/common/tracker_meta.json', JSON.stringify({
      commonKey: {
        en: { checksum: 'common123' },
        es: { status: 'translated', checksum: 'common456', baseChecksum: 'common123' }
      }
    })],

    // Level 3
    ['/test/translations/apps/common/buttons', 'directory'],
    ['/test/translations/apps/common/buttons/resource_entries.json', JSON.stringify({
      ok: {
        source: 'OK',
        es: 'Aceptar'
      }
    })],
    ['/test/translations/apps/common/buttons/tracker_meta.json', JSON.stringify({
      ok: {
        en: { checksum: 'ok123' },
        es: { status: 'verified', checksum: 'ok456', baseChecksum: 'ok123' }
      }
    })],

    // Level 4
    ['/test/translations/apps/common/buttons/actions', 'directory'],
    ['/test/translations/apps/common/buttons/actions/resource_entries.json', JSON.stringify({
      submit: {
        source: 'Submit',
        es: 'Enviar'
      }
    })],
    ['/test/translations/apps/common/buttons/actions/tracker_meta.json', JSON.stringify({
      submit: {
        en: { checksum: 'submit123' },
        es: { status: 'translated', checksum: 'submit456', baseChecksum: 'submit123' }
      }
    })],

    // Level 5
    ['/test/translations/apps/common/buttons/actions/primary', 'directory'],
    ['/test/translations/apps/common/buttons/actions/primary/resource_entries.json', JSON.stringify({
      save: {
        source: 'Save',
        es: 'Guardar'
      }
    })],
    ['/test/translations/apps/common/buttons/actions/primary/tracker_meta.json', JSON.stringify({
      save: {
        en: { checksum: 'save123' },
        es: { status: 'verified', checksum: 'save456', baseChecksum: 'save123' }
      }
    })],

    // Level 6
    ['/test/translations/apps/common/buttons/actions/primary/forms', 'directory'],
    ['/test/translations/apps/common/buttons/actions/primary/forms/resource_entries.json', JSON.stringify({
      create: {
        source: 'Create',
        es: 'Crear'
      }
    })],
    ['/test/translations/apps/common/buttons/actions/primary/forms/tracker_meta.json', JSON.stringify({
      create: {
        en: { checksum: 'create123' },
        es: { status: 'translated', checksum: 'create456', baseChecksum: 'create123' }
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
  readdirSync: vi.fn((dirPath: fs.PathLike, _options?: any) => {
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

describe('loadFullResourceTree', () => {
  const translationsFolder = '/test/translations';

  beforeEach(() => {
    // Reset the mock filesystem to initial state
    mockFs.clear();
    const initialFs = createMockFileSystem();
    for (const [key, value] of initialFs.entries()) {
      mockFs.set(key, value);
    }
  });

  describe('single level loading', () => {
    it('should load tree with 1 level of folders', () => {
      // Create simple filesystem with just root and one level
      mockFs.clear();
      mockFs.set('/test/simple', 'directory');
      mockFs.set('/test/simple/resource_entries.json', JSON.stringify({
        root: { source: 'Root', es: 'Raíz' }
      }));
      mockFs.set('/test/simple/tracker_meta.json', JSON.stringify({
        root: { en: { checksum: 'r1' }, es: { status: 'translated', checksum: 'r2', baseChecksum: 'r1' } }
      }));
      mockFs.set('/test/simple/level1', 'directory');
      mockFs.set('/test/simple/level1/resource_entries.json', JSON.stringify({
        child: { source: 'Child', es: 'Niño' }
      }));
      mockFs.set('/test/simple/level1/tracker_meta.json', JSON.stringify({
        child: { en: { checksum: 'c1' }, es: { status: 'verified', checksum: 'c2', baseChecksum: 'c1' } }
      }));

      const result = loadFullResourceTree({
        translationsFolder: '/test/simple',
        cwd: '/'
      });

      // Root should have resources
      expect(result.folderPathSegments).toEqual([]);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].key).toBe('root');

      // Should have one child folder, fully loaded
      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe('level1');
      expect(result.children[0].loaded).toBe(true);
      expect(result.children[0].tree).toBeDefined();

      // Child folder should have resources
      const childTree = result.children[0].tree;
      expect(childTree).toBeDefined();
      if (!childTree) return;
      expect(childTree.resources).toHaveLength(1);
      expect(childTree.resources[0].key).toBe('child');
      expect(childTree.children).toHaveLength(0);
    });
  });

  describe('deep nesting', () => {
    it('should load tree with 6+ levels of deep nesting', () => {
      const result = loadFullResourceTree({
        translationsFolder,
        cwd: '/'
      });

      // Verify root level
      expect(result.folderPathSegments).toEqual([]);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].key).toBe('rootKey');

      // Level 1: apps
      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe('apps');
      expect(result.children[0].loaded).toBe(true);
      const level1 = result.children[0].tree;
      expect(level1).toBeDefined();
      if (!level1) return;
      expect(level1.resources[0].key).toBe('appsKey');

      // Level 2: apps/common
      expect(level1.children).toHaveLength(1);
      expect(level1.children[0].name).toBe('common');
      expect(level1.children[0].loaded).toBe(true);
      const level2 = level1.children[0].tree;
      expect(level2).toBeDefined();
      if (!level2) return;
      expect(level2.resources[0].key).toBe('commonKey');

      // Level 3: apps/common/buttons
      expect(level2.children).toHaveLength(1);
      expect(level2.children[0].name).toBe('buttons');
      expect(level2.children[0].loaded).toBe(true);
      const level3 = level2.children[0].tree;
      expect(level3).toBeDefined();
      if (!level3) return;
      expect(level3.resources[0].key).toBe('ok');

      // Level 4: apps/common/buttons/actions
      expect(level3.children).toHaveLength(1);
      expect(level3.children[0].name).toBe('actions');
      expect(level3.children[0].loaded).toBe(true);
      const level4 = level3.children[0].tree;
      expect(level4).toBeDefined();
      if (!level4) return;
      expect(level4.resources[0].key).toBe('submit');

      // Level 5: apps/common/buttons/actions/primary
      expect(level4.children).toHaveLength(1);
      expect(level4.children[0].name).toBe('primary');
      expect(level4.children[0].loaded).toBe(true);
      const level5 = level4.children[0].tree;
      expect(level5).toBeDefined();
      if (!level5) return;
      expect(level5.resources[0].key).toBe('save');

      // Level 6: apps/common/buttons/actions/primary/forms
      expect(level5.children).toHaveLength(1);
      expect(level5.children[0].name).toBe('forms');
      expect(level5.children[0].loaded).toBe(true);
      const level6 = level5.children[0].tree;
      expect(level6).toBeDefined();
      if (!level6) return;
      expect(level6.resources[0].key).toBe('create');
      expect(level6.children).toHaveLength(0);
    });

    it('should mark all folders as loaded: true', () => {
      const result = loadFullResourceTree({
        translationsFolder,
        cwd: '/'
      });

      // Helper function to recursively check all children
      const checkAllLoaded = (node: any): void => {
        for (const child of node.children) {
          expect(child.loaded).toBe(true);
          expect(child.tree).toBeDefined();
          if (child.tree) {
            checkAllLoaded(child.tree);
          }
        }
      };

      checkAllLoaded(result);
    });
  });

  describe('error handling', () => {
    it('should throw error for missing translations folder', () => {
      expect(() => loadFullResourceTree({
        translationsFolder: '/test/nonexistent',
        cwd: '/'
      })).toThrow('Folder not found');
    });

    it('should handle empty folders gracefully', () => {
      mockFs.clear();
      mockFs.set('/test/empty', 'directory');

      const result = loadFullResourceTree({
        translationsFolder: '/test/empty',
        cwd: '/'
      });

      expect(result.folderPathSegments).toEqual([]);
      expect(result.resources).toHaveLength(0);
      expect(result.children).toHaveLength(0);
    });

    it('should handle folders with malformed JSON files', () => {
      mockFs.clear();
      mockFs.set('/test/malformed', 'directory');
      mockFs.set('/test/malformed/resource_entries.json', 'not valid json {{{');
      mockFs.set('/test/malformed/tracker_meta.json', JSON.stringify({
        key: { en: { checksum: 'test' } }
      }));
      mockFs.set('/test/malformed/child', 'directory');
      mockFs.set('/test/malformed/child/resource_entries.json', JSON.stringify({
        valid: { source: 'Valid', es: 'Válido' }
      }));
      mockFs.set('/test/malformed/child/tracker_meta.json', JSON.stringify({
        valid: { en: { checksum: 'v1' }, es: { status: 'translated', checksum: 'v2', baseChecksum: 'v1' } }
      }));

      const result = loadFullResourceTree({
        translationsFolder: '/test/malformed',
        cwd: '/'
      });

      // Root should have no resources due to malformed JSON
      expect(result.resources).toHaveLength(0);

      // But child folders should still load successfully
      expect(result.children).toHaveLength(1);
      expect(result.children[0].loaded).toBe(true);
      const childTree = result.children[0].tree;
      expect(childTree).toBeDefined();
      if (!childTree) return;
      expect(childTree.resources).toHaveLength(1);
      expect(childTree.resources[0].key).toBe('valid');
    });
  });

  describe('cycle detection', () => {
    it('should detect and handle circular symlinks', () => {
      // Create a circular reference: parent -> child -> parent
      mockFs.clear();
      mockFs.set('/test/cycle', 'directory');
      mockFs.set('/test/cycle/resource_entries.json', JSON.stringify({
        root: { source: 'Root', es: 'Raíz' }
      }));
      mockFs.set('/test/cycle/tracker_meta.json', JSON.stringify({
        root: { en: { checksum: 'r1' }, es: { status: 'translated', checksum: 'r2', baseChecksum: 'r1' } }
      }));
      mockFs.set('/test/cycle/child', 'directory');
      mockFs.set('/test/cycle/child/resource_entries.json', JSON.stringify({
        child: { source: 'Child', es: 'Niño' }
      }));
      mockFs.set('/test/cycle/child/tracker_meta.json', JSON.stringify({
        child: { en: { checksum: 'c1' }, es: { status: 'translated', checksum: 'c2', baseChecksum: 'c1' } }
      }));

      // Mock realpathSync to create a cycle
      const originalRealpathSync = vi.mocked(fs.realpathSync);
      originalRealpathSync.mockImplementation((filePath: fs.PathLike) => {
        const pathStr = filePath.toString();
        // Make child/parent point back to root, creating a cycle
        if (pathStr === '/test/cycle/child/parent') {
          return '/test/cycle';
        }
        return pathStr;
      });

      // Add the symlink to mockFs
      mockFs.set('/test/cycle/child/parent', 'directory');

      const result = loadFullResourceTree({
        translationsFolder: '/test/cycle',
        cwd: '/'
      });

      // Should load successfully
      expect(result.resources).toHaveLength(1);
      expect(result.children).toHaveLength(1);

      // Child should be loaded
      const childTree = result.children[0].tree;
      expect(childTree).toBeDefined();
      if (!childTree) return;
      expect(childTree.resources).toHaveLength(1);

      // The circular link (parent) should return empty node
      expect(childTree.children).toHaveLength(1);
      expect(childTree.children[0].name).toBe('parent');
      expect(childTree.children[0].loaded).toBe(true);
      const cycleTree = childTree.children[0].tree;
      expect(cycleTree).toBeDefined();
      if (!cycleTree) return;
      expect(cycleTree.resources).toHaveLength(0);
      expect(cycleTree.children).toHaveLength(0);
    });
  });

  describe('metadata preservation', () => {
    it('should preserve all metadata in deeply nested resources', () => {
      const result = loadFullResourceTree({
        translationsFolder,
        cwd: '/'
      });

      // Navigate to deepest level
      const level1 = result.children[0].tree;
      if (!level1) return;
      const level2 = level1.children[0].tree;
      if (!level2) return;
      const level3 = level2.children[0].tree;
      if (!level3) return;
      const level4 = level3.children[0].tree;
      if (!level4) return;
      const level5 = level4.children[0].tree;
      if (!level5) return;
      const level6 = level5.children[0].tree;
      if (!level6) return;

      const createResource = level6.resources[0];
      expect(createResource.key).toBe('create');
      expect(createResource.source).toBe('Create');
      expect(createResource.translations.es).toBe('Crear');
      expect(createResource.metadata.en.checksum).toBe('create123');
      expect(createResource.metadata.es.checksum).toBe('create456');
      expect(createResource.metadata.es.baseChecksum).toBe('create123');
      expect(createResource.metadata.es.status).toBe('translated');
    });
  });
});
