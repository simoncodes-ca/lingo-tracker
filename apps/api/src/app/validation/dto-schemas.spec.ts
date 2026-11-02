import {
  Body,
  Controller,
  type DynamicModule,
  type ForwardReference,
  forwardRef,
  Module,
  Post,
  Query,
  type Type,
} from '@nestjs/common';
import { MODULE_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { Test } from '@nestjs/testing';
import { AppController } from '../app.controller';
import { AppModule } from '../app.module';
import { AppService } from '../app.service';
import { BundleJobService } from '../bundles/bundle-job.service';
import { BundlesController } from '../bundles/bundles.controller';
import { CollectionIndex } from '../cache/collection-index.service';
import { CollectionsController } from '../collections/collections.controller';
import { FoldersController } from '../collections/folders/folders.controller';
import { LocalesController } from '../collections/locales/locales.controller';
import { ResourcesController } from '../collections/resources/resources.controller';
import { RouteCollectionPipe } from '../collections/route-collection';
import { ConfigController } from '../config/config.controller';
import { ConfigService } from '../config/config.service';
import { ExportJobService } from '../exports/export-job.service';
import { ExportsController } from '../exports/exports.controller';
import { ImportJobService } from '../imports/import-job.service';
import { ImportSourceService } from '../imports/import-source.service';
import { ImportUploadService } from '../imports/import-upload.service';
import { ImportsController } from '../imports/imports.controller';
import { TranslationJobService } from '../translation-job/translation-job.service';
import * as schemas from './dto-schemas';
import { exactMessage } from './exact-message.test-support';
import type { Schema } from './schema';
import { SchemaPipe } from './valid-body';

const collection = {
  translationsFolder: './translations',
  locales: ['en', 'fr-ca'],
  baseLocale: 'en',
  readOnly: false,
  tags: [],
  protectedTermsFile: '',
};
const bundle = {
  bundleName: 'tracker.{locale}.json',
  dist: './dist',
  collections: 'All',
  typeDistFile: './types.ts',
  tokenCasing: 'camelCase',
  tokenConstantName: 'TOKENS',
  transformICUToTransloco: true,
};
const resource = {
  key: 'ok',
  baseValue: 'OK',
  comment: undefined,
  tags: undefined,
  translations: [{ locale: 'fr', value: 'Oui', status: 'new' }],
};

describe('collection rename name shape', () => {
  it('accepts blank update names while create still rejects them', () => {
    for (const name of ['', ' ']) {
      expect(new SchemaPipe(schemas.updateCollectionBody, 'request body').transform({ name, collection })).toEqual({
        name,
        collection,
      });
      expect(() =>
        new SchemaPipe(schemas.createCollectionBody, 'request body').transform({ name, collection }),
      ).toThrow(exactMessage('name must be a non-empty string'));
    }
  });

  it('rejects a non-string update name with the string shape message', () => {
    expect(() =>
      new SchemaPipe(schemas.updateCollectionBody, 'request body').transform({ name: 42, collection }),
    ).toThrow(exactMessage('name must be a string'));
  });
});

interface EndpointCase {
  name: string;
  schema: Schema<unknown>;
  accepted: unknown[];
  invalid: unknown;
  message: string;
  optionalBody?: boolean;
  many?: boolean;
  query?: boolean;
}

// Payloads follow browser-api, collections-api, resource-entry-draft, collection-draft,
// bundle-draft, dialog-config-submit and settings-draft (including undefined optional fields).
const endpoints: EndpointCase[] = [
  {
    name: 'config',
    schema: schemas.updateConfigBody,
    optionalBody: true,
    accepted: [
      undefined,
      {},
      { protectedTerms: ['Brand'], preferredTerminology: [{ discouraged: 'old', preferred: 'new' }] },
      { preferredTerminology: [null, 5] },
    ],
    invalid: { protectedTerms: ['Brand', 5] },
    message: 'protectedTerms[1] must be a string',
  },
  {
    name: 'collection config',
    schema: schemas.collectionConfig,
    accepted: [
      collection,
      {
        ...collection,
        protectedTermsFile: './terms.json',
        protectedTerms: ['Brand'],
        protectedTermsFilePath: '/terms.json',
        exportFolder: '',
        importFolder: '',
        translation: { enabled: false, provider: 'google', apiKeyEnv: 'KEY', batchSize: 5, delayMs: 0 },
        legacy: true,
      },
    ],
    invalid: { ...collection, locales: [5] },
    message: 'locales[0] must be a string',
  },
  {
    name: 'create collection',
    schema: schemas.createCollectionBody,
    accepted: [{ name: 'app', collection }],
    invalid: { name: ' ', collection },
    message: 'name must be a non-empty string',
  },
  {
    name: 'update collection',
    schema: schemas.updateCollectionBody,
    accepted: [
      { name: undefined, collection },
      { name: 'renamed', collection },
      { name: ' ', collection },
      { name: '', collection },
    ],
    invalid: { collection: [] },
    message: 'collection must be an object',
  },
  {
    name: 'dry run bundle',
    schema: schemas.bundleDryRunBody,
    accepted: [
      { name: 'tracker', bundle },
      { name: '', bundle, locales: ['fr-ca'] },
    ],
    invalid: { name: 'tracker', bundle: 5 },
    message: 'bundle must be an object',
  },
  {
    name: 'create bundle',
    schema: schemas.createBundleBody,
    accepted: [
      { name: 'tracker', bundle },
      { name: '', bundle: {} },
    ],
    invalid: { name: 5, bundle },
    message: 'name must be a string',
  },
  {
    name: 'update bundle',
    schema: schemas.updateBundleBody,
    accepted: [
      { name: undefined, bundle },
      { name: 'renamed', bundle: { ...bundle, typeDist: './legacy' } },
      { name: ' ', bundle },
    ],
    invalid: { bundle: [] },
    message: 'bundle must be an object',
  },
  {
    name: 'generate bundle',
    schema: schemas.generateBundleBody,
    optionalBody: true,
    accepted: [undefined, {}, { locales: ['fr'] }],
    invalid: { locales: 'fr' },
    message: 'locales must be an array',
  },
  {
    name: 'export',
    schema: schemas.exportRequestBody,
    accepted: [
      { format: 'xliff' },
      { format: 'json', collections: [], locales: [], statuses: [], tags: [], json: {} },
      { format: 'unknown', json: { structure: 'unknown' }, statuses: ['unknown'] },
      {
        format: 'json',
        collections: ['app'],
        locales: ['fr'],
        statuses: ['new'],
        tags: ['button'],
        outputDirectory: '',
        filenamePattern: '{locale}',
        protectedTermNotes: false,
        json: {
          structure: 'flat',
          rich: true,
          includeBase: true,
          basePropertyName: '',
          includeStatus: false,
          includeComment: true,
          includeTags: true,
        },
      },
    ],
    invalid: { format: 5 },
    message: 'format must be a string',
  },
  {
    name: 'add locale',
    schema: schemas.addLocaleBody,
    accepted: [{ locale: 'fr-ca' }, { locale: '' }],
    invalid: { locale: 5 },
    message: 'locale must be a string',
  },
  {
    name: 'translate resource',
    schema: schemas.translateResourceBody,
    accepted: [{ key: 'apps.ok' }],
    invalid: { key: 5 },
    message: 'key must be a string',
  },
  {
    name: 'create resource item',
    schema: schemas.createResource,
    accepted: [
      resource,
      { key: 'ok', baseValue: 'OK', comment: '', tags: ['button'], targetFolder: '', translations: [] },
    ],
    invalid: { ...resource, translations: [{ locale: 5, value: 'Oui' }] },
    message: 'translations[0].locale must be a string',
  },
  {
    name: 'create resources',
    schema: schemas.createResourcesBody,
    many: true,
    accepted: [resource, [resource]],
    invalid: [{}],
    message: '[0].key must be a string',
  },
  {
    name: 'delete resources',
    schema: schemas.deleteResourcesBody,
    accepted: [{ keys: ['apps.ok'] }],
    invalid: { keys: [] },
    message: 'keys must be a non-empty array',
  },
  {
    name: 'move resources',
    schema: schemas.moveResourcesBody,
    accepted: [
      { moves: [{ source: 'apps.ok', destination: 'ok' }] },
      { moves: [{ source: 'a', destination: 'b', override: false, toCollection: 'app' }] },
    ],
    invalid: { moves: [{ source: 'a', destination: 5 }] },
    message: 'moves[0].destination must be a string',
  },
  {
    name: 'update resource',
    schema: schemas.updateResourceBody,
    accepted: [
      {
        key: 'apps.ok',
        baseValue: 'OK',
        comment: undefined,
        tags: [],
        moveTo: '',
        locales: { fr: { value: 'Oui', status: 'verified' } },
      },
    ],
    invalid: { key: 'a', locales: { fr: { value: 5 } } },
    message: 'locales.fr.value must be a string',
  },
  {
    name: 'translate locale',
    schema: schemas.translateLocaleBody,
    accepted: [{ locale: 'fr' }],
    invalid: { locale: [] },
    message: 'locale must be a string',
  },
  {
    name: 'create folder',
    schema: schemas.createFolderBody,
    accepted: [{ folderName: 'buttons' }, { folderName: 'buttons', parentPath: '' }],
    invalid: { folderName: 5 },
    message: 'folderName must be a string',
  },
  {
    name: 'delete folder',
    schema: schemas.deleteFolderBody,
    accepted: [{ folderPath: 'apps.buttons' }, { folderPath: '' }],
    invalid: { folderPath: 5 },
    message: 'folderPath must be a string',
  },
  {
    name: 'move folder',
    schema: schemas.moveFolderBody,
    accepted: [
      { sourceFolderPath: 'apps', destinationFolderPath: '', nestUnderDestination: true },
      { sourceFolderPath: 'apps', destinationFolderPath: 'shared', override: false, toCollection: 'app' },
    ],
    invalid: { sourceFolderPath: '', destinationFolderPath: '' },
    message: 'sourceFolderPath must be a non-empty string',
  },
  {
    name: 'tree',
    schema: schemas.treeQuery,
    query: true,
    accepted: [{}, { path: '', includeNested: 'false' }, { path: 'apps', includeNested: 'true' }],
    invalid: { path: ['a', 'b'] },
    message: 'path must be a string',
  },
  {
    name: 'search',
    schema: schemas.searchQuery,
    query: true,
    accepted: [
      {},
      { query: 'OK', maxResults: '100' },
      { query: 'OK', maxResults: '7', mode: 'similar' },
      { query: '', mode: 'unknown' },
    ],
    invalid: { query: ['a', 'b'] },
    message: 'query must be a string',
  },
];

const accepted = endpoints.flatMap(({ name, schema, accepted }) =>
  accepted.map((payload) => ({ name, schema, payload })),
);
const rejected = endpoints.flatMap(({ name, schema, invalid, message, optionalBody, many, query }) => {
  const root = query ? 'query' : 'request body';
  const cases = [
    { name, schema, payload: null, message: `${root} must not be null` },
    { name, schema, payload: [], message: `${root} must ${many ? 'be a non-empty array' : 'be an object'}` },
    { name, schema, payload: invalid, message },
  ];
  if (!optionalBody)
    cases.push({
      name,
      schema,
      payload: undefined,
      message: `${root} must ${many ? 'be an object or a non-empty array' : 'be an object'}`,
    });
  return cases;
});

const additionalRejected: Array<{ name: string; schema: Schema<unknown>; payload: unknown; message: string }> = [
  ...[
    [{}, 'format must be a string'],
    [{ format: 'json', collections: [5] }, 'collections[0] must be a string'],
    [{ format: 'json', locales: 'fr' }, 'locales must be an array'],
    [{ format: 'json', statuses: [5] }, 'statuses[0] must be a string'],
    [{ format: 'json', tags: [false] }, 'tags[0] must be a string'],
    [{ format: 'json', outputDirectory: 5 }, 'outputDirectory must be a string'],
    [{ format: 'json', filenamePattern: false }, 'filenamePattern must be a string'],
    [{ format: 'json', protectedTermNotes: 'no' }, 'protectedTermNotes must be a boolean'],
    [{ format: 'json', json: [] }, 'json must be an object'],
    [{ format: 'json', json: null }, 'json must not be null'],
    [{ format: 'json', json: { structure: 5 } }, 'json.structure must be a string'],
    [{ format: 'json', json: { basePropertyName: false } }, 'json.basePropertyName must be a string'],
    ...['rich', 'includeBase', 'includeStatus', 'includeComment', 'includeTags'].map(
      (field) => [{ format: 'json', json: { [field]: 'yes' } }, `json.${field} must be a boolean`] as const,
    ),
  ].map(([payload, message]) => ({
    name: 'export shape',
    schema: schemas.exportRequestBody,
    payload,
    message: String(message),
  })),
  {
    name: 'collection name type',
    schema: schemas.createCollectionBody,
    payload: { name: 5, collection },
    message: 'name must be a non-empty string',
  },
  {
    name: 'delete keys type',
    schema: schemas.deleteResourcesBody,
    payload: { keys: 'a' },
    message: 'keys must be a non-empty array',
  },
  {
    name: 'folder source type',
    schema: schemas.moveFolderBody,
    payload: { sourceFolderPath: 5, destinationFolderPath: '' },
    message: 'sourceFolderPath must be a non-empty string',
  },
  {
    name: 'collection locale',
    schema: schemas.createCollectionBody,
    payload: { name: 'a', collection: { translationsFolder: '', locales: [5] } },
    message: 'collection.locales[0] must be a string',
  },
  {
    name: 'collection tags null',
    schema: schemas.createCollectionBody,
    payload: { name: 'a', collection: { translationsFolder: '', tags: null } },
    message: 'collection.tags must not be null',
  },
  {
    name: 'partial translation',
    schema: schemas.createCollectionBody,
    payload: { name: 'a', collection: { translationsFolder: '', translation: { enabled: true } } },
    message: 'collection.translation.provider must be a string',
  },
  {
    name: 'terminology container',
    schema: schemas.updateConfigBody,
    payload: { preferredTerminology: {} },
    message: 'preferredTerminology must be an array',
  },
  {
    name: 'folder nest flag',
    schema: schemas.moveFolderBody,
    payload: { sourceFolderPath: 'a', destinationFolderPath: '', nestUnderDestination: 'yes' },
    message: 'nestUnderDestination must be a boolean',
  },
  {
    name: 'folder destination',
    schema: schemas.moveFolderBody,
    payload: { sourceFolderPath: 'a', destinationFolderPath: null },
    message: 'destinationFolderPath must not be null',
  },
  {
    name: 'folder destination missing',
    schema: schemas.moveFolderBody,
    payload: { sourceFolderPath: 'a' },
    message: 'destinationFolderPath must be a string',
  },
  {
    name: 'folder parent',
    schema: schemas.createFolderBody,
    payload: { folderName: 'a', parentPath: 5 },
    message: 'parentPath must be a string',
  },
  {
    name: 'resource tags',
    schema: schemas.createResourcesBody,
    payload: { key: 'a', baseValue: 'A', tags: 'x' },
    message: 'tags must be an array',
  },
  {
    name: 'move override',
    schema: schemas.moveResourcesBody,
    payload: { moves: [{ source: 'a', destination: 'b', override: 'yes' }] },
    message: 'moves[0].override must be a boolean',
  },
  {
    name: 'search limit',
    schema: schemas.searchQuery,
    payload: { maxResults: 'abc' },
    message: 'maxResults must be a positive integer',
  },
  ...['0', ''].map((maxResults) => ({
    name: 'search non-positive limit',
    schema: schemas.searchQuery,
    payload: { maxResults },
    message: 'maxResults must be a positive integer',
  })),
  {
    name: 'search repeated limit',
    schema: schemas.searchQuery,
    payload: { maxResults: ['7', '8'] },
    message: 'maxResults must be a positive integer',
  },
  {
    name: 'tree repeated flag',
    schema: schemas.treeQuery,
    payload: { includeNested: ['true', 'false'] },
    message: 'includeNested must be a string',
  },
];

describe('DTO shape schemas', () => {
  it('requires at least one base-value character while leaving whitespace validation to core', () => {
    for (const schema of [schemas.createResource, schemas.updateResourceBody]) {
      expect(() => new SchemaPipe<unknown>(schema, 'request body').transform({ key: 'ok', baseValue: '' })).toThrow(
        exactMessage('baseValue must have at least 1 character(s)'),
      );
      const payload = { key: 'ok', baseValue: '   ' };
      expect(schema(payload, '')).toBe(payload);
    }
    expect(schemas.updateResourceBody({ key: 'ok' }, '')).toEqual({ key: 'ok' });
  });

  it.each(accepted)('accepts $name tracker payload unchanged', ({ schema, payload }) => {
    expect(schema(payload, '')).toBe(payload);
  });

  it.each([...rejected, ...additionalRejected])('rejects $name: $message', ({ name, schema, payload, message }) => {
    const root = name.startsWith('search') || name.startsWith('tree') ? 'query' : 'request body';
    expect(() => new SchemaPipe(schema, root).transform(payload)).toThrow(exactMessage(message));
  });
});

interface RouteArgMetadata {
  index: number;
  pipes?: unknown[];
}
type ModuleReference = Type<unknown> | DynamicModule | ForwardReference<() => ModuleReference> | Promise<DynamicModule>;

/** Read module metadata without instantiating production providers or opening sockets. */
async function moduleControllers(root: ModuleReference): Promise<Set<Type<unknown>>> {
  const controllers = new Set<Type<unknown>>();
  const visited = new Set<ModuleReference>();

  async function walk(reference: ModuleReference): Promise<void> {
    const module = await reference;
    if (visited.has(module)) return;
    visited.add(module);

    if (typeof module === 'object' && 'forwardRef' in module) {
      await walk(module.forwardRef());
      return;
    }

    if (typeof module === 'function') {
      const declared: Type<unknown>[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? [];
      const imports: ModuleReference[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? [];
      for (const controller of declared) controllers.add(controller);
      for (const imported of imports) await walk(imported);
      return;
    }

    await walk(module.module);
    for (const controller of module.controllers ?? []) controllers.add(controller);
    for (const imported of module.imports ?? []) await walk(imported as ModuleReference);
  }

  await walk(root);
  return controllers;
}

function expectSchemaPipes(controllers: Iterable<Type<unknown>>): void {
  for (const controller of controllers) {
    const methods = new Set<string>();
    let prototype: object | null = controller.prototype;
    while (prototype !== null && prototype !== Object.prototype) {
      for (const method of Object.getOwnPropertyNames(prototype)) methods.add(method);
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }
    for (const method of methods) {
      const args: Record<string, RouteArgMetadata> = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {};
      for (const [key, arg] of Object.entries(args)) {
        if (key === `${RouteParamtypes.BODY}:${arg.index}` || key === `${RouteParamtypes.QUERY}:${arg.index}`) {
          expect({ controller: controller.name, method, key, pipe: arg.pipes?.[0] }).toEqual({
            controller: controller.name,
            method,
            key,
            pipe: expect.any(SchemaPipe),
          });
        }
      }
    }
  }
}

const wiring = [
  [ConfigController, 'updateConfig', RouteParamtypes.BODY, schemas.updateConfigBody],
  [CollectionsController, 'createCollection', RouteParamtypes.BODY, schemas.createCollectionBody],
  [CollectionsController, 'updateCollectionByName', RouteParamtypes.BODY, schemas.updateCollectionBody],
  [BundlesController, 'dryRun', RouteParamtypes.BODY, schemas.bundleDryRunBody],
  [BundlesController, 'createBundle', RouteParamtypes.BODY, schemas.createBundleBody],
  [BundlesController, 'updateBundle', RouteParamtypes.BODY, schemas.updateBundleBody],
  [BundlesController, 'generateBundle', RouteParamtypes.BODY, schemas.generateBundleBody],
  [ExportsController, 'dryRun', RouteParamtypes.BODY, schemas.exportRequestBody],
  [ExportsController, 'start', RouteParamtypes.BODY, schemas.exportRequestBody],
  [ImportsController, 'start', RouteParamtypes.BODY, schemas.importRequestBody],
  [ImportsController, 'dryRun', RouteParamtypes.BODY, schemas.importRequestBody],
  [ImportsController, 'listSources', RouteParamtypes.QUERY, schemas.importSourcesQuery],
  [LocalesController, 'addLocale', RouteParamtypes.BODY, schemas.addLocaleBody],
  [FoldersController, 'create', RouteParamtypes.BODY, schemas.createFolderBody],
  [FoldersController, 'delete', RouteParamtypes.BODY, schemas.deleteFolderBody],
  [FoldersController, 'move', RouteParamtypes.BODY, schemas.moveFolderBody],
  [ResourcesController, 'translateResource', RouteParamtypes.BODY, schemas.translateResourceBody],
  [ResourcesController, 'createResources', RouteParamtypes.BODY, schemas.createResourcesBody],
  [ResourcesController, 'delete', RouteParamtypes.BODY, schemas.deleteResourcesBody],
  [ResourcesController, 'move', RouteParamtypes.BODY, schemas.moveResourcesBody],
  [ResourcesController, 'update', RouteParamtypes.BODY, schemas.updateResourceBody],
  [ResourcesController, 'startTranslationJob', RouteParamtypes.BODY, schemas.translateLocaleBody],
  [ResourcesController, 'getTree', RouteParamtypes.QUERY, schemas.treeQuery],
  [ResourcesController, 'search', RouteParamtypes.QUERY, schemas.searchQuery],
] as const;

describe('HTTP schema wiring', () => {
  it('constructs all application controllers without opening a port', async () => {
    const controllers = [...(await moduleControllers(AppModule))];
    const module = await Test.createTestingModule({
      controllers,
      providers: [
        RouteCollectionPipe,
        { provide: AppService, useValue: {} },
        { provide: ConfigService, useValue: { getConfig: jest.fn() } },
        { provide: CollectionIndex, useValue: {} },
        { provide: TranslationJobService, useValue: {} },
        { provide: BundleJobService, useValue: {} },
        { provide: ExportJobService, useValue: {} },
        { provide: ImportJobService, useValue: {} },
        { provide: ImportSourceService, useValue: {} },
        { provide: ImportUploadService, useValue: {} },
      ],
    }).compile();
    for (const controller of controllers) expect(module.get(controller)).toBeDefined();
    await module.close();
  });

  it.each(wiring)('attaches the declared schema to %p.%s', (controller, method, type, schema) => {
    const args: Record<string, RouteArgMetadata> = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {};
    const matching = Object.entries(args).filter(([key, arg]) => key === `${type}:${arg.index}`);
    expect(matching).toHaveLength(1);
    const pipe = matching[0]?.[1].pipes?.[0];
    expect(pipe).toBeInstanceOf(SchemaPipe);
    if (pipe instanceof SchemaPipe) expect(pipe.schema).toBe(schema);
  });

  it('leaves no body or query argument without a SchemaPipe', async () => {
    const controllers = await moduleControllers(AppModule);
    expect(controllers.has(AppController)).toBe(true);
    expectSchemaPipes(controllers);
  });

  it('walks imported, forward-referenced and dynamic modules without repeating cycles', async () => {
    @Controller('root')
    class RootController {}
    @Controller('leaf')
    class LeafController {}
    @Controller('dynamic')
    class DynamicController {}

    @Module({ controllers: [LeafController], imports: [forwardRef(() => RootModule)] })
    class LeafModule {}
    @Module({
      controllers: [RootController],
      imports: [
        LeafModule,
        forwardRef(() => LeafModule),
        Promise.resolve({ module: LeafModule, controllers: [DynamicController], imports: [LeafModule] }),
      ],
    })
    class RootModule {}

    expect(await moduleControllers(RootModule)).toEqual(new Set([RootController, LeafController, DynamicController]));
  });

  it.each([
    ['body', Body],
    ['query', Query],
  ] as const)('rejects a bare %s argument on a controller outside the identity table', async (_label, decorate) => {
    @Controller('unlisted')
    class UnlistedController {
      @Post()
      route(@decorate() value: unknown): void {
        void value;
      }
    }
    @Module({ controllers: [UnlistedController] })
    class ImportedModule {}
    @Module({ imports: [ImportedModule] })
    class RootModule {}

    const controllers = await moduleControllers(RootModule);
    expect(controllers.has(UnlistedController)).toBe(true);
    expect(() => expectSchemaPipes(controllers)).toThrow();
  });
});
