import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ThemeService, type ThemeMode } from '../shared/services/theme.service';
import { HeaderContextService } from '../shared/services/header-context.service';
import { LocaleService } from '../shared/services/locale.service';
import { LocalePickerComponent } from './locale-picker/locale-picker';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    TranslocoPipe,
    LocalePickerComponent,
  ],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
})
export class AppHeader {
  readonly #themeService = inject(ThemeService);
  readonly #headerContext = inject(HeaderContextService);
  readonly #transloco = inject(TranslocoService);
  readonly #localeService = inject(LocaleService);

  readonly TOKENS = TRACKER_TOKENS;

  readonly collectionName = this.#headerContext.collectionName;
  readonly translationsFolder = this.#headerContext.translationsFolder;
  readonly totalKeys = this.#headerContext.totalKeys;
  readonly localeCount = this.#headerContext.localeCount;
  readonly statsLoading = this.#headerContext.statsLoading;
  readonly hasCollectionContext = this.#headerContext.hasCollectionContext;

  readonly keysText = computed(() => {
    const _locale = this.#localeService.currentLocale();
    const k = this.totalKeys();
    if (k === null) return '';
    return this.#transloco.translate(TRACKER_TOKENS.HEADER.KEYSCOUNTX, { count: k });
  });

  readonly localesText = computed(() => {
    const _locale = this.#localeService.currentLocale();
    const l = this.localeCount();
    if (l === null) return '';
    return this.#transloco.translate(TRACKER_TOKENS.HEADER.LOCALESCOUNTX, { count: l });
  });

  setTheme(mode: ThemeMode): void {
    this.#themeService.setTheme(mode);
  }

  isThemeActive(mode: ThemeMode): boolean {
    return this.#themeService.themeMode() === mode;
  }
}
