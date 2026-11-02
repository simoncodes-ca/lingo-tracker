import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { countByStatus, type StatusCounts, type TranslationStatus } from '@simoncodes-ca/domain';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { injectStatusBreakdown } from '../../../../shared/i18n/status-breakdown';
import { HighlightPipe } from '../../../../shared/pipes/highlight.pipe';
import {
  statusIconFor,
  statusLabelTokenFor,
} from '../../../../shared/translation-status/translation-status-presentation';
import type { DensityMode } from '../../../types/density-mode';
import { type BaseRow, type LocaleRow, sharedStatus } from './row-view';

/**
 * Displays locale translations in a grid layout.
 * Supports different density modes with appropriate styling.
 */
@Component({
  selector: 'app-translation-item-locales',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, HighlightPipe, TranslocoPipe],
  templateUrl: './item-locales.html',
  styleUrl: './item-locales.scss',
  host: {
    class: 'translation-item-locales',
  },
})
export class TranslationItemLocales {
  /**
   * Locale rows to display. A row flagged `isSameAsBase` holds the base value
   * verbatim: the status may still say `translated` — a checksum cannot tell a
   * deliberate loanword from a string nobody touched — so the row says it out loud.
   */
  localeTranslations = input.required<readonly LocaleRow[]>();

  /**
   * The source row, rendered first and in the same grid as the locales: a
   * translation can only be judged against the source when both share one
   * baseline. Absent when there is no base value to compare against.
   */
  baseRow = input<BaseRow | undefined>(undefined);

  /** Density mode affects styling */
  densityMode = input<DensityMode>('full');

  /** Expansion state for full mode */
  isExpanded = input<boolean>(false);

  /** Search query for highlighting */
  searchQuery = input<string>('');

  readonly TOKENS = TRACKER_TOKENS;

  /** Locale rows per status, over the rows actually rendered. */
  private readonly statusCounts = computed<StatusCounts>(() =>
    countByStatus(this.localeTranslations().map((lt) => lt.status)),
  );

  /** Localized "{n} translated" for the rendered rows. */
  private readonly breakdown = injectStatusBreakdown(this.statusCounts);

  /** The status every rendered row shares, if they share one (see `sharedStatus`); a mixed card keeps per-row chips. */
  readonly uniformStatus = computed<TranslationStatus | undefined>(() => sharedStatus(this.localeTranslations()));

  /** The collapsed chip: the shared status, labelled with its count. */
  readonly uniformSummary = computed(() => {
    const status = this.uniformStatus();
    return status ? { status, label: this.breakdown() } : undefined;
  });

  getStatusIcon(status: TranslationStatus | undefined): string {
    return statusIconFor(status);
  }

  getStatusLabel(status: TranslationStatus | undefined): string {
    return statusLabelTokenFor(status);
  }
}
