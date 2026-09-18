import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { SearchResultDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

type ComponentState = 'idle' | 'loading' | 'empty' | 'results';

/**
 * A row ready to paint: the key already split so it can only break after a dot,
 * exactly like the Full key line in the editor's context column.
 */
interface SimilarRow {
  readonly result: SearchResultDto;
  /** Every segment but the last — each one is followed by a dot and a break opportunity. */
  readonly parentSegments: readonly string[];
  /** The final segment, which never carries a trailing dot. */
  readonly leafSegment: string;
  readonly value: string;
  readonly isExact: boolean;
}

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
  /**
   * The key of the hit whose base value is the typed value verbatim, if any.
   * That row is not just similar — it is the same string already spoken for.
   */
  exactKey = input<string>('');
  /**
   * `card` is the standalone card with its own header and idle/empty copy.
   * `context` is the quiet list inside the editor's context column, where the
   * block heading and caption already belong to the column.
   */
  variant = input<'card' | 'context'>('card');

  // Internal state
  readonly #displayLimit = signal(3);

  // Computed state
  readonly state = computed<ComponentState>(() => {
    if (this.isLoading()) return 'loading';
    if (!this.hasSearchQuery()) return 'idle';
    if (this.results().length === 0) return 'empty';
    return 'results';
  });

  readonly isContextVariant = computed(() => this.variant() === 'context');

  readonly displayedResults = computed(() => this.results().slice(0, this.#displayLimit()));

  readonly displayedRows = computed<SimilarRow[]>(() =>
    this.displayedResults().map((result) => {
      const segments = result.key.split('.').filter((segment) => segment.length > 0);
      const leafSegment = segments.length > 0 ? segments[segments.length - 1] : result.key;

      return {
        result,
        parentSegments: segments.slice(0, -1),
        leafSegment,
        value: this.getTranslationValue(result),
        isExact: this.isExactMatch(result),
      };
    }),
  );

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

  isExactMatch(result: SearchResultDto): boolean {
    return this.exactKey() !== '' && result.key === this.exactKey();
  }

  getTranslationValue(result: SearchResultDto): string {
    const locale = this.baseLocale();
    return result.translations[locale] || Object.values(result.translations)[0] || '';
  }
}
