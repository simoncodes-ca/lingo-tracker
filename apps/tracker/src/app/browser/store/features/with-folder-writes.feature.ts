import { computed, DestroyRef, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withComputed, withMethods, withState } from '@ngrx/signals';
import { folderPathFromSegments, folderPathLeaf, resolveResourceKey, splitResolvedKey } from '@simoncodes-ca/domain';
import { defer, finalize, type Observable, of } from 'rxjs';
import { createRestartableDelay } from '../../../shared/timed-transients';
import { BrowserApiService } from '../../services/browser-api.service';
import type { BeginMirrorMove, BrowserWriteResult, MirrorRollback } from '../browser-mirror';
import { type CollectionLifecycleRegistry, withCollectionState } from '../collection-reset';
import { type FolderDraft, FolderDraftSession, initialFolderDraft } from '../folder-draft';
import { folderDrop } from '../folder-drop';
import {
  type CreateFolderOutcome,
  type CreateFolderResult,
  type DeleteFolderOutcome,
  type DeleteFolderResult,
  decideCreateFolder,
  decideDeleteFolder,
  decideMoveFolder,
  decideMoveResource,
  decideRequestedFolderDelete,
  decideRequestedFolderMove,
  type MoveFolderOutcome,
  type MoveFolderResult,
  type MoveResourceOutcome,
  type MoveResourceResult,
  type RequestedFolderDeleteOutcome,
  type RequestedFolderMoveOutcome,
} from '../folder-write-feedback';
import { confirmThenWrite, writeRun } from '../write-run';

export interface FolderWritesState extends FolderDraft {
  newlyCreatedFolderPath: string | null;
  isDeletingFolder: boolean;
  deletingFolderPath: string | null;
  movesInFlight: number;
}

const initialFolderOperationsState: Omit<FolderWritesState, keyof FolderDraft> = {
  newlyCreatedFolderPath: null,
  isDeletingFolder: false,
  deletingFolderPath: null,
  movesInFlight: 0,
};

export const initialFolderWritesState: FolderWritesState = {
  ...initialFolderDraft,
  ...initialFolderOperationsState,
};

export type {
  CreateFolderOutcome,
  DeleteFolderOutcome,
  MoveFolderOutcome,
  MoveResourceOutcome,
  RequestedFolderDeleteOutcome,
  RequestedFolderMoveOutcome,
};

/** All folder mutations, including a resource dropped onto a folder. Calls are cold. */
export function withFolderWritesFeature<_>() {
  return signalStoreFeature(
    {
      props: type<CollectionLifecycleRegistry>(),
      state: type<{
        sessionId: number;
        selectedCollection: string | null;
        isReadOnly: boolean;
      }>(),
      methods: type<{
        mirrorWrite(result: BrowserWriteResult): void;
        beginMirrorMove: BeginMirrorMove;
        rollbackMirrorMove(rollback: MirrorRollback): void;
      }>(),
    },
    withCollectionState(initialFolderOperationsState),
    // Folder Draft Session resets these fields while advancing their identity.
    withState(initialFolderDraft),
    withComputed(({ movesInFlight }) => ({
      isMoving: computed(() => movesInFlight() > 0),
    })),
    withMethods((store) => {
      const api = inject(BrowserApiService);
      const newlyCreatedDelay = createRestartableDelay(3000);
      store._collectionLifecycle.register('reset', () => newlyCreatedDelay.cancel());
      inject(DestroyRef).onDestroy(() => newlyCreatedDelay.destroy());

      function moving<T>(request: Observable<T>, inSession: () => boolean): Observable<T> {
        return defer(() => {
          patchState(store, { movesInFlight: store.movesInFlight() + 1 });
          return request.pipe(
            finalize(() => {
              if (inSession()) patchState(store, { movesInFlight: store.movesInFlight() - 1 });
            }),
          );
        });
      }

      function moveFolderResult<Outcome>(
        { sourceFolderPath, destinationFolderPath }: { sourceFolderPath: string; destinationFolderPath: string },
        decide: (result: MoveFolderResult) => Outcome,
      ): Observable<Outcome> {
        return writeRun<MoveFolderResult, Outcome>(
          store,
          ({ collection, inSession, respond }) => {
            const decision = folderDrop({ type: 'folder', path: sourceFolderPath }, destinationFolderPath, false);
            if (decision.noOp === 'same-folder' || decision.noOp === 'already-at-location')
              return of({ kind: 'noop', reason: decision.noOp } as const);
            if (!decision.canLand) return of({ kind: 'invalid-drop' } as const);
            const rollback = store.beginMirrorMove({ kind: 'folder', path: sourceFolderPath });
            const folderName = folderPathLeaf(sourceFolderPath);
            return moving(
              respond(
                api.moveFolder(collection, sourceFolderPath, destinationFolderPath),
                (): MoveFolderResult => {
                  store.mirrorWrite({
                    kind: 'folder-moved',
                    rollback,
                    destinationPath: destinationFolderPath,
                  });
                  return { kind: 'moved', folderName, destinationFolderPath };
                },
                () => store.rollbackMirrorMove(rollback),
              ),
              inSession,
            );
          },
          decide,
        );
      }

      function moveFolder(move: { sourceFolderPath: string; destinationFolderPath: string }) {
        return moveFolderResult(move, decideMoveFolder);
      }

      function createFolderResult(folderName: string, parentPath: string | null): Observable<CreateFolderOutcome> {
        return writeRun<CreateFolderResult, CreateFolderOutcome>(
          store,
          ({ collection, inSession, respond }) => {
            return respond(
              api.createFolder(collection, folderName, parentPath || undefined),
              (response): CreateFolderResult => {
                store.mirrorWrite({ kind: 'folder-created', folder: response.folder, parentPath });
                patchState(store, {
                  newlyCreatedFolderPath: response.folder.fullPath,
                });
                newlyCreatedDelay.schedule(() => {
                  if (inSession() && store.newlyCreatedFolderPath() === response.folder.fullPath) {
                    patchState(store, { newlyCreatedFolderPath: null });
                  }
                });
                return {
                  kind: 'created',
                  folder: response.folder,
                  created: response.created,
                };
              },
            );
          },
          decideCreateFolder,
        );
      }

      function deleteFolderResult<Outcome>(
        folderPath: string,
        decide: (result: DeleteFolderResult) => Outcome,
      ): Observable<Outcome> {
        return writeRun<DeleteFolderResult, Outcome>(
          store,
          ({ collection, respond }) => {
            patchState(store, {
              isDeletingFolder: true,
              deletingFolderPath: folderPath,
            });
            return respond(
              api.deleteFolder(collection, folderPath),
              (response): DeleteFolderResult => {
                patchState(store, {
                  isDeletingFolder: false,
                  deletingFolderPath: null,
                });
                if (response.deleted) {
                  store.mirrorWrite({ kind: 'folder-removed', path: folderPath });
                }
                return { kind: 'deleted', deleted: response.deleted };
              },
              () => patchState(store, { isDeletingFolder: false, deletingFolderPath: null }),
            );
          },
          decide,
        );
      }

      const draftSession = new FolderDraftSession({
        state: {
          read: () => ({
            isAddingFolder: store.isAddingFolder(),
            addFolderParentPath: store.addFolderParentPath(),
            folderDraftId: store.folderDraftId(),
            folderCreateError: store.folderCreateError(),
          }),
          write: (draft) => patchState(store, draft),
        },
        create: createFolderResult,
        canStart: () => !store.isReadOnly(),
        staleDraft: 'collection-reset',
        // The tree renders a draft's parent open; Browser Mirror expands it after creation.
      });
      store._collectionLifecycle.register('reset', () => draftSession.reset());

      return {
        startAddingFolder(parentPath: string | null): void {
          draftSession.start(parentPath);
        },
        cancelAddingFolder(): void {
          draftSession.cancel();
        },
        /** Retires a create refusal, once the user edits the refused name. */
        dismissFolderCreateError(): void {
          draftSession.edit();
        },
        /** Creates a folder with no effect on the add-folder draft (the picker keeps its own). */
        createFolder(folderName: string, parentPath: string | null): Observable<CreateFolderOutcome> {
          return createFolderResult(folderName, parentPath);
        },
        /** Folder Draft Session settles only the draft that submitted this create. */
        confirmFolderDraft(folderName: string, parentPath: string | null): Observable<CreateFolderOutcome> {
          return draftSession.confirm(folderName, parentPath);
        },
        deleteFolder(folderPath: string): Observable<DeleteFolderOutcome> {
          return deleteFolderResult(folderPath, decideDeleteFolder);
        },
        /** Deletes a folder once `confirm` says yes; `confirm` is given the session guard to check before it opens. */
        requestFolderDelete(
          folderPath: string,
          confirm: (inSession: () => boolean) => Promise<boolean>,
        ): Observable<RequestedFolderDeleteOutcome> {
          return writeRun<DeleteFolderResult | { kind: 'cancelled' }, RequestedFolderDeleteOutcome>(
            store,
            ({ inSession }) =>
              confirmThenWrite(inSession, confirm, () => deleteFolderResult(folderPath, (result) => result)),
            decideRequestedFolderDelete,
          );
        },
        moveFolder,
        requestFolderMove(
          move: { sourceFolderPath: string; destinationFolderPath: string },
          confirm: (inSession: () => boolean) => Promise<boolean>,
        ): Observable<RequestedFolderMoveOutcome> {
          return writeRun<MoveFolderResult | { kind: 'cancelled' }, RequestedFolderMoveOutcome>(
            store,
            ({ inSession }) => {
              const decision = folderDrop(
                { type: 'folder', path: move.sourceFolderPath },
                move.destinationFolderPath,
                false,
              );
              if (decision.noOp || !decision.canLand) return moveFolderResult(move, (result) => result);
              return confirmThenWrite(inSession, confirm, () => moveFolderResult(move, (result) => result));
            },
            decideRequestedFolderMove,
          );
        },
        moveResource({
          sourceKey,
          destinationFolderPath,
        }: {
          sourceKey: string;
          destinationFolderPath: string;
        }): Observable<MoveResourceOutcome> {
          return writeRun<MoveResourceResult, MoveResourceOutcome>(
            store,
            ({ collection, inSession, respond }): Observable<MoveResourceResult> => {
              const { folderPath, entryKey } = splitResolvedKey(sourceKey);
              if (
                folderDrop(
                  { type: 'resource', key: sourceKey, folderPath: folderPathFromSegments(folderPath) },
                  destinationFolderPath,
                  false,
                ).noOp === 'already-in-folder'
              )
                return of({ kind: 'noop', reason: 'already-in-folder' } as const);
              const rollback = store.beginMirrorMove({ kind: 'row', key: sourceKey });
              const destinationKey = resolveResourceKey(entryKey, destinationFolderPath);
              return moving(
                respond(
                  api.moveResource(collection, sourceKey, destinationKey),
                  (): MoveResourceResult => {
                    store.mirrorWrite({ kind: 'entry-moved' });
                    return { kind: 'moved', entryKey, destinationFolderPath };
                  },
                  () => store.rollbackMirrorMove(rollback),
                ),
                inSession,
              );
            },
            decideMoveResource,
          );
        },
      };
    }),
  );
}
