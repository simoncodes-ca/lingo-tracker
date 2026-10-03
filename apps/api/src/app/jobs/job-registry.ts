import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { JobNotFoundError } from './job-not-found.error';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Finished jobs older than this are evicted on the next start. */
export const JOB_RETENTION_MS = 30 * 60 * 1000;
/** Finished jobs are evicted first when a new job would exceed this count. */
export const MAX_RETAINED_JOBS = 100;

interface Job<TState> {
  jobId: string;
  status: JobStatus;
  state: TState;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export type JobSnapshot<TFields> = TFields & {
  jobId: string;
  status: JobStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export interface JobRun<TState> {
  initial: TState;
  execute: (jobId: string, update: (patch: Partial<TState>) => void) => Promise<void>;
  onError?: (jobId: string, message: string) => void;
}

/** One serial queue and one bounded, in-memory job map per registry instance. */
export class JobRegistry<TState extends object, TFields extends { status: JobStatus }> {
  readonly #jobs = new Map<string, Job<TState>>();
  readonly #project: (state: TState, status: JobStatus) => TFields;
  readonly #errorBeforeTimestamps: boolean;
  readonly #jobName: string;
  #queue: Promise<void> = Promise.resolve();

  constructor(
    project: (state: TState, status: JobStatus) => TFields,
    options: {
      /** Used only to build the not-found message, e.g. "Bundle job". */
      jobName: string;
      errorBeforeTimestamps?: boolean;
    },
  ) {
    this.#project = project;
    this.#jobName = options.jobName;
    this.#errorBeforeTimestamps = options.errorBeforeTimestamps ?? false;
  }

  /** Registers a pending job and returns its snapshot before execution starts. */
  start(run: JobRun<TState>): JobSnapshot<TFields> {
    this.#evictFinishedJobs();
    const jobId = randomUUID();
    const job: Job<TState> = { jobId, status: 'pending', state: run.initial };
    this.#jobs.set(jobId, job);

    this.#queue = this.#queue
      .then(async () => {
        job.status = 'running';
        job.startedAt = new Date();
        try {
          await run.execute(jobId, (patch) => {
            Object.assign(job.state, patch);
          });
          job.status = 'completed';
        } catch (error: unknown) {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : 'An unexpected error occurred';
          run.onError?.(jobId, job.error);
        } finally {
          job.completedAt = new Date();
        }
      })
      .catch((error: unknown) => {
        Logger.error(`Job ${jobId} error reporter failed`, error);
      });

    return this.#snapshot(job);
  }

  /** Returns a new snapshot, or throws the same not-found error for a missing or wrong-owner job. */
  get(jobId: string, options: { owner?: (state: TState) => boolean } = {}): JobSnapshot<TFields> {
    const job = this.#jobs.get(jobId);
    if (!job || (options.owner && !options.owner(job.state))) {
      throw new JobNotFoundError(jobId, this.#jobName);
    }
    return this.#snapshot(job);
  }

  #snapshot(job: Job<TState>): JobSnapshot<TFields> {
    return {
      jobId: job.jobId,
      ...this.#project(job.state, job.status),
      ...(this.#errorBeforeTimestamps && job.error !== undefined && { error: job.error }),
      ...(job.startedAt && { startedAt: job.startedAt.toISOString() }),
      ...(job.completedAt && { completedAt: job.completedAt.toISOString() }),
      ...(!this.#errorBeforeTimestamps && job.error !== undefined && { error: job.error }),
    };
  }

  #evictFinishedJobs(): void {
    const now = Date.now();
    const finished = [...this.#jobs.values()]
      .filter((job) => job.completedAt !== undefined)
      .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0));

    for (const job of finished) {
      if (now - (job.completedAt?.getTime() ?? now) > JOB_RETENTION_MS) {
        this.#jobs.delete(job.jobId);
      }
    }

    // Leave room for the job start() is about to register. Active jobs may exceed the cap.
    let excess = this.#jobs.size - (MAX_RETAINED_JOBS - 1);
    for (const job of finished) {
      if (excess <= 0) break;
      if (this.#jobs.delete(job.jobId)) excess--;
    }
  }
}
