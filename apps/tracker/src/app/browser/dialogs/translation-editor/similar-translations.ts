import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { SearchResultDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

type ComponentState = 'idle' | 'loading' | 'empty' | 'results';

@Component({
  standalone: true,
  selector: 'app-similar-translations',
  templateUrl: './similar-translations.html',
  styleUrls: ['./similar-translations.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslocoPipe, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
})
export class SimilarTranslations {
  readonly TOKENS = TRACKER_TOKENS;

  // Inputs
  results = input.required<SearchResultDto[]>();
  isLoading = input<boolean>(false);
  hasSearchQuery = input<boolean>(false);
  baseLocale = input.required<string>();

  // Internal state
  readonly #displayLimit = signal(3);

  // Computed state
  readonly state = computed<ComponentState>(() => {
    if (this.isLoading()) return 'loading';
    if (!this.hasSearchQuery()) return 'idle';
    if (this.results().length === 0) return 'empty';
    return 'results';
  });

  readonly displayedResults = computed(() => this.results().slice(0, this.#displayLimit()));

  readonly hasMore = computed(() => this.results().length > this.#displayLimit());

  readonly remainingCount = computed(() => Math.max(0, this.results().length - this.#displayLimit()));

  // Output
  resourceClicked = output<SearchResultDto>();

  // Methods
  showMore(): void {
    this.#displayLimit.update((limit) => limit + 5);
  }

  onResultClick(result: SearchResultDto): void {
    this.resourceClicked.emit(result);
  }

  getTranslationValue(result: SearchResultDto): string {
    const locale = this.baseLocale();
    return result.translations[locale] || Object.values(result.translations)[0] || '';
  }
}
