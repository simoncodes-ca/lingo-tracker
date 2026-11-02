import { type MonoTypeOperatorFunction, Observable } from 'rxjs';

/** True while the Browser Session that was open when it was captured is still the open one. */
export type SessionCheck = () => boolean;

/**
 * Captures the open Browser Session when a request starts. Every `openCollection` bumps
 * `sessionId`, so a response to a request sent under an earlier session (another collection,
 * or an earlier open of the same one) fails the check and must not touch the store.
 */
export function captureSession(store: { sessionId: () => number }): SessionCheck {
  const sessionId = store.sessionId();
  return () => store.sessionId() === sessionId;
}

/**
 * Lets a response through only while its session is still open. Once another collection has
 * been opened, a value is dropped and an error completes quietly, so nothing downstream runs:
 * no state write, no rollback, no toast, no follow-up navigation. Pipe it straight after the
 * API call, before the operators that write.
 */
export function withinSession<T>(isCurrent: SessionCheck): MonoTypeOperatorFunction<T> {
  return (source) =>
    new Observable<T>((subscriber) =>
      source.subscribe({
        next: (value) => {
          if (isCurrent()) subscriber.next(value);
          else subscriber.complete();
        },
        error: (error: unknown) => {
          if (isCurrent()) subscriber.error(error);
          else subscriber.complete();
        },
        complete: () => subscriber.complete(),
      }),
    );
}
