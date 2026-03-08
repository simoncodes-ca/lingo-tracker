import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleTranslateV2Provider } from './google-translate-v2.provider';
import { TranslationError } from './translation-provider';
import type { TranslateRequest } from './translation-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessResponse(translations: Array<{ translatedText: string; detectedSourceLanguage?: string }>) {
  return {
    ok: true,
    json: () => Promise.resolve({ data: { translations } }),
  } as unknown as Response;
}

function makeErrorResponse(status: number, errorPayload: object) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.resolve(errorPayload),
  } as unknown as Response;
}

function makeRequest(overrides: Partial<TranslateRequest> = {}): TranslateRequest {
  return {
    text: 'Hello',
    sourceLocale: 'en',
    targetLocale: 'es',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoogleTranslateV2Provider', () => {
  const provider = new GoogleTranslateV2Provider({ apiKey: 'test-api-key' });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCapabilities', () => {
    it('returns the expected static capabilities', () => {
      const capabilities = provider.getCapabilities();

      expect(capabilities.supportsBatch).toBe(true);
      expect(capabilities.maxBatchSize).toBe(128);
      expect(capabilities.supportsFormality).toBe(false);
    });
  });

  describe('translate', () => {
    describe('empty input', () => {
      it('returns an empty array without calling fetch', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const results = await provider.translate([]);

        expect(results).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });

    describe('single translation', () => {
      it('returns the translated text from Google with provider name', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeSuccessResponse([{ translatedText: 'Hola' }]),
        );

        const results = await provider.translate([makeRequest({ text: 'Hello', targetLocale: 'es' })]);

        expect(results).toHaveLength(1);
        expect(results[0].translatedText).toBe('Hola');
        expect(results[0].provider).toBe('google-translate');
        expect(results[0].detectedSourceLocale).toBeUndefined();
      });

      it('passes the detected source language when Google returns it', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeSuccessResponse([{ translatedText: 'Bonjour', detectedSourceLanguage: 'en' }]),
        );

        const results = await provider.translate([makeRequest({ targetLocale: 'fr' })]);

        expect(results[0].detectedSourceLocale).toBe('en');
      });

      it('sends the correct request body to the Google API', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeSuccessResponse([{ translatedText: 'Hola' }]),
        );

        await provider.translate([makeRequest({ text: 'Hello', sourceLocale: 'en', targetLocale: 'es' })]);

        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://translation.googleapis.com/language/translate/v2');
        expect((init as RequestInit).method).toBe('POST');

        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers['X-goog-api-key']).toBe('test-api-key');
        expect(headers['Content-Type']).toBe('application/json');

        const body = JSON.parse((init as RequestInit).body as string);
        expect(body).toEqual({ q: ['Hello'], source: 'en', target: 'es', format: 'text' });
      });
    });

    describe('batch translation — multiple target locales', () => {
      it('preserves result order across different target locales', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(makeSuccessResponse([{ translatedText: 'Hola' }]))
          .mockResolvedValueOnce(makeSuccessResponse([{ translatedText: 'Bonjour' }]));

        const requests: TranslateRequest[] = [
          makeRequest({ text: 'Hello', targetLocale: 'es' }),
          makeRequest({ text: 'Hello', targetLocale: 'fr' }),
        ];

        const results = await provider.translate(requests);

        expect(results).toHaveLength(2);
        expect(results[0].translatedText).toBe('Hola');
        expect(results[1].translatedText).toBe('Bonjour');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      });

      it('sends all texts for a single target locale in one API call', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeSuccessResponse([
            { translatedText: 'Hola' },
            { translatedText: 'Adiós' },
          ]),
        );

        const requests: TranslateRequest[] = [
          makeRequest({ text: 'Hello', targetLocale: 'es' }),
          makeRequest({ text: 'Goodbye', targetLocale: 'es' }),
        ];

        const results = await provider.translate(requests);

        expect(results).toHaveLength(2);
        expect(results[0].translatedText).toBe('Hola');
        expect(results[1].translatedText).toBe('Adiós');
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
        expect(body.q).toEqual(['Hello', 'Goodbye']);
      });

      it('interleaves results correctly when requests alternate between target locales', async () => {
        vi.spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(makeSuccessResponse([
            { translatedText: 'Hola' },
            { translatedText: 'Mundo' },
          ]))
          .mockResolvedValueOnce(makeSuccessResponse([
            { translatedText: 'Bonjour' },
            { translatedText: 'Monde' },
          ]));

        const requests: TranslateRequest[] = [
          makeRequest({ text: 'Hello', targetLocale: 'es' }),   // index 0 → 'Hola'
          makeRequest({ text: 'Hello', targetLocale: 'fr' }),   // index 1 → 'Bonjour'
          makeRequest({ text: 'World', targetLocale: 'es' }),   // index 2 → 'Mundo'
          makeRequest({ text: 'World', targetLocale: 'fr' }),   // index 3 → 'Monde'
        ];

        const results = await provider.translate(requests);

        expect(results[0].translatedText).toBe('Hola');
        expect(results[1].translatedText).toBe('Bonjour');
        expect(results[2].translatedText).toBe('Mundo');
        expect(results[3].translatedText).toBe('Monde');
      });
    });

    describe('chunking — more than 128 strings per target locale', () => {
      it('splits 130 requests for the same target locale into two API calls', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(
            makeSuccessResponse(Array.from({ length: 128 }, (_, i) => ({ translatedText: `translated-${i}` }))),
          )
          .mockResolvedValueOnce(
            makeSuccessResponse(Array.from({ length: 2 }, (_, i) => ({ translatedText: `translated-${128 + i}` }))),
          );

        const requests = Array.from({ length: 130 }, (_, i) =>
          makeRequest({ text: `text-${i}`, targetLocale: 'es' }),
        );

        const results = await provider.translate(requests);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(results).toHaveLength(130);
        expect(results[0].translatedText).toBe('translated-0');
        expect(results[127].translatedText).toBe('translated-127');
        expect(results[128].translatedText).toBe('translated-128');
        expect(results[129].translatedText).toBe('translated-129');
      });

      it('sends exactly 128 texts in the first chunk', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(
            makeSuccessResponse(Array.from({ length: 128 }, (_, i) => ({ translatedText: `t-${i}` }))),
          )
          .mockResolvedValueOnce(
            makeSuccessResponse([{ translatedText: 't-128' }]),
          );

        const requests = Array.from({ length: 129 }, (_, i) =>
          makeRequest({ text: `text-${i}`, targetLocale: 'de' }),
        );

        await provider.translate(requests);

        const firstCallBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
        const secondCallBody = JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string);

        expect(firstCallBody.q).toHaveLength(128);
        expect(secondCallBody.q).toHaveLength(1);
      });
    });

    describe('error handling', () => {
      it('throws TranslationError with INVALID_REQUEST code on HTTP 400', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeErrorResponse(400, {
            error: { code: 400, message: 'Bad request', errors: [{ reason: 'invalidParameter' }] },
          }),
        );

        await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
          name: 'TranslationError',
          code: 'INVALID_REQUEST',
          retryable: false,
          providerErrorCode: 'invalidParameter',
        });
      });

      it('throws TranslationError with RATE_LIMIT code on 403 dailyLimitExceeded', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeErrorResponse(403, {
            error: { code: 403, message: 'Daily limit exceeded', errors: [{ reason: 'dailyLimitExceeded' }] },
          }),
        );

        await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
          code: 'RATE_LIMIT',
          retryable: true,
          providerErrorCode: 'dailyLimitExceeded',
        });
      });

      it('throws TranslationError with RATE_LIMIT code on 403 rateLimitExceeded', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeErrorResponse(403, {
            error: { code: 403, message: 'Rate limit exceeded', errors: [{ reason: 'rateLimitExceeded' }] },
          }),
        );

        await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
          code: 'RATE_LIMIT',
          retryable: true,
          providerErrorCode: 'rateLimitExceeded',
        });
      });

      it('throws TranslationError with AUTH_ERROR code on 403 forbidden', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeErrorResponse(403, {
            error: { code: 403, message: 'Forbidden', errors: [{ reason: 'forbidden' }] },
          }),
        );

        await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
          code: 'AUTH_ERROR',
          retryable: false,
          providerErrorCode: 'forbidden',
        });
      });

      it('throws TranslationError with AUTH_ERROR on 403 with no reason', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeErrorResponse(403, {
            error: { code: 403, message: 'Forbidden' },
          }),
        );

        await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
          code: 'AUTH_ERROR',
          retryable: false,
        });
      });

      it('throws TranslationError with SERVER_ERROR code on HTTP 500', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeErrorResponse(500, {
            error: { code: 500, message: 'Internal Server Error' },
          }),
        );

        await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
          code: 'SERVER_ERROR',
          retryable: true,
        });
      });

      it('throws TranslationError with SERVER_ERROR code on HTTP 503', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          makeErrorResponse(503, {
            error: { code: 503, message: 'Service Unavailable' },
          }),
        );

        await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
          code: 'SERVER_ERROR',
          retryable: true,
        });
      });

      it('handles malformed JSON in error response gracefully', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.reject(new SyntaxError('Unexpected token')),
        } as unknown as Response);

        await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
          code: 'SERVER_ERROR',
          retryable: true,
        });
      });
    });
  });
});
