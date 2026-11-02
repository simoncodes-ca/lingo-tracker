import type { ImportPlanDto } from '@simoncodes-ca/data-transfer';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportPreview } from './import-preview';

const plan: ImportPlanDto = {
  collection: 'main',
  strategy: 'translation-service',
  files: [],
  totals: { entries: 0, imported: 0, created: 0, updated: 0, skipped: 0, failed: 0, changed: 0 },
  statusTransitions: [],
  icuAutoFixes: [],
  issues: [],
  warnings: [],
  errors: [],
  largeFiles: [],
  truncated: { issues: 0, icuAutoFixes: 0, warnings: 0, errors: 0 },
};
afterEach(() => vi.useRealTimers());

describe('ImportPreview', () => {
  it('debounces the initial request and edits, marks stale immediately and cancels old dry runs', () => {
    vi.useFakeTimers();
    const changes = new Subject<void>();
    const cancelled = vi.fn();
    const result = new Subject<ImportPlanDto>();
    const dryRun = vi.fn(
      () =>
        new Observable<ImportPlanDto>((subscriber) => {
          const subscription = result.subscribe(subscriber);
          return () => {
            cancelled();
            subscription.unsubscribe();
          };
        }),
    );
    const preview = new ImportPreview({
      failureMessage: () => 'Preview failed',
      request: () => ({ collection: 'main', files: [{ path: 'in/fr.xliff', locale: 'fr' }] }),
      dryRun,
    });
    const sub = preview.connect(changes);
    expect(preview.stale()).toBe(true);
    vi.advanceTimersByTime(299);
    expect(dryRun).not.toHaveBeenCalled();
    changes.next();
    vi.advanceTimersByTime(300);
    expect(dryRun).toHaveBeenCalledTimes(1);
    expect(preview.status()).toBe('loading');
    changes.next();
    vi.advanceTimersByTime(300);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(dryRun).toHaveBeenCalledTimes(2);
    result.next(plan);
    expect(preview.plan()).toEqual(plan);
    expect(preview.stale()).toBe(false);
    changes.next();
    expect(preview.stale()).toBe(true);
    sub.unsubscribe();
    expect(cancelled).toHaveBeenCalledTimes(2);
  });

  it('keeps the preview stale when an older response arrives during the next edit debounce', () => {
    vi.useFakeTimers();
    const changes = new Subject<void>();
    const old = new Subject<ImportPlanDto>();
    const dryRun = vi.fn().mockReturnValueOnce(old).mockReturnValue(of(plan));
    const preview = new ImportPreview({
      failureMessage: () => 'Preview failed',
      request: () => ({ collection: 'main', files: [{ path: 'in/fr.xliff', locale: 'fr' }] }),
      dryRun,
    });
    const sub = preview.connect(changes);
    vi.advanceTimersByTime(300);
    changes.next();
    old.next(plan);
    expect(preview.stale()).toBe(true);
    expect(preview.plan()).toBeUndefined();
    vi.advanceTimersByTime(300);
    expect(preview.stale()).toBe(false);
    expect(preview.plan()).toEqual(plan);
    sub.unsubscribe();
  });

  it('retains the last plan on failure, exposes the error and recovers on the next edit', () => {
    vi.useFakeTimers();
    const changes = new Subject<void>();
    const dryRun = vi
      .fn()
      .mockReturnValueOnce(of(plan))
      .mockReturnValueOnce(throwError(() => new Error('Folder blocked')))
      .mockReturnValue(of(plan));
    const preview = new ImportPreview({
      failureMessage: () => 'Preview failed',
      request: () => ({ collection: 'main', files: [{ path: 'in/fr.xliff', locale: 'fr' }] }),
      dryRun,
    });
    const sub = preview.connect(changes);
    vi.advanceTimersByTime(300);
    changes.next();
    vi.advanceTimersByTime(300);
    expect(preview.plan()).toEqual(plan);
    expect(preview.status()).toBe('error');
    expect(preview.error()).toBe('Folder blocked');
    expect(preview.stale()).toBe(false);
    changes.next();
    vi.advanceTimersByTime(300);
    expect(preview.error()).toBeUndefined();
    expect(preview.status()).toBe('ready');
    sub.unsubscribe();
  });

  it('uses the injected fallback when a dry run fails without a readable message', () => {
    vi.useFakeTimers();
    const failureMessage = vi.fn(() => 'The preview could not be checked');
    const preview = new ImportPreview({
      request: () => ({ collection: 'main', files: [{ path: 'in/fr.xliff', locale: 'fr' }] }),
      dryRun: () => throwError(() => undefined),
      failureMessage,
    });
    const subscription = preview.connect(new Subject());
    vi.advanceTimersByTime(300);
    expect(failureMessage).toHaveBeenCalledOnce();
    expect(preview.error()).toBe('The preview could not be checked');
    expect(preview.status()).toBe('error');
    expect(preview.stale()).toBe(false);
    subscription.unsubscribe();
  });

  it('refreshes the current request after a failure without form edits', () => {
    vi.useFakeTimers();
    const request = { collection: 'main', files: [{ path: 'in/fr.xliff', locale: 'fr' }] };
    const dryRun = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('blocked')))
      .mockReturnValue(of(plan));
    const preview = new ImportPreview({ request: () => request, dryRun, failureMessage: () => 'Preview failed' });
    const sub = preview.connect(new Subject());
    vi.advanceTimersByTime(300);
    expect(preview.status()).toBe('error');
    preview.refresh();
    expect(preview.stale()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(dryRun).toHaveBeenLastCalledWith(request);
    expect(preview.status()).toBe('ready');
    expect(preview.plan()).toEqual(plan);
    expect(preview.error()).toBeUndefined();
    sub.unsubscribe();
  });

  it('waits without an API request when the form cannot produce a request', () => {
    vi.useFakeTimers();
    const dryRun = vi.fn();
    const preview = new ImportPreview({ failureMessage: () => 'Preview failed', request: () => undefined, dryRun });
    const sub = preview.connect(new Subject());
    vi.advanceTimersByTime(300);
    expect(preview.status()).toBe('waiting');
    expect(preview.stale()).toBe(false);
    expect(dryRun).not.toHaveBeenCalled();
    sub.unsubscribe();
  });
});
