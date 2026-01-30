import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonToggleModule, MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LocaleFilter, StatusFilter, TranslationSearch } from '../../sidebar';
import { BrowserStore } from '../../store/browser.store';

type DensityMode = 'compact' | 'medium' | 'full';

/**
 * TranslationMainHeader component provides search and filtering controls
 * for the translation list.
 */
@Component({
  selector: 'app-translation-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslationSearch, LocaleFilter, StatusFilter, MatButtonToggleModule, MatIconModule, MatTooltipModule],
  templateUrl: './translation-main-header.html',
  styleUrl: './translation-main-header.scss',
})
export class TranslationMainHeader {
  readonly store = inject(BrowserStore);

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
}
