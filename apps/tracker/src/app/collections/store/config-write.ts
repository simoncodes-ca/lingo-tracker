import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { patchState, type WritableStateSource } from '@ngrx/signals';
import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { catchError, type Observable, of, switchMap, tap } from 'rxjs';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { ApiError, apiErrorMessage } from '../../shared/api-error/api-error';
import { CollectionsApiService } from '../services/collections-api.service';

/** The store state a Config Write lands in. */
export interface ConfigWriteState {
  config: LingoTrackerConfigDto | null;
  /** Message of a failed config load; a successful reload clears it, as the config is fresh again. */
  error: string | null;
}

/** One Config Write: see {@link injectConfigWrite}. */
export type ConfigWrite = (write: Observable<unknown>) => Observable<LingoTrackerConfigDto | null>;

/** The part of a refused Config Write a form needs to render. */
export interface ConfigRefusal {
  kind: 'conflict' | 'invalid' | 'other';
  /** API details survive every refusal kind; a caller decides which ones to show. */
  details: readonly unknown[];
  error: unknown;
}

export function classifyConfigRefusal(error: unknown): ConfigRefusal {
  if (error instanceof ApiError) {
    if (error.kind === 'conflict') return { kind: 'conflict', details: error.details, error };
    if (error.kind === 'invalid') return { kind: 'invalid', details: error.details, error };
    return { kind: 'other', details: error.details, error };
  }
  return { kind: 'other', details: [], error };
}

/** The store's `error` for a config load that failed: the server's message, else the localized fallback. */
export function configLoadError(error: unknown, transloco: TranslocoService): string {
  return apiErrorMessage(error, transloco.translate(TRACKER_TOKENS.COLLECTIONS.TOAST.LOADFAILED));
}

/**
 * Config Write: one write to `.lingo-tracker.json` through the API, then the config as it
 * now is. Every collection, bundle and global-config mutation of `CollectionsStore` is one
 * of these, so a caller learns the outcome the same way for all of them.
 *
 * - The write is accepted: the Observable resolves once the store holds the reloaded config,
 *   with that config. If the reload itself fails, the write still happened, so it resolves
 *   with `null` and the store reports the failed load in `error`, as a failed initial load
 *   does; `config` keeps what it held.
 * - The write is refused: the Observable errors with its `ApiError` (a `conflict` for a
 *   taken name, an `invalid` whose `details` carry the rule messages, anything else), and
 *   the store is untouched.
 *
 * The Observable is cold: nothing is sent until the caller subscribes, and the caller owns
 * the reaction — a dialog that stays open on a refusal, a toast on success.
 *
 * Call in an injection context (a store's `withMethods` factory); it returns the function
 * that runs each write.
 */
export function injectConfigWrite(store: WritableStateSource<ConfigWriteState>): ConfigWrite {
  const api = inject(CollectionsApiService);
  const transloco = inject(TranslocoService);

  return (write) =>
    write.pipe(
      switchMap(() =>
        api.getConfig().pipe(
          tap((config) => patchState(store, { config, error: null })),
          catchError((error: unknown) => {
            patchState(store, { error: configLoadError(error, transloco) });
            return of(null);
          }),
        ),
      ),
    );
}
