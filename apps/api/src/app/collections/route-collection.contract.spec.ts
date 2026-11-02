import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { CollectionIndex } from '../cache/collection-index.service';
import { ConfigService } from '../config/config.service';
import { TranslationJobService } from '../translation-job/translation-job.service';
import { CollectionsController } from './collections.controller';
import { FoldersController } from './folders/folders.controller';
import { LocalesController } from './locales/locales.controller';
import { ResourcesController } from './resources/resources.controller';
import { RouteCollectionPipe } from './route-collection';

interface RouteArgMetadata {
  readonly data?: { readonly writable?: boolean };
  readonly pipes?: unknown[];
}

function expectRouteCollectionArg(args: Record<string, RouteArgMetadata>, method: RequestMethod): void {
  const refs = Object.values(args).filter(({ pipes }) => pipes?.includes(RouteCollectionPipe));
  expect(refs).toHaveLength(1);
  if (method !== RequestMethod.GET) expect(refs[0]?.data?.writable).not.toBe(false);
}

describe('route collection contract', () => {
  it('rejects a writable override on a write route', () => {
    const args = { collection: { data: { writable: false }, pipes: [RouteCollectionPipe] } };
    expect(() => expectRouteCollectionArg(args, RequestMethod.POST)).toThrow();
    expect(() => expectRouteCollectionArg(args, RequestMethod.GET)).not.toThrow();
  });

  it('opens update and delete registrations through lifecycle route collections', () => {
    for (const [methodName, lifecycle] of [
      ['updateCollectionByName', 'update'],
      ['deleteCollection', 'delete'],
    ]) {
      const args: Record<string, RouteArgMetadata> =
        Reflect.getMetadata(ROUTE_ARGS_METADATA, CollectionsController, methodName) ?? {};
      const refs = Object.values(args).filter(({ pipes }) => pipes?.includes(RouteCollectionPipe));
      expect(refs).toHaveLength(1);
      expect(refs[0]?.data).toEqual({ lifecycle });
    }
  });

  it('opens every collection route through RouteCollection except job lookup', async () => {
    const module = await Test.createTestingModule({
      controllers: [ResourcesController, FoldersController, LocalesController],
      providers: [
        RouteCollectionPipe,
        { provide: ConfigService, useValue: { getConfig: jest.fn() } },
        { provide: CollectionIndex, useValue: {} },
        { provide: TranslationJobService, useValue: {} },
      ],
    }).compile();

    for (const controller of [ResourcesController, FoldersController, LocalesController]) {
      expect(module.get(controller)).toBeDefined();
      const controllerPath: string | undefined = Reflect.getMetadata(PATH_METADATA, controller);
      expect(controllerPath).toContain(':collectionName');
      for (const methodName of Object.getOwnPropertyNames(controller.prototype)) {
        if (methodName === 'constructor') continue;
        const routePath: unknown = Reflect.getMetadata(PATH_METADATA, controller.prototype[methodName]);
        if (routePath === undefined || methodName === 'getTranslateLocaleJob') continue;
        const method: RequestMethod | undefined = Reflect.getMetadata(
          METHOD_METADATA,
          controller.prototype[methodName],
        );
        expect(method).toBeDefined();
        const args: Record<string, RouteArgMetadata> =
          Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, methodName) ?? {};
        if (method !== undefined) expectRouteCollectionArg(args, method);
      }
    }
  });
});
