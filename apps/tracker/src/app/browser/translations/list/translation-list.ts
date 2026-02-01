import { Component, ChangeDetectionStrategy, inject, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import type { ComponentType } from '@angular/cdk/portal';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule, type MatDialogRef } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MoveResourceDialog } from '../../dialogs/move-resource';
import {
  TranslationEditorDialog,
  type TranslationEditorDialogData,
  type TranslationEditorResult,
} from '../../dialogs/translation-editor';
import { BrowserStore } from '../../store/browser.store';
import { TranslationItem } from './translation-item/translation-item';
import type { ResourceSummaryDto, UpdateResourceDto } from '@simoncodes-ca/data-transfer';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { BrowserApiService } from '../../services/browser-api.service';
import { ConfirmationDialog } from '../../../shared/components/confirmation-dialog/confirmation-dialog';
import type { ConfirmationDialogData } from '../../../shared/components/confirmation-dialog/confirmation-dialog-data';

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
  private readonly browserApi = inject(BrowserApiService);

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
    const folderPath = this.store.currentFolderPath();
    const fullKey = folderPath ? `${folderPath}.${translation.key}` : translation.key;

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
      autoFocus: true,
      restoreFocus: false,
    });

    dialogRef.afterClosed().subscribe((result: TranslationEditorResult | undefined) => {
      if (result && !result.success) {
        // Result returned but not marked as success - user made changes but didn't use create flow
        this.#handleEditUpdate(fullKey, result);
      }
    });
  }

  #handleEditUpdate(originalKey: string, result: TranslationEditorResult): void {
    const updateDto: UpdateResourceDto = {
      key: originalKey,
      baseValue: result.baseValue,
      comment: result.comment,
    };

    // Add locale translations if provided
    if (result.translations && result.translations.length > 0) {
      updateDto.locales = {};
      result.translations.forEach((translation) => {
        if (updateDto.locales) {
          updateDto.locales[translation.locale] = {
            value: translation.value,
          };
        }
      });
    }

    this.browserApi.updateResource(this.collectionName(), updateDto).subscribe({
      next: () => {
        this.store.selectFolder(this.store.currentFolderPath());
        this.snackBar.open('Translation updated successfully', '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      },
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to update translation';
        this.snackBar.open(message, '', {
          duration: 4000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      },
    });
  }

  /** Handles move request from translation item. */
  handleMove(translation: ResourceSummaryDto): void {
    this.openResourceDialog(MoveResourceDialog, translation);
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
