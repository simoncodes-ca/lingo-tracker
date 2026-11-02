import { TestBed } from '@angular/core/testing';
import type { CacheStatusDto } from '@simoncodes-ca/data-transfer';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api-error/api-error';
import { CollectionIndexNotReadyError, INDEX_WAIT_POLICY, IndexReadiness } from './index-readiness';

describe('IndexReadiness', () => {
  const getCacheStatus = vi.fn<() => Observable<CacheStatusDto>>();
  beforeEach(() => {
    vi.useFakeTimers();
    getCacheStatus.mockReset();
    TestBed.configureTestingModule({});
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('emits every status and completes on ready', () => {
    getCacheStatus
      .mockReturnValueOnce(of({ status: 'not-started' }))
      .mockReturnValueOnce(of({ status: 'indexing' }))
      .mockReturnValueOnce(of({ status: 'ready' }));
    const received: CacheStatusDto[] = [];
    const complete = vi.fn();
    TestBed.inject(IndexReadiness)
      .whenReady(getCacheStatus)
      .subscribe({ next: (value) => received.push(value), complete });
    vi.advanceTimersByTime(4000);
    expect(received.map(({ status }) => status)).toEqual(['not-started', 'indexing', 'ready']);
    expect(complete).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10000);
    expect(getCacheStatus).toHaveBeenCalledTimes(3);
    expect(getCacheStatus).toHaveBeenCalledWith();
  });

  it('errors after the configured maximum number of polls', () => {
    TestBed.overrideProvider(INDEX_WAIT_POLICY, { useValue: { overlay: { intervalMs: 100, maxPolls: 2 } } });
    getCacheStatus.mockReturnValue(of({ status: 'indexing' }));
    const error = vi.fn();
    TestBed.inject(IndexReadiness).whenReady(getCacheStatus).subscribe({ error });
    vi.advanceTimersByTime(200);
    expect(getCacheStatus).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0]?.[0]).toBeInstanceOf(CollectionIndexNotReadyError);
  });

  it('passes HTTP ApiError through unchanged', () => {
    const failure = new ApiError({ kind: 'other', status: 500 });
    getCacheStatus.mockReturnValue(throwError(() => failure));
    const error = vi.fn();
    TestBed.inject(IndexReadiness).whenReady(getCacheStatus).subscribe({ error });
    vi.advanceTimersByTime(10000);
    expect(error).toHaveBeenCalledWith(failure);
    expect(getCacheStatus).toHaveBeenCalledOnce();
  });

  it('emits an error index status and completes without throwing for the overlay', () => {
    getCacheStatus.mockReturnValue(of({ status: 'error', error: 'Index failed' }));
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    TestBed.inject(IndexReadiness).whenReady(getCacheStatus).subscribe({ next, error, complete });
    expect(next).toHaveBeenCalledWith({ status: 'error', error: 'Index failed' });
    expect(error).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10000);
    expect(getCacheStatus).toHaveBeenCalledOnce();
  });

  it('stops polling when unsubscribed', () => {
    getCacheStatus.mockReturnValue(of({ status: 'indexing' }));
    const subscription = TestBed.inject(IndexReadiness).whenReady(getCacheStatus).subscribe();
    vi.advanceTimersByTime(0);
    subscription.unsubscribe();
    vi.advanceTimersByTime(10000);
    expect(getCacheStatus).toHaveBeenCalledOnce();
  });

  it('has no maximum number of polls by default', () => {
    getCacheStatus.mockReturnValue(of({ status: 'indexing' }));
    const error = vi.fn();
    const subscription = TestBed.inject(IndexReadiness).whenReady(getCacheStatus).subscribe({ error });
    vi.advanceTimersByTime(200000);
    expect(getCacheStatus).toHaveBeenCalledTimes(101);
    expect(error).not.toHaveBeenCalled();
    expect(TestBed.inject(INDEX_WAIT_POLICY)).toEqual({
      overlay: { intervalMs: 2000 },
      treeRead: { intervalMs: 1000, deadlineMs: 5000 },
    });
    subscription.unsubscribe();
  });
  it('keeps a slow tree-status poll in flight and waits a second after its response', () => {
    const pending = new Subject<CacheStatusDto>();
    const cancelled = vi.fn();
    getCacheStatus
      .mockReturnValueOnce(
        new Observable<CacheStatusDto>((subscriber) => {
          const subscription = pending.subscribe(subscriber);
          return () => {
            cancelled();
            subscription.unsubscribe();
          };
        }),
      )
      .mockReturnValueOnce(of({ status: 'ready' }));
    const complete = vi.fn();
    TestBed.inject(IndexReadiness).whenReady(getCacheStatus, 'treeRead').subscribe({ complete });
    vi.advanceTimersByTime(2500);
    expect(cancelled).not.toHaveBeenCalled();
    expect(getCacheStatus).toHaveBeenCalledOnce();
    pending.next({ status: 'indexing' });
    pending.complete();
    vi.advanceTimersByTime(999);
    expect(getCacheStatus).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(getCacheStatus).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('completes the tree wait at its overall deadline even with a status request pending', () => {
    getCacheStatus.mockReturnValue(new Subject<CacheStatusDto>());
    const complete = vi.fn();
    const error = vi.fn();
    TestBed.inject(IndexReadiness).whenReady(getCacheStatus, 'treeRead').subscribe({ complete, error });
    vi.advanceTimersByTime(4999);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(complete).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(getCacheStatus).toHaveBeenCalledOnce();
  });
});
