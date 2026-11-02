import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import {
  ResourceTreeIndex,
  type TranslateRequest,
  TranslationError,
  type TranslationProvider,
} from '@simoncodes-ca/core';
import type { ResourceTreeDto, SearchResultsDto, TranslateLocaleJobDto } from '@simoncodes-ca/data-transfer';
import { checkStoredValue, describeStoredValueFinding } from '@simoncodes-ca/domain';
import { CollectionIndex } from '../../cache/collection-index.service';
import { collection } from '../../mappers/resource.mapper.test-support';
import { HttpProject } from '../../testing/http-project';
import { TranslationJobService } from '../../translation-job/translation-job.service';
import { ResourcesController } from './resources.controller';

// Inject only the external provider through the public operation options. Each wrapper
// executes the original core function, including its real preconditions, writes and errors.
let mockProvider: ReturnType<typeof createProvider>;
jest.mock('@simoncodes-ca/core', () => {
  const actual = jest.requireActual<typeof import('@simoncodes-ca/core')>('@simoncodes-ca/core');
  return {
    ...actual,
    addResources: (...[collection, items, options]: Parameters<typeof actual.addResources>) =>
      actual.addResources(collection, items, { ...options, provider: mockProvider }),
    translateExistingResource: (...[collection, key, options]: Parameters<typeof actual.translateExistingResource>) =>
      actual.translateExistingResource(collection, key, { ...options, provider: mockProvider }),
    prepareTranslationRun: (...[collection, options]: Parameters<typeof actual.prepareTranslationRun>) =>
      actual.prepareTranslationRun(collection, { ...options, provider: mockProvider }),
  };
});

function createProvider(
  translate: (request: TranslateRequest) => string,
): TranslationProvider & { readonly calls: TranslateRequest[][] } {
  const calls: TranslateRequest[][] = [];
  return {
    calls,
    translate: async (requests) => {
      calls.push([...requests]);
      return requests.map((request) => ({ translatedText: translate(request), provider: 'in-memory' }));
    },
    getCapabilities: () => ({ supportsBatch: true, maxBatchSize: Number.MAX_SAFE_INTEGER, supportsFormality: false }),
  };
}

/** Real routes, pipes, exception filter, index and core; only the external provider is replaced. */
describe('ResourcesController HTTP (real project)', () => {
  let project: HttpProject;
  const route = (suffix = '', name = 'test-collection') =>
    `/collections/${encodeURIComponent(name)}/resources${suffix}`;
  const request = (method: string, body?: unknown, suffix = '', name = 'test-collection') =>
    project.request(method, route(suffix, name), body);
  const dto = { key: 'app.button.ok', baseValue: 'OK' };
  const op = { source: dto.key, destination: 'app.actions.ok' };
  const move = (moves: unknown[]) => request('POST', { moves }, '/move');
  const enable = () => {
    // The injected provider needs no API key. A missing injection fails before any network request.
    project.config.translation = {
      enabled: true,
      provider: 'google-translate',
      apiKeyEnv: 'TRANSLATE_API_SPEC_KEY',
      batchSize: 1,
      delayMs: 0,
    };
    project.configure();
  };
  const entries = (folder = 'app/button', collection = 'test') =>
    project.json(`translations/${collection}/${folder}/resource_entries.json`);
  const metadata = (folder = 'app/button') => project.json(`translations/test/${folder}/tracker_meta.json`);
  const tree = (query = '', name = 'test-collection') =>
    project.request<ResourceTreeDto>('GET', route(`/tree${query}`, name));
  const readyTree = async (query = '', name = 'test-collection') => {
    await tree(query, name);
    const response = await tree(query, name);
    expect(response.status).toBe(200);
    return response;
  };
  const search = (query: string) => project.request<SearchResultsDto>('GET', route(`/search?${query}`));
  const translateJob = (id: string, name = 'test-collection') =>
    project.request<TranslateLocaleJobDto>('GET', route(`/translate-locale/${id}`, name));
  const finish = async (id: string, name = 'test-collection') => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await translateJob(id, name);
      if (result.body.status === 'completed' || result.body.status === 'failed') return result;
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Translation job did not finish');
  };
  beforeEach(async () => {
    project = new HttpProject();
    mockProvider = createProvider(({ targetLocale }) => (targetLocale === 'fr-ca' ? 'Sauvegarder' : 'Guardar'));
    await project.start();
  });
  afterEach(async () => {
    try {
      await project.close();
    } finally {
      jest.restoreAllMocks();
    }
  });

  describe('createResources', () => {
    it('rejects empty and whitespace-only base values with 400 before creating anything', async () => {
      enable();
      for (const baseValue of ['', '   ']) {
        const response = await request('POST', { ...dto, baseValue });
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          message: baseValue === '' ? 'baseValue must have at least 1 character(s)' : 'Base value must not be empty.',
        });
        expect(project.exists('translations/test/app')).toBe(false);
      }
      expect(mockProvider.calls).toEqual([]);
    });

    it('rejects a braced value with a 400 message and details before writing', async () => {
      await project.seed('app.button.existing');
      const paths = ['resource_entries.json', 'tracker_meta.json'].map(
        (file) => `translations/test/app/button/${file}`,
      );
      const before = paths.map((path) => project.read(path));
      const found = checkStoredValue('{{{a}}}')[0];
      expect(found).toBeDefined();
      if (!found) throw new Error('Missing finding');
      const detail = describeStoredValueFinding(found);
      expect(await request('POST', { ...dto, baseValue: '{{{a}}}' })).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          error: 'Bad Request',
          message: `Value for locale "en" is not valid: ${detail}`,
          errors: [detail],
        },
      });
      expect(mockProvider.calls).toEqual([]);
      expect(paths.map((path) => project.read(path))).toEqual(before);
    });

    it('should successfully create a single resource', async () => {
      expect(await request('POST', dto)).toEqual({ status: 201, body: { entriesCreated: 1, created: true } });
      expect(entries()).toEqual({ ok: { source: 'OK', 'fr-ca': 'OK', es: 'OK' } });
      expect(metadata()).toMatchObject({ ok: { 'fr-ca': { status: 'new' }, es: { status: 'new' } } });
    });
    it('should successfully create multiple resources (bulk operation)', async () => {
      expect(await request('POST', [dto, { key: 'app.button.cancel', baseValue: 'Cancel' }])).toEqual({
        status: 201,
        body: { entriesCreated: 2, created: true },
      });
      expect(entries()).toEqual({
        ok: { source: 'OK', 'fr-ca': 'OK', es: 'OK' },
        cancel: { source: 'Cancel', 'fr-ca': 'Cancel', es: 'Cancel' },
      });
    });
    it('answers 409 when a resource already exists', async () => {
      await project.seed(dto.key);
      const before = project.read('translations/test/app/button/resource_entries.json');
      expect((await request('POST', dto)).status).toBe(409);
      expect(project.read('translations/test/app/button/resource_entries.json')).toBe(before);
    });
    it('should aggregate results correctly when multiple resources are created', async () => {
      expect(
        await request('POST', [
          dto,
          { key: 'app.button.cancel', baseValue: 'Cancel' },
          { key: 'app.button.save', baseValue: 'Save' },
        ]),
      ).toEqual({ status: 201, body: { entriesCreated: 3, created: true } });
      expect(entries()).toMatchObject({ ok: { source: 'OK' }, cancel: { source: 'Cancel' }, save: { source: 'Save' } });
      expect(Object.keys(entries() as object)).toHaveLength(3);
    });
    it('passes the route param through verbatim', async () => {
      expect((await request('POST', dto, '', 'My%Collection')).status).toBe(201);
      expect(entries('app/button', 'percent')).toMatchObject({ ok: { source: 'OK' } });
      expect(project.exists('translations/space/app')).toBe(false);
    });
    it('should throw NotFoundException when collection does not exist', async () => {
      expect((await request('POST', dto, '', 'non-existent')).status).toBe(404);
    });
    it('should throw HttpException when empty array is provided', async () => {
      expect(await request('POST', [])).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: 'request body must be a non-empty array' },
      });
    });
    it('should answer 400 for invalid key validation', async () => {
      expect(await request('POST', { key: 'invalid@key', baseValue: 'OK' })).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Key validation: Invalid key segment "invalid@key". Segments must match pattern [A-Za-z0-9_-]+',
        },
      });
    });
    it('should answer 400 for empty key', async () => {
      expect((await request('POST', { key: '', baseValue: 'OK' })).status).toBe(400);
    });
    it('answers 400 for an unknown translation status', async () => {
      expect(
        await request('POST', { ...dto, translations: [{ locale: 'fr-ca', value: 'Oui', status: 'verifed' }] }),
      ).toMatchObject({ status: 400, body: { message: expect.stringContaining('verifed') } });
    });
    it('should answer 502 when the translation provider fails during auto-translation', async () => {
      enable();
      mockProvider = createProvider(() => {
        throw new TranslationError('Google Translate server error: backend down', 'SERVER_ERROR', true);
      });
      expect((await request('POST', dto)).status).toBe(502);
      expect(project.exists('translations/test/app')).toBe(false);
    });
    it('should answer a generic 500 that hides the message for unexpected errors', async () => {
      project.write('translations/test/app/button/resource_entries.json/blocker', 'directory in place of JSON file');
      expect(await request('POST', dto)).toEqual({
        status: 500,
        body: { statusCode: 500, error: 'Internal Server Error' },
      });
    });
    it('should handle resource with all optional fields', async () => {
      const full = { ...dto, comment: 'Cancel button', tags: ['ui', 'buttons'], targetFolder: 'apps.common.buttons' };
      expect(await request('POST', full)).toEqual({ status: 201, body: { entriesCreated: 1, created: true } });
      expect(entries('apps/common/buttons/app/button')).toMatchObject({
        ok: { source: 'OK', comment: 'Cancel button', tags: ['ui', 'buttons'] },
      });
    });
    it('should handle resource with translations', async () => {
      expect(
        (
          await request('POST', {
            ...dto,
            translations: [{ locale: 'fr-ca', value: "D'accord", status: 'translated' }],
          })
        ).status,
      ).toBe(201);
      expect(entries()).toMatchObject({ ok: { source: 'OK', 'fr-ca': "D'accord" } });
      expect(metadata()).toMatchObject({ ok: { 'fr-ca': { status: 'translated' } } });
    });
  });
  describe('delete', () => {
    beforeEach(async () => {
      for (const key of ['app.button.ok', 'app.button.cancel', 'app.button.save']) await project.seed(key);
    });
    it('should successfully delete an existing resource', async () => {
      expect(await request('DELETE', { keys: [dto.key] })).toEqual({ status: 200, body: { entriesDeleted: 1 } });
      expect(entries()).not.toHaveProperty('ok');
      expect(metadata()).not.toHaveProperty('ok');
    });
    it('should successfully delete multiple resources (bulk operation)', async () => {
      expect(await request('DELETE', { keys: [dto.key, 'app.button.cancel', 'app.button.save'] })).toEqual({
        status: 200,
        body: { entriesDeleted: 3 },
      });
      expect(project.exists('translations/test/app/button/resource_entries.json')).toBe(false);
      expect(project.exists('translations/test/app/button/tracker_meta.json')).toBe(false);
    });
    it('should handle partial failures with errors array', async () => {
      expect(await request('DELETE', { keys: [dto.key, 'app.button.cancel', 'app.button.invalid'] })).toEqual({
        status: 200,
        body: {
          entriesDeleted: 2,
          errors: [{ key: 'app.button.invalid', error: 'Resource not found: app.button.invalid' }],
        },
      });
      expect(entries()).toEqual({ save: { source: 'OK', 'fr-ca': 'OK', es: 'OK' } });
    });
    it('returns 200 with errors when no requested resource can be deleted', async () => {
      expect(await request('DELETE', { keys: ['app.button.missing'] })).toEqual({
        status: 200,
        body: {
          entriesDeleted: 0,
          errors: [{ key: 'app.button.missing', error: 'Resource not found: app.button.missing' }],
        },
      });
      expect(entries()).toHaveProperty('ok.source', 'OK');
    });
    it('passes the route param through verbatim', async () => {
      await project.seed(dto.key, 'Percent', {}, 'My%Collection');
      expect(await request('DELETE', { keys: [dto.key] }, '', 'My%Collection')).toEqual({
        status: 200,
        body: { entriesDeleted: 1 },
      });
      expect(project.exists('translations/percent/app/button/resource_entries.json')).toBe(false);
      expect(entries()).toHaveProperty('ok.source', 'OK');
    });
    it('should throw NotFoundException when collection does not exist', async () => {
      expect((await request('DELETE', { keys: [dto.key] }, '', 'non-existent')).status).toBe(404);
    });
    it('should throw HttpException (400) for empty keys array', async () => {
      expect(await request('DELETE', { keys: [] })).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: 'keys must be a non-empty array' },
      });
    });
    it('should throw HttpException (400) for missing keys array', async () => {
      expect(await request('DELETE', {})).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: 'keys must be a non-empty array' },
      });
    });
    it('should answer 500 for unexpected errors', async () => {
      // Real malformed project JSON fails before the per-key error collector.
      project.write('.lingo-tracker.json', '{bad');
      expect((await request('DELETE', { keys: [dto.key] })).status).toBe(500);
    });
    it('should successfully delete nested resource', async () => {
      await project.seed('apps.common.buttons.ok');
      expect(await request('DELETE', { keys: ['apps.common.buttons.ok'] })).toEqual({
        status: 200,
        body: { entriesDeleted: 1 },
      });
      expect(project.exists('translations/test/apps/common/buttons/resource_entries.json')).toBe(false);
      expect(project.exists('translations/test/apps/common/buttons/tracker_meta.json')).toBe(false);
    });
  });
  describe('move', () => {
    beforeEach(async () => {
      await project.seed(dto.key);
    });
    it('should successfully move resources', async () => {
      expect(await move([op])).toEqual({ status: 201, body: { movedCount: 1, warnings: [], errors: [] } });
      expect(project.exists('translations/test/app/button/resource_entries.json')).toBe(false);
      expect(entries('app/actions')).toMatchObject({ ok: { source: 'OK', 'fr-ca': 'OK', es: 'OK' } });
      expect(metadata('app/actions')).toHaveProperty('ok');
    });
    it('returns 201 with errors when no requested resource can be moved', async () => {
      expect(await move([{ source: 'app.button.missing', destination: 'app.actions.missing' }])).toEqual({
        status: 201,
        body: { movedCount: 0, warnings: [], errors: ['Source key not found: app.button.missing'] },
      });
      expect(entries()).toHaveProperty('ok.source', 'OK');
      expect(project.exists('translations/test/app/actions')).toBe(false);
    });
    it('answers 400 without mutations for a malformed pattern after a valid operation', async () => {
      await project.seed('later.ok');
      await readyTree();
      const before = project.read('translations/test/app/button/resource_entries.json');
      expect(
        await move([
          op,
          { source: 'invalid@char*', destination: 'dest' },
          { source: 'later.ok', destination: 'never.ok' },
        ]),
      ).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Key validation: Invalid key segment "invalid@char". Segments must match pattern [A-Za-z0-9_-]+',
        },
      });
      expect(project.read('translations/test/app/button/resource_entries.json')).toBe(before);
      expect(project.exists('translations/test/app/actions')).toBe(false);
      expect(project.exists('translations/test/never')).toBe(false);
      expect((await readyTree('?includeNested=true')).body.resources.map((r) => r.fullKey)).toEqual([
        'later.ok',
        'app.button.ok',
      ]);
    });
    it('should pass override flag', async () => {
      await project.seed(op.destination, 'Old');
      expect(await move([{ ...op, override: true }])).toEqual({
        status: 201,
        body: { movedCount: 1, warnings: [], errors: [] },
      });
      expect(entries('app/actions')).toMatchObject({ ok: { source: 'OK' } });
      expect(project.exists('translations/test/app/button/resource_entries.json')).toBe(false);
    });
    it('should aggregate results from multiple moves', async () => {
      await project.seed('c');
      await project.seed('d', 'Existing');
      const response = await move([op, { source: 'c', destination: 'd' }]);
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        movedCount: 1,
        warnings: ['Destination key already exists: d. Use override option to force move.'],
        errors: [],
      });
      expect(entries('app/actions')).toMatchObject({ ok: { source: 'OK' } });
      expect(entries('')).toMatchObject({ c: { source: 'OK' }, d: { source: 'Existing' } });
    });
    it('should throw BadRequest if moves array is empty', async () => {
      expect(await request('POST', { moves: [] }, '/move')).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: 'moves must be a non-empty array' },
      });
    });
    it('should throw BadRequest if moves is missing', async () => {
      expect(await request('POST', {}, '/move')).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: 'moves must be a non-empty array' },
      });
    });
    it('should handle cross-collection move', async () => {
      expect(await move([{ ...op, toCollection: 'My Collection' }])).toEqual({
        status: 201,
        body: { movedCount: 1, warnings: [], errors: [] },
      });
      expect(entries('app/actions', 'space')).toMatchObject({ ok: { source: 'OK' } });
      expect(project.exists('translations/test/app/button/resource_entries.json')).toBe(false);
    });
    it('passes an encoded-looking destination body name through unchanged', async () => {
      expect((await move([{ ...op, toCollection: 'My%20Collection' }])).status).toBe(201);
      expect(entries('app/actions', 'encoded')).toMatchObject({ ok: { source: 'OK' } });
      expect(project.exists('translations/space/app')).toBe(false);
    });
    it('maps a core move error into the response and applies the returned mutations once', async () => {
      expect(await move([{ ...op, toCollection: 'non-existent' }])).toEqual({
        status: 201,
        body: { movedCount: 0, warnings: [], errors: ['Destination collection "non-existent" not found'] },
      });
      expect(entries()).toHaveProperty('ok.source', 'OK');
    });
    it('maps a mixed core move result and applies its merged mutations once', async () => {
      await project.seed('common.ok');
      await project.seed('c');
      await project.seed('d');
      await readyTree();
      expect(
        await move([
          { ...op, toCollection: 'vendor' },
          { source: 'c', destination: 'd' },
          { source: 'common.ok', destination: 'shared.ok' },
        ]),
      ).toEqual({
        status: 201,
        body: {
          movedCount: 1,
          warnings: ['Destination key already exists: d. Use override option to force move.'],
          errors: ['Collection "vendor" is read-only. Its resources cannot be modified.'],
        },
      });
      expect(entries('shared')).toMatchObject({ ok: { source: 'OK' } });
      expect(project.exists('translations/test/common/resource_entries.json')).toBe(false);
      expect(entries()).toHaveProperty('ok');
      expect((await readyTree('?includeNested=true')).body.resources.map((r) => r.fullKey)).toEqual([
        'c',
        'd',
        'shared.ok',
        'app.button.ok',
      ]);
    });
  });
  describe('terminology findings', () => {
    const finding = {
      key: 'app.button.ok',
      discouraged: 'Expenditure',
      preferred: 'Investment',
      message: 'consider "Investment" instead of "Expenditure"',
    };
    it('carries the findings and problems of every created resource, problems deduped', async () => {
      project.write(
        '.lingo-tracker-preferred-terminology.json',
        '[{"discouraged":"Expenditure","preferred":"Investment"}]',
      );
      const response = await request('POST', [
        { ...dto, baseValue: 'Expenditure' },
        { key: 'app.button.cancel', baseValue: 'Cancel' },
      ]);
      expect(response.status).toBe(201);
      expect(JSON.stringify(response.body.terminology)).toBe(JSON.stringify({ findings: [finding], problems: [] }));
      expect(entries()).toMatchObject({ ok: { source: 'Expenditure' }, cancel: { source: 'Cancel' } });
      // A malformed rule file prevents findings, but its warning is deduplicated across the batch.
      project.write('.lingo-tracker-preferred-terminology.json', '{bad');
      expect(
        (
          await request('POST', [
            { key: 'a', baseValue: 'Expenditure' },
            { key: 'b', baseValue: 'Expenditure' },
          ])
        ).body.terminology,
      ).toEqual({
        findings: [],
        problems: [
          expect.stringContaining(
            `Preferred terminology checks skipped: Preferred terminology file is not valid JSON: ${join(project.root, '.lingo-tracker-preferred-terminology.json')}`,
          ),
        ],
      });
      expect(entries('')).toMatchObject({ a: { source: 'Expenditure' }, b: { source: 'Expenditure' } });
    });
    it('carries the findings of an update, and omits the field when there is nothing to report', async () => {
      await project.seed(dto.key);
      project.write(
        '.lingo-tracker-preferred-terminology.json',
        '[{"discouraged":"Expenditure","preferred":"Investment"}]',
      );
      expect((await request('PATCH', { key: dto.key, baseValue: 'Expenditure' })).body.terminology).toEqual({
        findings: [finding],
        problems: [],
      });
      expect(entries()).toHaveProperty('ok.source', 'Expenditure');
      expect((await request('PATCH', { key: dto.key, baseValue: 'y' })).body).not.toHaveProperty('terminology');
      expect(entries()).toHaveProperty('ok.source', 'y');
    });
  });
  describe('update', () => {
    beforeEach(async () => {
      await project.seed(dto.key);
    });
    it.each([
      { locale: 'en', changes: { baseValue: '{{{a}}}' } },
      { locale: 'fr-ca', changes: { baseValue: 'Changed', locales: { 'fr-ca': { value: '{{{a}}}' } } } },
    ])('rejects braced PATCH values for $locale without changing files', async ({ locale, changes }) => {
      const paths = ['resource_entries.json', 'tracker_meta.json'].map(
        (file) => `translations/test/app/button/${file}`,
      );
      const before = paths.map((path) => project.read(path));
      const found = checkStoredValue('{{{a}}}')[0];
      expect(found).toBeDefined();
      if (!found) throw new Error('Missing finding');
      const detail = describeStoredValueFinding(found);
      expect(await request('PATCH', { key: dto.key, ...changes, moveTo: 'shared' })).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          error: 'Bad Request',
          message: `Value for locale "${locale}" is not valid: ${detail}`,
          errors: [detail],
        },
      });
      expect(paths.map((path) => project.read(path))).toEqual(before);
      expect(project.exists('translations/test/shared')).toBe(false);
      expect(mockProvider.calls).toEqual([]);
    });
    it('answers 400 for an unknown locale status', async () => {
      expect(
        await request('PATCH', { key: dto.key, locales: { 'fr-ca': { value: 'Oui', status: 'verifed' } } }),
      ).toMatchObject({ status: 400, body: { message: expect.stringContaining('verifed') } });
    });
    it('rejects an empty base value on PATCH with 400 and keeps the stored entry', async () => {
      const paths = ['resource_entries.json', 'tracker_meta.json'].map(
        (file) => `translations/test/app/button/${file}`,
      );
      const before = paths.map((path) => project.read(path));
      expect(await request('PATCH', { key: dto.key, baseValue: '' })).toMatchObject({
        status: 400,
        body: { message: 'baseValue must have at least 1 character(s)' },
      });
      expect(paths.map((path) => project.read(path))).toEqual(before);
      expect(mockProvider.calls).toEqual([]);
    });
    it('rejects a whitespace-only base value on PATCH in core without writing', async () => {
      const paths = ['resource_entries.json', 'tracker_meta.json'].map(
        (file) => `translations/test/app/button/${file}`,
      );
      const before = paths.map((path) => project.read(path));
      expect(await request('PATCH', { key: dto.key, baseValue: '   ', moveTo: 'shared' })).toMatchObject({
        status: 400,
        body: { message: 'Base value must not be empty.' },
      });
      expect(paths.map((path) => project.read(path))).toEqual(before);
      expect(project.exists('translations/test/shared')).toBe(false);
      expect(mockProvider.calls).toEqual([]);
    });
    it('should successfully update a resource', async () => {
      const response = await request('PATCH', { key: dto.key, baseValue: 'OK Updated' });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        resolvedKey: dto.key,
        updated: true,
        resource: { base: { locale: 'en', value: 'OK Updated' } },
      });
      expect(response.body).not.toHaveProperty('message');
      expect(entries()).toHaveProperty('ok.source', 'OK Updated');
      expect(metadata()).toMatchObject({ ok: { 'fr-ca': { status: 'new' }, es: { status: 'new' } } });
    });
    it('should return the updated resource addressed at its resolved key', async () => {
      const response = await request('PATCH', { key: dto.key, moveTo: 'shared' });
      expect(response.status).toBe(200);
      expect(response.body.resource).toMatchObject({
        fullKey: 'shared.ok',
        folderPath: 'shared',
        entryKey: 'ok',
        base: { locale: 'en', value: 'OK' },
      });
      expect(entries('shared')).toHaveProperty('ok.source', 'OK');
      expect(project.exists('translations/test/app/button/resource_entries.json')).toBe(false);
    });
    it('should pass moveTo through to core', async () => {
      expect((await request('PATCH', { key: dto.key, moveTo: 'shared' })).status).toBe(200);
      expect(entries('shared')).toMatchObject({ ok: { source: 'OK' } });
      expect(project.exists('translations/test/app/button/resource_entries.json')).toBe(false);
      expect(metadata('shared')).toHaveProperty('ok');
    });
    it('should answer 409 when the destination resource already exists', async () => {
      await project.seed('shared.ok', 'Existing');
      expect((await request('PATCH', { key: dto.key, moveTo: 'shared' })).status).toBe(409);
      expect(entries('shared')).toHaveProperty('ok.source', 'Existing');
      expect(entries()).toHaveProperty('ok.source', 'OK');
    });
    it('should return no-op message when no changes detected', async () => {
      const before = project.read('translations/test/app/button/resource_entries.json');
      expect(await request('PATCH', dto)).toEqual({
        status: 200,
        body: { resolvedKey: dto.key, updated: false, message: 'No changes detected' },
      });
      expect(project.read('translations/test/app/button/resource_entries.json')).toBe(before);
    });
    it('should answer 404 when resource not found', async () => {
      expect(await request('PATCH', { key: 'app.button.missing' })).toEqual({
        status: 404,
        body: { statusCode: 404, error: 'Not Found', message: 'Resource not found: app.button.missing' },
      });
    });
    it('should answer 400 for validation errors', async () => {
      expect((await request('PATCH', { key: 'invalid..key' })).status).toBe(400);
    });
  });
  describe('getTree', () => {
    const rawFixture = (folder = '') => {
      const prefix = `translations/test/${folder}`;
      project.write(`${prefix}/resource_entries.json`, '{"title":{"source":"Title","es":"Título"}}');
      project.write(
        `${prefix}/tracker_meta.json`,
        '{"title":{"en":{"checksum":"a"},"es":{"status":"new","checksum":"","baseChecksum":"a"}}}',
      );
    };
    it('should return the tree read from the index', async () => {
      rawFixture();
      const response = await readyTree();
      expect(response.body.path).toBe('');
      expect(response.body.resources).toEqual([
        {
          fullKey: 'title',
          folderPath: '',
          entryKey: 'title',
          base: { locale: 'en', value: 'Title' },
          targets: [
            { locale: 'fr-ca', needsWork: true, sameAsBase: false },
            { locale: 'es', value: 'Título', status: 'new', needsWork: true, sameAsBase: false },
          ],
          tags: [],
          inheritedTags: [],
        },
      ]);
    });
    it('should pass the path to the index', async () => {
      rawFixture('apps');
      const response = await readyTree('?path=apps');
      expect(response.body.path).toBe('apps');
      expect(response.body.resources.map((r) => [r.fullKey, r.folderPath, r.entryKey])).toEqual([
        ['apps.title', 'apps', 'title'],
      ]);
    });
    it('should list every resource recursively when includeNested is set', async () => {
      rawFixture();
      await project.seed('dialog.save', 'Save');
      expect((await readyTree('?includeNested=true')).body.resources.map((r) => r.fullKey)).toEqual([
        'title',
        'dialog.save',
      ]);
    });
    it('should give nested resources their full address below a non-root path', async () => {
      rawFixture('apps');
      await project.seed('apps.dialog.save', 'Save');
      expect(
        (await readyTree('?path=apps&includeNested=true')).body.resources.map((r) => [
          r.fullKey,
          r.folderPath,
          r.entryKey,
        ]),
      ).toEqual([
        ['apps.title', 'apps', 'title'],
        ['apps.dialog.save', 'apps.dialog', 'save'],
      ]);
    });
    it('should return 202 when the index is not-started', async () => {
      expect(await tree()).toEqual({
        status: 202,
        body: { status: 'not-ready', message: expect.stringContaining('indexing started') },
      });
    });
    it('should return 202 when the index is error', async () => {
      rmSync(join(project.root, 'translations/test'), { recursive: true });
      project.write('translations/test', 'not a folder');
      await tree();
      expect(await tree()).toEqual({
        status: 202,
        body: { status: 'not-ready', message: expect.stringContaining('re-indexing') },
      });
      rmSync(join(project.root, 'translations/test'));
      project.write('translations/test/resource_entries.json', '{}');
      await tree();
      expect((await tree()).status).toBe(200);
    });
    it('should return 202 when the index is indexing', async () => {
      jest.spyOn(ResourceTreeIndex.prototype, 'load').mockImplementation(() => undefined);
      await tree();
      expect(await tree()).toEqual({
        status: 202,
        body: { status: 'indexing', message: 'Collection is currently being indexed. Please try again shortly.' },
      });
    });
    it('should return 404 when the path is not in the tree', async () => {
      await readyTree();
      expect((await tree('?path=nonexistent.path')).status).toBe(404);
    });
    it('should return 404 for non-existent collection', async () => {
      expect((await tree('', 'nonexistent')).status).toBe(404);
    });
    it('should return a generic 500 when reading the index throws', async () => {
      project.config.locales = 42 as never;
      project.configure();
      expect(await tree()).toEqual({ status: 500, body: { statusCode: 500, error: 'Internal Server Error' } });
    });
  });
  describe('getCacheStatus', () => {
    it('should return the index status', async () => {
      for (let i = 0; i < 42; i++) await project.seed(`key${i}`);
      await readyTree();
      expect(await request('GET', undefined, '/cache/status')).toEqual({
        status: 200,
        body: {
          status: 'ready',
          collectionName: 'test-collection',
          stats: { totalKeys: 42, localeCount: 3 },
          indexedAt: expect.any(String),
        },
      });
    });
    it('should return 404 for non-existent collection', async () => {
      expect((await request('GET', undefined, '/cache/status', 'nonexistent')).status).toBe(404);
    });
    it('passes the route param through verbatim', async () => {
      expect((await request('GET', undefined, '/cache/status', 'My%Collection')).body).toMatchObject({
        collectionName: 'My%Collection',
      });
      expect((await request('GET', undefined, '/cache/status', 'My%Collection')).body).toMatchObject({
        status: 'ready',
        collectionName: 'My%Collection',
      });
    });
  });
  describe('search', () => {
    it('should map the search results from the index', async () => {
      project.write(
        'translations/test/app/resource_entries.json',
        '{"title":{"source":"LingoTracker","es":"LingoTracker"}}',
      );
      project.write(
        'translations/test/app/tracker_meta.json',
        '{"title":{"en":{"checksum":"a"},"es":{"status":"translated","checksum":"b","baseChecksum":"a"}}}',
      );
      const response = await search('query=%20lingo%20');
      expect(response.status).toBe(200);
      expect(response.body.query).toBe(' lingo ');
      expect(response.body.results.map((r) => [r.fullKey, r.folderPath, r.entryKey])).toEqual([
        ['app.title', 'app', 'title'],
      ]);
      expect(response.body.results[0]?.base).toEqual({ locale: 'en', value: 'LingoTracker' });
      expect(response.body.results[0]?.targets.map((t) => [t.locale, t.status, t.sameAsBase])).toEqual([
        ['fr-ca', undefined, false],
        ['es', 'translated', true],
      ]);
      expect(response.body.limited).toBe(false);
      expect(response.body.totalFound).toBe(1);
    });
    it('should return empty results for empty query', async () => {
      expect((await search('query=')).body).toMatchObject({ results: [], totalFound: 0 });
      expect((await search('query=%20%20%20')).body).toEqual({
        query: '   ',
        results: [],
        totalFound: 0,
        limited: false,
      });
    });
    it('should report the true total supplied by core', async () => {
      // Seed in one disk write: the search still scans 501 real resources.
      const resources = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k${i}`, { source: 'test' }]));
      project.write('translations/test/resource_entries.json', JSON.stringify(resources));
      const response = await search('query=test&maxResults=1');
      expect(response.status).toBe(200);
      expect(response.body.limited).toBe(true);
      expect(response.body.results).toHaveLength(1);
      expect(response.body.totalFound).toBe(501);
    });
    it('defaults to 100 results when maxResults is absent', async () => {
      const resources = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, { source: 'test' }]));
      project.write('translations/test/resource_entries.json', JSON.stringify(resources));
      const response = await search('query=test');
      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(100);
      expect(response.body.limited).toBe(true);
      expect(response.body.totalFound).toBe(101);
    });
    it('should run a similar-value search for mode=similar and return the similarity', async () => {
      await project.seed('common.save', 'Save');
      const response = await search('query=Save%20draft&maxResults=11&mode=similar');
      expect(response.status).toBe(200);
      expect(response.body.results.map((r) => [r.fullKey, r.matchType, r.similarity])).toEqual([
        ['common.save', 'similar-value', 0.4],
      ]);
    });
    it('should read maxResults from its query-string form', async () => {
      for (let i = 0; i < 8; i++) await project.seed(`key${i}`, 'save');
      const response = await search('query=save&maxResults=7');
      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(7);
      expect(response.body.totalFound).toBe(8);
      expect(response.body.limited).toBe(true);
    });
    it('should reject an invalid query-string maxResults with 400', async () => {
      expect(await search('query=save&maxResults=abc')).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: 'maxResults must be a positive integer' },
      });
    });
    it('should run a text search for an unknown mode', async () => {
      await project.seed('common.save', 'Save');
      await project.seed('common.other', 'Save draft');
      const response = await search('query=save&mode=fuzzy');
      expect(response.status).toBe(200);
      expect(response.body).toEqual((await search('query=save&mode=text')).body);
      expect(response.body.results).toHaveLength(2);
    });
  });
  describe('translateResource', () => {
    beforeEach(async () => {
      await project.seed('buttons.save', 'Save');
    });
    it('should return 422 when translation is not enabled for the collection', async () => {
      expect((await request('POST', { key: 'buttons.save' }, '/translate')).status).toBe(422);
    });
    it('should return 404 when the collection does not exist', async () => {
      enable();
      expect((await request('POST', { key: 'buttons.save' }, '/translate', 'unknown-collection')).status).toBe(404);
    });
    it('should return 404 when the resource does not exist', async () => {
      enable();
      expect((await request('POST', { key: 'buttons.missing' }, '/translate')).status).toBe(404);
    });
    it('should return 502 when the translation provider throws a TranslationError', async () => {
      enable();
      mockProvider = createProvider(() => {
        throw new TranslationError('Google Translate server error: backend down', 'SERVER_ERROR', true);
      });
      expect(await request('POST', { key: 'buttons.save' }, '/translate')).toEqual({
        status: 502,
        body: {
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Translation provider error: Google Translate server error: backend down',
        },
      });
    });
    it('should return a TranslateResourceResponseDto with translated resource on success', async () => {
      enable();
      const response = await request('POST', { key: 'buttons.save' }, '/translate');
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        translatedCount: 2,
        skippedLocales: [],
        resource: {
          fullKey: 'buttons.save',
          folderPath: 'buttons',
          entryKey: 'save',
          base: { locale: 'en', value: 'Save' },
          targets: [
            { locale: 'fr-ca', value: 'Sauvegarder', status: 'translated' },
            { locale: 'es', value: 'Guardar', status: 'translated' },
          ],
        },
      });
      expect(response.body).not.toHaveProperty('warnings');
      expect(mockProvider.calls.flat().map(({ targetLocale }) => targetLocale)).toEqual(['fr-ca', 'es']);
      expect(entries('buttons')).toEqual({ save: { source: 'Save', 'fr-ca': 'Sauvegarder', es: 'Guardar' } });
      expect(metadata('buttons')).toMatchObject({
        save: { 'fr-ca': { status: 'translated' }, es: { status: 'translated' } },
      });
    });
    it('passes on the warnings of the translation, e.g. a named protected-terms file that does not exist', async () => {
      project.config.protectedTermsFile = 'terms.json';
      enable();
      const response = await request('POST', { key: 'buttons.save' }, '/translate');
      expect(response.status).toBe(201);
      expect(response.body.warnings).toEqual([
        `Protected terms file not found: ${join(project.root, 'terms.json')}. Treating as an empty list.`,
      ]);
    });
    it('should pass the opened collection and resource key to core', async () => {
      enable();
      expect((await request('POST', { key: 'buttons.save' }, '/translate')).status).toBe(201);
      expect(entries('buttons')).toHaveProperty('save.fr-ca', 'Sauvegarder');
      expect(project.exists('translations/percent/buttons')).toBe(false);
    });
    it('passes the opened collection to translation', async () => {
      enable();
      expect((await request('POST', { key: 'buttons.save' }, '/translate')).status).toBe(201);
      expect(entries('buttons')).toHaveProperty('save.es', 'Guardar');
    });
    it('should include skipped locales in the response', async () => {
      // Complex ICU is deliberately skipped by the real translator in every target locale.
      await request('PATCH', { key: 'buttons.save', baseValue: '{count, plural, one {Save} other {Saves}}' });
      enable();
      const before = project.read('translations/test/buttons/resource_entries.json');
      const response = await request('POST', { key: 'buttons.save' }, '/translate');
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ translatedCount: 0, skippedLocales: ['fr-ca', 'es'] });
      expect(project.read('translations/test/buttons/resource_entries.json')).toBe(before);
    });
  });
  describe('translateLocale (POST translate-locale)', () => {
    it('should return 202 with a job DTO when valid', async () => {
      await project.seed('a', 'Save');
      enable();
      const response = await request('POST', { locale: 'fr-ca' }, '/translate-locale');
      expect(response).toEqual({
        status: 202,
        body: {
          jobId: expect.any(String),
          collectionName: 'test-collection',
          targetLocale: 'fr-ca',
          status: 'pending',
          totalResources: 0,
          translatedCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
      });
      const id = String(response.body.jobId);
      expect((await finish(id)).body).toMatchObject({
        totalResources: 1,
        translatedCount: 1,
        failedCount: 0,
        skippedCount: 0,
        status: 'completed',
      });
      expect(entries('')).toHaveProperty('a.fr-ca', 'Sauvegarder');
    });
    it('should return 404 when collection not found', async () => {
      expect((await request('POST', { locale: 'fr-ca' }, '/translate-locale', 'unknown-collection')).status).toBe(404);
    });
    it('should return 422 when translation is not enabled for the collection', async () => {
      expect(await request('POST', { locale: 'fr-ca' }, '/translate-locale')).toMatchObject({
        status: 422,
        body: { message: 'Auto-translation is not enabled for collection "test-collection"' },
      });
    });
    it('should return 400 when no target locales are configured', async () => {
      project.config.collections['test-collection'].locales = ['en'];
      enable();
      expect(await request('POST', { locale: 'fr' }, '/translate-locale')).toMatchObject({
        status: 400,
        body: { message: 'No target locales configured. Add locales other than the base locale "en".' },
      });
    });
    it('should return 400 when locale equals the base locale', async () => {
      enable();
      expect(await request('POST', { locale: 'en' }, '/translate-locale')).toMatchObject({
        status: 400,
        body: { message: 'Cannot translate to the base locale "en".' },
      });
    });
    it('should return 400 when locale is not in the collection locales list', async () => {
      enable();
      expect(await request('POST', { locale: 'de' }, '/translate-locale')).toMatchObject({
        status: 400,
        body: { message: 'Locale "de" is not configured. Available locales: en, fr-ca, es' },
      });
    });
  });
  describe('getTranslateLocaleJob (GET translate-locale/:jobId)', () => {
    it('should return the job DTO when found and collection matches', async () => {
      for (let i = 0; i < 10; i++) await project.seed(`key${i}`, i === 9 ? 'Failed' : 'Save');
      mockProvider = createProvider(({ text }) => {
        if (text === 'Failed') throw new Error('provider failed');
        return 'Sauvegarder';
      });
      enable();
      const started = await request('POST', { locale: 'fr-ca' }, '/translate-locale');
      const id = String(started.body.jobId);
      const response = await finish(id);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        jobId: id,
        collectionName: 'test-collection',
        targetLocale: 'fr-ca',
        status: 'completed',
        totalResources: 10,
        translatedCount: 9,
        failedCount: 1,
        skippedCount: 0,
      });
      expect(await translateJob(id)).toEqual(response);
      const stored = entries('') as Record<string, { 'fr-ca': string }>;
      for (let i = 0; i < 9; i++) expect(stored[`key${i}`]?.['fr-ca']).toBe('Sauvegarder');
      expect(stored.key9?.['fr-ca']).toBe('Failed');
    });
    it('should return 404 when job not found', async () => {
      expect(await translateJob('unknown-id')).toEqual({
        status: 404,
        body: { statusCode: 404, error: 'Not Found', message: 'Translation job "unknown-id" not found' },
      });
    });
    it('should return 404 when job exists but collectionName does not match', async () => {
      enable();
      const response = await request('POST', { locale: 'fr-ca' }, '/translate-locale', 'My%Collection');
      const id = String(response.body.jobId);
      await finish(id, 'My%Collection');
      expect(await translateJob(id)).toEqual({
        status: 404,
        body: { statusCode: 404, error: 'Not Found', message: `Translation job "${id}" not found` },
      });
    });
  });
});

const core = jest.requireMock<typeof import('@simoncodes-ca/core')>('@simoncodes-ca/core');

/** Controller return contracts also pin own fields that JSON serialization omits. */
describe('ResourcesController response contracts', () => {
  const controller = new ResourcesController(new CollectionIndex(), new TranslationJobService(new Logger()));
  const opened = {
    ...collection,
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

  it('returns blank searches in wire order with the original query or an empty fallback', async () => {
    for (const query of [undefined, '', ' \t ']) {
      const dto = await controller.search(opened, { query });
      expect(Object.keys(dto)).toEqual(['query', 'results', 'totalFound', 'limited']);
      expect(JSON.stringify(dto)).toBe(
        JSON.stringify({ query: query || '', results: [], totalFound: 0, limited: false }),
      );
    }
  });

  it('retains undefined errors as an own field and excludes internal deletion fields', async () => {
    jest
      .spyOn(core, 'deleteResource')
      .mockReturnValue({ outcome: 'succeeded', entriesDeleted: 1, warnings: ['Internal'] });
    const dto = await controller.delete(opened, { keys: ['app.save'] });
    expect(dto).toStrictEqual({ entriesDeleted: 1, errors: undefined });
    expect(Object.keys(dto)).toEqual(['entriesDeleted', 'errors']);
    expect(JSON.stringify(dto)).toBe('{"entriesDeleted":1}');
  });

  it('passes through empty and nonempty deletion errors in wire order', async () => {
    for (const errors of [[], [{ key: 'app.save', error: 'Missing' }]]) {
      jest.spyOn(core, 'deleteResource').mockReturnValue({ outcome: 'succeeded', entriesDeleted: 0, errors });
      const dto = await controller.delete(opened, { keys: ['app.save'] });
      expect(dto.errors).toBe(errors);
      expect(JSON.stringify(dto)).toBe(JSON.stringify({ entriesDeleted: 0, errors }));
    }
  });

  it('keeps empty and nonempty move diagnostics while omitting outcome and folder counts', async () => {
    for (const result of [
      { outcome: 'succeeded' as const, movedCount: 1, foldersDeleted: 1, warnings: [], errors: [] },
      { outcome: 'failed' as const, movedCount: 0, warnings: ['Exists'], errors: ['Missing'] },
    ]) {
      jest.spyOn(core, 'executeMoves').mockReturnValue(result);
      const dto = await controller.move(opened, { moves: [{ source: 'a', destination: 'b' }] });
      expect(Object.keys(dto)).toEqual(['movedCount', 'warnings', 'errors']);
      expect(dto.warnings).toBe(result.warnings);
      expect(dto.errors).toBe(result.errors);
      expect(JSON.stringify(dto)).toBe(
        JSON.stringify({ movedCount: result.movedCount, warnings: result.warnings, errors: result.errors }),
      );
    }
  });
});
