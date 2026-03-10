import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

/**
 * Overlay component displayed during collection cache indexing.
 *
 * Shows loading spinner while backend builds the resource tree cache,
 * or displays error messages with retry option when indexing fails.
 *
 * Component is hidden when cache status is 'ready' or null.
 */
@Component({
  selector: 'app-indexing-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatProgressSpinnerModule, MatCardModule, MatButtonModule, TranslocoPipe],
  templateUrl: './indexing-overlay.component.html',
  styleUrl: './indexing-overlay.component.scss',
})
export class IndexingOverlay {
  readonly TOKENS = TRACKER_TOKENS;
  /** Cache status determines which UI to display */
  cacheStatus = input<'not-started' | 'indexing' | 'ready' | 'error' | null>(null);

  /** Error message to display when status is 'error' */
  errorMessage = input<string | null>(null);

  /** Emitted when user clicks retry button after error */
  retry = output<void>();

  /**
   * Handles retry button click and emits retry event.
   */
  onRetryClick(): void {
    this.retry.emit();
  }
}
