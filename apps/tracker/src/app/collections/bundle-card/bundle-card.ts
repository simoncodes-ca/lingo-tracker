import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { RunResultStrip } from '../../shared/components/run-result-strip/run-result-strip';
import { bundleSummary } from '../run-strip-summary/bundle-summary';
import { injectStripTranslate } from '../run-strip-summary/inject-strip-translate';
import type { BundleRunState } from '../store/bundle-runs';
import type { BundleEntry } from '../store/features/with-bundles.feature';

const LOCALE_PLACEHOLDER = '{locale}';

/** One row of the result details: a locale's output file and how many keys it holds. */
export interface BundleRunFileView {
  readonly locale: string;
  readonly file: string;
  readonly keys: number | undefined;
}

/** The output path split around the `{locale}` placeholder so the template can emphasise it. */
export interface OutputPathView {
  readonly prefix: string;
  readonly placeholder: string;
  readonly suffix: string;
}

/**
 * A compact bundle card for the home page bundles column.
 *
 * Shows the bundle's identity (tile, name, output pattern), the collections it consumes,
 * its types file, the state of its last generation run and a footer with a Generate action.
 * Hover and focus are reported to the parent so it can highlight the linked collections.
 */
@Component({
  selector: 'app-bundle-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatMenuModule, MatTooltipModule, RunResultStrip, TranslocoPipe],
  templateUrl: './bundle-card.html',
  styleUrl: './bundle-card.scss',
  host: {
    class: 'bundle-card',
    '[class.bundle-card--linked]': 'linked()',
    '[class.bundle-card--running]': 'isRunning()',
    '[attr.data-bundle]': 'entry().name',
    '(mouseenter)': 'hoverChange.emit(true)',
    '(mouseleave)': 'hoverChange.emit(false)',
    '(focusin)': 'hoverChange.emit(true)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class BundleCard {
  readonly TOKENS = TRACKER_TOKENS;

  /** The bundle definition and its config key. */
  readonly entry = input.required<BundleEntry>();

  /** Client-side state of the last generation run, if any. */
  readonly run = input<BundleRunState | undefined>(undefined);

  /** True while the card is hovered or focused and its collections are highlighted. */
  readonly linked = input(false);

  /** Names of the collections this bundle consumes, already resolved for "All". */
  readonly collectionNames = input.required<readonly string[]>();

  /** Number of locales the bundle writes. */
  readonly localeCount = input.required<number>();

  /** Base locale used to pick the keys-per-locale headline figure. */
  readonly baseLocale = input<string | undefined>(undefined);

  readonly generate = output<void>();
  readonly edit = output<void>();
  readonly delete = output<void>();
  readonly retry = output<void>();
  /** Asks the parent to drop the finished run so the result strip disappears. */
  readonly dismiss = output<void>();
  /** Emits true on hover/focus enter and false on leave. */
  readonly hoverChange = output<boolean>();

  readonly detailsOpen = signal(false);

  readonly includesAllCollections = computed(() => this.entry().definition.collections === 'All');
  readonly typeDistFile = computed(() => this.entry().definition.typeDistFile);

  readonly outputPath = computed<OutputPathView>(() => {
    const { dist, bundleName } = this.entry().definition;
    const folder = dist.endsWith('/') ? dist : `${dist}/`;
    const placeholderIndex = bundleName.indexOf(LOCALE_PLACEHOLDER);

    if (placeholderIndex === -1) {
      return { prefix: `${folder}${bundleName}.json`, placeholder: '', suffix: '' };
    }

    return {
      prefix: `${folder}${bundleName.slice(0, placeholderIndex)}`,
      placeholder: LOCALE_PLACEHOLDER,
      suffix: `${bundleName.slice(placeholderIndex + LOCALE_PLACEHOLDER.length)}.json`,
    };
  });

  readonly status = computed(() => this.run()?.status ?? 'idle');
  readonly isRunning = computed(() => this.status() === 'running');
  readonly isCompleted = computed(() => this.status() === 'completed' && this.run()?.result !== undefined);
  readonly isFailed = computed(() => this.status() === 'failed');

  readonly #translateSummary = injectStripTranslate();
  readonly summary = computed(() => {
    return bundleSummary(
      this.run(),
      this.entry().definition.bundleName,
      this.entry().name,
      this.baseLocale(),
      this.#translateSummary,
    );
  });
  readonly result = computed(() => this.summary()?.details.result);
  readonly keysPerLocale = computed(() => this.summary()?.details.keysPerLocale ?? 0);
  readonly resultFiles = computed(() => this.summary()?.details.files ?? []);
  readonly hasWarnings = computed(() => (this.summary()?.details.warningsCount ?? 0) > 0);

  readonly detailsId = computed(() => `bundle-run-details-${this.entry().name}`);

  toggleDetails(): void {
    this.detailsOpen.update((open) => !open);
  }

  onGenerateClick(): void {
    if (this.isRunning()) return;
    this.generate.emit();
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    const host = event.currentTarget;
    if (next instanceof Node && host instanceof Node && host.contains(next)) return;
    this.hoverChange.emit(false);
  }
}
