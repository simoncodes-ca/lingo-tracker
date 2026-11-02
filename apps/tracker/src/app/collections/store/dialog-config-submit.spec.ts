import { HttpErrorResponse } from '@angular/common/http';
import { createEnvironmentInjector, DestroyRef, EnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { Observable, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { fakeDialog, fakeEnv } from '../../../testing/form-submit-env';
import { toApiError } from '../../shared/api-error/api-error';
import { NamedEntrySubmit, submitDialogConfigWrite, submitDialogJob } from './dialog-config-submit';

function setup(entry: { mode: 'create' | 'edit'; name?: string } = { mode: 'create' }) {
  const env = fakeEnv();
  const name = new FormControl('new-name', { nonNullable: true });
  const lifecycle = new NamedEntrySubmit<{ name: string }>({
    nameControl: () => name,
    fallbackTokens: { create: 'create-failed', update: 'update-failed' },
    env,
  });
  name.addValidators(lifecycle.nameValidator);
  const dialog = fakeDialog<{ name: string }>();
  const validate = vi.fn(() => true);
  const result = vi.fn(() => ({ name: name.value }));
  const create = vi.fn((_result: { name: string }): Observable<unknown> => of(null));
  const update = vi.fn(
    (_name: string, _patch: { name: string | undefined }, _result: { name: string }): Observable<unknown> => of(null),
  );
  const onRefusal = vi.fn();
  const prepare = vi.fn(() => (validate() ? result() : undefined));
  const options = { entry, dialog, prepare, write: { create, update }, onRefusal };
  return { env, name, lifecycle, options, validate, result, submit: () => lifecycle.submit(options) };
}

function refusal(status: number, message?: string, details?: unknown[]) {
  return throwError(() => toApiError(new HttpErrorResponse({ status, error: { message, errors: details } })));
}

describe('Dialog Config Submit lifecycle', () => {
  it('stops at failed validation without confirming, building a payload or writing', async () => {
    const { lifecycle, options, validate, result } = setup();
    validate.mockReturnValue(false);
    const confirm = vi.fn(async () => true);
    await lifecycle.submit({
      ...options,
      prepare: async () => {
        if (!validate()) return undefined;
        return (await confirm()) ? result() : undefined;
      },
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(result).not.toHaveBeenCalled();
    expect(options.write.create).not.toHaveBeenCalled();
    expect(options.dialog.disableClose).toBe(false);
    expect(lifecycle.saving()).toBe(false);
  });

  it('stops on declined confirmation and permits the next attempt', async () => {
    const { lifecycle, options, submit } = setup();
    await lifecycle.submit({ ...options, prepare: async () => undefined });
    expect(options.write.create).not.toHaveBeenCalled();
    expect(options.dialog.close).not.toHaveBeenCalled();
    expect(lifecycle.saving()).toBe(false);
    await submit();
    expect(options.write.create).toHaveBeenCalledOnce();
  });

  it('waits for accepted confirmation, then builds the current payload and creates', async () => {
    const { lifecycle, options, name, result } = setup();
    let answer: (value: boolean) => void = () => undefined;
    const pending = new Promise<boolean>((resolve) => {
      answer = resolve;
    });
    const attempt = lifecycle.submit({ ...options, prepare: async () => ((await pending) ? result() : undefined) });
    expect(options.write.create).not.toHaveBeenCalled();
    expect(options.dialog.disableClose).toBe(false);
    name.setValue('after-confirmation');
    answer(true);
    await attempt;
    expect(options.write.create).toHaveBeenCalledWith({ name: 'after-confirmation' });
    expect(options.dialog.close).toHaveBeenCalledWith({ name: 'after-confirmation' });
  });

  it('locks closing and saving during create and closes only on success', async () => {
    const { lifecycle, options, submit } = setup();
    const write = new Subject<unknown>();
    options.write.create.mockReturnValue(write);
    await submit();
    expect(lifecycle.saving()).toBe(true);
    expect(options.dialog.disableClose).toBe(true);
    expect(options.dialog.close).not.toHaveBeenCalled();
    expect(options.write.update).not.toHaveBeenCalled();
    write.next(null);
    expect(options.dialog.close).toHaveBeenCalledWith({ name: 'new-name' });
  });

  it.each(['new-name', 'old-name'])('updates with the rename patch for %s', async (newName) => {
    const { name, options, submit } = setup({ mode: 'edit', name: 'old-name' });
    name.setValue(newName);
    await submit();
    expect(options.write.create).not.toHaveBeenCalled();
    expect(options.write.update).toHaveBeenCalledWith(
      'old-name',
      { name: newName === 'old-name' ? undefined : newName },
      { name: newName },
    );
    expect(options.dialog.close).toHaveBeenCalledWith({ name: newName });
  });

  it('routes an editable-name conflict to the name validator and releases the write lock', async () => {
    const { lifecycle, name, options, submit } = setup();
    options.write.create.mockReturnValue(refusal(409, 'taken'));
    await submit();
    expect(name.hasError('nameExists')).toBe(true);
    expect(name.touched).toBe(true);
    expect(options.onRefusal).toHaveBeenCalledWith({ kind: 'name-conflict' });
    expect(options.dialog.close).not.toHaveBeenCalled();
    expect(options.dialog.disableClose).toBe(false);
    expect(lifecycle.saving()).toBe(false);
    name.setValue('available');
    expect(name.hasError('nameExists')).toBe(false);
  });

  it('routes a locked-name conflict to the form message', async () => {
    const { name, options, submit } = setup({ mode: 'edit', name: 'old-name' });
    name.disable();
    options.write.update.mockReturnValue(refusal(409, 'taken'));
    await submit();
    expect(options.onRefusal).toHaveBeenCalledWith({ kind: 'message', message: 'taken', details: [] });
  });

  it('preserves other refusal details and the previous close lock', async () => {
    const { lifecycle, options, submit } = setup();
    options.dialog.disableClose = true;
    options.write.create.mockReturnValue(refusal(400, 'invalid', ['rule']));
    await submit();
    expect(options.onRefusal).toHaveBeenCalledWith({ kind: 'message', message: 'invalid', details: ['rule'] });
    expect(options.dialog.disableClose).toBe(true);
    expect(lifecycle.saving()).toBe(false);
  });

  it.each(['create', 'edit'] as const)('translates the %s fallback for a refusal without a message', async (mode) => {
    const { options, submit } = setup({ mode, name: mode === 'edit' ? 'old-name' : undefined });
    options.write.create.mockReturnValue(refusal(500));
    options.write.update.mockReturnValue(refusal(500));
    await submit();
    expect(options.onRefusal).toHaveBeenCalledWith({
      kind: 'message',
      message: mode === 'create' ? 'create-failed' : 'update-failed',
      details: [],
    });
  });

  it('ignores double submit during confirmation and the subsequent write', async () => {
    const { lifecycle, options, submit } = setup();
    let answer: (value: boolean) => void = () => undefined;
    const confirm = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    options.write.create.mockReturnValue(new Subject());
    const prepare = vi.fn(async () => ((await confirm()) ? options.prepare() : undefined));
    const attempt = lifecycle.submit({ ...options, prepare });
    await lifecycle.submit({ ...options, prepare });
    expect(confirm).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    answer(true);
    await attempt;
    await submit();
    expect(options.write.create).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('cancels on destroy mid-write and ignores subsequent outcomes and attempts', async () => {
    const { lifecycle, options, env, submit } = setup();
    const write = new Subject<unknown>();
    const cancelled = vi.fn();
    options.write.create.mockReturnValue(
      new Observable((subscriber) => {
        const subscription = write.subscribe(subscriber);
        return () => {
          subscription.unsubscribe();
          cancelled();
        };
      }),
    );
    await submit();
    env.destroy();
    expect(cancelled).toHaveBeenCalledOnce();
    write.next(null);
    write.error(new Error('late'));
    await submit();
    expect(options.dialog.close).not.toHaveBeenCalled();
    expect(options.onRefusal).not.toHaveBeenCalled();
    expect(options.write.create).toHaveBeenCalledOnce();
    expect(lifecycle.saving()).toBe(true);
  });

  it('does not write if destroyed while awaiting confirmation', async () => {
    const { lifecycle, options, env } = setup();
    let answer: (value: boolean) => void = () => undefined;
    const attempt = lifecycle.submit({
      ...options,
      prepare: async () => {
        const confirmed = await new Promise<boolean>((resolve) => {
          answer = resolve;
        });
        return confirmed ? options.prepare() : undefined;
      },
    });
    env.destroy();
    answer(true);
    await attempt;
    expect(options.write.create).not.toHaveBeenCalled();
  });
});

describe('dialog Config Write submit', () => {
  it('locks closing and saving until success, then closes with the result', () => {
    const write = new Subject<unknown>();
    const saving = signal(false);
    const dialogRef = { disableClose: false as boolean | undefined, close: vi.fn() };
    const onRefusal = vi.fn();
    TestBed.configureTestingModule({});
    const destroyRef = TestBed.inject(DestroyRef);

    submitDialogConfigWrite({ dialogRef, write, saving, result: 'saved', destroyRef, onRefusal });
    expect(saving()).toBe(true);
    expect(dialogRef.disableClose).toBe(true);
    expect(write.observed).toBe(true);
    write.next(null);
    expect(dialogRef.close).toHaveBeenCalledWith('saved');
    expect(onRefusal).not.toHaveBeenCalled();
  });

  it('restores the previous close lock and saving state on refusal', () => {
    const write = new Subject<unknown>();
    const saving = signal(false);
    const dialogRef = { disableClose: undefined as boolean | undefined, close: vi.fn() };
    const onRefusal = vi.fn();
    TestBed.configureTestingModule({});
    const destroyRef = TestBed.inject(DestroyRef);

    submitDialogConfigWrite({ dialogRef, write, saving, result: 'saved', destroyRef, onRefusal });
    write.error(toApiError(new HttpErrorResponse({ status: 409 })));
    expect(saving()).toBe(false);
    expect(dialogRef.disableClose).toBeUndefined();
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(onRefusal).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict' }));
  });

  it('restores a pre-existing true close lock on refusal', () => {
    const write = new Subject<unknown>();
    const saving = signal(false);
    const dialogRef = { disableClose: true as boolean | undefined, close: vi.fn() };
    TestBed.configureTestingModule({});

    submitDialogConfigWrite({
      dialogRef,
      write,
      saving,
      result: 'saved',
      destroyRef: TestBed.inject(DestroyRef),
      onRefusal: vi.fn(),
    });
    write.error(new Error('refused'));
    expect(dialogRef.disableClose).toBe(true);
    expect(saving()).toBe(false);
  });

  it('unsubscribes on dialog destruction and leaves the close lock as it was mid-write', () => {
    const write = new Subject<unknown>();
    const saving = signal(false);
    const dialogRef = { disableClose: false as boolean | undefined, close: vi.fn() };
    const onRefusal = vi.fn();
    TestBed.configureTestingModule({});
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

    submitDialogConfigWrite({
      dialogRef,
      write,
      saving,
      result: 'saved',
      destroyRef: injector.get(DestroyRef),
      onRefusal,
    });
    expect(write.observed).toBe(true);
    injector.destroy();
    expect(write.observed).toBe(false);
    expect(dialogRef.disableClose).toBe(true);
    expect(saving()).toBe(true);
    write.next(null);
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(onRefusal).not.toHaveBeenCalled();
  });
});

describe('dialog job submit', () => {
  it.each(['success', 'failure', 'empty', 'destroy'] as const)('holds the close lock until %s', (outcome) => {
    const env = fakeEnv();
    const dialog = fakeDialog<{ jobId: string }>();
    const pending = new Subject<{ jobId: string }>();
    submitDialogJob({ dialogRef: dialog, start: pending, destroyRef: env.destroyRef });
    expect(dialog.disableClose).toBe(true);
    if (outcome === 'success') {
      pending.next({ jobId: 'j' });
      pending.complete();
      expect(dialog.close).toHaveBeenCalledWith({ jobId: 'j' });
    } else {
      if (outcome === 'failure') pending.error(new Error('failed'));
      if (outcome === 'empty') pending.complete();
      if (outcome === 'destroy') env.destroy();
      pending.next({ jobId: 'late' });
      expect(dialog.close).not.toHaveBeenCalled();
    }
    expect(dialog.disableClose).toBe(false);
    expect(pending.observed).toBe(false);
  });
});
