import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { ConfigService } from '../../config/config.service';
import { WritableCollectionGuard } from './writable-collection.guard';

function createContext(method: string, params: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, params }),
    }),
  } as unknown as ExecutionContext;
}

describe('WritableCollectionGuard', () => {
  const config: LingoTrackerConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en'],
    collections: {
      main: { translationsFolder: 'src/i18n' },
      vendor: { translationsFolder: 'node_modules/@scope/lib/i18n', readOnly: true },
    },
  };

  const configService = { getConfig: () => config } as unknown as ConfigService;
  const guard = new WritableCollectionGuard(configService);

  it('allows GET requests against a read-only collection', () => {
    expect(guard.canActivate(createContext('GET', { collectionName: 'vendor' }))).toBe(true);
  });

  it('allows mutating requests against a writable collection', () => {
    expect(guard.canActivate(createContext('POST', { collectionName: 'main' }))).toBe(true);
  });

  it('blocks mutating requests against a read-only collection', () => {
    expect(() => guard.canActivate(createContext('DELETE', { collectionName: 'vendor' }))).toThrow(ForbiddenException);
  });

  it('decodes the collection name from the route param', () => {
    const encodedConfig: LingoTrackerConfig = {
      ...config,
      collections: { 'my vendor': { translationsFolder: 'node_modules/x', readOnly: true } },
    };
    const localGuard = new WritableCollectionGuard({ getConfig: () => encodedConfig } as unknown as ConfigService);

    expect(() => localGuard.canActivate(createContext('PATCH', { collectionName: 'my%20vendor' }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows mutating requests for unknown collections so the controller can 404', () => {
    expect(guard.canActivate(createContext('POST', { collectionName: 'missing' }))).toBe(true);
  });
});
