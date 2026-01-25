import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

export interface DeleteResourceDialogData {
  resource: ResourceSummaryDto;
  collectionName: string;
}

export interface DeleteResourceDialogResult {
  confirmed: boolean;
}

@Component({
  standalone: true,
  selector: 'app-delete-resource-dialog',
  templateUrl: './delete-resource-dialog.html',
  styleUrls: ['./delete-resource-dialog.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
})
export class DeleteResourceDialog {
  private readonly dialogRef = inject(MatDialogRef<DeleteResourceDialog, DeleteResourceDialogResult>);
  readonly data = inject(MAT_DIALOG_DATA) as DeleteResourceDialogData;

  cancel(): void {
    this.dialogRef.close({ confirmed: false });
  }

  confirm(): void {
    this.dialogRef.close({ confirmed: true });
  }
}
