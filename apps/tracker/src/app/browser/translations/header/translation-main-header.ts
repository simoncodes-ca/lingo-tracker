import {
  Component,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocaleFilter, TranslationSearch } from '../../hierarchy';

/**
 * TranslationMainHeader component provides search and filtering controls
 * for the translation list.
 *
 * This is a sticky header that remains visible when scrolling through
 * the translation list. It combines the search input and locale filter
 * in a horizontal layout.
 *
 * @example
 * <app-header />
 */
@Component({
  selector: 'app-translation-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslationSearch,
    LocaleFilter,
  ],
  templateUrl: './translation-main-header.html',
  styleUrl: './translation-main-header.scss',
})
export class TranslationMainHeader {}
