import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  effect,
  signal,
  viewChild,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { TranslocoModule } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { HeaderContextService } from '../shared/services/header-context.service';
import { FolderTree } from './sidebar';
import { TranslationMainHeader } from './translations/header/translation-main-header';
import { CollectionsStore } from '../collections/store/collections.store';
import { BrowserStore } from './store/browser.store';
import { TranslationList } from './translations/list/translation-list';
import { IndexingOverlay } from './ui/indexing-overlay';
import type { DragData } from './types/drag-data';

/**
 * Translation Browser component for viewing and managing translations within a collection.
 *
 * Features:
 * - Display all translation keys in the collection
 * - Filter and search translations
 * - Edit translation values
 * - View translation metadata and status
 * - Add new translation keys
 */
@Component({
  selector: 'app-translation-browser',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.control.shift.n)': 'onCreateFolderShortcut($event)',
    '(window:keydown.meta.shift.n)': 'onCreateFolderShortcut($event)',
  },
  imports: [
    CommonModule,
    CdkDropListGroup,
    TranslocoModule,
    FolderTree,
    TranslationList,
    TranslationMainHeader,
    IndexingOverlay,
  ],
  templateUrl: './translation-browser.html',
  styleUrl: './translation-browser.scss',
})
export class TranslationBrowser {
  readonly #route = inject(ActivatedRoute);
  readonly #collectionsStore = inject(CollectionsStore);
  readonly store = inject(BrowserStore);
  readonly #headerContext = inject(HeaderContextService);
  readonly #destroyRef = inject(DestroyRef);

  readonly TOKENS = TRACKER_TOKENS;

  /** Reference to the folder tree component */
  readonly folderTreeRef = viewChild(FolderTree);

  /** Signal tracking the currently dragged item */
  readonly activeDragData = signal<DragData | null>(null);

  /**
   * Computed signal for collection name from the unified store.
   */
  readonly collectionName = computed(() => this.store.selectedCollection() || '');

  /**
   * Computed signal for active locales from the unified store.
   */
  readonly activeLocales = computed(() => this.store.availableLocales());

  /**
   * Computed signal for base locale from collection config.
   */
  readonly baseLocale = computed(() => {
    const name = this.collectionName();
    if (!name) return 'en';

    const collections = this.#collectionsStore.collectionEntriesWithLocales();
    const collection = collections.find((c) => c.name === name);
    return collection?.baseLocale || 'en';
  });

  /**
   * Computed signal for translations folder path from collection config.
   */
  readonly translationsFolder = computed(() => {
    const name = this.collectionName();
    if (!name) return '';

    const collections = this.#collectionsStore.collectionEntriesWithLocales();
    const collection = collections.find((c) => c.name === name);
    return collection?.config.translationsFolder || '';
  });

  /**
   * Computed signal that reflects whether auto-translation is enabled for the current collection.
   * Collection-level config takes precedence over global config.
   */
  readonly translationEnabled = computed(() => {
    const name = this.collectionName();
    if (!name) return false;

    const globalConfig = this.#collectionsStore.config();
    const collections = this.#collectionsStore.collectionEntriesWithLocales();
    const collection = collections.find((c) => c.name === name);

    const translationConfig = collection?.config.translation ?? globalConfig?.translation;
    return translationConfig?.enabled === true;
  });

  constructor() {
    // Wait for collections to load before initializing browser store
    effect(() => {
      const config = this.#collectionsStore.config();
      if (!config) return;

      // Read collection name from route params
      const name = this.#route.snapshot.paramMap.get('collectionName');
      if (!name) return;

      const decodedName = decodeURIComponent(name);
      const collection = config.collections?.[decodedName];

      // Only initialize if we haven't already
      if (this.store.selectedCollection() === decodedName) return;

      const locales = collection?.locales || config.locales || [];
      const baseLocale = collection?.baseLocale || config.baseLocale || '';

      // Initialize unified store with collection
      this.store.setSelectedCollection({
        collectionName: decodedName,
        locales,
        baseLocale,
      });
    });

    // Sync collection context to header
    effect(() => {
      const name = this.collectionName();
      if (!name) return;

      this.#headerContext.setCollectionContext({
        collectionName: name,
        translationsFolder: this.translationsFolder(),
        totalKeys: this.store.collectionTotalKeys(),
        localeCount: this.store.collectionLocaleCount(),
        statsLoading: this.store.isCacheIndexing(),
      });
    });

    this.#destroyRef.onDestroy(() => {
      this.#headerContext.clearCollectionContext();
    });
  }

  /**
   * Handles Ctrl+Shift+N keyboard shortcut to create a new folder.
   * Creates a folder in the currently selected folder path.
   * Prevents action when an input element is focused.
   */
  onCreateFolderShortcut(event: Event): void {
    // Don't trigger if user is typing in an input field
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      return;
    }

    event.preventDefault();
    const currentFolderPath = this.store.currentFolderPath();
    this.store.startAddingFolder(currentFolderPath || null);
  }

  /**
   * Handles drag started events from folder tree or translation list.
   * Sets the active drag data for tracking.
   */
  onDragStarted(dragData: DragData): void {
    this.activeDragData.set(dragData);
  }

  /**
   * Handles drag ended events from folder tree or translation list.
   * Clears the active drag data.
   */
  onDragEnded(): void {
    this.activeDragData.set(null);
  }
}
