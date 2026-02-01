import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

/**
 * FolderSidebarHeader component displays collection context in the sidebar.
 *
 * Shows the collection name prominently with a back button, and displays
 * the translations folder path as secondary information. Also displays
 * collection statistics when available.
 *
 * @example
 * <app-sidebar-header
 *   [collectionName]="collectionName()"
 *   [translationsFolder]="translationsFolder()"
 *   [totalKeys]="store.collectionTotalKeys()"
 *   [localeCount]="store.collectionLocaleCount()"
 *   [statsLoading]="store.isCacheIndexing()"
 *   (backClick)="navigateToCollections()"
 * />
 */
@Component({
  selector: 'app-sidebar-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslocoModule],
  templateUrl: './folder-sidebar-header.html',
  styleUrl: './folder-sidebar-header.scss',
})
export class FolderSidebarHeader {
  readonly TOKENS = TRACKER_TOKENS;

  /** Name of the collection */
  collectionName = input.required<string>();

  /** Path to the translations folder */
  translationsFolder = input.required<string>();

  /** Total number of translation keys (null when not available) */
  totalKeys = input<number | null>(null);

  /** Number of locales (null when not available) */
  localeCount = input<number | null>(null);

  /** Whether stats are currently loading */
  statsLoading = input<boolean>(false);

  /** Emitted when the back button is clicked */
  backClick = output<void>();

  /** Whether to display stats (both must be non-null and not loading) */
  readonly shouldDisplayStats = computed(() => {
    return !this.statsLoading() && this.totalKeys() !== null && this.localeCount() !== null;
  });

  /** Formatted keys chip text */
  readonly keysText = computed(() => {
    const keys = this.totalKeys();
    if (keys === null) return '';
    return `${keys} ${keys === 1 ? 'key' : 'keys'}`;
  });

  /** Formatted locales chip text */
  readonly localesText = computed(() => {
    const locales = this.localeCount();
    if (locales === null) return '';
    return `${locales} ${locales === 1 ? 'locale' : 'locales'}`;
  });

  onBackButtonClick(): void {
    this.backClick.emit();
  }
}
