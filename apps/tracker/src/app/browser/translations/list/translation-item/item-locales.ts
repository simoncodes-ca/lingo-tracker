import {
  Component,
  ChangeDetectionStrategy,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type LocaleTranslation = {
  locale: string;
  value: string;
  status?: string;
};

type DensityMode = 'compact' | 'medium' | 'full';

/**
 * Displays locale translations in a grid layout.
 * Supports different density modes with appropriate styling.
 */
@Component({
  selector: 'app-translation-item-locales',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  templateUrl: './item-locales.html',
  styleUrl: './item-locales.scss',
  host: {
    class: 'translation-item-locales',
  },
})
export class TranslationItemLocales {
  /** Array of locale translations to display */
  localeTranslations = input.required<LocaleTranslation[]>();

  /** Density mode affects styling */
  densityMode = input<DensityMode>('medium');

  /** Expansion state for full mode */
  isExpanded = input<boolean>(false);

  getStatusIcon(status: string | undefined): string {
    switch (status) {
      case 'verified':
        return 'check_circle';
      case 'translated':
        return 'language';
      case 'stale':
        return 'warning';
      case 'new':
        return 'add_circle';
      default:
        return 'help_outline';
    }
  }

  getStatusLabel(status: string | undefined): string {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'translated':
        return 'Translated';
      case 'stale':
        return 'Stale';
      case 'new':
        return 'New';
      default:
        return '';
    }
  }
}
