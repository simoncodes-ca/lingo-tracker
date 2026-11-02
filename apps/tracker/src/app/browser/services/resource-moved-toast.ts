import type { TranslocoService } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';

/** Localized feedback shared by an editor move and a drag-and-drop move. */
export function resourceMovedToast(transloco: TranslocoService, name: string, folderPath: string): string {
  return transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.RESOURCEMOVEDX, {
    name,
    folder: folderPath || transloco.translate(TRACKER_TOKENS.BROWSER.FOLDERPICKER.ROOTLABEL),
  });
}
