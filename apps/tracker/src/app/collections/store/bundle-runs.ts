import type {
  BundleGenerateJobDto,
  BundleGenerateJobProgressDto,
  BundleGenerateJobResultDto,
} from '@simoncodes-ca/data-transfer';

/** Client-side lifecycle of a bundle generation run. */
export type BundleRunStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface BundleRunState {
  status: BundleRunStatus;
  /** Server job id, present once the job has been accepted. */
  jobId?: string;
  progress?: BundleGenerateJobProgressDto;
  result?: BundleGenerateJobResultDto;
  error?: string;
  /** ISO timestamp of completion or failure. */
  finishedAt?: string;
}

const RUN_STATUSES: readonly BundleRunStatus[] = ['idle', 'running', 'completed', 'failed'];

function isBundleRunState(value: unknown): value is BundleRunState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    RUN_STATUSES.includes((value as BundleRunState).status)
  );
}

/** Parses persisted runs without accessing storage; absent or corrupt data is ignored. */
export function readPersistedRuns(raw: string | null | undefined): Record<string, BundleRunState> {
  try {
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, run]) => isBundleRunState(run)));
  } catch {
    return {};
  }
}

export function isJobFinished(job: BundleGenerateJobDto): boolean {
  return job.status === 'completed' || job.status === 'failed';
}

function toRunStatus(status: BundleGenerateJobDto['status']): BundleRunStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'running';
  }
}

export function mapJobToRun(
  job: BundleGenerateJobDto,
  previous: BundleRunState | undefined,
  finishedAt: string,
): BundleRunState {
  const finished = isJobFinished(job);
  // A freshly queued job reports {current: 0, total: 0} until its first progress
  // event lands. Keep the total we seeded from the locale list so the card shows
  // "0 of 6 locales" and a sized bar from the first frame instead of a bare strip.
  const progress =
    job.progress.total > 0 || !previous?.progress?.total
      ? job.progress
      : { ...job.progress, total: previous.progress.total };
  return {
    status: toRunStatus(job.status),
    jobId: job.jobId,
    progress,
    result: job.status === 'completed' ? job.result : previous?.result,
    error: job.status === 'failed' ? job.error : undefined,
    finishedAt: finished ? (job.completedAt ?? finishedAt) : undefined,
  };
}
