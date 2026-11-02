import type { ExportJobDto, ExportRequestDto } from '@simoncodes-ca/data-transfer';
import { exportOptionsPolicy } from '@simoncodes-ca/domain';
import type { JobRunState } from './job-run-controller';

export const EXPORT_RUN_STORAGE_KEY = 'lingo-tracker.exportRun';
export type ExportRunState = JobRunState<ExportRequestDto, ExportJobDto>;

/** Absent or corrupt storage is ignored, as with persisted bundle runs. */
export function readPersistedExportRun(raw: string | null | undefined): ExportRunState | undefined {
  try {
    const run: unknown = JSON.parse(raw ?? 'null');
    if (typeof run !== 'object' || run === null || !('status' in run) || !('request' in run)) return undefined;
    if (!['running', 'completed', 'failed'].includes(String(run.status))) return undefined;
    const request = run.request;
    if (typeof request !== 'object' || request === null || !('format' in request)) return undefined;
    if (!exportOptionsPolicy.isFormat(request.format)) return undefined;
    if ('jobId' in run && typeof run.jobId !== 'string') return undefined;
    return run as ExportRunState;
  } catch {
    return undefined;
  }
}
