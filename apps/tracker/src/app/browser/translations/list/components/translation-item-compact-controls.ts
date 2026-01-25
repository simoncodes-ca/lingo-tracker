import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconButton } from '@angular/material/button';
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
    TranslocoPipe,
  ],
  templateUrl: './translation-item-compact-controls.html',
  styleUrl: './translation-item-compact-controls.scss',
  host: {
    class: 'translation-item-compact-controls',
  },
})
export class TranslationItemCompactControls {
  /** Primary locale for status chip */
  primaryLocale = input.required<string>();

  /** Status for the primary locale */
  primaryLocaleStatus = input<string>();

  /** Rollup status tuple: [status, count] */
  rollupStatus = input<readonly [string, number]>();

  /** ID for ARIA describedby */
  statusId = input<string>();

  /** Whether translation has a comment */
  hasComment = input<boolean>(false);

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
