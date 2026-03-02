import { Injectable, signal, computed } from '@angular/core';

export interface CollectionStats {
  totalKeys: number | null;
  localeCount: number | null;
  statsLoading: boolean;
}

export interface CollectionContext extends CollectionStats {
  collectionName: string;
  translationsFolder: string;
}

@Injectable({
  providedIn: 'root',
})
export class HeaderContextService {
  readonly #collectionName = signal<string | null>(null);
  readonly #translationsFolder = signal<string | null>(null);
  readonly #totalKeys = signal<number | null>(null);
  readonly #localeCount = signal<number | null>(null);
  readonly #statsLoading = signal<boolean>(false);

  readonly collectionName = this.#collectionName.asReadonly();
  readonly translationsFolder = this.#translationsFolder.asReadonly();
  readonly totalKeys = this.#totalKeys.asReadonly();
  readonly localeCount = this.#localeCount.asReadonly();
  readonly statsLoading = this.#statsLoading.asReadonly();
  readonly hasCollectionContext = computed(() => this.#collectionName() !== null);

  setCollectionContext(context: CollectionContext): void {
    this.#collectionName.set(context.collectionName);
    this.#translationsFolder.set(context.translationsFolder);
    this.#totalKeys.set(context.totalKeys);
    this.#localeCount.set(context.localeCount);
    this.#statsLoading.set(context.statsLoading);
  }

  updateStats(stats: CollectionStats): void {
    this.#totalKeys.set(stats.totalKeys);
    this.#localeCount.set(stats.localeCount);
    this.#statsLoading.set(stats.statsLoading);
  }

  clearCollectionContext(): void {
    this.#collectionName.set(null);
    this.#translationsFolder.set(null);
    this.#totalKeys.set(null);
    this.#localeCount.set(null);
    this.#statsLoading.set(false);
  }
}
