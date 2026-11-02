import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ExportJobDto, ExportPlanDto } from '@simoncodes-ca/data-transfer';
import { CollectionIndex } from '../cache/collection-index.service';
import { JobRegistry } from '../jobs/job-registry';
import { HttpProject } from '../testing/http-project';

describe('ExportsController HTTP (real project)', () => {
  let project: HttpProject;
  const plan = (body: unknown) => project.request<ExportPlanDto>('POST', '/exports/dry-run', body);
  const start = (body: unknown) => project.request<ExportJobDto>('POST', '/exports', body);
  beforeEach(async () => {
    project = new HttpProject();
    project.config.locales = ['en', 'fr-ca'];
    await project.start();
    await project.seed('hello');
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await project.close();
  });

  it('returns relative paths and overwriteCount without creating the output folder', async () => {
    const body = { format: 'json', collections: ['test-collection'], filenamePattern: '{locale}' };
    const response = await plan(body);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      outputDirectory: 'dist/export',
      entriesTotal: 1,
      overwriteCount: 0,
      files: [{ locale: 'fr-ca', path: 'dist/export/fr-ca.json', exists: false, entriesCount: 1 }],
    });
    expect(project.exists('dist/export')).toBe(false);
    project.write('dist/export/fr-ca.json', '{}');
    expect((await plan(body)).body.overwriteCount).toBe(1);
  });

  it('defaults omitted statuses to new and stale', async () => {
    await project.seed('done', 'Done', { translations: [{ locale: 'fr-ca', value: 'Fini', status: 'verified' }] });
    await project.seed('outdated', 'Old', { translations: [{ locale: 'fr-ca', value: 'Ancien', status: 'stale' }] });
    const response = await plan({ format: 'json', collections: ['test-collection'] });
    expect(response.body.entriesTotal).toBe(2);
    expect(
      (await plan({ format: 'json', collections: ['test-collection'], statuses: ['verified'] })).body.entriesTotal,
    ).toBe(1);
  });

  it('returns 404 for unknown collections during both POSTs', async () => {
    for (const request of [plan, start])
      expect((await request({ format: 'json', collections: ['missing'] })).status).toBe(404);
  });

  it('returns 400 for empty collections during both POSTs', async () => {
    for (const request of [plan, start]) expect((await request({ format: 'json', collections: [] })).status).toBe(400);
  });

  it('returns 400 with errors for an invalid format during both POSTs', async () => {
    for (const request of [plan, start])
      expect(await request({ format: 'csv' })).toMatchObject({
        status: 400,
        body: { message: 'Invalid export request', errors: ['format must be xliff or json.'] },
      });
  });

  it('returns 400 with errors for an invalid JSON structure', async () => {
    expect(await plan({ format: 'json', json: { structure: 'tree' } })).toMatchObject({
      status: 400,
      body: { errors: ['json.structure must be hierarchical or flat.'] },
    });
  });

  it('returns 400 with the core message for a reserved JSON base property during both POSTs', async () => {
    for (const request of [plan, start]) {
      expect(await request({ format: 'json', json: { basePropertyName: 'value' } })).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          error: 'Bad Request',
          message: 'basePropertyName "value" is a reserved key. Reserved: value, comment, status, tags',
        },
      });
    }
  });

  it('returns 400 for invalid status filters before registering a job', async () => {
    for (const statuses of [[], ['unknown']]) expect((await start({ format: 'json', statuses })).status).toBe(400);
  });

  (process.getuid?.() === 0 ? it.skip : it)(
    'returns 400 for an unusable output folder at POST without registering a job',
    async () => {
      project.write('blocked-output', 'a file');
      const output = join(project.root, 'read-only-output');
      mkdirSync(output);
      chmodSync(output, 0o555);
      const registered = jest.spyOn(JobRegistry.prototype, 'start');
      try {
        for (const outputDirectory of ['blocked-output', 'read-only-output']) {
          const body = { format: 'json', outputDirectory };
          const preview = await plan(body);
          expect(preview.body.outputProblem).toEqual(expect.any(String));
          expect(await start(body)).toEqual({
            status: 400,
            body: { statusCode: 400, error: 'Bad Request', message: preview.body.outputProblem },
          });
        }
        expect(registered).not.toHaveBeenCalled();
      } finally {
        chmodSync(output, 0o755);
      }
    },
  );

  it('answers 202 with a pending snapshot, a sized progress bar and the echoed request', async () => {
    const body = { format: 'json', collections: ['test-collection'], filenamePattern: '{locale}' };
    const response = await start(body);
    expect(response).toEqual({
      status: 202,
      body: {
        jobId: expect.any(String),
        status: 'pending',
        request: body,
        progress: { current: 0, total: 1 },
      },
    });
    const deadline = Date.now() + 5000;
    let job = response.body;
    while (job.status === 'pending' || job.status === 'running') {
      if (Date.now() > deadline) throw new Error('Export job did not finish');
      job = (await project.request<ExportJobDto>('GET', `/exports/jobs/${job.jobId}`)).body;
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    expect(job.status).toBe('completed');
    expect(job.result?.filesWritten).toEqual(['dist/export/fr-ca.json']);
    expect(project.json('dist/export/fr-ca.json')).toEqual({ hello: 'OK' });
  });

  it('allows read-only collections without touching the collection index', async () => {
    const before = project.read('translations/test/resource_entries.json');
    const entry = project.config.collections?.['test-collection'];
    if (entry) entry.readOnly = true;
    project.configure();
    const index = project.app?.get(CollectionIndex);
    if (index === undefined) throw new Error('Collection index is missing');
    const mutation = jest.spyOn(index, 'sink');
    expect((await plan({ format: 'json', collections: ['test-collection'] })).status).toBe(201);
    expect(mutation).not.toHaveBeenCalled();
    expect(project.read('translations/test/resource_entries.json')).toBe(before);
  });

  it('returns 404 for an unknown job', async () => {
    expect(await project.request('GET', '/exports/jobs/unknown')).toEqual({
      status: 404,
      body: { statusCode: 404, error: 'Not Found', message: 'Export job "unknown" not found' },
    });
  });
});
