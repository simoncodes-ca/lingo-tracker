import { concat, type Observable, of, switchMap, takeWhile } from 'rxjs';

/** Emits the accepted snapshot and each poll, including the terminal snapshot. */
export function followJob<Job>(
  initial: Observable<Job>,
  deps: {
    getJob: (id: string) => Observable<Job>;
    jobId: (job: Job) => string;
    isFinished: (job: Job) => boolean;
    poll: (ms: number) => Observable<unknown>;
    intervalMs: number;
  },
): Observable<Job> {
  return initial.pipe(
    switchMap((job) =>
      deps.isFinished(job)
        ? of(job)
        : concat(
            of(job),
            deps.poll(deps.intervalMs).pipe(
              switchMap(() => deps.getJob(deps.jobId(job))),
              takeWhile((snapshot) => !deps.isFinished(snapshot), true),
            ),
          ),
    ),
  );
}
