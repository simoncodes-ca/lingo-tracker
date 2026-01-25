import {
  Component,
  ChangeDetectionStrategy,
  input,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Compact rollup badge showing status count with icon.
 * Used in compact density mode to show status at a glance.
 */
@Component({
  selector: 'app-translation-item-rollup-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    @if (rollupStatus()) {
      <div class="rollup" [attr.aria-describedby]="statusId()">
        <mat-icon>layers</mat-icon>
        <span class="rollup-count">{{ rollupStatus()![1] }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .rollup {
      align-items: center;
      color: var(--color-text-secondary);
      display: flex;
      gap: 4px;
    }

    .rollup-count {
      font-size: var(--font-size-xs);
    }
  `,
  host: {
    class: 'translation-item-rollup-badge',
  },
})
export class TranslationItemRollupBadge {
  /** Rollup status tuple: [status, count] */
  rollupStatus = input<readonly [string, number]>();

  /** ID for ARIA describedby */
  statusId = input<string>();
}
