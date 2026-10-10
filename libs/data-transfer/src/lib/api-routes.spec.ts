import { describe, expect, it } from 'vitest';
import { API_ROUTES, type ApiRoute, matchApiRoute } from '../index';

describe('matchApiRoute public export', () => {
  it('matches static routes from the shared manifest', () => {
    const route = matchApiRoute('GET', '/api/health');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/api/health');
    expect(API_ROUTES).toContain(route);
  });

  it('prefers static segments over params in either declaration order', () => {
    const param: ApiRoute = { method: 'GET', path: '/api/resources/:id' };
    const tree: ApiRoute = { method: 'GET', path: '/api/resources/tree' };
    for (const routes of [
      [param, tree],
      [tree, param],
    ]) {
      expect(matchApiRoute('GET', '/api/resources/tree', routes)).toBe(tree);
      expect(matchApiRoute('GET', '/api/resources/entry', routes)).toBe(param);
    }
  });

  it('prefers the first static difference over later static segments', () => {
    const routes: readonly ApiRoute[] = [
      { method: 'GET', path: '/api/:group/tree' },
      { method: 'GET', path: '/api/resources/:id' },
    ];
    expect(matchApiRoute('GET', '/api/resources/tree', routes)).toBe(routes[1]);
  });

  it('matches encoded spaces and slashes as one non-empty param segment', () => {
    for (const name of ['My%20Collection', 'My%2FCollection']) {
      expect(matchApiRoute('GET', `/api/collections/${name}/resources/tree`)?.path).toBe(
        '/api/collections/:collectionName/resources/tree',
      );
    }
    expect(matchApiRoute('GET', '/api/collections//resources/tree')).toBeUndefined();
    expect(matchApiRoute('GET', '/api/collections/My/Collection/resources/tree')).toBeUndefined();
  });

  it('strips query strings without interpreting their slash characters', () => {
    expect(
      matchApiRoute('GET', '/api/collections/My%20Collection/resources/search?query=a/b&maxResults=10')?.path,
    ).toBe('/api/collections/:collectionName/resources/search');
  });

  it('rejects method mismatches and unknown paths', () => {
    expect(matchApiRoute('POST', '/api/health')).toBeUndefined();
    expect(matchApiRoute('get', '/api/health')).toBeUndefined();
    expect(matchApiRoute('GET', '/api/unknown')).toBeUndefined();
    expect(matchApiRoute('GET', '/api/health/extra')).toBeUndefined();
  });

  it('ignores trailing slashes while rejecting empty interior params', () => {
    expect(matchApiRoute('GET', '/api/health///?check=true')?.path).toBe('/api/health');
    expect(matchApiRoute('PUT', '/api/collections/My%20Collection/')?.path).toBe('/api/collections/:collectionName');
    expect(matchApiRoute('PUT', '/api/collections/')).toBeUndefined();
  });
});
