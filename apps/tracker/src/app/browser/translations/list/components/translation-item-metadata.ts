import {
  Component,
  ChangeDetectionStrategy,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconButton } from '@angular/material/button';
import { TagList } from '../../../../shared/tag-list/tag-list.component';
import { CommentPopover } from '../../../shared/comment-popover/comment-popover.component';
import { TagListPopover } from '../../../shared/tag-list-popover/tag-list-popover.component';

type DensityMode = 'compact' | 'medium' | 'full';

/**
 * Displays metadata (tags and comments) for a translation item.
 * Adapts display based on density mode:
 * - medium: shows preview tags with popover for overflow
 * - full: shows all tags and comment inline
 */
@Component({
  selector: 'app-translation-item-metadata',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatIconButton,
    TagList,
    CommentPopover,
    TagListPopover,
  ],
  templateUrl: './translation-item-metadata.html',
  styleUrl: './translation-item-metadata.scss',
  host: {
    class: 'translation-item-metadata',
  },
})
export class TranslationItemMetadata {
  /** All tags for this translation */
  tags = input<string[]>([]);

  /** Comment text */
  comment = input<string>();

  /** Current density mode */
  densityMode = input<DensityMode>('medium');

  /** First 3 tags for preview in medium mode */
  readonly previewTags = input<string[]>([]);

  /** Whether there are more tags than shown in preview */
  get hasMoreTags(): boolean {
    return (this.tags()?.length ?? 0) > 3;
  }

  /** Count of additional tags beyond preview */
  get additionalTagCount(): number {
    return (this.tags()?.length ?? 0) - 3;
  }
}
