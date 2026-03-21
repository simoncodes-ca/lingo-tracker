import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleService, type LocaleCode } from '../../shared/services/locale.service';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';

@Component({
  selector: 'locale-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule, MatMenuModule, TranslocoPipe],
  templateUrl: './locale-picker.html',
  styleUrl: './locale-picker.scss',
})
export class LocalePickerComponent {
  readonly #localeService = inject(LocaleService);

  readonly TOKENS = TRACKER_TOKENS;
  readonly currentLocale = this.#localeService.currentLocale;
  readonly availableLocales = this.#localeService.availableLocales;
  readonly currentDisplayName = computed(
    () => this.availableLocales.find((l) => l.code === this.currentLocale())?.displayName ?? this.currentLocale(),
  );

  isActive(code: LocaleCode): boolean {
    return this.currentLocale() === code;
  }

  setLocale(code: LocaleCode): void {
    this.#localeService.setLocale(code);
  }
}
