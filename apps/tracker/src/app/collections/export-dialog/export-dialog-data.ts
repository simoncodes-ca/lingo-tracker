import type { ExportJobDto, ExportRequestDto } from '@simoncodes-ca/data-transfer';

export interface ExportDialogData {
  preselectedCollection?: string;
  request?: ExportRequestDto;
}

/** The accepted job returned when the dialog closes. */
export type ExportDialogResult = ExportJobDto;

/** Lazy loader, so the dialog stays out of the Collections page chunk until it is opened. */
export const loadExportDialog = () => import('./export-dialog').then((module) => module.ExportDialog);
