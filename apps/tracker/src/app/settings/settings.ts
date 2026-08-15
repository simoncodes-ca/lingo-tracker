import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule, type MatChipInputEvent } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { TranslocoModule } from '@jsverse/transloco';
import { normalizeProtectedTerms } from '@simoncodes-ca/domain';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { CollectionsStore } from '../collections/store/collections.store';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';

/**
 * Settings view. Currently exposes the global protected-terms list, written
 * through `PUT /api/config`. Structured so other global fields can be added
 * later without rework. Never exposes collections/locales/baseLocale editing.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslocoModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatChipsModule,
    MatFormFieldModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  host: { role: 'main' },
})
export class Settings {
  readonly store = inject(CollectionsStore);

  readonly TOKENS = TRACKER_TOKENS;

  readonly termSeparatorKeyCodes = [ENTER, COMMA] as const;
  readonly protectedTermsList = signal<string[]>([]);
  /** True once the chip list has been seeded; prevents a later config refetch from clobbering edits. */
  readonly #seeded = signal(false);

  constructor() {
    // Seed the chip list from the store config as soon as it loads (App loads config on boot).
    // Only seeds once, so a successful save that refetches config cannot overwrite in-progress edits.
    effect(() => {
      if (this.#seeded()) return;
      const cfg = this.store.config();
      if (!cfg) return;
      this.protectedTermsList.set(cfg.protectedTerms ?? []);
      this.#seeded.set(true);
    });
  }

  addProtectedTerm(event: MatChipInputEvent): void {
    const [term] = normalizeProtectedTerms([event.value]);
    if (term && !this.protectedTermsList().includes(term)) {
      this.protectedTermsList.update((terms) => [...terms, term]);
    }
    event.chipInput?.clear();
  }

  removeProtectedTerm(term: string): void {
    this.protectedTermsList.update((terms) => terms.filter((t) => t !== term));
  }

  save(): void {
    // Errors from a failed save surface via the store error signal (rendered in the template).
    this.store.updateGlobalConfig({ protectedTerms: this.protectedTermsList() });
  }
}
