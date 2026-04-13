/**
 * Configuration for automatic translation providers (e.g. Google Translate).
 * When enabled, the CLI and API can auto-translate new resources using the
 * specified provider and API key sourced from the given environment variable.
 */
export interface TranslationConfig {
  readonly enabled: boolean;
  readonly provider: string;
  readonly apiKeyEnv: string;
  /** Number of resources to send per API batch when translating a full locale. Defaults to 5. */
  readonly batchSize?: number;
  /** Milliseconds to wait between batches to avoid rate-limit errors. Defaults to 1000. */
  readonly delayMs?: number;
}
