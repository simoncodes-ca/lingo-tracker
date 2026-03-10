import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  computed,
  output,
  signal,
  DestroyRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { CdkDropList } from '@angular/cdk/drag-drop';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  TranslationEditorDialog,
  type TranslationEditorDialogData,
  type TranslationEditorResult,
} from '../../dialogs/translation-editor';
import { BrowserStore } from '../../store/browser.store';
import { TranslationItem } from './translation-item/translation-item';
import type { ResourceSummaryDto, TranslateResourceResponseDto } from '@simoncodes-ca/data-transfer';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { BrowserApiService } from '../../services/browser-api.service';
import { ConfirmationDialog } from '../../../shared/components/confirmation-dialog/confirmation-dialog';
import type { ConfirmationDialogData } from '../../../shared/components/confirmation-dialog/confirmation-dialog-data';
import type { DragData } from '../../types/drag-data';

@Component({
  selector: 'app-translation-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ScrollingModule,
    CdkDropList,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslationItem,
    TranslocoPipe,
  ],
  templateUrl: './translation-list.html',
  styleUrls: ['./translation-list.scss'],
})
export class TranslationList {
  protected readonly store = inject(BrowserStore);
  readonly #snackBar = inject(MatSnackBar);
  readonly #dialog = inject(MatDialog);
  readonly #browserApi = inject(BrowserApiService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #transloco = inject(TranslocoService);

  /** Collection name to load translations from */
  collectionName = input.required<string>();

  /** Base locale (source language) */
  baseLocale = input<string>('en');

  /** Whether auto-translation is enabled for this collection */
  translationEnabled = input<boolean>(false);

  /** Emitted when drag starts on a translation item */
  dragStarted = output<DragData>();

  /** Emitted when drag ends on a translation item */
  dragEnded = output<void>();

  /** Tracks keys currently being translated to show per-item spinners */
  readonly translatingKeys = signal<Set<string>>(new Set());

  /** Predicate that rejects all drops — this list is a drag source only */
  readonly noDropPredicate = () => false;

  readonly recentlyUpdatedKey = signal<string | undefined>(undefined);

  /** Reference to the virtual scroll viewport for programmatic size checks. */
  private readonly scrollViewport = viewChild(CdkVirtualScrollViewport);

  /**
   * Fixed layout constants for full-mode item height calculation.
   * - BASE_HEIGHT: header + base-value + comment row + padding + margin (~80px)
   * - TOUCH_EXTRA: additional height on touch devices for larger tap targets (~16px)
   * - LOCALE_ROW_HEIGHT: height of each locale translation row (~32px)
   * - MAX_VISIBLE_LOCALE_ROWS: locale rows visible before scroll kicks in (4)
   */
  readonly #FULL_BASE_HEIGHT = 80;
  readonly #FULL_TOUCH_EXTRA = 16;
  readonly #FULL_LOCALE_ROW_HEIGHT = 32;
  readonly #FULL_MAX_VISIBLE_LOCALE_ROWS = 4;

  /** Cached once at startup — touch capability never changes during a session. */
  readonly #isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

  /**
   * Computed item size based on current density mode.
   *
   * Compact mode: fixed height (slightly larger on touch devices).
   *
   * Full mode: dynamic height computed as:
   *   baseHeight + min(nonBaseLocaleCount, 4) × localeRowHeight
   * where baseHeight accounts for header, base-value, comment row, and padding.
   * This ensures the virtual scroll viewport allocates the right space for each
   * item without over- or under-allocating.
   */
  readonly currentItemSize = computed<number>(() => {
    const mode = this.store.densityMode();
    const isTouch = this.#isTouch;

    switch (mode) {
      case 'compact':
        return isTouch ? 100 : 96;

      case 'full': {
        const filteredLocales = this.store.filteredLocales();
        const baseLocale = this.store.baseLocale();

        // Count non-base locales that will each render a row
        const nonBaseLocaleCount = filteredLocales.filter((l) => l !== baseLocale).length;
        const visibleLocaleRows = Math.min(nonBaseLocaleCount, this.#FULL_MAX_VISIBLE_LOCALE_ROWS);
        const baseHeight = this.#FULL_BASE_HEIGHT + (isTouch ? this.#FULL_TOUCH_EXTRA : 0);

        return baseHeight + visibleLocaleRows * this.#FULL_LOCALE_ROW_HEIGHT;
      }

      default:
        return 120;
    }
  });

  /** When an item toggles expansion, nudge the viewport to recalculate its size.
   *  Uses the typed ViewChild reference rather than a global DOM query so the
   *  correct viewport instance is always targeted.
   */
  handleItemExpansion(_payload: { key: string; expanded: boolean }): void {
    const viewport = this.scrollViewport();
    if (!viewport) return;

    // Allow the browser to settle DOM changes before asking the viewport to recalculate.
    requestAnimationFrame(() => viewport.checkViewportSize());
  }

  readonly TOKENS = TRACKER_TOKENS;

  /** Computed property for locales to display. */
  readonly displayLocales = computed(() => this.store.filteredLocales());

  /**
   * Handles copy-to-clipboard request from translation item.
   */
  handleCopyKey(key: string): void {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      this.#snackBar.open(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPYFAILED), '', {
        duration: 2000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });

      return;
    }

    navigator.clipboard
      .writeText(key)
      .then(() => {
        this.#snackBar.open(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPIEDTOCLIPBOARD), '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      })
      .catch(() => {
        this.#snackBar.open(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPYFAILED), '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      });
  }

  /** Handles edit request from translation item. */
  handleEdit(translation: ResourceSummaryDto): void {
    const folderPath = this.#resolveEffectiveFolderPath(translation.key);
    const originalKey = this.store.isSearchMode() ? translation.key : undefined;

    const dialogData: TranslationEditorDialogData = {
      mode: 'edit',
      resource: this.#resolveResourceForDialog(translation),
      collectionName: this.collectionName(),
      folderPath: folderPath,
      availableLocales: this.store.availableLocales(),
      baseLocale: this.baseLocale(),
    };

    const dialogRef = this.#dialog.open(TranslationEditorDialog, {
      width: '700px',
      maxHeight: '90vh',
      data: dialogData,
      autoFocus: false,
      restoreFocus: false,
    });

    dialogRef.afterClosed().subscribe((result: TranslationEditorResult | undefined) => {
      if (!result?.success) return;

      // No-op edit — server reported nothing changed
      if (!result.resource) return;

      // In search mode, use the original full key for cache operations
      const cacheKey = originalKey ?? result.key;

      if (result.folderPath !== folderPath) {
        // Resource moved to a different folder — remove it from the current view
        this.store.removeResourceFromCache(cacheKey);
      } else {
        // In-place edit — update the item directly in the store
        this.store.updateTranslationInCache(result.resource);
        this.recentlyUpdatedKey.set(cacheKey);
        this.#snackBar.open(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.TRANSLATIONUPDATED), '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
        setTimeout(() => this.recentlyUpdatedKey.set(undefined), 1500);
      }
    });
  }

  /**
   * Handles delete request from translation item.
   * Shows confirmation dialog and deletes the resource if confirmed.
   */
  handleDelete(translation: ResourceSummaryDto): void {
    const fullKey = this.#resolveFullKey(translation.key);

    const dialogData: ConfirmationDialogData = {
      title: this.#transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.DELETERESOURCE.TITLE),
      message: this.#transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.DELETERESOURCE.MESSAGEX, { key: fullKey }),
      confirmButtonText: this.#transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.DELETE),
      cancelButtonText: this.#transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.CANCEL),
      actionType: 'destructive',
    };

    const dialogRef = this.#dialog.open(ConfirmationDialog, {
      data: dialogData,
      autoFocus: true,
      restoreFocus: true,
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean | undefined) => {
      if (confirmed) {
        this.#performDelete(fullKey, translation.key);
      }
    });
  }

  /**
   * Handles translate request from a translation item.
   * Calls the API to auto-translate new and stale locales, then updates the store cache.
   */
  handleTranslate(translation: ResourceSummaryDto): void {
    const fullKey = this.#resolveFullKey(translation.key);

    this.#addTranslatingKey(translation.key);

    this.#browserApi
      .translateResource(this.collectionName(), fullKey)
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: (response: TranslateResourceResponseDto) => {
          this.#removeTranslatingKey(translation.key);

          this.store.updateTranslationInCache(response.resource);
          this.recentlyUpdatedKey.set(translation.key);
          setTimeout(() => this.recentlyUpdatedKey.set(undefined), 1500);

          const { translatedCount, skippedLocales } = response;

          if (translatedCount > 0) {
            const successMessage =
              translatedCount === 1
                ? this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.LOCALETRANSLATED)
                : this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.LOCALESTRANSLATEDX, {
                    count: translatedCount,
                  });

            this.#snackBar.open(successMessage, '', {
              duration: 3000,
              horizontalPosition: 'center',
              verticalPosition: 'bottom',
            });
          } else if (skippedLocales.length === 0) {
            this.#snackBar.open(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.ALLLOCALESUPTODATE), '', {
              duration: 3000,
              horizontalPosition: 'center',
              verticalPosition: 'bottom',
            });
          }

          if (skippedLocales.length > 0) {
            const skippedList = skippedLocales.join(', ');
            this.#snackBar.open(
              this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.SKIPPEDLOCALESX, { locales: skippedList }),
              this.#transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.DISMISS),
              {
                duration: 5000,
                horizontalPosition: 'center',
                verticalPosition: 'bottom',
              },
            );
          }
        },
        error: (error: unknown) => {
          this.#removeTranslatingKey(translation.key);

          const message =
            error instanceof Error
              ? error.message
              : this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.TRANSLATEFAILED);
          this.#snackBar.open(message, '', {
            duration: 4000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          });
        },
      });
  }

  /**
   * Resolves the full dot-delimited key for a resource.
   *
   * In folder-browsing mode the resource key is just the entry name (e.g. "acceptedFormatsX")
   * and must be prefixed with the current folder path to form the full key
   * (e.g. "forms.acceptedFormatsX").
   *
   * In search mode the key already contains the full path, so no prefix is needed.
   */
  #resolveFullKey(translationKey: string): string {
    if (this.store.isSearchMode()) {
      return translationKey;
    }
    const folderPath = this.store.currentFolderPath();
    return folderPath ? `${folderPath}.${translationKey}` : translationKey;
  }

  /**
   * Splits a full dot-delimited key into its folder path and entry key.
   * E.g. "forms.acceptedFormatsX" → { folderPath: "forms", entryKey: "acceptedFormatsX" }
   */
  #splitKey(fullKey: string): { folderPath: string; entryKey: string } {
    const segments = fullKey.split('.');
    return {
      folderPath: segments.length > 1 ? segments.slice(0, -1).join('.') : '',
      entryKey: segments[segments.length - 1],
    };
  }

  /**
   * Resolves the effective folder path for a resource.
   *
   * In folder-browsing mode returns the current folder path.
   * In search mode, extracts the folder path from the full key
   * (all segments except the last).
   *
   * When nested resources are shown, the key may contain a relative path
   * prefix (e.g. "fileUpload.acceptedFormatsX" when current folder is "forms").
   * In that case the effective folder path is the current folder path combined
   * with the relative folder segments from the key.
   */
  #resolveEffectiveFolderPath(translationKey: string): string {
    if (this.store.isSearchMode()) {
      return this.#splitKey(translationKey).folderPath;
    }

    // When nested resources are shown, keys may contain relative folder path
    // segments (e.g. "fileUpload.acceptedFormatsX"). Extract the folder portion.
    if (this.store.showNestedResources() && translationKey.includes('.')) {
      const { folderPath: relativeFolderPath } = this.#splitKey(translationKey);
      const currentPath = this.store.currentFolderPath();
      return currentPath ? `${currentPath}.${relativeFolderPath}` : relativeFolderPath;
    }

    return this.store.currentFolderPath();
  }

  /**
   * Resolves the resource DTO for use in the edit dialog.
   *
   * In search mode the resource key contains the full path (e.g. "forms.acceptedFormatsX").
   * The edit dialog expects only the entry key (e.g. "acceptedFormatsX") because it
   * combines folderPath and key itself. This method extracts the entry key portion
   * so the dialog constructs the correct full key.
   *
   * Similarly, when nested resources are shown the key may contain relative path
   * segments that need to be stripped so the dialog receives a bare entry key.
   */
  #resolveResourceForDialog(translation: ResourceSummaryDto): ResourceSummaryDto {
    if (this.store.isSearchMode()) {
      return { ...translation, key: this.#splitKey(translation.key).entryKey };
    }

    // When nested resources are shown, the key may include relative folder
    // segments (e.g. "fileUpload.acceptedFormatsX"). Strip them so the dialog
    // receives only the entry key ("acceptedFormatsX").
    if (this.store.showNestedResources() && translation.key.includes('.')) {
      return { ...translation, key: this.#splitKey(translation.key).entryKey };
    }

    return translation;
  }

  #addTranslatingKey(key: string): void {
    this.translatingKeys.update((keys) => {
      const next = new Set(keys);
      next.add(key);
      return next;
    });
  }

  #removeTranslatingKey(key: string): void {
    this.translatingKeys.update((keys) => {
      const next = new Set(keys);
      next.delete(key);
      return next;
    });
  }

  #performDelete(fullKey: string, displayKey: string): void {
    this.#browserApi
      .deleteResource(this.collectionName(), [fullKey])
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: (response) => {
          if (response.entriesDeleted > 0) {
            this.store.removeResourceFromCache(displayKey);
            this.#snackBar.open(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.RESOURCEDELETED), '', {
              duration: 2000,
              horizontalPosition: 'center',
              verticalPosition: 'bottom',
            });
          } else {
            this.#snackBar.open(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.DELETEFAILED), '', {
              duration: 4000,
              horizontalPosition: 'center',
              verticalPosition: 'bottom',
            });
          }
        },
        error: (error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.DELETEFAILED);
          this.#snackBar.open(message, '', {
            duration: 4000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          });
        },
      });
  }

  /** Track function for virtual scroll performance. */
  trackByKey(_index: number, item: ResourceSummaryDto): string {
    return item.key;
  }
}
