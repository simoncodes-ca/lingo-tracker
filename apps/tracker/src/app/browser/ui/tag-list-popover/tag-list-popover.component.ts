import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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
