import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollectionsStore } from './collections.store';
import { CollectionsApiService } from '../services/collections-api.service';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';

describe('CollectionsStore', () => {
  let store: InstanceType<typeof CollectionsStore>;

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

  beforeEach(async () => {
    vi.resetAllMocks();
    await TestBed.configureTestingModule({
      imports: [getTranslocoTestingModule()],
      providers: [CollectionsStore, { provide: CollectionsApiService, useValue: api }],
    }).compileComponents();

    store = TestBed.inject(CollectionsStore);
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
});
