import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { inject } from '@angular/core';
import { CollectionWithName } from '../common/types/collection-with-name';
import { ApiService } from '../services/api';
import { LingoTrackerConfigDto, LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';
import { kebabCase } from 'lodash';

export interface ApplicationState {
  hasLoadedCollections: boolean;
  collections: CollectionWithName[];
  loading: boolean;
  error: string | undefined;
}

export const applicationStore = signalStore(
  { providedIn: 'root' },
  withState<ApplicationState>({
    hasLoadedCollections: false,
    collections: [],
    loading: false,
    error: undefined,
  }),
  withMethods((store) => {
    const apiService = inject(ApiService);
    
    return {
      async loadCollections() {
        patchState(store, { loading: true, error: undefined });
        
        // Ensure minimum 150ms loading time
        const startTime = Date.now();
        
        try {
          const config = await new Promise<LingoTrackerConfigDto>((resolve, reject) => {
            apiService.getConfig().subscribe({
              next: resolve,
              error: reject
            });
          });
          
          const collectionsDict = config.collections || {};
          const collections: CollectionWithName[] = Object.entries(collectionsDict).map(([name, collection]: [string, LingoTrackerCollectionDto]) => ({
            name,
            encodedName: encodeURIComponent(kebabCase(name)),
            translationsFolder: collection.translationsFolder,
            exportFolder: collection.exportFolder ?? config.exportFolder,
            importFolder: collection.importFolder ?? config.importFolder,
            baseLocale: collection.baseLocale ?? config.baseLocale,
            locales: collection.locales ?? config.locales
          }));
          
          const elapsedTime = Date.now() - startTime;
          const remainingTime = Math.max(0, 1500 - elapsedTime);
          
          if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingTime));
          }
          
          patchState(store, { 
            collections, 
            hasLoadedCollections: true, 
            loading: false,
            error: undefined,
          });
        } catch (err) {
          const elapsedTime = Date.now() - startTime;
          const remainingTime = Math.max(0, 150 - elapsedTime);
          
          if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingTime));
          }
          
          patchState(store, { 
            loading: false, 
            error: 'Server Error',
            hasLoadedCollections: false
          });
          console.error('Error loading collections:', err);
        }
      }
    };
  })
);