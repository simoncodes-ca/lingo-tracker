import { HttpErrorResponse } from '@angular/common/http';
import { createServiceFactory, type SpectatorService } from '@ngneat/spectator/vitest';
import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { toApiError } from '../../shared/api-error/api-error';
import { CollectionsApiService } from '../services/collections-api.service';
import { CollectionsStore } from './collections.store';

// The writes are covered in config-write.spec.ts; this file covers the load.
describe('CollectionsStore', () => {
  let store: InstanceType<typeof CollectionsStore>;
  let spectator: SpectatorService<InstanceType<typeof CollectionsStore>>;

  const api = {
    getConfig: vi.fn(),
  };

  const config: LingoTrackerConfigDto = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en'],
    collections: {},
    protectedTerms: ['iPhone', 'C++'],
  };

  const createStore = createServiceFactory({
    service: CollectionsStore,
    imports: [getTranslocoTestingModule()],
    providers: [{ provide: CollectionsApiService, useValue: api }],
  });

  beforeEach(() => {
    vi.resetAllMocks();
    spectator = createStore();
    store = spectator.service;
  });

  it('loadCollections stores the config and clears the error', () => {
    api.getConfig.mockReturnValue(of(config));

    store.loadCollections();

    expect(store.config()).toEqual(config);
    expect(store.isLoading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('loadCollections shows the server message of a failed config read', () => {
    api.getConfig.mockReturnValue(
      throwError(() =>
        toApiError(
          new HttpErrorResponse({ status: 502, error: { statusCode: 502, message: 'Config file is not valid JSON' } }),
        ),
      ),
    );

    store.loadCollections();

    expect(store.error()).toBe('Config file is not valid JSON');
    expect(store.isLoading()).toBe(false);
  });

  it('loadCollections falls back to the load-failed message for the generic 500, whose body carries no message', () => {
    api.getConfig.mockReturnValue(
      throwError(() =>
        toApiError(new HttpErrorResponse({ status: 500, error: { statusCode: 500, error: 'Internal Server Error' } })),
      ),
    );

    store.loadCollections();

    expect(store.error()).toBe(TRACKER_TOKENS.COLLECTIONS.TOAST.LOADFAILED);
  });

  it('loadCollections falls back to the load-failed message for a network failure', () => {
    api.getConfig.mockReturnValue(
      throwError(() => toApiError(new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }))),
    );

    store.loadCollections();

    expect(store.error()).toBe(TRACKER_TOKENS.COLLECTIONS.TOAST.LOADFAILED);
  });
});
