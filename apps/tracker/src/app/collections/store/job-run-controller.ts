import { map, type Observable } from 'rxjs';
import type { KeyedStorage } from '../../shared/storage/keyed-storage';
import { toJobErrorMessage } from './job-run-error';
import { JobRunLifecycle, type JobTime } from './job-run-lifecycle';

export interface JobSnapshot<Request> {
  readonly jobId: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly request: Request;
  readonly progress?: unknown;
  readonly result?: unknown;
  readonly error?: string;
  readonly completedAt?: string;
}

export interface JobRunState<Request, Job extends JobSnapshot<Request>> {
  status: 'running' | 'completed' | 'failed';
  jobId?: string;
  request: Request;
  progress?: Job['progress'];
  result?: Job['result'];
  error?: string;
  finishedAt?: string;
}

export interface Jobs<Request, Job> {
  start(request: Request): Observable<Job>;
  getJob(id: string): Observable<Job>;
  failureMessage(): string;
}

/** Adapts a request-bearing job to the one-key lifecycle, preserving its single-run wire format. */
export class JobRunController<Request, Job extends JobSnapshot<Request>> {
  private readonly lifecycle;
  readonly changes;

  constructor(
    jobs: Jobs<Request, Job>,
    storage: Pick<KeyedStorage<JobRunState<Request, Job>>, 'read' | 'write' | 'remove'>,
    time: JobTime,
  ) {
    this.lifecycle = new JobRunLifecycle<Request, Job, JobRunState<Request, Job>>(
      {
        start: (_id, request) => jobs.start(request),
        getJob: (id) => jobs.getJob(id),
        jobId: (job) => job.jobId,
        isFinished: (job) => job.status === 'completed' || job.status === 'failed',
        map: (job, _previous, now) => ({
          status: job.status === 'pending' ? 'running' : job.status,
          jobId: job.jobId,
          request: job.request,
          progress: job.progress,
          result: job.result,
          error: job.error,
          finishedAt: job.status === 'completed' || job.status === 'failed' ? (job.completedAt ?? now) : undefined,
        }),
        fail: (error, run, now) => ({
          ...run,
          status: 'failed',
          error: toJobErrorMessage(error, jobs.failureMessage()),
          finishedAt: now,
        }),
      },
      {
        read: () => {
          const run = storage.read();
          return run ? { run } : undefined;
        },
        write: (runs) => {
          const run = runs['run'];
          if (run) storage.write(run);
          else storage.remove();
        },
        remove: () => storage.remove(),
      },
      time,
    );
    this.changes = this.lifecycle.changes.pipe(map((runs) => runs['run'] ?? null));
  }

  start(request: Request): Observable<Job> {
    return this.lifecycle.startAccepted('run', request, { status: 'running', request });
  }
  retry(): Request | undefined {
    return this.lifecycle.runs['run']?.request;
  }
  clear(): void {
    this.lifecycle.clear('run');
  }
  restore(): void {
    this.lifecycle.restore(true);
  }
  destroy(): void {
    this.lifecycle.destroy();
  }
}
