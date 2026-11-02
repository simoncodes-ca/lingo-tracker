import { DestroyRef, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { type Feedback, injectFeedback } from '../browser/feedback';
import { type ConfirmationSpec, injectConfirm } from './confirm';

/** What the store's write guards expect: given the session guard (if any), answer yes or no. */
export type WriteConfirmation = (inSession?: () => boolean) => Promise<boolean>;

/** A confirmation's wording tokens, plus the dialog width a surface already used. */
export type ConfirmedWriteSpec = ConfirmationSpec & { readonly width?: string };

/** A destructive confirmation: the Delete button and the destructive style are fixed. */
export type DestructiveWriteSpec = Pick<ConfirmedWriteSpec, 'title' | 'message' | 'cancelButtonText' | 'width'>;

/** A write outcome that has already decided what to tell the user. */
export interface DecidedOutcome {
  readonly feedback: Feedback | readonly Feedback[] | null | undefined;
}

/**
 * Confirmed Write: the one place a surface turns "ask, then write, then toast" into tokens.
 * Call it in an injection context; the surface's lifetime is the injector's `DestroyRef`.
 */
export function injectConfirmedWrite(): {
  /** A confirmation for any write, answered only while the session is open and the surface alive. */
  confirmWrite: (spec: ConfirmedWriteSpec) => WriteConfirmation;
  /** {@link confirmWrite} with the Delete button and the destructive style. */
  confirmDestructive: (spec: DestructiveWriteSpec) => WriteConfirmation;
  /** Toasts each decided feedback as the outcome arrives, synchronously, unless the surface is destroyed. The write itself is never cancelled by destroy, so the store settles it. */
  runWrite: (outcome$: Observable<DecidedOutcome>) => Promise<void>;
} {
  const confirm = injectConfirm();
  const feedback = injectFeedback();
  const destroyRef = inject(DestroyRef);

  const confirmWrite = ({ width, ...spec }: ConfirmedWriteSpec): WriteConfirmation => {
    return async (inSession) => {
      const canOpen = (): boolean => (inSession?.() ?? true) && !destroyRef.destroyed;
      const yes = await confirm(spec, { ...(width !== undefined ? { width } : {}), canOpen });
      return yes && !destroyRef.destroyed;
    };
  };

  return {
    confirmWrite,
    confirmDestructive: (spec) =>
      confirmWrite({
        ...spec,
        confirmButtonText: TRACKER_TOKENS.COMMON.ACTIONS.DELETE,
        actionType: 'destructive',
      }),
    runWrite: (outcome$) =>
      new Promise<void>((resolve, reject) => {
        outcome$.subscribe({
          next: (outcome) => {
            if (!destroyRef.destroyed) {
              const messages = outcome.feedback;
              if (!messages || 'token' in messages) feedback.toast(messages);
              else messages.forEach(feedback.toast);
            }
          },
          error: reject,
          complete: resolve,
        });
      }),
  };
}
