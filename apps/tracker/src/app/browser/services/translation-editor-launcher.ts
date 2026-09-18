import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { NotificationService } from '../../shared/notification';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import {
  TranslationEditorDialog,
  TRANSLATION_EDITOR_TITLE_ID,
  type TranslationEditorDialogData,
  type TranslationEditorResult,
} from '../dialogs/translation-editor';
import { BrowserApiService } from './browser-api.service';
import { BrowserStore } from '../store/browser.store';
import { splitKey } from '../translations/list/store/key-resolution';

/** What the caller knows about the entry it wants opened in the editor. */
export interface OpenEditorParams {
  /** The resource as the dialog wants it: `key` is the entry name inside `folderPath`. */
  resource: ResourceSummaryDto;
  collectionName: string;
  /** Dot-delimited folder the entry lives in; '' for the collection root. */
  folderPath: string;
  /**
   * The key the browser store files this resource under — the list caches by the
   * key it renders, which is relative in folder mode and full in search mode.
   */
  storeKey: string;
  /**
   * The key to drop from the cache when the entry moves out of `folderPath`.
   * Defaults to the saved key, which is what a same-folder rename produces.
   */
  originalKey?: string;
  /** Called with the store key after an in-place update, for the row's flash. */
  onUpdated?: (storeKey: string) => void;
}

/**
 * Opens the translation editor in edit mode, from wherever the request came.
 *
 * The list's row menu and the create dialog's "Open existing" both need the same
 * dialog with the same post-save bookkeeping, and they sit in different injector
 * branches — the list store is component-scoped, the header is its sibling. The
 * launcher is the one place that knows the dialog's configuration, so neither
 * call site carries a copy of it.
 */
@Injectable({ providedIn: 'root' })
export class TranslationEditorLauncher {
  readonly #dialog = inject(MatDialog);
  readonly #api = inject(BrowserApiService);
  readonly #browserStore = inject(BrowserStore);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);

  /** Opens the editor for a resource the caller already holds. */
  openEditor(params: OpenEditorParams): void {
    const { resource, collectionName, folderPath, storeKey, originalKey, onUpdated } = params;

    const dialogData: TranslationEditorDialogData = {
      mode: 'edit',
      resource,
      collectionName,
      folderPath,
      availableLocales: this.#browserStore.availableLocales(),
      baseLocale: this.#browserStore.baseLocale(),
      readOnly: this.#browserStore.isReadOnly(),
    };

    const dialogRef = this.#dialog.open(TranslationEditorDialog, {
      // Size, max-height and the small-viewport full-screen mode live in
      // `.translation-editor-dialog-panel` (styles.scss) so the call sites
      // don't each carry their own copy of the numbers. `maxWidth` is
      // overridden only to lift the CDK's inline 80vw default, which would
      // otherwise beat the stylesheet.
      panelClass: 'translation-editor-dialog-panel',
      maxWidth: '100vw',
      data: dialogData,
      autoFocus: false,
      ariaLabelledBy: TRANSLATION_EDITOR_TITLE_ID,
      restoreFocus: false,
    });

    dialogRef.afterClosed().subscribe((result: TranslationEditorResult | undefined) => {
      if (!result?.success) return;
      if (!result.resource) return;

      const cacheKey = originalKey ?? result.key;
      if (result.folderPath !== folderPath) {
        this.#browserStore.removeResourceFromCache(cacheKey);
        return;
      }

      this.#browserStore.updateTranslationInCache({ ...result.resource, key: storeKey });
      onUpdated?.(storeKey);
      this.#notifications.success(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.TRANSLATIONUPDATED));

      if (result.skippedLocales?.length) {
        this.#notifications.warning(
          this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.SKIPPEDLOCALESX, {
            locales: result.skippedLocales.join(', '),
          }),
        );
      }
    });
  }

  /**
   * Opens the editor for a full dot-delimited key, from a caller that has nothing
   * but the key — the create dialog's "Open existing", which hands back the key of
   * the entry the user collided with.
   *
   * The browser is moved to the entry's folder first, so the dialog closes onto the
   * list the entry is actually in rather than back onto an unrelated folder.
   */
  openByFullKey(fullKey: string, collectionName: string, onUpdated?: (storeKey: string) => void): void {
    const { folderPath, entryKey } = splitKey(fullKey);

    this.#api.getResourceTree(collectionName, folderPath, false).subscribe({
      next: (tree) => {
        const resource = 'resources' in tree ? tree.resources.find((item) => item.key === entryKey) : undefined;
        if (!resource) {
          this.#notifyNotFound();
          return;
        }

        // A search result list would survive the folder change and leave the user
        // looking at the wrong set of rows behind the dialog.
        if (this.#browserStore.isSearchMode()) {
          this.#browserStore.clearSearch();
        }
        this.#browserStore.selectFolder(folderPath);

        this.openEditor({ resource, collectionName, folderPath, storeKey: entryKey, onUpdated });
      },
      error: () => this.#notifyNotFound(),
    });
  }

  #notifyNotFound(): void {
    this.#notifications.error(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.NOTFOUND));
  }
}
