import { mapResourceTreeToDto } from './resource-tree.mapper';
import { ResourceTreeNode } from '@simoncodes-ca/core';

describe('mapResourceTreeToDto', () => {
  it('should map simple tree node to DTO', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: [],
      resources: [
        {
          key: 'title',
          source: 'App Title',
          translations: { es: 'Título', fr: 'Titre' },
          metadata: {
            'en': { checksum: 'a1' },
            'es': { status: 'translated', checksum: 'b1', baseChecksum: 'a1' },
            'fr': { status: 'stale', checksum: 'c1', baseChecksum: 'a1' }
          }
        }
      ],
      children: []
    };

    const dto = mapResourceTreeToDto(node);

    expect(dto.path).toBe('');
    expect(dto.resources).toHaveLength(1);
    expect(dto.resources[0].key).toBe('title');
    expect(dto.resources[0].translations).toEqual({
      en: 'App Title',
      es: 'Título',
      fr: 'Titre'
    });
    expect(dto.resources[0].status).toEqual({
      en: undefined,
      es: 'translated',
      fr: 'stale'
    });
    expect(dto.children).toEqual([]);
  });

  it('should convert path segments to dot-delimited string', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: ['apps', 'common'],
      resources: [],
      children: []
    };

    const dto = mapResourceTreeToDto(node);
    expect(dto.path).toBe('apps.common');
  });

  it('should map loaded children recursively', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: [],
      resources: [],
      children: [
        {
          name: 'apps',
          fullPathSegments: ['apps'],
          loaded: true,
          tree: {
            folderPathSegments: ['apps'],
            resources: [{
              key: 'test',
              source: 'Test',
              translations: { es: 'Prueba' },
              metadata: {
                'en': { checksum: 't1' },
                'es': { status: 'new', checksum: '', baseChecksum: 't1' }
              }
            }],
            children: []
          }
        }
      ]
    };

    const dto = mapResourceTreeToDto(node);

    expect(dto.children).toHaveLength(1);
    expect(dto.children[0].name).toBe('apps');
    expect(dto.children[0].fullPath).toBe('apps');
    expect(dto.children[0].loaded).toBe(true);
    expect(dto.children[0].tree).toBeDefined();
    expect(dto.children[0].tree!.path).toBe('apps');
    expect(dto.children[0].tree!.resources).toHaveLength(1);
    expect(dto.children[0].tree!.resources[0].translations).toEqual({
      en: 'Test',
      es: 'Prueba'
    });
  });

  it('should map unloaded children without tree', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: [],
      resources: [],
      children: [
        {
          name: 'apps',
          fullPathSegments: ['apps'],
          loaded: false
        }
      ]
    };

    const dto = mapResourceTreeToDto(node);

    expect(dto.children).toHaveLength(1);
    expect(dto.children[0].name).toBe('apps');
    expect(dto.children[0].loaded).toBe(false);
    expect(dto.children[0].tree).toBeUndefined();
  });

  it('should include optional comment and tags', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: [],
      resources: [
        {
          key: 'test',
          source: 'Test',
          translations: {},
          comment: 'Test comment',
          tags: ['ui', 'test'],
          metadata: {
            'en': { checksum: 't1' }
          }
        }
      ],
      children: []
    };

    const dto = mapResourceTreeToDto(node);

    expect(dto.resources[0].comment).toBe('Test comment');
    expect(dto.resources[0].tags).toEqual(['ui', 'test']);
  });
});
