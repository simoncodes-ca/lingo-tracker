import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { HttpProject } from '../testing/http-project';

describe('CollectionsController HTTP (real project)', () => {
  let project: HttpProject;
  const route = (name: string) => `/collections/${encodeURIComponent(name)}`;
  const create = (body?: unknown) => project.request('POST', '/collections', body);
  const update = (name: string, body: unknown) => project.request('PUT', route(name), body);
  const patch = { translationsFolder: './translations/updated' };
  beforeEach(async () => {
    project = new HttpProject();
    await project.start();
  });
  afterEach(async () => {
    await project.close();
  });
  const stored = () => project.json('.lingo-tracker.json');

  describe('deleteCollection', () => {
    it('should successfully delete a collection', async () => {
      expect(await project.request('DELETE', route('test-collection'))).toEqual({
        status: 200,
        body: { message: 'Collection "test-collection" deleted successfully' },
      });
      expect(stored()).not.toHaveProperty('collections.test-collection');
    });
    it('deletes a read-only collection registration', async () => {
      expect(await project.request('DELETE', route('vendor'))).toEqual({
        status: 200,
        body: { message: 'Collection "vendor" deleted successfully' },
      });
      expect(stored()).not.toHaveProperty('collections.vendor');
      expect(project.exists('translations/vendor')).toBe(true);
    });
    it('passes the route param through verbatim', async () => {
      expect(await project.request('DELETE', route('My%Collection'))).toEqual({
        status: 200,
        body: { message: 'Collection "My%Collection" deleted successfully' },
      });
      expect(stored()).not.toHaveProperty('collections.My%Collection');
      expect(stored()).toHaveProperty('collections.My Collection');
    });
    it('lets CollectionNotFoundError through, which the filter answers with 404', async () => {
      const before = project.read('.lingo-tracker.json');
      expect((await project.request('DELETE', route('non-existent'))).status).toBe(404);
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('passes a registration without a translations folder to core deletion', async () => {
      project.write(
        '.lingo-tracker.json',
        JSON.stringify({ ...project.config, collections: { ...project.config.collections, broken: {} } }),
      );
      expect(await project.request('DELETE', route('broken'))).toEqual({
        status: 200,
        body: { message: 'Collection "broken" deleted successfully' },
      });
      expect(stored()).not.toHaveProperty('collections.broken');
    });
    it('answers a refused deletion with 409 and leaves the index alone', async () => {
      await project.seed('app.ok');
      project.config.bundles = {
        main: {
          bundleName: '{locale}',
          dist: './dist',
          collections: [{ name: 'test-collection', entriesSelectionRules: 'All' }],
        },
      };
      project.configure();
      await project.request('GET', '/collections/test-collection/resources/tree');
      const index = await project.request('GET', '/collections/test-collection/resources/cache/status');
      const before = project.read('.lingo-tracker.json');
      expect(await project.request('DELETE', route('test-collection'))).toEqual({
        status: 409,
        body: {
          message:
            'Collection "test-collection" is the only collection of bundle(s) "main". Remove it from those bundles or delete them first.',
          error: 'Conflict',
          statusCode: 409,
        },
      });
      expect(project.read('.lingo-tracker.json')).toBe(before);
      expect(await project.request('GET', '/collections/test-collection/resources/cache/status')).toEqual(index);
    });
    it('propagates an unexpected error and leaves the index alone', async () => {
      // A config path that is a directory makes real configuration I/O fail.
      rmSync(join(project.root, '.lingo-tracker.json'));
      project.write('.lingo-tracker.json/blocker', 'directory');
      expect((await project.request('DELETE', route('test-collection'))).status).toBe(500);
      expect(project.exists('.lingo-tracker.json/blocker')).toBe(true);
    });
    it('drops the index entry for the deleted collection folder', async () => {
      await project.seed('app.ok');
      await project.request('GET', '/collections/test-collection/resources/tree');
      expect((await project.request('DELETE', route('test-collection'))).status).toBe(200);
      // Re-register the same name with an empty folder: no stale tree survives deletion.
      expect(
        (await create({ name: 'test-collection', collection: { translationsFolder: join(project.root, 'empty') } }))
          .status,
      ).toBe(201);
      expect(await project.request('GET', '/collections/test-collection/resources/cache/status')).toEqual({
        status: 200,
        body: { status: 'not-started', collectionName: 'test-collection' },
      });
      expect((await project.request('GET', '/collections/test-collection/resources/tree')).body).toMatchObject({
        resources: [],
      });
    });
  });
  describe('createCollection', () => {
    it('answers a protected terms list without a file pointer with flag-free text', async () => {
      const before = project.read('.lingo-tracker.json');
      expect(
        await create({
          name: 'new-collection',
          collection: { translationsFolder: './translations/new', protectedTerms: ['iPhone'] },
        }),
      ).toEqual({
        status: 400,
        body: {
          message: 'Collection "new-collection" has no protected terms file. Set a file path first.',
          error: 'Bad Request',
          statusCode: 400,
        },
      });
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('should successfully create a collection', async () => {
      expect(
        await create({ name: 'new-collection', collection: { translationsFolder: './translations/new' } }),
      ).toEqual({ status: 201, body: { message: 'Collection "new-collection" added successfully' } });
      expect(stored()).toHaveProperty('collections.new-collection.translationsFolder', './translations/new');
    });
    it.each([
      ['no body', undefined, 'request body must be an object'],
      ['no name', { collection: { translationsFolder: './x' } }, 'name must be a non-empty string'],
      ['a blank name', { name: ' ', collection: { translationsFolder: './x' } }, 'name must be a non-empty string'],
      ['no collection', { name: 'new' }, 'collection must be an object'],
      ['an array collection', { name: 'new', collection: [] }, 'collection must be an object'],
    ])('answers 400 for %s, before core is called', async (_label, body, message) => {
      const before = project.read('.lingo-tracker.json');
      expect(await create(body)).toEqual({ status: 400, body: { statusCode: 400, error: 'Bad Request', message } });
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it.each([
      ['tags', { translationsFolder: './x', tags: null }],
      ['translationsFolder', { translationsFolder: null }],
      ['translation', { translationsFolder: './x', translation: null }],
    ])('keeps the 400 and message for a null %s field from core', async (field, collection) => {
      expect(await create({ name: 'new', collection })).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: `collection.${field} must not be null` },
      });
    });
    it('keeps the 400 and message for a non-string translationsFolder from core', async () => {
      expect(await create({ name: 'new', collection: { translationsFolder: 1 } })).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: 'collection.translationsFolder must be a string' },
      });
    });
    it('lets CollectionAlreadyExistsError through, which the filter answers with 409', async () => {
      await create({ name: 'new-collection', collection: { translationsFolder: './translations/new' } });
      const before = project.read('.lingo-tracker.json');
      expect(
        (await create({ name: 'new-collection', collection: { translationsFolder: './translations/new' } })).status,
      ).toBe(409);
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
  });
  describe('updateCollectionByName', () => {
    it('updates a read-only registration and lets a later update clear readOnly', async () => {
      const translationsFolder = join(project.root, 'translations/vendor');
      expect(await update('vendor', { collection: { translationsFolder, tags: ['Team X'] } })).toEqual({
        status: 200,
        body: { message: 'Collection "vendor" updated successfully' },
      });
      expect(stored()).toHaveProperty('collections.vendor', {
        translationsFolder,
        readOnly: true,
        tags: ['team-x'],
      });
      expect(await update('vendor', { collection: { translationsFolder, readOnly: false } })).toEqual({
        status: 200,
        body: { message: 'Collection "vendor" updated successfully' },
      });
      expect(stored()).toHaveProperty('collections.vendor', { translationsFolder, tags: ['team-x'] });
    });
    it('answers 404 for a missing body sent to an unknown collection', async () => {
      const before = project.read('.lingo-tracker.json');
      // Collection lookup takes precedence over body validation for unknown collections.
      expect(await project.request('PUT', route('unknown'))).toEqual({
        status: 404,
        body: { statusCode: 404, error: 'Not Found', message: 'Collection "unknown" not found' },
      });
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('answers 400 for a missing body sent to an existing collection', async () => {
      const before = project.read('.lingo-tracker.json');
      expect(await project.request('PUT', route('test-collection'))).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: 'request body must be an object' },
      });
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('answers a rename onto a dangling bundle reference with 409', async () => {
      project.config.bundles = {
        main: {
          bundleName: '{locale}',
          dist: './dist',
          collections: [
            { name: 'test-collection', entriesSelectionRules: 'All' },
            { name: 'legacy', entriesSelectionRules: 'All' },
          ],
        },
      };
      project.configure();
      const before = project.read('.lingo-tracker.json');
      expect(
        await update('test-collection', {
          name: 'legacy',
          collection: { translationsFolder: project.collection().translationsFolder },
        }),
      ).toEqual({
        status: 409,
        body: {
          message:
            'Cannot rename collection "test-collection" to "legacy": bundle(s) "main" already reference "legacy". Remove those references first.',
          error: 'Conflict',
          statusCode: 409,
        },
      });
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('should successfully update a collection', async () => {
      expect(await update('old-name', { name: 'new-name', collection: patch })).toEqual({
        status: 200,
        body: { message: 'Collection "old-name" renamed to "new-name" and updated successfully' },
      });
      expect(stored()).not.toHaveProperty('collections.old-name');
      expect(stored()).toHaveProperty('collections.new-name.translationsFolder', patch.translationsFolder);
    });
    it('passes the route param through verbatim', async () => {
      // Remove the separate literal-space registration before renaming onto it.
      await project.request('DELETE', route('My Collection'));
      expect(
        await update('My%Collection', {
          name: 'My Collection',
          collection: { translationsFolder: './translations/my' },
        }),
      ).toEqual({
        status: 200,
        body: { message: 'Collection "My%Collection" renamed to "My Collection" and updated successfully' },
      });
      expect(stored()).not.toHaveProperty('collections.My%Collection');
      expect(stored()).toHaveProperty('collections.My Collection.translationsFolder', './translations/my');
    });
    it.each([
      ['a blank name', { name: '', collection: { translationsFolder: './x' } }, 'name must be a non-empty string'],
      ['a non-string name', { name: 1, collection: { translationsFolder: './x' } }, 'name must be a string'],
      ['no collection', {}, 'collection must be an object'],
    ])('answers 400 for %s from shape validation or core', async (_label, body, message) => {
      expect(await update('old-name', body)).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message },
      });
    });
    it.each([
      ['translationsFolder', { translationsFolder: null }],
      ['locales', { translationsFolder: './x', locales: null }],
      ['translation', { translationsFolder: './x', translation: null }],
    ])('keeps the 400 and message for a null %s update field from core', async (field, collection) => {
      expect(await update('old-name', { collection })).toEqual({
        status: 400,
        body: { statusCode: 400, error: 'Bad Request', message: `collection.${field} must not be null` },
      });
    });
    it('answers 404 for malformed terms sent to an unknown update target', async () => {
      expect(
        (await update('unknown', { collection: { translationsFolder: './x', protectedTerms: ['valid', 42] } })).status,
      ).toBe(404);
    });
    it('answers 404 for a null field sent to an unknown collection', async () => {
      expect(await update('unknown', { collection: { translationsFolder: './x', locales: null } })).toEqual({
        status: 404,
        body: { statusCode: 404, error: 'Not Found', message: 'Collection "unknown" not found' },
      });
    });
    it('writes the protected terms under the current name when the body does not rename', async () => {
      project.config.collections['test-collection'].protectedTermsFile = 'own.json';
      project.configure();
      expect(
        (
          await update('test-collection', {
            collection: { translationsFolder: project.collection().translationsFolder, protectedTerms: ['iPhone'] },
          })
        ).status,
      ).toBe(200);
      expect(project.json('own.json')).toEqual(['iPhone']);
      expect(stored()).toHaveProperty('collections.test-collection.protectedTermsFile', 'own.json');
    });
    it('lets CollectionNotFoundError through (404) and leaves the index alone', async () => {
      delete project.config.collections['old-name'];
      project.configure();
      const before = project.read('.lingo-tracker.json');
      expect((await update('old-name', { name: 'new-name', collection: patch })).status).toBe(404);
      expect(project.read('.lingo-tracker.json')).toBe(before);
    });
    it('opens the collection update with the default index sink', async () => {
      await project.seed('app.ok');
      await project.request('GET', '/collections/test-collection/resources/tree');
      expect(
        (
          await update('test-collection', {
            collection: { translationsFolder: project.collection().translationsFolder, locales: ['en', 'es'] },
          })
        ).status,
      ).toBe(200);
      await project.request('GET', '/collections/test-collection/resources/tree');
      expect((await project.request('GET', '/collections/test-collection/resources/cache/status')).body).toMatchObject({
        status: 'ready',
        stats: { totalKeys: 1, localeCount: 2 },
      });
      expect(project.json('translations/test/app/resource_entries.json')).toEqual({ ok: { source: 'OK', es: 'OK' } });
    });
  });
});
