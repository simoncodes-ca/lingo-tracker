import { Injectable, inject } from '@angular/core';
import type { SearchResultDto } from '@simoncodes-ca/data-transfer';
import { catchError, concat, distinctUntilChanged, EMPTY, map, type Observable, of, switchMap, timer } from 'rxjs';
import { hasSearchLength } from '../../shared/search/search-minimum';
import { BrowserStore } from '../store/browser.store';
import { captureSession, withinSession } from '../store/session-guard';
import { BrowserApiService } from './browser-api.service';

/** How many similar values the context column ever pins. */
export const SIMILAR_DISPLAY_LIMIT = 10;

export type SimilarSuggestion =
  | { kind: 'clear'; searching: boolean }
  | { kind: 'loading' }
  | { kind: 'ready'; results: SearchResultDto[] };

/** The browser's similar-value lookup for the translation editor. */
@Injectable({ providedIn: 'root' })
export class SimilarValues {
  readonly #api = inject(BrowserApiService);
  readonly #store = inject(BrowserStore);

  /** Clears hits on each new value and searches only a settled, eligible value. */
  suggestions(
    values: Observable<string>,
    collectionName: string,
    originalValue?: string,
    ownFullKey?: string,
  ): Observable<SimilarSuggestion> {
    return values.pipe(
      distinctUntilChanged(),
      switchMap((value) => {
        const eligible = hasSearchLength(value.trim()) && value !== originalValue;
        const clear: SimilarSuggestion = { kind: 'clear', searching: eligible };
        if (!eligible) return of(clear);
        const isCurrent = captureSession(this.#store);
        return concat(
          of(clear),
          timer(300).pipe(
            map(() => value),
            switchMap((query) =>
              isCurrent()
                ? concat(
                    of({ kind: 'loading' } as const),
                    this.#api.searchTranslations(collectionName, query, SIMILAR_DISPLAY_LIMIT + 1, 'similar').pipe(
                      withinSession(isCurrent),
                      map(
                        (response): SimilarSuggestion => ({
                          kind: 'ready',
                          results: response.results
                            .filter((result) => result.fullKey !== ownFullKey)
                            .slice(0, SIMILAR_DISPLAY_LIMIT),
                        }),
                      ),
                      catchError(() => of({ kind: 'ready', results: [] } as SimilarSuggestion)),
                    ),
                  )
                : EMPTY,
            ),
          ),
        );
      }),
    );
  }
}
