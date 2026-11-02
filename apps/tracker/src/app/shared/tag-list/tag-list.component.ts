import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';

/**
 * Displays a horizontal list of tags as styled badges/chips.
 * Used for displaying locales, translation tags, and other categorizations.
 */
@Component({
  selector: 'app-tag-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatTooltipModule, TranslocoPipe],
  templateUrl: './tag-list.component.html',
  styleUrl: './tag-list.component.scss',
  host: {
    class: 'tag-list',
  },
})
export class TagList {
  readonly TOKENS = TRACKER_TOKENS;

  /** Array of explicit (per-resource) tag strings to display */
  tags = input.required<readonly string[]>();

  /** Tags inherited from the parent collection; shown with a distinct style and tooltip */
  inheritedTags = input<readonly string[]>([]);
}
