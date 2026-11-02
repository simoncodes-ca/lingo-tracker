import { type LingoTrackerConfig, openProjectCollection } from '@simoncodes-ca/core';
import { CollectionIndex } from '../cache/collection-index.service';
import { FoldersController } from '../collections/folders/folders.controller';
import { RouteCollectionPipe, routeCollectionRef } from '../collections/route-collection';
import { ConfigService } from './config.service';
import { RouteProjectPipe } from './route-project';

const config: LingoTrackerConfig = {
  exportFolder: 'dist',
  importFolder: 'import',
  baseLocale: 'en',
  locales: ['en'],
  collections: { source: { translationsFolder: 'source' }, destination: { translationsFolder: 'destination' } },
};

class TestConfigService extends ConfigService {
  override get projectRoot(): string {
    return '/project';
  }
  override getConfig(): LingoTrackerConfig {
    return config;
  }
}

describe('RouteProject', () => {
  it('reads one snapshot on first use and shares the index sink with opened collections', () => {
    const service = new TestConfigService();
    const read = jest.spyOn(service, 'getConfig');
    const index = new CollectionIndex();
    const project = new RouteProjectPipe(service, index).transform(true);
    expect(read).toHaveBeenCalledTimes(0);
    expect(project.sourceConfig).toBe(config);
    expect(project.sourceConfig).toBe(config);
    expect(read).toHaveBeenCalledTimes(1);
    expect(project.onMutation).toBe(index.sink);
    expect(openProjectCollection(project, 'destination').onMutation).toBe(index.sink);
  });

  it('attaches the sink for writes and gives GET collections a no-op sink while their project has no sink', () => {
    const index = new CollectionIndex();
    const pipe = new RouteProjectPipe(new TestConfigService(), index);
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const writable = routeCollectionRef({}, { method, params: {} }).writable;
      const project = pipe.transform(writable);
      expect(project.onMutation).toBe(method === 'GET' ? undefined : index.sink);
      const collection = openProjectCollection(project, 'destination');
      if (method === 'GET') {
        expect(collection.onMutation).not.toBe(index.sink);
        expect(
          collection.onMutation({ kind: 'reindex', translationsFolder: collection.translationsFolder }),
        ).toBeUndefined();
      } else {
        expect(collection.onMutation).toBe(project.onMutation);
      }
    }
  });

  it('keeps config unread for a request that does not use the project snapshot', () => {
    const service = new TestConfigService();
    const read = jest.spyOn(service, 'getConfig');
    new RouteProjectPipe(service, new CollectionIndex()).transform(true);
    expect(read).toHaveBeenCalledTimes(0);
  });

  it('reads config only once for a cross-collection API move, including destination refusals', async () => {
    const service = new TestConfigService();
    const read = jest.spyOn(service, 'getConfig');
    const source = new RouteCollectionPipe(service, new CollectionIndex()).transform({
      name: 'source',
      writable: true,
    });
    await expect(
      new FoldersController().move(source, {
        sourceFolderPath: 'old',
        destinationFolderPath: 'new',
        toCollection: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'COLLECTION_NOT_FOUND' });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
