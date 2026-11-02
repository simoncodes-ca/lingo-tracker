import { HttpErrorResponse, type HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import type { EnvironmentProviders } from '@angular/core';
import { catchError, throwError } from 'rxjs';

/**
 * What a failed API request means to the Tracker, shrunk to what a consumer actually
 * branches on (`translation-editor-dialog.ts`, `collections.store.ts`). Anything a
 * consumer does not decide with — a network failure, a forbidden read-only-collection
 * answer, a 5xx, or any other status — is `other`; `status` still carries the real code
 * for logs or for a future consumer that needs it.
 *
 * - `invalid`: 400 or 422, the request was understood but rejected.
 * - `not-found`: 404. `conflict`: 409.
 * - `other`: everything else (0, 403, 5xx, or any other status).
 */
export type ApiErrorKind = 'invalid' | 'not-found' | 'conflict' | 'other';

interface ApiErrorProps {
  kind: ApiErrorKind;
  status: number;
  /** The `message` of the API's `{ statusCode, message, error }` body, when the body had one. */
  serverMessage?: string;
  /** The body's `errors` array, when present (bundle rule messages, preferred-term rule errors). */
  details?: readonly unknown[];
  /** Technical text for logs when the body carried no message. */
  message?: string;
}

/**
 * The one error value the Tracker sees for a failed API request. `HttpErrorResponse`
 * never leaves the HTTP seam: {@link apiErrorInterceptor} converts every failed response
 * with {@link toApiError}. Stores and dialogs decide on `kind` and show
 * {@link apiErrorMessage}; nothing else reads a status code or an error body.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly serverMessage: string | undefined;
  readonly details: readonly unknown[];

  constructor({ kind, status, serverMessage, details = [], message }: ApiErrorProps) {
    super(serverMessage ?? message ?? `API request failed with status ${status}`);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.serverMessage = serverMessage;
    this.details = details;
  }
}

/** Converts a failed `HttpClient` response into an {@link ApiError}. */
export function toApiError(response: HttpErrorResponse): ApiError {
  const { serverMessage, details } = readErrorBody(response.error);
  return new ApiError({
    kind: kindOf(response.status),
    status: response.status,
    serverMessage,
    details,
    message: response.message,
  });
}

function kindOf(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return 'invalid';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  return 'other';
}

/**
 * Reads the API's JSON error body. A non-JSON body (an HTML page from a proxy, or the
 * `{ error: SyntaxError, text }` pair `HttpClient` builds when parsing fails) has no message.
 */
function readErrorBody(body: unknown): { serverMessage?: string; details: readonly unknown[] } {
  if (typeof body !== 'object' || body === null) return { details: [] };
  const { message, errors } = body as { message?: unknown; errors?: unknown };
  return {
    serverMessage: typeof message === 'string' && message.length > 0 ? message : undefined,
    details: Array.isArray(errors) ? errors : [],
  };
}

/**
 * The text to show a user for a failed operation: the server's message when the API sent
 * one, the message of any other `Error` the Tracker raised itself (for example
 * `CollectionIndexNotReadyError`), else the caller's fallback for that operation.
 *
 * No status is special. `LingoTrackerExceptionFilter` answers an exception it does not
 * recognise with a 500 whose body has no message at all, so that case lands on the
 * fallback by the same rule; a 500 that does carry a message (an `InvalidConfigError`
 * naming what is wrong with `.lingo-tracker.json`, a translation provider left
 * unconfigured) is worth showing as is.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.serverMessage ?? fallback;
  return error instanceof Error ? error.message : fallback;
}

/** Turns every failed `HttpClient` response into an {@link ApiError}; other errors pass through. */
export const apiErrorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) => throwError(() => (error instanceof HttpErrorResponse ? toApiError(error) : error))),
  );

/** The Tracker's `HttpClient`, with {@link apiErrorInterceptor} installed. Used by the app config and by specs. */
export function provideTrackerHttpClient(): EnvironmentProviders {
  return provideHttpClient(withInterceptors([apiErrorInterceptor]));
}
