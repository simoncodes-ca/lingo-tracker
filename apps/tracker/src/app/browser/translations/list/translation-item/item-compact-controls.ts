import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  effect,
  inject,
  viewChild,
  ElementRef,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconButton } from '@angular/material/button';
import { type MatTooltip, MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { TranslationRollup, type LocaleState } from './translation-rollup';

/**
 * Controls displayed on the right side of compact density mode items.
 * Shows status chip, rollup badge, metadata indicators, and actions menu.
 */
@Component({
  selector: 'app-translation-item-compact-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatMenuModule, MatIconButton, MatTooltipModule, TranslocoPipe, TranslationRollup],
  templateUrl: './item-compact-controls.html',
  styleUrl: './item-compact-controls.scss',
  host: {
    class: 'translation-item-compact-controls',
  },
})
export class TranslationItemCompactControls {
  /** Locale states for the rollup component */
  localeStates = input<LocaleState[]>([]);

  /** Base locale code */
  baseLocale = input<string>('en');

  /** Comment text content */
  comment = input<string | undefined>();

  /** Whether comment is currently shown */
  showComment = input<boolean>(false);

  /** Tags array */
  tags = input<string[]>([]);

  /** Emitted when user toggles comment display */
  commentToggle = output<void>();

  /** Emitted when user selects Edit from menu */
  editAction = output<void>();

  /** Emitted when user selects Move from menu */
  moveAction = output<void>();

  /** Emitted when user selects Delete from menu */
  deleteAction = output<void>();

  readonly TOKENS = TRACKER_TOKENS;

  private readonly elementRef = inject(ElementRef);

  /** Reference to the tags tooltip for manual show/hide control */
  readonly tagsTooltip = viewChild<MatTooltip>('tagsTooltip');

  /** Controls whether the tags tooltip is manually shown (via click) */
  readonly isTagsTooltipPinned = signal(false);

  constructor() {
    // Listen for clicks outside the component to close pinned tooltip
    effect(() => {
      if (!this.isTagsTooltipPinned()) return;

      const clickListener = (event: MouseEvent) => {
        const nativeElement = this.elementRef.nativeElement as HTMLElement;
        if (!nativeElement.contains(event.target as Node)) {
          this.isTagsTooltipPinned.set(false);
          this.tagsTooltip()?.hide();
        }
      };

      document.addEventListener('click', clickListener);

      return () => {
        document.removeEventListener('click', clickListener);
      };
    });
  }

  /** Computed signal that determines if comment button should be disabled */
  readonly commentDisabled = computed(() => {
    const commentValue = this.comment();
    return !commentValue || commentValue.trim().length === 0;
  });

  /** Computed signal for the comment icon name based on toggle state */
  readonly commentIcon = computed(() => {
    return this.showComment() ? 'chat_bubble' : 'comment';
  });

  /** Computed signal that determines if tags button should be disabled */
  readonly tagsDisabled = computed(() => {
    const tagsValue = this.tags();
    return !tagsValue || tagsValue.length === 0;
  });

  /** Computed signal for tags tooltip content with brackets around each tag */
  readonly tagsTooltipText = computed(() => {
    const tagsValue = this.tags();
    if (!tagsValue || tagsValue.length === 0) return '';
    return tagsValue.map((tag) => `[${tag}]`).join(', ');
  });

  onTagsClick(event: MouseEvent): void {
    event.stopPropagation();

    const tooltip = this.tagsTooltip();
    if (!tooltip) return;

    if (this.isTagsTooltipPinned()) {
      this.isTagsTooltipPinned.set(false);
      tooltip.hide();
    } else {
      this.isTagsTooltipPinned.set(true);
      tooltip.show();
    }
  }

  onCommentClick(event: MouseEvent): void {
    event.stopPropagation();
    this.commentToggle.emit();
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
