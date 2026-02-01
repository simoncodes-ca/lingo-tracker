import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { BrowserStore } from '../../store/browser.store';
import { TranslationStatus } from '@simoncodes-ca/data-transfer';

/**
 * StatusFilter component provides a dropdown for filtering
 * which translation statuses are displayed in the translation list.
 *
 * Features:
 * - Multi-select checkboxes for each status
 * - "Needs Work" quick action selects 'new' and 'stale' statuses
 * - "Clear All" action to deselect all statuses
 * - Visual indicators (colored dots) for selected statuses in trigger button
 * - Status icons with corresponding colors
 *
 * @example
 * <app-status-filter />
 */
@Component({
  selector: 'app-status-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCheckboxModule,
  ],
  templateUrl: './status-filter.html',
  styleUrl: './status-filter.scss',
})
export class StatusFilter {
  readonly store = inject(BrowserStore);

  readonly statusConfig: Record<
    TranslationStatus,
    { label: string; icon: string; color: string }
  > = {
    new: { label: 'New', icon: 'add_circle', color: '#f97316' },
    stale: { label: 'Stale', icon: 'warning', color: 'var(--color-warning)' },
    translated: {
      label: 'Translated',
      icon: 'language',
      color: 'var(--color-info)',
    },
    verified: {
      label: 'Verified',
      icon: 'check_circle',
      color: 'var(--color-success)',
    },
  };

  readonly statuses: TranslationStatus[] = [
    'new',
    'stale',
    'translated',
    'verified',
  ];

  /**
   * Checks if a status is currently selected.
   */
  isStatusSelected(status: TranslationStatus): boolean {
    return this.store.selectedStatuses().includes(status);
  }

  /**
   * Toggles a status's selection state.
   */
  toggleStatus(status: TranslationStatus): void {
    this.store.toggleStatus(status);
  }

  /**
   * Selects 'new' and 'stale' statuses (items that need work).
   */
  selectNeedsWork(): void {
    this.store.selectNeedsWorkStatuses();
  }

  /**
   * Clears all status selections.
   */
  clearAll(): void {
    this.store.clearAllStatuses();
  }
}
