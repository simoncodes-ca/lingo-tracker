import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { injectMidpointFlip } from '../../../shared/timed-transients';
import { TranslationEditorLauncher } from '../../services/translation-editor-launcher';
import { BrowserStore } from '../../store/browser.store';
import type { DensityMode } from '../../types/density-mode';
import { LocaleFilter } from './locale-filter/locale-filter';
import { StatusFilter } from './status-filter/status-filter';
import { TranslationSearch } from './translation-search/translation-search';

const DENSITY_ANIMATION_DURATION_MS = 250;

/**
 * TranslationMainHeader component provides search and filtering controls
 * for the translation list.
 */
@Component({
  selector: 'app-translation-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslationSearch,
    LocaleFilter,
    StatusFilter,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  templateUrl: './translation-main-header.html',
  styleUrl: './translation-main-header.scss',
})
export class TranslationMainHeader {
  readonly store = inject(BrowserStore);
  readonly #editorLauncher = inject(TranslationEditorLauncher);
  readonly TOKENS = TRACKER_TOKENS;

  /** Drives the icon flip animation — true for one animation cycle when toggled */
  readonly #densityFlip = injectMidpointFlip(DENSITY_ANIMATION_DURATION_MS);
  readonly isDensityToggleFlipping = this.#densityFlip.active;

  handleDensityToggle(): void {
    const nextMode: DensityMode = this.store.densityMode() === 'compact' ? 'full' : 'compact';
    this.#densityFlip.trigger(() => this.store.setDensityMode(nextMode));
  }

  handleSortDirectionToggle(): void {
    this.store.toggleSortDirection();
  }

  /** Opens the editor to create an entry; the launcher gives the feedback. */
  handleAddTranslation(): void {
    void this.#editorLauncher.openCreate();
  }
}
