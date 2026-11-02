import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { NotificationService } from '../shared/notification';
import { type TokenTranslator, type TranslationParam, translateToken } from '../shared/translate-token';

/**
 * The feedback a write has decided for its outcome: how it reads (`tone`), where it shows
 * (`placement`) and what it says. Pure data, so a mapping from outcome to feedback needs no
 * TestBed; the UI only renders it with {@link feedbackText} or {@link injectFeedback}.
 */
export interface Feedback {
  readonly tone: 'success' | 'info' | 'warning' | 'error';
  /** `toast` opens a snackbar; `inline` is rendered by the surface the user acted in. */
  readonly placement: 'inline' | 'toast';
  readonly token: string;
  readonly params?: Readonly<Record<string, FeedbackParam>>;
  /** Text from the failure itself (the API's message). It replaces the token's wording. */
  readonly detail?: string;
}

/** A parameter value; `{ token }` is itself translated (for example the root folder's label). */
export type FeedbackParam = TranslationParam;

/** The text to show for a feedback: its `detail` when it has one, else its token's wording. */
export function feedbackText(feedback: Feedback, translate: TokenTranslator): string {
  if (feedback.detail) return feedback.detail;
  return translateToken(feedback.token, feedback.params, translate);
}

/** Renders feedback from a component or store feature; call it in an injection context. */
export function injectFeedback(): {
  text: (feedback: Feedback) => string;
  /** Opens the toast of a `toast` feedback. Inline feedback, `null` and `undefined` do nothing. */
  toast: (feedback: Feedback | null | undefined) => void;
} {
  const transloco = inject(TranslocoService);
  const notifications = inject(NotificationService);
  const text = (feedback: Feedback): string =>
    feedbackText(feedback, (token, params) => transloco.translate(token, params));
  return {
    text,
    toast: (feedback) => {
      if (feedback?.placement === 'toast') notifications[feedback.tone](text(feedback));
    },
  };
}
