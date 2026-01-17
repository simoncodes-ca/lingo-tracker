import { inject } from '@angular/core';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of } from 'rxjs';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { TranslationApiService } from '../services/translation-api.service';

interface TranslationBrowserState {
  translations: ResourceSummaryDto[];
  currentFolderPath: string;
  isLoading: boolean;
  error: string | null;
}

const initialState: TranslationBrowserState = {
  translations: [],
  currentFolderPath: '',
  isLoading: false,
  error: null,
};

export const TranslationBrowserStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(() => ({})),
  withMethods((store) => {
    const api = inject(TranslationApiService);

    return {
      loadTranslations: rxMethod<{ collectionName: string; folderPath?: string }>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(({ collectionName, folderPath }) =>
            api.getResourceTree(collectionName, folderPath).pipe(
              tap((tree) => {
                patchState(store, {
                  translations: tree.resources,
                  currentFolderPath: tree.path,
                  isLoading: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to load translations';
                patchState(store, {
                  isLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            )
          )
        )
      ),
    };
  })
);
