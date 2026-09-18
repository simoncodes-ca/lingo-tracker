import { inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { NotificationService } from '../../../../shared/notification';
import { BrowserApiService } from '../../../services/browser-api.service';
import { BrowserStore } from '../../../store/browser.store';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { TranslationEditorLauncher } from '../../../services/translation-editor-launcher';
import { ConfirmationDialog } from '../../../../shared/components/confirmation-dialog/confirmation-dialog';
import type { ConfirmationDialogData } from '../../../../shared/components/confirmation-dialog/confirmation-dialog-data';
import type { ResourceSummaryDto, TranslateResourceResponseDto } from '@simoncodes-ca/data-transfer';
import { resolveFullKey, resolveEffectiveFolderPath, resolveResourceForDialog } from './key-resolution';

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
      const api = inject(BrowserApiService);
      const browserStore = inject(BrowserStore);
      const dialog = inject(MatDialog);
      const launcher = inject(TranslationEditorLauncher);
      const destroyRef = inject(DestroyRef);
      const notifications = inject(NotificationService);
      const transloco = inject(TranslocoService);

      return {
        copyKey(key: string): void {
          if (!navigator.clipboard?.writeText) {
            notifications.error(transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPYFAILED));
            return;
          }
          navigator.clipboard
            .writeText(key)
            .then(() => notifications.success(transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPIEDTOCLIPBOARD)))
            .catch(() => notifications.error(transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPYFAILED)));
        },

        editTranslation(translation: ResourceSummaryDto, collectionName: string): void {
          const folderPath = resolveEffectiveFolderPath(
            translation.key,
            browserStore.isSearchMode(),
            browserStore.showNestedResources(),
            browserStore.currentFolderPath(),
          );

          launcher.openEditor({
            resource: resolveResourceForDialog(
              translation,
              browserStore.isSearchMode(),
              browserStore.showNestedResources(),
            ),
            collectionName,
            folderPath,
            storeKey: translation.key,
            originalKey: browserStore.isSearchMode() ? translation.key : undefined,
            onUpdated: (key) => store.flashRecentlyUpdated(key),
          });
        },

        /**
         * Opens the editor for a full dot-delimited key, moving the browser to the
         * folder that holds it. The create dialog's "Open existing" ends here: the
         * user asked for the entry they collided with, not for the folder they
         * happened to be standing in.
         */
        openResourceByKey(fullKey: string, collectionName: string): void {
          launcher.openByFullKey(fullKey, collectionName, (key) => store.flashRecentlyUpdated(key));
        },

        deleteTranslation(translation: ResourceSummaryDto, collectionName: string): void {
          // Last line of defence for every caller. A read-only collection must
          // never reach the confirmation dialog: asking the user to confirm a
          // deletion the API will refuse is a promise the UI cannot keep.
          if (browserStore.isReadOnly()) return;

          const fullKey = resolveFullKey(
            translation.key,
            browserStore.isSearchMode(),
            browserStore.currentFolderPath(),
          );

          const dialogData: ConfirmationDialogData = {
            title: transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.DELETERESOURCE.TITLE),
            message: transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.DELETERESOURCE.MESSAGEX, { key: fullKey }),
            confirmButtonText: transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.DELETE),
            cancelButtonText: transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.CANCEL),
            actionType: 'destructive',
          };

          const dialogRef = dialog.open(ConfirmationDialog, {
            data: dialogData,
            autoFocus: true,
            restoreFocus: true,
          });

          dialogRef
            .afterClosed()
            .pipe(takeUntilDestroyed(destroyRef))
            .subscribe((confirmed: boolean | undefined) => {
              if (!confirmed) return;
              api
                .deleteResource(collectionName, [fullKey])
                .pipe(takeUntilDestroyed(destroyRef))
                .subscribe({
                  next: (response) => {
                    if (response.entriesDeleted > 0) {
                      // Cache is indexed by the relative key, not the full key used for the API call.
                      browserStore.removeResourceFromCache(translation.key);
                      notifications.success(transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.RESOURCEDELETED));
                    } else {
                      notifications.error(transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.DELETEFAILED));
                    }
                  },
                  error: (error: unknown) => {
                    const message =
                      error instanceof Error
                        ? error.message
                        : transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.DELETEFAILED);
                    notifications.error(message);
                  },
                });
            });
        },

        translateResource(translation: ResourceSummaryDto, collectionName: string): void {
          const fullKey = resolveFullKey(
            translation.key,
            browserStore.isSearchMode(),
            browserStore.currentFolderPath(),
          );
          store.addTranslatingKey(translation.key);

          api
            .translateResource(collectionName, fullKey)
            .pipe(takeUntilDestroyed(destroyRef))
            .subscribe({
              next: (response: TranslateResourceResponseDto) => {
                store.removeTranslatingKey(translation.key);
                // Cache uses the relative key; rewrite from the bare API key before updating.
                const storeResource = { ...response.resource, key: translation.key };
                browserStore.updateTranslationInCache(storeResource);
                store.flashRecentlyUpdated(translation.key);

                const { translatedCount, skippedLocales } = response;
                if (translatedCount > 0) {
                  const successMessage =
                    translatedCount === 1
                      ? transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.LOCALETRANSLATED)
                      : transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.LOCALESTRANSLATEDX, {
                          count: translatedCount,
                        });
                  notifications.success(successMessage);
                } else if (skippedLocales.length === 0) {
                  notifications.info(transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.ALLLOCALESUPTODATE));
                }
                if (skippedLocales.length > 0) {
                  notifications.warning(
                    transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.SKIPPEDLOCALESX, {
                      locales: skippedLocales.join(', '),
                    }),
                  );
                }
              },
              error: (error: unknown) => {
                store.removeTranslatingKey(translation.key);
                const message =
                  error instanceof Error
                    ? error.message
                    : transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.TRANSLATEFAILED);
                notifications.error(message);
              },
            });
        },
      };
    }),
  );
}
