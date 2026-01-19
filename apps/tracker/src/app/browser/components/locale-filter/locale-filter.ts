import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { BrowserStore } from '../../store/browser.store';

/**
 * LocaleFilter component provides a multi-select dropdown for filtering
 * which locales are displayed in the translation list.
 *
 * Features:
 * - Displays "All locales" by default when none or all are selected
 * - Shows count of selected locales when partially selected
 * - Allows toggling individual locales
 * - Provides "Select All" and "Clear All" quick actions
 *
 * @example
 * <app-locale-filter />
 */
@Component({
  selector: 'app-locale-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCheckboxModule,
  ],
  templateUrl: './locale-filter.html',
  styleUrl: './locale-filter.scss',
})
export class LocaleFilter {
  readonly store = inject(BrowserStore);

  /**
   * Checks if a locale is currently selected.
   */
  isLocaleSelected(locale: string): boolean {
    return this.store.selectedLocales().includes(locale);
  }

  /**
   * Toggles a locale's selection state.
   */
  toggleLocale(locale: string): void {
    this.store.toggleLocale(locale);
  }

  /**
   * Selects all available locales.
   */
  selectAll(): void {
    this.store.selectAllLocales();
  }

  /**
   * Clears all locale selections.
   */
  clearAll(): void {
    this.store.clearAllLocales();
  }
}
