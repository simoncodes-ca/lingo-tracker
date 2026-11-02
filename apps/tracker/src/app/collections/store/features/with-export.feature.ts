import { computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { patchState, signalStoreFeature, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { ExportRequestDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { CollectionsApiService } from '../../services/collections-api.service';
import { EXPORT_RUN_STORAGE_KEY, type ExportRunState, readPersistedExportRun } from '../export-runs';
import { injectJobRun } from './inject-job-run';

export type { ExportRunState } from '../export-runs';

export function withExportFeature() {
  return signalStoreFeature(
    withState<{ exportRun: ExportRunState | null }>({ exportRun: null }),
    withComputed(({ exportRun }) => ({ isExporting: computed(() => exportRun()?.status === 'running') })),
    withMethods((store) => {
      const api = inject(CollectionsApiService);
      const transloco = inject(TranslocoService);
      const controller = injectJobRun(
        {
          start: (request) => api.startExport(request),
          getJob: (id) => api.getExportJob(id),
          // Used only after a job was accepted; a start failure stays with the dialog.
          failureMessage: () => transloco.translate(TRACKER_TOKENS.EXPORT.RUN.FAILED),
        },
        EXPORT_RUN_STORAGE_KEY,
        readPersistedExportRun,
        (exportRun) => patchState(store, { exportRun }),
      );
      return {
        dryRunExport: (body: ExportRequestDto) => api.dryRunExport(body),
        startExport: (body: ExportRequestDto) => controller.start(body),
        retryExport: () => controller.retry(),
        clearExportRun: () => controller.clear(),
        restoreExportRun: () => controller.restore(),
      };
    }),
    withHooks({ onInit: (store) => store.restoreExportRun() }),
  );
}
