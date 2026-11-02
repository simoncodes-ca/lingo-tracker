import { describe, expect, it } from 'vitest';
import { API_ROUTES, apiPath, matchApiRoute } from '../index';

describe('apiPath public export', () => {
  it('builds static routes with the existing API prefix', () => {
    expect(apiPath('GET /api/config')).toBe('/api/config');
    expect(apiPath('POST /api/bundles/dry-run')).toBe('/api/bundles/dry-run');
  });

  it('encodes each parameter exactly as encodeURIComponent does', () => {
    for (const name of ['My Collection', 'common.buttons', 'a/b', 'a%2Fb', 'é?#&+', "!~*'()", '']) {
      expect(apiPath('PUT /api/bundles/:name', { name })).toBe(`/api/bundles/${encodeURIComponent(name)}`);
    }
    expect(apiPath('PUT /api/bundles/:name', { name: 'common.buttons/a b' })).toBe(
      '/api/bundles/common.buttons%2Fa%20b',
    );
  });

  it('substitutes every parameter independently', () => {
    expect(
      apiPath('DELETE /api/collections/:collectionName/locales/:locale', {
        collectionName: 'My/Collection',
        locale: 'fr CA',
      }),
    ).toBe('/api/collections/My%2FCollection/locales/fr%20CA');
    expect(
      apiPath('GET /api/collections/:collectionName/resources/translate-locale/:jobId', {
        collectionName: 'common.buttons',
        jobId: 'job/#1',
      }),
    ).toBe('/api/collections/common.buttons/resources/translate-locale/job%2F%231');
  });

  it('builds every manifest route without leaving parameter placeholders', () => {
    for (const route of API_ROUTES) {
      // The dynamic loop deliberately bypasses compile-time literal checks to
      // verify runtime substitution against the entire manifest.
      const build = apiPath as (key: string, params: Record<string, string>) => string;
      const params = Object.fromEntries(
        route.path
          .split('/')
          .filter((part) => part.startsWith(':'))
          .map((part) => [part.slice(1), 'value / é']),
      );
      const path = build(`${route.method} ${route.path}`, params);
      expect(path).not.toContain(':');
      expect(matchApiRoute(route.method, path)).toEqual(route);
    }
  });

  it('rejects malformed Unicode as encodeURIComponent does', () => {
    expect(() => apiPath('PUT /api/bundles/:name', { name: '\uD800' })).toThrow(URIError);
  });
});

// Compiled by typecheck-spec, never executed: these calls pin the public type contract.
function invalidCalls(): void {
  // @ts-expect-error Unlisted route.
  apiPath('GET /api/unknown');
  // @ts-expect-error Unlisted method/path pair.
  apiPath('POST /api/config');
  // @ts-expect-error Required parameter object.
  apiPath('PUT /api/bundles/:name');
  // @ts-expect-error Missing a parameter in a multi-parameter route.
  apiPath('DELETE /api/collections/:collectionName/locales/:locale', { collectionName: 'main' });
  // @ts-expect-error Extra parameter.
  apiPath('PUT /api/bundles/:name', { name: 'main', extra: 'value' });
  const extra = { name: 'main', extra: 'value' };
  // @ts-expect-error Extra parameters are rejected on variables too.
  apiPath('PUT /api/bundles/:name', extra);
  // @ts-expect-error Parameter values must be strings.
  apiPath('PUT /api/bundles/:name', { name: 123 });
  // @ts-expect-error Static routes do not take parameters.
  apiPath('GET /api/config', { extra: 'value' });
}
void invalidCalls;
