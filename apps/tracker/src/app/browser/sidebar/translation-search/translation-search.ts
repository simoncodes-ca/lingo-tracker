import { Component, ChangeDetectionStrategy, inject, OnDestroy, signal } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BrowserStore } from '../../store/browser.store';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { SearchInput } from '../../../shared/components/search-input';

/**
 * TranslationSearch component provides a search input with debouncing
 * for server-side translation search.
 *
 * Features:
 * - 300ms debounce to reduce API calls
 * - Clear button appears when text is entered
 * - Search mode disables folder tree navigation
 * - Clearing search returns to folder browse mode
 * - Loading indicator during search
 *
 * @example
 * <app-translation-search />
 */
@Component({
  selector: 'app-translation-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SearchInput, TranslocoPipe],
  templateUrl: './translation-search.html',
  styleUrl: './translation-search.scss',
})
export class TranslationSearch implements OnDestroy {
  readonly store = inject(BrowserStore);
  readonly TOKENS = TRACKER_TOKENS;

  searchValue = signal('');

  #searchSubject = new Subject<string>();
  #subscription = new Subscription();

  constructor() {
    // Set up debounced search subscription
    this.#subscription.add(
      this.#searchSubject
        .pipe(
          debounceTime(300), // Wait 300ms after user stops typing
          distinctUntilChanged(), // Only emit if value actually changed
        )
        .subscribe((query) => {
          // Only trigger search if query has at least 3 characters
          if (query.trim().length >= 3) {
            this.store.setSearchQuery(query);
            this.store.searchTranslations(query);
          } else if (query.trim().length === 0) {
            // Clear search when input is empty
            this.store.clearSearch();
          }
        }),
    );
  }

  ngOnDestroy(): void {
    this.#subscription.unsubscribe();
  }

  /**
   * Handles search value changes from the input component.
   * Emits to subject for debounced processing.
   */
  onSearchChange(searchQueryValue: string): void {
    this.searchValue.set(searchQueryValue);
    this.#searchSubject.next(searchQueryValue);
  }

  /**
   * Clears the search input and returns to browse mode.
   */
  onClearSearch(): void {
    this.searchValue.set('');
    this.store.clearSearch();
  }
}
