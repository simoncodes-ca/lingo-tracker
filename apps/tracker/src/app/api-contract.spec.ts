import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createServiceFactory } from '@ngneat/spectator/vitest';
import { API_ROUTES, type ApiRoute, type BundleDefinitionDto, matchApiRoute } from '@simoncodes-ca/data-transfer';
import { firstValueFrom, type Observable } from 'rxjs';
import * as ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserApiService } from './browser/services/browser-api.service';
import { CollectionsApiService } from './collections/services/collections-api.service';
import { provideTrackerHttpClient } from './shared/api-error/api-error';

const HTTP_CLIENT_FILES = [
  'app/browser/services/browser-api.service.ts',
  'app/collections/services/collections-api.service.ts',
  'app/app.config.ts', // Installs the shared tracker HTTP client providers.
  'app/shared/api-error/api-error.ts', // Configures HttpClient and its error interceptor; makes no requests.
  'app/shared/services/transloco-loader.ts', // Loads translation assets rather than API endpoints.
] as const;

const NOT_USED_BY_TRACKER = [
  { method: 'GET', path: '/api/health', reason: 'Health is used by server monitoring, not these tracker services.' },
  {
    method: 'POST',
    path: '/api/collections/:collectionName/locales',
    reason: 'These tracker services do not expose locale addition.',
  },
  {
    method: 'DELETE',
    path: '/api/collections/:collectionName/locales/:locale',
    reason: 'These tracker services do not expose locale removal.',
  },
  {
    method: 'POST',
    path: '/api/collections/:collectionName/resources/translate-locale',
    reason: 'These tracker services do not start whole-locale translation jobs.',
  },
  {
    method: 'GET',
    path: '/api/collections/:collectionName/resources/translate-locale/:jobId',
    reason: 'These tracker services do not poll whole-locale translation jobs.',
  },
] as const satisfies readonly (ApiRoute & { readonly reason: string })[];

function routeKey(route: ApiRoute): string {
  return `${route.method} ${route.path}`;
}

function publicMethods(prototype: object): string[] {
  return Object.getOwnPropertyNames(prototype)
    .filter(
      (name) => name !== 'constructor' && typeof Object.getOwnPropertyDescriptor(prototype, name)?.value === 'function',
    )
    .sort();
}

describe('tracker HTTP route contract', () => {
  let browser: BrowserApiService;
  let collections: CollectionsApiService;
  let httpMock: HttpTestingController;
  const createService = createServiceFactory({
    service: BrowserApiService,
    providers: [provideTrackerHttpClient(), provideHttpClientTesting()],
  });

  beforeEach(() => {
    const spectator = createService();
    browser = spectator.service;
    collections = spectator.inject(CollectionsApiService);
    httpMock = spectator.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('requires every HttpClient user to be accounted for in the contract', () => {
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const actual = readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(path))
      .filter((path) => {
        const source = readFileSync(resolve(sourceRoot, path), 'utf8');
        const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
        return file.statements.some((statement) => {
          if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
          const bindings = statement.importClause?.namedBindings;
          const fromAngularHttp = statement.moduleSpecifier.text === '@angular/common/http';
          // Namespace imports can access HttpClient without a named import.
          if (bindings && ts.isNamespaceImport(bindings)) return fromAngularHttp;
          if (!bindings || !ts.isNamedImports(bindings)) return false;
          return bindings.elements.some((element) => {
            const importedName = (element.propertyName ?? element.name).text;
            return (
              (fromAngularHttp &&
                ['HttpClient', 'HttpBackend', 'httpResource', 'provideHttpClient'].includes(importedName)) ||
              importedName === 'provideTrackerHttpClient'
            );
          });
        });
      })
      .map((path) => path.split(sep).join('/'))
      .sort();
    expect(
      actual,
      'A new HttpClient user must be added to the API contract: exercise its requests and update HTTP_CLIENT_FILES, or document why it makes no API requests.',
    ).toEqual([...HTTP_CLIENT_FILES].sort());
  });

  it('exercises every public method and accounts for every manifest route', async () => {
    const name = 'My Collection';
    const bundle: BundleDefinitionDto = { bundleName: 'main.{locale}', dist: './dist/i18n', collections: 'All' };
    const browserCalls = {
      getCacheStatus: () => browser.getCacheStatus(name),
      getResourceTree: () => browser.getResourceTree(name, 'common.buttons', true),
      searchTranslations: () => browser.searchTranslations(name, 'Hello / world', 10, 'similar'),
      createResource: () => browser.createResource(name, { key: 'greeting', baseValue: 'Hello' }),
      updateResource: () => browser.updateResource(name, { key: 'greeting', baseValue: 'Hi' }),
      deleteResource: () => browser.deleteResource(name, ['greeting']),
      createFolder: () => browser.createFolder(name, 'buttons', 'common'),
      deleteFolder: () => browser.deleteFolder(name, 'common.buttons'),
      moveResource: () => browser.moveResource(name, 'greeting', 'common.greeting'),
      moveFolder: () => browser.moveFolder(name, 'common.buttons', 'shared.buttons'),
      translateResource: () => browser.translateResource(name, 'greeting'),
    } satisfies Record<keyof BrowserApiService, () => Observable<unknown>>;
    const collectionsCalls = {
      getConfig: () => collections.getConfig(),
      createCollection: () =>
        collections.createCollection({ name, collection: { translationsFolder: './translations' } }),
      updateCollection: () =>
        collections.updateCollection(name, { collection: { translationsFolder: './translations' } }),
      deleteCollection: () => collections.deleteCollection(name),
      updateConfig: () => collections.updateConfig({ protectedTerms: ['Lingo Tracker'] }),
      createBundle: () => collections.createBundle({ name: 'My Bundle', bundle }),
      updateBundle: () => collections.updateBundle('My Bundle', { bundle }),
      deleteBundle: () => collections.deleteBundle('My Bundle'),
      dryRunBundle: () => collections.dryRunBundle({ name: 'My Bundle', bundle }),
      generateBundle: () => collections.generateBundle('My Bundle'),
      getBundleJob: () => collections.getBundleJob('job with spaces'),
    } satisfies Record<keyof CollectionsApiService, () => Observable<unknown>>;

    const used = new Set<string>();
    for (const calls of [browserCalls, collectionsCalls]) {
      for (const [methodName, call] of Object.entries(calls)) {
        const result = firstValueFrom(call());
        const requests = httpMock.match(() => true);
        // Every current public method makes exactly one request on its normal path.
        // Tree indexing's multi-request path is covered separately below.
        for (const request of requests) request.flush({});
        await result;
        expect(requests, methodName).toHaveLength(1);
        for (const request of requests) {
          const route = matchApiRoute(request.request.method, request.request.urlWithParams);
          expect(route, `${methodName}: ${request.request.method} ${request.request.urlWithParams}`).toBeDefined();
          if (route !== undefined) used.add(routeKey(route));
        }
      }
    }

    // Adding a method without a call case must fail, including at runtime.
    expect(Object.keys(browserCalls).sort()).toEqual(publicMethods(BrowserApiService.prototype));
    expect(Object.keys(collectionsCalls).sort()).toEqual(publicMethods(CollectionsApiService.prototype));
    const excluded = NOT_USED_BY_TRACKER.map(routeKey);
    expect(new Set(excluded).size).toBe(excluded.length);
    for (const route of NOT_USED_BY_TRACKER) {
      expect(route.reason.length).toBeGreaterThan(0);
      expect(used.has(routeKey(route)), routeKey(route)).toBe(false);
    }
    expect([...used, ...excluded].sort()).toEqual(API_ROUTES.map(routeKey).sort());
  });

  it('matches all three requests when a tree read waits for indexing', async () => {
    const result = firstValueFrom(browser.getResourceTree('My Collection'));
    const routes: (ApiRoute | undefined)[] = [];
    const flushBatch = (body: object, status = 200) => {
      const requests = httpMock.match(() => true);
      expect(requests).toHaveLength(1);
      for (const request of requests) {
        routes.push(matchApiRoute(request.request.method, request.request.urlWithParams));
        request.flush(body, { status, statusText: status === 202 ? 'Accepted' : 'OK' });
      }
    };
    flushBatch({ message: 'Indexing' }, 202);
    flushBatch({ status: 'ready' });
    flushBatch({ path: '', resources: [], children: [] });
    await result;
    expect(routes).toHaveLength(3);
    for (const route of routes) expect(route).toBeDefined();
    expect(routes.map((route) => route?.path)).toEqual([
      '/api/collections/:collectionName/resources/tree',
      '/api/collections/:collectionName/resources/cache/status',
      '/api/collections/:collectionName/resources/tree',
    ]);
  });
});
