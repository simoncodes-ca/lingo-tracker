import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { toApiError } from '../../shared/api-error/api-error';
import { JobStartAttempt } from './form-submit-attempt-job';

describe('JobStartAttempt', () => {
  const setupJob = () => new JobStartAttempt<{ collection: string }>(() => 'start-failed');

  it('starts lazily with a nameless request, suppresses duplicate starts and clears saving on cancellation', () => {
    const attempt = setupJob();
    const pending = new Subject<{ jobId: string }>();
    const start = vi.fn(() => pending);
    const prepare = vi.fn(() => ({ collection: 'main' }));
    const result = attempt.start(prepare, start);
    expect(prepare).not.toHaveBeenCalled();
    attempt.state.fail(['old']);
    const subscription = result.subscribe();
    expect(start).toHaveBeenCalledWith({ collection: 'main' });
    expect(attempt.state.errors()).toEqual([]);
    expect(attempt.saving()).toBe(true);
    result.subscribe();
    expect(start).toHaveBeenCalledOnce();
    subscription.unsubscribe();
    expect(attempt.saving()).toBe(false);
  });

  it('aborts preparation without starting or clearing the previous refusal', () => {
    const attempt = setupJob();
    const start = vi.fn(() => of({ jobId: 'j' }));
    attempt.state.fail(['kept']);
    attempt.start(() => undefined, start).subscribe();
    expect(start).not.toHaveBeenCalled();
    expect(attempt.state.errors()).toEqual(['kept']);
    expect(attempt.saving()).toBe(false);
  });

  it('emits accepted jobs and clears saving on completion', () => {
    const attempt = setupJob();
    const next = vi.fn();
    attempt
      .start(
        () => ({ collection: 'main' }),
        () => of({ jobId: 'j' }),
      )
      .subscribe(next);
    expect(next).toHaveBeenCalledWith({ jobId: 'j' });
    expect(attempt.saving()).toBe(false);
  });

  it('keeps only string details and rethrows the original job refusal', () => {
    const attempt = setupJob();
    const error = toApiError(
      new HttpErrorResponse({ status: 400, error: { message: 'bad', errors: ['rule', { index: 1 }] } }),
    );
    const rejected = vi.fn();
    attempt
      .start(
        () => ({ collection: 'main' }),
        () => throwError(() => error),
      )
      .subscribe({ error: rejected });
    expect(attempt.state.errors()).toEqual(['rule']);
    expect(rejected).toHaveBeenCalledWith(error);
    expect(attempt.saving()).toBe(false);
  });

  it.each([
    { error: new Error('unexpected'), message: 'unexpected' },
    { error: { reason: 'unknown' }, message: 'start-failed' },
  ])('catches synchronous start failures (%j)', ({ error, message }) => {
    const attempt = setupJob();
    const rejected = vi.fn();
    attempt
      .start(
        () => ({ collection: 'main' }),
        () => {
          throw error;
        },
      )
      .subscribe({ error: rejected });
    expect(attempt.state.errors()).toEqual([message]);
    expect(rejected).toHaveBeenCalledWith(error);
    expect(attempt.saving()).toBe(false);
  });
});
