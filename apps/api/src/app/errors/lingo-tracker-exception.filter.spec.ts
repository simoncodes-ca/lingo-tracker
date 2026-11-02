import { Controller, Get, HttpException, type INestApplication, Logger, NotFoundException } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as core from '@simoncodes-ca/core';
import { type ErrorKind, LingoTrackerError, TranslationError } from '@simoncodes-ca/core';
// Pin core-internal subclasses too. The public alias resolves to this same source via tsconfig.base paths.
import {
  errorAdapterFixtures,
  ERROR_CODES,
  PROVIDER_ERROR_CODES,
  InvalidCollectionError,
  internalErrors,
} from '@simoncodes-ca/core/testing';
import { JobNotFoundError } from '../jobs/job-not-found.error';
import { HTTP_BY_CODE, LingoTrackerExceptionFilter, toHttpException } from './lingo-tracker-exception.filter';

describe('toHttpException', () => {
  const cases = [
    [
      new internalErrors.BracedPlaceholderError('en', ['braced']),
      400,
      {
        message: 'Value for locale "en" is not valid: braced',
        error: 'Bad Request',
        statusCode: 400,
        errors: ['braced'],
      },
    ],
    [
      new internalErrors.InvalidFolderPathError('folder name', 'a b'),
      400,
      {
        message: 'Validation error: Invalid folder name segment "a b". Segments must match pattern [A-Za-z0-9_-]+',
        error: 'Bad Request',
        statusCode: 400,
      },
    ],
    [
      new internalErrors.FolderMoveIntoDescendantError('apps.common', 'apps.common.buttons'),
      400,
      {
        message: 'Validation error: Cannot move folder "apps.common" into its own descendant "apps.common.buttons"',
        error: 'Bad Request',
        statusCode: 400,
      },
    ],
    [
      new internalErrors.InvalidBundleDefinitionError(['a', 'b']),
      400,
      { message: 'Invalid bundle definition', error: 'Bad Request', statusCode: 400, errors: ['a', 'b'] },
    ],
    [
      new internalErrors.PreferredTerminologyValidationError([
        { index: 0, field: 'preferred', code: 'empty', message: 'empty' },
      ]),
      400,
      {
        message: 'Invalid preferred terminology rules',
        error: 'Bad Request',
        statusCode: 400,
        errors: [{ index: 0, field: 'preferred', code: 'empty', message: 'empty' }],
      },
    ],
    [
      new (class UnmappedError extends LingoTrackerError {
        readonly kind = 'internal' as const;
      })('Unmapped', 'UNMAPPED'),
      500,
      { message: 'Unmapped', error: 'Internal Server Error', statusCode: 500 },
    ],
    [new Error('Disk write failure'), 500, { error: 'Internal Server Error', statusCode: 500 }],
    ['not an error', 500, { error: 'Internal Server Error', statusCode: 500 }],
  ] as const;

  it.each(cases)('maps %p to %i', (error, status, response) => {
    const http = toHttpException(error);

    expect(http.getStatus()).toBe(status);
    expect(http.getResponse()).toEqual(response);
  });

  it('maps a missing move destination with its destination-specific message', () => {
    const http = toHttpException(new internalErrors.CollectionNotFoundError('app', 'destination'));
    expect(http.getStatus()).toBe(404);
    expect(http.getResponse()).toEqual({
      statusCode: 404,
      message: 'Destination collection "app" not found',
      error: 'Not Found',
    });
  });

  it('prefixes collection field-shape messages', () => {
    const http = toHttpException(
      new InvalidCollectionError('translationsFolder is required', { field: 'translationsFolder' }),
    );
    expect(http.getStatus()).toBe(400);
    expect(http.getResponse()).toEqual({
      message: 'collection.translationsFolder is required',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('covers every public and internal core error subclass through the catalogue', () => {
    const exported = [
      ...new Set(
        [...Object.entries(core), ...Object.entries(internalErrors)]
          .filter(([, value]) => typeof value === 'function' && value.prototype instanceof LingoTrackerError)
          .map(([name]) => name),
      ),
    ].sort();
    expect([...new Set(errorAdapterFixtures().map((error) => error.constructor.name))].sort()).toEqual(exported);
  });

  const translationCases = [
    ['INVALID_REQUEST', 400, 'Bad Request'],
    ['MISSING_API_KEY', 500, 'Internal Server Error'],
    ['UNKNOWN_PROVIDER', 500, 'Internal Server Error'],
    ['AUTH_ERROR', 500, 'Internal Server Error'],
    ['RATE_LIMIT', 429, 'Too Many Requests'],
    ['SOMETHING_NEW', 502, 'Bad Gateway'],
  ] as const;

  it.each(translationCases)('maps a TranslationError with code %s to %i', (code, status, error) => {
    const http = toHttpException(new TranslationError('Provider said no', code, false));

    expect(http.getStatus()).toBe(status);
    expect(http.getResponse()).toEqual({
      message: 'Translation provider error: Provider said no',
      error,
      statusCode: status,
    });
  });

  const defaults = {
    'not-found': [404, 'Not Found'],
    conflict: [409, 'Conflict'],
    invalid: [400, 'Bad Request'],
    forbidden: [403, 'Forbidden'],
    unavailable: [422, 'Unprocessable Entity'],
    upstream: [502, 'Bad Gateway'],
    internal: [500, 'Internal Server Error'],
  } as const satisfies Record<ErrorKind, readonly [number, string]>;

  it.each(Object.entries(defaults))('defaults a new %s code by kind', (kind, [statusCode, label]) => {
    class NewError extends LingoTrackerError {
      readonly kind = kind as ErrorKind;
    }
    const http = toHttpException(new NewError('Original message', 'NEW_CODE'));
    expect(http.getStatus()).toBe(statusCode);
    expect(http.getResponse()).toEqual({
      statusCode,
      error: label,
      message: kind === 'upstream' ? 'Translation provider error: Original message' : 'Original message',
    });
  });

  it('maps every catalogue code and the API job code using defaults and only expected overrides', () => {
    const errors = [...errorAdapterFixtures(), new JobNotFoundError('missing-job', 'Translation')];
    expect(errors.map((error) => error.code).sort()).toEqual(
      [...Object.keys(ERROR_CODES), ...PROVIDER_ERROR_CODES, 'JOB_NOT_FOUND'].sort(),
    );
    const statuses: Readonly<Partial<Record<string, readonly [number, string]>>> = {
      INVALID_REQUEST: [400, 'Bad Request'],
      INVALID_IMPORT_LOCALE: [400, 'Bad Request'],
      IMPORT_SOURCE_ERROR: [400, 'Bad Request'],
      MISSING_API_KEY: [500, 'Internal Server Error'],
      UNKNOWN_PROVIDER: [500, 'Internal Server Error'],
      AUTH_ERROR: [500, 'Internal Server Error'],
      RATE_LIMIT: [429, 'Too Many Requests'],
    };
    for (const error of errors) {
      const [statusCode, label] = statuses[error.code] ?? defaults[error.kind];
      let message = error.kind === 'upstream' ? `Translation provider error: ${error.message}` : error.message;
      if (error.code === 'INVALID_COLLECTION') message = `collection.${error.message}`;
      if (['INVALID_FOLDER_PATH', 'FOLDER_MOVE_INTO_DESCENDANT'].includes(error.code))
        message = `Validation error: ${error.message}`;
      if (error.code === 'INVALID_BUNDLE_DEFINITION') message = 'Invalid bundle definition';
      if (error.code === 'INVALID_PREFERRED_TERMINOLOGY') message = 'Invalid preferred terminology rules';
      const body = error.exposeMessage
        ? {
            message,
            error: label,
            statusCode,
            ...(['BRACED_PLACEHOLDER', 'INVALID_BUNDLE_DEFINITION', 'INVALID_PREFERRED_TERMINOLOGY'].includes(
              error.code,
            )
              ? { errors: error.details }
              : {}),
          }
        : { statusCode: 500, error: 'Internal Server Error' };
      const http = toHttpException(error);
      expect(http.getStatus()).toBe(statusCode);
      expect(JSON.stringify(http.getResponse())).toBe(JSON.stringify(body));
    }
  });

  it.each(Object.keys(HTTP_BY_CODE))('has no redundant HTTP override for %s', (code) => {
    const error = errorAdapterFixtures().find((error) => error.code === code);
    expect(error).toBeDefined();
    if (!error) throw new Error(`Missing override fixture for ${code}`);
    const defaultError = Object.create(
      Object.getPrototypeOf(error),
      Object.getOwnPropertyDescriptors(error),
    ) as LingoTrackerError;
    Object.defineProperty(defaultError, 'code', { value: 'DEFAULT_CODE' });
    const actual = toHttpException(error);
    const fallback = toHttpException(defaultError);
    expect(JSON.stringify({ status: actual.getStatus(), body: actual.getResponse() })).not.toBe(
      JSON.stringify({ status: fallback.getStatus(), body: fallback.getResponse() }),
    );
  });

  it('maps an API-owned job error through the filter', () => {
    const error = new JobNotFoundError('missing-job', 'Translation');
    expect(toHttpException(error).getResponse()).toEqual({
      statusCode: 404,
      message: 'Translation job "missing-job" not found',
      error: 'Not Found',
    });
  });

  it('returns an HttpException unchanged', () => {
    const exception = new NotFoundException('Path "x" not found in collection tree');

    expect(toHttpException(exception)).toBe(exception);
  });

  it('keeps a formerly plain core failure hidden in the HTTP body', () => {
    class HiddenCoreError extends LingoTrackerError {
      readonly kind = 'internal' as const;
      override readonly exposeMessage = false;
    }
    const http = toHttpException(new HiddenCoreError('Failed to write /private/file', 'CORE_OPERATION_ERROR'));
    expect(http.getStatus()).toBe(500);
    expect(http.getResponse()).toEqual({ statusCode: 500, error: 'Internal Server Error' });
  });

  it('keeps the message of a typed error with an unknown runtime kind', () => {
    class FutureError extends LingoTrackerError {
      readonly kind = 'internal' as const;
    }
    const error = new FutureError('Future failure', 'FUTURE_FAILURE');
    Object.defineProperty(error, 'kind', { value: 'future-kind' });

    const http = toHttpException(error);
    expect(http.getStatus()).toBe(500);
    expect(http.getResponse()).toEqual({ statusCode: 500, message: 'Future failure', error: 'Internal Server Error' });
  });

  it('hides domain details when the error does not expose its message', () => {
    class HiddenDetailedError extends LingoTrackerError {
      readonly kind = 'invalid' as const;
      override readonly exposeMessage = false;
      override readonly details = ['private detail'];
    }
    const http = toHttpException(new HiddenDetailedError('Private failure', 'PRIVATE'));
    expect(http.getStatus()).toBe(500);
    expect(http.getResponse()).toEqual({ statusCode: 500, error: 'Internal Server Error' });
  });

  it('maps a new domain error subclass by code and details', () => {
    class DetailedValidationError extends LingoTrackerError {
      readonly kind = 'invalid' as const;
      override readonly details = ['first problem'];
    }
    const error = new DetailedValidationError('Original domain message', 'INVALID_BUNDLE_DEFINITION');
    const http = toHttpException(error);
    expect(error.message).toBe('Original domain message');
    expect(http.getStatus()).toBe(400);
    expect(http.getResponse()).toEqual({
      message: 'Invalid bundle definition',
      error: 'Bad Request',
      statusCode: 400,
      errors: ['first problem'],
    });
  });

  it('uses the plain kind default when an override code arrives with a different kind', () => {
    class LocalError extends LingoTrackerError {
      readonly kind = 'not-found' as const;
    }
    const http = toHttpException(new LocalError('Local request not found', 'INVALID_REQUEST'));
    expect(http.getStatus()).toBe(404);
    expect(http.getResponse()).toEqual({
      message: 'Local request not found',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('does not treat provider codes on non-upstream errors as translation failures', () => {
    class LocalError extends LingoTrackerError {
      readonly kind = 'conflict' as const;
    }
    const http = toHttpException(new LocalError('Local failure', 'RATE_LIMIT'));
    expect(http.getStatus()).toBe(409);
    expect(http.getResponse()).toEqual({ message: 'Local failure', error: 'Conflict', statusCode: 409 });
  });
});

@Controller('throw')
class ThrowingController {
  @Get('resource')
  resource(): never {
    throw new internalErrors.ResourceNotFoundError('a.b');
  }

  @Get('locale')
  locale(): never {
    throw new internalErrors.LocaleAlreadyExistsError('fr', 'app');
  }

  @Get('http')
  http(): never {
    throw new HttpException('Auto-translation is not enabled for this collection', 422);
  }

  @Get('plain')
  plain(): never {
    throw new Error('Disk write failure');
  }

  @Get('plain-status-code')
  plainStatusCode(): never {
    throw Object.assign(new Error('x'), { statusCode: 418 });
  }

  @Get('status-code')
  statusCode(): never {
    // Mirrors the http-errors shape body-parser throws, which NestJS 12 requires before it honours statusCode.
    throw Object.assign(new Error('request entity too large'), { statusCode: 413, status: 413, expose: true });
  }
}

describe('LingoTrackerExceptionFilter (registered with APP_FILTER)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let loggerError: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThrowingController],
      providers: [{ provide: APP_FILTER, useClass: LingoTrackerExceptionFilter }],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerError.mockRestore();
  });

  const get = async (path: string): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(`${baseUrl.replace('[::1]', 'localhost')}/throw/${path}`);
    return { status: response.status, body: await response.json() };
  };

  it('answers a typed core error with its mapped status and the Nest body', async () => {
    await expect(get('resource')).resolves.toEqual({
      status: 404,
      body: { message: 'Resource not found: a.b', error: 'Not Found', statusCode: 404 },
    });
    await expect(get('locale')).resolves.toEqual({
      status: 400,
      body: { statusCode: 400, message: 'Locale "fr" already exists in collection "app"', error: 'Bad Request' },
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('passes an HttpException through', async () => {
    await expect(get('http')).resolves.toEqual({
      status: 422,
      body: { statusCode: 422, message: 'Auto-translation is not enabled for this collection' },
    });
  });

  it('answers an unexpected error with a generic 500 that carries no message, and logs it', async () => {
    await expect(get('plain')).resolves.toEqual({
      status: 500,
      body: { statusCode: 500, error: 'Internal Server Error' },
    });
    expect(loggerError).toHaveBeenCalledWith('Disk write failure', expect.any(String));
  });

  it("answers a plain Error carrying only statusCode with Nest's generic 500", async () => {
    await expect(get('plain-status-code')).resolves.toEqual({
      status: 500,
      body: { statusCode: 500, message: 'Internal server error' },
    });
  });

  it("leaves an error that carries its own statusCode to Nest's default handling", async () => {
    await expect(get('status-code')).resolves.toEqual({
      status: 413,
      body: { statusCode: 413, message: 'request entity too large' },
    });
  });
});
