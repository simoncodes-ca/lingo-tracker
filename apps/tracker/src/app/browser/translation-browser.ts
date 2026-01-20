import { Component, ChangeDetectionStrategy, OnInit, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { TranslocoModule } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { FolderSidebarHeader, FolderTree } from './hierarchy';
import { TranslationMainHeader } from './translations/header/translation-main-header';
import { CollectionsStore } from '../collections/store/collections.store';
import { BrowserStore } from './store/browser.store';
import {TranslationList} from "./translations/list/translation-list";

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
    FolderSidebarHeader,
    TranslationMainHeader,
  ],
  templateUrl: './translation-browser.html',
  styleUrl: './translation-browser.scss',
})
export class TranslationBrowser implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly collectionsStore = inject(CollectionsStore);
  readonly store = inject(BrowserStore);

  readonly TOKENS = TRACKER_TOKENS;

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

    const collections = this.collectionsStore.collectionEntriesWithLocales();
    const collection = collections.find((c) => c.name === name);
    return collection?.baseLocale || 'en';
  });

  /**
   * Computed signal for translations folder path from collection config.
   */
  readonly translationsFolder = computed(() => {
    const name = this.collectionName();
    if (!name) return '';

    const collections = this.collectionsStore.collectionEntriesWithLocales();
    const collection = collections.find((c) => c.name === name);
    return collection?.config.translationsFolder || '';
  });

  constructor() {
    // Wait for collections to load before initializing browser store
    effect(() => {
      const config = this.collectionsStore.config();
      if (!config) return;

      // Read collection name from route params
      const name = this.route.snapshot.paramMap.get('collectionName');
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
      });

      // Set base locale for filtering
      this.store.setBaseLocale(baseLocale);
    });
  }

  ngOnInit(): void {
    // Collections are now loaded in App component
    // Effect in constructor will initialize browser store when config is available
  }

  /**
   * Navigates back to the collections manager.
   */
  navigateToCollections(): void {
    this.router.navigate(['/collections']);
  }
}
