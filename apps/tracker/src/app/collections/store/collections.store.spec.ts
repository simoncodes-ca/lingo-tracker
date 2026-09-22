import { HttpErrorResponse } from '@angular/common/http';
import { createServiceFactory, type SpectatorService } from '@ngneat/spectator/vitest';
import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { CollectionsApiService } from '../services/collections-api.service';
import { CollectionsStore } from './collections.store';

describe('CollectionsStore', () => {
  let store: InstanceType<typeof CollectionsStore>;
  let spectator: SpectatorService<CollectionsStore>;

  const api = {
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
  };

  const configAfterSave: LingoTrackerConfigDto = {
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

  it('updateGlobalConfig calls the API with the DTO and refetches config', () => {
    api.updateConfig.mockReturnValue(of({ message: 'ok' }));
    api.getConfig.mockReturnValue(of(configAfterSave));

    store.updateGlobalConfig({ protectedTerms: ['iPhone', 'C++'] });

    expect(api.updateConfig).toHaveBeenCalledWith({ protectedTerms: ['iPhone', 'C++'] });
    expect(api.getConfig).toHaveBeenCalled();
    expect(store.config()).toEqual(configAfterSave);
    expect(store.error()).toBeNull();
  });

  it('updateGlobalConfig sets error state on failure without losing the previous config', () => {
    api.updateConfig.mockReturnValue(throwError(() => new Error('save failed')));

    store.updateGlobalConfig({ protectedTerms: ['iPhone'] });

    expect(store.error()).toBe('save failed');
    expect(store.config()).toBeNull();
  });

  it('updateGlobalConfig exposes per-row preferred terminology errors from a 400 body', () => {
    const errors = [{ index: 1, field: 'discouraged', code: 'duplicate', message: 'dup' }];
    api.updateConfig.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'Invalid preferred terminology rules', errors },
          }),
      ),
    );

    store.updateGlobalConfig({ preferredTerminology: [] });

    expect(store.configRuleErrors()).toEqual(errors);
    expect(store.error()).toBeTruthy();
  });

  it('updateGlobalConfig clears rule errors when a new save starts', () => {
    api.updateConfig.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'x', errors: [{ index: 0 }] } })),
    );
    store.updateGlobalConfig({ preferredTerminology: [] });
    api.updateConfig.mockReturnValue(of({ message: 'ok' }));
    api.getConfig.mockReturnValue(of(configAfterSave));

    store.updateGlobalConfig({ preferredTerminology: [] });

    expect(store.configRuleErrors()).toEqual([]);
  });

  it('updateGlobalConfig leaves rule errors empty for failures without an errors array', () => {
    api.updateConfig.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'protectedTerms must be…' } })),
    );

    store.updateGlobalConfig({ protectedTerms: ['x'] });

    expect(store.configRuleErrors()).toEqual([]);
  });
});
