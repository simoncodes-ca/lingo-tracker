import { Component, ChangeDetectionStrategy, inject, input, computed, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
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
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { TranslocoPipe } from '@jsverse/transloco';
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
  readonly store = inject(BrowserStore);
  private readonly snackBar: MatSnackBar = inject(MatSnackBar);
  private readonly dialog: MatDialog = inject(MatDialog);
  private readonly browserApi = inject(BrowserApiService);

  /** Collection name to load translations from */
  collectionName = input.required<string>();

  /** Base locale (source language) */
  baseLocale = input<string>('en');

  /** Emitted when drag starts on a translation item */
  dragStarted = output<DragData>();

  /** Emitted when drag ends on a translation item */
  dragEnded = output<void>();

  /** Predicate that rejects all drops — this list is a drag source only */
  readonly noDropPredicate = () => false;

  readonly recentlyUpdatedKey = signal<string | null>(null);

  /** Default item height for virtual scrolling (pixels). May be overridden by density mode. */
  readonly itemSize = 120;

  /** Computed item size based on current density mode. For 'full' mode we compute
   *  a conservative item size based on whether the viewport is touch-enabled and
   *  an estimate for collapsed height. Dynamic expansion can change height and the
   *  viewport will be asked to check its size when items emit expansionChanged.
   */
  readonly currentItemSize = computed<number>(() => {
    const mode = this.store.densityMode();

    switch (mode) {
      case 'compact': {
        const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
        return isTouch ? 100 : 96;
      }
      case 'full': {
        // If touch device (approx), add extra padding
        const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
        return isTouch ? 176 : 160; // slightly larger on touch to avoid overlap
      }
      default:
        return 120;
    }
  });

  /** When an item toggles expansion, we should nudge the viewport to recalculate.
   *  We expose a handler that TranslationItem emits to. We avoid holding references
   *  to items and instead call checkViewportSize() to keep memory pressure low.
   */
  handleItemExpansion(_payload: { key: string; expanded: boolean }): void {
    // Guard for SSR or test environments without a global window
    if (typeof window === 'undefined') return;

    const viewport = document.querySelector('cdk-virtual-scroll-viewport') as
      | (Element & { checkViewportSize?: () => void })
      | null;

    const check = viewport?.checkViewportSize;
    if (typeof check === 'function') {
      // Allow the browser to settle DOM changes before asking the viewport to recalculate.
      requestAnimationFrame(() => check.call(viewport));
    }
  }

  readonly TOKENS = TRACKER_TOKENS;

  /** Computed property for locales to display. */
  readonly displayLocales = computed(() => this.store.filteredLocales());

  // Snack messages centralized for clarity
  private readonly SNACK_COPY_OK = 'Copied to clipboard';
  private readonly SNACK_COPY_FAIL = 'Failed to copy';
  private readonly SNACK_DELETE_SUCCESS = 'Resource deleted successfully';
  private readonly SNACK_DELETE_FAIL = 'Failed to delete resource';

  /**
   * Handles copy-to-clipboard request from translation item.
   */
  handleCopyKey(key: string): void {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      this.snackBar.open(this.SNACK_COPY_FAIL, '', {
        duration: 2000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });

      return;
    }

    navigator.clipboard
      .writeText(key)
      .then(() => {
        this.snackBar.open(this.SNACK_COPY_OK, '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      })
      .catch(() => {
        this.snackBar.open(this.SNACK_COPY_FAIL, '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      });
  }

  /** Handles edit request from translation item. */
  handleEdit(translation: ResourceSummaryDto): void {
    const folderPath = this.store.currentFolderPath();

    const dialogData: TranslationEditorDialogData = {
      mode: 'edit',
      resource: translation,
      collectionName: this.collectionName(),
      folderPath: folderPath,
      availableLocales: this.store.availableLocales(),
      baseLocale: this.baseLocale(),
    };

    const dialogRef = this.dialog.open(TranslationEditorDialog, {
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

      if (result.folderPath !== folderPath) {
        // Resource moved to a different folder — remove it from the current view
        this.store.removeResourceFromCache(result.key);
      } else {
        // In-place edit — update the item directly in the store
        this.store.updateTranslationInCache(result.resource);
        this.recentlyUpdatedKey.set(result.key);
        this.snackBar.open('Translation updated successfully', '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
        setTimeout(() => this.recentlyUpdatedKey.set(null), 1500);
      }
    });
  }

  /**
   * Handles delete request from translation item.
   * Shows confirmation dialog and deletes the resource if confirmed.
   */
  handleDelete(translation: ResourceSummaryDto): void {
    const folderPath = this.store.currentFolderPath();
    const fullKey = folderPath ? `${folderPath}.${translation.key}` : translation.key;

    const dialogData: ConfirmationDialogData = {
      title: 'Delete Resource',
      message: `Are you sure you want to delete the resource "${fullKey}"? This action cannot be undone.`,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      actionType: 'destructive',
    };

    const dialogRef = this.dialog.open(ConfirmationDialog, {
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

  #performDelete(fullKey: string, displayKey: string): void {
    this.browserApi.deleteResource(this.collectionName(), [fullKey]).subscribe({
      next: (response) => {
        if (response.entriesDeleted > 0) {
          this.store.removeResourceFromCache(displayKey);
          this.snackBar.open(this.SNACK_DELETE_SUCCESS, '', {
            duration: 2000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          });
        } else {
          this.snackBar.open(this.SNACK_DELETE_FAIL, '', {
            duration: 4000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          });
        }
      },
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : this.SNACK_DELETE_FAIL;
        this.snackBar.open(message, '', {
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
