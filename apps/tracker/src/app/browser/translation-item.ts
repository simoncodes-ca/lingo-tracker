import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { TagList } from '../shared/tag-list/tag-list.component';
import {MatIconButton} from "@angular/material/button";

/**
 * Displays a single translation entry with key, base value, locale translations,
 * and action menu.
 */
@Component({
  selector: 'app-translation-item',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        MatIconModule,
        MatMenuModule,
        MatTooltipModule,
        TranslocoPipe,
        TagList,
        MatIconButton,
    ],
  templateUrl: './translation-item.html',
  styleUrl: './translation-item.scss',
  host: {
    class: 'translation-item',
  },
})
export class TranslationItem {
  /** Translation data */
  translation = input.required<ResourceSummaryDto>();

  /** Active locales to display */
  locales = input.required<string[]>();

  /** Base locale (source language) */
  baseLocale = input<string>('en');

  /** Current folder path for constructing full key (empty for search results) */
  folderPath = input<string>('');

  /** Emitted when user requests to copy key to clipboard */
  copyKey = output<string>();

  /** Emitted when user selects Edit from context menu */
  editTranslation = output<ResourceSummaryDto>();

  /** Emitted when user selects Move from context menu */
  moveTranslation = output<ResourceSummaryDto>();

  /** Emitted when user selects Delete from context menu */
  deleteTranslation = output<ResourceSummaryDto>();

  readonly TOKENS = TRACKER_TOKENS;

  /**
   * Full translation key (combines folder path with entry key if needed).
   * For search results, the key already contains the full path.
   * For folder browsing, we prepend the current folder path.
   */
  readonly fullKey = computed(() => {
    const path = this.folderPath();
    const key = this.translation().key;
    return path ? `${path}.${key}` : key;
  });

  /**
   * Base locale value (English/source)
   */
  readonly baseValue = computed(() => {
    const base = this.baseLocale();
    return this.translation().translations[base] || '';
  });

  /**
   * Locale translations excluding base locale
   */
  readonly localeTranslations = computed(() => {
    const trans = this.translation();
    const base = this.baseLocale();
    const activeLocales = this.locales();

    return activeLocales
      .filter((locale) => locale !== base)
      .map((locale) => ({
        locale,
        value: trans.translations[locale] || '',
        status: trans.status[locale],
      }));
  });
}
