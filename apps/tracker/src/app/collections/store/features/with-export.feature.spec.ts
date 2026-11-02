import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { createServiceFactory } from '@ngneat/spectator/vitest';
import type { ExportJobDto, ExportRequestDto } from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { ApiError } from '../../../shared/api-error/api-error';
import { CollectionsApiService } from '../../services/collections-api.service';
import { CollectionsStore } from '../collections.store';
import { EXPORT_RUN_STORAGE_KEY, readPersistedExportRun } from '../export-runs';

const request: ExportRequestDto = { format: 'xliff', collections: ['main'], locales: ['fr'] };
const running: ExportJobDto = { jobId: 'job', request, status: 'running', progress: { current: 0, total: 1 } };
const completed: ExportJobDto = {
  ...running,
  status: 'completed',
  progress: { current: 1, total: 1 },
  completedAt: '2026-10-19T12:00:00Z',
  result: {
    filesWritten: ['out/fr.xliff'],
    entriesExported: 2,
    localeResults: [{ locale: 'fr', outcome: 'exported', entriesExported: 2 }],
    warnings: [],
    errors: [],
    outcome: 'succeeded',
    outputDirectory: 'out',
    format: 'xliff',
  },
};
const failure = new ApiError({ kind: 'not-found', status: 404, serverMessage: 'Job gone' });
const api = { startExport: vi.fn(), getExportJob: vi.fn(), dryRunExport: vi.fn() };
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

describe('withExportFeature', () => {
  it('passes dry runs through and preserves API errors', () => {
    const store = createStore().service;
    api.dryRunExport.mockReturnValue(throwError(() => failure));
    const error = vi.fn();
    store.dryRunExport(request).subscribe({ error });
    expect(api.dryRunExport).toHaveBeenCalledWith(request);
    expect(error).toHaveBeenCalledWith(failure);
    expect(store.exportRun()).toBeNull();
  });

  it('starts on subscription, returns the accepted job and polls to completion inclusively', () => {
    const store = createStore().service;
    api.startExport.mockReturnValue(of(running));
    api.getExportJob.mockReturnValue(of(completed));
    const start = store.startExport(request);
    expect(api.startExport).not.toHaveBeenCalled();
    const accepted = vi.fn();
    start.subscribe(accepted);
    expect(accepted).toHaveBeenCalledExactlyOnceWith(running);
    expect(store.isExporting()).toBe(true);
    expect(store.exportRun()).toMatchObject({ jobId: 'job', request, progress: running.progress });
    vi.advanceTimersByTime(500);
    expect(store.exportRun()).toMatchObject({
      status: 'completed',
      result: completed.result,
      finishedAt: completed.completedAt,
    });
    expect(store.isExporting()).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(api.getExportJob).toHaveBeenCalledExactlyOnceWith('job');
    expect(readPersistedExportRun(sessionStorage.getItem(EXPORT_RUN_STORAGE_KEY))).toEqual(store.exportRun());
  });

  it('marks failed terminal jobs and exposes the last request for Retry without starting it', () => {
    const store = createStore().service;
    api.startExport.mockReturnValue(of(running));
    api.getExportJob.mockReturnValue(of({ ...running, status: 'failed', error: 'Write failed' }));
    store.startExport(request).subscribe();
    vi.advanceTimersByTime(500);
    expect(store.exportRun()).toMatchObject({ status: 'failed', error: 'Write failed' });
    expect(store.retryExport()).toEqual(request);
    expect(store.isExporting()).toBe(false);
    expect(api.startExport).toHaveBeenCalledTimes(1);
  });

  it('does not poll jobs already terminal when accepted and replaces an old result on start', () => {
    const store = createStore().service;
    api.startExport.mockReturnValueOnce(of(completed)).mockReturnValue(of(running));
    store.startExport(request).subscribe();
    expect(store.exportRun()?.result).toEqual(completed.result);
    expect(api.getExportJob).not.toHaveBeenCalled();
    store.startExport(request).subscribe();
    expect(store.exportRun()?.result).toBeUndefined();
    store.clearExportRun();
  });

  it('prevents duplicate starts while acceptance or polling is in flight', () => {
    const store = createStore().service;
    const response = new Subject<ExportJobDto>();
    api.startExport.mockReturnValue(response);
    const subscription = store.startExport(request).subscribe();
    expect(store.isExporting()).toBe(true);
    store.startExport(request).subscribe();
    response.next(running);
    store.startExport(request).subscribe();
    expect(api.startExport).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
    expect(store.exportRun()).toMatchObject({ status: 'running', jobId: 'job' });
    store.clearExportRun();
  });

  it('propagates start errors to the dialog without publishing or persisting a failed run', () => {
    const store = createStore().service;
    api.startExport.mockReturnValue(throwError(() => failure));
    const error = vi.fn();
    store.startExport(request).subscribe({ error });
    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(store.exportRun()).toBeNull();
    expect(sessionStorage.getItem(EXPORT_RUN_STORAGE_KEY)).toBeNull();
    expect(store.isExporting()).toBe(false);
    expect(api.getExportJob).not.toHaveBeenCalled();
  });

  it('restores the previous result and persistence when a new start is rejected', () => {
    const store = createStore().service;
    api.startExport.mockReturnValueOnce(of(completed)).mockReturnValueOnce(throwError(() => failure));
    store.startExport(request).subscribe();
    const previous = store.exportRun();
    const persisted = sessionStorage.getItem(EXPORT_RUN_STORAGE_KEY);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const error = vi.fn(() => expect(store.exportRun()).toBe(previous));
      store.startExport({ format: 'json' }).subscribe({ error });
      expect(error).toHaveBeenCalledWith(failure);
      expect(store.exportRun()).toBe(previous);
      expect(store.retryExport()).toEqual(request);
      expect(store.isExporting()).toBe(false);
      expect(sessionStorage.getItem(EXPORT_RUN_STORAGE_KEY)).toBe(persisted);
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it('clears an unaccepted busy state on unsubscribe and permits a later start', () => {
    const store = createStore().service;
    const response = new Subject<ExportJobDto>();
    api.startExport.mockReturnValueOnce(response).mockReturnValueOnce(of(completed));
    const subscription = store.startExport(request).subscribe();
    expect(store.isExporting()).toBe(true);
    expect(sessionStorage.getItem(EXPORT_RUN_STORAGE_KEY)).toBeNull();
    subscription.unsubscribe();
    expect(store.exportRun()).toBeNull();
    expect(store.isExporting()).toBe(false);
    response.next(running);
    expect(store.exportRun()).toBeNull();
    store.startExport(request).subscribe();
    expect(api.startExport).toHaveBeenCalledTimes(2);
    expect(store.exportRun()?.status).toBe('completed');
  });

  it('restores a previous result on unsubscribe before acceptance', () => {
    const store = createStore().service;
    api.startExport.mockReturnValueOnce(of(completed)).mockReturnValueOnce(new Subject<ExportJobDto>());
    store.startExport(request).subscribe();
    const previous = store.exportRun();
    const persisted = sessionStorage.getItem(EXPORT_RUN_STORAGE_KEY);
    const subscription = store.startExport({ format: 'json' }).subscribe();
    expect(store.isExporting()).toBe(true);
    subscription.unsubscribe();
    expect(store.exportRun()).toBe(previous);
    expect(store.isExporting()).toBe(false);
    expect(sessionStorage.getItem(EXPORT_RUN_STORAGE_KEY)).toBe(persisted);
  });

  it('restores the previous run if the start source throws synchronously', () => {
    const store = createStore().service;
    api.startExport.mockImplementation(() => {
      throw failure;
    });
    const error = vi.fn();
    store.startExport(request).subscribe({ error });
    expect(error).toHaveBeenCalledWith(failure);
    expect(store.exportRun()).toBeNull();
    expect(store.isExporting()).toBe(false);
    expect(sessionStorage.getItem(EXPORT_RUN_STORAGE_KEY)).toBeNull();
  });

  it('translates the fallback for a polling failure without a server message', () => {
    const spectator = createStore();
    const translate = vi.spyOn(spectator.inject(TranslocoService), 'translate').mockReturnValue('Export failed');
    try {
      api.startExport.mockReturnValue(of(running));
      api.getExportJob.mockReturnValue(throwError(() => new ApiError({ kind: 'other', status: 500 })));
      spectator.service.startExport(request).subscribe();
      vi.advanceTimersByTime(500);
      expect(translate).toHaveBeenCalledWith(TRACKER_TOKENS.EXPORT.RUN.FAILED);
      expect(spectator.service.exportRun()?.error).toBe('Export failed');
    } finally {
      translate.mockRestore();
    }
  });

  it('marks active polling errors as failed', () => {
    const store = createStore().service;
    api.startExport.mockReturnValue(of(running));
    api.getExportJob.mockReturnValue(throwError(() => failure));
    store.startExport(request).subscribe();
    vi.advanceTimersByTime(500);
    expect(store.exportRun()).toMatchObject({ status: 'failed', request, error: 'Job gone' });
  });

  it('restores running jobs immediately and follows them until completed', () => {
    sessionStorage.setItem(EXPORT_RUN_STORAGE_KEY, JSON.stringify({ status: 'running', jobId: 'job', request }));
    api.getExportJob.mockReturnValueOnce(of(running)).mockReturnValue(of(completed));
    const store = createStore().service;
    expect(store.isExporting()).toBe(true);
    expect(api.getExportJob).toHaveBeenCalledWith('job');
    vi.advanceTimersByTime(500);
    expect(store.exportRun()?.status).toBe('completed');
    expect(api.startExport).not.toHaveBeenCalled();
  });

  it('silently drops vanished restored jobs and persists their removal', () => {
    sessionStorage.setItem(EXPORT_RUN_STORAGE_KEY, JSON.stringify({ status: 'running', jobId: 'gone', request }));
    api.getExportJob.mockReturnValue(throwError(() => failure));
    const store = createStore().service;
    expect(store.exportRun()).toBeNull();
    expect(store.isExporting()).toBe(false);
    expect(sessionStorage.getItem(EXPORT_RUN_STORAGE_KEY)).toBeNull();
  });

  it('restores completed runs without polling and clears them persistently', () => {
    sessionStorage.setItem(
      EXPORT_RUN_STORAGE_KEY,
      JSON.stringify({ status: 'completed', request, result: completed.result }),
    );
    const store = createStore().service;
    expect(store.exportRun()?.result).toEqual(completed.result);
    expect(store.retryExport()).toEqual(request);
    expect(api.getExportJob).not.toHaveBeenCalled();
    store.clearExportRun();
    store.restoreExportRun();
    expect(store.exportRun()).toBeNull();
    expect(store.retryExport()).toBeUndefined();
  });

  it('clear and destroy release polling subscriptions', () => {
    const spectator = createStore();
    const injector = createEnvironmentInjector([CollectionsStore], spectator.inject(EnvironmentInjector));
    const store = injector.get(CollectionsStore);
    api.startExport.mockReturnValue(of(running));
    api.getExportJob.mockReturnValue(of(running));
    store.startExport(request).subscribe();
    store.clearExportRun();
    vi.advanceTimersByTime(1000);
    expect(api.getExportJob).not.toHaveBeenCalled();
    store.startExport(request).subscribe();
    injector.destroy();
    vi.advanceTimersByTime(1000);
    expect(api.getExportJob).not.toHaveBeenCalled();
  });

  it('ignores corrupt storage and drops interrupted starts without a server id', () => {
    for (const raw of ['{bad', 'null', '[]', '{"status":"oops"}', '{"status":"running","request":{"format":"yaml"}}'])
      expect(readPersistedExportRun(raw)).toBeUndefined();
    sessionStorage.setItem(EXPORT_RUN_STORAGE_KEY, JSON.stringify({ status: 'running', request }));
    const store = createStore().service;
    expect(store.exportRun()).toBeNull();
    expect(api.getExportJob).not.toHaveBeenCalled();
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
      api.startExport.mockReturnValue(of(completed));
      expect(() => store.startExport(request).subscribe()).not.toThrow();
      store.restoreExportRun();
      expect(store.exportRun()?.result).toEqual(completed.result);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
});
