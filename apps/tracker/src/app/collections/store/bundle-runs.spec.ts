import { toJobErrorMessage } from './job-run-error';
import type { BundleGenerateJobDto } from '@simoncodes-ca/data-transfer';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/api-error/api-error';
import { type BundleRunState, mapJobToRun, readPersistedRuns } from './bundle-runs';

const finishedAt = '2026-09-15T10:00:02.000Z';
const job: BundleGenerateJobDto = {
  jobId: 'job-1',
  bundleName: 'main',
  status: 'running',
  progress: { current: 0, total: 0 },
};

const previous: BundleRunState = {
  status: 'running',
  progress: { current: 0, total: 6 },
};

const result = {
  filesGenerated: [],
  keysPerLocale: {},
  warnings: [],
  localesProcessed: [],
};

describe('mapJobToRun', () => {
  const cases: readonly {
    name: string;
    snapshot: BundleGenerateJobDto;
    previous: BundleRunState | undefined;
    expected: BundleRunState;
  }[] = [
    {
      name: 'keeps the seeded total for a pending job',
      snapshot: { ...job, status: 'pending' },
      previous,
      expected: {
        status: 'running',
        jobId: 'job-1',
        progress: { current: 0, total: 6 },
      },
    },
    {
      name: 'keeps the seeded total for a running job',
      snapshot: job,
      previous,
      expected: {
        status: 'running',
        jobId: 'job-1',
        progress: { current: 0, total: 6 },
      },
    },
    {
      name: 'uses zero when no total was seeded',
      snapshot: job,
      previous: undefined,
      expected: {
        status: 'running',
        jobId: 'job-1',
        progress: { current: 0, total: 0 },
      },
    },
    {
      name: 'adopts a nonzero server total and current file',
      snapshot: {
        ...job,
        progress: { current: 1, total: 2, currentFile: 'en.json' },
      },
      previous,
      expected: {
        status: 'running',
        jobId: 'job-1',
        progress: { current: 1, total: 2, currentFile: 'en.json' },
      },
    },
    {
      name: 'takes the completed result and server timestamp',
      snapshot: {
        ...job,
        status: 'completed',
        result,
        completedAt: 'server-time',
      },
      previous,
      expected: {
        status: 'completed',
        jobId: 'job-1',
        progress: { current: 0, total: 6 },
        result,
        finishedAt: 'server-time',
      },
    },
    {
      name: 'uses the supplied timestamp for a failed job and keeps its error',
      snapshot: { ...job, status: 'failed', error: 'Collection missing' },
      previous,
      expected: {
        status: 'failed',
        jobId: 'job-1',
        progress: { current: 0, total: 6 },
        error: 'Collection missing',
        finishedAt,
      },
    },
    {
      name: 'drops stale error and completion time for an active snapshot',
      snapshot: job,
      previous: { ...previous, result, error: 'old error', finishedAt },
      expected: {
        status: 'running',
        jobId: 'job-1',
        progress: { current: 0, total: 6 },
        result,
      },
    },
  ];

  for (const entry of cases) {
    it(entry.name, () => {
      expect(mapJobToRun(entry.snapshot, entry.previous, finishedAt)).toEqual({
        result: undefined,
        error: undefined,
        finishedAt: undefined,
        ...entry.expected,
      });
    });
  }
});

describe('toBundleErrorMessage', () => {
  const cases: readonly { name: string; error: unknown; expected: string }[] = [
    { name: 'unknown failure', error: null, expected: 'Generate failed' },
    {
      name: 'local error',
      error: new Error('Local failure'),
      expected: 'Local failure',
    },
    {
      name: 'server message',
      error: new ApiError({
        kind: 'not-found',
        status: 404,
        serverMessage: 'job not found',
      }),
      expected: 'job not found',
    },
    {
      name: 'fallback without a server message',
      error: new ApiError({ kind: 'other', status: 500 }),
      expected: 'Generate failed',
    },
    {
      name: 'string rule details in order',
      error: new ApiError({
        kind: 'invalid',
        status: 400,
        serverMessage: 'Invalid bundle',
        details: ['a', { code: 'b' }, 'c'],
      }),
      expected: 'Invalid bundle: a; c',
    },
  ];

  for (const entry of cases) {
    it(entry.name, () => {
      expect(toJobErrorMessage(entry.error, 'Generate failed')).toBe(entry.expected);
    });
  }
});

describe('readPersistedRuns', () => {
  const cases: readonly {
    name: string;
    raw: string | null | undefined;
    expected: Record<string, BundleRunState>;
  }[] = [
    { name: 'missing data', raw: null, expected: {} },
    { name: 'unavailable data', raw: undefined, expected: {} },
    { name: 'empty data', raw: '', expected: {} },
    { name: 'invalid JSON', raw: '{not json', expected: {} },
    { name: 'null root', raw: 'null', expected: {} },
    { name: 'primitive root', raw: '42', expected: {} },
    { name: 'invalid entries in an array root', raw: '[0,null,{"status":"pending"}]', expected: {} },
    {
      name: 'mixed valid and invalid entries',
      raw: JSON.stringify({
        main: previous,
        bad: { status: 'pending' },
        empty: null,
        primitive: 42,
        missing: {},
      }),
      expected: { main: previous },
    },
    {
      name: 'all client lifecycle statuses',
      raw: JSON.stringify({
        idle: { status: 'idle' },
        running: previous,
        completed: { status: 'completed', result },
        failed: { status: 'failed', error: 'Failed' },
      }),
      expected: {
        idle: { status: 'idle' },
        running: previous,
        completed: { status: 'completed', result },
        failed: { status: 'failed', error: 'Failed' },
      },
    },
  ];

  for (const entry of cases) {
    it(entry.name, () => {
      expect(readPersistedRuns(entry.raw)).toEqual(entry.expected);
    });
  }
});
