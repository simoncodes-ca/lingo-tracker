import { inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { NotificationService } from '../../../../shared/notification';
import { BrowserApiService } from '../../../services/browser-api.service';
import { BrowserStore } from '../../../store/browser.store';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { TranslationEditorDialog } from '../../../dialogs/translation-editor';
import type { TranslationEditorDialogData, TranslationEditorResult } from '../../../dialogs/translation-editor';
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
          const originalKey = browserStore.isSearchMode() ? translation.key : undefined;

          const dialogData: TranslationEditorDialogData = {
            mode: 'edit',
            resource: resolveResourceForDialog(
              translation,
              browserStore.isSearchMode(),
              browserStore.showNestedResources(),
            ),
            collectionName,
            folderPath,
            availableLocales: browserStore.availableLocales(),
            baseLocale: browserStore.baseLocale(),
          };

          const dialogRef = dialog.open(TranslationEditorDialog, {
            width: '700px',
            maxHeight: '90vh',
            data: dialogData,
            autoFocus: false,
            restoreFocus: false,
          });

          dialogRef
            .afterClosed()
            .pipe(takeUntilDestroyed(destroyRef))
            .subscribe((result: TranslationEditorResult | undefined) => {
              if (!result?.success) return;
              if (!result.resource) return;
              const cacheKey = originalKey ?? result.key;
              if (result.folderPath !== folderPath) {
                browserStore.removeResourceFromCache(cacheKey);
              } else {
                const storeResource = { ...result.resource, key: translation.key };
                browserStore.updateTranslationInCache(storeResource);
                store.flashRecentlyUpdated(translation.key);
                notifications.success(transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.TRANSLATIONUPDATED));
                if (result.skippedLocales?.length) {
                  const skippedList = result.skippedLocales.join(', ');
                  notifications.warning(
                    transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.SKIPPEDLOCALESX, { locales: skippedList }),
                  );
                }
              }
            });
        },

        deleteTranslation(translation: ResourceSummaryDto, collectionName: string): void {
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
