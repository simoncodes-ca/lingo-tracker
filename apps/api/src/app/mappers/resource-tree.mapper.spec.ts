import type { Collection, ResourceTreeNode } from '@simoncodes-ca/core';
import { mapGetTreeResultToDto, mapResourceTreeToDto } from './resource-tree.mapper';

/** The mapper only reads the base locale, the target locales and the tags. */
function collectionWith(overrides: Partial<Collection> = {}): Collection {
  return {
    runtime: 'transloco-messageformat',
    onMutation: () => undefined,
    name: 'test',
    translationsFolder: '/t',
    baseLocale: 'en',
    locales: ['en', 'es', 'fr'],
    targetLocales: ['es', 'fr'],
    translationConfig: undefined,
    tags: [],
    termFiles: {
      protectedTerms: { path: '/nonexistent/.lingo-tracker-protected-terms.json', explicit: false },
      preferredTerminology: { path: '/nonexistent/.lingo-tracker-preferred-terminology.json', explicit: false },
    },
    readOnly: false,
    config: { translationsFolder: '/t' },
    ...overrides,
  };
}

describe('mapResourceTreeToDto', () => {
  it('should map a resource to its Resource Summary', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: [],
      resources: [
        {
          key: 'title',
          source: 'App Title',
          translations: { es: 'Título', fr: 'Titre' },
          metadata: {
            en: { checksum: 'a1' },
            es: { status: 'translated', checksum: 'b1', baseChecksum: 'a1' },
            fr: { status: 'stale', checksum: 'c1', baseChecksum: 'a1' },
          },
        },
      ],
      children: [],
    };

    const dto = mapResourceTreeToDto(node, collectionWith());

    expect(dto.path).toBe('');
    expect(dto.resources).toEqual([
      {
        fullKey: 'title',
        folderPath: '',
        entryKey: 'title',
        base: { locale: 'en', value: 'App Title' },
        targets: [
          { locale: 'es', value: 'Título', status: 'translated', needsWork: false, sameAsBase: false },
          { locale: 'fr', value: 'Titre', status: 'stale', needsWork: true, sameAsBase: false },
        ],
        tags: [],
        inheritedTags: [],
      },
    ]);
    expect(dto.children).toEqual([]);
  });

  it('should take the base locale from the collection, whatever the metadata looks like', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: [],
      // "es" has neither status nor baseChecksum: the old mapper took it for the base locale.
      resources: [{ key: 'x', source: 'Source', translations: { es: 'Fuente' }, metadata: { es: { checksum: 'e' } } }],
      children: [],
    };

    const [summary] = mapResourceTreeToDto(node, collectionWith()).resources;

    expect(summary.base).toEqual({ locale: 'en', value: 'Source' });
    expect(summary.targets.map((target) => target.locale)).toEqual(['es', 'fr']);
  });

  it('should convert path segments to dot-delimited string', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: ['apps', 'common'],
      resources: [],
      children: [],
    };

    const dto = mapResourceTreeToDto(node, collectionWith());
    expect(dto.path).toBe('apps.common');
  });

  it('should map loaded children recursively, each resource with its full address', () => {
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
            resources: [
              {
                key: 'test',
                source: 'Test',
                translations: { es: 'Prueba' },
                metadata: {
                  en: { checksum: 't1' },
                  es: { status: 'new', checksum: '', baseChecksum: 't1' },
                },
              },
            ],
            children: [],
          },
        },
      ],
    };

    const dto = mapResourceTreeToDto(node, collectionWith());

    expect(dto.children).toHaveLength(1);
    expect(dto.children[0].name).toBe('apps');
    expect(dto.children[0].fullPath).toBe('apps');
    expect(dto.children[0].loaded).toBe(true);

    const tree = dto.children[0].tree;
    expect(tree).toBeDefined();
    expect(tree?.path).toBe('apps');
    expect(tree?.resources.map((r) => [r.fullKey, r.folderPath, r.entryKey])).toEqual([['apps.test', 'apps', 'test']]);
  });

  it('should map unloaded children without tree', () => {
    const node: ResourceTreeNode = {
      folderPathSegments: [],
      resources: [],
      children: [
        {
          name: 'apps',
          fullPathSegments: ['apps'],
          loaded: false,
        },
      ],
    };

    const dto = mapResourceTreeToDto(node, collectionWith());

    expect(dto.children).toHaveLength(1);
    expect(dto.children[0].name).toBe('apps');
    expect(dto.children[0].loaded).toBe(false);
    expect(dto.children[0].tree).toBeUndefined();
  });

  it('should include the comment, own tags and the collection tags', () => {
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
            en: { checksum: 't1' },
          },
        },
      ],
      children: [],
    };

    const dto = mapResourceTreeToDto(node, collectionWith({ tags: ['app'] }));

    expect(dto.resources[0].comment).toBe('Test comment');
    expect(dto.resources[0].tags).toEqual(['ui', 'test']);
    expect(dto.resources[0].inheritedTags).toEqual(['app']);
  });
});

describe('mapGetTreeResultToDto', () => {
  const nodeAt = (folderPathSegments: string[]): ResourceTreeNode => ({
    folderPathSegments,
    resources: [{ key: 'direct', source: 'Direct', translations: {}, metadata: {} }],
    children: [
      {
        name: 'nested',
        fullPathSegments: [...folderPathSegments, 'nested'],
        loaded: true,
        tree: {
          folderPathSegments: [...folderPathSegments, 'nested'],
          resources: [{ key: 'deep', source: 'Deep', translations: {}, metadata: {} }],
          children: [],
        },
      },
    ],
  });

  it('maps only direct resources unless includeNested is exactly true', () => {
    for (const includeNested of [undefined, 'false', 'TRUE', '1', '']) {
      const dto = mapGetTreeResultToDto(nodeAt(['app']), collectionWith(), includeNested);
      expect(dto.resources.map((resource) => resource.fullKey)).toEqual(['app.direct']);
      expect(dto.children[0].tree?.resources[0].fullKey).toBe('app.nested.deep');
    }
  });

  it('resolves nested resources against the requested folder and preserves children', () => {
    const node = nodeAt(['app']);
    const dto = mapGetTreeResultToDto(node, collectionWith(), 'true');
    expect(dto.path).toBe('app');
    expect(dto.resources.map((resource) => [resource.fullKey, resource.folderPath, resource.entryKey])).toEqual([
      ['app.direct', 'app', 'direct'],
      ['app.nested.deep', 'app.nested', 'deep'],
    ]);
    expect(dto.children).toStrictEqual(mapResourceTreeToDto(node, collectionWith()).children);
  });

  it('includes nested resources for the empty collection-root path', () => {
    const dto = mapGetTreeResultToDto(nodeAt([]), collectionWith(), 'true');
    expect(dto.path).toBe('');
    expect(dto.resources.map((resource) => resource.fullKey)).toEqual(['direct', 'nested.deep']);
  });
});
