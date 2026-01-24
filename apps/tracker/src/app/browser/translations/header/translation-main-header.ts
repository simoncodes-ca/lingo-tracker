import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LocaleFilter, TranslationSearch } from '../../hierarchy';
import { BrowserStore } from '../../store/browser.store';

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
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslationSearch,
    LocaleFilter,
  ],
  templateUrl: './translation-main-header.html',
  styleUrl: './translation-main-header.scss',
})
export class TranslationMainHeader {
  readonly #store = inject(BrowserStore);

  readonly showNestedResources = this.#store.showNestedResources;

  toggleNested(): void {
    this.#store.toggleNestedResources();
  }
}
