import { mapCreateFolderResultToDto } from './folder-response.mapper';

describe('folder response mapping', () => {
  it('uses the resolved address and submitted name for a loaded empty tree, even when the folder exists', () => {
    for (const created of [true, false]) {
      const dto = mapCreateFolderResultToDto(
        { folderAddress: 'apps.common.buttons', folderPath: '/translations/apps/common/buttons', created },
        'common.buttons',
      );
      expect(dto).toStrictEqual({
        folderPath: '/translations/apps/common/buttons',
        created,
        folder: {
          name: 'common.buttons',
          fullPath: 'apps.common.buttons',
          loaded: true,
          tree: { path: 'apps.common.buttons', resources: [], children: [] },
        },
      });
      expect(Object.keys(dto)).toEqual(['folderPath', 'created', 'folder']);
    }
  });
});
