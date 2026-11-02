import {
  BehaviorSubject,
  catchError,
  defer,
  EMPTY,
  finalize,
  type Observable,
  of,
  Subscription,
  tap,
  throwError,
} from 'rxjs';
import type { KeyedStorage } from '../../shared/storage/keyed-storage';
import { followJob } from './job-polling';

export const JOB_POLL_INTERVAL_MS = 500;

export interface JobTime {
  now(): string;
  poll(intervalMs: number): Observable<unknown>;
}

export interface RunState {
  status: string;
  jobId?: string;
}

export interface RunAdapter<Request, Job, Run extends RunState> {
  start(id: string, request: Request): Observable<Job>;
  getJob(id: string): Observable<Job>;
  jobId(job: Job): string;
  isFinished(job: Job): boolean;
  map(job: Job, previous: Run | undefined, now: string): Run;
  fail(error: unknown, previous: Run, now: string): Run;
}

/** Keyed starts, polling, recovery and persistence, independent of run kind and Angular. */
export class JobRunLifecycle<Request, Job, Run extends RunState> {
  private readonly state = new BehaviorSubject<Record<string, Run>>({});
  readonly changes = this.state.asObservable();
  private readonly pendingStarts = new Map<string, { seed: Run; previous: Run | undefined }>();
  private readonly subscriptions = new Map<string, Subscription>();

  constructor(
    private readonly adapter: RunAdapter<Request, Job, Run>,
    private readonly storage: Pick<KeyedStorage<Record<string, Run>>, 'read' | 'write' | 'remove'>,
    private readonly time: JobTime,
  ) {}

  get runs(): Record<string, Run> {
    return this.state.value;
  }

  private persist(): void {
    const runs = { ...this.runs };
    // A write for another key must retain the last accepted run, never a busy seed.
    for (const [id, pending] of this.pendingStarts) {
      if (runs[id] !== pending.seed) continue;
      if (pending.previous) runs[id] = pending.previous;
      else delete runs[id];
    }
    if (Object.keys(runs).length) this.storage.write(runs);
    else this.storage.remove();
  }

  private set(id: string, run: Run, persist = true): void {
    this.state.next({ ...this.runs, [id]: run });
    if (persist) this.persist();
  }

  private stop(id: string): void {
    this.subscriptions.get(id)?.unsubscribe();
    this.subscriptions.delete(id);
  }

  clear(id: string): void {
    this.stop(id);
    const { [id]: _removed, ...runs } = this.runs;
    this.state.next(runs);
    this.persist();
  }

  private follow(id: string, initial: Observable<Job>, resumed: boolean): void {
    this.stop(id);
    const subscription = new Subscription();
    this.subscriptions.set(id, subscription);
    subscription.add(
      followJob(initial, {
        getJob: (jobId) => this.adapter.getJob(jobId),
        jobId: (job) => this.adapter.jobId(job),
        isFinished: (job) => this.adapter.isFinished(job),
        poll: (ms) => this.time.poll(ms),
        intervalMs: JOB_POLL_INTERVAL_MS,
      })
        .pipe(
          tap((job) => this.set(id, this.adapter.map(job, this.runs[id], this.time.now()))),
          catchError((error: unknown) => {
            const run = this.runs[id];
            if (resumed) this.clear(id);
            else if (run) this.set(id, this.adapter.fail(error, run, this.time.now()));
            return EMPTY;
          }),
        )
        .subscribe(),
    );
  }

  /**
   * Bundles use immediate starts: persist seeded locale progress before acceptance.
   * Request errors become failed runs so they also advance a bundle batch.
   */
  start(id: string, request: Request, seed: Run): boolean {
    if (this.runs[id]?.status === 'running') return false;
    this.set(id, seed);
    this.follow(
      id,
      defer(() => this.adapter.start(id, request)),
      false,
    );
    return true;
  }

  /**
   * Export/import dialogs use lazy acceptance: return request errors to the dialog
   * and restore the previous result on rejection or unsubscribe. Busy seeds never
   * reach storage, even when another key persists while acceptance is pending.
   */
  startAccepted(id: string, request: Request, seed: Run): Observable<Job> {
    return defer(() => {
      if (this.runs[id]?.status === 'running') return EMPTY;
      const previous = this.runs[id];
      const pending = { seed, previous };
      this.pendingStarts.set(id, pending);
      let accepted = false;
      const restorePrevious = (): void => {
        if (this.pendingStarts.get(id) === pending) this.pendingStarts.delete(id);
        if (accepted || this.runs[id] !== seed) return;
        const { [id]: _removed, ...runs } = this.runs;
        this.state.next(previous ? { ...runs, [id]: previous } : runs);
      };
      // The busy state belongs to the dialog until the server accepts a job.
      // Keep the previous persisted run intact during the start request.
      this.set(id, seed, false);
      return defer(() => this.adapter.start(id, request)).pipe(
        tap((job) => {
          accepted = true;
          this.follow(id, of(job), false);
        }),
        catchError((error: unknown) => {
          restorePrevious();
          return throwError(() => error);
        }),
        finalize(restorePrevious),
      );
    });
  }

  /**
   * Bundles retain legacy seeds without job ids (the default). Export/import use
   * dropInterrupted=true to discard unaccepted starts and replace even terminal
   * subscriptions when restoring their one-key persisted result.
   */
  restore(dropInterrupted = false): void {
    const runs = this.storage.read() ?? {};
    if (!Object.keys(runs).length) return;
    this.state.next(runs);
    for (const [id, run] of Object.entries(runs)) {
      if (dropInterrupted) this.stop(id);
      if (run.status !== 'running') continue;
      const jobId = run.jobId;
      if (jobId)
        this.follow(
          id,
          defer(() => this.adapter.getJob(jobId)),
          true,
        );
      else if (dropInterrupted) this.clear(id);
    }
  }

  destroy(): void {
    for (const id of this.subscriptions.keys()) this.stop(id);
    this.state.complete();
  }
}
