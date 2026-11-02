import { createServiceFactory } from '@ngneat/spectator/vitest';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { describe, expect, it } from 'vitest';
import { LOCAL_STORAGE } from '../../../shared/storage/browser-storage';
import { MemoryStorageAdapter } from '../../../shared/storage/keyed-storage';
import { withCollectionLifecycle } from '../collection-reset';
import { type PreferenceState, snapshot } from '../view-preferences';
import { withViewPreferencesFeature } from './with-view-preferences.feature';

const preferences: PreferenceState = {
  densityMode: 'full',
  selectedLocales: ['fr'],
  showNestedResources: true,
  compactLocale: 'fr',
  compactLocaleManuallyChanged: true,
  nonCompactSelectedLocales: [],
  sortField: 'status',
  sortDirection: 'desc',
  selectedStatuses: ['stale'],
};
const PreferenceStore = signalStore(
  withCollectionLifecycle(),
  withState({ ...preferences, availableLocales: ['en', 'fr'], baseLocale: 'en', selectedCollection: 'first' }),
  withViewPreferencesFeature(),
  withMethods((store) => ({
    selectCollection(name: string): void {
      patchState(store, { selectedCollection: name });
    },
  })),
);

describe('view preference persistence', () => {
  const adapter = new MemoryStorageAdapter();
  const createStore = createServiceFactory({
    service: PreferenceStore,
    providers: [{ provide: LOCAL_STORAGE, useValue: () => adapter }],
  });

  it('writes snapshots through the injected storage seam and keeps collections separate', () => {
    const spectator = createStore();
    const store = spectator.service;
    spectator.flushEffects();
    expect(JSON.parse(adapter.getItem('lingo-tracker:view-prefs:first') ?? 'null')).toEqual(snapshot(preferences));
    store.setDensityMode('compact');
    spectator.flushEffects();
    expect(JSON.parse(adapter.getItem('lingo-tracker:view-prefs:first') ?? 'null').densityMode).toBe('compact');
    store.selectCollection('second');
    store.setDensityMode('full');
    spectator.flushEffects();
    expect(JSON.parse(adapter.getItem('lingo-tracker:view-prefs:second') ?? 'null').densityMode).toBe('full');
    expect(JSON.parse(adapter.getItem('lingo-tracker:view-prefs:first') ?? 'null').densityMode).toBe('compact');
    store.restoreViewPreferences('first');
    expect(store.densityMode()).toBe('compact');
  });
});
