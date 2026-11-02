import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { addResource, type LingoTrackerConfig, loadConfig, openCollection } from '@simoncodes-ca/core';
import { AppModule } from '../../app.module';
import { ConfigService } from '../../config/config.service';
import { collection as contractCollection } from '../../mappers/resource.mapper.test-support';
import { FoldersController } from './folders.controller';

/** Real Nest routes, request pipes, exception filter, index and core; no delegation mocks. */
describe('FoldersController HTTP (real project)', () => {
  let app: INestApplication | undefined;
  let server: Server;
  let cwd: string;
  let config: LingoTrackerConfig;
  const configure = () => writeFileSync(join(cwd, '.lingo-tracker.json'), JSON.stringify(config));
  const collection = (name = 'test-collection') => openCollection(config, name, { cwd, writable: true });
  const seed = async (path = 'apps.common.buttons', count = 1, name = 'test-collection') => {
    for (let i = 0; i < count; i++)
      await addResource(collection(name), { key: `${path}.key${i}`, baseValue: `Value ${i}` });
  };
  const readEntries = (path: string, name = 'test-collection'): unknown =>
    JSON.parse(
      readFileSync(join(collection(name).translationsFolder, ...path.split('.'), 'resource_entries.json'), 'utf8'),
    );
  const request = async (method: string, body: object, name = 'test-collection', route = '') => {
    const address = server.address() as AddressInfo | null;
    if (!address) throw new Error('HTTP server has no address');
    const response = await fetch(
      `http://localhost:${address.port}/collections/${encodeURIComponent(name)}/folders${route}`,
      {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    expect(response.headers.get('content-type')).toContain('application/json');
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const move = (body: object, name = 'test-collection') => request('POST', body, name, '/move');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({
        // ConfigService has no root injection option. Keep real disk loading without changing process cwd.
        getConfig: () => loadConfig({ cwd }),
        openProject: () => ({ projectRoot: cwd, sourceConfig: loadConfig({ cwd }) }),
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    // Same ephemeral HTTP transport as job-registry.http.spec.ts; supertest is not installed.
    await app.listen(0);
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'lingo-api-folders-')));
    config = {
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: {
        'test-collection': { translationsFolder: join(cwd, 'translations/test') },
        'another-collection': { translationsFolder: join(cwd, 'translations/another'), locales: ['en', 'fr'] },
        vendor: { translationsFolder: join(cwd, 'translations/vendor'), readOnly: true },
        'a%25b': { translationsFolder: join(cwd, 'translations/percent') },
      },
    };
    configure();
    for (const entry of Object.values(config.collections ?? {}))
      mkdirSync(entry.translationsFolder, { recursive: true });
  });
  afterEach(() => {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
  });

  it('refuses a read-only source collection in the route pipe', async () => {
    const result = await move(
      { sourceFolderPath: 'apps.common.buttons', destinationFolderPath: 'apps.shared' },
      'vendor',
    );
    expect(result.status).toBe(403);
    expect(result.body.message).toBe('Collection "vendor" is read-only. Its resources cannot be modified.');
    expect(existsSync(join(cwd, 'translations/vendor/apps'))).toBe(false);
  });
  it('should successfully move a folder within the same collection', async () => {
    await seed('apps.common.buttons', 5);
    const result = await move({ sourceFolderPath: 'apps.common.buttons', destinationFolderPath: 'apps.shared' });
    expect(result).toEqual({ status: 201, body: { movedCount: 5, foldersDeleted: 1, warnings: [], errors: [] } });
    expect(Object.keys(readEntries('apps.shared.buttons') as object)).toHaveLength(5);
    expect(existsSync(join(cwd, 'translations/test/apps/common/buttons'))).toBe(false);
  });
  it('should successfully move a folder with override option', async () => {
    await seed('apps.buttons', 3);
    await addResource(collection(), { key: 'apps.actions.buttons.key0', baseValue: 'Existing' });
    const result = await move({
      sourceFolderPath: 'apps.buttons',
      destinationFolderPath: 'apps.actions',
      override: true,
    });
    expect(result.body).toMatchObject({ movedCount: 3, foldersDeleted: 1, errors: [] });
    expect(readEntries('apps.actions.buttons')).toMatchObject({ key0: { source: 'Value 0' } });
  });
  it('should handle cross-collection moves', async () => {
    await seed('apps.buttons', 2);
    const result = await move({
      sourceFolderPath: 'apps.buttons',
      destinationFolderPath: 'shared',
      toCollection: 'another-collection',
    });
    expect(result.status).toBe(201);
    expect(result.body.movedCount).toBe(2);
    expect(readEntries('shared.buttons', 'another-collection')).toMatchObject({
      key0: { source: 'Value 0', fr: 'Value 0' },
    });
    expect(readEntries('shared.buttons', 'another-collection')).not.toMatchObject({ key0: { es: expect.any(String) } });
    expect(existsSync(join(cwd, 'translations/test/apps/buttons'))).toBe(false);
  });
  it('returns 201 with errors when a folder move has incompatible base locales', async () => {
    await seed('apps.buttons');
    config.collections = {
      ...config.collections,
      'another-collection': {
        translationsFolder: join(cwd, 'translations/another'),
        baseLocale: 'fr',
        locales: ['fr', 'en'],
      },
    };
    configure();
    expect(
      await move({
        sourceFolderPath: 'apps.buttons',
        destinationFolderPath: 'shared',
        toCollection: 'another-collection',
      }),
    ).toEqual({
      status: 201,
      body: {
        movedCount: 0,
        foldersDeleted: 0,
        warnings: ['Source folder kept; resources not moved: apps.buttons.key0'],
        errors: [
          'Cannot move resources from collection "test-collection" (base locale "en") to "another-collection" (base locale "fr")',
        ],
      },
    });
    expect(readEntries('apps.buttons')).toMatchObject({ key0: { source: 'Value 0' } });
    expect(existsSync(join(cwd, 'translations/another/shared'))).toBe(false);
  });
  it('should map a missing source collection to 404', async () => {
    const result = await move(
      { sourceFolderPath: 'apps.buttons', destinationFolderPath: 'apps.actions' },
      'nonexistent-collection',
    );
    expect(result).toEqual({
      status: 404,
      body: { statusCode: 404, message: 'Collection "nonexistent-collection" not found', error: 'Not Found' },
    });
  });
  it('should map a missing destination collection to 404', async () => {
    await seed('apps.buttons');
    const result = await move({
      sourceFolderPath: 'apps.buttons',
      destinationFolderPath: 'apps.actions',
      toCollection: 'nonexistent-collection',
    });
    expect(result).toEqual({
      status: 404,
      body: {
        statusCode: 404,
        message: 'Destination collection "nonexistent-collection" not found',
        error: 'Not Found',
      },
    });
    expect(readEntries('apps.buttons')).toMatchObject({ key0: { source: 'Value 0' } });
  });
  it('should map a read-only destination collection to 403', async () => {
    await seed('apps.buttons');
    const result = await move({
      sourceFolderPath: 'apps.buttons',
      destinationFolderPath: 'apps.actions',
      toCollection: 'vendor',
    });
    expect(result).toEqual({
      status: 403,
      body: {
        statusCode: 403,
        message: 'Collection "vendor" is read-only. Its resources cannot be modified.',
        error: 'Forbidden',
      },
    });
    expect(readEntries('apps.buttons')).toMatchObject({ key0: { source: 'Value 0' } });
  });
  it('should throw HttpException for validation errors (missing fields)', async () => {
    const result = await move({ sourceFolderPath: '', destinationFolderPath: 'apps.actions' });
    expect(result.status).toBe(400);
    expect(result.body.message).toBe('sourceFolderPath must be a non-empty string');
  });
  it.each([
    ['bad path', 'apps.shared', 400],
    ['apps.common', 'apps.common.buttons', 400],
    ['apps.missing', 'apps.shared', 404],
  ])(
    'maps a typed move error through the exception filter (%s)',
    async (sourceFolderPath, destinationFolderPath, status) => {
      await seed('apps.common.buttons');
      const result = await move({ sourceFolderPath, destinationFolderPath });
      expect(result.status).toBe(status);
      expect(result.body.statusCode).toBe(status);
      expect(result.body.message).toEqual(expect.any(String));
    },
  );
  it('should report a move of an empty folder', async () => {
    mkdirSync(join(cwd, 'translations/test/apps/empty'), { recursive: true });
    const result = await move({ sourceFolderPath: 'apps.empty', destinationFolderPath: 'apps.shared' });
    expect(result.body).toMatchObject({
      movedCount: 0,
      foldersDeleted: 1,
      errors: [],
      warnings: ['No resources found in source folder. Nothing to move.'],
    });
    expect(existsSync(join(cwd, 'translations/test/apps/empty'))).toBe(false);
  });
  it('should return warnings and errors from core function', async () => {
    await seed('apps.buttons', 3);
    writeFileSync(join(cwd, 'translations/test/apps/buttons/keep.txt'), 'unmanaged');
    const result = await move({ sourceFolderPath: 'apps.buttons', destinationFolderPath: 'apps.actions' });
    expect(result.body).toMatchObject({
      movedCount: 3,
      foldersDeleted: 0,
      errors: [],
      warnings: [expect.stringContaining('not part of the collection')],
    });
    expect(readEntries('apps.actions.buttons')).toMatchObject({ key0: { source: 'Value 0' } });
    expect(existsSync(join(cwd, 'translations/test/apps/buttons/keep.txt'))).toBe(true);
  });
  it('passes the route param through verbatim', async () => {
    await seed('apps.buttons', 1, 'a%25b');
    const result = await move({ sourceFolderPath: 'apps.buttons', destinationFolderPath: 'apps.actions' }, 'a%25b');
    expect(result.status).toBe(201);
    expect(result.body.movedCount).toBe(1);
    expect(readEntries('apps.actions.buttons', 'a%25b')).toMatchObject({ key0: { source: 'Value 0' } });
  });
  it('should successfully create a folder', async () => {
    const result = await request('POST', { folderName: 'buttons', parentPath: 'apps.common' });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      created: true,
      folderPath: join(cwd, 'translations/test/apps/common/buttons'),
      folder: {
        name: 'buttons',
        fullPath: 'apps.common.buttons',
        loaded: true,
        tree: { path: 'apps.common.buttons', resources: [], children: [] },
      },
    });
    expect(existsSync(join(cwd, 'translations/test/apps/common/buttons'))).toBe(true);
  });
  it('uses the folder address returned by core for a whitespace-only parent', async () => {
    const result = await request('POST', { folderName: 'buttons', parentPath: '  ' });
    expect(result.status).toBe(201);
    expect(result.body.folder).toMatchObject({ fullPath: 'buttons', tree: { path: 'buttons' } });
    expect(existsSync(join(cwd, 'translations/test/buttons'))).toBe(true);
  });
  it('lets an invalid folder name propagate; the exception filter answers 400', async () => {
    const result = await request('POST', { folderName: 'bad name' });
    expect(result.status).toBe(400);
    expect(result.body.message).toBe(
      'Validation error: Invalid folder name segment "bad name". Segments must match pattern [A-Za-z0-9_-]+',
    );
    expect(existsSync(join(cwd, 'translations/test/bad name'))).toBe(false);
  });
  it('should successfully delete a folder', async () => {
    await seed('apps.common.buttons', 5);
    const result = await request('DELETE', { folderPath: 'apps.common.buttons' });
    expect(result).toEqual({
      status: 200,
      body: { deleted: true, folderPath: 'apps.common.buttons', resourcesDeleted: 5 },
    });
    expect(existsSync(join(cwd, 'translations/test/apps/common/buttons'))).toBe(false);
  });
  it('serializes the absent move count default and successful deletion marker through the routes', async () => {
    await seed('apps.common.buttons', 2);
    const address = server.address() as AddressInfo | null;
    if (address === null) throw new Error('HTTP server has no address');
    const url = `http://localhost:${address.port}/collections/test-collection/folders`;
    // Core currently supplies folder counts; supply an absent count to exercise the route fallback.
    const executeMove = jest.spyOn(core, 'executeMove').mockReturnValueOnce({
      outcome: 'succeeded',
      movedCount: 0,
      warnings: [],
      errors: [],
    });
    try {
      const response = await fetch(`${url}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceFolderPath: 'apps.common.buttons', destinationFolderPath: 'apps.shared' }),
      });
      expect(response.status).toBe(201);
      expect(await response.text()).toBe('{"movedCount":0,"foldersDeleted":0,"warnings":[],"errors":[]}');
    } finally {
      executeMove.mockRestore();
    }
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderPath: 'apps.common.buttons' }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"deleted":true,"folderPath":"apps.common.buttons","resourcesDeleted":2}');
  });
  it('answers 404 when core reports that the folder does not exist', async () => {
    const result = await request('DELETE', { folderPath: 'apps.missing' });
    expect(result.status).toBe(404);
    expect(result.body.statusCode).toBe(404);
  });
});

// Keep real core operations by default; individual return-contract cases supply edge results.
jest.mock('@simoncodes-ca/core', () => ({
  ...jest.requireActual<typeof import('@simoncodes-ca/core')>('@simoncodes-ca/core'),
}));

const core = jest.requireMock<typeof import('@simoncodes-ca/core')>('@simoncodes-ca/core');

describe('FoldersController response contracts', () => {
  const controller = new FoldersController();
  const opened = {
    ...contractCollection,
    projectRoot: '/t',
    sourceConfig: {
      collections: {},
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en'],
    },
  };
  afterEach(() => jest.restoreAllMocks());

  it('adds the successful deletion marker in wire order', async () => {
    jest.spyOn(core, 'deleteFolder').mockReturnValue({ folderPath: 'apps.common', resourcesDeleted: 2 });
    const dto = await controller.delete(contractCollection, { folderPath: 'apps.common' });
    expect(Object.keys(dto)).toEqual(['deleted', 'folderPath', 'resourcesDeleted']);
    expect(JSON.stringify(dto)).toBe('{"deleted":true,"folderPath":"apps.common","resourcesDeleted":2}');
  });

  it('defaults absent folder counts to zero and preserves counts and diagnostics in wire order', async () => {
    for (const result of [
      { outcome: 'succeeded' as const, movedCount: 2, foldersDeleted: 1, warnings: [], errors: [] },
      { outcome: 'failed' as const, movedCount: 0, warnings: ['Warning'], errors: ['Failed'] },
    ]) {
      jest.spyOn(core, 'executeMove').mockReturnValue(result);
      const dto = await controller.move(opened, { sourceFolderPath: 'apps.common', destinationFolderPath: 'shared' });
      expect(Object.keys(dto)).toEqual(['movedCount', 'foldersDeleted', 'warnings', 'errors']);
      expect(dto.warnings).toBe(result.warnings);
      expect(dto.errors).toBe(result.errors);
      expect(JSON.stringify(dto)).toBe(
        JSON.stringify({
          movedCount: result.movedCount,
          foldersDeleted: 'foldersDeleted' in result ? result.foldersDeleted : 0,
          warnings: result.warnings,
          errors: result.errors,
        }),
      );
    }
  });
});
