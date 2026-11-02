import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { ConfirmationDialogData } from './components/confirmation-dialog/confirmation-dialog-data';
import { type TranslationParam, translateToken } from './translate-token';

/** A translation token, with optional interpolation values and translated parameter tokens. */
export type ConfirmationText =
  | string
  | {
      readonly token: string;
      readonly params?: Readonly<Record<string, TranslationParam>>;
    };

/** The caller's wording tokens and the shared dialog's presentation choices. */
export interface ConfirmationSpec {
  readonly title: ConfirmationText;
  readonly message: ConfirmationText;
  readonly confirmButtonText?: ConfirmationText;
  readonly cancelButtonText?: ConfirmationText;
  readonly actionType?: ConfirmationDialogData['actionType'];
}

export interface ConfirmOptions {
  width?: string;
  disableClose?: boolean;
  /** A session guard checked after the lazy import, before opening. */
  canOpen?: () => boolean;
}

/** Lazily opens the shared confirmation and accepts only an explicit true result. */
export function injectConfirm(): (spec: ConfirmationSpec, options?: ConfirmOptions) => Promise<boolean> {
  const dialog = inject(MatDialog);
  const transloco = inject(TranslocoService);
  const text = (value: ConfirmationText): string => {
    if (typeof value === 'string') return transloco.translate(value);
    return translateToken(value.token, value.params, (token, params) => transloco.translate(token, params));
  };
  return async (spec, options = {}) => {
    const data: ConfirmationDialogData = {
      title: text(spec.title),
      message: text(spec.message),
      ...(spec.confirmButtonText !== undefined ? { confirmButtonText: text(spec.confirmButtonText) } : {}),
      ...(spec.cancelButtonText !== undefined ? { cancelButtonText: text(spec.cancelButtonText) } : {}),
      ...(spec.actionType !== undefined ? { actionType: spec.actionType } : {}),
    };
    const { ConfirmationDialog } = await import('./components/confirmation-dialog/confirmation-dialog');
    if (options.canOpen && !options.canOpen()) return false;
    const ref = dialog.open<InstanceType<typeof ConfirmationDialog>, ConfirmationDialogData, boolean>(
      ConfirmationDialog,
      {
        data,
        ...(options.width !== undefined ? { width: options.width } : {}),
        ...(options.disableClose !== undefined ? { disableClose: options.disableClose } : {}),
      },
    );
    return (await firstValueFrom(ref.afterClosed(), { defaultValue: false })) === true;
  };
}
