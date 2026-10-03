import { computed, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withComputed, withMethods, withState } from '@ngrx/signals';
import type { FolderNodeDto, ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { splitResolvedKey } from '@simoncodes-ca/domain';
import { catchError, defer, finalize, from, map, type Observable, of, switchMap, tap } from 'rxjs';
import { BrowserApiService } from '../../services/browser-api.service';
import { extractFolderNameFromPath } from '../../utils/folder-path.utils';
import {
  cancelFolderDraft,
  dismissFolderDraftError,
  type FolderDraft,
  initialFolderDraft,
  settleFolderDraft,
  startFolderDraft,
} from '../folder-draft';
import { folderDrop } from '../folder-drop';
import { planFolderMove, planFolderMoveRollback } from '../folder-move-plan';
import {
  findFolderInTree,
  insertFolderIntoTree,
  parentFolderPath,
  prunePathsUnder,
  removeFolderFromTree,
} from '../folder-tree.utils';
import {
  type CreateFolderOutcome,
  type CreateFolderResult,
  type DeleteFolderOutcome,
  type DeleteFolderResult,
  decideCreateFolder,
  decideDeleteFolder,
  decideMoveFolder,
  decideMoveResource,
  type MoveFolderOutcome,
  type MoveFolderResult,
  type MoveResourceOutcome,
  type MoveResourceResult,
  type RequestedFolderDeleteOutcome,
  type RequestedFolderMoveOutcome,
} from '../folder-write-feedback';
import { captureSession } from '../session-guard';
import { refused } from '../write-refusal';

export interface FolderWritesState extends FolderDraft {
  newlyCreatedFolderPath: string | null;
  isDeletingFolder: boolean;
  deletingFolderPath: string | null;
  movesInFlight: number;
}

export const initialFolderWritesState: FolderWritesState = {
  ...initialFolderDraft,
  newlyCreatedFolderPath: null,
  isDeletingFolder: false,
  deletingFolderPath: null,
  movesInFlight: 0,
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
      state: type<{
        sessionId: number;
        selectedCollection: string | null;
        isReadOnly: boolean;
        currentFolderPath: string;
        translations: ResourceSummaryDto[];
        loadedFolderPath: string | null;
        rootFolders: FolderNodeDto[];
        expandedFolders: ReadonlySet<string>;
      }>(),
      methods: type<{
        showFolder(path: string): void;
        reloadList(): void;
        loadRootFolders(): void;
        loadFolderChildren(path: string): void;
      }>(),
    },
    withState(initialFolderWritesState),
    withComputed(({ movesInFlight }) => ({
      isMoving: computed(() => movesInFlight() > 0),
    })),
    withMethods((store) => {
      const api = inject(BrowserApiService);

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

      function moveFolderResult({
        sourceFolderPath,
        destinationFolderPath,
      }: {
        sourceFolderPath: string;
        destinationFolderPath: string;
      }): Observable<MoveFolderResult> {
        return defer(() => {
          if (store.isReadOnly()) return of({ kind: 'read-only' } as const);
          const collection = store.selectedCollection();
          if (!collection) return of({ kind: 'no-collection' } as const);
          const decision = folderDrop({ type: 'folder', path: sourceFolderPath }, destinationFolderPath, false);
          if (decision.noOp === 'same-folder' || decision.noOp === 'already-at-location')
            return of({ kind: 'noop', reason: decision.noOp } as const);
          if (!decision.canLand) return of({ kind: 'invalid-drop' } as const);
          const inSession = captureSession(store);
          const sourceNode = findFolderInTree(store.rootFolders(), sourceFolderPath);
          const folderName = extractFolderNameFromPath(sourceFolderPath);
          // A concurrent tree load can replace the optimistic tree while the request is pending.
          const optimisticTree = removeFolderFromTree(store.rootFolders(), sourceFolderPath);
          patchState(store, { rootFolders: optimisticTree });
          return moving(
            api.moveFolder(collection, sourceFolderPath, destinationFolderPath).pipe(
              map((): MoveFolderResult => {
                if (!inSession()) return { kind: 'stale-session' };
                const plan = planFolderMove(
                  { tree: store.rootFolders(), expanded: store.expandedFolders(), sourceNode },
                  sourceFolderPath,
                  destinationFolderPath,
                );
                if (plan.kind === 'patch-tree') {
                  patchState(store, { rootFolders: plan.tree });
                  if (plan.loadChildrenFor) store.loadFolderChildren(plan.loadChildrenFor);
                } else store.loadRootFolders();
                patchState(store, { expandedFolders: plan.expanded });
                store.showFolder(plan.showPath);
                return { kind: 'moved', folderName, destinationFolderPath };
              }),
              catchError((error: unknown) => {
                if (inSession()) {
                  const tree = planFolderMoveRollback(store.rootFolders(), sourceFolderPath, sourceNode);
                  if (tree) patchState(store, { rootFolders: tree });
                }
                return of(inSession() ? refused(error) : ({ kind: 'stale-session' } as const));
              }),
            ),
            inSession,
          );
        });
      }

      function moveFolder(move: { sourceFolderPath: string; destinationFolderPath: string }) {
        return moveFolderResult(move).pipe(map(decideMoveFolder));
      }

      function createFolderResult(folderName: string, parentPath: string | null): Observable<CreateFolderResult> {
        return defer(() => {
          if (store.isReadOnly()) return of({ kind: 'read-only' } as const);
          const collection = store.selectedCollection();
          if (!collection) return of({ kind: 'no-collection' } as const);
          const inSession = captureSession(store);
          return api.createFolder(collection, folderName, parentPath || undefined).pipe(
            map((response): CreateFolderResult => {
              if (!inSession()) return { kind: 'stale-session' };
              patchState(store, {
                rootFolders: insertFolderIntoTree(store.rootFolders(), response.folder, parentPath),
                newlyCreatedFolderPath: response.folder.fullPath,
              });
              setTimeout(() => {
                if (inSession() && store.newlyCreatedFolderPath() === response.folder.fullPath) {
                  patchState(store, { newlyCreatedFolderPath: null });
                }
              }, 3000);
              return {
                kind: 'created',
                folder: response.folder,
                created: response.created,
              };
            }),
            catchError((error: unknown) => of(inSession() ? refused(error) : ({ kind: 'stale-session' } as const))),
          );
        });
      }

      function deleteFolderResult(folderPath: string): Observable<DeleteFolderResult> {
        return defer(() => {
          if (store.isReadOnly()) return of({ kind: 'read-only' } as const);
          const collection = store.selectedCollection();
          if (!collection) return of({ kind: 'no-collection' } as const);
          const inSession = captureSession(store);
          patchState(store, {
            isDeletingFolder: true,
            deletingFolderPath: folderPath,
          });
          return api.deleteFolder(collection, folderPath).pipe(
            map((response): DeleteFolderResult => {
              if (!inSession()) return { kind: 'stale-session' };
              patchState(store, {
                isDeletingFolder: false,
                deletingFolderPath: null,
              });
              if (response.deleted) {
                patchState(store, {
                  rootFolders: removeFolderFromTree(store.rootFolders(), folderPath),
                  expandedFolders: prunePathsUnder(store.expandedFolders(), folderPath),
                });
                const shown = store.currentFolderPath();
                if (shown === folderPath || shown.startsWith(`${folderPath}.`)) {
                  store.showFolder(parentFolderPath(folderPath) ?? '');
                }
              }
              return { kind: 'deleted', deleted: response.deleted };
            }),
            catchError((error: unknown) => {
              if (inSession())
                patchState(store, {
                  isDeletingFolder: false,
                  deletingFolderPath: null,
                });
              return of(inSession() ? refused(error) : ({ kind: 'stale-session' } as const));
            }),
          );
        });
      }

      /** Runs the confirmation in the session the request began in; a closed session ends it as stale. */
      function confirmed<T>(
        confirm: (inSession: () => boolean) => Promise<boolean>,
        then: () => Observable<T>,
      ): Observable<T | { kind: 'stale-session' } | { kind: 'cancelled' }> {
        const inSession = captureSession(store);
        return from(confirm(inSession)).pipe(
          switchMap((yes) => {
            if (!inSession()) return of({ kind: 'stale-session' } as const);
            if (!yes) return of({ kind: 'cancelled' } as const);
            return then();
          }),
        );
      }

      return {
        startAddingFolder(parentPath: string | null): void {
          if (!store.isReadOnly()) {
            patchState(store, (state) => startFolderDraft(state, parentPath));
          }
        },
        cancelAddingFolder(): void {
          patchState(store, cancelFolderDraft);
        },
        /** Retires a create refusal, once the user edits the refused name. */
        dismissFolderCreateError(): void {
          patchState(store, dismissFolderDraftError);
        },
        /** Creates a folder with no effect on the add-folder draft (the picker keeps its own). */
        createFolder(folderName: string, parentPath: string | null): Observable<CreateFolderOutcome> {
          return createFolderResult(folderName, parentPath).pipe(map(decideCreateFolder));
        },
        /**
         * Creates a folder from the add-folder draft. The draft closes when the create ends
         * (created, read-only, no collection). A refusal keeps it open and stays in
         * `folderCreateError`, shown under the input so the name can be corrected. A create that
         * outlived its session, or whose draft was cancelled or replaced meanwhile, leaves the
         * draft state alone (the folder itself is still created and shown in the tree).
         */
        confirmFolderDraft(folderName: string, parentPath: string | null): Observable<CreateFolderOutcome> {
          return defer(() => {
            const draftId = store.folderDraftId();
            return createFolderResult(folderName, parentPath).pipe(
              map(decideCreateFolder),
              tap((outcome) => {
                patchState(store, (state) => settleFolderDraft(state, draftId, outcome));
              }),
            );
          });
        },
        deleteFolder(folderPath: string): Observable<DeleteFolderOutcome> {
          return deleteFolderResult(folderPath).pipe(map(decideDeleteFolder));
        },
        /** Deletes a folder once `confirm` says yes; `confirm` is given the session guard to check before it opens. */
        requestFolderDelete(
          folderPath: string,
          confirm: (inSession: () => boolean) => Promise<boolean>,
        ): Observable<RequestedFolderDeleteOutcome> {
          return defer(() => {
            if (store.isReadOnly()) return of({ kind: 'read-only', feedback: null } as const);
            if (!store.selectedCollection()) return of({ kind: 'no-collection', feedback: null } as const);
            return confirmed(confirm, () => deleteFolderResult(folderPath)).pipe(
              map((result) =>
                result.kind === 'cancelled' ? { ...result, feedback: null } : decideDeleteFolder(result),
              ),
            );
          });
        },
        moveFolder,
        requestFolderMove(
          move: { sourceFolderPath: string; destinationFolderPath: string },
          confirm: (inSession: () => boolean) => Promise<boolean>,
        ): Observable<RequestedFolderMoveOutcome> {
          return defer(() => {
            if (store.isReadOnly()) return of({ kind: 'read-only', feedback: null } as const);
            if (!store.selectedCollection()) return of({ kind: 'no-collection', feedback: null } as const);
            const decision = folderDrop(
              { type: 'folder', path: move.sourceFolderPath },
              move.destinationFolderPath,
              false,
            );
            if (decision.noOp || !decision.canLand) return moveFolder(move);
            return confirmed(confirm, () => moveFolderResult(move)).pipe(
              map((result) => (result.kind === 'cancelled' ? { ...result, feedback: null } : decideMoveFolder(result))),
            );
          });
        },
        moveResource({
          sourceKey,
          destinationFolderPath,
        }: {
          sourceKey: string;
          destinationFolderPath: string;
        }): Observable<MoveResourceOutcome> {
          return defer((): Observable<MoveResourceResult> => {
            if (store.isReadOnly()) return of({ kind: 'read-only' } as const);
            const collection = store.selectedCollection();
            if (!collection) return of({ kind: 'no-collection' } as const);
            const { folderPath, entryKey } = splitResolvedKey(sourceKey);
            if (
              folderDrop(
                { type: 'resource', key: sourceKey, folderPath: folderPath.join('.') },
                destinationFolderPath,
                false,
              ).noOp === 'already-in-folder'
            )
              return of({ kind: 'noop', reason: 'already-in-folder' } as const);
            const inSession = captureSession(store);
            const movedRow = store.translations().find((row) => row.fullKey === sourceKey);
            const rowsFolder = store.loadedFolderPath();
            patchState(store, {
              translations: store.translations().filter((row) => row.fullKey !== sourceKey),
            });
            const destinationKey = destinationFolderPath ? `${destinationFolderPath}.${entryKey}` : entryKey;
            return moving(
              api.moveResource(collection, sourceKey, destinationKey).pipe(
                map((): MoveResourceResult => {
                  if (!inSession()) return { kind: 'stale-session' };
                  store.loadRootFolders();
                  store.reloadList();
                  return { kind: 'moved', entryKey, destinationFolderPath };
                }),
                catchError((error: unknown) => {
                  if (inSession()) {
                    const rows = store.translations();
                    if (
                      movedRow &&
                      store.loadedFolderPath() === rowsFolder &&
                      !rows.some((row) => row.fullKey === sourceKey)
                    ) {
                      patchState(store, { translations: [...rows, movedRow] });
                    }
                  }
                  return of(inSession() ? refused(error) : ({ kind: 'stale-session' } as const));
                }),
              ),
              inSession,
            );
          }).pipe(map(decideMoveResource));
        },
      };
    }),
  );
}
