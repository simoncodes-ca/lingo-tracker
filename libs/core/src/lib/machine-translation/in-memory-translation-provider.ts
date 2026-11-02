import type {
  ProviderCapabilities,
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from './translation-provider';

/** Produces the translation of one request. May throw (for example a `TranslationError`) to simulate a failure. */
export type InMemoryTranslate = (request: TranslateRequest) => string;

/** Default transform: prefixes the text with the target locale, e.g. `Save` → `[fr] Save`. */
const prefixWithLocale: InMemoryTranslate = ({ text, targetLocale }) => `[${targetLocale}] ${text}`;

/**
 * A translation provider that runs in memory: each text is translated by a function (default:
 * `[locale] text`), and every `translate` call is recorded in {@link calls}. Inject it with
 * `openTranslator(collection, { provider })`, or through the `provider` option of the operations
 * that translate, to run them without a network or an API key.
 */
export class InMemoryTranslationProvider implements TranslationProvider {
  /** The requests of every `translate` call, in call order. */
  readonly calls: TranslateRequest[][] = [];
  readonly #translate: InMemoryTranslate;

  constructor(translate: InMemoryTranslate = prefixWithLocale) {
    this.#translate = translate;
  }

  async translate(requests: TranslateRequest[]): Promise<TranslateResult[]> {
    this.calls.push([...requests]);
    return requests.map((request) => ({ translatedText: this.#translate(request), provider: 'in-memory' }));
  }

  getCapabilities(): ProviderCapabilities {
    return { supportsBatch: true, maxBatchSize: Number.MAX_SAFE_INTEGER, supportsFormality: false };
  }
}
