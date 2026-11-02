import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { type Observable, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { toApiError } from '../../shared/api-error/api-error';
import { detailsElseMessage, FormSubmitAttempt, type FormSubmitAttemptConfig } from './form-submit-attempt';

const rejection = (status: number, body: object) =>
  throwError(() => toApiError(new HttpErrorResponse({ status, error: body })));

function harness(
  overrides: Partial<FormSubmitAttemptConfig<{ name: string }>> = {},
  write: () => Observable<unknown> = () => of(null),
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const form = new FormGroup({
    name: new FormControl('draft', { nonNullable: true, validators: [Validators.required] }),
  });
  const dialog = { disableClose: false as boolean | undefined, close: vi.fn() };
  const prepare = vi.fn(() => ({ name: form.controls.name.value }));
  const attempt = new FormSubmitAttempt<{ name: string }>({
    nameControl: () => form.controls.name,
    fallbackTokens: { create: 'create-failed', update: 'update-failed' },
    env: { translate: (token) => token, destroyRef: TestBed.inject(DestroyRef), confirm: async () => true },
    entry: { mode: 'create' },
    prepare,
    ...overrides,
  });
  form.controls.name.addValidators(attempt.nameValidator);
  const submit = () => attempt.submit({ dialog, write: { create: write, update: write } });
  return { attempt, form, dialog, prepare, submit };
}

describe('FormSubmitAttempt', () => {
  it('check records the attempt and marks every field touched only when invalid', () => {
    const { attempt, form } = harness();
    expect(attempt.check(form)).toBe(true);
    expect(attempt.attempted()).toBe(true);
    expect(form.touched).toBe(false);

    form.controls.name.setValue('');
    expect(attempt.check(form)).toBe(false);
    expect(form.controls.name.touched).toBe(true);
  });

  it('lets a pending form through by default but aborts it when `accepts` requires valid', () => {
    const lenient = harness();
    const strict = harness({ accepts: (form) => form.valid });
    for (const { form } of [lenient, strict]) {
      form.controls.name.setAsyncValidators(() => new Subject<null>());
      form.controls.name.updateValueAndValidity();
      expect(form.pending).toBe(true);
    }
    expect(lenient.attempt.check(lenient.form)).toBe(true);
    expect(lenient.form.touched).toBe(false);
    expect(strict.attempt.check(strict.form)).toBe(false);
    expect(strict.form.controls.name.touched).toBe(true);
  });

  it('reveals errors after touch by default, and also after edit or attempt when configured', () => {
    const touchedOnly = harness();
    const eager = harness({ reveal: 'touched-dirty-attempted' });
    for (const { form } of [touchedOnly, eager]) {
      form.controls.name.setValue('');
      form.controls.name.markAsPristine();
    }
    expect(touchedOnly.attempt.showError(touchedOnly.form.controls.name)).toBe(false);
    expect(eager.attempt.showError(eager.form.controls.name)).toBe(false);

    eager.form.controls.name.markAsDirty();
    expect(eager.attempt.showError(eager.form.controls.name, 'required')).toBe(true);
    expect(eager.attempt.showError(eager.form.controls.name, 'other')).toBe(false);

    eager.form.controls.name.markAsPristine();
    eager.attempt.check(eager.form);
    eager.form.controls.name.markAsUntouched();
    expect(eager.attempt.reveals(eager.form.controls.name)).toBe(true);

    touchedOnly.attempt.check(touchedOnly.form);
    touchedOnly.form.controls.name.markAsUntouched();
    expect(touchedOnly.attempt.reveals(touchedOnly.form.controls.name)).toBe(false);
    touchedOnly.form.controls.name.markAsTouched();
    expect(touchedOnly.attempt.showError(touchedOnly.form.controls.name)).toBe(true);
  });

  it('keeps messages as a list until the next edit clears them', () => {
    const { attempt, form } = harness();
    const subscription = attempt.clearOnEdit(form);
    attempt.fail(['a', 'b']);
    expect(attempt.errors()).toEqual(['a', 'b']);
    form.controls.name.setValue('next');
    expect(attempt.errors()).toEqual([]);

    subscription.unsubscribe();
    attempt.fail(['kept']);
    form.controls.name.setValue('again');
    expect(attempt.errors()).toEqual(['kept']);
  });

  it('writes the prepared result and closes the dialog', async () => {
    const { attempt, dialog, submit } = harness();
    await submit();
    expect(dialog.close).toHaveBeenCalledWith({ name: 'draft' });
    expect(attempt.errors()).toEqual([]);
  });

  it('does not write when prepare aborts', async () => {
    const write = vi.fn(() => of(null));
    const { attempt, dialog, submit } = harness({ prepare: () => undefined }, write);
    await submit();
    expect(write).not.toHaveBeenCalled();
    expect(dialog.close).not.toHaveBeenCalled();
    expect(attempt.saving()).toBe(false);
  });

  it('lists the refusal message by default and leaves the dialog open', async () => {
    const { attempt, dialog, submit } = harness({}, () => rejection(400, { message: 'bad', errors: ['rule'] }));
    await submit();
    expect(attempt.errors()).toEqual(['bad']);
    expect(attempt.saving()).toBe(false);
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('maps a refusal with the form mapping', async () => {
    const { attempt, submit } = harness({ refusalMessages: detailsElseMessage }, () =>
      rejection(400, { message: 'bad', errors: ['rule one', 'rule two'] }),
    );
    await submit();
    expect(attempt.errors()).toEqual(['rule one', 'rule two']);
  });

  it('detailsElseMessage falls back to the message when no detail is a string', () => {
    expect(detailsElseMessage({ kind: 'message', message: 'm', details: [{ index: 1 }] })).toEqual(['m']);
  });

  it('runs the name-conflict hook, marks the name taken and lists no message', async () => {
    const onNameConflict = vi.fn();
    const { attempt, form, submit } = harness({ onNameConflict }, () => rejection(409, { message: 'taken' }));
    await submit();
    expect(onNameConflict).toHaveBeenCalledOnce();
    expect(form.controls.name.hasError('nameExists')).toBe(true);
    expect(attempt.errors()).toEqual([]);
  });
});
