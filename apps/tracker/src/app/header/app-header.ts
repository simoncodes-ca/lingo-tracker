import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { HeaderContextService } from '../shared/services/header-context.service';
import { type ThemeMode, ThemeService } from '../shared/services/theme.service';
import { LocalePickerComponent } from './locale-picker/locale-picker';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
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

  readonly TOKENS = TRACKER_TOKENS;

  readonly collectionName = this.#headerContext.collectionName;
  readonly translationsFolder = this.#headerContext.translationsFolder;
  readonly totalKeys = this.#headerContext.totalKeys;
  readonly localeCount = this.#headerContext.localeCount;
  readonly statsLoading = this.#headerContext.statsLoading;
  readonly hasCollectionContext = this.#headerContext.hasCollectionContext;

  /**
   * The stat chips resolve through the `transloco` pipe in the template, not
   * through `TranslocoService.translate()` in a `computed`. A computed caches
   * whatever `translate()` returned on its first read, and that read happens
   * before the active language's translation file has finished loading, so it
   * would latch the raw key ("header.keysCountX") forever. See `themeModeToken`
   * below for the same rule.
   */

  /**
   * The switcher wears the *mode* that is selected, not the theme it resolves
   * to: `system` gets its own glyph so following the OS is visibly distinct
   * from having pinned light or dark.
   */
  readonly themeIcon = computed(
    () =>
      ({
        light: 'light_mode',
        dark: 'dark_mode',
        system: 'computer',
      })[this.#themeService.themeMode()],
  );

  /**
   * The token for the active mode's name. Resolved by the transloco pipe in the
   * template rather than the service: a computed calling `translate` caches
   * whatever it got on first read, and first read happens before the
   * translation file has loaded, so it would keep serving the raw key.
   */
  readonly themeModeToken = computed(
    () =>
      ({
        light: TRACKER_TOKENS.THEME.LIGHT,
        dark: TRACKER_TOKENS.THEME.DARK,
        system: TRACKER_TOKENS.THEME.SYSTEM,
      })[this.#themeService.themeMode()],
  );

  setTheme(mode: ThemeMode): void {
    this.#themeService.setTheme(mode);
  }

  isThemeActive(mode: ThemeMode): boolean {
    return this.#themeService.themeMode() === mode;
  }
}
