import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConflictException } from '@nestjs/common';
import { IMPORT_UPLOAD_MAX_BYTES } from '@simoncodes-ca/data-transfer';
import type {
  ImportJobDto,
  ImportPlanDto,
  ImportRequestDto,
  ImportSourceListingDto,
} from '@simoncodes-ca/data-transfer';
import type { Response } from 'express';
import { CollectionIndex } from '../cache/collection-index.service';
import { JobRegistry } from '../jobs/job-registry';
import { HttpProject } from '../testing/http-project';
import { ImportJobService } from './import-job.service';
import { ImportsController } from './imports.controller';

describe('ImportsController HTTP (real project)', () => {
  let project: HttpProject;
  const body: ImportRequestDto = {
    collection: 'test-collection',
    files: [{ path: 'dist/import/fr-ca.json', locale: 'fr-ca' }],
  };
  const plan = (request: unknown = body) => project.request<ImportPlanDto>('POST', '/imports/dry-run', request);
  const start = (request: unknown = body) => project.request<ImportJobDto>('POST', '/imports', request);
  const list = (query = 'collection=test-collection') =>
    project.request<ImportSourceListingDto>('GET', `/imports/sources?${query}`);
  const summary = async (id: string) => {
    const server = project.app?.getHttpServer() as Server | undefined;
    const address = server?.address() as AddressInfo | null;
    if (!address) throw new Error('Missing HTTP address');
    return fetch(`http://localhost:${address.port}/api/imports/jobs/${id}/summary`);
  };
  const finished = async (id: string) => {
    for (let count = 0; count < 100; count++) {
      const job = (await project.request<ImportJobDto>('GET', `/imports/jobs/${id}`)).body;
      if (job.status !== 'pending' && job.status !== 'running') return job;
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Import job did not finish');
  };
  beforeEach(async () => {
    project = new HttpProject();
    await project.start(true);
    await project.seed('hello', 'Hello');
    project.write('dist/import/fr-ca.json', '{"hello":"Bonjour"}');
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await project.close();
  });

  it('lists the configured folder with relative paths and inferred locales', async () => {
    expect(await list()).toMatchObject({
      status: 200,
      body: {
        folder: 'dist/import',
        defaultFolder: 'dist/import',
        exists: true,
        files: [{ path: 'dist/import/fr-ca.json', format: 'json', locale: 'fr-ca', localeSource: 'file-name' }],
      },
    });
  });

  it('returns exists false for a missing folder and 400 for a file instead of a folder', async () => {
    expect(await list('collection=test-collection&folder=missing')).toEqual({
      status: 200,
      body: {
        collection: 'test-collection',
        folder: 'missing',
        defaultFolder: 'dist/import',
        exists: false,
        files: [],
      },
    });
    expect(await list('collection=test-collection&folder=dist/import/fr-ca.json')).toMatchObject({
      status: 400,
      body: { message: 'folder must be a directory' },
    });
  });

  it('excludes hidden files, other extensions and nested files, and sorts names ignoring case', async () => {
    project.write('dist/import/.secret.json', '{}');
    project.write('dist/import/note.txt', 'text');
    project.write('dist/import/nested/es.json', '{}');
    project.write('dist/import/Z.xlf', '<xliff/>');
    project.write('dist/import/A.json', '{}');
    expect((await list()).body.files.map((file) => file.name)).toEqual(['A.json', 'fr-ca.json', 'Z.xlf']);
  });

  it('reports base-locale and unconfigured XLIFF targets while retaining filename inference', async () => {
    project.write('dist/import/en.json', '{}');
    project.write('dist/import/es.xlf', '<xliff><file target-language="xx"/></xliff>');
    project.write('dist/import/target.xlf', '<xliff><file target-language="FR_CA"/></xliff>');
    const files = (await list()).body.files;
    expect(files.find((file) => file.name === 'en.json')).toMatchObject({ locale: 'en', localeProblem: 'base-locale' });
    expect(files.find((file) => file.name === 'es.xlf')).toMatchObject({
      locale: 'es',
      localeSource: 'file-name',
      localeProblem: 'not-configured',
      xliffTargetLanguage: 'xx',
    });
    expect(files.find((file) => file.name === 'target.xlf')).toMatchObject({
      locale: 'fr-ca',
      localeSource: 'xliff-target-language',
      xliffTargetLanguage: 'FR_CA',
    });
  });

  it('returns 404 for an unknown collection for listing and both POST routes', async () => {
    expect((await list('collection=missing')).status).toBe(404);
    for (const request of [plan, start]) expect((await request({ ...body, collection: 'missing' })).status).toBe(404);
  });

  it('requires collection query and rejects invalid request shapes and enums', async () => {
    expect((await list('folder=missing')).status).toBe(400);
    for (const request of [plan, start]) {
      for (const invalid of [
        { ...body, files: [] },
        { ...body, files: [{ path: '', locale: 'fr-ca' }] },
        { ...body, validateBase: 'yes' },
      ])
        expect((await request(invalid)).status).toBe(400);
      expect(await request({ ...body, strategy: 'invalid' })).toMatchObject({
        status: 400,
        body: { errors: [expect.any(String)] },
      });
      expect(await request({ ...body, files: [{ path: 'x', locale: 'es', format: 'csv' }] })).toMatchObject({
        status: 400,
        body: { errors: [expect.any(String)] },
      });
    }
  });

  it('allows listing read-only collections but rejects preview and start with 403', async () => {
    expect((await list('collection=vendor')).status).toBe(200);
    for (const request of [plan, start]) expect((await request({ ...body, collection: 'vendor' })).status).toBe(403);
  });

  it('rejects base locale without migration before parsing and allows migration', async () => {
    const requestBody = { ...body, files: [{ path: 'missing.json', locale: 'en' }] };
    for (const request of [plan, start])
      expect(await request(requestBody)).toMatchObject({
        status: 400,
        body: { message: expect.stringContaining('Cannot import into base locale') },
      });
    expect(
      (await plan({ ...body, files: [{ path: 'dist/import/fr-ca.json', locale: 'en' }], strategy: 'migration' }))
        .status,
    ).toBe(201);
  });

  it('returns a preview with parsed counts without changing collection files or its index', async () => {
    const before = project.read('translations/test/resource_entries.json');
    const index = project.app?.get(CollectionIndex);
    if (!index) throw new Error('Missing index');
    const mutation = jest.spyOn(index, 'sink');
    expect(await plan()).toMatchObject({
      status: 201,
      body: { totals: { entries: 1, imported: 1 }, files: [{ path: 'dist/import/fr-ca.json', entries: 1 }] },
    });
    expect(project.read('translations/test/resource_entries.json')).toBe(before);
    expect(mutation).not.toHaveBeenCalled();
  });

  it('represents unreadable or malformed sources as zero-count preview files and continues', async () => {
    project.write('broken.json', '{');
    const result = await plan({
      ...body,
      files: [{ path: 'missing.json', locale: 'es' }, { path: 'broken.json', locale: 'es' }, ...body.files],
    });
    expect(result.status).toBe(201);
    expect(result.body.files).toMatchObject([
      { entries: 0, sourceProblem: expect.any(String) },
      { entries: 0, sourceProblem: expect.any(String) },
      { entries: 1 },
    ]);
  });

  it('validates every source before 202 and creates no job when a later path is bad', async () => {
    const jobs = project.app?.get(ImportJobService);
    if (!jobs) throw new Error('Missing jobs');
    const registered = jest.spyOn(JobRegistry.prototype, 'start');
    const before = project.read('translations/test/resource_entries.json');
    const result = await start({ ...body, files: [...body.files, { path: 'missing.json', locale: 'es' }] });
    expect(result.status).toBe(400);
    expect(result.body).not.toHaveProperty('jobId');
    expect(registered).not.toHaveBeenCalled();
    expect(project.read('translations/test/resource_entries.json')).toBe(before);
  });

  it('returns a pending 202, reports progress and results, and invalidates the collection index', async () => {
    const index = project.app?.get(CollectionIndex);
    if (!index) throw new Error('Missing index');
    const mutation = jest.spyOn(index, 'sink');
    const response = await start();
    expect(response).toMatchObject({
      status: 202,
      body: { status: 'pending', request: body, progress: { current: 0, total: 1 } },
    });
    const job = await finished(response.body.jobId);
    expect(job).toMatchObject({
      status: 'completed',
      progress: { current: 1, total: 1 },
      result: {
        outcome: 'succeeded',
        totals: { imported: 1 },
        files: [{ outcome: 'imported', path: 'dist/import/fr-ca.json' }],
      },
    });
    expect(mutation).toHaveBeenCalled();
  });

  it('continues after per-file source errors and records the overall failed outcome', async () => {
    project.write('broken.json', '{');
    const response = await start({ ...body, files: [{ path: 'broken.json', locale: 'es' }, ...body.files] });
    expect(response.status).toBe(202);
    expect(await finished(response.body.jobId)).toMatchObject({
      status: 'completed',
      result: {
        outcome: 'failed',
        files: [{ outcome: 'failed', sourceProblem: expect.any(String) }, { outcome: 'imported' }],
      },
    });
  });

  it('returns 409 while a summary is pending, then markdown with an attachment header', async () => {
    const jobs = project.app?.get(ImportJobService);
    if (!jobs) throw new Error('Missing jobs');
    const job = jobs.startJob({ project: { sourceConfig: project.config, projectRoot: project.root }, request: body });
    const controller = project.app?.get(ImportsController);
    if (!controller) throw new Error('Missing controller');
    const responseHeaders = { type: jest.fn(), setHeader: jest.fn() } as unknown as Response;
    // Read synchronously before the real registry starts, avoiding a race with HTTP transport.
    expect(() => controller.getSummary(job.jobId, responseHeaders)).toThrow(ConflictException);
    expect(responseHeaders.setHeader).not.toHaveBeenCalled();
    await finished(job.jobId);
    const response = await summary(job.jobId);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="lingo-tracker-import-summary-.+\.md"$/,
    );
    const markdown = await response.text();
    expect(markdown).toContain('# Import run');
    expect(markdown).toContain('**Source File**: dist/import/fr-ca.json');
  });

  it('returns 404 for unknown job snapshots and summaries', async () => {
    expect(await project.request('GET', '/imports/jobs/unknown')).toMatchObject({
      status: 404,
      body: { message: 'Import job "unknown" not found' },
    });
    expect((await summary('unknown')).status).toBe(404);
  });
  it('rejects unconfigured and wrong-case locales in dry-run and start with file-specific errors', async () => {
    for (const request of [plan, start]) {
      for (const locale of ['xx', 'FR-CA']) {
        const response = await request({ ...body, files: [{ path: 'dist/import/fr-ca.json', locale }] });
        expect(response).toMatchObject({
          status: 400,
          body: {
            statusCode: 400,
            message: 'Invalid import request',
            error: 'Bad Request',
            errors: [
              `File "dist/import/fr-ca.json" locale "${locale}" is not configured for collection "test-collection".`,
            ],
          },
        });
      }
    }
  });

  it('reports zero changed resource files for an identical update re-import in preview and job results', async () => {
    const initial = await start();
    await finished(initial.body.jobId);
    const update = { ...body, strategy: 'update' };
    expect(await plan(update)).toMatchObject({
      status: 201,
      body: { totals: { changed: 0 }, files: [{ changed: 0 }] },
    });
    const rerun = await start(update);
    expect(await finished(rerun.body.jobId)).toMatchObject({
      status: 'completed',
      result: { totals: { changed: 0 }, files: [{ changed: 0 }] },
    });
  });
  it('uploads multipart files and returns the refreshed listing without invalidating the index', async () => {
    const index = project.app?.get(CollectionIndex);
    if (!index) throw new Error('Missing index');
    const mutation = jest.spyOn(index, 'sink');
    expect(
      await project.requestMultipart('/imports/sources?collection=test-collection', [
        { name: 'es.json', contents: '{}' },
      ]),
    ).toMatchObject({
      status: 201,
      body: { files: [{ name: 'es.json' }, { name: 'fr-ca.json' }] },
    });
    expect(project.read('dist/import/es.json')).toBe('{}');
    expect(mutation).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown upload collection and 403 for a read-only collection', async () => {
    for (const [collection, status] of [
      ['missing', 404],
      ['vendor', 403],
    ] as const) {
      expect(
        (
          await project.requestMultipart(`/imports/sources?collection=${collection}`, [
            { name: 'es.json', contents: '{}' },
          ])
        ).status,
      ).toBe(status);
    }
    expect(project.exists('dist/import/es.json')).toBe(false);
  });

  it('returns 409 with upload names then replaces only with overwrite=true', async () => {
    const files = [{ name: 'fr-ca.json', contents: '{"hello":"Salut"}' }];
    expect(await project.requestMultipart('/imports/sources?collection=test-collection', files)).toMatchObject({
      status: 409,
      body: { errors: ['fr-ca.json'] },
    });
    expect(project.read('dist/import/fr-ca.json')).toBe('{"hello":"Bonjour"}');
    expect(
      (await project.requestMultipart('/imports/sources?collection=test-collection&overwrite=true', files)).status,
    ).toBe(201);
    expect(project.read('dist/import/fr-ca.json')).toBe(files[0]?.contents);
  });

  it('returns 413 for a file larger than the shared limit without writing it', async () => {
    expect(
      (
        await project.requestMultipart('/imports/sources?collection=test-collection', [
          { name: 'large.json', contents: new Uint8Array(IMPORT_UPLOAD_MAX_BYTES + 1) },
        ])
      ).status,
    ).toBe(413);
    expect(project.exists('dist/import/large.json')).toBe(false);
  });

  it('returns 400 for eleven files without writing any of them', async () => {
    const files = Array.from({ length: 11 }, (_, index) => ({ name: `file${index}.json`, contents: '{}' }));
    expect((await project.requestMultipart('/imports/sources?collection=test-collection', files)).status).toBe(400);
    for (const file of files) expect(project.exists(`dist/import/${file.name}`)).toBe(false);
  });

  it('returns 400 for the wrong multipart field or a missing collection', async () => {
    const files = [{ name: 'es.json', contents: '{}' }];
    expect((await project.requestMultipart('/imports/sources?collection=test-collection', files, 'file')).status).toBe(
      400,
    );
    expect((await project.requestMultipart('/imports/sources', files)).status).toBe(400);
    expect(project.exists('dist/import/es.json')).toBe(false);
  });

  it('rejects a cross-origin multipart upload before writing any file', async () => {
    expect(
      await project.requestMultipart(
        '/imports/sources?collection=test-collection',
        [{ name: 'es.json', contents: '{}' }],
        'files',
        { Origin: 'https://evil.example' },
      ),
    ).toMatchObject({ status: 403, body: { message: 'Origin not allowed' } });
    expect(project.exists('dist/import/es.json')).toBe(false);
  });
  it('rejects multipart text fields with a sanitized 400 and no file written', async () => {
    const response = await project.requestMultipart(
      '/imports/sources?collection=test-collection',
      [{ name: 'es.json', contents: '{}' }],
      'files',
      undefined,
      { collection: 'test-collection' },
    );
    expect(response).toMatchObject({ status: 400, body: { message: 'Invalid upload', errors: [expect.any(String)] } });
    expect(JSON.stringify(response.body)).not.toContain(project.root);
    expect(project.exists('dist/import/es.json')).toBe(false);
  });

  it('decodes UTF-8 multipart filenames and stores their NFC spelling', async () => {
    const response = await project.requestMultipart('/imports/sources?collection=test-collection', [
      { name: 'cafe\u0301.json', contents: '{}' },
    ]);
    expect(response).toMatchObject({
      status: 201,
      body: { files: expect.arrayContaining([expect.objectContaining({ name: 'café.json' })]) },
    });
    expect(project.read('dist/import/café.json')).toBe('{}');
  });

  it.each(['../x.json', 'a/b.json', 'a\\b.json'])(
    'rejects raw multipart paths %p without writing a file',
    async (name) => {
      const response = await project.requestMultipart('/imports/sources?collection=test-collection', [
        { name, contents: '{}' },
      ]);
      expect(response).toMatchObject({
        status: 400,
        body: {
          message: 'Invalid upload',
          errors: expect.arrayContaining([`"${name}" must not contain path separators or control characters.`]),
        },
      });
      expect(project.exists('dist/import/x.json')).toBe(false);
      expect(project.exists('dist/import/b.json')).toBe(false);
      expect(project.exists('dist/import/a')).toBe(false);
      expect(project.exists('dist/x.json')).toBe(false);
    },
  );

  it('rejects a multipart POST from a different localhost port without writing a file', async () => {
    expect(
      await project.requestMultipart(
        '/imports/sources?collection=test-collection',
        [{ name: 'es.json', contents: '{}' }],
        'files',
        { Origin: 'http://localhost:9999' },
      ),
    ).toMatchObject({ status: 403, body: { message: 'Origin not allowed' } });
    expect(project.exists('dist/import/es.json')).toBe(false);
  });
  it('returns 400 for a JSON upload request with missing files', async () => {
    expect(await project.request('POST', '/imports/sources?collection=test-collection', {})).toMatchObject({
      status: 400,
      body: {
        statusCode: 400,
        message: 'Invalid upload',
        error: 'Bad Request',
        errors: ['files must contain at least one file.'],
      },
    });
    expect(project.exists('dist/import/es.json')).toBe(false);
  });
  it('allows uploads in the import folder and subfolders, rejecting siblings and ancestors', async () => {
    for (const folder of ['dist/import', 'dist/import/nested']) {
      expect(
        (
          await project.requestMultipart(`/imports/sources?collection=test-collection&folder=${folder}`, [
            { name: 'allowed.json', contents: '{}' },
          ])
        ).status,
      ).toBe(201);
      expect(project.read(`${folder}/allowed.json`)).toBe('{}');
    }
    for (const folder of ['dist', 'dist/sibling', 'dist/import-sibling']) {
      expect(
        await project.requestMultipart(`/imports/sources?collection=test-collection&folder=${folder}`, [
          { name: 'rejected.json', contents: '{}' },
        ]),
      ).toMatchObject({ status: 400, body: { errors: ['folder is not allowed for uploads.'] } });
      expect(project.exists(`${folder}/rejected.json`)).toBe(false);
    }
  });
});
