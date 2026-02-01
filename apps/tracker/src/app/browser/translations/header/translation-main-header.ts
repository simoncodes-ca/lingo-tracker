import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonToggleModule, MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LocaleFilter, StatusFilter, TranslationSearch } from '../../sidebar';
import { BrowserStore } from '../../store/browser.store';
import {
  TranslationEditorDialog,
  TranslationEditorDialogData,
  TranslationEditorResult,
} from '../../dialogs/translation-editor';

type DensityMode = 'compact' | 'medium' | 'full';

/**
 * TranslationMainHeader component provides search and filtering controls
 * for the translation list.
 */
@Component({
  selector: 'app-translation-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslationSearch, LocaleFilter, StatusFilter, MatButtonToggleModule, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './translation-main-header.html',
  styleUrl: './translation-main-header.scss',
})
export class TranslationMainHeader {
  readonly store = inject(BrowserStore);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly formattedFolderPath = computed(() => {
    const folderPath = this.store.currentFolderPath();

    if (!folderPath) {
      return null;
    }

    const segments = folderPath.split('.');
    const maxVisibleSegments = 3;

    if (segments.length <= maxVisibleSegments) {
      return segments.join(' / ');
    }

    const visibleSegments = segments.slice(-maxVisibleSegments);
    return '... / ' + visibleSegments.join(' / ');
  });

  handleDensityChange(event: MatButtonToggleChange): void {
    const densityMode = event.value as DensityMode;
    this.store.setDensityMode(densityMode);
  }

  handleSortDirectionToggle(): void {
    this.store.toggleSortDirection();
  }

  handleAddTranslation(): void {
    const dialogData: TranslationEditorDialogData = {
      mode: 'create',
      collectionName: this.store.selectedCollection() || '',
      folderPath: this.store.currentFolderPath(),
      availableLocales: this.store.availableLocales(),
      baseLocale: this.store.baseLocale(),
    };

    const dialogRef = this.dialog.open(TranslationEditorDialog, {
      width: '700px',
      maxHeight: '90vh',
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe((result: TranslationEditorResult | undefined) => {
      if (result?.success) {
        this.store.selectFolder(this.store.currentFolderPath());
        this.snackBar.open('Translation created successfully', '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      }
    });
  }
}
