import type { TranslateRequest, TranslateResult, ProviderCapabilities, TranslationProvider } from './translation-provider';
import { TranslationError } from './translation-provider';

const GOOGLE_TRANSLATE_API_URL = 'https://translation.googleapis.com/language/translate/v2';
const PROVIDER_NAME = 'google-translate';
const MAX_BATCH_SIZE = 128;

interface GoogleTranslateV2Config {
  readonly apiKey: string;
}

interface GoogleTranslationItem {
  translatedText: string;
  detectedSourceLanguage?: string;
}

interface GoogleTranslateResponse {
  data: {
    translations: GoogleTranslationItem[];
  };
}

interface GoogleErrorResponse {
  error: {
    code: number;
    message: string;
    status?: string;
    errors?: Array<{ reason?: string }>;
  };
}

/**
 * Groups translate requests by target locale, preserving original indices
 * so results can be reassembled in order after batched API calls.
 */
function groupRequestsByTargetLocale(
  requests: TranslateRequest[],
): Map<string, Array<{ originalIndex: number; request: TranslateRequest }>> {
  const groups = new Map<string, Array<{ originalIndex: number; request: TranslateRequest }>>();

  for (let index = 0; index < requests.length; index++) {
    const request = requests[index];
    const existing = groups.get(request.targetLocale);

    if (existing) {
      existing.push({ originalIndex: index, request });
    } else {
      groups.set(request.targetLocale, [{ originalIndex: index, request }]);
    }
  }

  return groups;
}

/**
 * Splits an array into consecutive chunks of at most `size` elements.
 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/**
 * Maps a Google Translate HTTP error response to a typed TranslationError.
 *
 * Google's v2 API uses HTTP status codes and an optional `errors[].reason`
 * field to distinguish rate-limit errors from outright auth failures.
 */
function mapGoogleErrorToTranslationError(
  httpStatus: number,
  errorBody: GoogleErrorResponse,
): TranslationError {
  const googleMessage = errorBody.error?.message ?? 'Unknown Google Translate error';
  const firstReason = errorBody.error?.errors?.[0]?.reason;

  if (httpStatus === 400) {
    return new TranslationError(
      `Invalid translation request: ${googleMessage}`,
      'INVALID_REQUEST',
      false,
      firstReason,
    );
  }

  if (httpStatus === 403) {
    const isRateLimit =
      firstReason === 'dailyLimitExceeded' || firstReason === 'rateLimitExceeded';

    if (isRateLimit) {
      return new TranslationError(
        `Google Translate rate limit exceeded: ${googleMessage}`,
        'RATE_LIMIT',
        true,
        firstReason,
      );
    }

    return new TranslationError(
      `Google Translate authentication failed: ${googleMessage}`,
      'AUTH_ERROR',
      false,
      firstReason,
    );
  }

  if (httpStatus === 500 || httpStatus === 503) {
    return new TranslationError(
      `Google Translate server error: ${googleMessage}`,
      'SERVER_ERROR',
      true,
      firstReason,
    );
  }

  return new TranslationError(
    `Unexpected Google Translate error (HTTP ${httpStatus}): ${googleMessage}`,
    'SERVER_ERROR',
    true,
    firstReason,
  );
}

/**
 * Translation provider backed by the Google Translate REST API v2.
 *
 * Automatically batches requests sharing the same target locale (up to
 * 128 strings per API call, matching Google's documented limit). The
 * `sourceLocale` from the first request in each group is used as the
 * `source` parameter — callers should ensure all requests sharing a
 * target locale also share the same source locale.
 *
 * Auth is passed via the `X-goog-api-key` header so that the API key
 * never appears in the URL (and thus in server access logs).
 */
export class GoogleTranslateV2Provider implements TranslationProvider {
  readonly #apiKey: string;

  constructor(config: GoogleTranslateV2Config) {
    this.#apiKey = config.apiKey;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsBatch: true,
      maxBatchSize: MAX_BATCH_SIZE,
      supportsFormality: false,
    };
  }

  async translate(requests: TranslateRequest[]): Promise<TranslateResult[]> {
    if (requests.length === 0) {
      return [];
    }

    const results: TranslateResult[] = new Array(requests.length);
    const groupsByLocale = groupRequestsByTargetLocale(requests);

    for (const [targetLocale, groupedItems] of groupsByLocale) {
      const chunks = chunkArray(groupedItems, MAX_BATCH_SIZE);

      for (const chunk of chunks) {
        const texts = chunk.map((item) => item.request.text);
        const sourceLocale = chunk[0].request.sourceLocale;

        const translations = await this.#callGoogleTranslateApi(texts, sourceLocale, targetLocale);

        for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex++) {
          const { originalIndex } = chunk[chunkIndex];
          const translation = translations[chunkIndex];

          results[originalIndex] = {
            translatedText: translation.translatedText,
            detectedSourceLocale: translation.detectedSourceLanguage,
            provider: PROVIDER_NAME,
          };
        }
      }
    }

    return results;
  }

  async #callGoogleTranslateApi(
    texts: string[],
    sourceLocale: string,
    targetLocale: string,
  ): Promise<GoogleTranslationItem[]> {
    const response = await fetch(GOOGLE_TRANSLATE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': this.#apiKey,
      },
      body: JSON.stringify({
        q: texts,
        source: sourceLocale,
        target: targetLocale,
        format: 'text',
      }),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({
        error: { code: response.status, message: response.statusText },
      }))) as GoogleErrorResponse;

      throw mapGoogleErrorToTranslationError(response.status, errorBody);
    }

    const body = (await response.json()) as GoogleTranslateResponse;
    return body.data.translations;
  }
}
