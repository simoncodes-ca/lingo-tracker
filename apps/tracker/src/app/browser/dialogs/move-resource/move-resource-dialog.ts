import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

export interface MoveResourceDialogData {
  resource: ResourceSummaryDto;
  collectionName: string;
}

@Component({
  standalone: true,
  selector: 'app-move-resource-dialog',
  templateUrl: './move-resource-dialog.html',
  styleUrls: ['./move-resource-dialog.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
})
export class MoveResourceDialog {
  private readonly dialogRef = inject(MatDialogRef<MoveResourceDialog>);
  readonly data = inject(MAT_DIALOG_DATA) as MoveResourceDialogData;

  close(): void {
    this.dialogRef.close();
  }
}
