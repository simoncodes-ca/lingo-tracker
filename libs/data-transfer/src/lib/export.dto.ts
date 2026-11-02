import type { TranslationStatus as TranslationStatusDto } from './translation-status';

export type ExportFormatDto = 'xliff' | 'json';
export type ExportJsonStructureDto = 'hierarchical' | 'flat';

export interface ExportJsonOptionsDto {
  readonly structure?: ExportJsonStructureDto; // default hierarchical
  readonly rich?: boolean; // default false
  readonly includeBase?: boolean;
  readonly basePropertyName?: string; // default 'baseValue'
  readonly includeStatus?: boolean;
  readonly includeComment?: boolean;
  readonly includeTags?: boolean;
}

/** Body of POST /api/exports and POST /api/exports/dry-run. Mirrors the CLI export flags. */
export interface ExportRequestDto {
  readonly format: ExportFormatDto;
  /** Collection names. Omitted: every collection. */
  readonly collections?: readonly string[];
  /** Target locales. Omitted: every target locale of the chosen collections. */
  readonly locales?: readonly string[];
  /** Status filter. Omitted: the CLI default ['new', 'stale']. Empty array is rejected. */
  readonly statuses?: readonly TranslationStatusDto[];
  readonly tags?: readonly string[];
  /** Relative to the project root, or absolute. Omitted: config exportFolder, else dist/lingo-export. */
  readonly outputDirectory?: string;
  readonly filenamePattern?: string;
  /** Default true. Maps to --no-protect-notes when false. */
  readonly protectedTermNotes?: boolean;
  readonly json?: ExportJsonOptionsDto;
}

export interface ExportPlanFileDto {
  readonly locale: string;
  /** Relative to the project root. */
  readonly path: string;
  readonly exists: boolean;
  readonly entriesCount: number;
}
export interface ExportPlanDto {
  readonly format: ExportFormatDto;
  readonly outputDirectory: string; // relative to project root
  readonly collections: readonly string[];
  readonly locales: readonly string[];
  readonly files: readonly ExportPlanFileDto[];
  readonly skippedLocales: readonly { locale: string; reason: 'no-matching-entries' }[];
  readonly entriesTotal: number;
  readonly overwriteCount: number;
  readonly exampleKey?: { key: string; baseValue: string; collection: string };
  readonly warnings: readonly string[]; // capped at 50 like bundle conflicts
  readonly errors: readonly string[];
  readonly hierarchicalConflicts: readonly string[];
  /** Set when the output folder cannot be used; the run would fail before writing. */
  readonly outputProblem?: string;
}

export type ExportJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export interface ExportJobProgressDto {
  readonly current: number;
  readonly total: number;
  readonly currentFile?: string;
}
export interface ExportJobResultDto {
  readonly filesWritten: readonly string[]; // relative to project root
  readonly entriesExported: number;
  readonly localeResults: readonly {
    locale: string;
    outcome: 'exported' | 'skipped' | 'failed';
    entriesExported: number;
    file?: string;
    error?: string;
  }[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly outcome: 'succeeded' | 'failed';
  readonly outputDirectory: string;
  readonly format: ExportFormatDto;
}
export interface ExportJobDto {
  readonly jobId: string;
  readonly status: ExportJobStatus;
  readonly progress: ExportJobProgressDto;
  readonly request: ExportRequestDto; // echoed so Retry can reopen the dialog after a reload
  readonly result?: ExportJobResultDto; // once completed
  readonly error?: string; // once failed
  readonly startedAt?: string;
  readonly completedAt?: string;
}
