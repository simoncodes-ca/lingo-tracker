import { DestroyRef, inject } from '@angular/core';
import { timer } from 'rxjs';
import { SESSION_STORAGE } from '../../../shared/storage/browser-storage';
import { json, KeyedStorage } from '../../../shared/storage/keyed-storage';
import { JobRunController, type JobRunState, type Jobs, type JobSnapshot } from '../job-run-controller';

/** Shared one-key feature wiring; callers retain their existing public method names. */
export function injectJobRun<Request, Job extends JobSnapshot<Request>>(
  jobs: Jobs<Request, Job>,
  storageKey: string,
  read: (raw: string | null | undefined) => JobRunState<Request, Job> | undefined,
  publish: (run: JobRunState<Request, Job> | null) => void,
) {
  const controller = new JobRunController(jobs, new KeyedStorage(inject(SESSION_STORAGE), storageKey, json(read)), {
    now: () => new Date().toISOString(),
    poll: (ms) => timer(ms, ms),
  });
  const subscription = controller.changes.subscribe(publish);
  inject(DestroyRef).onDestroy(() => {
    subscription.unsubscribe();
    controller.destroy();
  });
  return controller;
}
