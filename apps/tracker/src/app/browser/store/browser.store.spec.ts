import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createServiceFactory, type SpectatorService } from '@ngneat/spectator/vitest';
import { getState, patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type {
  CacheStatusDto,
  ResourceSummaryDto,
  ResourceTreeDto,
  SearchResultsDto,
  TranslationStatus,
} from '@simoncodes-ca/data-transfer';
import { isNeedsWorkStatus } from '@simoncodes-ca/domain';
import { NEVER, type Observable, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { collectionSettings } from '../../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { provideTrackerHttpClient, toApiError } from '../../shared/api-error/api-error';
import { NotificationService } from '../../shared/notification';
import { BrowserApiService } from '../services/browser-api.service';
import { CollectionIndexNotReadyError } from '../services/index-readiness';
import { BrowserStore } from './browser.store';

/**
 * Helper to wait for async signal updates from rxMethod.
 * RxJS observables in rxMethod complete asynchronously, so we need
 * to wait for multiple microtasks to allow signals to update.
 * We use a small delay to ensure all async operations complete.
 */
const waitForSignals = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

/** A failed API response as the HTTP seam hands it to the store. */
const serverError = (status: number, message: string) =>
  toApiError(new HttpErrorResponse({ status, error: { statusCode: status, message } }));

const summary = (
  fullKey: string,
  baseValue: string,
  targets: Record<string, [string | undefined, TranslationStatus | undefined]> = {},
): ResourceSummaryDto => {
  const segments = fullKey.split('.');
  const entryKey = segments.pop() ?? '';
  return {
    fullKey,
    folderPath: segments.join('.'),
    entryKey,
    base: { locale: 'en', value: baseValue },
    targets: Object.entries(targets).map(([locale, [value, status]]) => ({
      locale,
      value,
      status,
      needsWork: status === undefined || isNeedsWorkStatus(status),
      sameAsBase: (value?.trim() ?? '').length > 0 && value?.trim() === baseValue.trim(),
    })),
    tags: [],
    inheritedTags: [],
  };
};

describe('BrowserStore', () => {
  let store: InstanceType<typeof BrowserStore>;
  let spectator: SpectatorService<InstanceType<typeof BrowserStore>>;
  let apiService: BrowserApiService;

  const mockTreeRoot: ResourceTreeDto = {
    path: '',
    resources: [summary('welcome', 'Welcome', { es: ['Bienvenido', 'translated'] })],
    children: [
      { name: 'common', fullPath: 'common', loaded: false },
      { name: 'errors', fullPath: 'errors', loaded: false },
    ],
  };

  const mockTreeCommon: ResourceTreeDto = {
    path: 'common',
    resources: [summary('common.save', 'Save', { es: ['Guardar', 'translated'] })],
    children: [{ name: 'buttons', fullPath: 'common.buttons', loaded: false }],
  };

  const mockTreeWithNesting: ResourceTreeDto = {
    path: '',
    resources: [],
    children: [
      {
        name: 'common',
        fullPath: 'common',
        loaded: true,
        tree: {
          path: 'common',
          resources: [],
          children: [{ name: 'buttons', fullPath: 'common.buttons', loaded: true }],
        },
      },
      {
        name: 'errors',
        fullPath: 'errors',
        loaded: true,
        tree: {
          path: 'errors',
          resources: [],
          children: [{ name: 'http', fullPath: 'errors.http', loaded: true }],
        },
      },
    ],
  };

  /**
   * Answers each tree read by its path: the root with `mockTreeRoot` (a collection opens with two
   * reads of it, the folder tree's and the list's), any other path from `trees`.
   */
  const treeAt =
    (trees: Record<string, Observable<ResourceTreeDto>>) =>
    (_collection: string, path = ''): Observable<ResourceTreeDto> =>
      trees[path] ?? (path === '' ? of(mockTreeRoot) : NEVER);

  const mockCacheReady: CacheStatusDto = {
    status: 'ready',
    stats: {
      totalKeys: 100,
      localeCount: 3,
    },
  };

  const createStore = createServiceFactory({
    service: BrowserStore,
    imports: [getTranslocoTestingModule()],
    providers: [provideTrackerHttpClient(), provideHttpClientTesting(), BrowserApiService],
  });

  beforeEach(() => {
    spectator = createStore();
    store = spectator.service;
    apiService = spectator.inject(BrowserApiService);
  });

  describe('folder writes', () => {
    const createdFolder = {
      folderPath: 'common.new',
      created: true,
      folder: { name: 'new', fullPath: 'common.new', loaded: false },
    };

    beforeEach(async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeWithNesting));
      const notifications = spectator.inject(NotificationService);
      vi.spyOn(notifications, 'success').mockImplementation(() => undefined);
      vi.spyOn(notifications, 'error').mockImplementation(() => undefined);
      vi.spyOn(notifications, 'info').mockImplementation(() => undefined);
      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();
    });

    it('refuses every folder write in a read-only collection without HTTP', () => {
      store.openCollection(collectionSettings({ name: 'readonly', locales: [], readOnly: true }));
      const create = vi.spyOn(apiService, 'createFolder');
      const remove = vi.spyOn(apiService, 'deleteFolder');
      const moveFolder = vi.spyOn(apiService, 'moveFolder');
      const moveResource = vi.spyOn(apiService, 'moveResource');
      const outcomes: string[] = [];
      store.createFolder('new', null).subscribe((result) => outcomes.push(result.kind));
      store.deleteFolder('common').subscribe((result) => outcomes.push(result.kind));
      store
        .moveFolder({
          sourceFolderPath: 'common',
          destinationFolderPath: 'errors',
        })
        .subscribe((result) => outcomes.push(result.kind));
      store
        .moveResource({
          sourceKey: 'common.save',
          destinationFolderPath: 'errors',
        })
        .subscribe((result) => outcomes.push(result.kind));
      expect(outcomes).toEqual(['read-only', 'read-only', 'read-only', 'read-only']);
      expect(create).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(moveFolder).not.toHaveBeenCalled();
      expect(moveResource).not.toHaveBeenCalled();
    });

    it('reports folder and resource no-ops without HTTP', () => {
      const folder = vi.spyOn(apiService, 'moveFolder');
      const resource = vi.spyOn(apiService, 'moveResource');
      const kinds: string[] = [];
      store
        .moveFolder({
          sourceFolderPath: 'common.buttons',
          destinationFolderPath: 'common',
        })
        .subscribe((outcome) => {
          if (outcome.kind === 'noop') kinds.push(outcome.reason);
        });
      store
        .moveResource({
          sourceKey: 'common.save',
          destinationFolderPath: 'common',
        })
        .subscribe((outcome) => {
          if (outcome.kind === 'noop') kinds.push(outcome.reason);
        });
      expect(kinds).toEqual(['already-at-location', 'already-in-folder']);
      expect(folder).not.toHaveBeenCalled();
      expect(resource).not.toHaveBeenCalled();
    });

    it('rejects a direct folder move into a descendant before HTTP', () => {
      const move = vi.spyOn(apiService, 'moveFolder');
      let received: string | undefined;

      store.moveFolder({ sourceFolderPath: 'common', destinationFolderPath: 'common.buttons' }).subscribe((outcome) => {
        received = outcome.kind;
      });

      expect(move).not.toHaveBeenCalled();
      expect(received).toBe('invalid-drop');
    });

    it('runs confirmation and move through the requested folder move entry point', async () => {
      const confirm = vi.fn().mockResolvedValue(true);
      const move = vi.spyOn(apiService, 'moveFolder').mockReturnValue(NEVER);
      const { requestFolderMove } = store;

      requestFolderMove({ sourceFolderPath: 'common.buttons', destinationFolderPath: 'errors' }, confirm).subscribe();
      await vi.waitFor(() => expect(move).toHaveBeenCalledWith('app-translations', 'common.buttons', 'errors'));
      expect(confirm).toHaveBeenCalledOnce();
    });

    it('does not cancel the sidebar draft when the picker creates a folder', () => {
      vi.spyOn(apiService, 'createFolder').mockReturnValue(of(createdFolder));
      store.startAddingFolder('errors');

      store.createFolder('new', 'common').subscribe();

      expect(store.isAddingFolder()).toBe(true);
      expect(store.addFolderParentPath()).toBe('errors');
    });

    it('preserves a newer tree load when a folder move fails', async () => {
      const pending = new Subject<{
        movedCount: number;
        foldersDeleted: number;
        warnings: string[];
        errors: string[];
      }>();
      vi.spyOn(apiService, 'moveFolder').mockReturnValue(pending);
      store
        .moveFolder({
          sourceFolderPath: 'common.buttons',
          destinationFolderPath: 'errors',
        })
        .subscribe();
      const refreshed = {
        ...mockTreeWithNesting,
        children: [
          {
            ...mockTreeWithNesting.children[0],
            tree: { path: 'common', resources: [], children: [] },
          },
          ...mockTreeWithNesting.children.slice(1),
          { name: 'fresh', fullPath: 'fresh', loaded: false },
        ],
      };
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(refreshed));
      store.loadRootFolders();
      await waitForSignals();
      pending.error(serverError(409, 'Cannot move'));
      expect(store.rootFolders().map((folder) => folder.fullPath)).toContain('fresh');
      expect(store.rootFolders()[0].tree?.children.map((folder) => folder.fullPath)).toContain('common.buttons');
    });

    it('leaves an unloaded parent untouched when a folder move fails after a tree refresh', async () => {
      const pending = new Subject<{
        movedCount: number;
        foldersDeleted: number;
        warnings: string[];
        errors: string[];
      }>();
      vi.spyOn(apiService, 'moveFolder').mockReturnValue(pending);
      store.moveFolder({ sourceFolderPath: 'common.buttons', destinationFolderPath: 'errors' }).subscribe();
      const refreshed: ResourceTreeDto = {
        path: '',
        resources: [],
        children: [
          { name: 'common', fullPath: 'common', loaded: false },
          { name: 'fresh', fullPath: 'fresh', loaded: false },
        ],
      };
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(refreshed));
      store.loadRootFolders();
      await waitForSignals();

      pending.error(serverError(409, 'Cannot move'));

      expect(store.rootFolders()).toEqual(refreshed.children);
      expect(store.rootFolders()[0].loaded).toBe(false);
      expect(store.rootFolders()[0].tree).toBeUndefined();
      expect(store.movesInFlight()).toBe(0);
      expect(store.isMoving()).toBe(false);
    });

    it('does not apply a successful folder move after its session was replaced', async () => {
      const pending = new Subject<{
        movedCount: number;
        foldersDeleted: number;
        warnings: string[];
        errors: string[];
      }>();
      vi.spyOn(apiService, 'moveFolder').mockReturnValue(pending);
      store.moveFolder({ sourceFolderPath: 'common.buttons', destinationFolderPath: 'errors' }).subscribe();
      store.openCollection(collectionSettings({ name: 'other', locales: [] }));
      await waitForSignals();
      const newTree = store.rootFolders();

      pending.next({ movedCount: 1, foldersDeleted: 1, warnings: [], errors: [] });
      pending.complete();
      await waitForSignals();

      expect(store.rootFolders()).toBe(newTree);
      expect(store.currentFolderPath()).toBe('');
      expect(store.movesInFlight()).toBe(0);
    });

    it('does not roll back a failed folder move into a replacement session', async () => {
      const pending = new Subject<{
        movedCount: number;
        foldersDeleted: number;
        warnings: string[];
        errors: string[];
      }>();
      vi.spyOn(apiService, 'moveFolder').mockReturnValue(pending);
      store.moveFolder({ sourceFolderPath: 'common.buttons', destinationFolderPath: 'errors' }).subscribe();
      store.openCollection(collectionSettings({ name: 'other', locales: [] }));
      await waitForSignals();
      const newTree = store.rootFolders();

      pending.error(serverError(409, 'Old failure'));
      await waitForSignals();

      expect(store.rootFolders()).toBe(newTree);
      expect(store.error()).toBeNull();
      expect(store.movesInFlight()).toBe(0);
    });

    it('does not reload or patch a successful resource move after its session was replaced', async () => {
      const pending = new Subject<{ movedCount: number }>();
      vi.spyOn(apiService, 'moveResource').mockReturnValue(pending);
      patchState(unprotected(store), { translations: [summary('common.save', 'Save')], loadedFolderPath: 'common' });
      store.moveResource({ sourceKey: 'common.save', destinationFolderPath: 'errors' }).subscribe();
      store.openCollection(collectionSettings({ name: 'other', locales: [] }));
      await waitForSignals();
      const newRows = [summary('other.key', 'Other')];
      patchState(unprotected(store), { translations: newRows });

      pending.next({ movedCount: 1 });
      pending.complete();
      await waitForSignals();

      expect(store.translations()).toBe(newRows);
      expect(store.movesInFlight()).toBe(0);
    });

    it('does not roll back a failed resource move into a replacement session', async () => {
      const pending = new Subject<{ movedCount: number }>();
      vi.spyOn(apiService, 'moveResource').mockReturnValue(pending);
      patchState(unprotected(store), { translations: [summary('common.save', 'Save')], loadedFolderPath: 'common' });
      store.moveResource({ sourceKey: 'common.save', destinationFolderPath: 'errors' }).subscribe();
      store.openCollection(collectionSettings({ name: 'other', locales: [] }));
      await waitForSignals();
      const newRows = [summary('other.key', 'Other')];
      patchState(unprotected(store), { translations: newRows });

      pending.error(serverError(409, 'Old failure'));
      await waitForSignals();

      expect(store.translations()).toBe(newRows);
      expect(store.error()).toBeNull();
      expect(store.movesInFlight()).toBe(0);
    });

    it('navigates on delete only when the shown folder is affected', async () => {
      vi.spyOn(apiService, 'deleteFolder').mockReturnValue(
        of({ deleted: true, folderPath: 'errors', resourcesDeleted: 0 }),
      );
      store.showFolder('common');
      await waitForSignals();
      store.deleteFolder('errors').subscribe();
      expect(store.currentFolderPath()).toBe('common');
      store.showFolder('errors.http');
      await waitForSignals();
      store.deleteFolder('errors').subscribe();
      expect(store.currentFolderPath()).toBe('');
    });

    it('creates in the explicit parent only on subscription and inserts the response', () => {
      const create = vi.spyOn(apiService, 'createFolder').mockReturnValue(of(createdFolder));
      const result = store.createFolder('new', 'common');
      expect(create).not.toHaveBeenCalled();

      let received = false;
      result.subscribe(() => {
        received = true;
      });

      expect(create).toHaveBeenCalledWith('app-translations', 'new', 'common');
      expect(received).toBe(true);
      expect(store.rootFolders()[0].tree?.children.map((folder) => folder.fullPath)).toContain('common.new');
      expect(store.newlyCreatedFolderPath()).toBe('common.new');
    });

    it('returns a create failure without changing the tree or store error', () => {
      const failure = serverError(409, 'Already exists');
      vi.spyOn(apiService, 'createFolder').mockReturnValue(throwError(() => failure));
      const original = store.rootFolders();
      let received: unknown;

      store.createFolder('new', 'common').subscribe((outcome) => {
        if (outcome.kind === 'refused') received = outcome.error;
      });

      expect(received).toBe(failure);
      expect(store.rootFolders()).toBe(original);
      expect(store.error()).toBeNull();
    });

    it('does not insert a folder whose response belongs to an old session', () => {
      const pending = new Subject<typeof createdFolder>();
      vi.spyOn(apiService, 'createFolder').mockReturnValue(pending);
      let received = false;
      store.createFolder('new', 'common').subscribe(() => {
        received = true;
      });

      store.openCollection(collectionSettings({ name: 'other', locales: [] }));
      pending.next(createdFolder);

      expect(received).toBe(true);
      expect(
        store
          .rootFolders()
          .flatMap((folder) => folder.tree?.children ?? [])
          .map((folder) => folder.fullPath),
      ).not.toContain('common.new');
      expect(store.newlyCreatedFolderPath()).toBeNull();
    });

    it('does not clear a matching new-session highlight when the old session timer fires', () => {
      vi.useFakeTimers();
      try {
        vi.spyOn(apiService, 'createFolder').mockReturnValue(of(createdFolder));
        store.createFolder('new', 'common').subscribe();
        expect(store.newlyCreatedFolderPath()).toBe('common.new');

        store.openCollection(collectionSettings({ name: 'other', locales: [] }));
        patchState(unprotected(store), { newlyCreatedFolderPath: 'common.new' });
        vi.advanceTimersByTime(3000);

        expect(store.newlyCreatedFolderPath()).toBe('common.new');
      } finally {
        vi.useRealTimers();
      }
    });

    it('silently ignores a folder move that cannot change its location', async () => {
      const move = vi.spyOn(apiService, 'moveFolder');
      const info = vi.spyOn(spectator.inject(NotificationService), 'info');
      const original = store.rootFolders();

      store
        .moveFolder({
          sourceFolderPath: 'common.buttons',
          destinationFolderPath: 'common.buttons',
        })
        .subscribe();
      store
        .moveFolder({
          sourceFolderPath: 'common.buttons',
          destinationFolderPath: 'common',
        })
        .subscribe();
      await waitForSignals();

      expect(move).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
      expect(store.rootFolders()).toBe(original);
    });

    it('deletes a folder directly when asked, without requiring a dialog result', async () => {
      const remove = vi
        .spyOn(apiService, 'deleteFolder')
        .mockReturnValue(of({ deleted: true, folderPath: 'errors', resourcesDeleted: 0 }));
      store.deleteFolder('errors').subscribe();
      await waitForSignals();
      expect(remove).toHaveBeenCalledWith('app-translations', 'errors');
      expect(store.rootFolders().map((folder) => folder.fullPath)).not.toContain('errors');
    });

    it('returns a delete refusal without writing the shared load error', () => {
      const failure = serverError(409, 'Cannot delete');
      vi.spyOn(apiService, 'deleteFolder').mockReturnValue(throwError(() => failure));
      let received: unknown;

      store.deleteFolder('errors').subscribe((outcome) => {
        if (outcome.kind === 'refused') received = outcome.error;
      });

      expect(received).toBe(failure);
      expect(store.error()).toBeNull();
      expect(store.isDeletingFolder()).toBe(false);
      expect(store.deletingFolderPath()).toBeNull();
    });

    it('moves a folder directly and counts the in-flight move without setting the delete flag', async () => {
      const pending = new Subject<{
        movedCount: number;
        foldersDeleted: number;
        warnings: string[];
        errors: string[];
      }>();
      const move = vi.spyOn(apiService, 'moveFolder').mockReturnValue(pending);

      store
        .moveFolder({
          sourceFolderPath: 'common.buttons',
          destinationFolderPath: 'errors',
        })
        .subscribe();
      await waitForSignals();
      expect(move).toHaveBeenCalledWith('app-translations', 'common.buttons', 'errors');
      expect(store.movesInFlight()).toBe(1);
      expect(store.isMoving()).toBe(true);
      expect(store.isDisabled()).toBe(true);
      expect(store.isDeletingFolder()).toBe(false);
      expect(store.deletingFolderPath()).toBeNull();
      expect(store.rootFolders()[0].tree?.children).toEqual([]);

      pending.next({ movedCount: 0, foldersDeleted: 1, warnings: [], errors: [] });
      pending.complete();
      await waitForSignals();
      expect(store.movesInFlight()).toBe(0);
      expect(store.isMoving()).toBe(false);
      expect(store.isDeletingFolder()).toBe(false);
    });

    it('rolls a refused folder move back and clears only move state', async () => {
      const pending = new Subject<{
        movedCount: number;
        foldersDeleted: number;
        warnings: string[];
        errors: string[];
      }>();
      vi.spyOn(apiService, 'moveFolder').mockReturnValue(pending);
      const original = store.rootFolders();

      store
        .moveFolder({
          sourceFolderPath: 'common.buttons',
          destinationFolderPath: 'errors',
        })
        .subscribe();
      await waitForSignals();
      pending.error(serverError(409, 'Cannot move'));
      await waitForSignals();

      expect(store.rootFolders()).toEqual(original);
      expect(store.movesInFlight()).toBe(0);
      expect(store.isMoving()).toBe(false);
      expect(store.isDeletingFolder()).toBe(false);
      expect(store.error()).toBeNull();
    });
  });

  describe('Initialization', () => {
    it('returns no-collection for a folder create when no collection is open', () => {
      const create = vi.spyOn(apiService, 'createFolder');
      let response: unknown = 'pending';

      store.createFolder('new', null).subscribe((value) => {
        response = value;
      });

      expect(response).toEqual({ kind: 'no-collection', feedback: null });
      expect(create).not.toHaveBeenCalled();
    });

    it('should create store with default state', () => {
      expect(store.selectedCollection()).toBeNull();
      expect(store.availableLocales()).toEqual([]);
      expect(store.currentFolderPath()).toBe('');
      expect(store.expandedFolders()).toEqual(new Set());
      expect(store.rootFolders()).toEqual([]);
      expect(store.folderTreeFilter()).toBe('');
      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.translations()).toEqual([]);
      expect(store.isTranslationsLoading()).toBe(false);
      expect(store.isDisabled()).toBe(false);
      expect(store.error()).toBeNull();
    });
  });

  describe('Collection Selection', () => {
    it('should show indexing state while the initial cache status request is pending', () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(NEVER);

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: ['en', 'es'],
        }),
      );

      expect(store.cacheStatus()).toBe('not-started');
      expect(store.isCacheIndexing()).toBe(true);
    });

    it('should set selected collection and load root folders', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: ['en', 'es', 'de'],
        }),
      );

      expect(store.selectedCollection()).toBe('app-translations');
      expect(store.availableLocales()).toEqual(['en', 'es', 'de']);

      await waitForSignals();

      expect(store.rootFolders()).toEqual(mockTreeRoot.children);
      expect(store.translations()).toEqual(mockTreeRoot.resources);
      expect(store.isFolderTreeLoading()).toBe(false);
    });

    it('should open the next collection fresh: no search, folder or folder-op state carries over', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockImplementation((collection) =>
        of({ path: '', resources: [summary(`${collection}.welcome`, 'Welcome')], children: [] }),
      );
      vi.spyOn(apiService, 'searchTranslations').mockReturnValue(
        of({
          query: 'save',
          results: [{ ...summary('common.save', 'Save'), matchType: 'exact-key' as const }],
          totalFound: 1,
          limited: false,
        }),
      );

      store.openCollection(collectionSettings({ name: 'app-translations', locales: ['en', 'es'], readOnly: true }));
      await waitForSignals();
      store.setFolderTreeFilter('test');
      store.showFolder('common');
      store.showQuery('save');
      await waitForSignals();
      store.startAddingFolder('common');
      // The active search already keeps isDisabled true; opening the next collection must clear it.
      expect(store.isDisabled()).toBe(true);
      expect(store.sortedTranslations().map((item) => item.fullKey)).toEqual(['common.save']);

      store.openCollection(collectionSettings({ name: 'website-translations', locales: ['en', 'fr'] }));
      await waitForSignals();

      expect(store.selectedCollection()).toBe('website-translations');
      expect(store.availableLocales()).toEqual(['en', 'fr']);
      expect(store.isReadOnly()).toBe(false);
      expect(store.isDisabled()).toBe(false);
      expect(store.searchQuery()).toBe('');
      expect(store.isSearchMode()).toBe(false);
      expect(store.searchResults()).toEqual([]);
      expect(store.folderTreeFilter()).toBe('');
      expect(store.currentFolderPath()).toBe('');
      expect(store.isAddingFolder()).toBe(false);
      expect(store.addFolderParentPath()).toBeNull();
      // The list shows the new collection's root, not the old collection's search hits.
      expect(store.sortedTranslations().map((item) => item.fullKey)).toEqual(['website-translations.welcome']);
    });

    it('should clear nonCompactSelectedLocales when switching collections', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      // Select first collection — initial densityMode is 'compact'
      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: ['en', 'es', 'de'],
        }),
      );

      // Switch to full mode, then select multiple locales, then back to compact.
      // Entering compact saves selectedLocales into nonCompactSelectedLocales.
      store.setDensityMode('full');
      store.setSelectedLocales(['en', 'es', 'de']);
      store.setDensityMode('compact');

      expect(store.nonCompactSelectedLocales()).toEqual(['en', 'es', 'de']);

      // Switch to a different collection — nonCompactSelectedLocales must be cleared
      store.openCollection(
        collectionSettings({
          name: 'website-translations',
          locales: ['en', 'fr'],
        }),
      );

      expect(store.nonCompactSelectedLocales()).toEqual([]);

      await waitForSignals();
    });
  });

  describe('Folder Tree Loading', () => {
    it('should load root folders successfully when cache is ready', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: ['en', 'es'],
        }),
      );

      await waitForSignals();

      expect(store.rootFolders()).toEqual(mockTreeRoot.children);
      expect(store.translations()).toEqual(mockTreeRoot.resources);
      expect(store.currentFolderPath()).toBe('');
      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it('should handle root folder loading errors', async () => {
      const error = serverError(404, 'Collection not found');
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(throwError(() => error));

      store.openCollection(
        collectionSettings({
          name: 'nonexistent',
          locales: [],
        }),
      );

      await waitForSignals();

      expect(store.rootFolders()).toEqual([]);
      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.error()).toBe('Collection not found');
    });

    it('surfaces the server message of a failed tree load through the HTTP seam', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      const http = spectator.inject(HttpTestingController);

      store.openCollection(collectionSettings({ name: 'ghost', locales: [] }));
      await waitForSignals();
      // The folder tree's read and the list's.
      for (const read of http.match((request) => request.url.endsWith('/resources/tree'))) {
        read.flush(
          { statusCode: 404, message: 'Collection "ghost" not found', error: 'Not Found' },
          { status: 404, statusText: 'Not Found' },
        );
      }
      await waitForSignals();

      expect(store.error()).toBe('Collection "ghost" not found');
      expect(store.isFolderTreeLoading()).toBe(false);
    });

    it('should keep the already-loaded root folders when the index is still not ready after the retries', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      const getTree = vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      const notifyError = vi.spyOn(spectator.inject(NotificationService), 'error').mockImplementation(() => undefined);

      store.openCollection(collectionSettings({ name: 'app-translations', locales: ['en', 'es'] }));
      await waitForSignals();
      expect(store.rootFolders()).toEqual(mockTreeRoot.children);

      getTree.mockReturnValue(throwError(() => new CollectionIndexNotReadyError('Collection is being indexed.')));
      store.loadRootFolders();
      await waitForSignals();

      expect(store.rootFolders()).toEqual(mockTreeRoot.children);
      expect(store.translations()).toEqual(mockTreeRoot.resources);
      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.error()).toBeNull();
      expect(notifyError).toHaveBeenCalledWith('Collection is being indexed.');
    });

    it('should keep a loaded tree with root resources and no folders when the index goes not ready', async () => {
      const rootOnlyTree: ResourceTreeDto = {
        path: '',
        resources: [summary('welcome', 'Welcome', { es: ['Bienvenido', 'translated'] })],
        children: [],
      };
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      const getTree = vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(rootOnlyTree));
      const notifyError = vi.spyOn(spectator.inject(NotificationService), 'error').mockImplementation(() => undefined);

      store.openCollection(collectionSettings({ name: 'app-translations', locales: ['en', 'es'] }));
      await waitForSignals();
      expect(store.rootFolders()).toEqual([]);
      expect(store.folderTreeLoaded()).toBe(true);

      getTree.mockReturnValue(throwError(() => new CollectionIndexNotReadyError('Collection is being indexed.')));
      store.loadRootFolders();
      await waitForSignals();

      expect(store.translations()).toEqual(rootOnlyTree.resources);
      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.error()).toBeNull();
      expect(notifyError).toHaveBeenCalledWith('Collection is being indexed.');
    });

    it('should show the error state when the first root load finds the index not ready', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(
        throwError(() => new CollectionIndexNotReadyError('Collection is being indexed.')),
      );

      store.openCollection(collectionSettings({ name: 'app-translations', locales: ['en', 'es'] }));
      await waitForSignals();

      expect(store.folderTreeLoaded()).toBe(false);
      expect(store.error()).toBe('Collection is being indexed.');
    });

    it('should forget the loaded tree when the collection changes', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      const getTree = vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(collectionSettings({ name: 'app-translations', locales: ['en', 'es'] }));
      await waitForSignals();
      expect(store.folderTreeLoaded()).toBe(true);

      getTree.mockReturnValue(NEVER);
      store.openCollection(collectionSettings({ name: 'website-translations', locales: ['en', 'fr'] }));

      expect(store.folderTreeLoaded()).toBe(false);
    });

    it('should set loading state during folder tree fetch', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      expect(store.isFolderTreeLoading()).toBe(false);

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      // After observable completes, loading should be false
      expect(store.isFolderTreeLoading()).toBe(false);
    });
  });

  describe('Folder Children Loading', () => {
    it('should load folder children and update tree', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockImplementation(treeAt({ common: of(mockTreeCommon) }));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: ['en', 'es'],
        }),
      );

      await waitForSignals();

      store.loadFolderChildren('common');

      await waitForSignals();

      const rootFolders = store.rootFolders();
      const commonFolder = rootFolders.find((f) => f.fullPath === 'common');

      expect(commonFolder).toBeDefined();
      expect(commonFolder?.loaded).toBe(true);
      expect(commonFolder?.tree).toEqual(mockTreeCommon);
      expect(store.isFolderTreeLoading()).toBe(false);
    });

    it('should handle folder children loading errors', async () => {
      const error = serverError(502, 'api error: load folder children');
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockImplementation(treeAt({ common: throwError(() => error) }));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      store.loadFolderChildren('common');

      await waitForSignals();

      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.error()).toBe('api error: load folder children');
    });
  });

  describe('Folder Selection and Translation Loading', () => {
    it('should select folder and load its translations', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockImplementation(treeAt({ common: of(mockTreeCommon) }));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: ['en', 'es'],
        }),
      );

      await waitForSignals();

      store.showFolder('common');

      await waitForSignals();

      expect(store.currentFolderPath()).toBe('common');
      expect(store.translations()).toEqual(mockTreeCommon.resources);
      expect(store.isTranslationsLoading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it('should handle translation loading errors', async () => {
      const error = serverError(502, 'api error: load translations');
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockImplementation(treeAt({ common: throwError(() => error) }));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      store.showFolder('common');

      await waitForSignals();

      expect(store.currentFolderPath()).toBe('common');
      expect(store.isTranslationsLoading()).toBe(false);
      expect(store.listError()).toBe('api error: load translations');
    });

    it('should keep the tree and the shown list, and notify, when the index is still not ready after the retries', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockImplementation(
        treeAt({ common: throwError(() => new CollectionIndexNotReadyError('Collection is being indexed.')) }),
      );
      const notifyError = vi.spyOn(spectator.inject(NotificationService), 'error').mockImplementation(() => undefined);

      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();

      store.showFolder('common');
      await waitForSignals();

      expect(store.rootFolders()).toEqual(mockTreeRoot.children);
      expect(store.translations()).toEqual(mockTreeRoot.resources);
      expect(store.currentFolderPath()).toBe('');
      expect(store.isTranslationsLoading()).toBe(false);
      expect(store.error()).toBeNull();
      expect(notifyError).toHaveBeenCalledWith('Collection is being indexed.');
    });

    it('should set loading state during translation fetch', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockImplementation(treeAt({ common: of(mockTreeCommon) }));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      expect(store.isTranslationsLoading()).toBe(false);

      store.showFolder('common');

      await waitForSignals();

      // After observable completes, loading should be false
      expect(store.isTranslationsLoading()).toBe(false);
    });
  });

  describe('Folder Tree Filter', () => {
    it('should update folder tree filter', () => {
      store.setFolderTreeFilter('common');
      expect(store.folderTreeFilter()).toBe('common');
    });

    it('should filter folders based on search term', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      store.setFolderTreeFilter('common');
      const filtered = store.filteredFolders();

      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('common');
    });

    it('should return all folders when filter is empty', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      store.setFolderTreeFilter('');
      const filtered = store.filteredFolders();

      expect(filtered).toEqual(mockTreeRoot.children);
    });
  });

  describe('Folder Expansion', () => {
    it('should toggle folder expanded state', () => {
      expect(store.expandedFolders().has('common')).toBe(false);

      store.toggleFolderExpanded('common');
      expect(store.expandedFolders().has('common')).toBe(true);

      store.toggleFolderExpanded('common');
      expect(store.expandedFolders().has('common')).toBe(false);
    });

    it('should track multiple expanded folders', () => {
      store.toggleFolderExpanded('common');
      store.toggleFolderExpanded('errors');

      expect(store.expandedFolders().has('common')).toBe(true);
      expect(store.expandedFolders().has('errors')).toBe(true);
    });

    it('should open a folder without closing it when already open', () => {
      store.expandFolder('common');
      store.expandFolder('common');

      expect(store.expandedFolders().has('common')).toBe(true);
    });

    it('should reveal the selected folder by expanding its ancestors only', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeCommon));

      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();

      store.showFolder('common.buttons.primary');
      await waitForSignals();

      // Ancestors are revealed; the selection itself is not opened, and the stored set is untouched.
      expect(store.visibleExpandedFolders().has('common')).toBe(true);
      expect(store.visibleExpandedFolders().has('common.buttons')).toBe(true);
      expect(store.visibleExpandedFolders().has('common.buttons.primary')).toBe(false);
      expect(store.expandedFolders().size).toBe(0);
    });

    it('should start with the root expanded', () => {
      expect(store.isRootExpanded()).toBe(true);
    });

    it('should toggle the root row', () => {
      store.setRootExpanded();
      expect(store.isRootExpanded()).toBe(false);

      store.setRootExpanded();
      expect(store.isRootExpanded()).toBe(true);
    });

    it('should expand every folder in view and leave the root open', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeWithNesting));

      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();

      expect(store.areAllFoldersExpanded()).toBe(false);

      store.expandAllFolders();

      expect(store.expandedFolders().has('common')).toBe(true);
      expect(store.expandedFolders().has('errors')).toBe(true);
      // A folder with no child folders has nothing to open, so it never enters the set.
      expect(store.expandedFolders().has('common.buttons')).toBe(false);
      expect(store.areAllFoldersExpanded()).toBe(true);
      expect(store.isRootExpanded()).toBe(true);
    });

    it('should collapse every folder but keep the root open', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeWithNesting));

      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();

      store.expandAllFolders();
      store.collapseAllFolders();

      expect(store.expandedFolders().size).toBe(0);
      expect(store.isRootExpanded()).toBe(true);
    });

    it('should open branches holding matches while filtering and restore expansion on clear', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeWithNesting));

      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();

      store.toggleFolderExpanded('errors');

      store.setFolderTreeFilter('buttons');

      // The branch leading to the match is open; the user's unrelated branch is set aside.
      expect(store.expandedFolders().has('common')).toBe(true);
      expect(store.expandedFolders().has('errors')).toBe(false);

      store.setFolderTreeFilter('');

      expect(store.expandedFolders().has('errors')).toBe(true);
      expect(store.expandedFolders().has('common')).toBe(false);
    });

    it('should prune expanded paths under a deleted folder', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeWithNesting));
      vi.spyOn(apiService, 'deleteFolder').mockReturnValue(
        of({ deleted: true, folderPath: 'common', resourcesDeleted: 0 }),
      );

      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();

      store.expandAllFolders();
      store.deleteFolder('common').subscribe();
      await waitForSignals();

      expect(store.expandedFolders().has('common')).toBe(false);
      expect(store.expandedFolders().has('common.buttons')).toBe(false);
      expect(store.expandedFolders().has('errors')).toBe(true);
    });
  });

  describe('Computed Signals', () => {
    it('should compute breadcrumbs from current folder path', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.showFolder('common.buttons.primary');

      await waitForSignals();

      const breadcrumbs = store.breadcrumbs();
      expect(breadcrumbs).toEqual(['common', 'buttons', 'primary']);
    });

    it('should return empty breadcrumbs for root folder', () => {
      const breadcrumbs = store.breadcrumbs();
      expect(breadcrumbs).toEqual([]);
    });

    it('should compute isLoading correctly', async () => {
      expect(store.isLoading()).toBe(false);

      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      // After observable completes, loading should be false
      expect(store.isLoading()).toBe(false);
    });

    it('should compute isEmpty correctly', async () => {
      const emptyTree: ResourceTreeDto = {
        path: '',
        resources: [],
        children: [],
      };

      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(emptyTree));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      expect(store.isEmpty()).toBe(true);
      expect(store.hasTranslations()).toBe(false);
      expect(store.translationCount()).toBe(0);
    });

    it('should compute hasTranslations and translationCount correctly', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      expect(store.hasTranslations()).toBe(true);
      expect(store.translationCount()).toBe(1);
      expect(store.isEmpty()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should fall back to the load-folders message for the generic 500, whose body carries no message', async () => {
      const error = toApiError(
        new HttpErrorResponse({ status: 500, error: { statusCode: 500, error: 'Internal Server Error' } }),
      );
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      // Only the folder tree's read fails; the list's succeeds and must not hide the failure.
      vi.spyOn(apiService, 'getResourceTree').mockImplementation((_collection, _path, includeNested) =>
        includeNested ? of(mockTreeRoot) : throwError(() => error),
      );

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      expect(store.error()).toBe(TRACKER_TOKENS.BROWSER.TOAST.LOADFOLDERSFAILED);
    });

    it('should clear error when clearError is called', async () => {
      const error = serverError(502, 'Test error');
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(throwError(() => error));

      store.openCollection(
        collectionSettings({
          name: 'app-translations',
          locales: [],
        }),
      );

      await waitForSignals();

      expect(store.error()).toBe('Test error');

      store.clearError();
      expect(store.error()).toBeNull();
    });

    it("should clear the error on the list's Retry, loading the tree and the list again", async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      const getTree = vi
        .spyOn(apiService, 'getResourceTree')
        .mockReturnValue(throwError(() => serverError(502, 'Test error')));

      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();
      expect(store.error()).toBe('Test error');

      getTree.mockReturnValue(of(mockTreeRoot));
      store.retryLoad();
      await waitForSignals();

      expect(store.error()).toBeNull();
      expect(store.rootFolders()).toEqual(mockTreeRoot.children);
      expect(store.translations()).toEqual(mockTreeRoot.resources);
    });
  });

  describe('Disabled State', () => {
    async function prepareFolderInteractions(): Promise<void> {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeWithNesting));
      vi.spyOn(apiService, 'searchTranslations').mockReturnValue(
        of({ query: 'save', results: [], totalFound: 0, limited: false }),
      );
      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();
      store.showFolder('common.buttons');
      await waitForSignals();
    }

    function expectFolderInteractionsRefused(): void {
      const treeRead = vi.mocked(apiService.getResourceTree);
      const search = vi.mocked(apiService.searchTranslations);
      treeRead.mockClear();
      search.mockClear();
      const http = spectator.inject(HttpTestingController);
      const actions = [
        () => expect(store.selectFolder('errors')).toBe(false),
        () => expect(store.selectFolder('')).toBe(false),
        () => store.toggleFolderExpanded('common'),
        () => store.expandFolder('errors'),
        () => expect(store.setRootExpanded()).toBe(false),
        () => expect(store.setRootExpanded(true)).toBe(false),
        () => expect(store.setRootExpanded(false)).toBe(false),
        () => store.expandAllFolders(),
        () => store.collapseAllFolders(),
        () => store.toggleAllFoldersExpanded(),
      ];

      for (const open of [false, true]) {
        patchState(unprotected(store), {
          isRootExpanded: open,
          expandedFolders: open ? new Set(['common', 'errors']) : new Set<string>(),
          folderTreeFilter: open ? 'buttons' : '',
        });
        const before = getState(store);
        for (const action of actions) {
          action();
          expect(getState(store)).toStrictEqual(before);
          expect(store.expandedFolders()).toBe(before.expandedFolders);
        }
      }
      expect(treeRead).not.toHaveBeenCalled();
      expect(search).not.toHaveBeenCalled();
      http.expectNone(() => true);
    }

    it('refuses user folder selection and expansion while search is shown without state changes or HTTP', async () => {
      await prepareFolderInteractions();
      store.showQuery('save');
      await waitForSignals();

      expect(store.isDisabled()).toBe(true);
      expectFolderInteractionsRefused();
      expect(store.searchQuery()).toBe('save');
      expect(store.currentFolderPath()).toBe('common.buttons');
    });

    it('refuses user folder selection and expansion while a move is in flight without state changes or HTTP', async () => {
      await prepareFolderInteractions();
      vi.spyOn(apiService, 'moveFolder').mockReturnValue(NEVER);
      const move = store
        .moveFolder({ sourceFolderPath: 'common.buttons', destinationFolderPath: 'errors' })
        .subscribe();

      expect(store.isDisabled()).toBe(true);
      expectFolderInteractionsRefused();
      expect(store.currentFolderPath()).toBe('common.buttons');
      move.unsubscribe();
      expect(store.isDisabled()).toBe(false);
    });

    function expectFilterAppliedWhileDisabled(): void {
      vi.mocked(apiService.getResourceTree).mockClear();
      vi.mocked(apiService.searchTranslations).mockClear();
      const before = getState(store);

      store.setFolderTreeFilter('buttons');
      expect(store.folderTreeFilter()).toBe('buttons');
      expect([...store.expandedFolders()]).toEqual(['common']);
      expect(store.preFilterExpandedFolders()).toBe(before.expandedFolders);
      expect(store.currentFolderPath()).toBe(before.currentFolderPath);
      expect(store.listScope()).toBe(before.listScope);
      expect(store.isDisabled()).toBe(true);

      store.setFolderTreeFilter('');
      expect(store.folderTreeFilter()).toBe('');
      expect(store.expandedFolders()).toBe(before.expandedFolders);
      expect(store.preFilterExpandedFolders()).toBeNull();
      expect(store.currentFolderPath()).toBe(before.currentFolderPath);
      expect(store.listScope()).toBe(before.listScope);
      expect(store.isDisabled()).toBe(true);
      expect(apiService.getResourceTree).not.toHaveBeenCalled();
      expect(apiService.searchTranslations).not.toHaveBeenCalled();
      spectator.inject(HttpTestingController).expectNone(() => true);
    }

    it('applies and clears folder filters during search without navigation or HTTP', async () => {
      await prepareFolderInteractions();
      store.showQuery('save');
      await waitForSignals();

      expectFilterAppliedWhileDisabled();
    });

    it('applies and clears folder filters during a move without navigation or HTTP', async () => {
      await prepareFolderInteractions();
      vi.spyOn(apiService, 'moveFolder').mockReturnValue(NEVER);
      const move = store.moveFolder({ sourceFolderPath: 'errors.http', destinationFolderPath: 'common' }).subscribe();
      try {
        expectFilterAppliedWhileDisabled();
      } finally {
        move.unsubscribe();
      }
    });

    it('allows programmatic showFolder to leave search and load a folder', async () => {
      await prepareFolderInteractions();
      store.showQuery('save');
      await waitForSignals();
      expect(store.isDisabled()).toBe(true);
      vi.mocked(apiService.getResourceTree).mockClear();

      store.showFolder('errors');
      await waitForSignals();

      expect(store.currentFolderPath()).toBe('errors');
      expect(store.isSearchMode()).toBe(false);
      expect(apiService.getResourceTree).toHaveBeenCalledWith('app-translations', 'errors', true);
    });

    it('allows programmatic showFolder to load a folder during a move', async () => {
      await prepareFolderInteractions();
      vi.spyOn(apiService, 'moveFolder').mockReturnValue(NEVER);
      const move = store
        .moveFolder({ sourceFolderPath: 'common.buttons', destinationFolderPath: 'errors' })
        .subscribe();
      vi.mocked(apiService.getResourceTree).mockClear();

      store.showFolder('errors');
      await waitForSignals();

      expect(store.isDisabled()).toBe(true);
      expect(store.currentFolderPath()).toBe('errors');
      expect(apiService.getResourceTree).toHaveBeenCalledWith('app-translations', 'errors', true);
      move.unsubscribe();
    });

    it('accepts user selection and expansion in a read-only collection', async () => {
      await prepareFolderInteractions();
      patchState(unprotected(store), { isReadOnly: true });
      expect(store.effectiveDisabled()).toBe(true);
      expect(store.isDisabled()).toBe(false);

      expect(store.selectFolder('errors')).toBe(true);
      store.expandFolder('common');
      store.setRootExpanded(false);
      expect(store.currentFolderPath()).toBe('errors');
      expect(store.expandedFolders().has('common')).toBe(true);
      expect(store.isRootExpanded()).toBe(false);
    });

    it('sets the root open or shut idempotently and toggles when no state is supplied', () => {
      expect(store.setRootExpanded(false)).toBe(true);
      const closed = getState(store);
      expect(store.setRootExpanded(false)).toBe(false);
      expect(getState(store)).toStrictEqual(closed);
      expect(store.setRootExpanded(true)).toBe(true);
      const open = getState(store);
      expect(store.setRootExpanded(true)).toBe(false);
      expect(getState(store)).toStrictEqual(open);
      expect(store.setRootExpanded()).toBe(true);
      expect(store.isRootExpanded()).toBe(false);
    });

    it('toggles all folders in the filtered subtree and keeps the root open', async () => {
      await prepareFolderInteractions();
      store.setFolderTreeFilter('buttons');
      store.setRootExpanded(false);
      store.toggleAllFoldersExpanded();
      expect(store.expandedFolders().size).toBe(0);
      expect(store.isRootExpanded()).toBe(true);
      store.toggleAllFoldersExpanded();
      expect([...store.expandedFolders()]).toEqual(['common']);
      expect(store.isRootExpanded()).toBe(true);
    });

    it('should reflect an active search as disabled, and clear it once the search ends', () => {
      expect(store.isDisabled()).toBe(false);

      store.showQuery('save');
      expect(store.isDisabled()).toBe(true);

      store.clearSearch();
      expect(store.isDisabled()).toBe(false);
    });
  });

  describe('Read-only State', () => {
    it('should default to not read-only', () => {
      expect(store.isReadOnly()).toBe(false);
      expect(store.effectiveDisabled()).toBe(false);
    });

    it('effectiveDisabled is true when either isDisabled or isReadOnly is true', () => {
      store.openCollection(collectionSettings({ name: 'vendor', readOnly: true }));
      expect(store.effectiveDisabled()).toBe(true);

      store.openCollection(collectionSettings({ name: 'main' }));
      store.showQuery('something');
      expect(store.effectiveDisabled()).toBe(true);
    });

    it('persists read-only across clearSearch (does not get cleared like isDisabled)', () => {
      store.openCollection(collectionSettings({ name: 'vendor', readOnly: true }));
      store.showQuery('something');
      expect(store.isDisabled()).toBe(true);

      store.clearSearch();

      // Transient disabled is cleared, but read-only remains.
      expect(store.isDisabled()).toBe(false);
      expect(store.isReadOnly()).toBe(true);
      expect(store.effectiveDisabled()).toBe(true);
    });

    it('takes read-only from the opened collection settings', () => {
      store.openCollection(collectionSettings({ name: 'vendor', locales: ['en'], readOnly: true }));
      expect(store.isReadOnly()).toBe(true);

      store.openCollection(collectionSettings({ name: 'main', locales: ['en'] }));
      expect(store.isReadOnly()).toBe(false);
    });
  });

  describe('Density mode & view preferences (Phase 1)', () => {
    beforeEach(() => {
      // Ensure localStorage is clean for each test
      localStorage.clear();
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
    });

    it('should update density mode state', () => {
      expect(store.densityMode()).toBe('compact');

      store.setDensityMode('full');
      expect(store.densityMode()).toBe('full');

      store.setDensityMode('compact');
      expect(store.densityMode()).toBe('compact');
    });

    it('should restore each collection its own saved preferences on open, and start fresh without any', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      localStorage.setItem(
        'lingo-tracker:view-prefs:remembered',
        JSON.stringify({
          densityMode: 'full',
          selectedLocales: ['es', 'fr'],
          showNestedResources: false,
          compactLocale: 'fr',
          compactLocaleManuallyChanged: true,
          sortField: 'status',
          sortDirection: 'desc',
          selectedStatuses: ['stale'],
        }),
      );

      store.openCollection(collectionSettings({ name: 'remembered', locales: ['en', 'es', 'fr'] }));
      await waitForSignals();

      expect(store.densityMode()).toBe('full');
      expect(store.selectedLocales()).toEqual(['es', 'fr']);
      expect(store.showNestedResources()).toBe(false);
      expect(store.compactLocale()).toBe('fr');
      expect(store.compactLocaleManuallyChanged()).toBe(true);
      expect(store.sortField()).toBe('status');
      expect(store.sortDirection()).toBe('desc');
      expect(store.selectedStatuses()).toEqual(['stale']);

      store.openCollection(collectionSettings({ name: 'forgotten', locales: ['en', 'es', 'fr'] }));
      await waitForSignals();

      expect(store.densityMode()).toBe('compact');
      expect(store.selectedLocales()).toEqual([]);
      expect(store.showNestedResources()).toBe(true);
      expect(store.sortField()).toBe('key');
      expect(store.sortDirection()).toBe('asc');
      expect(store.selectedStatuses()).toEqual([]);
    });

    it('should drop a full-mode saved locale the collection no longer has', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      localStorage.setItem(
        'lingo-tracker:view-prefs:shrunk',
        JSON.stringify({ densityMode: 'full', selectedLocales: ['es', 'fr', 'de'] }),
      );

      // 'de' was removed from the collection since the preferences were saved.
      store.openCollection(collectionSettings({ name: 'shrunk', locales: ['en', 'es', 'fr'] }));
      await waitForSignals();

      expect(store.densityMode()).toBe('full');
      expect(store.selectedLocales()).toEqual(['es', 'fr']);
    });

    it('should read the retired medium density as compact and pick its one locale', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      localStorage.setItem(
        'lingo-tracker:view-prefs:legacy',
        JSON.stringify({ densityMode: 'medium', selectedLocales: ['es', 'fr'], compactLocale: 'fr' }),
      );

      store.openCollection(collectionSettings({ name: 'legacy', locales: ['en', 'es', 'fr'] }));
      await waitForSignals();

      expect(store.densityMode()).toBe('compact');
      expect(store.selectedLocales()).toEqual(['fr']);
    });

    it('should read saved preferences without a density as compact and pick its one locale', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      localStorage.setItem(
        'lingo-tracker:view-prefs:no-density',
        JSON.stringify({ selectedLocales: ['es', 'fr'], compactLocale: 'fr' }),
      );

      store.openCollection(collectionSettings({ name: 'no-density', locales: ['en', 'es', 'fr'] }));
      await waitForSignals();

      expect(store.densityMode()).toBe('compact');
      expect(store.selectedLocales()).toEqual(['fr']);
    });

    it('should save the restored preferences under the new collection, not the previous one', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(collectionSettings({ name: 'first', locales: ['en', 'es'] }));
      store.setDensityMode('full');
      await waitForSignals();
      store.openCollection(collectionSettings({ name: 'second', locales: ['en', 'es'] }));
      await waitForSignals();

      expect(JSON.parse(localStorage.getItem('lingo-tracker:view-prefs:first') ?? '{}').densityMode).toBe('full');
      expect(JSON.parse(localStorage.getItem('lingo-tracker:view-prefs:second') ?? '{}').densityMode).toBe('compact');
    });

    it('should start compact on the base locale regardless of the full-density filter', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: 'c1',
          locales: ['en', 'es', 'fr'],
          baseLocale: 'en',
        }),
      );

      await waitForSignals();

      store.setDensityMode('full');
      store.setSelectedLocales(['es', 'fr']);
      expect(store.selectedLocales()).toEqual(['es', 'fr']);

      store.setDensityMode('compact');

      // Compact shows one locale, and it is the base until the user picks another
      expect(store.selectedLocales()).toEqual(['en']);
      expect(store.compactDisplayLocale()).toBe('en');
      expect(store.densityMode()).toBe('compact');
    });

    it('should remember the compact locale as soon as it is picked', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: 'c1',
          locales: ['en', 'es', 'fr'],
          baseLocale: 'en',
        }),
      );

      await waitForSignals();

      store.setDensityMode('compact');
      store.setSelectedLocales(['fr']);

      expect(store.compactDisplayLocale()).toBe('fr');
      expect(store.compactLocale()).toBe('fr');

      // Round-trips through full density and back
      store.setDensityMode('full');
      store.setDensityMode('compact');
      expect(store.compactDisplayLocale()).toBe('fr');
    });

    it('should load preferences when collection is selected', async () => {
      const coll = 'load-collection';
      const prefs = {
        densityMode: 'compact' as const,
        selectedLocales: ['fr'],
        showNestedResources: true,
        compactLocale: 'fr',
        compactLocaleManuallyChanged: false,
        sortField: 'key' as const,
        sortDirection: 'asc' as const,
        selectedStatuses: [],
      };
      localStorage.setItem(`lingo-tracker:view-prefs:${coll}`, JSON.stringify(prefs));

      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: coll,
          locales: ['en', 'fr', 'es'],
        }),
      );

      await waitForSignals();

      // density mode should be applied and selectedLocales as well (compact implies single locale)
      expect(store.densityMode()).toBe('compact');
      expect(store.selectedLocales()).toEqual(['fr']);
    });

    it('should default to base locale when switching to compact mode with no selection', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: 'c1',
          locales: ['en', 'es', 'fr'],
          baseLocale: 'en',
        }),
      );

      await waitForSignals();

      // No locales selected initially
      expect(store.selectedLocales()).toEqual([]);

      store.setDensityMode('full');
      store.setDensityMode('compact');

      // Should select base locale
      expect(store.selectedLocales()).toEqual(['en']);
      expect(store.densityMode()).toBe('compact');
    });

    it('should default to base locale when loading compact mode from localStorage with no selection', async () => {
      const coll = 'compact-no-selection';
      const prefs = {
        densityMode: 'compact' as const,
        selectedLocales: [],
        showNestedResources: true,
        compactLocale: undefined,
        compactLocaleManuallyChanged: false,
        sortField: 'key' as const,
        sortDirection: 'asc' as const,
        selectedStatuses: [],
      };
      localStorage.setItem(`lingo-tracker:view-prefs:${coll}`, JSON.stringify(prefs));

      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: coll,
          locales: ['en', 'es', 'fr'],
          baseLocale: 'en',
        }),
      );

      await waitForSignals();

      // Should have applied compact mode and defaulted to base locale
      expect(store.densityMode()).toBe('compact');
      expect(store.selectedLocales()).toEqual(['en']);
    });

    it('should fallback to first available locale if base locale is not in available locales', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.openCollection(
        collectionSettings({
          name: 'c1',
          locales: ['es', 'fr', 'de'],
          baseLocale: 'en', // not in available locales
        }),
      );

      await waitForSignals();

      expect(store.selectedLocales()).toEqual([]);

      store.setDensityMode('full');
      store.setDensityMode('compact');

      // Should fallback to first available locale
      expect(store.selectedLocales()).toEqual(['es']);
    });
  });

  describe('Refresh Translations', () => {
    it('should reload the folder the list shows', async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      const getTree = vi
        .spyOn(apiService, 'getResourceTree')
        .mockImplementation(treeAt({ common: of(mockTreeCommon) }));

      store.openCollection(collectionSettings({ name: 'app-translations', locales: [] }));
      await waitForSignals();
      store.showFolder('common');
      await waitForSignals();
      getTree.mockClear();

      store.reloadList();
      await waitForSignals();

      expect(getTree).toHaveBeenCalledExactlyOnceWith('app-translations', 'common', true);
      expect(store.currentFolderPath()).toBe('common');
      expect(store.translations()).toEqual(mockTreeCommon.resources);
    });
  });

  describe('moveResource', () => {
    it('moves a root-level resource into a folder', () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      const move = vi.spyOn(apiService, 'moveResource').mockReturnValue(NEVER);
      store.openCollection(collectionSettings({ name: 'app-translations', locales: ['en'] }));

      store.moveResource({ sourceKey: 'welcome', destinationFolderPath: 'common' }).subscribe();

      expect(move).toHaveBeenCalledWith('app-translations', 'welcome', 'common.welcome');
    });

    it('should optimistically remove a non-root folder row by its full key', async () => {
      const row = summary('common.buttons.save', 'Save');
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockImplementation((_collection, path) =>
        of({ path: path ?? '', resources: path === 'common.buttons' ? [row] : [], children: [] }),
      );
      vi.spyOn(apiService, 'moveResource').mockReturnValue(NEVER);

      store.openCollection(collectionSettings({ name: 'app-translations', locales: ['en'] }));
      await waitForSignals();
      store.showFolder('common.buttons');
      await waitForSignals();
      expect(store.translations()).toEqual([row]);

      store
        .moveResource({
          sourceKey: 'common.buttons.save',
          destinationFolderPath: 'archive',
        })
        .subscribe();

      expect(store.translations()).toEqual([]);
      expect(apiService.moveResource).toHaveBeenCalledWith('app-translations', 'common.buttons.save', 'archive.save');
    });
  });

  describe('Locale Filtering', () => {
    beforeEach(async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      store.openCollection(
        collectionSettings({
          name: 'test',
          locales: ['en', 'es', 'fr', 'de'],
        }),
      );
      await waitForSignals();
      // Switch to full mode so multi-locale tests are not affected by compact auto-selection
      store.setDensityMode('full');
      store.clearAllLocales();
    });

    it('should initialize with empty selectedLocales', () => {
      expect(store.selectedLocales()).toEqual([]);
    });

    it('should set selected locales', () => {
      store.setSelectedLocales(['en', 'es']);
      expect(store.selectedLocales()).toEqual(['en', 'es']);
    });

    it('should toggle locale on', () => {
      store.toggleLocale('en');
      expect(store.selectedLocales()).toContain('en');
    });

    it('should toggle locale off', () => {
      store.setSelectedLocales(['en', 'es']);
      store.toggleLocale('es');
      expect(store.selectedLocales()).toEqual(['en']);
    });

    it('should select all locales', () => {
      store.selectAllLocales();
      expect(store.selectedLocales()).toEqual(['en', 'es', 'fr', 'de']);
    });

    it('should clear all locales', () => {
      store.setSelectedLocales(['en', 'es']);
      store.clearAllLocales();
      expect(store.selectedLocales()).toEqual([]);
    });

    describe('Computed: isShowingAllLocales', () => {
      it('should return true when none selected', () => {
        expect(store.isShowingAllLocales()).toBe(true);
      });

      it('should return true when all selected', () => {
        store.setSelectedLocales(['en', 'es', 'fr', 'de']);
        expect(store.isShowingAllLocales()).toBe(true);
      });

      it('should return false when some selected', () => {
        store.setSelectedLocales(['en', 'es']);
        expect(store.isShowingAllLocales()).toBe(false);
      });
    });

    describe('Computed: localeFilterLabel', () => {
      it('should be "all" when none selected', () => {
        expect(store.localeFilterLabel()).toEqual({ kind: 'all' });
      });

      it('should be "all" when all selected', () => {
        store.setSelectedLocales(['en', 'es', 'fr', 'de']);
        expect(store.localeFilterLabel()).toEqual({ kind: 'all' });
      });

      it('should name the locale when one selected', () => {
        store.setSelectedLocales(['en']);
        expect(store.localeFilterLabel()).toEqual({ kind: 'locale', locale: 'en' });
      });

      it('should carry the count when multiple selected', () => {
        store.setSelectedLocales(['en', 'es']);
        expect(store.localeFilterLabel()).toEqual({ kind: 'count', count: 2 });
      });

      it('should name the displayed locale in compact mode, never "all"', () => {
        store.setDensityMode('compact');
        expect(store.localeFilterLabel()).toEqual({ kind: 'locale', locale: 'en' });

        store.setSelectedLocales(['fr']);
        expect(store.localeFilterLabel()).toEqual({ kind: 'locale', locale: 'fr' });
      });
    });

    describe('Computed: filteredLocales', () => {
      it('keeps projection references when only compact memory changes', () => {
        store.setSelectedLocales(['es', 'fr']);
        const filtered = store.filteredLocales();
        const label = store.localeFilterLabel();
        const filterable = store.filterableLocales();

        patchState(unprotected(store), { compactLocale: 'de' });
        expect(store.filteredLocales()).toBe(filtered);
        expect(store.localeFilterLabel()).toBe(label);
        expect(store.filterableLocales()).toBe(filterable);

        patchState(unprotected(store), { nonCompactSelectedLocales: ['de'] });
        expect(store.filteredLocales()).toBe(filtered);
        expect(store.localeFilterLabel()).toBe(label);

        patchState(unprotected(store), { compactLocaleManuallyChanged: true });
        expect(store.filteredLocales()).toBe(filtered);
        expect(store.localeFilterLabel()).toBe(label);

        store.setSelectedLocales(['de']);
        expect(store.filteredLocales()).not.toBe(filtered);
        expect(store.filteredLocales()).toEqual(['en', 'de']);
        expect(store.localeFilterLabel()).toEqual({ kind: 'locale', locale: 'de' });
      });

      it('should always include base locale when no locales selected', () => {
        const filtered = store.filteredLocales();
        expect(filtered[0]).toBe('en');
        expect(filtered).toEqual(['en', 'es', 'fr', 'de']);
      });

      it('should always include base locale first when all selected', () => {
        store.setSelectedLocales(['en', 'es', 'fr', 'de']);
        const filtered = store.filteredLocales();
        expect(filtered[0]).toBe('en');
        expect(filtered).toEqual(['en', 'es', 'fr', 'de']);
      });

      it('should always include base locale first when other locales selected', () => {
        store.setSelectedLocales(['es', 'fr']);
        const filtered = store.filteredLocales();
        expect(filtered[0]).toBe('en');
        expect(filtered).toEqual(['en', 'es', 'fr']);
      });

      it('should show only base locale when only base is selected', () => {
        store.setSelectedLocales(['en']);
        const filtered = store.filteredLocales();
        expect(filtered).toEqual(['en']);
      });

      it('should handle base locale not in available locales', () => {
        store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es', 'fr', 'de'], baseLocale: 'ja' }));
        const filtered = store.filteredLocales();
        expect(filtered[0]).toBe('ja');
        expect(filtered).toContain('ja');
      });
    });

    describe('Computed: filterableLocales', () => {
      it('should exclude base locale from filterable locales', () => {
        const filterable = store.filterableLocales();
        expect(filterable).toEqual(['es', 'fr', 'de']);
        expect(filterable).not.toContain('en');
      });

      it('should handle base locale not in available locales', () => {
        store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es', 'fr', 'de'], baseLocale: 'ja' }));
        const filterable = store.filterableLocales();
        expect(filterable).toEqual(['en', 'es', 'fr', 'de']);
      });
    });
  });

  describe('Search State', () => {
    const found = (query: string, results: SearchResultsDto['results']): SearchResultsDto => ({
      query,
      results,
      totalFound: results.length,
      limited: false,
    });

    beforeEach(async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      store.openCollection(
        collectionSettings({
          name: 'test',
          locales: ['en', 'es'],
        }),
      );
      await waitForSignals();
    });

    it('should initialize with empty search state', () => {
      expect(store.searchQuery()).toBe('');
      expect(store.isSearchMode()).toBe(false);
      expect(store.searchResults()).toEqual([]);
      expect(store.isSearchLoading()).toBe(false);
    });

    it('should show a query: search mode, disabled, and its hits in the list', async () => {
      const hits = [
        { ...summary('common.save', 'Save', { es: ['Guardar', 'verified'] }), matchType: 'partial-key' as const },
      ];
      vi.spyOn(apiService, 'searchTranslations').mockReturnValue(of(found('save', hits)));

      store.showQuery('save');
      await waitForSignals();

      expect(apiService.searchTranslations).toHaveBeenCalledWith('test', 'save');
      expect(store.searchQuery()).toBe('save');
      expect(store.isSearchMode()).toBe(true);
      expect(store.isDisabled()).toBe(true);
      expect(store.isSearchLoading()).toBe(false);
      expect(store.displayedTranslations()).toEqual(hits);
    });

    it('should treat a blank query as clearing the search', () => {
      const search = vi.spyOn(apiService, 'searchTranslations').mockReturnValue(NEVER);

      store.showQuery('test');
      store.showQuery('  ');

      expect(search).toHaveBeenCalledTimes(1);
      expect(store.isSearchMode()).toBe(false);
      expect(store.isDisabled()).toBe(false);
      expect(store.isSearchLoading()).toBe(false);
    });

    it('should go back to the folder rows behind the search without loading them again', async () => {
      vi.spyOn(apiService, 'searchTranslations').mockReturnValue(of(found('test', [])));
      const tree = vi.mocked(apiService.getResourceTree);
      tree.mockClear();

      store.showQuery('test');
      await waitForSignals();
      store.clearSearch();

      expect(store.searchQuery()).toBe('');
      expect(store.isSearchMode()).toBe(false);
      expect(store.isDisabled()).toBe(false);
      expect(store.displayedTranslations()).toEqual(mockTreeRoot.resources);
      expect(tree).not.toHaveBeenCalled();
    });

    it("should show a failed search as the list's error, with the search kept for a retry", async () => {
      vi.spyOn(apiService, 'searchTranslations').mockReturnValue(throwError(() => serverError(502, 'Search failed')));

      store.showQuery('test');
      await waitForSignals();

      expect(store.isSearchLoading()).toBe(false);
      expect(store.listError()).toBe('Search failed');
      expect(store.searchQuery()).toBe('test');
    });
  });

  describe('Status Counts', () => {
    // Deliberately overlapping: `alpha` is stale in one locale and new in
    // another, so a needs-work count that adds new + stale would report 3
    // resources where only 2 exist.
    const mockStatusTree: ResourceTreeDto = {
      path: '',
      resources: [
        summary('alpha', 'Alpha', {
          es: ['Alfa', 'stale'],
          fr: ['Alpha', 'new'],
          de: ['Alpha', 'verified'],
        }),
        summary('beta', 'Beta', {
          es: ['Beta', 'new'],
          fr: ['Beta', 'translated'],
          de: ['Beta', 'translated'],
        }),
        summary('gamma', 'Gamma', {
          es: ['Gamma', 'verified'],
          fr: ['Gamma', 'verified'],
          de: ['Gamma', 'verified'],
        }),
      ],
      children: [],
    };

    beforeEach(async () => {
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockStatusTree));
      store.openCollection(
        collectionSettings({
          name: 'test',
          locales: ['en', 'es', 'fr', 'de'],
        }),
      );
      await waitForSignals();
      store.setDensityMode('full');
      store.clearAllLocales();
    });

    // `delta`'s only unfinished locale has no metadata (no stored status, `needsWork`).
    async function loadWithMetadataLessRow(): Promise<void> {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(
        of({
          ...mockStatusTree,
          resources: [
            ...mockStatusTree.resources,
            summary('delta', 'Delta', {
              es: ['Delta', 'verified'],
              fr: [undefined, undefined],
              de: ['Delta', 'verified'],
            }),
          ],
        }),
      );
      store.reloadList();
      await waitForSignals();
    }

    it('should count resources, not status cells', () => {
      // `gamma` is verified in all three target locales but is one resource.
      expect(store.statusCounts().verified).toBe(2);
    });

    it('should count a resource under every status it carries', () => {
      expect(store.statusCounts()).toEqual({ new: 2, stale: 1, translated: 1, verified: 2 });
    });

    it('should count needs work as a union rather than a sum', () => {
      const { new: isNew, stale } = store.statusCounts();
      expect(isNew + stale).toBe(3);
      expect(store.needsWorkCount()).toBe(2);
    });

    it('should agree with the list a status filter actually produces', () => {
      for (const status of ['new', 'stale', 'translated', 'verified'] as const) {
        store.setSelectedStatuses([status]);
        expect(store.sortedTranslations().length).toBe(store.statusCounts()[status]);
      }
    });

    it('should agree with the list the needs-work shortcut produces', async () => {
      await loadWithMetadataLessRow();

      store.selectNeedsWorkStatuses();
      expect(store.sortedTranslations().map((item) => item.fullKey)).toEqual(['alpha', 'beta', 'delta']);
      expect(store.sortedTranslations().length).toBe(store.needsWorkCount());
    });

    it('should not collapse other counts when one status is selected', () => {
      store.setSelectedStatuses(['new']);
      expect(store.statusCounts()).toEqual({ new: 2, stale: 1, translated: 1, verified: 2 });
    });

    it('should preserve the counts reference when only sort or selected statuses changes', () => {
      const counts = store.statusCounts();
      const needsWorkCount = store.needsWorkCount();

      store.toggleSortDirection();
      expect(store.sortedTranslations().map((item) => item.fullKey)).toEqual(['gamma', 'beta', 'alpha']);
      expect(store.statusCounts()).toBe(counts);
      expect(store.needsWorkCount()).toBe(needsWorkCount);

      store.setSelectedStatuses(['new']);
      expect(store.sortedTranslations().map((item) => item.fullKey)).toEqual(['beta', 'alpha']);
      expect(store.statusCounts()).toBe(counts);
      expect(store.needsWorkCount()).toBe(needsWorkCount);

      store.setSortField('status');
      expect(store.statusCounts()).toBe(counts);
      expect(store.needsWorkCount()).toBe(needsWorkCount);

      store.setSelectedLocales(['de']);
      expect(store.statusCounts()).not.toBe(counts);
      expect(store.statusCounts()).toEqual({ new: 0, stale: 0, translated: 1, verified: 2 });
      expect(store.needsWorkCount()).toBe(0);
    });

    it('should narrow counts to the selected locales', () => {
      store.setSelectedLocales(['de']);
      expect(store.statusCounts()).toEqual({ new: 0, stale: 0, translated: 1, verified: 2 });
      expect(store.needsWorkCount()).toBe(0);
    });

    it('should count and filter a locale with no metadata as new', async () => {
      await loadWithMetadataLessRow();

      expect(store.needsWorkCount()).toBe(3);
      expect(store.statusCounts()).toEqual({ new: 3, stale: 1, translated: 1, verified: 3 });
      store.setSelectedStatuses(['new']);
      expect(store.sortedTranslations().map((item) => item.fullKey)).toContain('delta');
      expect(store.sortedTranslations().length).toBe(store.statusCounts().new);
    });

    it('should sort a locale with no metadata as new', async () => {
      await loadWithMetadataLessRow();

      store.setSelectedLocales(['fr']);
      store.setSortField('status');
      expect(store.sortedTranslations().map((item) => item.fullKey)).toEqual(['alpha', 'delta', 'beta', 'gamma']);
    });

    it('should sort by status over every locale when no locale is selected', async () => {
      // Key order puts `able` first; only `zulu` needs work, in one locale.
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(
        of({
          path: '',
          resources: [
            summary('able', 'Able', { es: ['Able', 'verified'], fr: ['Able', 'verified'], de: ['Able', 'verified'] }),
            summary('zulu', 'Zulu', { es: ['Zulu', 'verified'], fr: ['Zulu', 'new'], de: ['Zulu', 'verified'] }),
          ],
          children: [],
        }),
      );
      store.reloadList();
      await waitForSignals();

      expect(store.selectedLocales()).toEqual([]);
      store.setSortField('status');
      expect(store.sortedTranslations().map((item) => item.fullKey)).toEqual(['zulu', 'able']);
    });

    it('should report zero for every status when the folder is empty', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of({ path: '', resources: [], children: [] }));
      store.reloadList();
      await waitForSignals();

      expect(store.statusCounts()).toEqual({ new: 0, stale: 0, translated: 0, verified: 0 });
      expect(store.needsWorkCount()).toBe(0);
    });
  });

  describe('Browser Session: responses from a closed session', () => {
    const treeOf = (collection: string, folders: string[] = []): ResourceTreeDto => ({
      path: '',
      resources: [summary(`${collection}.welcome`, 'Welcome')],
      children: folders.map((name) => ({ name, fullPath: name, loaded: false })),
    });

    /** Answers the cache status per collection: ready unless the spec holds a collection back. */
    function cacheStatusFor(pending: Record<string, Subject<CacheStatusDto>> = {}): void {
      vi.spyOn(apiService, 'getCacheStatus').mockImplementation(
        (collection) => pending[collection] ?? of(mockCacheReady),
      );
    }

    it("should drop A's root tree arriving after B was opened, so B still loads its own tree", async () => {
      const aTree = new Subject<ResourceTreeDto>();
      const bStatus = new Subject<CacheStatusDto>();
      cacheStatusFor({ b: bStatus });
      vi.spyOn(apiService, 'getResourceTree').mockImplementation((collection) =>
        collection === 'a' ? aTree : of(treeOf('b', ['b-folder'])),
      );

      store.openCollection(collectionSettings({ name: 'a' }));
      await waitForSignals();
      store.openCollection(collectionSettings({ name: 'b' }));
      aTree.next(treeOf('a', ['a-folder']));
      aTree.error(serverError(500, 'late'));

      expect(store.rootFolders()).toEqual([]);
      expect(store.folderTreeLoaded()).toBe(false);
      expect(store.translations()).toEqual([]);
      expect(store.error()).toBeNull();

      bStatus.next(mockCacheReady);
      await waitForSignals();

      expect(store.rootFolders().map((folder) => folder.fullPath)).toEqual(['b-folder']);
      expect(store.translations().map((item) => item.fullKey)).toEqual(['b.welcome']);
    });

    it("should drop A's folder children and folder list arriving after B was opened", async () => {
      const aChildren = new Subject<ResourceTreeDto>();
      const aFolder = new Subject<ResourceTreeDto>();
      cacheStatusFor({ b: new Subject<CacheStatusDto>() });
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(of(treeOf('a', ['common'])))
        .mockReturnValueOnce(aChildren)
        .mockReturnValueOnce(aFolder);

      store.openCollection(collectionSettings({ name: 'a' }));
      await waitForSignals();
      store.loadFolderChildren('common');
      store.showFolder('common');
      store.openCollection(collectionSettings({ name: 'b' }));
      aChildren.next(mockTreeCommon);
      aFolder.error(serverError(500, 'late'));

      expect(store.rootFolders()).toEqual([]);
      expect(store.translations()).toEqual([]);
      expect(store.currentFolderPath()).toBe('');
      expect(store.error()).toBeNull();
    });

    it("should drop A's search results arriving after B was opened", async () => {
      const aSearch = new Subject<SearchResultsDto>();
      cacheStatusFor();
      vi.spyOn(apiService, 'getResourceTree').mockImplementation((collection) => of(treeOf(collection)));
      vi.spyOn(apiService, 'searchTranslations').mockReturnValue(aSearch);

      store.openCollection(collectionSettings({ name: 'a' }));
      await waitForSignals();
      store.showQuery('save');
      store.openCollection(collectionSettings({ name: 'b' }));
      await waitForSignals();
      aSearch.next({
        query: 'save',
        results: [{ ...summary('a.save', 'Save'), matchType: 'exact-key' as const }],
        totalFound: 1,
        limited: false,
      });

      expect(store.searchResults()).toEqual([]);
      expect(store.isSearchMode()).toBe(false);
      expect(store.sortedTranslations().map((item) => item.fullKey)).toEqual(['b.welcome']);
    });

    it("should not roll A's failed resource move back into B's list", async () => {
      const aMove = new Subject<{ movedCount: number }>();
      const notifications = spectator.inject(NotificationService);
      const toastError = vi.spyOn(notifications, 'error');
      cacheStatusFor();
      vi.spyOn(apiService, 'getResourceTree').mockImplementation((collection) => of(treeOf(collection)));
      vi.spyOn(apiService, 'moveResource').mockReturnValue(aMove);

      store.openCollection(collectionSettings({ name: 'a' }));
      await waitForSignals();
      store
        .moveResource({
          sourceKey: 'a.welcome',
          destinationFolderPath: 'archive',
        })
        .subscribe();
      store.openCollection(collectionSettings({ name: 'b' }));
      await waitForSignals();
      aMove.error(serverError(500, 'late'));

      expect(store.translations().map((item) => item.fullKey)).toEqual(['b.welcome']);
      expect(store.error()).toBeNull();
      expect(toastError).not.toHaveBeenCalled();
    });

    it("should not apply A's folder delete, nor navigate, after B was opened", async () => {
      const aDelete = new Subject<{ deleted: boolean; folderPath: string; resourcesDeleted: number }>();
      cacheStatusFor();
      const getTree = vi
        .spyOn(apiService, 'getResourceTree')
        .mockImplementation((collection) => of(treeOf(collection, ['common'])));
      vi.spyOn(apiService, 'deleteFolder').mockReturnValue(aDelete);

      store.openCollection(collectionSettings({ name: 'a' }));
      await waitForSignals();
      store.deleteFolder('common').subscribe();
      store.openCollection(collectionSettings({ name: 'b' }));
      await waitForSignals();
      getTree.mockClear();
      aDelete.next({ deleted: true, folderPath: 'common', resourcesDeleted: 0 });
      await waitForSignals();

      expect(store.rootFolders().map((folder) => folder.fullPath)).toEqual(['common']);
      expect(getTree).not.toHaveBeenCalled();
    });

    it('should not accept the first open of A answering after A was reopened (A, B, A)', async () => {
      const firstTree = new Subject<ResourceTreeDto>();
      const secondStatus = new Subject<CacheStatusDto>();
      vi.spyOn(apiService, 'getCacheStatus')
        .mockReturnValueOnce(of(mockCacheReady))
        .mockReturnValueOnce(NEVER)
        .mockReturnValueOnce(secondStatus);
      // The first open reads the tree twice (the folder tree's read and the list's); later reads are fresh.
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(firstTree)
        .mockReturnValueOnce(firstTree)
        .mockReturnValue(of(treeOf('a', ['fresh'])));

      store.openCollection(collectionSettings({ name: 'a' }));
      await waitForSignals();
      store.openCollection(collectionSettings({ name: 'b' }));
      store.openCollection(collectionSettings({ name: 'a' }));
      firstTree.next(treeOf('a', ['stale']));

      expect(store.rootFolders()).toEqual([]);
      expect(store.folderTreeLoaded()).toBe(false);

      secondStatus.next(mockCacheReady);
      await waitForSignals();

      expect(store.rootFolders().map((folder) => folder.fullPath)).toEqual(['fresh']);
    });
  });

  describe('Browser Session: updateSettings', () => {
    beforeEach(() => {
      localStorage.clear();
      vi.spyOn(apiService, 'getCacheStatus').mockReturnValue(of(mockCacheReady));
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
    });

    it("should patch a readOnly/translationEnabled-only change in place, keeping the user's place", async () => {
      store.openCollection(collectionSettings({ name: 'app', locales: ['en', 'es'] }));
      await waitForSignals();
      store.showFolder('common');
      store.showQuery('save');
      await waitForSignals();
      const sessionId = store.sessionId();
      const statusCalls = vi.mocked(apiService.getCacheStatus).mock.calls.length;

      const edited = collectionSettings({
        name: 'app',
        locales: ['en', 'es'],
        readOnly: true,
        translationEnabled: true,
      });
      store.updateSettings(edited);

      expect(store.collectionSettings()).toEqual(edited);
      expect(store.availableLocales()).toEqual(['en', 'es']);
      expect(store.isReadOnly()).toBe(true);
      expect(store.currentFolderPath()).toBe('common');
      expect(store.searchQuery()).toBe('save');
      expect(store.isSearchMode()).toBe(true);
      expect(store.sessionId()).toBe(sessionId);
      expect(apiService.getCacheStatus).toHaveBeenCalledTimes(statusCalls);
    });

    it('should change nothing for equal settings or for another collection', async () => {
      store.openCollection(collectionSettings({ name: 'app', locales: ['en', 'es'] }));
      await waitForSignals();
      const opened = store.collectionSettings();
      const locales = store.availableLocales();

      store.updateSettings(collectionSettings({ name: 'app', locales: ['en', 'es'] }));
      store.updateSettings(collectionSettings({ name: 'other', locales: ['ja'] }));

      expect(store.collectionSettings()).toBe(opened);
      expect(store.availableLocales()).toBe(locales);
      expect(store.selectedCollection()).toBe('app');
    });

    it('should reopen when a locale is removed, dropping it from the filter and from storage', async () => {
      store.openCollection(collectionSettings({ name: 'app', locales: ['en', 'es', 'fr'] }));
      await waitForSignals();
      store.setDensityMode('full');
      store.setSelectedLocales(['es', 'fr']);
      await waitForSignals();
      const sessionId = store.sessionId();

      const edited = collectionSettings({ name: 'app', locales: ['en', 'fr'] });
      store.updateSettings(edited);
      await waitForSignals();

      expect(store.sessionId()).toBe(sessionId + 1);
      expect(store.collectionSettings()).toEqual(edited);
      expect(store.availableLocales()).toEqual(['en', 'fr']);
      // The removed locale ('es') is gone from the filter, not just hidden.
      expect(store.selectedLocales()).toEqual(['fr']);
      expect(store.isShowingAllLocales()).toBe(false);

      const stored = JSON.parse(localStorage.getItem('lingo-tracker:view-prefs:app') ?? '{}');
      expect(stored.selectedLocales).not.toContain('es');
    });

    it('should reopen when the translations folder changes, re-checking the cache', async () => {
      store.openCollection(collectionSettings({ name: 'app', locales: ['en'] }));
      await waitForSignals();
      const sessionId = store.sessionId();
      const statusCallsBefore = vi.mocked(apiService.getCacheStatus).mock.calls.length;

      const edited = collectionSettings({ name: 'app', locales: ['en'], translationsFolder: 'moved/i18n' });
      store.updateSettings(edited);

      expect(store.sessionId()).toBe(sessionId + 1);
      expect(store.collectionSettings()).toEqual(edited);
      expect(vi.mocked(apiService.getCacheStatus).mock.calls.length).toBeGreaterThan(statusCallsBefore);
    });

    it('should reopen when the base locale changes', async () => {
      store.openCollection(collectionSettings({ name: 'app', locales: ['en', 'fr'], baseLocale: 'en' }));
      await waitForSignals();
      const sessionId = store.sessionId();

      const edited = collectionSettings({ name: 'app', locales: ['en', 'fr'], baseLocale: 'fr' });
      store.updateSettings(edited);

      expect(store.sessionId()).toBe(sessionId + 1);
      expect(store.baseLocale()).toBe('fr');
    });
  });
});
