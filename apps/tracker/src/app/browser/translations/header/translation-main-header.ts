import { Component, ChangeDetectionStrategy, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NotificationService } from '../../../shared/notification';
import { TranslationSearch } from './translation-search/translation-search';
import { BrowserStore } from '../../store/browser.store';
import {
  TranslationEditorDialog,
  type TranslationEditorDialogData,
  type TranslationEditorResult,
} from '../../dialogs/translation-editor';
import { LocaleFilter } from './locale-filter/locale-filter';
import { StatusFilter } from './status-filter/status-filter';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import type { DensityMode } from '../../types/density-mode';

const DENSITY_ANIMATION_DURATION_MS = 250;
const SNACKBAR_CHAIN_DELAY_MS = 3200;

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
  readonly #dialog = inject(MatDialog);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);
  readonly TOKENS = TRACKER_TOKENS;

  /** Drives the icon flip animation — true for one animation cycle when toggled */
  readonly isDensityToggleFlipping = signal(false);

  #densityFlipMidTimeout: ReturnType<typeof setTimeout> | undefined;
  #densityFlipEndTimeout: ReturnType<typeof setTimeout> | undefined;
  #snackbarChainTimeout: ReturnType<typeof setTimeout> | undefined;

  readonly #destroyRef = inject(DestroyRef);

  constructor() {
    this.#destroyRef.onDestroy(() => {
      if (this.#densityFlipMidTimeout) clearTimeout(this.#densityFlipMidTimeout);
      if (this.#densityFlipEndTimeout) clearTimeout(this.#densityFlipEndTimeout);
      if (this.#snackbarChainTimeout) clearTimeout(this.#snackbarChainTimeout);
    });
  }

  handleDensityToggle(): void {
    if (this.#densityFlipMidTimeout) clearTimeout(this.#densityFlipMidTimeout);
    if (this.#densityFlipEndTimeout) clearTimeout(this.#densityFlipEndTimeout);

    const nextMode: DensityMode = this.store.densityMode() === 'compact' ? 'full' : 'compact';

    this.isDensityToggleFlipping.set(true);

    this.#densityFlipMidTimeout = setTimeout(() => {
      this.store.setDensityMode(nextMode);
      this.#densityFlipMidTimeout = undefined;
    }, DENSITY_ANIMATION_DURATION_MS / 2);

    this.#densityFlipEndTimeout = setTimeout(() => {
      this.isDensityToggleFlipping.set(false);
      this.#densityFlipEndTimeout = undefined;
    }, DENSITY_ANIMATION_DURATION_MS);
  }

  handleSortDirectionToggle(): void {
    this.store.toggleSortDirection();
  }

  handleAddTranslation(): void {
    const dialogData: TranslationEditorDialogData = {
      mode: 'create',
      collectionName: this.store.selectedCollection() || '',
      folderPath: this.store.currentFolderPath(),
      availableLocales: this.store.availableLocales(),
      baseLocale: this.store.baseLocale(),
    };

    const dialogRef = this.#dialog.open(TranslationEditorDialog, {
      width: '700px',
      maxHeight: '90vh',
      data: dialogData,
      autoFocus: false,
    });

    dialogRef.afterClosed().subscribe((result: TranslationEditorResult | undefined) => {
      if (!result?.success) return;

      this.store.selectFolder(this.store.currentFolderPath());
      this.#notifications.success(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.RESOURCECREATED));

      if (result.skippedLocales?.length) {
        const locales = result.skippedLocales.join(', ');
        // Delay slightly longer than the success notification duration so the
        // two messages don't overlap on screen.
        if (this.#snackbarChainTimeout) clearTimeout(this.#snackbarChainTimeout);
        this.#snackbarChainTimeout = setTimeout(() => {
          this.#notifications.warning(
            this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.AUTOTRANSLATIONSKIPPEDX, { locales }),
          );
          this.#snackbarChainTimeout = undefined;
        }, SNACKBAR_CHAIN_DELAY_MS);
      }
    });
  }
}
