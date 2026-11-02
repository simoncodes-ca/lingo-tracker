import { catchError, defaultIfEmpty, defer, EMPTY, from, map, type Observable, of, switchMap, tap } from 'rxjs';
import { captureSession, type SessionCheck, withinSession } from './session-guard';
import { type Refusal, refused } from './write-refusal';

interface WriteStore {
  sessionId: () => number;
  isReadOnly: () => boolean;
  selectedCollection: () => string | null;
}

export interface WriteContext<Result> {
  readonly collection: string;
  readonly inSession: SessionCheck;
  respond<Response>(
    request: Observable<Response>,
    apply: (response: Response) => Result,
    rollback?: () => void,
  ): Observable<Result | Refusal>;
}

/** Cold guards, session validity and refusal handling shared by browser outcome writes. */
export function writeRun<Result, Outcome>(
  store: WriteStore,
  request: (context: WriteContext<Result>) => Observable<Result | Refusal>,
  decide: (result: Result | Refusal) => Outcome,
): Observable<Outcome> {
  return defer(() => {
    if (store.isReadOnly()) return of({ kind: 'read-only' } as const);
    const collection = store.selectedCollection();
    if (!collection) return of({ kind: 'no-collection' } as const);
    const inSession = captureSession(store);
    return request({
      collection,
      inSession,
      respond: (response$, apply, rollback) =>
        defer(() => {
          // withinSession drops stale responses/errors; the empty sentinel maps those quiet endings to stale-session.
          let completed = false;
          return response$.pipe(
            tap({
              complete: () => {
                completed = true;
              },
            }),
            withinSession(inSession),
            map((response) => apply(response)),
            catchError((error: unknown) => {
              rollback?.();
              return of({ ...refused(error), cause: error });
            }),
            defaultIfEmpty(null),
            switchMap((result) =>
              result === null ? (completed ? EMPTY : of({ kind: 'stale-session' } as const)) : of(result),
            ),
          );
        }),
    });
  }).pipe(map((result) => decide(result)));
}

/** Confirmation shares the run's session; the eventual write rechecks its collection guards. */
export function confirmThenWrite<Result>(
  inSession: SessionCheck,
  confirm: (inSession: SessionCheck) => Promise<boolean>,
  then: () => Observable<Result>,
): Observable<Result | { kind: 'stale-session' } | { kind: 'cancelled' }> {
  return from(confirm(inSession)).pipe(
    switchMap((yes) => {
      if (!inSession()) return of({ kind: 'stale-session' } as const);
      return yes ? then() : of({ kind: 'cancelled' } as const);
    }),
  );
}

/** Editor writes keep their raw response/error contract, while cache effects stay in session. */
export function editorWrite<Response>(
  store: Pick<WriteStore, 'sessionId'>,
  request: () => Observable<Response>,
  apply: (response: Response) => void,
): Observable<Response> {
  return defer(() => {
    const inSession = captureSession(store);
    return request().pipe(
      tap((response) => {
        if (inSession()) apply(response);
      }),
    );
  });
}
