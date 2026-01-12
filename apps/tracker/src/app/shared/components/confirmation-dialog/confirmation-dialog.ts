import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { ConfirmationDialogData } from './confirmation-dialog-data';

/**
 * Generic confirmation dialog component.
 *
 * @example
 * // Standard confirmation
 * const dialogRef = this.dialog.open(ConfirmationDialog, {
 *   data: {
 *     title: 'Confirm Action',
 *     message: 'Are you sure you want to proceed?',
 *     confirmButtonText: 'Yes',
 *     cancelButtonText: 'No',
 *     actionType: 'standard'
 *   }
 * });
 *
 * dialogRef.afterClosed().subscribe(result => {
 *   if (result === true) {
 *     // User confirmed
 *   }
 * });
 *
 * @example
 * // Destructive action (delete, remove, etc.)
 * const dialogRef = this.dialog.open(ConfirmationDialog, {
 *   data: {
 *     title: 'Delete Collection',
 *     message: 'Are you sure you want to delete this collection? This action cannot be undone.',
 *     confirmButtonText: 'Delete',
 *     actionType: 'destructive'
 *   }
 * });
 */
@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './confirmation-dialog.html',
  styleUrl: './confirmation-dialog.scss',
})
export class ConfirmationDialog {
  readonly dialogRef = inject(MatDialogRef<ConfirmationDialog>);
  readonly data = inject<ConfirmationDialogData>(MAT_DIALOG_DATA);

  get confirmButtonText(): string {
    return this.data.confirmButtonText ?? 'OK';
  }

  get cancelButtonText(): string {
    return this.data.cancelButtonText ?? 'Cancel';
  }

  get isDestructive(): boolean {
    return this.data.actionType === 'destructive';
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
