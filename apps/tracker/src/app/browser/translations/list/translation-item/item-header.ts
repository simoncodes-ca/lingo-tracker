import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconButton } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';

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
    TranslocoPipe,
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

  /** Rollup status badge data: [status, count] */
  rollupStatus = input<readonly [string, number]>();

  /** Tooltip text for status breakdown */
  statusBreakdown = input<string>();

  /** ID for ARIA describedby */
  statusId = input<string>();

  /** Compact mode flag */
  isCompactMode = input<boolean>(false);

  /** Emitted when user clicks copy key button */
  copyKey = output<string>();

  /** Emitted when user selects Edit from menu */
  editAction = output<void>();

  /** Emitted when user selects Move from menu */
  moveAction = output<void>();

  /** Emitted when user selects Delete from menu */
  deleteAction = output<void>();

  readonly TOKENS = TRACKER_TOKENS;

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
}
