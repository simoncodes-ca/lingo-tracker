import type { ImportJobDto, ImportRequestDto } from '@simoncodes-ca/data-transfer';

export interface ImportDialogData {
  preselectedCollection?: string;
  /** A failed run's echoed request: Retry reopens the dialog with it. */
  request?: ImportRequestDto;
}

/** The accepted job returned when the dialog closes. */
export type ImportDialogResult = ImportJobDto;

/** Lazy loader, so the dialog stays out of the Collections page chunk until it is opened. */
export const loadImportDialog = () => import('./import-dialog').then((module) => module.ImportDialog);
