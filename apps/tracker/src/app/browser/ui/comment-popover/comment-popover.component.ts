import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Simple popover that displays a comment string inside a styled container.
 */
@Component({
  selector: 'app-comment-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './comment-popover.component.html',
  styleUrl: './comment-popover.component.scss',
  host: {
    class: 'comment-popover-host',
  },
})
export class CommentPopover {
  /** Comment text to display */
  comment = input<string>();
}
