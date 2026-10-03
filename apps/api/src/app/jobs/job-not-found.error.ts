import { LingoTrackerError } from '@simoncodes-ca/core';

/** An unknown, evicted, or differently owned job is unavailable to this caller. */
export class JobNotFoundError extends LingoTrackerError {
  readonly kind = 'not-found' as const;

  constructor(
    readonly jobId: string,
    jobName: string,
  ) {
    super(`${jobName} job "${jobId}" not found`, 'JOB_NOT_FOUND');
  }
}
