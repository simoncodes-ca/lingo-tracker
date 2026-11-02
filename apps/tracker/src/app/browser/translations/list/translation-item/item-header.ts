import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { hasKeyLeaf, KeyMarkupPipe } from '../../../../shared/pipes/key-markup.pipe';
import { hasSearchLength } from '../../../../shared/search/search-minimum';
import { TagList } from '../../../../shared/tag-list/tag-list.component';
import { BrowserStore } from '../../../store/browser.store';
import { TranslationListStore } from '../store/translation-list.store';
import type { RowView } from './row-view';
import { TranslationRollup } from './translation-rollup';

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
    KeyMarkupPipe,
    TagList,
    TranslationRollup,
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

  /** The resource: its key, comment and tags, and what the row actions act on. */
  translation = input.required<ResourceSummaryDto>();

  /** What the row shows (see `row-view.ts`); the header reads the rollup and the translate verdict. */
  view = input.required<RowView>();

  /** Full translation key to display */
  readonly fullKey = computed(() => this.translation().fullKey);

  /**
   * How the header composes itself.
   *
   * `band` is the full-density tinted strip: key, tags, rollup and actions on
   * their own row above the content.
   *
   * `inline` is the compact single line. It drops the band background, the tags
   * and the separate comment button, and projects the row's content between the
   * key chip and the right-hand rail — so compact reuses this component's key,
   * rollup and menu rather than growing a second copy of them.
   */
  layout = input<'band' | 'inline'>('band');

  /** Whether comment is currently shown (compact mode) */
  showComment = input<boolean>(false);

  /** Hide the comment toggle button (used in full mode where comment is shown inline) */
  hideCommentButton = input<boolean>(false);

  /** Whether auto-translation is enabled for this collection */
  translationEnabled = input<boolean>(false);

  /** Emitted when user toggles comment display */
  commentToggle = output<void>();

  readonly TOKENS = TRACKER_TOKENS;

  /** Target locales that carry a status — the rollup's input. */
  readonly rollupLocales = computed(() => this.view().rollupLocales);

  /** Whether the active collection is read-only (mutating actions are disabled). */
  readonly isReadOnly = this.#browserStore.isReadOnly;

  /**
   * The leading glyph states what the row allows. A draggable row shows the grab
   * handle; a row in a read-only collection shows a lock in the same slot.
   *
   * The lock replaces the handle rather than joining it. Dragging is already
   * disabled here, so the handle is an affordance that lies, and a second icon
   * beside it would repeat the collection banner on every row.
   */
  readonly leadGlyph = computed(() => (this.isReadOnly() ? 'lock' : 'drag_indicator'));

  /** Accessible name and tooltip for the leading glyph, matching what it shows. */
  readonly leadGlyphLabel = computed(() =>
    this.isReadOnly()
      ? TRACKER_TOKENS.BROWSER.READONLYNOTICE
      : TRACKER_TOKENS.BROWSER.TRANSLATIONITEM.DRAGTOMOVEARIALABEL,
  );

  /** The primary action opens the editor; in read-only collections it is view-only, so label/icon adapt. */
  readonly editActionLabel = computed(() =>
    this.isReadOnly() ? TRACKER_TOKENS.COMMON.ACTIONS.VIEW : TRACKER_TOKENS.COMMON.ACTIONS.EDIT,
  );
  readonly editActionIcon = computed(() => (this.isReadOnly() ? 'visibility' : 'edit'));

  /**
   * Accessible name for the edit control. The descriptive "Edit translation" is
   * a lie in a read-only collection, where the control only opens a viewer, so
   * the label falls back to the action's own word there.
   */
  readonly editActionAriaLabel = computed(() =>
    this.isReadOnly() ? this.editActionLabel() : TRACKER_TOKENS.BROWSER.TRANSLATIONITEM.EDITARIALABEL,
  );

  /**
   * Whether the key has a leaf segment to hold back from the middle ellipsis.
   * A single-segment key is all head and renders as one span.
   */
  readonly hasKeyTail = computed(() => hasKeyLeaf(this.fullKey()));

  /** Comment text derived from the translation input */
  readonly comment = computed(() => this.translation().comment);

  /** Whether there is a comment worth offering a marker for. */
  readonly hasComment = computed(() => Boolean(this.comment()));

  /** Current search query from the browser store */
  readonly searchQuery = this.#browserStore.searchQuery;

  /** Tags derived from the translation input */
  readonly tags = computed(() => this.translation().tags);

  /** Tags inherited from the parent collection */
  readonly inheritedTags = computed(() => this.translation().inheritedTags);

  /** Whether this specific item is currently being auto-translated */
  readonly isTranslating = computed(() => this.#listStore.isTranslating(this.translation().fullKey));

  /** True when some target locale needs work, so the auto-translator has something to do. */
  readonly hasTranslatableLocales = computed(() => this.view().canTranslate);

  /** Whether the translate action is disabled */
  readonly translateDisabled = computed(
    () => this.isReadOnly() || !this.hasTranslatableLocales() || this.isTranslating(),
  );

  /** Computed signal for the comment icon name based on toggle state */
  readonly commentIcon = computed(() => {
    return this.showComment() ? 'chat_bubble' : 'comment';
  });

  /** Computed signal indicating if search query matches content in comment */
  readonly commentHasMatch = computed(() => {
    const query = this.searchQuery();
    const commentText = this.comment();

    if (!query || !commentText || !hasSearchLength(query)) {
      return false;
    }

    return commentText.toLowerCase().includes(query.toLowerCase());
  });

  onCopyKey(): void {
    this.#listStore.copyKey(this.translation());
  }

  /**
   * Single click on the key chip copies the key; the second click of a
   * double-click does not.
   *
   * The chip is almost the whole of a compact row's chrome, so it has to carry
   * both gestures. Of the two ways to keep them apart, deferring the copy behind
   * a ~250 ms timer was rejected twice over: it makes every copy — by far the
   * commoner gesture — feel late, and it moves `navigator.clipboard.writeText`
   * out of the click's user activation, which browsers may then refuse.
   *
   * So the copy stays synchronous and the count of clicks in the sequence is read
   * instead. `event.detail` is 1 for the first click, 2 for the second, and
   * higher for a triple click; anything past the first is the tail of a gesture
   * that has already copied, so it is ignored. A double-click therefore copies
   * exactly once and opens the editor. Enter and Space on the chip fire a click
   * with `detail === 0` and keep copying.
   */
  onKeyChipClick(event: MouseEvent): void {
    if (event.detail > 1) return;
    this.onCopyKey();
  }

  /**
   * Double-click on the key chip opens the editor.
   *
   * The item's own double-click handler deliberately ignores buttons, and in the
   * compact layout the row is little more than this button and the selectable
   * value — which leaves the gesture nowhere to land. The chip claims it here and
   * stops it bubbling, so the row handler cannot fire a second time.
   */
  onKeyChipDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.#listStore.editTranslation(this.translation());
  }

  onEdit(): void {
    this.#listStore.editTranslation(this.translation());
  }

  onDelete(): void {
    void this.#listStore.deleteTranslation(this.translation());
  }

  onTranslate(): void {
    this.#listStore.translateResource(this.translation());
  }

  onCommentClick(event: MouseEvent): void {
    event.stopPropagation();
    this.commentToggle.emit();
  }
}
