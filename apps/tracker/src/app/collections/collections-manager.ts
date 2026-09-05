import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { CollectionsStore } from './store/collections.store';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { NotificationService } from '../shared/notification';

/**
 * Total locale chips a card shows, overflow chip included. Capped so every card keeps a
 * single chip row and rows of cards stay flush with each other.
 */
const MAX_LOCALE_CHIPS = 4;

/** Below this many collections the name filter is more clutter than help. */
const FILTER_THRESHOLD = 6;

/** A collection prepared for display: chips resolved, overflow already split off. */
export interface CollectionCardView {
  readonly name: string;
  readonly translationsFolder: string;
  readonly readOnly: boolean;
  readonly baseLocale: string | undefined;
  readonly visibleLocales: readonly string[];
  readonly overflowLocales: readonly string[];
}

/**
 * Collections Manager component for viewing and managing translation collections.
 *
 * Features:
 * - Displays all collections in a responsive grid, sorted by name
 * - Filters by name or translations folder once the list grows past a handful
 * - Create, edit, and delete collections
 * - Navigate to translation browser for each collection
 * - Loading, empty, and no-matches states
 * - Success/error notifications via snackbar
 */
@Component({
  selector: 'app-collections-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './collections-manager.html',
  styleUrl: './collections-manager.scss',
  host: { role: 'main' },
})
export class CollectionsManager {
  readonly store = inject(CollectionsStore);
  readonly #dialog = inject(MatDialog);
  readonly #notifications = inject(NotificationService);
  readonly #router = inject(Router);
  readonly #transloco = inject(TranslocoService);

  readonly TOKENS = TRACKER_TOKENS;

  /** Current text typed into the name/folder filter. */
  readonly filter = signal('');

  /** Collections sorted by name and prepared for the card template. */
  readonly cards = computed<readonly CollectionCardView[]>(() => {
    const query = this.filter().trim().toLowerCase();

    return this.store
      .collectionEntriesWithLocales()
      .filter(
        (item) =>
          query.length === 0 ||
          item.name.toLowerCase().includes(query) ||
          item.config.translationsFolder.toLowerCase().includes(query),
      )
      .map((item) => this.#toCardView(item))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  });

  readonly showFilter = computed(() => this.store.collectionEntriesWithLocales().length > FILTER_THRESHOLD);
  readonly isFiltering = computed(() => this.filter().trim().length > 0);
  readonly hasNoMatches = computed(() => this.store.hasCollections() && this.cards().length === 0);

  /**
   * Orders a collection's locales with the base locale first, then splits off the tail beyond
   * MAX_LOCALE_CHIPS so the chip row never wraps and cards in a row share a height.
   */
  #toCardView(item: {
    name: string;
    config: { translationsFolder: string; readOnly?: boolean };
    locales: string[] | undefined;
    baseLocale: string | undefined;
  }): CollectionCardView {
    const locales = item.locales ?? [];
    const base = item.baseLocale;
    const ordered = base && locales.includes(base) ? [base, ...locales.filter((l) => l !== base)] : [...locales];

    return {
      name: item.name,
      translationsFolder: item.config.translationsFolder,
      readOnly: item.config.readOnly === true,
      baseLocale: base,
      visibleLocales: ordered.length > MAX_LOCALE_CHIPS ? ordered.slice(0, MAX_LOCALE_CHIPS - 1) : ordered,
      overflowLocales: ordered.length > MAX_LOCALE_CHIPS ? ordered.slice(MAX_LOCALE_CHIPS - 1) : [],
    };
  }

  clearFilter(): void {
    this.filter.set('');
  }

  /**
   * Opens the create collection dialog.
   */
  openCreateDialog(): void {
    import('./collection-form-dialog/collection-form-dialog').then((m) => {
      const dialogRef = this.#dialog.open(m.CollectionFormDialog, {
        data: { mode: 'create' },
        width: '500px',
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result) {
          this.store.createCollection({
            name: result.name,
            collection: result.config,
          });
          this.#notifications.success(this.#transloco.translate(TRACKER_TOKENS.COLLECTIONS.TOAST.CREATED));
        }
      });
    });
  }

  /**
   * Opens the edit collection dialog.
   */
  openEditDialog(name: string): void {
    const config = this.store.collections()[name];
    if (!config) {
      this.#notifications.error(this.#transloco.translate(TRACKER_TOKENS.COLLECTIONS.TOAST.ERROR));
      return;
    }

    import('./collection-form-dialog/collection-form-dialog').then((m) => {
      const dialogRef = this.#dialog.open(m.CollectionFormDialog, {
        data: {
          mode: 'edit',
          name,
          config,
        },
        width: '500px',
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result) {
          this.store.updateCollection({
            oldName: name,
            newName: result.name !== name ? result.name : undefined,
            collection: result.config,
          });
          this.#notifications.success(this.#transloco.translate(TRACKER_TOKENS.COLLECTIONS.TOAST.UPDATED));
        }
      });
    });
  }

  /**
   * Opens the delete confirmation dialog.
   */
  openDeleteDialog(name: string): void {
    import('../shared/components/confirmation-dialog/confirmation-dialog').then((m) => {
      const dialogRef = this.#dialog.open(m.ConfirmationDialog, {
        data: {
          title: this.#transloco.translate(TRACKER_TOKENS.COLLECTIONS.DIALOG.DELETE.TITLE),
          message: this.#transloco.translate(TRACKER_TOKENS.COLLECTIONS.DIALOG.DELETE.MESSAGE, { name }),
          confirmButtonText: this.#transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.DELETE),
          cancelButtonText: this.#transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.CANCEL),
          actionType: 'destructive',
        },
        width: '400px',
      });

      dialogRef.afterClosed().subscribe((confirmed) => {
        if (confirmed) {
          this.store.deleteCollection(name);
          this.#notifications.success(this.#transloco.translate(TRACKER_TOKENS.COLLECTIONS.TOAST.DELETED));
        }
      });
    });
  }

  /**
   * Navigates to the translation browser for the given collection.
   */
  navigateToBrowser(collectionName: string): void {
    this.#router.navigate(['/browser', encodeURIComponent(collectionName)]);
  }
}
