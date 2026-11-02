import { DestroyRef, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { signalStoreFeature, type, withMethods } from '@ngrx/signals';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { tap } from 'rxjs';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { copyWithFeedback } from '../../../../shared/clipboard';
import { injectConfirmedWrite } from '../../../../shared/confirmed-write';
import { NotificationService } from '../../../../shared/notification';
import { TranslationEditorLauncher } from '../../../services/translation-editor-launcher';
import { BrowserStore } from '../../../store/browser.store';
import { translationChangedRow } from '../../../store/resource-write-outcome';

export function withItemActions() {
  return signalStoreFeature(
    {
      state: type<{ translatingKeys: Set<string>; recentlyUpdatedKey: string | undefined }>(),
      methods: type<{
        addTranslatingKey: (key: string) => void;
        removeTranslatingKey: (key: string) => void;
        flashRecentlyUpdated: (key: string) => void;
      }>(),
    },
    withMethods((store) => {
      const browserStore = inject(BrowserStore);
      const write = injectConfirmedWrite();
      const launcher = inject(TranslationEditorLauncher);
      const destroyRef = inject(DestroyRef);
      const notifications = inject(NotificationService);
      const transloco = inject(TranslocoService);

      return {
        copyKey(translation: ResourceSummaryDto): void {
          void copyWithFeedback(translation.fullKey, {
            successMessage: transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPIEDTOCLIPBOARD),
            failedMessage: transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPYFAILED),
            notifications,
          });
        },

        /** Opens the editor on a row; a save that keeps the entry in this list flashes its row. */
        editTranslation(translation: ResourceSummaryDto): void {
          void launcher.openEdit(translation).then((outcome) => {
            if (outcome.kind === 'saved') store.flashRecentlyUpdated(outcome.fullKey);
          });
        },

        deleteTranslation(translation: ResourceSummaryDto): Promise<void> {
          const { fullKey } = translation;
          const confirm = write.confirmDestructive({
            title: TRACKER_TOKENS.BROWSER.DIALOG.DELETERESOURCE.TITLE,
            message: { token: TRACKER_TOKENS.BROWSER.DIALOG.DELETERESOURCE.MESSAGEX, params: { key: fullKey } },
            cancelButtonText: TRACKER_TOKENS.COMMON.ACTIONS.CANCEL,
          });
          return write.runWrite(browserStore.requestEntryDelete(fullKey, confirm));
        },

        translateResource(translation: ResourceSummaryDto): void {
          const { fullKey } = translation;
          store.addTranslatingKey(fullKey);

          void write.runWrite(
            browserStore.translateResource(fullKey).pipe(
              tap((outcome) => {
                if (destroyRef.destroyed) return;
                store.removeTranslatingKey(fullKey);
                if (translationChangedRow(outcome)) store.flashRecentlyUpdated(fullKey);
              }),
            ),
          );
        },
      };
    }),
  );
}
