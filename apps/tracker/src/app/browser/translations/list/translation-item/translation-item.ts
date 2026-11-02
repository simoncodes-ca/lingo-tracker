import { CdkDrag, CdkDragPlaceholder } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { injectStatusBreakdown } from '../../../../shared/i18n/status-breakdown';
import { HighlightPipe } from '../../../../shared/pipes/highlight.pipe';
import {
  statusIconFor,
  statusLabelTokenFor,
} from '../../../../shared/translation-status/translation-status-presentation';
import { BrowserStore } from '../../../store/browser.store';
import type { DragData } from '../../../types/drag-data';
import { TranslationListStore } from '../store/translation-list.store';
import { TranslationItemHeader } from './item-header';
import { TranslationItemLocales } from './item-locales';
import { rowView } from './row-view';

/**
 * Number of locale rows rendered while a full-density item is collapsed.
 * Kept in sync with the virtual-scroll itemSize estimate in translation-list.ts.
 */
const MAX_VISIBLE_LOCALE_ROWS = 4;
const LONG_PRESS_THRESHOLD = 500;

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
export class TranslationItem {
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
  readonly TOKENS = TRACKER_TOKENS;

  /** Whether this item was recently updated (flash highlight). */
  readonly isRecentlyUpdated = computed(() => this.#listStore.isRecentlyUpdated(this.translation().fullKey));

  /** Current search query from the store */
  readonly searchQuery = this.#store.searchQuery;

  // Timestamp when touch started (ms since epoch)
  #touchStartTs = 0;

  /** Signal used to show visual feedback during touch (long-press) */
  readonly isTouchPressed = signal(false);

  /**
   * What this row shows under the list's current locale selection — see `row-view.ts`.
   * The computeds below only hand its parts to the template.
   */
  readonly view = computed(() =>
    rowView(this.translation(), {
      visibleLocales: this.#store.filteredLocales(),
      compactLocale: this.#store.compactDisplayLocale(),
    }),
  );

  /** The source row for full density; absent when there is no base value to compare against. */
  readonly baseRow = computed(() => this.view().baseRow);

  /** Visible target locales, worst status first, then by locale code. */
  readonly localeTranslations = computed(() => this.view().localeRows);

  /** Current density mode (reads from BrowserStore) */
  readonly currentDensityMode = computed(() => this.#store.densityMode());

  /**
   * What the compact row shows: one locale's value, and at most one marker — the
   * status chip when the locale needs work, otherwise the same-as-source flag.
   * The locale is the store's single compact selection, the base locale until the
   * user picks another, and its value takes the base value's place.
   */
  readonly compactDisplay = computed(() => this.view().compact);

  /** Material icon for the compact row's status. */
  readonly compactStatusIcon = computed(() => statusIconFor(this.compactDisplay().status));

  /** Transloco token for the compact row's status label ('' when the status is unknown). */
  readonly compactStatusToken = computed(() => statusLabelTokenFor(this.compactDisplay().status));

  /** Whether the compact row has anything to say beyond the value itself. */
  readonly hasCompactAnnotation = computed(() => {
    const display = this.compactDisplay();
    return display.needsAttention || display.isSameAsBase;
  });

  /** Signal controlling whether the full-mode content is expanded */
  readonly isExpanded = signal(false);

  /** Signal controlling whether the comment is shown instead of translation values */
  readonly showComment = signal(false);

  /**
   * Locale rows rendered in full density. While collapsed the list is sliced to
   * MAX_VISIBLE_LOCALE_ROWS; the rows left out are counted by hiddenLocaleCount
   * and named on the expand button, so nothing is ever hidden silently.
   */
  readonly visibleLocaleTranslations = computed(() => {
    const all = this.localeTranslations();
    return this.isExpanded() ? all : all.slice(0, MAX_VISIBLE_LOCALE_ROWS);
  });

  /** Number of locale rows withheld by the collapsed state. */
  readonly hiddenLocaleCount = computed(() =>
    this.isExpanded() ? 0 : Math.max(0, this.localeTranslations().length - MAX_VISIBLE_LOCALE_ROWS),
  );

  /** True when the base value or any active locale value is clipped by its line clamp. */
  readonly hasClippedValues = computed(() => this.view().hasLongValue);

  /**
   * Whether the expand control is offered. It answers "is anything hidden?" —
   * either locale rows the collapsed list dropped, or values the line clamp cut.
   */
  readonly needsExpansion = computed(
    () => this.isExpanded() || this.hiddenLocaleCount() > 0 || this.hasClippedValues(),
  );

  /**
   * Token for the expand control's label. Resolved through the transloco pipe in
   * the template rather than TranslocoService, so the label re-renders when the
   * UI language changes.
   */
  readonly expandLabelToken = computed(() => {
    if (this.isExpanded()) return TRACKER_TOKENS.BROWSER.TRANSLATIONITEM.SHOWLESS;
    if (this.hiddenLocaleCount() > 0) return TRACKER_TOKENS.BROWSER.TRANSLATIONITEM.MORELOCALESX;
    return TRACKER_TOKENS.BROWSER.TRANSLATIONITEM.SHOWMORE;
  });

  /** Interpolation params for expandLabelToken. */
  readonly expandLabelParams = computed(() => ({ count: this.hiddenLocaleCount() }));

  /** Toggles the expanded state for full density mode */
  toggleExpansion(): void {
    this.isExpanded.update((v) => !v);
    this.expansionChanged.emit({
      key: this.translation().fullKey,
      expanded: this.isExpanded(),
    });
  }

  /** Toggles the comment display for compact and medium density modes */
  toggleComment(): void {
    this.showComment.update((v) => !v);
  }

  // Double-click handler ---------------------------------------------------
  /**
   * Opens the edit dialog when the item's chrome is double-clicked.
   *
   * Two kinds of target are excluded. Interactive elements (buttons, inputs,
   * anchors, selects), so that action-menu interactions are not treated as edit
   * requests. And anything marked `data-selectable-text` — the base value, the
   * locale values and the note — because on those a double-click is the
   * operating system's word-select gesture: the person is reaching for ⌘C, and a
   * dialog opening on top of the selection they just made defeats them. Those
   * regions behave as plain text; the row's header, gaps and labels still open
   * the editor, as do `E`, long-press and the actions menu.
   */
  onDoubleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const isInteractiveElement = Boolean(target.closest('button, input, textarea, select, a, [role="button"]'));
    const isSelectableText = Boolean(target.closest('[data-selectable-text]'));

    if (isInteractiveElement || isSelectableText) {
      return;
    }

    this.#listStore.editTranslation(this.translation());
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
      this.#listStore.editTranslation(this.translation());
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
        action = () => this.#listStore.editTranslation(this.translation());
        break;

      case 'delete':
      case 'del':
        action = () => {
          void this.#listStore.deleteTranslation(this.translation());
        };
        break;
    }

    if (action) {
      event.preventDefault();
      event.stopPropagation();
      action();
    }
  }

  /** Status counts across every target locale of the entry, whatever the locale filter shows. */
  readonly #statusCounts = computed(() => this.view().statusCounts);

  constructor() {
    effect(() => {
      this.currentDensityMode(); // track density changes
      this.isTouchPressed.set(false);
    });
  }

  /** Returns a stable id for the rollup status element. */
  readonly statusId = computed(() => `rollup-${this.translation().fullKey}`);

  /** Drag data for this translation item: the resource's full key and the folder it lives in. */
  readonly dragData = computed<DragData>(() => ({
    type: 'resource',
    key: this.translation().fullKey,
    folderPath: this.translation().folderPath,
  }));

  /**
   * Whether dragging is disabled for this item.
   * Disabled during search mode, when the store is busy, or when the collection is read-only.
   */
  readonly isDragDisabled = computed(() => {
    return Boolean(this.searchQuery()) || this.#store.effectiveDisabled();
  });

  /**
   * Localized breakdown of statuses across all locales, announced to screen
   * readers. Example: "2 stale, 3 verified, 1 new".
   */
  readonly statusBreakdown = injectStatusBreakdown(this.#statusCounts);

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
