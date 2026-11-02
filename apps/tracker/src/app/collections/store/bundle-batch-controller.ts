import { toJobErrorMessage } from './job-run-error';
import type { BundleGenerateJobDto } from '@simoncodes-ca/data-transfer';
import { BehaviorSubject, type Observable } from 'rxjs';
import type { KeyedStorage } from '../../shared/storage/keyed-storage';
import { type BundleRunState, isJobFinished, mapJobToRun } from './bundle-runs';
import { JobRunLifecycle, type JobTime } from './job-run-lifecycle';

export const BUNDLE_RUNS_STORAGE_KEY = 'lingo-tracker.bundleRuns';

export interface BundleJobs {
  generate(name: string, locales?: readonly string[]): Observable<BundleGenerateJobDto>;
  getJob(jobId: string): Observable<BundleGenerateJobDto>;
  failureMessage(): string;
}
export interface BundleRunSnapshot {
  bundleRuns: Record<string, BundleRunState>;
  bundleBatch: readonly string[];
  batchPosition: number;
  isBatchRunning: boolean;
}

/** Owns concurrent run lifecycles; its ports require no Angular or HTTP environment. */
export class BundleBatchController {
  private readonly state = new BehaviorSubject<BundleRunSnapshot>({
    bundleRuns: {},
    bundleBatch: [],
    batchPosition: 1,
    isBatchRunning: false,
  });
  readonly changes = this.state.asObservable();
  private readonly lifecycle;

  constructor(
    jobs: BundleJobs,
    storage: Pick<KeyedStorage<Record<string, BundleRunState>>, 'read' | 'write' | 'remove'>,
    time: JobTime,
  ) {
    this.lifecycle = new JobRunLifecycle<readonly string[] | undefined, BundleGenerateJobDto, BundleRunState>(
      {
        start: (name: string, locales: readonly string[] | undefined) => jobs.generate(name, locales),
        getJob: (id) => jobs.getJob(id),
        jobId: (job) => job.jobId,
        isFinished: isJobFinished,
        map: mapJobToRun,
        fail: (error, run, now) => ({
          ...run,
          status: 'failed',
          error: toJobErrorMessage(error, jobs.failureMessage()),
          finishedAt: now,
        }),
      },
      storage,
      time,
    );
    this.lifecycle.changes.subscribe((runs) => this.publish(runs));
  }

  private publish(runs: Record<string, BundleRunState>, batch = this.state.value.bundleBatch): void {
    const finished = batch.filter(
      (name) => runs[name]?.status === 'completed' || runs[name]?.status === 'failed',
    ).length;
    this.state.next({
      bundleRuns: runs,
      bundleBatch: batch,
      batchPosition: Math.min(Math.max(batch.length, 1), finished + 1),
      isBatchRunning: batch.some((name) => runs[name]?.status === 'running'),
    });
  }

  clear(name: string): void {
    this.lifecycle.clear(name);
  }

  start(name: string, locales?: readonly string[], defaultLocaleCount = 0): boolean {
    return this.lifecycle.start(name, locales, {
      status: 'running',
      progress: { current: 0, total: locales?.length ?? defaultLocaleCount },
    });
  }

  startAll(names: readonly string[], defaultLocaleCount = 0): void {
    if (this.state.value.isBatchRunning) return;
    const started = names.filter((name) => this.start(name, undefined, defaultLocaleCount));
    this.publish(this.state.value.bundleRuns, started);
  }

  restore(): void {
    this.lifecycle.restore();
  }

  destroy(): void {
    this.lifecycle.destroy();
    this.state.complete();
  }
}
