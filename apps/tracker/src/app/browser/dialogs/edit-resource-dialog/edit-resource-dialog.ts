import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

export interface EditResourceDialogData {
  resource: ResourceSummaryDto;
  collectionName: string;
}

@Component({
  standalone: true,
  selector: 'app-edit-resource-dialog',
  templateUrl: './edit-resource-dialog.html',
  styleUrls: ['./edit-resource-dialog.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
})
export class EditResourceDialog {
  private readonly dialogRef = inject(MatDialogRef<EditResourceDialog>);
  readonly data = inject(MAT_DIALOG_DATA) as EditResourceDialogData;

  close(): void {
    this.dialogRef.close();
  }
}
