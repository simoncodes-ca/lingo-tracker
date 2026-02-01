import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Displays a horizontal list of tags as styled badges/chips.
 * Used for displaying locales, translation tags, and other categorizations.
 */
@Component({
  selector: 'app-tag-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './tag-list.component.html',
  styleUrl: './tag-list.component.scss',
  host: {
    class: 'tag-list',
  },
})
export class TagList {
  /** Array of tag strings to display */
  tags = input.required<string[]>();
}
