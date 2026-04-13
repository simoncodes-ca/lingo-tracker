export interface TranslationConfigDto {
  readonly enabled: boolean;
  readonly provider: string;
  readonly apiKeyEnv: string;
  /** Number of resources to send per API batch when translating a full locale. Defaults to 5. */
  readonly batchSize?: number;
  /** Milliseconds to wait between batches to avoid rate-limit errors. Defaults to 1000. */
  readonly delayMs?: number;
}
