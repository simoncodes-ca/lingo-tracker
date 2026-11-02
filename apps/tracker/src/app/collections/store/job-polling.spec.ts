import { Observable, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { followJob } from './job-polling';

interface Job {
  id: string;
  status: 'running' | 'completed' | 'failed';
}
const running: Job = { id: 'job', status: 'running' };

describe('followJob', () => {
  for (const status of ['completed', 'failed'] as const) {
    it(`emits the initial job and terminal ${status} poll inclusively`, () => {
      const tick = new Subject<void>();
      const terminal = { ...running, status };
      const getJob = vi.fn(() => of(terminal));
      const poll = vi.fn(() => tick);
      const next = vi.fn();
      const complete = vi.fn();
      followJob(of(running), {
        getJob,
        jobId: (job) => job.id,
        isFinished: (job) => job.status !== 'running',
        poll,
        intervalMs: 500,
      }).subscribe({ next, complete });
      expect(next).toHaveBeenCalledWith(running);
      expect(poll).toHaveBeenCalledWith(500);
      tick.next();
      tick.next();
      expect(next.mock.calls.map(([job]) => job)).toEqual([running, terminal]);
      expect(getJob).toHaveBeenCalledExactlyOnceWith('job');
      expect(complete).toHaveBeenCalledOnce();
    });
  }

  it('does not poll an already finished initial job', () => {
    const poll = vi.fn();
    const job: Job = { ...running, status: 'completed' };
    const next = vi.fn();
    followJob(of(job), {
      getJob: () => of(job),
      jobId: (j) => j.id,
      isFinished: () => true,
      poll,
      intervalMs: 500,
    }).subscribe(next);
    expect(next).toHaveBeenCalledExactlyOnceWith(job);
    expect(poll).not.toHaveBeenCalled();
  });

  it('propagates initial and polling errors to the lifecycle owner', () => {
    const failure = new Error('gone');
    for (const initial of [throwError(() => failure), of(running)]) {
      const error = vi.fn();
      followJob(initial, {
        getJob: () => throwError(() => failure),
        jobId: (job) => job.id,
        isFinished: () => false,
        poll: () => of(0),
        intervalMs: 500,
      }).subscribe({ error });
      expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    }
  });

  it('cancels pending requests on the next tick and releases polling on unsubscribe', () => {
    const tick = new Subject<void>();
    const cancelled = vi.fn();
    const getJob = vi.fn(() => new Observable<Job>(() => cancelled));
    const subscription = followJob(of(running), {
      getJob,
      jobId: (job) => job.id,
      isFinished: () => false,
      poll: () => tick,
      intervalMs: 500,
    }).subscribe();
    tick.next();
    tick.next();
    expect(cancelled).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
    expect(cancelled).toHaveBeenCalledTimes(2);
    tick.next();
    expect(getJob).toHaveBeenCalledTimes(2);
  });
});
