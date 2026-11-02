import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { HttpProject } from '../../testing/http-project';

describe('LocalesController HTTP (real project)', () => {
  let project: HttpProject;
  const route = (name = 'test-collection', locale?: string) =>
    `/collections/${encodeURIComponent(name)}/locales${locale === undefined ? '' : `/${encodeURIComponent(locale)}`}`;
  beforeEach(async () => {
    project = new HttpProject();
    project.config.locales = ['en', 'fr'];
    await project.start();
  });
  afterEach(async () => {
    await project.close();
  });

  describe('POST /locales (addLocale)', () => {
    it('refuses a read-only collection in the route pipe', async () => {
      const before = project.read('.lingo-tracker.json');
      const refusal = {
        status: 403,
        body: {
          statusCode: 403,
          error: 'Forbidden',
          message: 'Collection "vendor" is read-only. Its resources cannot be modified.',
        },
      };
      expect(await project.request('POST', route('vendor'), { locale: 'de' })).toEqual(refusal);
      expect(await project.request('DELETE', route('vendor', 'fr'))).toEqual(refusal);
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('returns 201 with message, entriesBackfilled, and filesUpdated on success', async () => {
      for (const key of ['one.a', 'one.b', 'two.c', 'two.d']) await project.seed(key);
      const before = project.read('.lingo-tracker.json');
      expect(await project.request('POST', route(), { locale: 'de' })).toEqual({
        status: 201,
        body: {
          message: 'Locale "de" added to collection "test-collection" successfully',
          entriesBackfilled: 4,
          filesUpdated: 2,
        },
      });
      expect(project.read('.lingo-tracker.json')).not.toBe(before);
      expect(project.json('.lingo-tracker.json')).toMatchObject({
        collections: { 'test-collection': { locales: ['en', 'fr', 'de'] } },
      });
      for (const folder of ['one', 'two']) {
        const entries = project.json(`translations/test/${folder}/resource_entries.json`) as Record<string, object>;
        expect(Object.values(entries)).toEqual([
          expect.objectContaining({ source: 'OK', de: 'OK' }),
          expect.objectContaining({ source: 'OK', de: 'OK' }),
        ]);
        const metadata = project.json(`translations/test/${folder}/tracker_meta.json`) as Record<string, object>;
        expect(Object.values(metadata)).toEqual([
          expect.objectContaining({ de: expect.objectContaining({ status: 'new' }) }),
          expect.objectContaining({ de: expect.objectContaining({ status: 'new' }) }),
        ]);
      }
    });
    it('returns 400 when locale already exists in collection', async () => {
      expect(await project.request('POST', route(), { locale: 'fr' })).toMatchObject({
        status: 400,
        body: { message: 'Locale "fr" already exists in collection "test-collection"' },
      });
    });
    it('returns 404 when collection is not in config', async () => {
      expect((await project.request('POST', route('nonexistent-collection'), { locale: 'de' })).status).toBe(404);
    });
    it('returns 400 when trying to add the base locale', async () => {
      expect(await project.request('POST', route(), { locale: 'en' })).toMatchObject({
        status: 400,
        body: { message: 'Cannot add or remove the base locale "en"' },
      });
    });
    it('returns 400 when locale format is invalid', async () => {
      expect(await project.request('POST', route(), { locale: 'not-valid-123' })).toMatchObject({
        status: 400,
        body: { message: 'Invalid locale format: "not-valid-123". Expected format: "en", "es", "fr-ca", etc.' },
      });
    });
    it('returns 500 for unexpected errors', async () => {
      rmSync(join(project.root, 'translations/test'), { recursive: true });
      project.write('translations/test', 'a file instead of a directory');
      expect((await project.request('POST', route(), { locale: 'de' })).status).toBe(500);
    });
    it('does not touch the index when collection lookup fails before core is called', async () => {
      await project.seed('one.a');
      await project.request('GET', '/collections/test-collection/resources/tree');
      const before = await project.request('GET', '/collections/test-collection/resources/cache/status');
      expect((await project.request('POST', route('nonexistent-collection'), { locale: 'de' })).status).toBe(404);
      expect(await project.request('GET', '/collections/test-collection/resources/cache/status')).toEqual(before);
    });
  });
  describe('DELETE /locales/:locale (removeLocale)', () => {
    it('returns 200 with message, entriesPurged, and filesUpdated on success', async () => {
      for (const key of ['one.a', 'one.b', 'two.c']) await project.seed(key);
      expect(await project.request('DELETE', route('test-collection', 'fr'))).toEqual({
        status: 200,
        body: {
          message: 'Locale "fr" removed from collection "test-collection" successfully',
          entriesPurged: 3,
          filesUpdated: 2,
        },
      });
      expect(project.json('.lingo-tracker.json')).toMatchObject({
        collections: { 'test-collection': { locales: ['en'] } },
      });
      for (const folder of ['one', 'two']) {
        const entries = project.json(`translations/test/${folder}/resource_entries.json`) as Record<string, object>;
        for (const entry of Object.values(entries)) expect(entry).not.toHaveProperty('fr');
        const metadata = project.json(`translations/test/${folder}/tracker_meta.json`) as Record<string, object>;
        for (const entry of Object.values(metadata)) expect(entry).not.toHaveProperty('fr');
      }
    });
    it('returns 404 when collection is not in config', async () => {
      expect((await project.request('DELETE', route('nonexistent-collection', 'fr'))).status).toBe(404);
    });
    it('returns 400 when locale is not in the collection', async () => {
      expect(await project.request('DELETE', route('test-collection', 'ja'))).toMatchObject({
        status: 400,
        body: { message: 'Locale "ja" not found in collection "test-collection"' },
      });
    });
    it('returns 400 when trying to remove the base locale', async () => {
      expect(await project.request('DELETE', route('test-collection', 'en'))).toMatchObject({
        status: 400,
        body: { message: 'Cannot add or remove the base locale "en"' },
      });
    });
    it('returns 400 when locale format is invalid', async () => {
      expect(await project.request('DELETE', route('test-collection', 'bad!'))).toMatchObject({
        status: 400,
        body: { message: 'Invalid locale format: "bad!". Expected format: "en", "es", "fr-ca", etc.' },
      });
    });
    it('returns 500 for unexpected errors', async () => {
      rmSync(join(project.root, 'translations/test'), { recursive: true });
      project.write('translations/test', 'not a directory');
      expect((await project.request('DELETE', route('test-collection', 'fr'))).status).toBe(500);
    });
    it('does not touch the index when collection lookup fails before core is called', async () => {
      await project.seed('one.a');
      await project.request('GET', '/collections/test-collection/resources/tree');
      const before = await project.request('GET', '/collections/test-collection/resources/cache/status');
      expect((await project.request('DELETE', route('nonexistent-collection', 'fr'))).status).toBe(404);
      expect(await project.request('GET', '/collections/test-collection/resources/cache/status')).toEqual(before);
    });
    it('passes the opened collection and locale to core function', async () => {
      await project.seed('one.a');
      expect(await project.request('DELETE', route('test-collection', 'fr'))).toEqual({
        status: 200,
        body: {
          message: 'Locale "fr" removed from collection "test-collection" successfully',
          entriesPurged: 1,
          filesUpdated: 1,
        },
      });
      expect(project.json('translations/test/one/resource_entries.json')).toEqual({ a: { source: 'OK' } });
    });
  });
});
