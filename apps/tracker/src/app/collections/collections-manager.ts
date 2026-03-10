import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { CollectionsStore } from './store/collections.store';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { TagList } from '../shared/tag-list/tag-list.component';

/**
 * Collections Manager component for viewing and managing translation collections.
 *
 * Features:
 * - Displays all collections in a responsive grid
 * - Create, edit, and delete collections
 * - Navigate to translation browser for each collection
 * - Loading and empty states
 * - Success/error notifications via snackbar
 */
@Component({
  selector: 'app-collections-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatSnackBarModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatMenuModule,
    TranslocoModule,
    TagList,
  ],
  templateUrl: './collections-manager.html',
  styleUrl: './collections-manager.scss',
})
export class CollectionsManager {
  readonly store = inject(CollectionsStore);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  readonly TOKENS = TRACKER_TOKENS;

  /**
   * Opens the create collection dialog.
   */
  openCreateDialog(): void {
    import('./collection-form-dialog/collection-form-dialog').then((m) => {
      const dialogRef = this.dialog.open(m.CollectionFormDialog, {
        data: { mode: 'create' },
        width: '500px',
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result) {
          this.store.createCollection({
            name: result.name,
            collection: result.config,
          });
          this.showSuccessToast(this.transloco.translate(TRACKER_TOKENS.COLLECTIONS.TOAST.CREATED));
        }
      });
    });
  }

  /**
   * Opens the edit collection dialog.
   */
  openEditDialog(name: string): void {
    const config = this.store.collections()[name];
    if (!config) {
      this.showErrorToast(this.transloco.translate(TRACKER_TOKENS.COLLECTIONS.TOAST.ERROR));
      return;
    }

    import('./collection-form-dialog/collection-form-dialog').then((m) => {
      const dialogRef = this.dialog.open(m.CollectionFormDialog, {
        data: {
          mode: 'edit',
          name,
          config,
        },
        width: '500px',
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result) {
          this.store.updateCollection({
            oldName: name,
            newName: result.name !== name ? result.name : undefined,
            collection: result.config,
          });
          this.showSuccessToast(this.transloco.translate(TRACKER_TOKENS.COLLECTIONS.TOAST.UPDATED));
        }
      });
    });
  }

  /**
   * Opens the delete confirmation dialog.
   */
  openDeleteDialog(name: string): void {
    import('../shared/components/confirmation-dialog/confirmation-dialog').then((m) => {
      const dialogRef = this.dialog.open(m.ConfirmationDialog, {
        data: {
          title: this.transloco.translate(TRACKER_TOKENS.COLLECTIONS.DIALOG.DELETE.TITLE),
          message: this.transloco.translate(TRACKER_TOKENS.COLLECTIONS.DIALOG.DELETE.MESSAGE, { name }),
          confirmButtonText: this.transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.DELETE),
          cancelButtonText: this.transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.CANCEL),
          actionType: 'destructive',
        },
        width: '400px',
      });

      dialogRef.afterClosed().subscribe((confirmed) => {
        if (confirmed) {
          this.store.deleteCollection(name);
          this.showSuccessToast(this.transloco.translate(TRACKER_TOKENS.COLLECTIONS.TOAST.DELETED));
        }
      });
    });
  }

  /**
   * Navigates to the translation browser for the given collection.
   */
  navigateToBrowser(collectionName: string): void {
    this.router.navigate(['/browser', encodeURIComponent(collectionName)]);
  }

  /**
   * Shows a success toast notification.
   */
  private showSuccessToast(message: string): void {
    this.snackBar.open(message, '', {
      duration: 2500,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['success-snackbar'],
    });
  }

  /**
   * Shows an error toast notification.
   */
  private showErrorToast(message: string): void {
    this.snackBar.open(message, this.transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.CLOSE), {
      duration: 4000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['error-snackbar'],
    });
  }
}
