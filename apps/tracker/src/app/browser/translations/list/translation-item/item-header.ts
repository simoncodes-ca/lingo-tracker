import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconButton } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { TruncateKeyPipe } from '../../../../shared/pipes/truncate-key.pipe';
import { TagList } from '../../../../shared/tag-list/tag-list.component';
import { TranslationRollup, type LocaleState } from './translation-rollup';
import { HighlightPipe } from '../../../../shared/pipes/highlight.pipe';
import type { ResourceSummaryDto, TranslationStatus } from '@simoncodes-ca/data-transfer';
import { BrowserStore } from '../../../store/browser.store';
import { TranslationListStore } from '../store/translation-list.store';

/**
 * Header component for translation items displaying the key with copy button
 * and actions menu (edit, delete, translate).
 *
 * Reads locale state, search query, and translation status directly from
 * BrowserStore and TranslationListStore to eliminate prop-drilling.
 */
@Component({
  selector: 'app-translation-item-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatIconButton,
    MatProgressSpinnerModule,
    CdkDragHandle,
    TranslocoPipe,
    TruncateKeyPipe,
    TagList,
    TranslationRollup,
    HighlightPipe,
  ],
  templateUrl: './item-header.html',
  styleUrl: './item-header.scss',
  host: {
    class: 'translation-item-header',
  },
})
export class TranslationItemHeader {
  readonly #browserStore = inject(BrowserStore);
  readonly #listStore = inject(TranslationListStore);

  /** Active collection name — always set when this component is rendered. */
  readonly #collectionName = computed(() => this.#browserStore.selectedCollection() ?? '');

  /** Full translation key to display */
  fullKey = input.required<string>();

  /** Translation data for deriving comment, tags, and locale states */
  translation = input.required<ResourceSummaryDto>();

  /** Whether comment is currently shown (compact mode) */
  showComment = input<boolean>(false);

  /** Hide the comment toggle button (used in full mode where comment is shown inline) */
  hideCommentButton = input<boolean>(false);

  /** Whether auto-translation is enabled for this collection */
  translationEnabled = input<boolean>(false);

  /** Emitted when user toggles comment display */
  commentToggle = output<void>();

  readonly TOKENS = TRACKER_TOKENS;

  /** Locale states for the rollup component — derived from the translation status map */
  readonly localeStates = computed<LocaleState[]>(() => {
    const statusMap = this.translation().status || {};
    const base = this.#browserStore.baseLocale();

    return Object.entries(statusMap)
      .filter(([locale, status]) => locale !== base && status)
      .map(([locale, status]) => ({
        code: locale,
        status: status as TranslationStatus,
      }));
  });

  /** Base locale code from the browser store */
  readonly baseLocale = this.#browserStore.baseLocale;

  /** Comment text derived from the translation input */
  readonly comment = computed(() => this.translation().comment);

  /** Current search query from the browser store */
  readonly searchQuery = this.#browserStore.searchQuery;

  /** Tags derived from the translation input */
  readonly tags = computed(() => this.translation().tags ?? []);

  /** Whether this specific item is currently being auto-translated */
  readonly isTranslating = computed(() => this.#listStore.isTranslating(this.translation().key));

  /**
   * Returns true when at least one non-base locale has a 'new' or 'stale' status,
   * indicating there is work for the auto-translator to do.
   */
  readonly hasTranslatableLocales = computed(() => {
    const statusMap = this.translation().status || {};
    const base = this.#browserStore.baseLocale();
    return Object.entries(statusMap)
      .filter(([locale]) => locale !== base)
      .some(([, status]) => status === 'new' || status === 'stale');
  });

  /** Whether the translate action is disabled */
  readonly translateDisabled = computed(() => !this.hasTranslatableLocales() || this.isTranslating());

  /** Computed signal for the comment icon name based on toggle state */
  readonly commentIcon = computed(() => {
    return this.showComment() ? 'chat_bubble' : 'comment';
  });

  /** Computed signal indicating if search query matches content in comment */
  readonly commentHasMatch = computed(() => {
    const query = this.searchQuery();
    const commentText = this.comment();

    if (!query || !commentText || query.length < 3) {
      return false;
    }

    return commentText.toLowerCase().includes(query.toLowerCase());
  });

  onCopyKey(): void {
    this.#listStore.copyKey(this.fullKey());
  }

  onEdit(): void {
    this.#listStore.editTranslation(this.translation(), this.#collectionName());
  }

  onDelete(): void {
    this.#listStore.deleteTranslation(this.translation(), this.#collectionName());
  }

  onTranslate(): void {
    this.#listStore.translateResource(this.translation(), this.#collectionName());
  }

  onCommentClick(event: MouseEvent): void {
    event.stopPropagation();
    this.commentToggle.emit();
  }
}
