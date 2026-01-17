import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { TranslocoModule } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { FolderTree } from './folder-tree';
import { TranslationList } from './translation-list';
import { CollectionsStore } from '../collections/store/collections.store';

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
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    TranslocoModule,
    FolderTree,
    TranslationList,
  ],
  templateUrl: './translation-browser.html',
  styleUrl: './translation-browser.scss',
})
export class TranslationBrowser implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly collectionsStore = inject(CollectionsStore);

  readonly TOKENS = TRACKER_TOKENS;

  /**
   * The name of the collection being browsed.
   */
  readonly collectionName = signal<string>('');

  /**
   * The currently selected folder path.
   */
  readonly selectedFolderPath = signal<string>('');

  /**
   * Computed signal for active locales from collection config.
   */
  readonly activeLocales = computed(() => {
    const name = this.collectionName();
    if (!name) return [];

    const collections = this.collectionsStore.collectionEntriesWithLocales();
    const collection = collections.find((c) => c.name === name);
    return collection?.locales || [];
  });

  /**
   * Computed signal for base locale from collection config.
   */
  readonly baseLocale = computed(() => {
    const name = this.collectionName();
    if (!name) return 'en';

    const collections = this.collectionsStore.collectionEntriesWithLocales();
    const collection = collections.find((c) => c.name === name);
    return collection?.baseLocale || 'en';
  });

  ngOnInit(): void {
    // Load collections to get locale info
    this.collectionsStore.loadCollections();

    // Read collection name from route params
    const name = this.route.snapshot.paramMap.get('collectionName');
    if (name) {
      this.collectionName.set(decodeURIComponent(name));
    }
  }

  /**
   * Navigates back to the collections manager.
   */
  navigateToCollections(): void {
    this.router.navigate(['/collections']);
  }

  /**
   * Handles folder selection from the tree.
   */
  onFolderSelected(folderPath: string): void {
    this.selectedFolderPath.set(folderPath);
  }
}
