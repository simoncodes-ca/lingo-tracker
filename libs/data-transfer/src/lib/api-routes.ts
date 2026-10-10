export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRoute {
  readonly method: ApiMethod;
  readonly path: string;
}

/** The controller HTTP surface under Nest's global /api prefix. */
export const API_ROUTES = [
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/config' },
  { method: 'PUT', path: '/api/config' },
  { method: 'POST', path: '/api/collections' },
  { method: 'PUT', path: '/api/collections/:collectionName' },
  { method: 'DELETE', path: '/api/collections/:collectionName' },
  { method: 'POST', path: '/api/collections/:collectionName/locales' },
  { method: 'DELETE', path: '/api/collections/:collectionName/locales/:locale' },
  { method: 'POST', path: '/api/collections/:collectionName/folders' },
  { method: 'DELETE', path: '/api/collections/:collectionName/folders' },
  { method: 'POST', path: '/api/collections/:collectionName/folders/move' },
  { method: 'POST', path: '/api/collections/:collectionName/resources' },
  { method: 'PATCH', path: '/api/collections/:collectionName/resources' },
  { method: 'DELETE', path: '/api/collections/:collectionName/resources' },
  { method: 'GET', path: '/api/collections/:collectionName/resources/tree' },
  { method: 'GET', path: '/api/collections/:collectionName/resources/cache/status' },
  { method: 'GET', path: '/api/collections/:collectionName/resources/search' },
  { method: 'POST', path: '/api/collections/:collectionName/resources/move' },
  { method: 'POST', path: '/api/collections/:collectionName/resources/translate' },
  { method: 'POST', path: '/api/collections/:collectionName/resources/translate-locale' },
  { method: 'GET', path: '/api/collections/:collectionName/resources/translate-locale/:jobId' },
  { method: 'POST', path: '/api/bundles' },
  { method: 'PUT', path: '/api/bundles/:name' },
  { method: 'DELETE', path: '/api/bundles/:name' },
  { method: 'POST', path: '/api/bundles/dry-run' },
  { method: 'POST', path: '/api/bundles/:name/generate' },
  { method: 'GET', path: '/api/bundles/jobs/:jobId' },
] as const satisfies readonly ApiRoute[];

/**
 * Ignores query strings and trailing slashes, but preserves empty interior segments.
 * Encoded segments remain encoded. At the first differing segment, static wins
 * over a parameter, independently of manifest order. Optional routes allow isolated
 * matching tests; callers normally use the shared manifest.
 */
export function matchApiRoute(
  method: string,
  url: string,
  routes: readonly ApiRoute[] = API_ROUTES,
): ApiRoute | undefined {
  const segments = (url.split('?')[0] ?? '').replace(/\/+$/, '').split('/');
  let best: ApiRoute | undefined;
  let bestSpecificity = '';
  for (const route of routes) {
    if (route.method !== method) continue;
    const pattern = route.path.split('/');
    if (pattern.length !== segments.length) continue;
    if (!pattern.every((part, index) => (part.startsWith(':') ? Boolean(segments[index]) : part === segments[index]))) {
      continue;
    }
    const specificity = pattern.map((part) => (part.startsWith(':') ? '0' : '1')).join('');
    if (best === undefined || specificity > bestSpecificity) {
      best = route;
      bestSpecificity = specificity;
    }
  }
  return best;
}
