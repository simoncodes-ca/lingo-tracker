import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type DynamicModule,
  type ForwardReference,
  type INestApplication,
  RequestMethod,
  type Type,
} from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { addResource, CONFIG_FILENAME, type LingoTrackerConfig, openCollection } from '@simoncodes-ca/core';
import * as providerFactory from '../../../../../libs/core/src/lib/translation/translation-provider-factory';
import { AppModule } from '../app.module';
import { CollectionIndex } from '../cache/collection-index.service';

type ModuleReference = Type<unknown> | DynamicModule | ForwardReference<() => ModuleReference> | Promise<DynamicModule>;
interface WritingRoute {
  method: string;
  path: string;
}

/** Discover controllers through the same module graph that Nest mounts. */
async function writingRoutes(root: ModuleReference): Promise<WritingRoute[]> {
  const controllers = new Set<Type<unknown>>();
  const visited = new Set<ModuleReference>();
  async function walk(reference: ModuleReference): Promise<void> {
    const module = await reference;
    if (visited.has(module)) return;
    visited.add(module);
    if (typeof module === 'object' && 'forwardRef' in module) {
      await walk(module.forwardRef());
    } else if (typeof module === 'function') {
      const declared: Type<unknown>[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? [];
      const imports: ModuleReference[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? [];
      for (const controller of declared) controllers.add(controller);
      for (const imported of imports) await walk(imported);
    } else {
      await walk(module.module);
      for (const controller of module.controllers ?? []) controllers.add(controller);
      for (const imported of module.imports ?? []) await walk(imported as ModuleReference);
    }
  }
  await walk(root);
  const routes: WritingRoute[] = [];
  for (const controller of controllers) {
    const prefix: string = Reflect.getMetadata(PATH_METADATA, controller) ?? '';
    if (prefix !== 'collections' && !prefix.startsWith('collections/')) continue;
    let prototype: Record<string, unknown> | null = controller.prototype;
    const seen = new Set<string>();
    while (prototype && prototype !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (seen.has(name)) continue;
        seen.add(name);
        const handler = prototype[name];
        if (typeof handler !== 'function') continue;
        const method: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler);
        if (
          method === undefined ||
          ![RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE].includes(method)
        ) {
          continue;
        }
        const suffix: string = Reflect.getMetadata(PATH_METADATA, handler) ?? '';
        const path = [prefix, suffix].filter((part) => part && part !== '/').join('/');
        routes.push({ method: RequestMethod[method], path });
      }
      prototype = Object.getPrototypeOf(prototype) as Record<string, unknown> | null;
    }
  }
  return routes;
}

// A new writing route must supply a successful request fixture; discovery cannot silently omit it.
const requests: Record<string, { body?: unknown; collectionFolder?: string; destinationFolder?: string }> = {
  'POST collections': {
    body: { name: 'added', collection: { translationsFolder: 'added' } },
    collectionFolder: 'added',
  },
  'PUT collections/:collectionName': {
    body: { collection: { translationsFolder: 'translations', tags: ['updated'] } },
  },
  'DELETE collections/:collectionName': {},
  'POST collections/:collectionName/resources': { body: { key: 'created', baseValue: 'Created' } },
  'PATCH collections/:collectionName/resources': { body: { key: 'source.ok', baseValue: 'Changed' } },
  'DELETE collections/:collectionName/resources': { body: { keys: ['source.ok'] } },
  'POST collections/:collectionName/resources/move': {
    body: { moves: [{ source: 'source.ok', destination: 'moved.ok', toCollection: 'other' }] },
    destinationFolder: 'other',
  },
  'POST collections/:collectionName/resources/translate': { body: { key: 'source.ok' } },
  'POST collections/:collectionName/resources/translate-locale': { body: { locale: 'fr' } },
  'POST collections/:collectionName/folders': { body: { folderName: 'created' } },
  'DELETE collections/:collectionName/folders': { body: { folderPath: 'source' } },
  'POST collections/:collectionName/folders/move': {
    body: { sourceFolderPath: 'source', destinationFolderPath: 'moved', toCollection: 'other' },
    destinationFolder: 'other',
  },
  'POST collections/:collectionName/locales': { body: { locale: 'de' } },
  'DELETE collections/:collectionName/locales/:locale': {},
};

describe('Collection Index mutation wiring over HTTP', () => {
  let app: INestApplication | undefined;
  let project = '';
  let baseUrl = '';
  const originalCwd = process.cwd();

  beforeAll(async () => {
    // Only the external translation provider is replaced. Core reads and writes real files.
    jest.spyOn(providerFactory, 'createTranslationProvider').mockReturnValue({
      translate: async (items) => items.map(() => ({ translatedText: 'Bonjour', provider: 'fixture' })),
      getCapabilities: () => ({ supportsBatch: true, maxBatchSize: 100, supportsFormality: false }),
    });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (project) rmSync(project, { recursive: true, force: true });
    await app?.close();
    jest.restoreAllMocks();
  });

  it('delivers a mutation to the real index for every discovered writing route', async () => {
    if (!app) throw new Error('HTTP app was not initialized');
    const routes = await writingRoutes(AppModule);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.map((route) => `${route.method} ${route.path}`).sort()).toEqual(Object.keys(requests).sort());
    const index = app.get(CollectionIndex);
    const sink = jest.spyOn(index, 'sink');
    for (const route of routes) {
      process.chdir(originalCwd);
      if (project) rmSync(project, { recursive: true, force: true });
      project = mkdtempSync(join(tmpdir(), 'lingo-mutation-http-'));
      process.chdir(project);
      // The API opens relative collection paths against cwd, which macOS resolves through /var.
      project = process.cwd();
      const config: LingoTrackerConfig = {
        exportFolder: 'export',
        importFolder: 'import',
        baseLocale: 'en',
        locales: ['en', 'fr'],
        collections: { main: { translationsFolder: 'translations' }, other: { translationsFolder: 'other' } },
      };
      await addResource(openCollection(config, 'main'), { key: 'source.ok', baseValue: 'Hello' });
      // Translation requires an API key before the provider factory is called; use an existing,
      // non-secret environment value so this test never changes global environment settings.
      config.translation = { enabled: true, provider: 'google-translate', apiKeyEnv: 'PATH', delayMs: 0 };
      writeFileSync(join(project, CONFIG_FILENAME), JSON.stringify(config));
      const collection = openCollection(config, 'main');
      index.tree(collection, '');
      index.tree(collection, '');
      sink.mockClear();
      const fixture = requests[`${route.method} ${route.path}`];
      if (!fixture) throw new Error(`Missing mutation fixture: ${route.method} ${route.path}`);
      const path = route.path.replace(':collectionName', 'main').replace(':locale', 'fr');
      const response = await fetch(`${baseUrl}/${path}`, {
        method: route.method,
        headers: { 'content-type': 'application/json' },
        ...(fixture.body !== undefined && { body: JSON.stringify(fixture.body) }),
      });
      const body: Record<string, unknown> = await response.json();
      if (!response.ok) {
        throw new Error(`${route.method} ${route.path}: ${response.status} ${JSON.stringify(body)}`);
      }
      if (route.path.endsWith('/translate-locale')) {
        if (typeof body.jobId !== 'string') throw new Error('Translation route did not return a job ID');
        let status: unknown;
        for (let attempt = 0; attempt < 100; attempt++) {
          const poll = await fetch(`${baseUrl}/${path}/${body.jobId}`);
          const job: Record<string, unknown> = await poll.json();
          status = job.status;
          if (status === 'completed' || status === 'failed') break;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(status).toBe('completed');
      }
      const reportedFolders = sink.mock.calls.map(([mutation]) => mutation.translationsFolder);
      const expectedFolders = [resolve(project, fixture.collectionFolder ?? 'translations')];
      if (fixture.destinationFolder) expectedFolders.push(resolve(project, fixture.destinationFolder));
      expect({ route, reportedFolders }).toEqual({ route, reportedFolders: expect.arrayContaining(expectedFolders) });
    }
  });
});
