import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BrowserStore } from '../../store/browser.store';
import {TranslocoPipe} from "@jsverse/transloco";
import {TRACKER_TOKENS} from "../../../../i18n-types/tracker-resources";

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
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
      TranslocoPipe,
  ],
  templateUrl: './translation-search.html',
  styleUrl: './translation-search.scss',
})
export class TranslationSearch implements OnInit, OnDestroy {
  readonly store = inject(BrowserStore);
  readonly TOKENS = TRACKER_TOKENS;

  readonly searchControl = new FormControl<string>('', { nonNullable: true });

  #subscription = new Subscription();

  ngOnInit(): void {
    // Subscribe to search control changes with debouncing
    this.#subscription.add(
      this.searchControl.valueChanges
        .pipe(
          debounceTime(300), // Wait 300ms after user stops typing
          distinctUntilChanged() // Only emit if value actually changed
        )
        .subscribe((query) => {
          // Update store state
          this.store.setSearchQuery(query);

          // Trigger search if query is not empty
          if (query.trim().length > 0) {
            this.store.searchTranslations(query);
          }
        })
    );
  }

  ngOnDestroy(): void {
    this.#subscription.unsubscribe();
  }

  /**
   * Clears the search input and returns to browse mode.
   */
  onClearSearch(): void {
    this.searchControl.setValue('');
    this.store.clearSearch();
  }
}
