import { Component, ChangeDetectionStrategy, inject, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ComponentType } from '@angular/cdk/portal';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { EditResourceDialog } from '../../dialogs/edit-resource';
import { MoveResourceDialog } from '../../dialogs/move-resource';
import { DeleteResourceDialog, DeleteResourceDialogResult } from '../../dialogs/delete-resource';
import { BrowserStore } from '../../store/browser.store';
import { TranslationItem } from './translation-item/translation-item';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

@Component({
  selector: 'app-translation-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ScrollingModule,
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

  /** Collection name to load translations from */
  collectionName = input.required<string>();

  /** Base locale (source language) */
  baseLocale = input<string>('en');

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
      case 'compact':
        return 44;
      case 'medium':
        return 88; // medium mode per spec
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
  private readonly SNACK_DELETE_PLACEHOLDER = 'Delete functionality coming soon';

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

  /**
   * Opens a dialog that receives the resource and collection name as data.
   * Keeps dialog opening logic DRY across edit/move/delete dialogs.
   */
  private openResourceDialog<T>(component: ComponentType<T>, resource: ResourceSummaryDto): MatDialogRef<T> {
    // Capture the element that triggered the dialog so we can restore focus when the dialog closes.
    const previousActive = document.activeElement as HTMLElement | null;

    const ref = this.dialog.open(component, {
      data: { resource, collectionName: this.collectionName() },
      // Ensure the dialog will autoFocus first focusable element. We'll manually restore focus after close.
      autoFocus: true,
      restoreFocus: false,
    });

    // When dialog closes, restore focus to the previously focused element if possible.
    ref.afterClosed().subscribe(() => {
      if (previousActive && typeof previousActive.focus === 'function') {
        // Use a small timeout to allow Angular Material to finish teardown.
        setTimeout(() => previousActive.focus(), 0);
      }
    });

    return ref;
  }

  /** Handles edit request from translation item. */
  handleEdit(translation: ResourceSummaryDto): void {
    this.openResourceDialog(EditResourceDialog, translation);
  }

  /** Handles move request from translation item. */
  handleMove(translation: ResourceSummaryDto): void {
    this.openResourceDialog(MoveResourceDialog, translation);
  }

  /**
   * Handles delete request from translation item.
   * Shows the placeholder snackbar when delete is confirmed.
   */
  async handleDelete(translation: ResourceSummaryDto): Promise<void> {
    const ref = this.openResourceDialog(DeleteResourceDialog, translation);

    ref.afterClosed().subscribe((result: DeleteResourceDialogResult | undefined) => {
      if (result?.confirmed) {
        this.snackBar.open(this.SNACK_DELETE_PLACEHOLDER, '', { duration: 3000 });
      }
    });

    return Promise.resolve();
  }

  /** Track function for virtual scroll performance. */
  trackByKey(_index: number, item: ResourceSummaryDto): string {
    return item.key;
  }
}
