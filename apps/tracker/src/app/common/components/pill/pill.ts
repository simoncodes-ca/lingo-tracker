import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type PillType = 'info' | 'success' | 'warning' | 'error';

@Component({
  selector: 'pill',
  imports: [CommonModule],
  template: '<span class="pill-text">{{ text() }}</span>',
  styleUrls: ['./pill.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'class': 'pill',
    '[attr.data-variant]': 'type()'
  }
})
export class PillComponent {
  text = input<string>('');
  type = input<PillType>('info');
}


