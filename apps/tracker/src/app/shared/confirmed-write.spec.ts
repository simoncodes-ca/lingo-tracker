import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { finalize, of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Feedback } from '../browser/feedback';
import { injectConfirmedWrite } from './confirmed-write';
import { NotificationService } from './notification';

describe('confirmed write', () => {
  const translate = vi.fn((token: string) => `${token} translated`);
  let open: ReturnType<typeof vi.fn>;
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  const spec = { title: 'title', message: { token: 'message', params: { name: 'x' } } };

  const setup = () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslocoService, useValue: { translate } },
        { provide: MatDialog, useValue: { open } },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    return TestBed.runInInjectionContext(() => injectConfirmedWrite());
  };

  beforeEach(() => {
    open = vi.fn().mockReturnValue({ afterClosed: () => of(true) });
    notifications = { success: vi.fn(), error: vi.fn() };
  });

  describe('confirmDestructive', () => {
    it('opens the destructive dialog with the Delete button and the caller width, and answers yes', async () => {
      const confirm = setup().confirmDestructive({ ...spec, cancelButtonText: 'cancel', width: '400px' });

      await expect(confirm()).resolves.toBe(true);
      expect(open).toHaveBeenCalledWith(expect.any(Function), {
        width: '400px',
        data: {
          title: 'title translated',
          message: 'message translated',
          confirmButtonText: 'common.actions.delete translated',
          cancelButtonText: 'cancel translated',
          actionType: 'destructive',
        },
      });
    });

    it('answers no when the user cancels', async () => {
      open.mockReturnValue({ afterClosed: () => of(false) });

      await expect(setup().confirmDestructive(spec)()).resolves.toBe(false);
    });

    it('does not open when the session guard is already closed', async () => {
      await expect(setup().confirmDestructive(spec)(() => false)).resolves.toBe(false);
      expect(open).not.toHaveBeenCalled();
    });

    it('does not open when the surface is destroyed before the dialog loads', async () => {
      const answer = setup().confirmDestructive(spec)(() => true);
      TestBed.resetTestingModule();

      await expect(answer).resolves.toBe(false);
      expect(open).not.toHaveBeenCalled();
    });

    it('answers no when the surface is destroyed before the dialog is answered', async () => {
      const closed = new Subject<boolean>();
      open.mockReturnValue({ afterClosed: () => closed.asObservable() });
      const answer = setup().confirmDestructive(spec)();
      await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
      TestBed.resetTestingModule();
      closed.next(true);
      closed.complete();

      await expect(answer).resolves.toBe(false);
    });
  });

  describe('confirmWrite', () => {
    it('keeps the caller button, action type and an omitted width', async () => {
      const confirm = setup().confirmWrite({ ...spec, confirmButtonText: 'move', actionType: 'standard' });

      await expect(confirm()).resolves.toBe(true);
      expect(open.mock.calls[0][1]).toEqual({
        data: {
          title: 'title translated',
          message: 'message translated',
          confirmButtonText: 'move translated',
          actionType: 'standard',
        },
      });
    });
  });

  describe('runWrite', () => {
    const success: Feedback = { tone: 'success', placement: 'toast', token: 'done' };
    const failure: Feedback = { tone: 'error', placement: 'toast', token: 'failed', detail: 'server said no' };

    it('toasts the decided success feedback', async () => {
      await setup().runWrite(of({ feedback: success }));

      expect(notifications.success).toHaveBeenCalledWith('done translated');
    });

    it('toasts the decided error feedback with the failure detail', async () => {
      await setup().runWrite(of({ feedback: failure }));

      expect(notifications.error).toHaveBeenCalledWith('server said no');
    });

    it('toasts a readonly feedback array in its decided order', async () => {
      const messages: readonly Feedback[] = [success, failure];
      await setup().runWrite(of({ feedback: messages }));

      expect(notifications.success).toHaveBeenCalledWith('done translated');
      expect(notifications.error).toHaveBeenCalledWith('server said no');
      expect(notifications.success.mock.invocationCallOrder[0]).toBeLessThan(
        notifications.error.mock.invocationCallOrder[0],
      );
    });

    it('toasts nothing for a silent outcome', async () => {
      await setup().runWrite(of({ feedback: null }));

      expect(notifications.success).not.toHaveBeenCalled();
      expect(notifications.error).not.toHaveBeenCalled();
    });

    it('lets the write finish after destroy, without a toast', async () => {
      let settled = false;
      const outcome = new Subject<{ feedback: Feedback }>();
      const done = setup().runWrite(
        outcome.pipe(
          finalize(() => {
            settled = true;
          }),
        ),
      );
      TestBed.resetTestingModule();
      expect(outcome.observed).toBe(true);
      outcome.next({ feedback: success });
      outcome.complete();
      await done;

      expect(settled).toBe(true);
      expect(notifications.success).not.toHaveBeenCalled();
    });
  });
});
