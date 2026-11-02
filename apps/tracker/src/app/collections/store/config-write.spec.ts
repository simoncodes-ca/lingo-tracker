import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { BundleDefinitionDto, LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import type { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { ApiError, provideTrackerHttpClient, toApiError } from '../../shared/api-error/api-error';
import { CollectionsStore } from './collections.store';
import { classifyConfigRefusal } from './config-write';

const CONFIG_URL = '/api/config';

const bundle: BundleDefinitionDto = { bundleName: '{locale}', dist: './dist/i18n', collections: 'All' };

const config: LingoTrackerConfigDto = {
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: { app: { translationsFolder: 'i18n' } },
  bundles: { main: bundle },
  protectedTerms: ['iPhone'],
};

interface ExpectedRequest {
  method: string;
  url: string;
  body: unknown;
}

/**
 * Every Config Write of the store: the call, and the request it must send. The outcome
 * rules are the same for all seven, so they are tested once each, per write.
 */
const writes: readonly [
  string,
  (store: InstanceType<typeof CollectionsStore>) => Observable<unknown>,
  ExpectedRequest,
][] = [
  [
    'createCollection',
    (store) => store.createCollection({ name: 'app', collection: { translationsFolder: 'i18n' } }),
    { method: 'POST', url: '/api/collections', body: { name: 'app', collection: { translationsFolder: 'i18n' } } },
  ],
  [
    'updateCollection',
    (store) => store.updateCollection('my app', { name: 'app', collection: { translationsFolder: 'i18n' } }),
    {
      method: 'PUT',
      url: '/api/collections/my%20app',
      body: { name: 'app', collection: { translationsFolder: 'i18n' } },
    },
  ],
  [
    'deleteCollection',
    (store) => store.deleteCollection('my app'),
    { method: 'DELETE', url: '/api/collections/my%20app', body: null },
  ],
  [
    'updateGlobalConfig',
    (store) => store.updateGlobalConfig({ protectedTerms: ['iPhone'] }),
    { method: 'PUT', url: CONFIG_URL, body: { protectedTerms: ['iPhone'] } },
  ],
  [
    'createBundle',
    (store) => store.createBundle({ name: 'main', bundle }),
    { method: 'POST', url: '/api/bundles', body: { name: 'main', bundle } },
  ],
  [
    'updateBundle',
    (store) => store.updateBundle('main', { name: 'core', bundle }),
    { method: 'PUT', url: '/api/bundles/main', body: { name: 'core', bundle } },
  ],
  ['deleteBundle', (store) => store.deleteBundle('main'), { method: 'DELETE', url: '/api/bundles/main', body: null }],
];

describe('CollectionsStore config writes', () => {
  let store: InstanceType<typeof CollectionsStore>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [getTranslocoTestingModule()],
      providers: [provideTrackerHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(CollectionsStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    // Bundle runs are mirrored to session storage, which jsdom keeps between tests.
    sessionStorage.clear();
  });

  const reject = (request: ExpectedRequest, status: number, body: object): void => {
    http.expectOne({ method: request.method, url: request.url }).flush(body, { status, statusText: 'Rejected' });
  };

  describe.each(writes)('%s', (_name, write, request) => {
    it('sends nothing until subscribed, then resolves with the reloaded config once the store holds it', () => {
      const observable = write(store);
      http.expectNone({ method: request.method, url: request.url });

      const next = vi.fn();
      observable.subscribe({ next });

      const sent = http.expectOne({ method: request.method, url: request.url });
      expect(sent.request.body).toEqual(request.body);
      sent.flush({ message: 'ok' });
      const reload = http.expectOne({ method: 'GET', url: CONFIG_URL });
      expect(next).not.toHaveBeenCalled();
      expect(store.config()).toBeNull();

      reload.flush(config);

      expect(store.config()).toEqual(config);
      expect(next).toHaveBeenCalledWith(config);
    });

    it('resolves with null when the write succeeded but the reload failed, and reports the load error', () => {
      patchState(unprotected(store), { config });
      const next = vi.fn();
      const error = vi.fn();

      write(store).subscribe({ next, error });
      http.expectOne({ method: request.method, url: request.url }).flush({ message: 'ok' });
      http
        .expectOne({ method: 'GET', url: CONFIG_URL })
        .flush({ statusCode: 500, error: 'Internal Server Error' }, { status: 500, statusText: 'Server Error' });

      expect(error).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(null);
      expect(store.error()).toBe(TRACKER_TOKENS.COLLECTIONS.TOAST.LOADFAILED);
      expect(store.config()).toEqual(config);
    });

    it('errors with the ApiError of a rejected write and leaves the store as it was', () => {
      const error = vi.fn();

      write(store).subscribe({ error });
      reject(request, 409, { statusCode: 409, message: 'Already exists', error: 'Conflict' });

      http.expectNone({ method: 'GET', url: CONFIG_URL });
      const thrown: unknown = error.mock.calls[0]?.[0];
      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown).toMatchObject({ kind: 'conflict', status: 409, serverMessage: 'Already exists' });
      expect(store.config()).toBeNull();
      expect(store.error()).toBeNull();
    });
  });

  it('carries the details of an invalid answer, so the settings page can map rule errors onto rows', () => {
    const error = vi.fn();
    const errors = [{ index: 1, field: 'preferred', code: 'self-mapping', message: 'same as discouraged' }];

    store.updateGlobalConfig({ preferredTerminology: [] }).subscribe({ error });
    reject(writes[3][2], 400, { statusCode: 400, message: 'Invalid preferred terminology rules', errors });

    expect(error.mock.calls[0]?.[0]).toMatchObject({ kind: 'invalid', details: errors });
  });

  it('clears a previous load failure once a write has reloaded the config', () => {
    store.loadCollections();
    http.expectOne({ method: 'GET', url: CONFIG_URL }).flush(null, { status: 0, statusText: 'Network' });
    expect(store.error()).toBe(TRACKER_TOKENS.COLLECTIONS.TOAST.LOADFAILED);

    store.deleteCollection('app').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/collections/app' }).flush({ message: 'ok' });
    http.expectOne({ method: 'GET', url: CONFIG_URL }).flush(config);

    expect(store.error()).toBeNull();
    expect(store.config()).toEqual(config);
  });

  describe('deleteBundle', () => {
    beforeEach(() => {
      patchState(unprotected(store), { bundleRuns: { main: { status: 'completed' } } });
    });

    it('drops the run state only once the server has confirmed the delete', () => {
      store.deleteBundle('main').subscribe();
      expect(store.bundleRuns()['main']).toBeDefined();

      http.expectOne({ method: 'DELETE', url: '/api/bundles/main' }).flush({ message: 'ok' });
      http.expectOne({ method: 'GET', url: CONFIG_URL }).flush({ ...config, bundles: {} });

      expect(store.bundleRuns()['main']).toBeUndefined();
      expect(store.bundleEntries()).toEqual([]);
    });

    it('keeps the run state when the delete is refused', () => {
      store.deleteBundle('main').subscribe({ error: () => undefined });
      reject(writes[6][2], 404, { statusCode: 404, message: 'Bundle "main" not found', error: 'Not Found' });

      expect(store.bundleRuns()['main']?.status).toBe('completed');
    });
  });
});

describe('classifyConfigRefusal', () => {
  it('classifies invalid details and all other failures', () => {
    const invalid = toApiError(new HttpErrorResponse({ status: 400, error: { errors: ['bad rule'] } }));
    expect(classifyConfigRefusal(invalid)).toEqual({ kind: 'invalid', details: ['bad rule'], error: invalid });
    const other = new Error('offline');
    expect(classifyConfigRefusal(other)).toEqual({ kind: 'other', details: [], error: other });
    const conflict = toApiError(new HttpErrorResponse({ status: 409, error: { errors: ['server detail'] } }));
    expect(classifyConfigRefusal(conflict)).toEqual({ kind: 'conflict', details: ['server detail'], error: conflict });
  });
});
