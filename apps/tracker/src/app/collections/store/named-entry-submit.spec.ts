import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { toApiError } from '../../shared/api-error/api-error';
import { NamedEntrySubmit } from './dialog-config-submit';

const rejection = (status: number, body: object) =>
  throwError(() => toApiError(new HttpErrorResponse({ status, error: body })));

function harness(existingName: string | undefined = undefined, normalizeName?: (value: unknown) => string) {
  TestBed.configureTestingModule({});
  const nameControl = new FormControl('draft', { nonNullable: true });
  const create = vi.fn(() => of(null));
  const update = vi.fn((_name: string, _patch: { name: string | undefined }) => of(null));
  const onRefusal = vi.fn();
  const dialogRef = { disableClose: false as boolean | undefined, close: vi.fn() };
  const submit = new NamedEntrySubmit<{ name: string }>({
    nameControl: () => nameControl,
    normalizeName,
    fallbackTokens: { create: 'create-failed', update: 'update-failed' },
    env: { translate: (token) => token, destroyRef: TestBed.inject(DestroyRef), confirm: async () => true },
  });
  const saving = submit.saving;
  nameControl.addValidators(submit.nameValidator);
  nameControl.updateValueAndValidity();
  const options = {
    dialog: dialogRef,
    entry: { mode: existingName === undefined ? ('create' as const) : ('edit' as const), name: existingName },
    write: { create, update },
    prepare: () => ({ name: 'draft' }),
    onRefusal,
  };
  return { submit, options, nameControl, create, update, onRefusal, dialogRef, saving };
}

describe('named entry submit', () => {
  it('creates and closes with the accepted result', () => {
    const { submit, options, create, update, dialogRef } = harness();
    submit.submit(options);
    expect(create).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalledWith({ name: 'draft' });
  });

  it('updates under the existing name and omits an unchanged rename', () => {
    const { submit, options, create, update } = harness('draft');
    submit.submit(options);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('draft', { name: undefined }, { name: 'draft' });
  });

  it('sends a changed name in the update patch', () => {
    const { submit, options, update } = harness('original');
    submit.submit(options);
    expect(update).toHaveBeenCalledWith('original', { name: 'draft' }, { name: 'draft' });
  });

  it('keeps a refused editable name invalid until it changes', () => {
    const { submit, options, nameControl, create, onRefusal, dialogRef, saving } = harness();
    create.mockReturnValue(rejection(409, { message: 'Name taken' }));
    submit.submit(options);
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(saving()).toBe(false);
    expect(nameControl.hasError('nameExists')).toBe(true);
    expect(nameControl.touched).toBe(true);
    expect(onRefusal).toHaveBeenCalledWith({ kind: 'name-conflict' });
    nameControl.setValue('other');
    expect(nameControl.hasError('nameExists')).toBe(false);
  });

  it('reports a locked-name conflict as a message with details', () => {
    const { submit, options, nameControl, update, onRefusal } = harness('draft');
    nameControl.disable();
    update.mockReturnValue(rejection(409, { message: 'Name taken', errors: ['detail'] }));
    submit.submit(options);
    expect(onRefusal).toHaveBeenCalledWith({ kind: 'message', message: 'Name taken', details: ['detail'] });
  });

  it('uses the create fallback token when the server gives no message', () => {
    const { submit, options, create, onRefusal } = harness();
    create.mockReturnValue(rejection(500, {}));
    submit.submit(options);
    expect(onRefusal).toHaveBeenCalledWith({ kind: 'message', message: 'create-failed', details: [] });
  });

  it('uses the update fallback token when the server gives no message', () => {
    const { submit, options, update, onRefusal } = harness('draft');
    update.mockReturnValue(rejection(500, {}));
    submit.submit(options);
    expect(onRefusal).toHaveBeenCalledWith({ kind: 'message', message: 'update-failed', details: [] });
  });

  it('keeps a padded refused name invalid after editing to the same trimmed value', () => {
    const { submit, options, nameControl, create } = harness(undefined, (value) => String(value ?? '').trim());
    options.prepare = () => ({ name: 'name' });
    nameControl.setValue('  name  ');
    create.mockReturnValue(rejection(409, { message: 'Name taken' }));
    submit.submit(options);
    expect(nameControl.hasError('nameExists')).toBe(true);
    nameControl.setValue('name');
    expect(nameControl.hasError('nameExists')).toBe(true);
    nameControl.setValue('other');
    expect(nameControl.hasError('nameExists')).toBe(false);
  });
});
