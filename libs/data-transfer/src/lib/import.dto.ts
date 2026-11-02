import type { TranslationStatus } from './translation-status';

export const IMPORT_UPLOAD_MAX_FILES = 10;
export const IMPORT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const IMPORT_UPLOAD_EXTENSIONS = ['.xliff', '.xlf', '.json'] as const;

export interface ImportSourceListingDto {
  readonly collection: string;
  /** Resolved folder, relative to the project root when inside it, else absolute. */
  readonly folder: string;
  /** Effective collection import folder, in the same relative-or-absolute form as folder. */
  readonly defaultFolder: string;
  /** False when the folder does not exist; `files` is then empty and this is not an error. */
  readonly exists: boolean;
  readonly files: readonly ImportSourceFileDto[];
}

export interface ImportSourceFileDto {
  /** Path as the request must send it back, relative to the project root when possible. */
  readonly path: string;
  readonly name: string;
  readonly format: 'xliff' | 'json';
  readonly sizeBytes: number;
  readonly modifiedAt: string; // ISO
  /** Inferred locale in its configured spelling (or baseLocale); request locales must match exactly. */
  readonly locale?: string;
  /** Raw non-empty XLIFF target-language attribute, without locale normalization. Empty attributes are omitted. */
  readonly xliffTargetLanguage?: string;
  readonly localeSource?: 'xliff-target-language' | 'file-name';
  /**
   * 'not-configured' when a non-empty XLIFF target-language matches neither configured locales nor the base locale,
   * regardless of filename inference.
   * Otherwise 'base-locale' when the returned locale is the base locale.
   * XLIFF locale matching ignores case and treats underscores as hyphens, as locale inference does.
   */
  readonly localeProblem?: 'not-configured' | 'base-locale';
}

export type ImportStrategyDto = 'translation-service' | 'verification' | 'migration' | 'update';

export interface ImportFileRequestDto {
  readonly path: string;
  /** Must exactly match a configured locale or baseLocale. The listing returns the spelling to use. */
  readonly locale: string;
  /** Explicit format when the extension is ambiguous. */
  readonly format?: 'xliff' | 'json';
}

/** Body of POST /api/imports and POST /api/imports/dry-run. Mirrors the CLI import flags. */
export interface ImportRequestDto {
  readonly collection: string;
  readonly files: readonly ImportFileRequestDto[]; // 1..n, processed in order
  readonly strategy?: ImportStrategyDto; // default translation-service
  readonly createMissing?: boolean; // default from strategy
  readonly updateComments?: boolean; // default from strategy
  readonly updateTags?: boolean; // default from strategy
  readonly preserveStatus?: boolean; // default false
  readonly validateBase?: boolean; // default true
}

export interface ImportPlanFileDto {
  readonly path: string;
  readonly locale: string;
  readonly format: 'xliff' | 'json';
  /** Entries found in the file after parsing (before validation). */
  readonly entries: number;
  /** Created + updated entries, in both preview and job results. */
  readonly imported: number;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
  /**
   * Number of distinct resource files in filesAffected, including data and metadata.
   * This is a file count, not an entry count. Zero means no resource files would be written (preview)
   * or were written (job result).
   */
  readonly changed: number;
  readonly statusTransitions: readonly { from?: TranslationStatus; to: TranslationStatus; count: number }[];
  readonly warnings: readonly string[]; // capped
  readonly errors: readonly string[]; // capped
  /** Set when the file could not be read or parsed; the counts above are then zero. */
  readonly sourceProblem?: string;
}

export interface ImportPlanDto {
  readonly collection: string;
  readonly strategy: ImportStrategyDto;
  readonly files: readonly ImportPlanFileDto[];
  readonly totals: {
    entries: number;
    /** Sum of per-file imported counts (created + updated). */
    imported: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    /** Sum of per-file changed resource-file counts. Repeated writes across request files count separately. */
    changed: number;
  };
  readonly statusTransitions: readonly { from?: TranslationStatus; to: TranslationStatus; count: number }[];
  readonly icuAutoFixes: readonly {
    /** Request file path that produced this auto-fix. */
    path?: string;
    locale: string;
    key: string;
    originalValue: string;
    fixedValue: string;
    description: string;
  }[];
  readonly issues: readonly {
    /** Request file path that produced this issue. */
    path?: string;
    locale: string;
    key: string;
    type: 'failed' | 'skipped';
    reason: string;
  }[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  /** Entries whose size exceeded the CLI's 5 MB advisory threshold, by file. */
  readonly largeFiles: readonly string[];
  readonly truncated: { issues: number; icuAutoFixes: number; warnings: number; errors: number };
}

export type ImportJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ImportJobProgressDto {
  readonly current: number; // files finished
  readonly total: number; // files in the run
  readonly currentFile?: string; // path of the file being imported
  readonly currentLocale?: string;
}

export interface ImportJobResultDto {
  readonly collection: string;
  readonly strategy: ImportStrategyDto;
  readonly files: readonly (ImportPlanFileDto & { outcome: 'imported' | 'failed'; filesModified: readonly string[] })[];
  readonly totals: ImportPlanDto['totals'];
  readonly statusTransitions: ImportPlanDto['statusTransitions'];
  readonly icuAutoFixes: ImportPlanDto['icuAutoFixes'];
  readonly issues: ImportPlanDto['issues'];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly filesModified: readonly string[]; // relative to project root, deduplicated
  readonly outcome: 'succeeded' | 'failed'; // failed when any file failed or any entry failed/errored (CLI exit code rule)
  readonly truncated: ImportPlanDto['truncated'];
}

export interface ImportJobDto {
  readonly jobId: string;
  readonly status: ImportJobStatus;
  readonly progress: ImportJobProgressDto;
  readonly request: ImportRequestDto; // echoed so Retry can reopen the dialog after a reload
  readonly result?: ImportJobResultDto;
  readonly error?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}
