import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { EMPTY, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { injectConfirm } from './confirm';

describe('confirm', () => {
  const translate = vi.fn(
    (token: string, params?: Record<string, string | number>) =>
      `${token} translated${params ? ` ${JSON.stringify(params)}` : ''}`,
  );
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: TranslocoService, useValue: { translate } }] });
  });
  it.each([true, false, undefined])('resolves only explicit true for %s', async (answer) => {
    const open = vi.fn().mockReturnValue({ afterClosed: () => of(answer) });
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
    const confirm = TestBed.runInInjectionContext(() => injectConfirm());
    const spec = { title: 'Title', message: 'Message', actionType: 'destructive' as const };

    await expect(confirm(spec, { width: '400px' })).resolves.toBe(answer === true);
    expect(open).toHaveBeenCalledWith(expect.any(Function), {
      data: { title: 'Title translated', message: 'Message translated', actionType: 'destructive' },
      width: '400px',
    });
  });

  it('keeps a stale session from opening the dialog', async () => {
    const open = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
    const confirm = TestBed.runInInjectionContext(() => injectConfirm());
    await expect(confirm({ title: 'Title', message: 'Message' }, { canOpen: () => false })).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('passes the close lock through to the dialog', async () => {
    const open = vi.fn().mockReturnValue({ afterClosed: () => of(true) });
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
    const confirm = TestBed.runInInjectionContext(() => injectConfirm());
    const spec = { title: 'Title', message: 'Message' };

    await expect(confirm(spec, { width: '440px', disableClose: true })).resolves.toBe(true);
    expect(open.mock.calls[0][1]).toEqual({
      data: { title: 'Title translated', message: 'Message translated' },
      width: '440px',
      disableClose: true,
    });
  });

  it('resolves false when afterClosed completes without an answer', async () => {
    const open = vi.fn().mockReturnValue({ afterClosed: () => EMPTY });
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
    const confirm = TestBed.runInInjectionContext(() => injectConfirm());

    await expect(confirm({ title: 'Title', message: 'Message' })).resolves.toBe(false);
  });
  it('translates every text field with its own parameters, including parameter tokens', async () => {
    const open = vi.fn().mockReturnValue({ afterClosed: () => of(true) });
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
    const confirm = TestBed.runInInjectionContext(() => injectConfirm());

    await confirm({
      title: { token: 'title', params: { count: 2 } },
      message: { token: 'message', params: { name: 'folder', dest: { token: 'root' } } },
      confirmButtonText: { token: 'confirm', params: { count: 2 } },
      cancelButtonText: 'cancel',
      actionType: 'standard',
    });

    expect(open.mock.calls[0][1]).toEqual({
      data: {
        title: 'title translated {"count":2}',
        message: 'message translated {"name":"folder","dest":"root translated"}',
        confirmButtonText: 'confirm translated {"count":2}',
        cancelButtonText: 'cancel translated',
        actionType: 'standard',
      },
    });
  });

  it('checks the guard after lazy loading when the session changes during the ask', async () => {
    const open = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
    const confirm = TestBed.runInInjectionContext(() => injectConfirm());
    let current = true;
    const answer = confirm({ title: 'Title', message: 'Message' }, { canOpen: () => current });
    current = false;

    await expect(answer).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
