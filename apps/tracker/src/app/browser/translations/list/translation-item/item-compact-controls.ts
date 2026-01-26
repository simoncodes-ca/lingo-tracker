import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconButton } from '@angular/material/button';
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';

/**
 * Controls displayed on the right side of compact density mode items.
 * Shows status chip, rollup badge, metadata indicators, and actions menu.
 */
@Component({
  selector: 'app-translation-item-compact-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatMenuModule,
    MatIconButton,
    MatTooltipModule,
    TranslocoPipe,
  ],
  templateUrl: './item-compact-controls.html',
  styleUrl: './item-compact-controls.scss',
  host: {
    class: 'translation-item-compact-controls',
  },
})
export class TranslationItemCompactControls {
  /** Selected locale to display in status chip */
  primaryLocale = input.required<string>();

  /** Translation status for the selected locale */
  primaryLocaleStatus = input<string>();

  /** Rollup status tuple: [status, count] */
  rollupStatus = input<readonly [string, number]>();

  /** ID for ARIA describedby */
  statusId = input<string>();

  /** Comment text content */
  comment = input<string | undefined>();

  /** Whether translation has tags */
  hasTags = input<boolean>(false);

  /** Number of tags */
  tagCount = input<number>(0);

  /** Emitted when user selects Edit from menu */
  editAction = output<void>();

  /** Emitted when user selects Move from menu */
  moveAction = output<void>();

  /** Emitted when user selects Delete from menu */
  deleteAction = output<void>();

  readonly TOKENS = TRACKER_TOKENS;

  private readonly elementRef = inject(ElementRef);

  /** Reference to the comment tooltip for manual show/hide control */
  readonly commentTooltip = viewChild<MatTooltip>('commentTooltip');

  /** Controls whether the comment tooltip is manually shown (via click) */
  readonly isCommentTooltipPinned = signal(false);

  /** Computed signal that determines if comment button should be disabled */
  readonly commentDisabled = computed(() => {
    const commentValue = this.comment();
    return !commentValue || commentValue.trim().length === 0;
  });

  constructor() {
    // Listen for clicks outside the component to close pinned tooltip
    effect(() => {
      if (!this.isCommentTooltipPinned()) return;

      const clickListener = (event: MouseEvent) => {
        const nativeElement = this.elementRef.nativeElement as HTMLElement;
        if (!nativeElement.contains(event.target as Node)) {
          this.isCommentTooltipPinned.set(false);
          this.commentTooltip()?.hide();
        }
      };

      document.addEventListener('click', clickListener);

      return () => {
        document.removeEventListener('click', clickListener);
      };
    });
  }

  onCommentClick(event: MouseEvent): void {
    event.stopPropagation();

    const tooltip = this.commentTooltip();
    if (!tooltip) return;

    if (this.isCommentTooltipPinned()) {
      this.isCommentTooltipPinned.set(false);
      tooltip.hide();
    } else {
      this.isCommentTooltipPinned.set(true);
      tooltip.show();
    }
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
}
