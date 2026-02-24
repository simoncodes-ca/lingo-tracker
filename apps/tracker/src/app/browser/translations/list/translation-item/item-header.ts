import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconButton } from '@angular/material/button';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { TruncateKeyPipe } from '../../../../shared/pipes/truncate-key.pipe';
import { TagList } from '../../../../shared/tag-list/tag-list.component';
import { TranslationRollup, type LocaleState } from './translation-rollup';
import { HighlightPipe } from '../../../../shared/pipes/highlight.pipe';

/**
 * Header component for translation items displaying the key with copy button
 * and actions menu (edit, move, delete).
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
  /** Full translation key to display */
  fullKey = input.required<string>();

  /** Locale states for the rollup component */
  localeStates = input<LocaleState[]>([]);

  /** Base locale code */
  baseLocale = input<string>('en');

  /** Comment text for tooltip display */
  comment = input<string>();

  /** Whether comment is currently shown */
  showComment = input<boolean>(false);

  /** Search query to check for matches in comment */
  searchQuery = input<string>('');

  /** Tags to display in header (medium/full mode only) */
  tags = input<string[]>([]);

  /** Hide the comment toggle button (used in full mode where comment is shown inline) */
  hideCommentButton = input<boolean>(false);

  /** Emitted when user clicks copy key button */
  copyKey = output<string>();

  /** Emitted when user toggles comment display */
  commentToggle = output<void>();

  /** Emitted when user selects Edit from menu */
  editAction = output<void>();

  /** Emitted when user selects Move from menu */
  moveAction = output<void>();

  /** Emitted when user selects Delete from menu */
  deleteAction = output<void>();

  readonly TOKENS = TRACKER_TOKENS;

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
    this.copyKey.emit(this.fullKey());
  }

  onEdit(): void {
    this.editAction.emit();
  }

  onMove(): void {
    this.moveAction.emit();
  }

  onDelete(): void {
    this.deleteAction.emit();
  }

  onCommentClick(event: MouseEvent): void {
    event.stopPropagation();
    this.commentToggle.emit();
  }
}
