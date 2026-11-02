import { computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { patchState, signalStoreFeature, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { type ImportRequestDto, JOB_RETENTION_MS } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { CollectionsApiService } from '../../services/collections-api.service';
import { IMPORT_RUN_STORAGE_KEY, type ImportRunState, readPersistedImportRun } from '../import-runs';
import { injectJobRun } from './inject-job-run';

export type { ImportRunState } from '../import-runs';

export function withImportFeature() {
  return signalStoreFeature(
    withState<{ importRun: ImportRunState | null }>({ importRun: null }),
    withComputed(({ importRun }) => ({ isImporting: computed(() => importRun()?.status === 'running') })),
    withMethods((store) => {
      const api = inject(CollectionsApiService);
      const transloco = inject(TranslocoService);
      const controller = injectJobRun(
        {
          start: (request) => api.startImport(request),
          getJob: (id) => api.getImportJob(id),
          // Used only after a job was accepted; a start failure stays with the dialog.
          failureMessage: () => transloco.translate(TRACKER_TOKENS.IMPORT.TOAST.STARTFAILED),
        },
        IMPORT_RUN_STORAGE_KEY,
        readPersistedImportRun,
        (importRun) => patchState(store, { importRun }),
      );
      return {
        /** Evaluate at read time so expiry does not depend on a signal changing. */
        isImportSummaryAvailable(now = Date.now()): boolean {
          const run = store.importRun();
          if (run?.status !== 'completed' || !run.jobId?.trim() || !run.finishedAt) return false;
          const age = now - Date.parse(run.finishedAt);
          return age >= 0 && age <= JOB_RETENTION_MS;
        },
        listImportSources: (collection: string, folder?: string) => api.listImportSources(collection, folder),
        uploadImportSources: (
          collection: string,
          files: readonly File[],
          options: { folder?: string; overwrite?: boolean } = {},
        ) => api.uploadImportSources(collection, files, options),
        dryRunImport: (body: ImportRequestDto) => api.dryRunImport(body),
        startImport: (body: ImportRequestDto) => controller.start(body),
        retryImport: () => controller.retry(),
        clearImportRun: () => controller.clear(),
        restoreImportRun: () => controller.restore(),
      };
    }),
    withHooks({ onInit: (store) => store.restoreImportRun() }),
  );
}
