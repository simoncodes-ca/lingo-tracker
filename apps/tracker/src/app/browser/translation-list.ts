import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  input,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslationBrowserStore } from './store/translation-browser.store';
import { TranslationItem } from './translation-item';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import {TranslocoPipe} from "@jsverse/transloco";
import {TRACKER_TOKENS} from "../../i18n-types/tracker-resources";

/**
 * List component for displaying translations with virtual scrolling.
 */
@Component({
  selector: 'app-translation-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ScrollingModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslationItem,
      TranslocoPipe,
  ],
  templateUrl: './translation-list.html',
  styleUrl: './translation-list.scss',
})
export class TranslationList implements OnInit {
  readonly store = inject(TranslationBrowserStore);
  private readonly snackBar = inject(MatSnackBar);

  /** Collection name to load translations from */
  collectionName = input.required<string>();

  /** Active locales to display */
  locales = input.required<string[]>();

  /** Base locale (source language) */
  baseLocale = input<string>('en');

  /** Folder path to load translations from */
  folderPath = input<string>('');

  /** Item height for virtual scrolling (pixels) */
  readonly itemSize = 120;

  readonly TOKENS = TRACKER_TOKENS;

  constructor() {
    // React to changes in collection name or folder path
    effect(() => {
      const name = this.collectionName();
      const path = this.folderPath();

      if (name) {
        this.store.loadTranslations({
          collectionName: name,
          folderPath: path || undefined
        });
      }
    });
  }

  ngOnInit(): void {
    // Initial load is handled by the effect in constructor
  }

  /**
   * Handles copy-to-clipboard request from translation item.
   */
  handleCopyKey(key: string): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(key)
        .then(() => {
          this.snackBar.open('Copied to clipboard', '', {
            duration: 2000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          });
        })
        .catch(() => {
          this.snackBar.open('Failed to copy', '', {
            duration: 2000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          });
        });
    }
  }

  /**
   * Handles edit request from translation item.
   */
  handleEdit(translation: ResourceSummaryDto): void {
    // TODO: Open edit dialog
    console.log('Edit:', translation);
  }

  /**
   * Handles move request from translation item.
   */
  handleMove(translation: ResourceSummaryDto): void {
    // TODO: Open move dialog
    console.log('Move:', translation);
  }

  /**
   * Handles delete request from translation item.
   */
  handleDelete(translation: ResourceSummaryDto): void {
    // TODO: Open delete confirmation dialog
    console.log('Delete:', translation);
  }

  /**
   * Track function for virtual scroll performance.
   */
  trackByKey(_index: number, item: ResourceSummaryDto): string {
    return item.key;
  }
}
