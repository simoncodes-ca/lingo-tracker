import { describe, expect, it } from 'vitest';
import { extractResourcesRecursively, extractSubtree } from './extract-subtree';
import type { ResourceTreeNode } from './resource-tree-types';

describe('extractSubtree', () => {
  describe('root extraction', () => {
    it('should return full tree when path is empty string', () => {
      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [
          {
            key: 'root.key',
            source: 'Root value',
            translations: { es: 'Valor raíz' },
            metadata: {
              en: { checksum: 'abc123' },
              es: { checksum: 'def456', baseChecksum: 'abc123', status: 'translated' },
            },
          },
        ],
        children: [],
      };

      const result = extractSubtree(tree, '');

      expect(result).toBe(tree);
    });

    it('should return full tree when path is whitespace only', () => {
      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [],
      };

      const result = extractSubtree(tree, '   ');

      expect(result).toBe(tree);
    });

    it('should return full tree when path contains only dots', () => {
      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [],
      };

      const result = extractSubtree(tree, '...');

      expect(result).toBe(tree);
    });
  });

  describe('first-level folder extraction', () => {
    it('should extract first-level folder correctly', () => {
      const appsTree: ResourceTreeNode = {
        folderPathSegments: ['apps'],
        resources: [
          {
            key: 'title',
            source: 'Apps Title',
            translations: { es: 'Título Apps' },
            metadata: {
              en: { checksum: 'hash1' },
              es: { checksum: 'hash2', baseChecksum: 'hash1', status: 'verified' },
            },
          },
        ],
        children: [],
      };

      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: appsTree,
          },
          {
            name: 'common',
            fullPathSegments: ['common'],
            loaded: true,
            tree: {
              folderPathSegments: ['common'],
              resources: [],
              children: [],
            },
          },
        ],
      };

      const result = extractSubtree(tree, 'apps');

      expect(result).toBe(appsTree);
      expect(result?.folderPathSegments).toEqual(['apps']);
      expect(result?.resources).toHaveLength(1);
      expect(result?.resources[0].key).toBe('title');
    });

    it('should return null for non-existent first-level folder', () => {
      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: {
              folderPathSegments: ['apps'],
              resources: [],
              children: [],
            },
          },
        ],
      };

      const result = extractSubtree(tree, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('deeply nested folder extraction', () => {
    it('should extract folder at 3 levels deep', () => {
      const buttonsTree: ResourceTreeNode = {
        folderPathSegments: ['apps', 'common', 'buttons'],
        resources: [
          {
            key: 'ok',
            source: 'OK',
            translations: { es: 'Aceptar', fr: "D'accord" },
            metadata: {
              en: { checksum: 'ok-hash' },
              es: { checksum: 'ok-es', baseChecksum: 'ok-hash', status: 'verified' },
              fr: { checksum: 'ok-fr', baseChecksum: 'ok-hash', status: 'translated' },
            },
          },
          {
            key: 'cancel',
            source: 'Cancel',
            translations: { es: 'Cancelar' },
            metadata: {
              en: { checksum: 'cancel-hash' },
              es: { checksum: 'cancel-es', baseChecksum: 'cancel-hash', status: 'verified' },
            },
          },
        ],
        children: [],
      };

      const commonTree: ResourceTreeNode = {
        folderPathSegments: ['apps', 'common'],
        resources: [],
        children: [
          {
            name: 'buttons',
            fullPathSegments: ['apps', 'common', 'buttons'],
            loaded: true,
            tree: buttonsTree,
          },
        ],
      };

      const appsTree: ResourceTreeNode = {
        folderPathSegments: ['apps'],
        resources: [],
        children: [
          {
            name: 'common',
            fullPathSegments: ['apps', 'common'],
            loaded: true,
            tree: commonTree,
          },
        ],
      };

      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: appsTree,
          },
        ],
      };

      const result = extractSubtree(tree, 'apps.common.buttons');

      expect(result).toBe(buttonsTree);
      expect(result?.folderPathSegments).toEqual(['apps', 'common', 'buttons']);
      expect(result?.resources).toHaveLength(2);
      expect(result?.resources[0].key).toBe('ok');
      expect(result?.resources[1].key).toBe('cancel');
    });

    it('should extract folder at 5 levels deep', () => {
      const level5Tree: ResourceTreeNode = {
        folderPathSegments: ['a', 'b', 'c', 'd', 'e'],
        resources: [
          {
            key: 'deep.key',
            source: 'Deep value',
            translations: { es: 'Valor profundo' },
            metadata: {
              en: { checksum: 'deep-hash' },
              es: { checksum: 'deep-es', baseChecksum: 'deep-hash', status: 'translated' },
            },
          },
        ],
        children: [],
      };

      // Build nested tree
      let currentTree = level5Tree;
      const levels = ['d', 'c', 'b', 'a'];

      for (let i = 0; i < levels.length; i++) {
        const parentSegments = levels.slice(i).reverse();
        currentTree = {
          folderPathSegments: parentSegments,
          resources: [],
          children: [
            {
              name: levels[i] === 'a' ? 'b' : levels[i] === 'b' ? 'c' : levels[i] === 'c' ? 'd' : 'e',
              fullPathSegments: [
                ...parentSegments,
                levels[i] === 'a' ? 'b' : levels[i] === 'b' ? 'c' : levels[i] === 'c' ? 'd' : 'e',
              ],
              loaded: true,
              tree: currentTree,
            },
          ],
        };
      }

      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'a',
            fullPathSegments: ['a'],
            loaded: true,
            tree: {
              folderPathSegments: ['a'],
              resources: [],
              children: [
                {
                  name: 'b',
                  fullPathSegments: ['a', 'b'],
                  loaded: true,
                  tree: {
                    folderPathSegments: ['a', 'b'],
                    resources: [],
                    children: [
                      {
                        name: 'c',
                        fullPathSegments: ['a', 'b', 'c'],
                        loaded: true,
                        tree: {
                          folderPathSegments: ['a', 'b', 'c'],
                          resources: [],
                          children: [
                            {
                              name: 'd',
                              fullPathSegments: ['a', 'b', 'c', 'd'],
                              loaded: true,
                              tree: {
                                folderPathSegments: ['a', 'b', 'c', 'd'],
                                resources: [],
                                children: [
                                  {
                                    name: 'e',
                                    fullPathSegments: ['a', 'b', 'c', 'd', 'e'],
                                    loaded: true,
                                    tree: level5Tree,
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      const result = extractSubtree(tree, 'a.b.c.d.e');

      expect(result).toBe(level5Tree);
      expect(result?.folderPathSegments).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(result?.resources).toHaveLength(1);
      expect(result?.resources[0].key).toBe('deep.key');
    });

    it('should return null when path partially exists but not fully', () => {
      const commonTree: ResourceTreeNode = {
        folderPathSegments: ['apps', 'common'],
        resources: [],
        children: [],
      };

      const appsTree: ResourceTreeNode = {
        folderPathSegments: ['apps'],
        resources: [],
        children: [
          {
            name: 'common',
            fullPathSegments: ['apps', 'common'],
            loaded: true,
            tree: commonTree,
          },
        ],
      };

      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: appsTree,
          },
        ],
      };

      // Path exists up to 'common' but 'buttons' doesn't exist
      const result = extractSubtree(tree, 'apps.common.buttons');

      expect(result).toBeNull();
    });
  });

  describe('non-existent path handling', () => {
    it('should return null for completely non-existent path', () => {
      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: {
              folderPathSegments: ['apps'],
              resources: [],
              children: [],
            },
          },
        ],
      };

      const result = extractSubtree(tree, 'nonexistent.path.here');

      expect(result).toBeNull();
    });

    it('should return null when child exists but is not loaded', () => {
      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: false, // Child exists but not loaded
          },
        ],
      };

      const result = extractSubtree(tree, 'apps');

      expect(result).toBeNull();
    });

    it('should return null when child is loaded but tree is undefined', () => {
      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: undefined, // Marked as loaded but tree missing
          },
        ],
      };

      const result = extractSubtree(tree, 'apps');

      expect(result).toBeNull();
    });
  });

  describe('edge cases with dots in path', () => {
    it('should handle leading dot by ignoring it', () => {
      const appsTree: ResourceTreeNode = {
        folderPathSegments: ['apps'],
        resources: [],
        children: [],
      };

      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: appsTree,
          },
        ],
      };

      const result = extractSubtree(tree, '.apps');

      expect(result).toBe(appsTree);
    });

    it('should handle trailing dot by ignoring it', () => {
      const appsTree: ResourceTreeNode = {
        folderPathSegments: ['apps'],
        resources: [],
        children: [],
      };

      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: appsTree,
          },
        ],
      };

      const result = extractSubtree(tree, 'apps.');

      expect(result).toBe(appsTree);
    });

    it('should handle multiple consecutive dots by ignoring empty segments', () => {
      const buttonsTree: ResourceTreeNode = {
        folderPathSegments: ['apps', 'common', 'buttons'],
        resources: [],
        children: [],
      };

      const commonTree: ResourceTreeNode = {
        folderPathSegments: ['apps', 'common'],
        resources: [],
        children: [
          {
            name: 'buttons',
            fullPathSegments: ['apps', 'common', 'buttons'],
            loaded: true,
            tree: buttonsTree,
          },
        ],
      };

      const appsTree: ResourceTreeNode = {
        folderPathSegments: ['apps'],
        resources: [],
        children: [
          {
            name: 'common',
            fullPathSegments: ['apps', 'common'],
            loaded: true,
            tree: commonTree,
          },
        ],
      };

      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: appsTree,
          },
        ],
      };

      const result = extractSubtree(tree, 'apps..common...buttons');

      expect(result).toBe(buttonsTree);
    });

    it('should handle leading, trailing, and consecutive dots together', () => {
      const commonTree: ResourceTreeNode = {
        folderPathSegments: ['apps', 'common'],
        resources: [],
        children: [],
      };

      const appsTree: ResourceTreeNode = {
        folderPathSegments: ['apps'],
        resources: [],
        children: [
          {
            name: 'common',
            fullPathSegments: ['apps', 'common'],
            loaded: true,
            tree: commonTree,
          },
        ],
      };

      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: appsTree,
          },
        ],
      };

      const result = extractSubtree(tree, '..apps...common..');

      expect(result).toBe(commonTree);
    });
  });

  describe('intermediate path extraction', () => {
    it('should extract intermediate folder with its children', () => {
      const dialogsTree: ResourceTreeNode = {
        folderPathSegments: ['apps', 'common', 'dialogs'],
        resources: [],
        children: [],
      };

      const buttonsTree: ResourceTreeNode = {
        folderPathSegments: ['apps', 'common', 'buttons'],
        resources: [],
        children: [],
      };

      const commonTree: ResourceTreeNode = {
        folderPathSegments: ['apps', 'common'],
        resources: [
          {
            key: 'label',
            source: 'Common Label',
            translations: { es: 'Etiqueta común' },
            metadata: {
              en: { checksum: 'label-hash' },
              es: { checksum: 'label-es', baseChecksum: 'label-hash', status: 'verified' },
            },
          },
        ],
        children: [
          {
            name: 'buttons',
            fullPathSegments: ['apps', 'common', 'buttons'],
            loaded: true,
            tree: buttonsTree,
          },
          {
            name: 'dialogs',
            fullPathSegments: ['apps', 'common', 'dialogs'],
            loaded: true,
            tree: dialogsTree,
          },
        ],
      };

      const appsTree: ResourceTreeNode = {
        folderPathSegments: ['apps'],
        resources: [],
        children: [
          {
            name: 'common',
            fullPathSegments: ['apps', 'common'],
            loaded: true,
            tree: commonTree,
          },
        ],
      };

      const tree: ResourceTreeNode = {
        folderPathSegments: [],
        resources: [],
        children: [
          {
            name: 'apps',
            fullPathSegments: ['apps'],
            loaded: true,
            tree: appsTree,
          },
        ],
      };

      const result = extractSubtree(tree, 'apps.common');

      expect(result).toBe(commonTree);
      expect(result?.folderPathSegments).toEqual(['apps', 'common']);
      expect(result?.resources).toHaveLength(1);
      expect(result?.children).toHaveLength(2);
      expect(result?.children[0].name).toBe('buttons');
      expect(result?.children[1].name).toBe('dialogs');
    });
  });
});

describe('extractResourcesRecursively', () => {
  it('should extract resources from a single node', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: ['a'],
      resources: [
        {
          key: 'k1',
          source: 'v1',
          translations: {},
          metadata: { en: { checksum: 'c1' } },
        },
      ],
      children: [],
    };

    const result = extractResourcesRecursively(node);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('k1');
  });

  it('should extract resources from nested nodes', () => {
    const childNode: ResourceTreeNode = {
      folderPathSegments: ['a', 'b'],
      resources: [
        {
          key: 'k2',
          source: 'v2',
          translations: {},
          metadata: { en: { checksum: 'c2' } },
        },
      ],
      children: [],
    };

    const rootNode: ResourceTreeNode = {
      folderPathSegments: ['a'],
      resources: [
        {
          key: 'k1',
          source: 'v1',
          translations: {},
          metadata: { en: { checksum: 'c1' } },
        },
      ],
      children: [
        {
          name: 'b',
          fullPathSegments: ['a', 'b'],
          loaded: true,
          tree: childNode,
        },
      ],
    };

    const result = extractResourcesRecursively(rootNode);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.key)).toContain('k1');
    expect(result.map((r) => r.key)).toContain('b.k2');
  });

  it('should extract resources from root node with empty folderPathSegments', () => {
    const childNode: ResourceTreeNode = {
      folderPathSegments: ['forms'],
      resources: [
        {
          key: 'acceptedFormatsX',
          source: 'v1',
          translations: {},
          metadata: { en: { checksum: 'c1' } },
        },
      ],
      children: [],
    };

    const rootNode: ResourceTreeNode = {
      folderPathSegments: [],
      resources: [
        {
          key: 'rootKey',
          source: 'v0',
          translations: {},
          metadata: { en: { checksum: 'c0' } },
        },
      ],
      children: [
        {
          name: 'forms',
          fullPathSegments: ['forms'],
          loaded: true,
          tree: childNode,
        },
      ],
    };

    const result = extractResourcesRecursively(rootNode);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.key)).toContain('rootKey');
    expect(result.map((r) => r.key)).toContain('forms.acceptedFormatsX');
  });

  it('should extract resources from multiple sibling children', () => {
    const childB: ResourceTreeNode = {
      folderPathSegments: ['a', 'b'],
      resources: [
        {
          key: 'k2',
          source: 'v2',
          translations: {},
          metadata: { en: { checksum: 'c2' } },
        },
      ],
      children: [],
    };

    const childC: ResourceTreeNode = {
      folderPathSegments: ['a', 'c'],
      resources: [
        {
          key: 'k3',
          source: 'v3',
          translations: {},
          metadata: { en: { checksum: 'c3' } },
        },
      ],
      children: [],
    };

    const rootNode: ResourceTreeNode = {
      folderPathSegments: ['a'],
      resources: [],
      children: [
        { name: 'b', fullPathSegments: ['a', 'b'], loaded: true, tree: childB },
        { name: 'c', fullPathSegments: ['a', 'c'], loaded: true, tree: childC },
      ],
    };

    const result = extractResourcesRecursively(rootNode);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.key)).toContain('b.k2');
    expect(result.map((r) => r.key)).toContain('c.k3');
  });

  it('should prefix keys correctly for grandchild (3-level) nesting', () => {
    const grandchild: ResourceTreeNode = {
      folderPathSegments: ['a', 'b', 'c'],
      resources: [
        {
          key: 'k3',
          source: 'v3',
          translations: {},
          metadata: { en: { checksum: 'c3' } },
        },
      ],
      children: [],
    };

    const child: ResourceTreeNode = {
      folderPathSegments: ['a', 'b'],
      resources: [
        {
          key: 'k2',
          source: 'v2',
          translations: {},
          metadata: { en: { checksum: 'c2' } },
        },
      ],
      children: [{ name: 'c', fullPathSegments: ['a', 'b', 'c'], loaded: true, tree: grandchild }],
    };

    const rootNode: ResourceTreeNode = {
      folderPathSegments: ['a'],
      resources: [],
      children: [{ name: 'b', fullPathSegments: ['a', 'b'], loaded: true, tree: child }],
    };

    const result = extractResourcesRecursively(rootNode);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.key)).toContain('b.k2');
    expect(result.map((r) => r.key)).toContain('b.c.k3');
  });

  it('should skip children with invalid segment length', () => {
    const invalidChild: ResourceTreeNode = {
      folderPathSegments: ['x'],
      resources: [
        {
          key: 'bad',
          source: 'v',
          translations: {},
          metadata: { en: { checksum: 'c' } },
        },
      ],
      children: [],
    };

    const rootNode: ResourceTreeNode = {
      folderPathSegments: ['a'],
      resources: [
        {
          key: 'k1',
          source: 'v1',
          translations: {},
          metadata: { en: { checksum: 'c1' } },
        },
      ],
      children: [{ name: 'x', fullPathSegments: ['x'], loaded: true, tree: invalidChild }],
    };

    const result = extractResourcesRecursively(rootNode);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('k1');
  });

  it('should skip unloaded child nodes', () => {
    const rootNode: ResourceTreeNode = {
      folderPathSegments: ['a'],
      resources: [
        {
          key: 'k1',
          source: 'v1',
          translations: {},
          metadata: { en: { checksum: 'c1' } },
        },
      ],
      children: [
        {
          name: 'b',
          fullPathSegments: ['a', 'b'],
          loaded: false,
        },
      ],
    };

    const result = extractResourcesRecursively(rootNode);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('k1');
  });
});
