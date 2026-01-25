import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonToggleModule, MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LocaleFilter, TranslationSearch } from '../../sidebar';
import { BrowserStore } from '../../store/browser.store';

type DensityMode = 'compact' | 'medium' | 'full';

/**
 * TranslationMainHeader component provides search and filtering controls
 * for the translation list.
 */
@Component({
  selector: 'app-translation-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslationSearch, LocaleFilter, MatButtonToggleModule, MatIconModule, MatTooltipModule],
  templateUrl: './translation-main-header.html',
  styleUrl: './translation-main-header.scss',
})
export class TranslationMainHeader {
  readonly store = inject(BrowserStore);

  handleDensityChange(event: MatButtonToggleChange): void {
    const densityMode = event.value as DensityMode;
    this.store.setDensityMode(densityMode);
  }
}
