import { type DynamicModule, type ForwardReference, RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner } from '@nestjs/core';
import { API_ROUTES, type ApiRoute } from '@simoncodes-ca/data-transfer';
import { AppModule } from './app.module';

type ModuleImport = Type<unknown> | DynamicModule | ForwardReference | Promise<DynamicModule>;

/** Read the actual module graph without constructing providers or opening a socket. */
async function discoverControllers(root: ModuleImport): Promise<Set<Type<unknown>>> {
  const visited = new Set<ModuleImport>();
  const controllers = new Set<Type<unknown>>();
  async function visit(importedModule: ModuleImport): Promise<void> {
    const entry = await importedModule;
    if (visited.has(entry)) return;
    visited.add(entry);
    if ('forwardRef' in entry) {
      await visit(entry.forwardRef() as ModuleImport);
      return;
    }
    const module = 'module' in entry ? entry.module : entry;
    const declaredControllers: Type<unknown>[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? [];
    const imports: ModuleImport[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? [];
    for (const controller of [...declaredControllers, ...('module' in entry ? (entry.controllers ?? []) : [])]) {
      controllers.add(controller);
    }
    for (const imported of [...imports, ...('module' in entry ? (entry.imports ?? []) : [])]) await visit(imported);
  }
  await visit(root);
  return controllers;
}

function paths(metadata: string | string[] | undefined): string[] {
  return Array.isArray(metadata) ? metadata : [metadata ?? ''];
}

function routeKey(route: { readonly method: string; readonly path: string }): string {
  return `${route.method} ${route.path}`;
}

describe('AppModule HTTP route contract', () => {
  it('registers exactly the shared API_ROUTES manifest', async () => {
    const actual: { method: string; path: string }[] = [];
    const scanner = new MetadataScanner();
    const controllers = await discoverControllers(AppModule);
    expect(controllers.size).toBeGreaterThan(0);
    for (const controller of controllers) {
      const prototype: object = controller.prototype;
      const controllerPaths: string | string[] | undefined = Reflect.getMetadata(PATH_METADATA, controller);
      for (const methodName of scanner.getAllMethodNames(prototype)) {
        const handler: unknown = Reflect.get(prototype, methodName);
        if (typeof handler !== 'function') continue;
        const method: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const methodPaths: string | string[] | undefined = Reflect.getMetadata(PATH_METADATA, handler);
        for (const controllerPath of paths(controllerPaths)) {
          for (const methodPath of paths(methodPaths)) {
            actual.push({
              method: RequestMethod[method],
              path: `/api/${controllerPath}/${methodPath}`.replace(/\/+/g, '/').replace(/\/$/, ''),
            });
          }
        }
      }
    }
    const expectedKeys = API_ROUTES.map((route: ApiRoute) => routeKey(route)).sort();
    const actualKeys = actual.map(routeKey).sort();
    const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
    const extra = actualKeys.filter((key) => !expectedKeys.includes(key));
    // The object diff names missing/extra routes; the arrays also detect duplicate registrations.
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(actualKeys).toEqual(expectedKeys);
  });
});
