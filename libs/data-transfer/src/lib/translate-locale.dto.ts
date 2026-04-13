export interface TranslateLocaleRequestDto {
  readonly locale: string;
}

export interface TranslateLocaleJobDto {
  readonly jobId: string;
  readonly collectionName: string;
  readonly targetLocale: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly totalResources: number;
  readonly translatedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly failures?: ReadonlyArray<{ key: string; error: string }>;
  readonly skippedKeys?: readonly string[];
  readonly startedAt?: string;
  readonly completedAt?: string;
}
