import { ApiError, apiErrorMessage } from '../../shared/api-error/api-error';

/**
 * The message for a failed job run. An invalid bundle definition carries every rule
 * message as `details`; they are appended (`Invalid bundle definition: a; b`) so the
 * reason is readable.
 */
export function toJobErrorMessage(error: unknown, fallback: string): string {
  const message = apiErrorMessage(error, fallback);
  const details =
    error instanceof ApiError ? error.details.filter((item): item is string => typeof item === 'string') : [];
  return details.length > 0 ? `${message}: ${details.join('; ')}` : message;
}
