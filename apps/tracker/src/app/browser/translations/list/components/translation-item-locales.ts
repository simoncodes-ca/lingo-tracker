import {
  Component,
  ChangeDetectionStrategy,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';

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
  imports: [CommonModule],
  templateUrl: './translation-item-locales.html',
  styleUrl: './translation-item-locales.scss',
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
}
