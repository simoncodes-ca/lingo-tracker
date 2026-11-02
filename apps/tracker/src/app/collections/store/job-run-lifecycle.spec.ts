import type { BundleGenerateJobDto, ImportJobDto, ImportRequestDto } from '@simoncodes-ca/data-transfer';
import { type Observable, of, Subject, throwError, timer } from 'rxjs';
import { TestScheduler } from 'rxjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api-error/api-error';
import { json, KeyedStorage, MemoryStorageAdapter } from '../../shared/storage/keyed-storage';
import { BundleBatchController, type BundleRunSnapshot } from './bundle-batch-controller';
import { type BundleRunState, readPersistedRuns } from './bundle-runs';

import { IMPORT_RUN_STORAGE_KEY, type ImportRunState, readPersistedImportRun } from './import-runs';
import { JobRunController } from './job-run-controller';
import { JobRunLifecycle, JOB_POLL_INTERVAL_MS } from './job-run-lifecycle';

describe('Job Run Lifecycle: keyed bundle adapter', () => {
  const running: BundleGenerateJobDto = {
    jobId: 'job',
    bundleName: 'main',
    status: 'running',
    progress: { current: 0, total: 0 },
  };
  const completed: BundleGenerateJobDto = {
    ...running,
    status: 'completed',
    progress: { current: 2, total: 2 },
    result: { filesGenerated: [], keysPerLocale: {}, warnings: ['opaque warning'], localesProcessed: ['en', 'fr'] },
  };

  function setup() {
    const clock = new TestScheduler(() => undefined);
    clock.maxFrames = 1500;
    const adapter = new MemoryStorageAdapter();
    const storage = new KeyedStorage<Record<string, BundleRunState>>(() => adapter, 'runs', json(readPersistedRuns));
    const jobs = {
      generate: vi.fn((_name: string, _locales?: readonly string[]) => of(running)),
      getJob: vi.fn((_id: string) => of(completed)),
      failureMessage: () => 'Generation failed',
    };
    const controller = new BundleBatchController(jobs, storage, {
      now: () => new Date(clock.now()).toISOString(),
      poll: (ms) => timer(ms, ms, clock),
    });
    let state: BundleRunSnapshot = { bundleRuns: {}, bundleBatch: [], batchPosition: 1, isBatchRunning: false };
    controller.changes.subscribe((next) => {
      state = next;
    });
    return { controller, jobs, storage, adapter, clock, state: () => state };
  }

  describe('BundleBatchController', () => {
    it('seeds progress, suppresses duplicate starts, polls to completion and stops polling', () => {
      const h = setup();
      expect(h.controller.start('main', ['en', 'fr'])).toBe(true);
      expect(h.jobs.generate).toHaveBeenCalledWith('main', ['en', 'fr']);
      expect(h.state().bundleRuns['main']?.progress?.total).toBe(2);
      expect(h.controller.start('main')).toBe(false);
      h.clock.flush();
      expect(h.jobs.getJob).toHaveBeenCalledTimes(1);
      expect(h.state().bundleRuns['main']).toMatchObject({
        status: 'completed',
        result: completed.result,
        finishedAt: new Date(500).toISOString(),
      });
      expect(h.storage.read()).toEqual(h.state().bundleRuns);
      h.controller.destroy();
    });

    it('replaces a previous result, supports immediate terminal jobs and dismissal', () => {
      const h = setup();
      h.jobs.generate.mockReturnValue(of(completed));
      h.controller.start('main');
      h.jobs.generate.mockReturnValue(of(running));
      h.controller.start('main', [], 6);
      expect(h.state().bundleRuns['main']?.result).toBeUndefined();
      expect(h.state().bundleRuns['main']?.progress?.total).toBe(0);
      h.controller.destroy();
      h.clock.flush();
      expect(h.jobs.getJob).not.toHaveBeenCalled();
      h.controller.clear('main');
      expect(h.storage.read()).toBeUndefined();
    });

    it('records request and poll errors using the injected time and preserves rule details', () => {
      const h = setup();
      h.jobs.generate.mockReturnValue(
        throwError(
          () =>
            new ApiError({
              kind: 'invalid',
              status: 400,
              serverMessage: 'Invalid bundle definition',
              details: ['rule'],
            }),
        ),
      );
      h.controller.start('request');
      expect(h.state().bundleRuns['request']).toMatchObject({
        status: 'failed',
        error: 'Invalid bundle definition: rule',
        finishedAt: new Date(0).toISOString(),
      });
      h.jobs.generate.mockReturnValue(of(running));
      h.jobs.getJob.mockReturnValue(throwError(() => new Error('poll failed')));
      h.controller.start('poll', undefined, 6);
      h.clock.flush();
      expect(h.state().bundleRuns['poll']).toMatchObject({ status: 'failed', finishedAt: new Date(500).toISOString() });
      h.controller.destroy();
    });

    it('resumes persisted jobs immediately, polls active ones and drops unknown restored jobs', () => {
      const h = setup();
      h.storage.write({ main: { status: 'running', jobId: 'job' }, old: { status: 'completed' } });
      h.jobs.getJob.mockReturnValue(of(running));
      h.controller.restore();
      expect(h.jobs.getJob).toHaveBeenCalledWith('job');
      expect(h.state().bundleBatch).toEqual([]);
      h.jobs.getJob.mockReturnValue(of(completed));
      h.clock.flush();
      expect(h.state().bundleRuns['main']?.status).toBe('completed');
      h.jobs.getJob.mockReturnValue(throwError(() => new Error('evicted')));
      h.storage.write({ main: { status: 'running', jobId: 'missing' }, old: { status: 'completed' } });
      h.controller.restore();
      expect(h.state().bundleRuns['main']).toBeUndefined();
      expect(h.storage.read()).toEqual({ old: { status: 'completed' } });
      h.controller.destroy();
    });

    it('leaves live runs intact when persisted data is absent or corrupt', () => {
      const h = setup();
      h.jobs.generate.mockReturnValue(of(completed));
      h.controller.start('main');
      const before = h.state().bundleRuns;
      h.storage.remove();
      h.controller.restore();
      expect(h.state().bundleRuns).toBe(before);
      h.adapter.setItem('runs', '{corrupt');
      h.controller.restore();
      expect(h.state().bundleRuns).toBe(before);
      h.controller.destroy();
    });

    it('skips running bundles, tracks batch progress and refuses to replace an active batch', () => {
      const h = setup();
      h.controller.start('already');
      h.jobs.generate.mockImplementation((name) => of({ ...running, jobId: name }));
      h.controller.startAll(['already', 'first', 'second'], 2);
      expect(h.state().bundleBatch).toEqual(['first', 'second']);
      expect(h.state().batchPosition).toBe(1);
      h.controller.startAll(['third']);
      expect(h.jobs.generate).toHaveBeenCalledTimes(3);
      h.jobs.getJob.mockImplementation((id) => of(id === 'first' ? completed : running));
      h.clock.schedule(() => {
        expect(h.state().batchPosition).toBe(2);
        expect(h.state().isBatchRunning).toBe(true);
        h.jobs.getJob.mockReturnValue(of({ ...running, status: 'failed', error: 'failed' }));
      }, 501);
      h.clock.flush();
      expect(h.state().isBatchRunning).toBe(false);
      expect(h.state().batchPosition).toBe(2);
      h.controller.startAll([]);
      expect(h.state().bundleBatch).toEqual([]);
      expect(h.state().batchPosition).toBe(1);
      h.controller.destroy();
    });

    it('counts synchronous failures as batch starts and cancels pending requests on destroy', () => {
      const h = setup();
      h.jobs.generate.mockReturnValue(throwError(() => new Error('rejected')));
      h.controller.startAll(['first', 'second']);
      expect(h.state()).toMatchObject({ bundleBatch: ['first', 'second'], batchPosition: 2, isBatchRunning: false });
      const pending = new Subject<BundleGenerateJobDto>();
      h.jobs.generate.mockReturnValue(pending);
      h.controller.start('pending');
      h.controller.destroy();
      pending.next(completed);
      expect(h.state().bundleRuns['pending']?.status).toBe('running');
    });
    it('cancels only the cleared bundle and prevents its run from returning to storage', () => {
      const h = setup();
      h.jobs.generate.mockImplementation((name) => of({ ...running, jobId: name }));
      h.controller.start('deleted');
      h.controller.start('remaining');
      h.controller.clear('deleted');
      h.clock.flush();
      expect(h.jobs.getJob).toHaveBeenCalledTimes(1);
      expect(h.jobs.getJob).toHaveBeenCalledWith('remaining');
      expect(h.state().bundleRuns['deleted']).toBeUndefined();
      expect(h.storage.read()?.['deleted']).toBeUndefined();
      expect(h.state().bundleRuns['remaining']?.status).toBe('completed');
      h.controller.clear('remaining');
      expect(h.adapter.getItem('runs')).toBeNull();
      h.controller.destroy();
    });

    it('drops a resumed run when a later poll fails and preserves other persisted runs', () => {
      const h = setup();
      h.storage.write({ main: { status: 'running', jobId: 'job' }, other: { status: 'completed' } });
      h.jobs.getJob
        .mockReturnValueOnce(of(running))
        .mockReturnValue(throwError(() => new Error('evicted during poll')));
      h.controller.restore();
      expect(h.state().bundleRuns['main']?.status).toBe('running');
      h.clock.flush();
      expect(h.jobs.getJob).toHaveBeenCalledTimes(2);
      expect(h.state().bundleRuns['main']).toBeUndefined();
      expect(h.storage.read()).toEqual({ other: { status: 'completed' } });
      h.controller.destroy();
    });

    it('replaces the previous subscription when resuming the same bundle again', () => {
      const h = setup();
      h.jobs.getJob.mockReturnValue(of(running));
      h.storage.write({ main: { status: 'running', jobId: 'job' } });
      h.controller.restore();
      h.controller.restore();
      h.jobs.getJob.mockClear();
      h.jobs.getJob.mockReturnValue(of(completed));
      h.clock.flush();
      expect(h.jobs.getJob).toHaveBeenCalledTimes(1);
      h.controller.destroy();
    });
  });
});
describe('Job Run Lifecycle: one-key request adapter', () => {
  const request: ImportRequestDto = { collection: 'main', files: [{ path: 'in/fr.xliff', locale: 'fr' }] };
  const running: ImportJobDto = { jobId: 'job', request, status: 'running', progress: { current: 0, total: 1 } };
  const completed: ImportJobDto = {
    ...running,
    status: 'completed',
    progress: { current: 1, total: 1 },
    completedAt: '2026-10-19T12:00:00Z',
    result: {
      collection: 'main',
      strategy: 'translation-service',
      files: [],
      totals: { entries: 2, imported: 2, created: 0, updated: 2, skipped: 0, failed: 0, changed: 1 },
      statusTransitions: [],
      icuAutoFixes: [],
      issues: [],
      warnings: [],
      errors: [],
      filesModified: ['fr/resource_entries.json'],
      outcome: 'succeeded',
      truncated: { issues: 0, icuAutoFixes: 0, warnings: 0, errors: 0 },
    },
  };

  const jobs = { start: vi.fn(), getJob: vi.fn(), failureMessage: () => 'Import failed' };
  let adapter: MemoryStorageAdapter;
  let storage: KeyedStorage<ImportRunState>;
  let ticks: Subject<void>;
  let controller: JobRunController<ImportRequestDto, ImportJobDto>;
  let latest: ImportRunState | null;
  const poll = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    adapter = new MemoryStorageAdapter();
    storage = new KeyedStorage(() => adapter, IMPORT_RUN_STORAGE_KEY, json(readPersistedImportRun));
    ticks = new Subject<void>();
    poll.mockReturnValue(ticks);
    controller = new JobRunController<ImportRequestDto, ImportJobDto>(jobs, storage, { now: () => 'now', poll });
    controller.changes.subscribe((run) => {
      latest = run;
    });
  });

  describe('JobRunController with import jobs', () => {
    it('persists accepted progress, polls inclusively to completion and restores the result without polling', () => {
      jobs.start.mockReturnValue(of({ ...running, status: 'pending' }));
      jobs.getJob.mockReturnValue(of(completed));
      const accepted = vi.fn();
      controller.start(request).subscribe(accepted);
      expect(accepted).toHaveBeenCalledOnce();
      expect(latest).toMatchObject({ status: 'running', jobId: 'job', request });
      expect(storage.read()).toEqual(latest);
      expect(poll).toHaveBeenCalledWith(JOB_POLL_INTERVAL_MS);
      ticks.next();
      expect(latest).toMatchObject({
        status: 'completed',
        result: completed.result,
        finishedAt: completed.completedAt,
      });
      ticks.next();
      expect(jobs.getJob).toHaveBeenCalledExactlyOnceWith('job');
      controller.destroy();
      const restored = new JobRunController<ImportRequestDto, ImportJobDto>(jobs, storage, { now: () => 'now', poll });
      restored.changes.subscribe((run) => {
        latest = run;
      });
      restored.restore();
      expect(latest).toEqual(storage.read());
      expect(restored.retry()).toEqual(request);
      expect(jobs.getJob).toHaveBeenCalledTimes(1);
      restored.destroy();
    });

    it('restores active runs immediately and resumes polling', () => {
      storage.write({ status: 'running', jobId: 'job', request });
      jobs.getJob.mockReturnValueOnce(of(running)).mockReturnValueOnce(of(completed));
      controller.restore();
      expect(jobs.getJob).toHaveBeenCalledWith('job');
      ticks.next();
      expect(latest?.status).toBe('completed');
      expect(jobs.start).not.toHaveBeenCalled();
      controller.destroy();
    });

    it('persists terminal job failures and keeps their request for retry', () => {
      jobs.start.mockReturnValue(of(running));
      jobs.getJob.mockReturnValue(of({ ...running, status: 'failed', error: 'Read failed' }));
      controller.start(request).subscribe();
      ticks.next();
      expect(latest).toMatchObject({ status: 'failed', error: 'Read failed', finishedAt: 'now' });
      expect(storage.read()).toEqual(latest);
      expect(controller.retry()).toEqual(request);
      controller.destroy();
    });

    it('persists polling errors for a newly accepted run', () => {
      jobs.start.mockReturnValue(of(running));
      jobs.getJob.mockReturnValue(throwError(() => new Error('Job lost')));
      controller.start(request).subscribe();
      ticks.next();
      expect(latest).toMatchObject({ status: 'failed', error: 'Job lost', finishedAt: 'now' });
      expect(storage.read()).toEqual(latest);
      controller.destroy();
    });

    it('removes a vanished restored job', () => {
      storage.write({ status: 'running', jobId: 'gone', request });
      jobs.getJob.mockReturnValue(throwError(() => new Error('gone')));
      controller.restore();
      expect(latest).toBeNull();
      expect(storage.read()).toBeUndefined();
      controller.destroy();
    });

    it('clears persisted runs and stops polling', () => {
      jobs.start.mockReturnValue(of(running));
      controller.start(request).subscribe();
      controller.clear();
      ticks.next();
      expect(latest).toBeNull();
      expect(storage.read()).toBeUndefined();
      expect(controller.retry()).toBeUndefined();
      expect(jobs.getJob).not.toHaveBeenCalled();
      controller.destroy();
    });

    it('ignores corrupt storage and drops interrupted starts without a job id', () => {
      adapter.setItem(IMPORT_RUN_STORAGE_KEY, '{bad');
      controller.restore();
      expect(latest).toBeNull();
      storage.write({ status: 'running', request });
      controller.restore();
      expect(latest).toBeNull();
      expect(storage.read()).toBeUndefined();
      expect(jobs.getJob).not.toHaveBeenCalled();
      controller.destroy();
    });

    it('does not restore or poll malformed completed runs', () => {
      for (const run of [
        { status: 'completed', jobId: 'job', request },
        { status: 'completed', request, result: completed.result },
      ]) {
        adapter.setItem(IMPORT_RUN_STORAGE_KEY, JSON.stringify(run));
        controller.restore();
        expect(latest).toBeNull();
        expect(controller.retry()).toBeUndefined();
      }
      expect(jobs.getJob).not.toHaveBeenCalled();
      controller.destroy();
    });
  });
});

describe('JobRunLifecycle ports', () => {
  it('owns independent keys through accepted starts, polling, dismissal and destruction', () => {
    const ticks = new Subject<void>();
    const jobs = {
      start: vi.fn((_id: string, _request: string) => of({ jobId: 'job', status: 'running' })),
      getJob: vi.fn((_id: string) => of({ jobId: 'job', status: 'completed' })),
      jobId: (job: { jobId: string }) => job.jobId,
      isFinished: (job: { status: string }) => job.status === 'completed',
      map: (job: { status: string; jobId: string }) => job,
      fail: (_error: unknown, run: { status: string; jobId?: string }) => ({ ...run, status: 'failed' }),
    };
    const storage = { read: vi.fn(), write: vi.fn(), remove: vi.fn() };
    const lifecycle = new JobRunLifecycle<
      string,
      { jobId: string; status: string },
      { status: string; jobId?: string }
    >(jobs, storage, { now: () => 'now', poll: () => ticks });
    lifecycle.start('first', 'request', { status: 'running' });
    lifecycle.startAccepted('second', 'request', { status: 'running' }).subscribe();
    lifecycle.clear('first');
    ticks.next();
    expect(lifecycle.runs).toEqual({ second: { jobId: 'job', status: 'completed' } });
    expect(storage.write).toHaveBeenLastCalledWith(lifecycle.runs);
    lifecycle.clear('second');
    expect(storage.remove).toHaveBeenCalledOnce();
    lifecycle.destroy();
  });
});

describe('JobRunLifecycle startAccepted', () => {
  type Job = { status: string; jobId: string };
  type Run = { status: string; jobId?: string };
  const previous: Run = { status: 'completed', jobId: 'previous' };

  function setup(initial: Record<string, Run> = { main: previous }) {
    const response = new Subject<Job>();
    const jobs = {
      start: vi.fn((_id: string, _request: string): Observable<Job> => response),
      getJob: vi.fn((_id: string) => of({ status: 'completed', jobId: 'job' })),
      jobId: (job: Job) => job.jobId,
      isFinished: (job: Job) => job.status === 'completed',
      map: (job: Job): Run => job,
      fail: (_error: unknown, run: Run): Run => ({ ...run, status: 'failed' }),
    };
    const storage = {
      read: vi.fn(() => initial),
      write: vi.fn((_runs: Record<string, Run>) => undefined),
      remove: vi.fn(),
    };
    const lifecycle = new JobRunLifecycle<string, Job, Run>(jobs, storage, {
      now: () => 'now',
      poll: () => new Subject<void>(),
    });
    lifecycle.restore();
    return { lifecycle, jobs, storage, response };
  }

  it('restores the previous run after rejection and returns the original error', () => {
    const h = setup();
    const error = vi.fn();
    const failure = new Error('rejected');
    h.lifecycle.startAccepted('main', 'request', { status: 'running' }).subscribe({ error });
    expect(h.lifecycle.runs['main']?.status).toBe('running');
    h.response.error(failure);
    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(h.lifecycle.runs['main']).toBe(previous);
    expect(h.storage.write).not.toHaveBeenCalled();
    expect(h.storage.remove).not.toHaveBeenCalled();
    h.lifecycle.destroy();
  });

  it('restores the previous run when unsubscribed before acceptance', () => {
    const h = setup();
    const subscription = h.lifecycle.startAccepted('main', 'request', { status: 'running' }).subscribe();
    expect(h.lifecycle.runs['main']?.status).toBe('running');
    subscription.unsubscribe();
    h.response.next({ status: 'completed', jobId: 'late' });
    expect(h.lifecycle.runs['main']).toBe(previous);
    expect(h.storage.write).not.toHaveBeenCalled();
    expect(h.storage.remove).not.toHaveBeenCalled();
    h.lifecycle.destroy();
  });

  it('ignores duplicate starts during acceptance and polling', () => {
    const h = setup();
    const accepted = vi.fn();
    h.lifecycle.startAccepted('main', 'request', { status: 'running' }).subscribe();
    h.lifecycle.startAccepted('main', 'duplicate', { status: 'running' }).subscribe(accepted);
    expect(h.jobs.start).toHaveBeenCalledExactlyOnceWith('main', 'request');
    expect(accepted).not.toHaveBeenCalled();
    h.response.next({ status: 'running', jobId: 'accepted' });
    h.lifecycle.startAccepted('main', 'duplicate', { status: 'running' }).subscribe(accepted);
    expect(h.jobs.start).toHaveBeenCalledTimes(1);
    expect(accepted).not.toHaveBeenCalled();
    h.response.complete();
    h.lifecycle.destroy();
  });

  it('keeps pending busy seeds out of writes for other keys while retaining previous accepted results', () => {
    const h = setup();
    const existing = h.lifecycle.startAccepted('main', 'request', { status: 'running' }).subscribe();
    const fresh = h.lifecycle.startAccepted('fresh', 'request', { status: 'running' }).subscribe();
    h.jobs.start.mockReturnValue(of({ status: 'completed', jobId: 'other' }));
    h.lifecycle.start('other', 'request', { status: 'running' });
    expect(h.storage.write).toHaveBeenCalledTimes(2);
    for (const [runs] of h.storage.write.mock.calls) {
      expect(runs['main']).toEqual(previous);
      expect(runs['fresh']).toBeUndefined();
    }
    h.lifecycle.clear('other');
    expect(h.storage.write).toHaveBeenLastCalledWith({ main: previous });
    expect(h.lifecycle.runs['main']?.status).toBe('running');
    expect(h.lifecycle.runs['fresh']?.status).toBe('running');
    existing.unsubscribe();
    fresh.unsubscribe();
    expect(h.lifecycle.runs).toEqual({ main: previous });
    h.lifecycle.destroy();
  });
});
