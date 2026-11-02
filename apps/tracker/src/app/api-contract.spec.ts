import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createServiceFactory } from '@ngneat/spectator/vitest';
import {
  type ApiRoute,
  type LingoTrackerConfigDto,
  matchApiRoute,
  type UpdateConfigDto,
} from '@simoncodes-ca/data-transfer';
import type { AppRuntime } from '@simoncodes-ca/domain';
import { firstValueFrom } from 'rxjs';
import * as ts from 'typescript';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { BrowserApiService } from './browser/services/browser-api.service';
import { provideTrackerHttpClient } from './shared/api-error/api-error';

const NON_API_HTTP_CLIENT_FILES = [
  'app/app.config.ts', // Installs the shared tracker HTTP client providers.
  'app/shared/api-error/api-error.ts', // Configures HttpClient and its error interceptor; makes no requests.
  'app/shared/services/transloco-loader.ts', // Loads translation assets rather than API endpoints.
] as const;

// Covers direct HttpClient calls in apps/tracker/src only, not wrappers or re-exports.
// Element access (http['get']), destructured methods and method references are not detected.
function checkHttpRoutes(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
  requireDirectCall = true,
): { failures: string[]; requestCount: number } {
  const failures: string[] = [];
  let requestCount = 0;
  const verbs = new Set(['get', 'post', 'put', 'patch', 'delete', 'request']);
  const importsHttpClient = file.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@angular/common/http'
    )
      return false;
    const bindings = statement.importClause?.namedBindings;
    return (
      bindings &&
      (ts.isNamespaceImport(bindings) ||
        (ts.isNamedImports(bindings) &&
          bindings.elements.some((element) => (element.propertyName ?? element.name).text === 'HttpClient')))
    );
  });
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      const method = callee.name.text;
      const receiver = checker.getNonNullableType(checker.getTypeAtLocation(callee.expression));
      const members = receiver.isUnion() ? receiver.types : [receiver];
      const unresolved = members.some((member) => (member.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0);
      const httpClient = members.some((member) => member.getSymbol()?.name === 'HttpClient');
      if (verbs.has(method) && importsHttpClient && unresolved) {
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        failures.push(`${file.fileName}:${line}: Cannot verify HTTP call on an any or unresolved receiver`);
      } else if (verbs.has(method) && httpClient) {
        requestCount++;
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        const fail = (reason: string) => failures.push(`${file.fileName}:${line}: ${reason}`);
        const requestVerb = node.arguments[0];
        const verb =
          method === 'request'
            ? requestVerb && ts.isStringLiteral(requestVerb)
              ? requestVerb.text
              : undefined
            : method.toUpperCase();
        const url = node.arguments[method === 'request' ? 1 : 0];
        const builder =
          url && ts.isCallExpression(url) && ts.isIdentifier(url.expression)
            ? checker.getSymbolAtLocation(url.expression)
            : undefined;
        const sharedBuilder = builder?.declarations?.some((declaration) => {
          if (!ts.isImportSpecifier(declaration)) return false;
          const imported = (declaration.propertyName ?? declaration.name).text;
          const importDeclaration = declaration.parent.parent.parent;
          return (
            imported === 'apiPath' &&
            ts.isImportDeclaration(importDeclaration) &&
            ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
            importDeclaration.moduleSpecifier.text === '@simoncodes-ca/data-transfer'
          );
        });
        // Static translation assets are outside the API manifest. This exemption
        // depends on the URL itself, never on the file allowlist.
        const translationAsset =
          verb === 'GET' &&
          url &&
          ts.isTemplateExpression(url) &&
          url.head.text === '/assets/i18n/' &&
          url.templateSpans.length === 1 &&
          url.templateSpans[0]?.literal.text === '.json';
        if (translationAsset) {
          // The loader's existing asset request is not an API request.
        } else if (!url || !ts.isCallExpression(url) || !sharedBuilder) {
          fail('HTTP URL must be a direct call to the shared apiPath builder');
        } else {
          const route = url.arguments[0];
          if (!route || !ts.isStringLiteral(route)) {
            fail('apiPath route must be a string literal');
          } else if (verb === undefined) {
            fail('HttpClient.request verb must be a string literal');
          } else if (route.text.split(' ')[0] !== verb) {
            fail(`HTTP verb ${verb} does not match apiPath route ${route.text}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (requireDirectCall && requestCount === 0) {
    failures.push(
      `${file.fileName}:1: HttpClient user without direct calls must be listed in NON_API_HTTP_CLIENT_FILES`,
    );
  }
  return { failures, requestCount };
}

function inlineRouteFailures(source: string, requireDirectCall = true): string[] {
  const path = 'inline.ts';
  // Minimal type declarations let these parser/checker tests run without loading Angular.
  const file = ts.createSourceFile(
    path,
    `
    import { HttpClient as ImportedHttpClient } from '@angular/common/http';
    declare class HttpClient {}
    declare class Map { get(key: string): unknown; }
    declare function inject<T>(token: new () => T): T;
    import { apiPath } from '@simoncodes-ca/data-transfer';
    ${source}
  `,
    ts.ScriptTarget.Latest,
    true,
  );
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, strictNullChecks: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === path ? file : undefined);
  const program = ts.createProgram([path], options, host);
  return checkHttpRoutes(file, program.getTypeChecker(), requireDirectCall).failures;
}

describe('config runtime DTO contract', () => {
  it('exposes an optional domain runtime without allowing config updates to set it', () => {
    expectTypeOf<LingoTrackerConfigDto['runtime']>().toEqualTypeOf<AppRuntime | undefined>();
    expectTypeOf<Extract<'runtime', keyof UpdateConfigDto>>().toEqualTypeOf<never>();
  });
});

describe('HTTP route AST checker', () => {
  it('accepts matching calls on injected fields and typed variables, ignoring other get methods', () => {
    expect(
      inlineRouteFailures(`
      class Service {
        readonly #client = inject(HttpClient);
        load() { return this.#client.get(apiPath('GET /api/config')); }
      }
      declare const client: HttpClient;
      client.request('PUT', apiPath('PUT /api/config'), {});
      declare const params: { get(key: string): string };
      params.get('query');
      new Map().get('key');
    `),
    ).toEqual([]);
  });

  it('rejects verb mismatches for shorthand and request calls with file:line diagnostics', () => {
    const failures = inlineRouteFailures(`
      declare const client: HttpClient;
      client.post(apiPath('GET /api/config'), {});
      client.request('DELETE', apiPath('PUT /api/config'));
      class Service {
        readonly #transport = inject(HttpClient);
        readonly connection: HttpClient = inject(HttpClient);
        load() {
          this.#transport.post(apiPath('GET /api/config'), {});
          this.connection.get(apiPath('PUT /api/config'));
        }
      }
    `);
    expect(failures).toHaveLength(4);
    for (const failure of failures) expect(failure).toMatch(/^inline\.ts:\d+: HTTP verb/);
  });

  it('rejects raw URLs even when an unused builder call would offset a count', () => {
    const failures = inlineRouteFailures(`
      declare const client: HttpClient;
      apiPath('GET /api/config');
      client.get('/api/config');
    `);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^inline\.ts:\d+: HTTP URL must/);
  });

  it('checks generic calls whose response types contain semicolons', () => {
    const failures = inlineRouteFailures(`
      declare const client: HttpClient;
      client.get<{ a: string; b: number }>(apiPath('GET /api/config'));
      client.get<{ a: string; b: number }>('/api/config');
      client.post<{ a: string; b: number }>(apiPath('GET /api/config'), {});
    `);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('HTTP URL must');
    expect(failures[1]).toContain('HTTP verb POST');
  });

  it('requires HttpClient users without direct calls to be explicitly listed', () => {
    expect(inlineRouteFailures('declare const client: HttpClient;')).toEqual([
      'inline.ts:1: HttpClient user without direct calls must be listed in NON_API_HTTP_CLIENT_FILES',
    ]);
  });

  it('checks nullable HttpClient receivers and unions containing HttpClient', () => {
    const failures = inlineRouteFailures(`
      declare const nullable: HttpClient | undefined;
      nullable?.get(apiPath('GET /api/config'));
      nullable?.post(apiPath('GET /api/config'), {});
      declare const union: HttpClient | { get(url: string): unknown };
      union.get('/api/config');
    `);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatch(/^inline\.ts:\d+: HTTP verb POST/);
    expect(failures[1]).toMatch(/^inline\.ts:\d+: HTTP URL must/);
  });

  it('reports any and error-typed receivers even alongside a valid HttpClient call', () => {
    const failures = inlineRouteFailures(`
      declare const client: HttpClient;
      client.get(apiPath('GET /api/config'));
      declare const untyped: any;
      untyped.get('/api/config');
      declare const unresolved: MissingHttpClient;
      unresolved.post(apiPath('POST /api/collections'), {});
    `);
    expect(failures).toHaveLength(2);
    for (const failure of failures) expect(failure).toMatch(/^inline\.ts:\d+: Cannot verify HTTP call/);
  });

  it('scans API calls in allowlisted files while exempting only the direct-call requirement', () => {
    expect(inlineRouteFailures('declare const client: HttpClient;', false)).toEqual([]);
    const failures = inlineRouteFailures(
      `
      declare const client: HttpClient;
      declare const lang: string;
      client.get(\`/assets/i18n/\${lang}.json\`);
      client.get('/api/config');
      client.post(apiPath('GET /api/config'), {});
    `,
      false,
    );
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('HTTP URL must');
    expect(failures[1]).toContain('HTTP verb POST');
  });

  it('requires literal routes and literal request verbs', () => {
    const failures = inlineRouteFailures(`
      declare const client: HttpClient;
      const route = 'GET /api/config';
      const verb = 'GET';
      client.get(apiPath(route));
      client.request(verb, apiPath('GET /api/config'));
    `);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('apiPath route must be a string literal');
    expect(failures[1]).toContain('HttpClient.request verb must be a string literal');
  });
});

describe('tracker HTTP route contract', () => {
  let browser: BrowserApiService;
  let httpMock: HttpTestingController;
  const createService = createServiceFactory({
    service: BrowserApiService,
    providers: [provideTrackerHttpClient(), provideHttpClientTesting()],
  });

  beforeEach(() => {
    const spectator = createService();
    browser = spectator.service;
    httpMock = spectator.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('requires API HttpClient users to build their request paths with apiPath', () => {
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
      .map((path) => path.split(sep).join('/'));
    for (const path of NON_API_HTTP_CLIENT_FILES) expect(actual).toContain(path);
    const configPath = resolve(sourceRoot, '../tsconfig.spec.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
    const program = ts.createProgram(
      actual.map((path) => resolve(sourceRoot, path)),
      parsed.options,
    );
    const checker = program.getTypeChecker();
    const failures: string[] = [];
    const scanned = new Map<string, number>();
    for (const path of actual) {
      const file = program.getSourceFile(resolve(sourceRoot, path));
      expect(file, path).toBeDefined();
      if (file) {
        const requireDirectCall = !NON_API_HTTP_CLIENT_FILES.some((exception) => exception === path);
        const result = checkHttpRoutes(file, checker, requireDirectCall);
        scanned.set(path, result.requestCount);
        failures.push(...result.failures);
      }
    }
    for (const path of [
      'app/browser/services/browser-api.service.ts',
      'app/collections/services/collections-api.service.ts',
    ]) {
      expect(scanned.has(path), `${path} must be scanned`).toBe(true);
      expect(scanned.get(path), `${path} must have checked requests`).toBeGreaterThan(0);
    }
    expect(failures).toEqual([]);
  }, 30_000);

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
