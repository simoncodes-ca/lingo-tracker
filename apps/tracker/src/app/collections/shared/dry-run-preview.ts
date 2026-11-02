import { signal } from '@angular/core';
import {
  catchError,
  debounceTime,
  map,
  merge,
  type Observable,
  of,
  Subject,
  type Subscription,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { apiErrorMessage } from '../../shared/api-error/api-error';

export interface DryRunPreviewOptions<Request, Plan> {
  request: () => Request | undefined;
  failureMessage: () => string;
  dryRun: (request: Request) => Observable<Plan>;
}

/** The caller owns the subscription, including cancellation when the dialog closes. */
export class DryRunPreview<Request, Plan> {
  readonly plan = signal<Plan | undefined>(undefined);
  readonly stale = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly status = signal<'waiting' | 'loading' | 'ready' | 'error'>('waiting');

  readonly #refresh = new Subject<void>();

  constructor(private readonly options: DryRunPreviewOptions<Request, Plan>) {}

  /** Run the dry run again for the current form, e.g. after a failed one. */
  refresh(): void {
    this.#refresh.next();
  }

  connect(changes: Observable<unknown>): Subscription {
    let revision = 0;
    return merge(changes, this.#refresh)
      .pipe(
        startWith(null),
        tap(() => {
          revision += 1;
          this.stale.set(true);
        }),
        debounceTime(300),
        map(() => ({ request: this.options.request(), version: revision })),
        switchMap(({ request, version }) => {
          this.error.set(undefined);
          if (!request) return of({ version, status: 'waiting' as const, plan: undefined, error: undefined });
          this.status.set('loading');
          return this.options.dryRun(request).pipe(
            map((plan) => ({ version, status: 'ready' as const, plan, error: undefined })),
            catchError((error: unknown) =>
              of({
                version,
                status: 'error' as const,
                plan: undefined,
                error: apiErrorMessage(error, this.options.failureMessage()),
              }),
            ),
          );
        }),
      )
      .subscribe(({ version, status, plan, error }) => {
        // An older response can arrive during the debounce of a newer edit.
        if (version !== revision) return;
        this.status.set(status);
        if (status !== 'error') this.plan.set(plan);
        this.error.set(error);
        this.stale.set(false);
      });
  }
}
