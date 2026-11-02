import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { createServiceFactory } from '@ngneat/spectator/vitest';
import { type ImportJobDto, type ImportRequestDto, JOB_RETENTION_MS } from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { ApiError } from '../../../shared/api-error/api-error';
import { CollectionsApiService } from '../../services/collections-api.service';
import { CollectionsStore } from '../collections.store';
import { IMPORT_RUN_STORAGE_KEY, readPersistedImportRun } from '../import-runs';

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
const failure = new ApiError({ kind: 'not-found', status: 404, serverMessage: 'Job gone' });
const api = {
  startImport: vi.fn(),
  getImportJob: vi.fn(),
  dryRunImport: vi.fn(),
  listImportSources: vi.fn(),
  uploadImportSources: vi.fn(),
};
const createStore = createServiceFactory({
  service: CollectionsStore,
  imports: [getTranslocoTestingModule()],
  providers: [{ provide: CollectionsApiService, useValue: api }],
});

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('withImportFeature', () => {
  it('passes upload files, options and the listing through without changing run state', () => {
    const store = createStore().service;
    const files: readonly File[] = [new File(['{}'], 'fr.json')];
    const listing = { collection: 'main', folder: 'in', defaultFolder: 'in', exists: true, files: [] };
    const response = of(listing);
    api.uploadImportSources.mockReturnValue(response);
    const next = vi.fn();
    expect(store.uploadImportSources('main', files)).toBe(response);
    expect(api.uploadImportSources).toHaveBeenLastCalledWith('main', files, {});
    const options = { folder: 'vendor/fr', overwrite: true };
    store.uploadImportSources('main', files, options).subscribe(next);
    expect(api.uploadImportSources).toHaveBeenLastCalledWith('main', files, options);
    expect(next).toHaveBeenCalledExactlyOnceWith(listing);
    expect(store.importRun()).toBeNull();
    expect(store.isImporting()).toBe(false);
    expect(sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY)).toBeNull();
  });

  it('propagates upload conflicts and other API errors without changing run state', () => {
    const store = createStore().service;
    const files: readonly File[] = [new File(['{}'], 'fr.json')];
    const conflict = new ApiError({
      kind: 'conflict',
      status: 409,
      serverMessage: 'Files already exist',
      details: ['fr.json'],
    });
    for (const rejected of [conflict, failure]) {
      api.uploadImportSources.mockReturnValue(throwError(() => rejected));
      const error = vi.fn();
      store.uploadImportSources('main', files).subscribe({ error });
      expect(error).toHaveBeenCalledExactlyOnceWith(rejected);
      expect(store.importRun()).toBeNull();
      expect(store.isImporting()).toBe(false);
      expect(sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY)).toBeNull();
    }
  });

  it('passes source listing arguments and errors through without changing run state', () => {
    const store = createStore().service;
    const listing = { collection: 'main', folder: 'in', defaultFolder: 'in', exists: true, files: [] };
    api.listImportSources.mockReturnValueOnce(of(listing)).mockReturnValueOnce(throwError(() => failure));
    const next = vi.fn();
    store.listImportSources('main').subscribe(next);
    expect(next).toHaveBeenCalledWith(listing);
    expect(api.listImportSources).toHaveBeenLastCalledWith('main', undefined);
    const error = vi.fn();
    store.listImportSources('main', 'other').subscribe({ error });
    expect(api.listImportSources).toHaveBeenLastCalledWith('main', 'other');
    expect(error).toHaveBeenCalledWith(failure);
    expect(store.importRun()).toBeNull();
  });

  it('passes dry runs through and preserves API errors', () => {
    const store = createStore().service;
    api.dryRunImport.mockReturnValue(throwError(() => failure));
    const error = vi.fn();
    store.dryRunImport(request).subscribe({ error });
    expect(api.dryRunImport).toHaveBeenCalledWith(request);
    expect(error).toHaveBeenCalledWith(failure);
    expect(store.importRun()).toBeNull();
  });

  it('starts on subscription, returns the accepted job and polls to completion inclusively', () => {
    const store = createStore().service;
    api.startImport.mockReturnValue(of(running));
    api.getImportJob.mockReturnValue(of(completed));
    const start = store.startImport(request);
    expect(api.startImport).not.toHaveBeenCalled();
    const accepted = vi.fn();
    start.subscribe(accepted);
    expect(accepted).toHaveBeenCalledExactlyOnceWith(running);
    expect(store.isImporting()).toBe(true);
    expect(store.importRun()).toMatchObject({ jobId: 'job', request, progress: running.progress });
    vi.advanceTimersByTime(500);
    expect(store.importRun()).toMatchObject({
      status: 'completed',
      result: completed.result,
      finishedAt: completed.completedAt,
    });
    expect(store.isImporting()).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(api.getImportJob).toHaveBeenCalledExactlyOnceWith('job');
    expect(readPersistedImportRun(sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY))).toEqual(store.importRun());
  });

  it('marks failed terminal jobs and exposes the last request for Retry without starting it', () => {
    const store = createStore().service;
    api.startImport.mockReturnValue(of(running));
    api.getImportJob.mockReturnValue(of({ ...running, status: 'failed', error: 'Write failed' }));
    store.startImport(request).subscribe();
    vi.advanceTimersByTime(500);
    expect(store.importRun()).toMatchObject({ status: 'failed', error: 'Write failed' });
    expect(store.retryImport()).toEqual(request);
    expect(store.isImporting()).toBe(false);
    expect(api.startImport).toHaveBeenCalledTimes(1);
  });

  it('does not poll jobs already terminal when accepted and replaces an old result on start', () => {
    const store = createStore().service;
    api.startImport.mockReturnValueOnce(of(completed)).mockReturnValue(of(running));
    store.startImport(request).subscribe();
    expect(store.importRun()?.result).toEqual(completed.result);
    expect(api.getImportJob).not.toHaveBeenCalled();
    store.startImport(request).subscribe();
    expect(store.importRun()?.result).toBeUndefined();
    store.clearImportRun();
  });

  it('prevents duplicate starts while acceptance or polling is in flight', () => {
    const store = createStore().service;
    const response = new Subject<ImportJobDto>();
    api.startImport.mockReturnValue(response);
    const subscription = store.startImport(request).subscribe();
    expect(store.isImporting()).toBe(true);
    store.startImport(request).subscribe();
    response.next(running);
    store.startImport(request).subscribe();
    expect(api.startImport).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
    expect(store.importRun()).toMatchObject({ status: 'running', jobId: 'job' });
    store.clearImportRun();
  });

  it('propagates start errors to the dialog without publishing or persisting a failed run', () => {
    const store = createStore().service;
    api.startImport.mockReturnValue(throwError(() => failure));
    const error = vi.fn();
    store.startImport(request).subscribe({ error });
    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(store.importRun()).toBeNull();
    expect(sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY)).toBeNull();
    expect(store.isImporting()).toBe(false);
    expect(api.getImportJob).not.toHaveBeenCalled();
  });

  it('restores the previous result and persistence when a new start is rejected', () => {
    const store = createStore().service;
    api.startImport.mockReturnValueOnce(of(completed)).mockReturnValueOnce(throwError(() => failure));
    store.startImport(request).subscribe();
    const previous = store.importRun();
    const persisted = sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const error = vi.fn(() => expect(store.importRun()).toBe(previous));
      store.startImport({ ...request, strategy: 'update' }).subscribe({ error });
      expect(error).toHaveBeenCalledWith(failure);
      expect(store.importRun()).toBe(previous);
      expect(store.retryImport()).toEqual(request);
      expect(store.isImporting()).toBe(false);
      expect(sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY)).toBe(persisted);
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it('clears an unaccepted busy state on unsubscribe and permits a later start', () => {
    const store = createStore().service;
    const response = new Subject<ImportJobDto>();
    api.startImport.mockReturnValueOnce(response).mockReturnValueOnce(of(completed));
    const subscription = store.startImport(request).subscribe();
    expect(store.isImporting()).toBe(true);
    expect(sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY)).toBeNull();
    subscription.unsubscribe();
    expect(store.importRun()).toBeNull();
    expect(store.isImporting()).toBe(false);
    response.next(running);
    expect(store.importRun()).toBeNull();
    store.startImport(request).subscribe();
    expect(api.startImport).toHaveBeenCalledTimes(2);
    expect(store.importRun()?.status).toBe('completed');
  });

  it('restores a previous result on unsubscribe before acceptance', () => {
    const store = createStore().service;
    api.startImport.mockReturnValueOnce(of(completed)).mockReturnValueOnce(new Subject<ImportJobDto>());
    store.startImport(request).subscribe();
    const previous = store.importRun();
    const persisted = sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY);
    const subscription = store.startImport({ ...request, strategy: 'update' }).subscribe();
    expect(store.isImporting()).toBe(true);
    subscription.unsubscribe();
    expect(store.importRun()).toBe(previous);
    expect(store.isImporting()).toBe(false);
    expect(sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY)).toBe(persisted);
  });

  it('restores the previous run if the start source throws synchronously', () => {
    const store = createStore().service;
    api.startImport.mockImplementation(() => {
      throw failure;
    });
    const error = vi.fn();
    store.startImport(request).subscribe({ error });
    expect(error).toHaveBeenCalledWith(failure);
    expect(store.importRun()).toBeNull();
    expect(store.isImporting()).toBe(false);
    expect(sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY)).toBeNull();
  });

  it('translates the fallback for a polling failure without a server message', () => {
    const spectator = createStore();
    const translate = vi.spyOn(spectator.inject(TranslocoService), 'translate').mockReturnValue('Import failed');
    try {
      api.startImport.mockReturnValue(of(running));
      api.getImportJob.mockReturnValue(throwError(() => new ApiError({ kind: 'other', status: 500 })));
      spectator.service.startImport(request).subscribe();
      vi.advanceTimersByTime(500);
      expect(translate).toHaveBeenCalledWith(TRACKER_TOKENS.IMPORT.TOAST.STARTFAILED);
      expect(spectator.service.importRun()?.error).toBe('Import failed');
    } finally {
      translate.mockRestore();
    }
  });

  it('marks active polling errors as failed', () => {
    const store = createStore().service;
    api.startImport.mockReturnValue(of(running));
    api.getImportJob.mockReturnValue(throwError(() => failure));
    store.startImport(request).subscribe();
    vi.advanceTimersByTime(500);
    expect(store.importRun()).toMatchObject({ status: 'failed', request, error: 'Job gone' });
  });

  it('restores running jobs immediately and follows them until completed', () => {
    sessionStorage.setItem(IMPORT_RUN_STORAGE_KEY, JSON.stringify({ status: 'running', jobId: 'job', request }));
    api.getImportJob.mockReturnValueOnce(of(running)).mockReturnValue(of(completed));
    const store = createStore().service;
    expect(store.isImporting()).toBe(true);
    expect(api.getImportJob).toHaveBeenCalledWith('job');
    vi.advanceTimersByTime(500);
    expect(store.importRun()?.status).toBe('completed');
    expect(api.startImport).not.toHaveBeenCalled();
  });

  it('silently drops vanished restored jobs and persists their removal', () => {
    sessionStorage.setItem(IMPORT_RUN_STORAGE_KEY, JSON.stringify({ status: 'running', jobId: 'gone', request }));
    api.getImportJob.mockReturnValue(throwError(() => failure));
    const store = createStore().service;
    expect(store.importRun()).toBeNull();
    expect(store.isImporting()).toBe(false);
    expect(sessionStorage.getItem(IMPORT_RUN_STORAGE_KEY)).toBeNull();
  });

  it('restores completed runs without polling and clears them persistently', () => {
    sessionStorage.setItem(
      IMPORT_RUN_STORAGE_KEY,
      JSON.stringify({ status: 'completed', jobId: 'job', request, result: completed.result }),
    );
    const store = createStore().service;
    expect(store.importRun()?.result).toEqual(completed.result);
    expect(store.retryImport()).toEqual(request);
    expect(api.getImportJob).not.toHaveBeenCalled();
    store.clearImportRun();
    store.restoreImportRun();
    expect(store.importRun()).toBeNull();
    expect(store.retryImport()).toBeUndefined();
  });

  it('clear and destroy release polling subscriptions', () => {
    const spectator = createStore();
    const injector = createEnvironmentInjector([CollectionsStore], spectator.inject(EnvironmentInjector));
    const store = injector.get(CollectionsStore);
    api.startImport.mockReturnValue(of(running));
    api.getImportJob.mockReturnValue(of(running));
    store.startImport(request).subscribe();
    store.clearImportRun();
    vi.advanceTimersByTime(1000);
    expect(api.getImportJob).not.toHaveBeenCalled();
    store.startImport(request).subscribe();
    injector.destroy();
    vi.advanceTimersByTime(1000);
    expect(api.getImportJob).not.toHaveBeenCalled();
  });

  it('ignores corrupt storage and drops interrupted starts without a server id', () => {
    for (const raw of [
      '{bad',
      'null',
      '[]',
      '{"status":"oops"}',
      '{"status":"running","request":{"collection":"main","files":null}}',
    ])
      expect(readPersistedImportRun(raw)).toBeUndefined();
    sessionStorage.setItem(IMPORT_RUN_STORAGE_KEY, JSON.stringify({ status: 'running', request }));
    const store = createStore().service;
    expect(store.importRun()).toBeNull();
    expect(api.getImportJob).not.toHaveBeenCalled();
  });

  it('ignores storage failures without losing the current result', () => {
    const store = createStore().service;
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      api.startImport.mockReturnValue(of(completed));
      expect(() => store.startImport(request).subscribe()).not.toThrow();
      store.restoreImportRun();
      expect(store.importRun()?.result).toEqual(completed.result);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
  it('offers the summary only for a completed run', () => {
    const store = createStore().service;
    const now = Date.parse(completed.completedAt ?? '');
    expect(store.isImportSummaryAvailable(now)).toBe(false);
    api.startImport.mockReturnValueOnce(of(running));
    store.startImport(request).subscribe();
    expect(store.isImportSummaryAvailable(now)).toBe(false);
    store.clearImportRun();
    api.startImport.mockReturnValueOnce(of({ ...completed, status: 'failed' }));
    store.startImport(request).subscribe();
    expect(store.isImportSummaryAvailable(now)).toBe(false);
    api.startImport.mockReturnValueOnce(of(completed));
    store.startImport(request).subscribe();
    expect(store.isImportSummaryAvailable(now)).toBe(true);
    store.clearImportRun();
    expect(store.isImportSummaryAvailable(now)).toBe(false);
  });

  it('checks summary retention at read time without a run state change', () => {
    const store = createStore().service;
    api.startImport.mockReturnValue(of(completed));
    store.startImport(request).subscribe();
    const finished = Date.parse(completed.completedAt ?? '');
    const run = store.importRun();
    expect(store.isImportSummaryAvailable(finished + JOB_RETENTION_MS)).toBe(true);
    expect(store.isImportSummaryAvailable(finished + JOB_RETENTION_MS + 1)).toBe(false);
    vi.setSystemTime(finished + JOB_RETENTION_MS - 1);
    expect(store.isImportSummaryAvailable()).toBe(true);
    vi.advanceTimersByTime(2);
    expect(store.isImportSummaryAvailable()).toBe(false);
    expect(store.importRun()).toBe(run);
  });

  it('checks restored completion timestamps and rejects missing, invalid or future timestamps', () => {
    const store = createStore().service;
    const now = Date.parse(completed.completedAt ?? '');
    for (const finishedAt of [
      undefined,
      'bad',
      new Date(now + 1).toISOString(),
      new Date(now - JOB_RETENTION_MS - 1).toISOString(),
    ]) {
      sessionStorage.setItem(
        IMPORT_RUN_STORAGE_KEY,
        JSON.stringify({ status: 'completed', jobId: 'job', request, result: completed.result, finishedAt }),
      );
      store.restoreImportRun();
      expect(store.isImportSummaryAvailable(now)).toBe(false);
    }
    sessionStorage.setItem(
      IMPORT_RUN_STORAGE_KEY,
      JSON.stringify({
        status: 'completed',
        jobId: 'job',
        request,
        result: completed.result,
        finishedAt: completed.completedAt,
      }),
    );
    store.restoreImportRun();
    expect(store.isImportSummaryAvailable(now)).toBe(true);
  });

  it('requires a nonempty job id before offering an accepted summary', () => {
    const store = createStore().service;
    api.startImport.mockReturnValue(of({ ...completed, jobId: '' }));
    store.startImport(request).subscribe();
    expect(store.isImportSummaryAvailable(Date.parse(completed.completedAt ?? ''))).toBe(false);
  });
});
