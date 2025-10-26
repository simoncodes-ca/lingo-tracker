import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CollectionWithName } from '../common/types/collection-with-name';
import { applicationStore } from '../store/application-store';
import { ApiService } from '../services/api';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent, ConfirmationDialogData } from '../common/components';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'collection-selector',
  standalone: true,
  imports: [CommonModule, MatGridListModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './collection-selector.html',
  styleUrl: './collection-selector.scss'
})
export class CollectionSelector {
  private router = inject(Router);
  private store = inject(applicationStore);
  private apiService = inject(ApiService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  
  collections = this.store.collections;
  deletingNames = signal<Set<string>>(new Set());

  isDeleting(name: string): boolean {
    return this.deletingNames().has(name);
  }

  private setDeleting(name: string, deleting: boolean) {
    const next = new Set(this.deletingNames());
    if (deleting) {
      next.add(name);
    } else {
      next.delete(name);
    }
    this.deletingNames.set(next);
  }

  selectCollection(collection: CollectionWithName) {
    if (this.isDeleting(collection.name)) {
      return;
    }
    this.router.navigate(['/collections', collection.encodedName]);
  }

  async deleteCollection(event: Event, collection: CollectionWithName) {
    event.stopPropagation(); // Prevent card click event
    
    const confirmed = await this.showConfirmationDialog();
    if (!confirmed) {
      return;
    }

    this.setDeleting(collection.name, true);
    this.apiService.deleteCollection(collection.name).subscribe({
      next: (response) => {
        this.store.loadCollections();
        this.snackBar.open(response.message, 'Close', { duration: 3000 });
        this.setDeleting(collection.name, false);
      },
      error: (error) => {
        const errorMessage = error.error?.message || error.message || 'Failed to delete collection';
        this.snackBar.open(`Error: ${errorMessage}`, 'Close', { duration: 5000 });
        this.setDeleting(collection.name, false);
      }
    });
  }

  private async showConfirmationDialog(): Promise<boolean> {
    const data: ConfirmationDialogData = {
      title: 'Confirmation Required',
      message: 'Are you sure you want to delete the reference to the collection in the configuration?'
    };

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data,
      disableClose: true,
      width: '420px',
      panelClass: 'confirmation-dialog-panel'
    });

    return await firstValueFrom(dialogRef.afterClosed());
  }
}
