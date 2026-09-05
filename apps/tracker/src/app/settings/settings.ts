import {
  Component,
  ChangeDetectionStrategy,
  type ElementRef,
  inject,
  effect,
  signal,
  computed,
  untracked,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { normalizeProtectedTerms } from '@simoncodes-ca/domain';
import { CollectionsStore } from '../collections/store/collections.store';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';

/**
 * One row of the protected-terms editor. `original` is the value as last saved —
 * absent for a term added in this session — so a row can describe itself as
 * added, renamed or removed without diffing against the whole saved list.
 */
interface TermEntry {
  readonly id: number;
  readonly value: string;
  readonly original?: string;
  readonly removed: boolean;
}

/** Above this many terms the list gets a filter field; below it, scanning is faster than typing. */
const FILTER_THRESHOLD = 8;

const compareTerms = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * Settings view. Currently exposes the global protected-terms list, written
 * through `PUT /api/config`. Structured so other global fields can be added
 * later without rework. Never exposes collections/locales/baseLocale editing.
 *
 * Edits are staged: adds, renames and removals are held as pending row state and
 * only reach the API on Save, so every change is visible and reversible first.
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
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  host: { role: 'main' },
})
export class Settings {
  readonly store = inject(CollectionsStore);

  readonly TOKENS = TRACKER_TOKENS;

  private readonly editInputs = viewChildren<ElementRef<HTMLInputElement>>('editInput');
  private readonly termRows = viewChildren<ElementRef<HTMLElement>>('termRow');

  readonly entries = signal<TermEntry[]>([]);
  readonly addDraft = signal('');
  readonly filter = signal('');
  readonly editingId = signal<number | null>(null);
  readonly editDraft = signal('');
  /** Term that a failed add or rename collided with; cleared as soon as the input changes. */
  readonly addError = signal<string | null>(null);
  readonly editError = signal<string | null>(null);

  /** Path of the file the terms are stored in, surfaced read-only so the source of a diff is obvious. */
  readonly protectedTermsFilePath = computed(() => this.store.config()?.protectedTermsFilePath);

  /** True once the list has been seeded; prevents a later config refetch from clobbering edits. */
  readonly #seeded = signal(false);
  /** Set while a save is in flight so the next config arrival is treated as the new baseline. */
  readonly #awaitingSave = signal(false);
  #nextId = 0;
  /** Row to reveal once it has rendered, so an added term is never added off-screen. */
  readonly #scrollToId = signal<number | null>(null);

  /** Display order is alphabetical: the list is a set, and a sorted file keeps its Git diffs minimal. */
  readonly sortedEntries = computed(() => [...this.entries()].sort((a, b) => compareTerms(a.value, b.value)));

  readonly visibleEntries = computed(() => {
    const query = this.filter().trim().toLowerCase();
    if (!query) return this.sortedEntries();
    return this.sortedEntries().filter(
      (entry) => entry.value.toLowerCase().includes(query) || (entry.original?.toLowerCase().includes(query) ?? false),
    );
  });

  /** The terms a save would write: everything not marked for removal, in display order. */
  readonly termsToSave = computed(() =>
    normalizeProtectedTerms(
      this.sortedEntries()
        .filter((entry) => !entry.removed)
        .map((entry) => entry.value),
    ),
  );

  readonly termCount = computed(() => this.termsToSave().length);

  readonly changeCount = computed(
    () =>
      this.entries().filter((entry) => entry.removed || entry.original === undefined || entry.original !== entry.value)
        .length,
  );

  readonly hasChanges = computed(() => this.changeCount() > 0);
  readonly isEmpty = computed(() => this.entries().length === 0);
  readonly showFilter = computed(() => this.entries().length > FILTER_THRESHOLD);
  readonly isFiltering = computed(() => this.filter().trim().length > 0);
  readonly hasNoMatches = computed(() => !this.isEmpty() && this.isFiltering() && this.visibleEntries().length === 0);
  readonly canAdd = computed(() => this.addDraft().trim().length > 0);

  constructor() {
    // Seed from the store config as soon as it loads (App loads config on boot), and again
    // after a save's refetch. A refetch that is not ours must not overwrite in-progress edits.
    // The latches are read untracked so that arming one on save cannot itself trigger a
    // reseed from the config still on screen — only a config arrival may reseed.
    effect(() => {
      const config = this.store.config();
      if (!config) return;
      untracked(() => {
        if (!this.#seeded() || this.#awaitingSave()) this.#seed(config.protectedTerms ?? []);
      });
    });

    // A failed save never refetches, so release the save latch on the error instead.
    effect(() => {
      if (!this.store.error()) return;
      untracked(() => this.#awaitingSave.set(false));
    });

    effect(() => {
      const input = this.editInputs()[0];
      if (this.editingId() === null || !input) return;
      input.nativeElement.focus();
      input.nativeElement.select();
    });

    // The row may not be in the query yet when the id is set, so the target is
    // held — not cleared — until it is found. Clearing early is what made an
    // added term land silently below the fold of the scrolling list.
    effect(() => {
      const id = this.#scrollToId();
      const rows = this.termRows();
      if (id === null) return;
      const row = rows.find((ref) => ref.nativeElement.getAttribute('data-term-id') === String(id));
      if (!row) return;
      // Optional call: not every environment implements scrollIntoView (jsdom does not).
      row.nativeElement.scrollIntoView?.({ block: 'nearest' });
      this.#scrollToId.set(null);
    });
  }

  /**
   * Brings the row for `value` into view. A filter that would hide it is dropped
   * first: a term you just added or renamed must never vanish behind a filter.
   */
  #revealTerm(id: number, value: string): void {
    const query = this.filter().trim().toLowerCase();
    if (query && !value.toLowerCase().includes(query)) this.filter.set('');
    this.#scrollToId.set(id);
  }

  #seed(terms: readonly string[]): void {
    this.entries.set(
      normalizeProtectedTerms([...terms]).map((value) => ({
        id: this.#nextId++,
        value,
        original: value,
        removed: false,
      })),
    );
    this.#scrollToId.set(null);
    this.editingId.set(null);
    this.addError.set(null);
    this.editError.set(null);
    this.#seeded.set(true);
    this.#awaitingSave.set(false);
  }

  /** The pending state of a row, used for its badge and tint. */
  statusOf(entry: TermEntry): 'removed' | 'added' | 'edited' | 'unchanged' {
    if (entry.removed) return 'removed';
    if (entry.original === undefined) return 'added';
    return entry.original === entry.value ? 'unchanged' : 'edited';
  }

  addTerm(): void {
    const [term] = normalizeProtectedTerms([this.addDraft()]);
    if (!term) return;

    const existing = this.entries().find((entry) => entry.value === term);
    if (existing) {
      // A term the user is re-adding was only marked for removal — take that back rather than refuse.
      if (existing.removed) {
        this.restoreTerm(existing);
        this.addDraft.set('');
        this.addError.set(null);
        this.#revealTerm(existing.id, existing.value);
        return;
      }
      this.addError.set(term);
      this.#revealTerm(existing.id, existing.value);
      return;
    }

    const id = this.#nextId++;
    this.entries.update((entries) => [...entries, { id, value: term, removed: false }]);
    this.addDraft.set('');
    this.addError.set(null);
    this.#revealTerm(id, term);
  }

  onAddDraftChange(value: string): void {
    this.addDraft.set(value);
    this.addError.set(null);
  }

  removeTerm(entry: TermEntry): void {
    // A term added in this session has nothing to remove from the file — drop the row outright.
    if (entry.original === undefined) {
      this.entries.update((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      return;
    }
    this.#patch(entry.id, { removed: true });
  }

  restoreTerm(entry: TermEntry): void {
    this.#patch(entry.id, { removed: false });
  }

  beginEdit(entry: TermEntry): void {
    this.editingId.set(entry.id);
    this.editDraft.set(entry.value);
    this.editError.set(null);
  }

  onEditDraftChange(value: string): void {
    this.editDraft.set(value);
    this.editError.set(null);
  }

  commitEdit(): void {
    const id = this.editingId();
    if (id === null) return;
    const entry = this.entries().find((candidate) => candidate.id === id);
    if (!entry) return;

    const [term] = normalizeProtectedTerms([this.editDraft()]);
    if (!term || term === entry.value) {
      this.cancelEdit();
      return;
    }

    if (this.entries().some((candidate) => candidate.id !== id && candidate.value === term && !candidate.removed)) {
      this.editError.set(term);
      return;
    }

    this.#patch(id, { value: term });
    this.editingId.set(null);
    this.editError.set(null);
    this.#revealTerm(id, term);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editError.set(null);
  }

  revertAll(): void {
    this.#seed(this.store.config()?.protectedTerms ?? []);
    this.filter.set('');
  }

  clearFilter(): void {
    this.filter.set('');
  }

  save(): void {
    if (!this.hasChanges()) return;
    this.cancelEdit();
    this.#awaitingSave.set(true);
    // Errors from a failed save surface via the store error signal (rendered in the template).
    this.store.updateGlobalConfig({ protectedTerms: this.termsToSave() });
  }

  #patch(id: number, patch: Partial<Omit<TermEntry, 'id'>>): void {
    this.entries.update((entries) => entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }
}
