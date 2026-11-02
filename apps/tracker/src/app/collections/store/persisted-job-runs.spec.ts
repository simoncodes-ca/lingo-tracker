import { describe, expect, it } from 'vitest';
import { readPersistedExportRun } from './export-runs';
import { readPersistedImportRun } from './import-runs';

const exportRequest = { format: 'json' };
const importRequest = { collection: 'main', files: [{ path: 'fr.xlf', locale: 'fr' }] };
const importResult = { totals: {}, files: [] };

for (const [name, read, request] of [
  ['export', readPersistedExportRun, exportRequest],
  ['import', readPersistedImportRun, importRequest],
] as const) {
  describe(`persisted ${name} runs`, () => {
    it.each([undefined, null, '', '{bad', 'null', '[]', '{}', '1'])('ignores absent or corrupt data: %s', (raw) =>
      expect(read(raw)).toBeUndefined(),
    );
    it.each(['running', 'completed', 'failed'])('retains the stored JSON for %s', (status) => {
      const run = {
        status,
        jobId: 'job',
        request,
        progress: { current: 1, total: 2 },
        result: importResult,
        error: 'detail',
        finishedAt: 'then',
      };
      expect(read(JSON.stringify(run))).toEqual(run);
    });
    it.each(['idle', 'pending', '', null, 1])('rejects status %s', (status) => {
      expect(read(JSON.stringify({ status, jobId: 'job', request }))).toBeUndefined();
    });
    it.each([null, [], {}, 1].map((badRequest) => ({ badRequest })))(
      'rejects invalid request $badRequest',
      ({ badRequest }) => {
        expect(read(JSON.stringify({ status: 'running', jobId: 'job', request: badRequest }))).toBeUndefined();
      },
    );
  });
}

describe('export persisted-run compatibility', () => {
  it.each(['json', 'xliff'])('accepts %s and legacy runs without a job id or result', (format) => {
    const run = { status: 'completed', request: { format } };
    expect(readPersistedExportRun(JSON.stringify(run))).toEqual(run);
  });
  it.each([undefined, null, 'yaml', 1])('rejects invalid format %s', (format) => {
    expect(readPersistedExportRun(JSON.stringify({ status: 'running', request: { format } }))).toBeUndefined();
  });
  it.each([null, 1, {}])('rejects non-string job id %s', (jobId) => {
    expect(
      readPersistedExportRun(JSON.stringify({ status: 'running', jobId, request: exportRequest })),
    ).toBeUndefined();
  });
});

describe('import persisted-run compatibility', () => {
  it.each([
    { collection: 1, files: [] },
    { collection: 1, files: importRequest.files },
    { collection: 'main', files: {} },
    { collection: 'main' },
  ])('rejects invalid import request $collection / $files', (request) => {
    expect(readPersistedImportRun(JSON.stringify({ status: 'running', jobId: 'job', request }))).toBeUndefined();
  });
  it.each(
    ['pending', 'running', 'completed', 'failed'].flatMap((status) =>
      [undefined, null, '', '  ', 1].map((jobId) => ({ status, jobId })),
    ),
  )('requires a nonempty job id for $status: $jobId', ({ status, jobId }) => {
    expect(
      readPersistedImportRun(JSON.stringify({ status, jobId, request: importRequest, result: importResult })),
    ).toBeUndefined();
  });
  it.each(['running', 'failed'])('accepts %s without a result', (status) => {
    const run = { status, jobId: 'job', request: importRequest };
    expect(readPersistedImportRun(JSON.stringify(run))).toEqual(run);
  });
  it.each(
    [
      [],
      [null],
      [{}],
      [{ path: 'fr.xlf' }],
      [{ locale: 'fr' }],
      [{ path: 1, locale: 'fr' }],
      [{ path: 'fr.xlf', locale: null }],
      [{ path: 'fr.xlf', locale: 'fr', format: 'yaml' }],
      [{ path: 'fr.xlf', locale: 'fr', format: null }],
      [importRequest.files[0], null],
    ].map((files) => ({ files })),
  )('rejects malformed files $files', ({ files }) => {
    expect(
      readPersistedImportRun(JSON.stringify({ status: 'running', jobId: 'job', request: { ...importRequest, files } })),
    ).toBeUndefined();
  });
  it.each([undefined, 'xliff', 'json'])('accepts file format %s', (format) => {
    const run = {
      status: 'running',
      jobId: 'job',
      request: { ...importRequest, files: [{ path: 'fr.xlf', locale: 'fr', format }] },
    };
    expect(readPersistedImportRun(JSON.stringify(run))).toEqual(JSON.parse(JSON.stringify(run)));
  });
  it.each(
    [
      undefined,
      null,
      [],
      {},
      { files: [] },
      { totals: {} },
      { totals: null, files: [] },
      { totals: [], files: [] },
      { totals: {}, files: {} },
    ].map((result) => ({ result })),
  )('rejects incomplete completed result $result', ({ result }) => {
    expect(
      readPersistedImportRun(JSON.stringify({ status: 'completed', jobId: 'job', request: importRequest, result })),
    ).toBeUndefined();
  });
});
