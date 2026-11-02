import type { ImportJobDto, ImportRequestDto } from '@simoncodes-ca/data-transfer';
import type { JobRunState } from './job-run-controller';

export const IMPORT_RUN_STORAGE_KEY = 'lingo-tracker.importRun';
export type ImportRunState = JobRunState<ImportRequestDto, ImportJobDto>;

/** Absent or corrupt storage is ignored, as with persisted export runs. */
export function readPersistedImportRun(raw: string | null | undefined): ImportRunState | undefined {
  try {
    const run: unknown = JSON.parse(raw ?? 'null');
    if (typeof run !== 'object' || run === null || !('status' in run) || !('request' in run)) return undefined;
    if (!['running', 'completed', 'failed'].includes(String(run.status))) return undefined;
    const request = run.request;
    if (typeof request !== 'object' || request === null) return undefined;
    if (!('collection' in request) || typeof request.collection !== 'string') return undefined;
    if (!('files' in request) || !Array.isArray(request.files)) return undefined;
    if (request.files.length === 0) return undefined;
    if (
      !request.files.every(
        (file: unknown) =>
          typeof file === 'object' &&
          file !== null &&
          !Array.isArray(file) &&
          'path' in file &&
          typeof file.path === 'string' &&
          'locale' in file &&
          typeof file.locale === 'string' &&
          (!('format' in file) || file.format === 'xliff' || file.format === 'json'),
      )
    )
      return undefined;
    if (!('jobId' in run) || typeof run.jobId !== 'string' || run.jobId.trim().length === 0) return undefined;
    if (run.status === 'completed') {
      if (!('result' in run) || typeof run.result !== 'object' || run.result === null || Array.isArray(run.result))
        return undefined;
      const result = run.result;
      if (
        !('totals' in result) ||
        typeof result.totals !== 'object' ||
        result.totals === null ||
        Array.isArray(result.totals)
      )
        return undefined;
      if (!('files' in result) || !Array.isArray(result.files)) return undefined;
    }
    return run as ImportRunState;
  } catch {
    return undefined;
  }
}
