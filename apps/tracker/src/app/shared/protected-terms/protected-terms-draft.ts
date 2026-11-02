import { computed, signal } from '@angular/core';
import { normalizeProtectedTerms } from '@simoncodes-ca/domain';
import { prepareProtectedTermAdd } from './protected-term-add';

/** One staged term. An absent original means it was added since the last save. */
export interface TermEntry {
  readonly id: number;
  readonly value: string;
  readonly original?: string;
  readonly removed: boolean;
}

const FILTER_THRESHOLD = 8;
const compareTerms = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Signal model for protected terms; no store, DOM, or API dependencies. */
export class ProtectedTermsDraft {
  readonly #entries = signal<TermEntry[]>([]);
  #nextId = 0;

  readonly entries = this.#entries.asReadonly();
  readonly addDraft = signal('');
  readonly filter = signal('');
  readonly editingId = signal<number | null>(null);
  readonly editDraft = signal('');
  readonly addError = signal<string | null>(null);
  readonly editError = signal<string | null>(null);
  /** The row the view should scroll into sight after rendering. */
  readonly revealId = signal<number | null>(null);

  readonly sortedEntries = computed(() => [...this.#entries()].sort((a, b) => compareTerms(a.value, b.value)));
  readonly visibleEntries = computed(() => {
    const query = this.filter().trim().toLowerCase();
    if (!query) return this.sortedEntries();
    return this.sortedEntries().filter(
      (entry) => entry.value.toLowerCase().includes(query) || (entry.original?.toLowerCase().includes(query) ?? false),
    );
  });
  readonly termsToSave = computed(() =>
    normalizeProtectedTerms(
      this.sortedEntries()
        .filter((entry) => !entry.removed)
        .map((entry) => entry.value),
    ),
  );
  /** Active values in entry order. */
  readonly activeValues = computed(() =>
    this.#entries()
      .filter((entry) => !entry.removed)
      .map((entry) => entry.value),
  );
  readonly termCount = computed(() => this.termsToSave().length);
  readonly changeCount = computed(
    () =>
      this.#entries().filter((entry) => entry.removed || entry.original === undefined || entry.original !== entry.value)
        .length,
  );
  readonly hasChanges = computed(() => this.changeCount() > 0);
  readonly isEmpty = computed(() => this.#entries().length === 0);
  readonly showFilter = computed(() => this.#entries().length > FILTER_THRESHOLD);
  readonly isFiltering = computed(() => this.filter().trim().length > 0);
  readonly hasNoMatches = computed(() => !this.isEmpty() && this.isFiltering() && this.visibleEntries().length === 0);
  readonly canAdd = computed(() => this.addDraft().trim().length > 0);

  seed(terms: readonly string[]): void {
    this.#entries.set(
      normalizeProtectedTerms([...terms]).map((value) => ({
        id: this.#nextId++,
        value,
        original: value,
        removed: false,
      })),
    );
    this.revealId.set(null);
    this.editingId.set(null);
    this.addError.set(null);
    this.editError.set(null);
  }

  statusOf(entry: TermEntry): 'removed' | 'added' | 'edited' | 'unchanged' {
    if (entry.removed) return 'removed';
    if (entry.original === undefined) return 'added';
    return entry.original === entry.value ? 'unchanged' : 'edited';
  }

  /** Adds a value directly, restoring a row marked for removal when it matches. */
  addValue(value: string): void {
    const result = prepareProtectedTermAdd(this.activeValues(), value);
    if (result.kind === 'blank') return;
    const { term } = result;
    const existing = this.#entries().find((entry) => entry.value === term && !entry.removed);
    if (result.kind === 'duplicate' && existing) {
      this.addError.set(term);
      this.#revealTerm(existing.id, existing.value);
      return;
    }
    const removed = this.#entries().find((entry) => entry.value === term && entry.removed);
    if (removed) {
      this.restoreTerm(removed);
      this.addDraft.set('');
      this.addError.set(null);
      this.#revealTerm(removed.id, removed.value);
      return;
    }
    const id = this.#nextId++;
    this.#entries.update((entries) => [...entries, { id, value: term, removed: false }]);
    this.addDraft.set('');
    this.addError.set(null);
    this.#revealTerm(id, term);
  }

  addTerm(): void {
    this.addValue(this.addDraft());
  }
  onAddDraftChange(value: string): void {
    this.addDraft.set(value);
    this.addError.set(null);
  }

  removeTerm(entry: TermEntry): void {
    if (entry.original === undefined) {
      this.#entries.update((entries) => entries.filter((candidate) => candidate.id !== entry.id));
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
    const entry = this.#entries().find((candidate) => candidate.id === id);
    if (!entry) return;
    const [term] = normalizeProtectedTerms([this.editDraft()]);
    if (!term || term === entry.value) {
      this.cancelEdit();
      return;
    }
    if (this.#entries().some((candidate) => candidate.id !== id && candidate.value === term && !candidate.removed)) {
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
  revertAll(terms: readonly string[]): void {
    this.seed(terms);
    this.filter.set('');
  }
  clearFilter(): void {
    this.filter.set('');
  }

  #revealTerm(id: number, value: string): void {
    const query = this.filter().trim().toLowerCase();
    if (query && !value.toLowerCase().includes(query)) this.filter.set('');
    this.revealId.set(id);
  }
  #patch(id: number, patch: Partial<Omit<TermEntry, 'id'>>): void {
    this.#entries.update((entries) => entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }
}
