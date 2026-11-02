import type { BundleGenerateJobDto } from '@simoncodes-ca/data-transfer';
import type { BundleDefinition } from '@simoncodes-ca/domain';
import { HttpProject } from '../testing/http-project';

describe('BundlesController HTTP (real project)', () => {
  let project: HttpProject;
  const definition = { bundleName: 'main.{locale}', dist: './dist/i18n', collections: 'All' };
  const existing: BundleDefinition = {
    bundleName: '{locale}',
    dist: './dist/tracker',
    collections: [{ name: 'test-collection', entriesSelectionRules: 'All' }],
  };
  const create = (body: unknown) => project.request('POST', '/bundles', body);
  const update = (name: string, body: unknown) => project.request('PUT', `/bundles/${encodeURIComponent(name)}`, body);
  const plan = (body: unknown) => project.request('POST', '/bundles/dry-run', body);
  const generate = (name = 'tracker', body?: unknown) =>
    project.request<BundleGenerateJobDto>('POST', `/bundles/${encodeURIComponent(name)}/generate`, body);
  const job = (id: string) => project.request<BundleGenerateJobDto>('GET', `/bundles/jobs/${id}`);
  const finish = async (id: string) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const response = await job(id);
      if (response.body.status === 'completed' || response.body.status === 'failed') return response;
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Bundle job did not finish');
  };
  const stored = () => project.json('.lingo-tracker.json');
  beforeEach(async () => {
    project = new HttpProject();
    project.config.locales = ['en', 'fr-ca'];
    project.config.bundles = { tracker: existing, other: { ...existing, dist: './dist/other' } };
    await project.start();
  });
  afterEach(async () => {
    await project.close();
  });

  describe('POST /bundles', () => {
    it('hands the verbatim name and the body definition to core, which normalises and validates', async () => {
      expect(await create({ name: ' main ', bundle: { ...definition, dist: ' ./dist/i18n ' } })).toEqual({
        status: 201,
        body: { message: 'Bundle "main" added successfully' },
      });
      expect(stored()).toHaveProperty('bundles.main', definition);
    });
    it('rejects a missing name before core is called', async () => {
      expect(await create({ bundle: definition })).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: 'name must be a string' },
      });
    });
    it('returns 400 with every message when core rejects the definition', async () => {
      expect(await create({ name: '', bundle: { ...definition, dist: '' } })).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          message: 'Invalid bundle definition',
          error: 'Bad Request',
          errors: ['Bundle name is required.', 'dist (output folder) is required.'],
        },
      });
    });
    it('returns 400 when the body carries no definition, without calling core', async () => {
      expect(await create({ name: 'main' })).toMatchObject({
        status: 400,
        body: { message: 'bundle must be an object' },
      });
    });
    it('returns 409 when core reports the bundle already exists', async () => {
      await create({ name: 'main', bundle: definition });
      const before = project.read('.lingo-tracker.json');
      expect((await create({ name: 'main', bundle: definition })).status).toBe(409);
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('returns 500 for a failure core does not type', async () => {
      project.write('.lingo-tracker.json', '{bad');
      expect((await create({ name: 'main', bundle: definition })).status).toBe(500);
    });
  });
  describe('PUT /bundles/:name', () => {
    it('passes the route name through verbatim', async () => {
      // A stored legacy name containing a percent sign is looked up without another decode.
      project.config.bundles = { 'tracker%v1': existing };
      project.configure();
      expect(await update('tracker%v1', { bundle: definition })).toEqual({
        status: 200,
        body: { message: 'Bundle "tracker%v1" updated successfully' },
      });
      expect(stored()).toHaveProperty('bundles.tracker%v1', definition);
    });
    it('answers the exact 400 body when real core rejects a blank rename', async () => {
      const before = project.read('.lingo-tracker.json');
      for (const name of ['', ' ']) {
        const answer = await update('tracker', { name, bundle: definition });
        expect(answer).toEqual({
          status: 400,
          body: { statusCode: 400, message: 'name must be a non-empty string', error: 'Bad Request' },
        });
        const collectionAnswer = await project.request('POST', '/collections', {
          name,
          collection: { translationsFolder: './i18n' },
        });
        expect(JSON.stringify(answer.body)).toBe(JSON.stringify(collectionAnswer.body));
      }
      expect(project.read('.lingo-tracker.json')).toBe(before);
      expect(stored()).toHaveProperty('bundles.tracker', existing);
    });
    it('returns 404 when core reports the bundle missing', async () => {
      expect((await update('missing', { bundle: definition })).status).toBe(404);
    });
    it('updates in place when no rename is requested', async () => {
      expect(await update('tracker', { bundle: definition })).toEqual({
        status: 200,
        body: { message: 'Bundle "tracker" updated successfully' },
      });
      expect(stored()).toHaveProperty('bundles.tracker', definition);
      expect(stored()).toHaveProperty('bundles.other', { ...existing, dist: './dist/other' });
    });
    it('returns 400 for a missing bundle when the body has no definition', async () => {
      expect(await update('missing', {})).toMatchObject({ status: 400, body: { message: 'bundle must be an object' } });
    });
    it('passes a body.name equal to the current name as newKey', async () => {
      expect(await update('tracker', { name: 'tracker', bundle: definition })).toEqual({
        status: 200,
        body: { message: 'Bundle "tracker" updated successfully' },
      });
      expect(stored()).toHaveProperty('bundles.tracker', definition);
    });
    it('passes the route name through when renaming via body.name', async () => {
      project.config.bundles = { 'tracker-v1': existing };
      project.configure();
      expect(await update('tracker-v1', { name: 'tracker-v2', bundle: definition })).toEqual({
        status: 200,
        body: { message: 'Bundle "tracker-v1" renamed to "tracker-v2" and updated successfully' },
      });
      expect(stored()).not.toHaveProperty('bundles.tracker-v1');
      expect(stored()).toHaveProperty('bundles.tracker-v2', definition);
    });
    it('returns 409 when core reports a rename collision', async () => {
      const before = project.read('.lingo-tracker.json');
      expect((await update('tracker', { name: 'other', bundle: definition })).status).toBe(409);
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('returns 400 when core rejects the definition', async () => {
      expect(await update('tracker', { bundle: { ...definition, bundleName: '' } })).toMatchObject({
        status: 400,
        body: { message: 'Invalid bundle definition', errors: ['bundleName is required.'] },
      });
    });
  });
  describe('DELETE /bundles/:name', () => {
    it('deletes an existing bundle', async () => {
      expect(await project.request('DELETE', '/bundles/tracker')).toEqual({
        status: 200,
        body: { message: 'Bundle "tracker" deleted successfully' },
      });
      expect(stored()).not.toHaveProperty('bundles.tracker');
      expect(stored()).toHaveProperty('bundles.other');
    });
    it('maps a core not-found error to 404', async () => {
      delete project.config.bundles?.tracker;
      project.configure();
      expect((await project.request('DELETE', '/bundles/tracker')).status).toBe(404);
    });
  });
  describe('POST /bundles/dry-run', () => {
    it('plans the request definition through core, not the saved one', async () => {
      await project.seed('a');
      await project.seed('b');
      const before = project.read('.lingo-tracker.json');
      const response = await plan({
        name: ' preview ',
        bundle: { ...definition, dist: ' ./dist/i18n ', typeDistFile: '' },
        locales: ['en'],
      });
      expect(response.status).toBe(201);
      expect(response.body.name).toBe('preview');
      expect(response.body.files).toEqual([
        { path: 'dist/i18n/main.en.json', kind: 'bundle', locale: 'en', exists: false, keysCount: 2 },
      ]);
      expect(project.exists('dist/i18n')).toBe(false);
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('omits locales from the plan when the request has none', async () => {
      await project.seed('a');
      const response = await plan({ name: 'preview', bundle: definition });
      expect(response.status).toBe(201);
      expect(response.body.files).toEqual([
        { path: 'dist/i18n/main.en.json', kind: 'bundle', locale: 'en', exists: false, keysCount: 1 },
        { path: 'dist/i18n/main.fr-ca.json', kind: 'bundle', locale: 'fr-ca', exists: false, keysCount: 1 },
      ]);
    });
    it('returns 400 with every domain message without planning', async () => {
      expect(
        await plan({
          name: 'bad name',
          bundle: { ...definition, dist: '', collections: [{ name: 'ghost', entriesSelectionRules: 'All' }] },
        }),
      ).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          message: 'Invalid bundle definition',
          error: 'Bad Request',
          errors: [
            'Bundle name may only contain letters, numbers, hyphens and underscores.',
            'dist (output folder) is required.',
            "Collection 'ghost' does not exist in the configuration.",
          ],
        },
      });
      expect(project.exists('dist/i18n')).toBe(false);
    });
    it('returns 400 when the name or the definition is missing', async () => {
      for (const [body, message] of [
        [{ bundle: definition }, 'name must be a string'],
        [{ name: 'preview' }, 'bundle must be an object'],
        [{ name: 'preview', bundle: null }, 'bundle must not be null'],
        [null, expect.stringContaining('not valid JSON')],
      ] as const)
        expect(await plan(body)).toMatchObject({ status: 400, body: { message } });
    });
    it('returns 400 for a locale outside the project locales', async () => {
      expect((await plan({ name: 'preview', bundle: definition, locales: ['xx'] })).status).toBe(400);
    });
  });
  describe('POST /bundles/:name/generate', () => {
    it('answers 202 for a saved bundle whose collection was deleted', async () => {
      project.config.bundles = {
        tracker: { ...existing, collections: [{ name: 'deleted', entriesSelectionRules: 'All' }] },
      };
      project.configure();
      const response = await generate('tracker', {});
      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        jobId: expect.any(String),
        bundleName: 'tracker',
        status: 'pending',
        progress: { current: 0, total: 0 },
      });
      const completed = await finish(response.body.jobId);
      expect(completed.body.status).toBe('completed');
      expect(completed.body.result).toMatchObject({
        warnings: expect.arrayContaining([expect.stringContaining('deleted')]),
      });
    });
    it('starts a job and answers 202 with its snapshot', async () => {
      await project.seed('a', 'Hello', { translations: [{ locale: 'fr-ca', value: 'Bonjour', status: 'translated' }] });
      const response = await generate('tracker', { locales: ['fr-ca'] });
      expect(response).toEqual({
        status: 202,
        body: {
          jobId: expect.any(String),
          bundleName: 'tracker',
          status: 'pending',
          progress: { current: 0, total: 0 },
        },
      });
      expect((await finish(response.body.jobId)).body.status).toBe('completed');
      expect(project.json('dist/tracker/fr-ca.json')).toEqual({ a: 'Bonjour' });
      expect(project.exists('dist/tracker/en.json')).toBe(false);
    });
    it('tolerates an empty body', async () => {
      await project.seed('a');
      const response = await generate();
      expect(response).toEqual({
        status: 202,
        body: {
          jobId: expect.any(String),
          bundleName: 'tracker',
          status: 'pending',
          progress: { current: 0, total: 0 },
        },
      });
      expect((await finish(response.body.jobId)).body.status).toBe('completed');
      expect(project.json('dist/tracker/en.json')).toEqual({ a: 'OK' });
      expect(project.json('dist/tracker/fr-ca.json')).toEqual({ a: 'OK' });
    });
    it('returns 404 for an unknown bundle', async () => {
      expect((await generate('missing', {})).status).toBe(404);
    });
    it('returns 404 for a name that only exists on Object.prototype', async () => {
      expect((await generate('constructor', {})).status).toBe(404);
    });
    it('returns 400 for a locale outside the project locales', async () => {
      expect((await generate('tracker', { locales: ['en', 'xx'] })).status).toBe(400);
    });
  });
  describe('GET /bundles/jobs/:jobId', () => {
    it('returns the job snapshot', async () => {
      await project.seed('a');
      const started = await generate('tracker', {});
      const response = await finish(started.body.jobId);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        jobId: started.body.jobId,
        bundleName: 'tracker',
        status: 'completed',
        progress: { current: 2, total: 2 },
      });
      expect(response.body.startedAt).toEqual(expect.any(String));
      expect(response.body.completedAt).toEqual(expect.any(String));
      expect(await job(started.body.jobId)).toEqual(response);
      expect(project.json('dist/tracker/en.json')).toEqual({ a: 'OK' });
      expect(project.json('dist/tracker/fr-ca.json')).toEqual({ a: 'OK' });
    });
    it('returns 404 for an unknown job', async () => {
      expect(await job('unknown')).toEqual({
        status: 404,
        body: { statusCode: 404, error: 'Not Found', message: 'Bundle job "unknown" not found' },
      });
    });
  });
});
