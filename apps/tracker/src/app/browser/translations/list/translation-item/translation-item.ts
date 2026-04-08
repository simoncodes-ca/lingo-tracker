import {
  Component,
  ChangeDetectionStrategy,
  type ElementRef,
  input,
  output,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  type AfterViewInit,
  type OnDestroy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CdkDrag, CdkDragPlaceholder } from '@angular/cdk/drag-drop';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { BrowserStore } from '../../../store/browser.store';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { TranslationItemHeader } from './item-header';
import { TranslationItemLocales } from './item-locales';
import { HighlightPipe } from '../../../../shared/pipes/highlight.pipe';
import type { DragData } from '../../../types/drag-data';
import { TranslationListStore } from '../store/translation-list.store';

const EXPAND_THRESHOLD = 200;
const LONG_PRESS_THRESHOLD = 500;

const STATUS_SORT_PRIORITY: Record<string, number> = {
  stale: 0,
  new: 1,
  translated: 2,
  verified: 3,
  missing: 4,
};

/**
 * Displays a single translation entry with key, base value, locale translations,
 * and action menu.
 */
@Component({
  selector: 'app-translation-item',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    TranslationItemHeader,
    TranslationItemLocales,
    HighlightPipe,
    CdkDrag,
    CdkDragPlaceholder,
    TranslocoPipe,
  ],
  templateUrl: './translation-item.html',
  styleUrl: './translation-item.scss',
  host: {
    class: 'translation-item',
  },
})
export class TranslationItem implements AfterViewInit, OnDestroy {
  /** Translation data */
  translation = input.required<ResourceSummaryDto>();

  /** Whether auto-translation is enabled for this collection */
  translationEnabled = input<boolean>(false);

  /** Emitted when the item's expansion state changes (key + expanded). */
  readonly expansionChanged = output<{ key: string; expanded: boolean }>();

  /** Emitted when drag starts on this item */
  dragStarted = output<DragData>();

  /** Emitted when drag ends on this item */
  dragEnded = output<void>();

  readonly #store = inject(BrowserStore);
  readonly #listStore = inject(TranslationListStore);
  readonly #transloco = inject(TranslocoService);
  readonly TOKENS = TRACKER_TOKENS;

  /** Active collection name — always set when this component is rendered. */
  readonly #collectionName = computed(() => this.#store.selectedCollection() ?? '');

  /** Whether this item was recently updated (flash highlight). */
  readonly isRecentlyUpdated = computed(() => this.#listStore.isRecentlyUpdated(this.translation().key));

  /** Reference to the scrollable wrapper element (used as IntersectionObserver root). */
  protected readonly scrollWrapper = viewChild<ElementRef<HTMLElement>>('scrollWrapper');

  /** Reference to the invisible sentinel element observed to detect scroll-to-bottom. */
  protected readonly scrollSentinel = viewChild<ElementRef<HTMLElement>>('scrollSentinel');

  /**
   * True when the user has scrolled far enough that the sentinel (placed at the
   * bottom of the scrollable content) is visible within the scroll viewport.
   * Used to hide the fade gradient when no more content is hidden below.
   */
  readonly isScrolledToBottom = signal(false);

  /** Active IntersectionObserver instance — cleaned up on destroy or when conditions change. */
  #scrollObserver: IntersectionObserver | undefined;

  /** Current search query from the store */
  readonly searchQuery = this.#store.searchQuery;

  // Timestamp when touch started (ms since epoch)
  #touchStartTs = 0;

  /** Signal used to show visual feedback during touch (long-press) */
  readonly isTouchPressed = signal(false);

  /**
   * Full translation key (combines folder path with entry key if needed).
   * For search results, the key already contains the full path.
   * For folder browsing, we prepend the current folder path.
   */
  readonly fullKey = computed(() => {
    const path = this.#store.isSearchMode() ? '' : this.#store.currentFolderPath();
    const key = this.translation().key;
    return path ? `${path}.${key}` : key;
  });

  /** Base locale value (English/source) */
  readonly baseValue = computed(() => {
    const base = this.#store.baseLocale();
    return this.translation().translations[base] || '';
  });

  /** Locale translations excluding base locale, sorted by status priority then locale code */
  readonly localeTranslations = computed(() => {
    const trans = this.translation();
    const base = this.#store.baseLocale();
    const activeLocales = this.#store.filteredLocales();

    return activeLocales
      .filter((locale) => locale !== base)
      .map((locale) => ({
        locale,
        value: trans.translations[locale] || '',
        status: trans.status ? trans.status[locale] : undefined,
      }))
      .sort((a, b) => {
        const priorityA = a.status ? (STATUS_SORT_PRIORITY[a.status] ?? 4) : 4;
        const priorityB = b.status ? (STATUS_SORT_PRIORITY[b.status] ?? 4) : 4;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return a.locale.localeCompare(b.locale);
      });
  });

  /** Current density mode (reads from BrowserStore) */
  readonly currentDensityMode = computed(() => this.#store.densityMode());

  /** Selected locale for compact mode: the first locale from filteredLocales() */
  readonly primaryLocale = computed(() => {
    const ls = this.#store.filteredLocales();
    return (ls && ls.length > 0 && ls[0]) || this.#store.baseLocale();
  });

  /**
   * Locale to display in the status chip (compact mode).
   * Logic:
   * - If a specific locale is selected (other than base locale) → show that locale
   * - If nothing is selected or only base locale is selected → show the primary locale
   */
  readonly statusChipLocale = computed(() => {
    const activeLocales = this.#store.filteredLocales();
    const base = this.#store.baseLocale();

    // Filter out base locale from active locales
    const nonBaseLocales = activeLocales.filter((locale) => locale !== base);

    // If exactly one non-base locale is selected, use it
    if (nonBaseLocales.length === 1) {
      return nonBaseLocales[0];
    }

    // Otherwise, fall back to primary locale (first in the list)
    return this.primaryLocale();
  });

  /**
   * Value for the selected primary locale in compact mode.
   * In compact mode, shows the translation value for the selected non-base locale.
   * Falls back to base locale value if no non-base locale is selected.
   */
  readonly primaryLocaleValue = computed(() => {
    const activeLocales = this.#store.filteredLocales();
    const base = this.#store.baseLocale();
    const translations = this.translation().translations;

    // Filter out base locale to find selected non-base locales
    const nonBaseLocales = activeLocales.filter((locale) => locale !== base);

    // If a non-base locale is selected, use the first one
    const localeToDisplay = nonBaseLocales.length > 0 ? nonBaseLocales[0] : base;

    return translations[localeToDisplay] || '';
  });

  /** Signal controlling whether the full-mode content is expanded */
  readonly isExpanded = signal(false);

  /** Signal controlling whether the comment is shown instead of translation values */
  readonly showComment = signal(false);

  /**
   * Returns true when the base value or any active locale value exceeds the
   * visual threshold and therefore can be expanded.
   */
  readonly needsExpansion = computed(() => {
    const base = this.baseValue() || '';
    if (base.length > EXPAND_THRESHOLD) return true;

    return this.localeTranslations().some((v) => (v.value || '').length > EXPAND_THRESHOLD);
  });

  /** Toggles the expanded state for full density mode */
  toggleExpansion(): void {
    this.isExpanded.update((v) => !v);
    this.expansionChanged.emit({
      key: this.translation().key,
      expanded: this.isExpanded(),
    });

    // The fade and sentinel are only rendered when collapsed, so synchronise the
    // observer with the new expansion state after Angular has updated the DOM.
    this.#teardownScrollObserver();
    this.isScrolledToBottom.set(false);

    if (!this.isExpanded()) {
      // Re-enter collapsed state: set up observer on the next microtask so the
      // sentinel element has been rendered by Angular's change detection.
      Promise.resolve().then(() => this.#setupScrollObserver());
    }
  }

  /** Toggles the comment display for compact and medium density modes */
  toggleComment(): void {
    this.showComment.update((v) => !v);
  }

  // Double-click handler ---------------------------------------------------
  /**
   * Opens the edit dialog when the item is double-clicked.
   * Ignores double-clicks originating from interactive elements (buttons, inputs,
   * anchors, selects) so that action-menu interactions are not accidentally
   * treated as edit requests.
   */
  onDoubleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const isInteractiveElement = Boolean(target.closest('button, input, textarea, select, a, [role="button"]'));

    if (isInteractiveElement) {
      return;
    }

    this.#listStore.editTranslation(this.translation(), this.#collectionName());
  }

  // Touch handlers ---------------------------------------------------------
  onTouchStart(_event?: TouchEvent): void {
    this.#touchStartTs = Date.now();
    this.isTouchPressed.set(true);
  }

  onTouchEnd(_event?: TouchEvent): void {
    const duration = Date.now() - this.#touchStartTs;
    this.#touchStartTs = 0;
    this.isTouchPressed.set(false);

    // Long press -> open edit
    if (duration > LONG_PRESS_THRESHOLD) {
      this.#listStore.editTranslation(this.translation(), this.#collectionName());
    }
  }

  // Keyboard shortcuts when the item has focus -----------------------------
  onKeyDown(event: KeyboardEvent): void {
    // Ignore with modifiers to avoid interfering with browser shortcuts
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;

    const key = (event.key || '').toLowerCase();

    let action: (() => void) | undefined;

    switch (key) {
      case 'e':
        action = () => this.#listStore.editTranslation(this.translation(), this.#collectionName());
        break;

      case 'delete':
      case 'del':
        action = () => this.#listStore.deleteTranslation(this.translation(), this.#collectionName());
        break;
    }

    if (action) {
      event.preventDefault();
      event.stopPropagation();
      action();
    }
  }

  /**
   * Computes counts of each status and total known statuses.
   * Used by rollupStatus and statusBreakdown to avoid duplicated logic.
   */
  readonly #statusCounts = computed(() => {
    const statusMap = this.translation().status || {};

    const counts: Record<'stale' | 'new' | 'translated' | 'verified', number> = {
      stale: 0,
      new: 0,
      translated: 0,
      verified: 0,
    };

    const total = Object.values(statusMap).reduce((acc, s) => {
      if (!s) return acc;
      if (s in counts) {
        counts[s as keyof typeof counts] += 1;
        return acc + 1;
      }
      return acc;
    }, 0);

    return { counts, total } as const;
  });

  constructor() {
    effect(() => {
      this.currentDensityMode(); // track density changes
      this.isTouchPressed.set(false);
    });
  }

  ngAfterViewInit(): void {
    this.#setupScrollObserver();
  }

  ngOnDestroy(): void {
    this.#teardownScrollObserver();
  }

  /**
   * Creates the IntersectionObserver that watches the sentinel element inside
   * the scroll wrapper. The observer is only created when there are more than
   * 4 locale translations and the item is collapsed — conditions where the fade
   * gradient is actually rendered.
   *
   * The scroll wrapper element is used as the root so intersection is measured
   * against the scrollable viewport rather than the document viewport.
   */
  #setupScrollObserver(): void {
    const shouldObserve = this.localeTranslations().length >= 4 && !this.isExpanded();
    if (!shouldObserve) return;

    const sentinel = this.scrollSentinel()?.nativeElement;
    const wrapper = this.scrollWrapper()?.nativeElement;
    if (!sentinel || !wrapper) return;

    this.#scrollObserver = new IntersectionObserver(([entry]) => this.isScrolledToBottom.set(entry.isIntersecting), {
      root: wrapper,
      threshold: 0.1,
    });
    this.#scrollObserver.observe(sentinel);
  }

  /** Disconnects and discards the active IntersectionObserver. */
  #teardownScrollObserver(): void {
    this.#scrollObserver?.disconnect();
    this.#scrollObserver = undefined;
  }

  /** Returns a stable id for the rollup status element. */
  readonly statusId = computed(() => `rollup-${this.translation().key}`);

  /** Returns true if this translation has tags or a comment. */
  readonly hasMetadata = computed(() => {
    const t = this.translation();
    return Boolean((t.tags && t.tags.length > 0) || t.comment);
  });

  /** Returns first 3 tags for preview display in medium density mode. */
  readonly previewTags = computed(() => {
    const tags = this.translation().tags;
    return tags?.slice(0, 3) ?? [];
  });

  /**
   * Drag data for this translation item.
   * Contains resource key, folder path, and type identifier.
   */
  readonly dragData = computed<DragData>(() => ({
    type: 'resource',
    key: this.fullKey(),
    folderPath: this.#store.isSearchMode() ? '' : this.#store.currentFolderPath(),
  }));

  /**
   * Whether dragging is disabled for this item.
   * Disabled during search mode or when store is disabled.
   */
  readonly isDragDisabled = computed(() => {
    return Boolean(this.searchQuery()) || this.#store.isDisabled();
  });

  /**
   * Returns a comma-separated breakdown of statuses across all locales for use in tooltips.
   * Example: "2 stale, 3 verified, 1 new"
   */
  readonly statusBreakdown = computed(() => {
    const { counts, total } = this.#statusCounts();

    if (total === 0) return this.#transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONITEM.NOSTATUSES);

    const order: Array<keyof typeof counts> = ['stale', 'new', 'translated', 'verified'];
    const parts: string[] = [];

    for (const k of order) {
      const c = counts[k];
      if (c && c > 0) parts.push(`${c} ${k}`);
    }

    return parts.join(', ');
  });

  /**
   * Roll-up status across ALL locales. Priority (worst first): stale > new > translated > verified
   * Returns tuple: [status, count]
   */
  readonly rollupStatus = computed(() => {
    const { counts, total } = this.#statusCounts();

    if (total === 0) return ['new', 0] as const;

    const priority: Array<keyof typeof counts> = ['stale', 'new', 'translated', 'verified'];

    for (const p of priority) {
      const c = counts[p];
      if (c > 0) return [p, c] as const;
    }

    return ['new', 0] as const;
  });

  /**
   * Handles drag started event.
   * Emits drag data to parent components for tracking.
   */
  onDragStarted(): void {
    this.dragStarted.emit(this.dragData());
  }

  /**
   * Handles drag ended event.
   * Notifies parent components that drag has ended.
   */
  onDragEnded(): void {
    this.dragEnded.emit();
  }
}
