import { Component, ChangeDetectionStrategy, input, output, signal, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
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
    '[class.compact]': 'isCompactMode()',
  },
})
export class TranslationItemHeader {
  /** Full translation key to display */
  fullKey = input.required<string>();

  /** Locale states for the rollup component */
  localeStates = input<LocaleState[]>([]);

  /** Base locale code */
  baseLocale = input<string>('en');

  /** Compact mode flag */
  isCompactMode = input<boolean>(false);

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

  private readonly snackBar = inject(MatSnackBar);

  /** Tracks whether copy feedback is currently showing (check icon) */
  readonly showCopySuccess = signal(false);

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

  private copySuccessTimeoutId: number | undefined;

  onCopyKey(): void {
    const key = this.fullKey();

    // For non-compact mode, emit to parent (existing behavior)
    if (!this.isCompactMode()) {
      this.copyKey.emit(key);
      return;
    }

    // Compact mode: handle clipboard and feedback directly
    if (!navigator.clipboard?.writeText) {
      this.snackBar.open('Failed to copy', '', {
        duration: 2000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });
      return;
    }

    navigator.clipboard
      .writeText(key)
      .then(() => {
        // Show success feedback
        this.showCopySuccess.set(true);

        // Show snackbar
        this.snackBar.open('Copied to clipboard', '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });

        // Clear any existing timeout
        if (this.copySuccessTimeoutId !== undefined) {
          window.clearTimeout(this.copySuccessTimeoutId);
        }

        // Revert icon after 1.5 seconds
        this.copySuccessTimeoutId = window.setTimeout(() => {
          this.showCopySuccess.set(false);
          this.copySuccessTimeoutId = undefined;
        }, 1500);
      })
      .catch(() => {
        this.snackBar.open('Failed to copy', '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      });
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
