import { signal } from '@angular/core';
import { catchError, defer, EMPTY, finalize, type Observable, throwError } from 'rxjs';
import { ApiError, apiErrorMessage } from '../../shared/api-error/api-error';
import { detailsElseMessage } from './form-submit-attempt';
import { FormAttemptState } from './form-submit-attempt-state';

/** Lazy job acceptance with shared attempt state; field validation stays with the form. */
export class JobStartAttempt<TResult> {
  readonly state = new FormAttemptState();
  readonly #saving = signal(false);
  readonly saving = this.#saving.asReadonly();

  constructor(private readonly failureMessage: () => string) {}

  /** A lazy job start: preserve cancellation, rethrow failures and clear saving on finalization. */
  start<TJob>(prepare: () => TResult | undefined, start: (result: TResult) => Observable<TJob>): Observable<TJob> {
    return defer(() => {
      if (this.saving()) return EMPTY;
      const result = prepare();
      if (result === undefined) return EMPTY;
      this.#saving.set(true);
      this.state.clear();
      return defer(() => start(result)).pipe(
        catchError((error: unknown) => {
          this.state.fail(
            detailsElseMessage({
              kind: 'message',
              message: apiErrorMessage(error, this.failureMessage()),
              details: error instanceof ApiError ? error.details : [],
            }),
          );
          return throwError(() => error);
        }),
        finalize(() => this.#saving.set(false)),
      );
    });
  }
}
