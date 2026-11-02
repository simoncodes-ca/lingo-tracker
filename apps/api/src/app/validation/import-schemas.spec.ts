import { importRequestBody, importSourcesQuery } from './dto-schemas';
import { SchemaPipe } from './valid-body';

describe('import shape schemas', () => {
  const body = new SchemaPipe(importRequestBody, 'request body');
  const query = new SchemaPipe(importSourcesQuery, 'query');
  it('accepts all DTO fields and leaves enum validation to the mapper', () => {
    const request = {
      collection: 'app',
      files: [{ path: 'file', locale: 'es', format: 'invalid' }],
      strategy: 'invalid',
      createMissing: true,
      updateComments: false,
      updateTags: true,
      preserveStatus: false,
      validateBase: true,
    };
    expect(body.transform(request)).toBe(request);
    expect(query.transform({ collection: 'app', folder: '/vendor' })).toEqual({ collection: 'app', folder: '/vendor' });
  });
  it('requires a non-empty files array and non-empty path and locale strings', () => {
    for (const files of [
      undefined,
      null,
      [],
      [{ path: '', locale: 'es' }],
      [{ path: 'x', locale: '' }],
      [{ path: 1, locale: 'es' }],
    ]) {
      expect(() => body.transform({ collection: 'app', files })).toThrow();
    }
  });
  it('checks collection, folder, format and each optional boolean shape', () => {
    expect(() => query.transform({})).toThrow('collection must be a string');
    expect(() => query.transform({ collection: 'app', folder: 1 })).toThrow('folder must be a string');
    expect(() => body.transform({ collection: 1, files: [{ path: 'x', locale: 'es' }] })).toThrow();
    expect(() => body.transform({ collection: 'app', files: [{ path: 'x', locale: 'es', format: true }] })).toThrow();
    for (const key of ['createMissing', 'updateComments', 'updateTags', 'preserveStatus', 'validateBase']) {
      expect(() => body.transform({ collection: 'app', files: [{ path: 'x', locale: 'es' }], [key]: 'true' })).toThrow(
        `${key} must be a boolean`,
      );
    }
  });
});
