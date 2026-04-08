import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { NotificationService } from '../../shared/notification';
import { BrowserApiService } from '../services/browser-api.service';
import { splitResolvedKey } from '../utils/folder-path.utils';
import { toErrorMessage } from './async-error.utils';
import { resolveCompactLocale } from './density-mode.utils';
import { withSearchFeature } from './features/with-search.feature';
import { withCacheStatusFeature } from './features/with-cache-status.feature';
import { withFilterFeature } from './features/with-filter.feature';
import { withViewPreferencesFeature } from './features/with-view-preferences.feature';
import { withTranslationsFeature } from './features/with-translations.feature';
import { withFolderTreeFeature } from './features/with-folder-tree.feature';
import type { TranslationStatus } from '@simoncodes-ca/data-transfer';
import type { DensityMode } from '../types/density-mode';

/**
 * Root state for signals shared across multiple features.
 * Cross-cutting state lives here to avoid circular type dependencies between features:
 * - currentFolderPath: read by withTranslationsFeature (selectFolder) and written by withFolderTreeFeature
 * - densityMode and related: read by withFilterFeature (compact-mode locale tracking) and written by withViewPreferencesFeature
 */
interface RootState {
  selectedCollection: string | null;
  availableLocales: string[];
  baseLocale: string;
  isDisabled: boolean;
  error: string | null;
  currentFolderPath: string;
  densityMode: DensityMode;
  compactLocale: string | null;
  compactLocaleManuallyChanged: boolean;
  nonCompactSelectedLocales: string[];
}

const initialRootState: RootState = {
  selectedCollection: null,
  availableLocales: [],
  baseLocale: '',
  isDisabled: false,
  error: null,
  currentFolderPath: '',
  densityMode: 'compact',
  compactLocale: null,
  compactLocaleManuallyChanged: false,
  nonCompactSelectedLocales: [],
};

export const BrowserStore = signalStore(
  { providedIn: 'root' },
  withState(initialRootState),
  withSearchFeature(),
  withFilterFeature(),
  withTranslationsFeature(),
  withFolderTreeFeature(),
  withCacheStatusFeature(),
  withViewPreferencesFeature(),
  withMethods((store) => {
    const api = inject(BrowserApiService);
    const notifications = inject(NotificationService);
    const transloco = inject(TranslocoService);

    return {
      setBaseLocale(locale: string): void {
        patchState(store, { baseLocale: locale });
      },

      setDisabled(disabled: boolean): void {
        patchState(store, { isDisabled: disabled });
      },

      clearError(): void {
        patchState(store, { error: null });
      },

      reset(): void {
        patchState(store, {
          ...initialRootState,
          // Feature state resets
          searchQuery: '',
          isSearchMode: false,
          searchResults: [],
          isSearchLoading: false,
          searchError: null,
          selectedLocales: [],
          selectedStatuses: [],
          sortField: 'key' as const,
          sortDirection: 'asc' as const,
          nonCompactSelectedLocales: [],
          translations: [],
          isTranslationsLoading: false,
          showNestedResources: true,
          rootFolders: [],
          expandedFolders: new Set<string>(),
          folderTreeFilter: '',
          isFolderTreeLoading: false,
          isAddingFolder: false,
          addFolderParentPath: null,
          newlyCreatedFolderPath: null,
          isDeletingFolder: false,
          deletingFolderPath: null,
          cacheStatus: null,
          cacheError: null,
          collectionStats: null,
        });
      },

      /**
       * Switches the active collection, restoring any previously saved view preferences.
       * Resets transient state (search, folders, cache) before triggering cache status polling.
       */
      setSelectedCollection(params: { collectionName: string; locales: string[]; baseLocale?: string }): void {
        const loaded = store.loadViewPreferences(params.collectionName);
        const baseLocale = params.baseLocale || '';

        patchState(store, {
          selectedCollection: params.collectionName,
          availableLocales: params.locales,
          selectedLocales: loaded?.selectedLocales || [],
          baseLocale,
          cacheStatus: null,
          cacheError: null,
          collectionStats: null,
          currentFolderPath: '',
          expandedFolders: new Set<string>(),
          showNestedResources: loaded?.showNestedResources ?? true,
          compactLocale: loaded?.compactLocale ?? null,
          compactLocaleManuallyChanged: loaded?.compactLocaleManuallyChanged ?? false,
          nonCompactSelectedLocales: [],
          sortField: loaded?.sortField ?? 'key',
          sortDirection: loaded?.sortDirection ?? 'asc',
          selectedStatuses: loaded?.selectedStatuses ?? ([] as TranslationStatus[]),
          rootFolders: [],
          folderTreeFilter: '',
          translations: [],
          error: null,
        });

        if (loaded?.densityMode) {
          const mode: DensityMode = (loaded.densityMode as string) === 'medium' ? 'compact' : loaded.densityMode;
          if (mode === 'compact') {
            const savedCompactLocale = loaded?.compactLocale ?? null;
            const savedSelectedLocales = loaded?.selectedLocales ?? [];
            const newSelected = resolveCompactLocale({
              savedCompactLocale,
              currentSelectedLocales: savedSelectedLocales,
              availableLocales: params.locales,
              baseLocale,
            });
            patchState(store, { densityMode: mode, selectedLocales: newSelected });
          } else {
            patchState(store, { densityMode: mode });
          }
        }

        store.checkCacheStatus();
      },

      moveResource: rxMethod<{ sourceKey: string; destinationFolderPath: string }>(
        pipe(
          tap(() => patchState(store, { isDisabled: true, error: null })),
          switchMap(({ sourceKey, destinationFolderPath }) => {
            const collection = store.selectedCollection();
            if (!collection) {
              patchState(store, { isDisabled: false });
              return of(null);
            }

            const sourceFolderPath = splitResolvedKey(sourceKey).folderPath.join('.');

            if (sourceFolderPath === destinationFolderPath) {
              notifications.info(transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.RESOURCEALREADYINFOLDER));
              patchState(store, { isDisabled: false });
              return of(null);
            }

            const entryName = splitResolvedKey(sourceKey).entryKey;
            const destinationKey = destinationFolderPath ? `${destinationFolderPath}.${entryName}` : entryName;

            const currentTranslations = store.translations();
            const optimisticTranslations = currentTranslations.filter((r) => r.key !== sourceKey);
            patchState(store, { translations: optimisticTranslations });

            return api.moveResource(collection, sourceKey, destinationKey).pipe(
              tap(() => {
                notifications.success(
                  transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.RESOURCEMOVEDX, {
                    name: entryName,
                    folder: destinationFolderPath || 'root',
                  }),
                );
                patchState(store, { isDisabled: false });

                store.loadRootFolders();
                store.selectFolder(store.currentFolderPath());
              }),
              catchError((error: unknown) => {
                const errorMessage = toErrorMessage(
                  error,
                  transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.MOVERESOURCEFAILED),
                );
                patchState(store, {
                  translations: currentTranslations,
                  isDisabled: false,
                  error: errorMessage,
                });
                notifications.error(errorMessage);
                return of(null);
              }),
            );
          }),
        ),
      ),
    };
  }),
);
