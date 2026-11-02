import { ApiError, apiErrorMessage } from '../../shared/api-error/api-error';
import type { Feedback } from '../feedback';

/** The silent guards and typed API refusal shared by Folder Writes and Entry Writes. */
export type Refusal =
  | { kind: 'refused'; error: ApiError; cause?: unknown }
  | { kind: 'read-only' }
  | { kind: 'no-collection' }
  | { kind: 'stale-session' };

export function refused(error: unknown): Extract<Refusal, { kind: 'refused' }> {
  return {
    kind: 'refused',
    error:
      error instanceof ApiError
        ? error
        : new ApiError({
            kind: 'other',
            status: 0,
            message: error instanceof Error ? error.message : undefined,
          }),
  };
}

/** The error's own message, or the caller's existing token when no message is available. */
export function refusedFeedback(
  error: unknown,
  fallbackToken: string,
  placement: Feedback['placement'] = 'toast',
): Feedback {
  // An empty fallback tells apiErrorMessage's "no message" apart from a real one.
  const detail = apiErrorMessage(error, '');
  return { tone: 'error', placement, token: fallbackToken, ...(detail ? { detail } : {}) };
}
