import { Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { OverlayContainer } from '@angular/cdk/overlay';

const COLOR_SCHEME_KEY = 'lingo-tracker-color-scheme';
const DARK_THEME_CLASS = 'dark-theme';

export enum ColorScheme {
  light = 'light',
  dark = 'dark',
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private doc = inject(DOCUMENT);
  private overlay = inject(OverlayContainer);
  isDark = signal(false);

  init() {
    const saved = localStorage.getItem(COLOR_SCHEME_KEY);
    const prefersDark = window.matchMedia(`(prefers-color-scheme: ${ ColorScheme.dark })`).matches;
    this.setDark((saved ?? (prefersDark ? ColorScheme.dark : ColorScheme.light)) === ColorScheme.dark);
  }

  toggle() {
    this.setDark(!this.isDark());
  }


  private setDark(dark: boolean) {
    this.doc.body.classList.toggle(DARK_THEME_CLASS, dark);
    this.isDark.set(dark);

    // Ensure CDK overlays (menus, dialogs, tooltips) match the page theme:
    this.overlay.getContainerElement().classList.toggle(DARK_THEME_CLASS, dark);
    localStorage.setItem(COLOR_SCHEME_KEY, dark ? ColorScheme.dark : ColorScheme.light);
  }
}
