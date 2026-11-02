import { Injectable, InjectionToken, inject } from '@angular/core';
import type { CacheStatusDto } from '@simoncodes-ca/data-transfer';
import {
  catchError,
  concat,
  concatMap,
  defer,
  interval,
  map,
  type Observable,
  of,
  repeat,
  startWith,
  switchMap,
  takeUntil,
  takeWhile,
  throwError,
  timer,
} from 'rxjs';

export interface IndexWaitPolicy {
  intervalMs: number;
  maxPolls?: number;
}

export interface IndexWaitPolicies {
  overlay: IndexWaitPolicy;
  treeRead: { intervalMs: number; deadlineMs: number };
}

export const INDEX_WAIT_POLICY = new InjectionToken<IndexWaitPolicies>('Index wait policy', {
  providedIn: 'root',
  factory: () => ({ overlay: { intervalMs: 2000 }, treeRead: { intervalMs: 1000, deadlineMs: 5000 } }),
});

export const INDEX_NOT_READY_MESSAGE = 'Collection index is not ready.';

export class CollectionIndexNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionIndexNotReadyError';
  }
}

/** Owns cancellable index waits. Tree deadline completion permits one final tree read. */
@Injectable({ providedIn: 'root' })
export class IndexReadiness {
  readonly #policy = inject(INDEX_WAIT_POLICY);

  whenReady(
    poll: () => Observable<CacheStatusDto>,
    purpose: keyof IndexWaitPolicies = 'overlay',
    notReadyMessage = INDEX_NOT_READY_MESSAGE,
  ): Observable<CacheStatusDto> {
    return defer(() => {
      const overlay = this.#policy.overlay;
      const treeRead = this.#policy.treeRead;
      const statuses =
        purpose === 'treeRead'
          ? defer(poll).pipe(
              repeat({ delay: treeRead.intervalMs }),
              takeUntil(timer(treeRead.deadlineMs)),
              catchError((error: unknown) =>
                throwError(
                  () => new CollectionIndexNotReadyError(error instanceof Error ? error.message : notReadyMessage),
                ),
              ),
            )
          : interval(overlay.intervalMs).pipe(
              map((count) => count + 1),
              startWith(0),
              switchMap((count) =>
                overlay.maxPolls !== undefined && count >= overlay.maxPolls
                  ? throwError(() => new CollectionIndexNotReadyError(notReadyMessage))
                  : poll(),
              ),
            );
      return statuses.pipe(
        concatMap((status) => {
          if (purpose !== 'treeRead' || status.status !== 'error') return of(status);
          // An index error fails a waiting tree read immediately instead of retrying for 5s.
          return concat(
            of(status),
            throwError(() => new CollectionIndexNotReadyError(status.error || notReadyMessage)),
          );
        }),
        takeWhile(
          (status) =>
            purpose === 'treeRead'
              ? status.status !== 'ready'
              : status.status === 'indexing' || status.status === 'not-started',
          true,
        ),
      );
    });
  }
}
