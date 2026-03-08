import type { TranslationProvider } from './translation-provider';
import { TranslationError } from './translation-provider';
import { GoogleTranslateV2Provider } from './google-translate-v2.provider';

/**
 * Instantiates the requested translation provider with the given API key.
 *
 * Currently supported provider names:
 * - `'google-translate'` — Google Cloud Translation API v2
 *
 * @throws {TranslationError} with code `'UNKNOWN_PROVIDER'` when the
 *   requested provider name is not recognised.
 */
export function createTranslationProvider(providerName: string, apiKey: string): TranslationProvider {
  switch (providerName) {
    case 'google-translate':
      return new GoogleTranslateV2Provider({ apiKey });
    default:
      throw new TranslationError(
        `Unknown translation provider: "${providerName}". Supported: google-translate`,
        'UNKNOWN_PROVIDER',
        false,
      );
  }
}
