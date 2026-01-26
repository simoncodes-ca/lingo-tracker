import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  inject,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
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

  private readonly snackBar = inject(MatSnackBar);

  /** Tracks whether copy feedback is currently showing (check icon) */
  readonly showCopySuccess = signal(false);

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
}
