import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoModule } from '@jsverse/transloco';
import { ThemeService, ThemeMode } from '../shared/services/theme.service';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatToolbarModule, MatIconModule, MatButtonModule, MatMenuModule, TranslocoModule],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
})
export class AppHeader {
  readonly themeService = inject(ThemeService);

  readonly TOKENS = TRACKER_TOKENS;

  setTheme(mode: ThemeMode): void {
    this.themeService.setTheme(mode);
  }

  isThemeActive(mode: ThemeMode): boolean {
    return this.themeService.themeMode() === mode;
  }
}
