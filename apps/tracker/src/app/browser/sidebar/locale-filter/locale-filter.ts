import { Component, ChangeDetectionStrategy, inject, input, computed, viewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, type MatMenu } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { BrowserStore } from '../../store/browser.store';

/**
 * LocaleFilter component provides a dropdown for filtering
 * which locales are displayed in the translation list.
 *
 * Features:
 * - Multi-select mode (default): checkboxes, "Select All" and "Clear All" actions
 * - Single-select mode: radio buttons, includes base locale, auto-closes menu after selection
 * - Displays "All locales" by default when none or all are selected (multi-select)
 * - Shows selected locale or count in trigger button
 *
 * @example
 * <app-locale-filter />
 * <app-locale-filter [multiSelect]="false" />
 */
@Component({
  selector: 'app-locale-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule, MatCheckboxModule, MatRadioModule],
  templateUrl: './locale-filter.html',
  styleUrl: './locale-filter.scss',
})
export class LocaleFilter {
  readonly multiSelect = input(true);
  readonly store = inject(BrowserStore);
  readonly localeMenu = viewChild.required<MatMenu>('localeMenu');

  /**
   * Computes the list of locales to display in the dropdown.
   * In multi-select mode: excludes base locale (filterableLocales)
   * In single-select mode: includes all locales including base locale
   */
  readonly displayedLocales = computed(() => {
    if (this.multiSelect()) {
      return this.store.filterableLocales();
    }
    return this.store.availableLocales();
  });

  constructor() {
    // Selection guard: when multiSelect is disabled ensure only the first locale remains selected
    effect(() => {
      if (!this.multiSelect()) {
        const selected = this.store.selectedLocales();
        if (selected.length > 1) {
          this.store.setSelectedLocales([selected[0]]);
        }
      }
    });
  }

  /**
   * Checks if a locale is currently selected.
   */
  isLocaleSelected(locale: string): boolean {
    return this.store.selectedLocales().includes(locale);
  }

  /**
   * Toggles a locale's selection state (multi-select mode).
   */
  toggleLocale(locale: string): void {
    this.store.toggleLocale(locale);
  }

  /**
   * Selects a single locale and closes the menu (single-select mode).
   */
  selectLocale(locale: string): void {
    this.store.setSelectedLocales([locale]);
    this.localeMenu().closed.emit();
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
