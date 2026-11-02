import { signal } from '@angular/core';
import { EMPTY, firstValueFrom, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api-error/api-error';
import type { Refusal } from './write-refusal';
import { confirmThenWrite, writeRun } from './write-run';

type Written = { kind: 'written' };
type WriteResult = Written | Refusal;
const decide = (result: WriteResult | { kind: 'cancelled' }) => result;

describe('Write Run', () => {
  const store = {
    sessionId: signal(1),
    isReadOnly: signal(false),
    selectedCollection: signal<string | null>('collection'),
  };
  const apply = vi.fn(() => ({ kind: 'written' }) as const);
  const rollback = vi.fn();
  const request = vi.fn(() => of('response'));
  const run = () =>
    writeRun<Written, WriteResult>(
      store,
      ({ collection, respond }) => {
        expect(collection).toBe('collection');
        return respond(request(), apply, rollback);
      },
      (result) => result,
    );

  beforeEach(() => {
    store.sessionId.set(1);
    store.isReadOnly.set(false);
    store.selectedCollection.set('collection');
    vi.clearAllMocks();
    request.mockReturnValue(of('response'));
  });

  it('refuses read-only writes before looking for a collection or requesting', async () => {
    store.isReadOnly.set(true);
    store.selectedCollection.set(null);
    await expect(firstValueFrom(run())).resolves.toEqual({ kind: 'read-only' });
    expect(request).not.toHaveBeenCalled();
  });

  it('refuses writes without a collection before requesting', async () => {
    store.selectedCollection.set(null);
    await expect(firstValueFrom(run())).resolves.toEqual({ kind: 'no-collection' });
    expect(request).not.toHaveBeenCalled();
  });

  it('starts on subscription and applies a successful response', async () => {
    const outcome = run();
    expect(request).not.toHaveBeenCalled();
    await expect(firstValueFrom(outcome)).resolves.toEqual({ kind: 'written' });
    expect(apply).toHaveBeenCalledWith('response');
    expect(rollback).not.toHaveBeenCalled();
  });

  it('returns stale-session without applying a response after the session closes', async () => {
    const response = new Subject<string>();
    request.mockReturnValue(response);
    const outcome = firstValueFrom(run());
    store.sessionId.set(2);
    response.next('response');
    await expect(outcome).resolves.toEqual({ kind: 'stale-session' });
    expect(apply).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('returns stale-session for a synchronous response when the captured session is already closed', async () => {
    request.mockImplementation(() => {
      store.sessionId.set(2);
      return of('response');
    });
    await expect(firstValueFrom(run())).resolves.toEqual({ kind: 'stale-session' });
    expect(apply).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('returns stale-session for a synchronous error when the captured session is already closed', async () => {
    request.mockImplementation(() => {
      store.sessionId.set(2);
      return throwError(() => new Error('failed'));
    });
    await expect(firstValueFrom(run())).resolves.toEqual({ kind: 'stale-session' });
    expect(apply).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('normalizes an in-session error and rolls back', async () => {
    request.mockReturnValue(throwError(() => new Error('failed')));
    const outcome = await firstValueFrom(run());
    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') {
      expect(outcome.error).toBeInstanceOf(ApiError);
      expect(outcome.error.message).toBe('failed');
    }
    expect(rollback).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  it('returns stale-session without rollback for an error after the session closes', async () => {
    const response = new Subject<string>();
    request.mockReturnValue(response);
    const outcome = firstValueFrom(run());
    store.sessionId.set(2);
    response.error(new Error('failed'));
    await expect(outcome).resolves.toEqual({ kind: 'stale-session' });
    expect(rollback).not.toHaveBeenCalled();
  });

  it('preserves an API refusal and passes the original error to the outcome decision', async () => {
    const error = new ApiError({ kind: 'conflict', status: 409, serverMessage: 'taken' });
    const decide = vi.fn((result: WriteResult) => result);
    const outcome = await firstValueFrom(
      writeRun<Written, WriteResult>(
        store,
        ({ respond }) =>
          respond(
            throwError(() => error),
            apply,
          ),
        decide,
      ),
    );
    expect(outcome).toEqual({ kind: 'refused', error, cause: error });
    expect(decide).toHaveBeenCalledWith({ kind: 'refused', error, cause: error });
  });

  it('decides guards and write results before emitting the public outcome', async () => {
    const decideOutcome = vi.fn((result: WriteResult) => ({ outcome: result.kind }));
    const execute = () =>
      writeRun<Written, { outcome: string }>(store, ({ respond }) => respond(request(), apply), decideOutcome);
    store.isReadOnly.set(true);
    await expect(firstValueFrom(execute())).resolves.toEqual({ outcome: 'read-only' });
    store.isReadOnly.set(false);
    store.selectedCollection.set(null);
    await expect(firstValueFrom(execute())).resolves.toEqual({ outcome: 'no-collection' });
    store.selectedCollection.set('collection');
    await expect(firstValueFrom(execute())).resolves.toEqual({ outcome: 'written' });
    request.mockReturnValue(throwError(() => new Error('failed')));
    await expect(firstValueFrom(execute())).resolves.toEqual({ outcome: 'refused' });
    request.mockImplementation(() => {
      store.sessionId.set(2);
      return of('response');
    });
    await expect(firstValueFrom(execute())).resolves.toEqual({ outcome: 'stale-session' });
    expect(decideOutcome).toHaveBeenCalledTimes(5);
  });

  it('keeps an empty in-session request empty', () => {
    request.mockReturnValue(EMPTY);
    const next = vi.fn();
    const complete = vi.fn();
    run().subscribe({ next, complete });
    expect(next).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('keeps an empty response empty even after its session closes', () => {
    const response = new Subject<string>();
    request.mockReturnValue(response);
    const next = vi.fn();
    const complete = vi.fn();
    run().subscribe({ next, complete });
    store.sessionId.set(2);
    response.complete();
    expect(next).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('confirms in the captured session and runs the eventual write', async () => {
    const confirm = vi.fn(async (inSession: () => boolean) => inSession());
    const outcome = writeRun<Written | { kind: 'cancelled' }, WriteResult | { kind: 'cancelled' }>(
      store,
      ({ inSession }) => confirmThenWrite(inSession, confirm, run),
      decide,
    );
    await expect(firstValueFrom(outcome)).resolves.toEqual({ kind: 'written' });
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('returns cancelled without writing when confirmation is declined', async () => {
    const outcome = writeRun<Written | { kind: 'cancelled' }, WriteResult | { kind: 'cancelled' }>(
      store,
      ({ inSession }) => confirmThenWrite(inSession, async () => false, run),
      decide,
    );
    await expect(firstValueFrom(outcome)).resolves.toEqual({ kind: 'cancelled' });
    expect(request).not.toHaveBeenCalled();
  });

  it('returns stale-session without writing when the session closes during confirmation', async () => {
    const outcome = writeRun<Written | { kind: 'cancelled' }, WriteResult | { kind: 'cancelled' }>(
      store,
      ({ inSession }) =>
        confirmThenWrite(
          inSession,
          async () => {
            store.sessionId.set(2);
            return true;
          },
          run,
        ),
      decide,
    );
    await expect(firstValueFrom(outcome)).resolves.toEqual({ kind: 'stale-session' });
    expect(request).not.toHaveBeenCalled();
  });
});
