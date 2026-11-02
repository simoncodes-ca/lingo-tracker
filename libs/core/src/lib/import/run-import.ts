import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Collection } from '../config/open-collection';
import { ImportSourceError } from '../errors/internal';
import type { RunOutcome } from '../run-outcome';
import { detectImportFormat } from './import-common';
import { importResources } from './import-resources';
import { generateImportSummary } from './import-summary';
import { parseJsonImport } from './parse-json-import';
import { parseXliffImport } from './parse-xliff-import';
import type { ImportFormat, ImportResult, ImportRunOptions, ParsedImport } from './types';

const LARGE_FILE_SIZE_THRESHOLD = 5;

export interface RunImportOptions extends ImportRunOptions {
  /** File path as supplied by the caller; also shown in the Markdown summary. */
  source: string;
  format?: ImportFormat;
  /** Base directory for a relative source. Defaults to the process working directory. */
  cwd?: string;
  /** Called after format detection and the size warning, before parsing. */
  onStart?: (format: ImportFormat) => void;
  /** Emitted before onStart so the CLI can print a large-file warning before its header. */
  onWarning?: (warning: ImportRunWarning) => void;
}

export interface ImportRunWarning {
  message: string;
  details?: string[];
}

export interface RunImportResult {
  readonly outcome: RunOutcome;
  /** Source entries before validation, including entries the parser skipped. Always supplied by runImport. */
  readonly entriesParsed?: number;
  format: ImportFormat;
  result: ImportResult;
  /** Render only when needed: a summary failure must not hide an already completed import. */
  summary: () => string;
}

/** Reads and imports one source file, returning the resource outcome and a lazy summary renderer. */
export async function runImport(collection: Collection, options: RunImportOptions): Promise<RunImportResult> {
  const sourcePath = resolve(options.cwd ?? process.cwd(), options.source);
  let fileSizeMB: number | undefined;
  try {
    fileSizeMB = statSync(sourcePath).size / (1024 * 1024);
  } catch {
    // Size inspection is advisory. The format adapter reports any source failure.
  }
  if (fileSizeMB !== undefined && fileSizeMB > LARGE_FILE_SIZE_THRESHOLD) {
    const warning = {
      message: `Large import file detected: ${fileSizeMB.toFixed(2)} MB`,
      details: ['Import may take longer than usual.'],
    };
    options.onWarning?.(warning);
  }

  let format: ImportFormat;
  try {
    format = options.format ?? detectImportFormat(options.source);
  } catch (error) {
    throw new ImportSourceError(error instanceof Error ? error.message : String(error), {
      cause: error,
      stage: 'format',
    });
  }

  options.onStart?.(format);
  let parsed: ParsedImport;
  try {
    const parseOptions = { onProgress: options.onProgress };
    parsed =
      format === 'json' ? parseJsonImport(sourcePath, parseOptions) : await parseXliffImport(sourcePath, parseOptions);
  } catch (error) {
    throw new ImportSourceError(error instanceof Error ? error.message : String(error), { cause: error });
  }

  const result = importResources(collection, parsed.resources, options, parsed);
  return {
    format,
    entriesParsed: parsed.resources.length + parsed.skipped.length,
    result,
    outcome: result.resourcesFailed > 0 || result.errors.length > 0 ? 'failed' : 'succeeded',
    summary: () => generateImportSummary(result, { ...options, format, source: options.source }),
  };
}
