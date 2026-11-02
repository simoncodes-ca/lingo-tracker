import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { SearchResultsDto } from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { toApiError } from '../../shared/api-error/api-error';
import { BrowserStore } from '../store/browser.store';
import { BrowserApiService } from './browser-api.service';
import { type SimilarSuggestion, SimilarValues } from './similar-values';

describe('SimilarValues', () => {
  const apiError = () => toApiError(new HttpErrorResponse({ status: 500, error: { message: 'failed' } }));
  let similar: SimilarValues;
  let store: InstanceType<typeof BrowserStore>;
  const searchTranslations = vi.fn();

  beforeEach(() => {
    searchTranslations.mockReset();
    TestBed.configureTestingModule({
      imports: [getTranslocoTestingModule()],
      providers: [{ provide: BrowserApiService, useValue: { searchTranslations } }],
    });
    similar = TestBed.inject(SimilarValues);
    store = TestBed.inject(BrowserStore);
  });

  afterEach(() => vi.useRealTimers());

  it('debounces distinct similar queries, limits results and turns errors into empty results', () => {
    vi.useFakeTimers();
    const values = new Subject<string>();
    const events: SimilarSuggestion[] = [];
    const hit = { fullKey: 'common.ok' };
    const response = {
      query: 'Save',
      results: Array.from({ length: 12 }, () => hit),
      totalFound: 12,
      limited: true,
    } as unknown as SearchResultsDto;
    searchTranslations.mockReturnValueOnce(of(response)).mockReturnValueOnce(throwError(apiError));
    similar.suggestions(values, 'main').subscribe((event) => events.push(event));

    values.next('ab');
    values.next('Save');
    vi.advanceTimersByTime(299);
    expect(searchTranslations).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(searchTranslations).toHaveBeenCalledWith('main', 'Save', 11, 'similar');
    expect(events.at(-1)).toMatchObject({ kind: 'ready', results: expect.arrayContaining([hit]) });
    const last = events.at(-1);
    expect(last?.kind === 'ready' ? last.results : []).toHaveLength(10);

    values.next('Save');
    vi.advanceTimersByTime(300);
    expect(searchTranslations).toHaveBeenCalledTimes(1);
    values.next('Save more');
    vi.advanceTimersByTime(300);
    expect(events.at(-1)).toEqual({ kind: 'ready', results: [] });
  });

  it('does not deliver a suggestion after the Browser Session changes', () => {
    vi.useFakeTimers();
    const values = new Subject<string>();
    const pending = new Subject<SearchResultsDto>();
    searchTranslations.mockReturnValue(pending);
    const events: SimilarSuggestion[] = [];
    similar.suggestions(values, 'main').subscribe((event) => events.push(event));
    values.next('Save');
    vi.advanceTimersByTime(300);
    patchState(unprotected(store), { sessionId: store.sessionId() + 1 });
    pending.next({ query: 'Save', results: [], totalFound: 0, limited: false });
    pending.complete();
    expect(events.at(-1)).toEqual({ kind: 'loading' });
  });

  it('cancels a pending search when the value falls below three characters', () => {
    vi.useFakeTimers();
    const values = new Subject<string>();
    const events: SimilarSuggestion[] = [];
    searchTranslations.mockReturnValue(of({ query: 'Save', results: [], totalFound: 0, limited: false }));
    similar.suggestions(values, 'main').subscribe((event) => events.push(event));
    values.next('Save');
    vi.advanceTimersByTime(200);
    values.next('Sa');
    vi.advanceTimersByTime(300);
    expect(searchTranslations).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ kind: 'clear', searching: false });
  });

  it('searches again when the user returns to a value after another query', () => {
    vi.useFakeTimers();
    const values = new Subject<string>();
    const events: SimilarSuggestion[] = [];
    searchTranslations.mockReturnValue(of({ query: 'Save', results: [], totalFound: 0, limited: false }));
    similar.suggestions(values, 'main').subscribe((event) => events.push(event));
    values.next('Save');
    vi.advanceTimersByTime(300);
    values.next('Sa');
    values.next('Save');
    vi.advanceTimersByTime(300);
    expect(searchTranslations).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toEqual({ kind: 'ready', results: [] });
  });

  it('marks eligible edits as searching throughout the debounce', () => {
    vi.useFakeTimers();
    const values = new Subject<string>();
    const events: SimilarSuggestion[] = [];
    searchTranslations.mockReturnValue(of({ query: 'Saved', results: [], totalFound: 0, limited: false }));
    similar.suggestions(values, 'main').subscribe((event) => events.push(event));
    values.next('Save');
    vi.advanceTimersByTime(300);
    values.next('Saved');
    expect(events.at(-1)).toEqual({ kind: 'clear', searching: true });
    vi.advanceTimersByTime(300);
    expect(events.at(-1)).toEqual({ kind: 'ready', results: [] });
  });
});
