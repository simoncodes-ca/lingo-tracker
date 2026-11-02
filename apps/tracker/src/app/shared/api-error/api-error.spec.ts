import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorMessage, provideTrackerHttpClient, toApiError } from './api-error';

describe('toApiError', () => {
  it('preserves clashing upload names as details of a conflict', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 409,
        error: { statusCode: 409, message: 'Files already exist', error: 'Conflict', errors: ['fr.json', 'de.xlf'] },
      }),
    );
    expect(error.kind).toBe('conflict');
    expect(error.details).toEqual(['fr.json', 'de.xlf']);
    expect(apiErrorMessage(error, 'Upload failed')).toBe('Files already exist');
  });

  it('shows the API message when an upload exceeds the file size limit', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 413,
        error: { statusCode: 413, message: 'File too large', error: 'Payload Too Large' },
      }),
    );
    expect(error.status).toBe(413);
    expect(error.kind).toBe('other');
    expect(apiErrorMessage(error, 'Upload failed')).toBe('File too large');
  });

  it('shows the API message when another upload is in progress', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 429,
        error: { statusCode: 429, message: 'Another upload is in progress', error: 'Too Many Requests' },
      }),
    );
    expect(error.status).toBe(429);
    expect(error.kind).toBe('other');
    expect(apiErrorMessage(error, 'Upload failed')).toBe('Another upload is in progress');
  });

  it('maps a 404 with a JSON body to not-found with the server message', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        url: '/api/collections/app',
        error: { statusCode: 404, message: 'Collection "app" not found', error: 'Not Found' },
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe('not-found');
    expect(error.status).toBe(404);
    expect(error.serverMessage).toBe('Collection "app" not found');
    expect(error.message).toBe('Collection "app" not found');
    expect(error.details).toEqual([]);
  });

  it('maps a 409 to conflict', () => {
    const error = toApiError(
      new HttpErrorResponse({ status: 409, error: { statusCode: 409, message: 'Resource already exists: a.b' } }),
    );

    expect(error.kind).toBe('conflict');
    expect(error.serverMessage).toBe('Resource already exists: a.b');
  });

  it('maps a 400 with an errors array to invalid and keeps the details', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 400,
        error: { statusCode: 400, message: 'Invalid bundle definition', error: 'Bad Request', errors: ['a', 'b'] },
      }),
    );

    expect(error.kind).toBe('invalid');
    expect(error.serverMessage).toBe('Invalid bundle definition');
    expect(error.details).toEqual(['a', 'b']);
  });

  it.each([
    [403, 'other'],
    [422, 'invalid'],
    [500, 'other'],
    [502, 'other'],
    [429, 'other'],
  ] as const)('maps status %i to %s', (status, kind) => {
    expect(toApiError(new HttpErrorResponse({ status, error: { message: 'm' } })).kind).toBe(kind);
  });

  it('maps a network failure (status 0) to other with no server message', () => {
    const error = toApiError(new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }));

    expect(error.kind).toBe('other');
    expect(error.status).toBe(0);
    expect(error.serverMessage).toBeUndefined();
    expect(error.message).toContain('0');
  });

  it('has no server message for a non-JSON body', () => {
    const html = toApiError(new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' }));
    const unparsable = toApiError(
      new HttpErrorResponse({ status: 500, error: { error: new SyntaxError('Unexpected token <'), text: '<html>' } }),
    );

    expect(html.kind).toBe('other');
    expect(html.serverMessage).toBeUndefined();
    expect(unparsable.serverMessage).toBeUndefined();
    expect(unparsable.details).toEqual([]);
  });

  it('ignores a body whose message is not a non-empty string', () => {
    expect(toApiError(new HttpErrorResponse({ status: 400, error: { message: '' } })).serverMessage).toBeUndefined();
    expect(toApiError(new HttpErrorResponse({ status: 400, error: { message: 42 } })).serverMessage).toBeUndefined();
    expect(toApiError(new HttpErrorResponse({ status: 400, error: null })).serverMessage).toBeUndefined();
  });
});

describe('apiErrorMessage', () => {
  it('prefers the server message of an ApiError', () => {
    const error = toApiError(new HttpErrorResponse({ status: 404, error: { message: 'Folder not found: x' } }));

    expect(apiErrorMessage(error, 'Failed to load folders')).toBe('Folder not found: x');
  });

  it('uses the fallback for an ApiError without a server message', () => {
    const error = toApiError(new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }));

    expect(apiErrorMessage(error, 'Failed to load folders')).toBe('Failed to load folders');
  });

  it('shows the message of a 500 that carries one (an invalid config names what to fix)', () => {
    const message = '"preferredTerminologyFile" in .lingo-tracker.json must be a string path (got number)';
    const error = toApiError(new HttpErrorResponse({ status: 500, error: { statusCode: 500, message } }));

    expect(apiErrorMessage(error, 'Failed to save settings')).toBe(message);
  });

  it('uses the fallback for the generic 500 the API sends for an undisclosed failure, whose body has no message', () => {
    const error = toApiError(
      new HttpErrorResponse({ status: 500, error: { statusCode: 500, error: 'Internal Server Error' } }),
    );

    expect(apiErrorMessage(error, 'Failed to load folders')).toBe('Failed to load folders');
  });

  it('still shows the server message for a 502, which can carry a real translation-provider error', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 502,
        error: { statusCode: 502, message: 'Translation provider error: timed out' },
      }),
    );

    expect(apiErrorMessage(error, 'Failed to translate')).toBe('Translation provider error: timed out');
  });

  it('uses the message of any other Error and the fallback for anything else', () => {
    expect(apiErrorMessage(new Error('Collection is being indexed.'), 'fallback')).toBe('Collection is being indexed.');
    expect(apiErrorMessage({ weird: true }, 'fallback')).toBe('fallback');
    expect(apiErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});

describe('apiErrorInterceptor (through provideTrackerHttpClient)', () => {
  function setup(): { http: HttpClient; controller: HttpTestingController } {
    TestBed.configureTestingModule({ providers: [provideTrackerHttpClient(), provideHttpClientTesting()] });
    return { http: TestBed.inject(HttpClient), controller: TestBed.inject(HttpTestingController) };
  }

  it('converts a failed response into an ApiError', () => {
    const { http, controller } = setup();
    let caught: unknown;
    http.get('/api/collections/app').subscribe({
      error: (error: unknown) => {
        caught = error;
      },
    });

    controller
      .expectOne('/api/collections/app')
      .flush({ statusCode: 404, message: 'Collection "app" not found' }, { status: 404, statusText: 'Not Found' });

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ kind: 'not-found', serverMessage: 'Collection "app" not found' });
    controller.verify();
  });

  it('converts a network failure into an ApiError', () => {
    const { http, controller } = setup();
    let caught: unknown;
    http.get('/api/config').subscribe({
      error: (error: unknown) => {
        caught = error;
      },
    });

    controller.expectOne('/api/config').error(new ProgressEvent('error'));

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ kind: 'other', status: 0, serverMessage: undefined });
    controller.verify();
  });

  it('leaves successful responses untouched', () => {
    const { http, controller } = setup();
    let body: unknown;
    http.get('/api/config').subscribe((response) => {
      body = response;
    });

    controller.expectOne('/api/config').flush({ baseLocale: 'en' });

    expect(body).toEqual({ baseLocale: 'en' });
    controller.verify();
  });
});
