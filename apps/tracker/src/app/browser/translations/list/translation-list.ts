import { Component, ChangeDetectionStrategy, inject, input, computed, output, viewChild } from '@angular/core';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { CdkDropList } from '@angular/cdk/drag-drop';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { BrowserStore } from '../../store/browser.store';
import { TranslationItem } from './translation-item/translation-item';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import type { DragData } from '../../types/drag-data';
import { TranslationListStore } from './store/translation-list.store';

@Component({
  selector: 'app-translation-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TranslationListStore],
  imports: [
    ScrollingModule,
    CdkDropList,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslationItem,
    TranslocoPipe,
  ],
  templateUrl: './translation-list.html',
  styleUrl: './translation-list.scss',
})
export class TranslationList {
  protected readonly store = inject(BrowserStore);

  /** Collection name to load translations from */
  collectionName = input.required<string>();

  /** Base locale (source language) */
  baseLocale = input<string>('en');

  /** Whether auto-translation is enabled for this collection */
  translationEnabled = input<boolean>(false);

  /** Emitted when drag starts on a translation item */
  dragStarted = output<DragData>();

  /** Emitted when drag ends on a translation item */
  dragEnded = output<void>();

  /** Predicate that rejects all drops — this list is a drag source only */
  readonly noDropPredicate = () => false;

  /** Reference to the virtual scroll viewport for programmatic size checks. */
  protected readonly scrollViewport = viewChild(CdkVirtualScrollViewport);

  /**
   * Fixed layout constants for full-mode item height calculation.
   * - BASE_HEIGHT: header + base-value + comment row + padding + margin (~80px)
   * - TOUCH_EXTRA: additional height on touch devices for larger tap targets (~16px)
   * - LOCALE_ROW_HEIGHT: height of each locale translation row (~32px)
   * - MAX_VISIBLE_LOCALE_ROWS: locale rows visible before scroll kicks in (4)
   * - MARGIN_BOTTOM: item-container margin-bottom = --spacing-3 (12px)
   */
  readonly #FULL_BASE_HEIGHT = 80;
  readonly #FULL_TOUCH_EXTRA = 16;
  readonly #FULL_LOCALE_ROW_HEIGHT = 32;
  readonly #FULL_MAX_VISIBLE_LOCALE_ROWS = 4;
  readonly #FULL_MARGIN_BOTTOM = 12; // --spacing-3

  /**
   * Compact mode item margin-bottom = --spacing-1 (4px).
   * Must be included in itemSize so CDK Virtual Scroll positions items correctly.
   */
  readonly #COMPACT_MARGIN_BOTTOM = 4; // --spacing-1

  /** Cached once at startup — touch capability never changes during a session. */
  readonly #isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

  /**
   * Computed item size based on current density mode.
   *
   * Compact mode: fixed height (slightly larger on touch devices).
   *
   * Full mode: dynamic height computed as:
   *   baseHeight + min(nonBaseLocaleCount, 4) × localeRowHeight
   * where baseHeight accounts for header, base-value, comment row, and padding.
   * This ensures the virtual scroll viewport allocates the right space for each
   * item without over- or under-allocating.
   */
  readonly currentItemSize = computed<number>(() => {
    const mode = this.store.densityMode();
    const isTouch = this.#isTouch;

    switch (mode) {
      case 'compact':
        return (isTouch ? 100 : 96) + this.#COMPACT_MARGIN_BOTTOM;

      case 'full': {
        const filteredLocales = this.store.filteredLocales();
        const baseLocale = this.store.baseLocale();

        // Count non-base locales that will each render a row
        const nonBaseLocaleCount = filteredLocales.filter((l) => l !== baseLocale).length;
        const visibleLocaleRows = Math.min(nonBaseLocaleCount, this.#FULL_MAX_VISIBLE_LOCALE_ROWS);
        const baseHeight = this.#FULL_BASE_HEIGHT + (isTouch ? this.#FULL_TOUCH_EXTRA : 0);

        return baseHeight + visibleLocaleRows * this.#FULL_LOCALE_ROW_HEIGHT + this.#FULL_MARGIN_BOTTOM;
      }

      default:
        return 120;
    }
  });

  /** When an item toggles expansion, nudge the viewport to recalculate its size.
   *  Uses the typed ViewChild reference rather than a global DOM query so the
   *  correct viewport instance is always targeted.
   */
  handleItemExpansion(_event: { key: string; expanded: boolean }): void {
    const viewport = this.scrollViewport();
    if (!viewport) return;

    // Allow the browser to settle DOM changes before asking the viewport to recalculate.
    requestAnimationFrame(() => viewport.checkViewportSize());
  }

  readonly TOKENS = TRACKER_TOKENS;

  /** Track function for virtual scroll performance. */
  trackByKey(_index: number, item: ResourceSummaryDto): string {
    return item.key;
  }
}
