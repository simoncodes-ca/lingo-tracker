import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { SearchResultDto } from '@simoncodes-ca/data-transfer';

@Component({
  standalone: true,
  selector: 'app-similar-resources-warning',
  templateUrl: './similar-resources-warning.html',
  styleUrls: ['./similar-resources-warning.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule],
})
export class SimilarResourcesWarning {
  results = input.required<SearchResultDto[]>();
  isLoading = input<boolean>(false);

  readonly #isExpanded = signal(false);
  readonly #displayLimit = signal(3);

  readonly isExpanded = computed(() => this.#isExpanded());
  readonly hasResults = computed(() => this.results().length > 0);
  readonly totalCount = computed(() => this.results().length);
  readonly displayedResults = computed(() => {
    const limit = this.isExpanded() ? this.#displayLimit() : 3;
    return this.results().slice(0, limit);
  });
  readonly hasMoreResults = computed(
    () => this.results().length > this.#displayLimit(),
  );
  readonly showMoreButtonLabel = computed(() => {
    const remaining = this.results().length - this.#displayLimit();
    return `Show ${remaining} more`;
  });

  resourceClicked = output<SearchResultDto>();

  readonly Object = Object;

  toggleExpanded(): void {
    this.#isExpanded.update((expanded) => !expanded);
  }

  extractFolderPath(fullKey: string): string {
    const lastDotIndex = fullKey.lastIndexOf('.');
    return lastDotIndex > 0 ? fullKey.substring(0, lastDotIndex) : '';
  }

  loadMore(): void {
    this.#displayLimit.update((limit) => limit + 5);
  }

  onResourceClick(result: SearchResultDto): void {
    this.resourceClicked.emit(result);
  }
}
