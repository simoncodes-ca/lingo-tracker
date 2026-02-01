import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TagList } from '../../../shared/tag-list/tag-list.component';

@Component({
  selector: 'app-tag-list-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TagList],
  templateUrl: './tag-list-popover.component.html',
  styleUrl: './tag-list-popover.component.scss',
  host: { class: 'tag-list-popover-host' },
})
export class TagListPopover {
  tags = input<string[]>([]);
}
