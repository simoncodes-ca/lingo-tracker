import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { resolveCollectionSettings } from '../collections/store/collection-settings';
import { CollectionsStore } from '../collections/store/collections.store';
import { HeaderContextService } from '../shared/services/header-context.service';
import { FolderTree } from './sidebar';
import { BrowserStore } from './store/browser.store';
import { TranslationMainHeader } from './translations/header/translation-main-header';
import { TranslationList } from './translations/list/translation-list';
import type { DragData } from './types/drag-data';
import { IndexingOverlay } from './ui/indexing-overlay';

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
    MatIconModule,
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

  readonly translationsFolder = computed(() => this.store.collectionSettings()?.translationsFolder ?? '');

  /** Whether auto-translation is enabled for the open collection. */
  readonly translationEnabled = computed(() => this.store.collectionSettings()?.translationEnabled ?? false);

  constructor() {
    // Once the config has loaded, open the routed collection; on every later config change,
    // bring its settings up to date. Tracks the config only: the store is written, not read.
    effect(() => {
      const config = this.#collectionsStore.config();
      if (!config) return;

      const name = this.#route.snapshot.paramMap.get('collectionName');
      if (!name) return;

      const settings = resolveCollectionSettings(config, name);

      untracked(() => {
        // Re-entering the open collection keeps the user's place (folder, search); only its
        // settings are refreshed, and equal settings are a no-op.
        if (this.store.selectedCollection() === settings.name) this.store.updateSettings(settings);
        else this.store.openCollection(settings);
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
    if (this.store.effectiveDisabled()) return;
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
