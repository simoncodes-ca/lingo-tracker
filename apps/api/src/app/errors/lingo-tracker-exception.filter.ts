import {
  type ArgumentsHost,
  BadGatewayException,
  BadRequestException,
  Catch,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { type ErrorKind, type ErrorRules, LingoTrackerError, mapTypedError } from '@simoncodes-ca/core';
import type { ApiErrorCode } from './api-error-codes';

/**
 * The HTTP answer for a typed core error. This is the only place the API maps a core
 * error to a status; controllers let core errors propagate.
 *
 * Kind selects the default status. The API owns code-based presentation rules and
 * reads code-specific `facts`, without subclass checks or property probes.
 *
 * Every mapped answer has the same `{ statusCode, message, error }` body. An invalid bundle
 * definition also carries `errors`, every problem the domain rules found, under the fixed
 * message `Invalid bundle definition`; invalid preferred-terminology rules carry the per-row
 * `errors` under `Invalid preferred terminology rules`. A runtime subclass with an unknown kind
 * is a 500 that keeps its message. An `InvalidConfigError`
 * (a `.lingo-tracker.json` the server cannot use), for example, says what to fix in the file.
 */
type HttpFactory = (message: string) => HttpException;

const HTTP_BY_KIND: Record<ErrorKind, HttpFactory> = {
  'not-found': (message) => new NotFoundException(message),
  conflict: (message) => new ConflictException(message),
  invalid: (message) => new BadRequestException(message),
  forbidden: (message) => new ForbiddenException(message),
  unavailable: (message) => new UnprocessableEntityException(message),
  upstream: (message) => new BadGatewayException(message),
  internal: (message) => new InternalServerErrorException(message),
};

interface HttpRule {
  readonly kind: ErrorKind;
  readonly message?: string | ((message: string) => string);
  readonly status?: HttpFactory;
  readonly includeDetails?: boolean;
}

/** HTTP presentation belongs to the API; the core error keeps its original message and code. */

// Codes default by kind; this table holds only deviations.
export const HTTP_BY_CODE = {
  INVALID_IMPORT_LOCALE: { kind: 'internal', status: HTTP_BY_KIND.invalid },
  IMPORT_SOURCE_ERROR: { kind: 'internal', status: HTTP_BY_KIND.invalid },
  BRACED_PLACEHOLDER: { kind: 'invalid', includeDetails: true },
  INVALID_COLLECTION: (error) => ({
    kind: 'invalid',
    message: error.facts.field !== undefined ? `collection.${error.message}` : error.message,
  }),
  INVALID_BUNDLE_DEFINITION: { kind: 'invalid', message: 'Invalid bundle definition', includeDetails: true },
  INVALID_PREFERRED_TERMINOLOGY: {
    kind: 'invalid',
    message: 'Invalid preferred terminology rules',
    includeDetails: true,
  },
  INVALID_FOLDER_PATH: { kind: 'invalid', message: (message) => `Validation error: ${message}` },
  FOLDER_MOVE_INTO_DESCENDANT: { kind: 'invalid', message: (message) => `Validation error: ${message}` },
  INVALID_REQUEST: { kind: 'upstream', status: HTTP_BY_KIND.invalid },
  MISSING_API_KEY: { kind: 'upstream', status: HTTP_BY_KIND.internal },
  UNKNOWN_PROVIDER: { kind: 'upstream', status: HTTP_BY_KIND.internal },
  AUTH_ERROR: { kind: 'upstream', status: HTTP_BY_KIND.internal },
  RATE_LIMIT: {
    kind: 'upstream',
    status: (message) =>
      new HttpException(
        HttpException.createBody(message, 'Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
        HttpStatus.TOO_MANY_REQUESTS,
      ),
  },
} satisfies ErrorRules<HttpRule, void, ApiErrorCode>;

export function lingoTrackerErrorToHttp(error: LingoTrackerError): HttpException {
  if (!error.exposeMessage) {
    return new InternalServerErrorException({ statusCode: 500, error: 'Internal Server Error' });
  }
  const candidate = mapTypedError<HttpRule, void, ApiErrorCode>(error, HTTP_BY_CODE, undefined);
  const rule = candidate?.kind === error.kind ? candidate : undefined;
  // TranslationError is the only core subclass with kind 'upstream'. Core's error
  // spec reserves that kind for it, so unknown provider codes keep the prefix and
  // default 502 without changing the existing open provider-code taxonomy.
  const message =
    error.kind === 'upstream'
      ? `Translation provider error: ${error.message}`
      : typeof rule?.message === 'function'
        ? rule.message(error.message)
        : (rule?.message ?? error.message);
  // A runtime subclass with an unrecognised kind retains the old typed 500 response.
  const mapper = rule?.status ?? HTTP_BY_KIND[error.kind] ?? HTTP_BY_KIND.internal;
  const http = mapper(message);
  if (!rule?.includeDetails || error.facts.details === undefined) {
    return http;
  }
  const body = http.getResponse();
  return new HttpException(
    { ...(typeof body === 'string' ? { message: body } : body), errors: [...error.facts.details] },
    http.getStatus(),
  );
}

/**
 * The HTTP answer for anything a handler throws: an `HttpException` as is, a
 * `LingoTrackerError` by `lingoTrackerErrorToHttp`, and anything else as a generic 500
 * whose body has no `message` at all (`{ statusCode, error }`), so a client that shows a
 * server message when there is one falls back to its own text for an undisclosed failure.
 */
export function toHttpException(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }
  if (error instanceof LingoTrackerError) {
    return lingoTrackerErrorToHttp(error);
  }
  const status = HttpStatus.INTERNAL_SERVER_ERROR;
  return new InternalServerErrorException({ statusCode: status, error: 'Internal Server Error' });
}

/**
 * Global filter (registered with `APP_FILTER`). It turns typed core errors and unexpected
 * errors into HTTP exceptions with `toHttpException`, then lets Nest's base filter write
 * the body. An unexpected error is logged (message and stack) and answered with a generic
 * 500 without a message, so internal details stay on the server. Values with their own
 * `statusCode` keep Nest's default handling: http-errors-shaped Error instances (a boolean
 * `expose` and `status === statusCode`, as body-parser throws) and non-Error objects with a
 * valid HTTP error `statusCode` and a non-empty string `message` keep their status. A plain
 * Error with only `statusCode` gets 500 `{ statusCode: 500, message: 'Internal server error' }`
 * and is logged by Nest's own `ExceptionsHandler`, not by this filter.
 */
@Catch()
export class LingoTrackerExceptionFilter extends BaseExceptionFilter {
  readonly #logger = new Logger(LingoTrackerExceptionFilter.name);

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException || exception instanceof LingoTrackerError) {
      if (exception instanceof LingoTrackerError && !exception.exposeMessage) {
        this.#logger.error(exception.message, exception.stack);
      }
      super.catch(toHttpException(exception), host);
    } else if (exception instanceof Error && !Reflect.has(exception, 'statusCode')) {
      this.#logger.error(exception.message, exception.stack);
      super.catch(toHttpException(exception), host);
    } else {
      super.catch(exception, host);
    }
  }
}
