import { computed, signal } from '@angular/core';
import {
  findPreferredTermFindings,
  normalizePreferredTermRules,
  type PreferredTermRule,
  type PreferredTermRuleError,
  validatePreferredTermRules,
} from '@simoncodes-ca/domain';

export type RuleField = 'discouraged' | 'preferred' | 'reason';

const RULE_FIELDS: readonly RuleField[] = ['discouraged', 'preferred', 'reason'];

/**
 * One editable rule row. `original` is the rule as last saved — absent for a row added in
 * this session. `touched` holds the fields the user has typed in or left, so a blank new
 * row does not open with "Required" under every input.
 */
export interface RuleRow {
  readonly id: number;
  readonly discouraged: string;
  readonly preferred: string;
  readonly reason: string;
  readonly original?: PreferredTermRule;
  readonly touched: ReadonlySet<RuleField>;
}

/** An error ready to render: the code picks the message, `params` fill it. */
export interface RuleFieldError {
  readonly code: PreferredTermRuleError['code'];
  readonly params: Readonly<Record<string, string>>;
}

/** A row plus the errors currently shown under each of its fields. */
export interface RuleRowView {
  readonly row: RuleRow;
  /** 1-based position, used in screen-reader labels. */
  readonly position: number;
  readonly status: 'added' | 'edited' | 'unchanged';
  readonly errors: Readonly<Partial<Record<RuleField, RuleFieldError>>>;
}

/**
 * Staged edits to the preferred-terminology list, validated live with the same domain
 * check the server runs.
 *
 * A pure signal model, owned by the Settings view, so the page-level save bar can combine
 * it with the protected-terms edits. Nothing here talks to the API.
 *
 * Error visibility: an error on a field shows once that field is touched, once the row
 * came from the file (an untouched saved row only errors because another row changed),
 * or once a save was attempted. Server errors are always shown until their field is edited.
 */
export class PreferredTerminologyDraft {
  readonly #rows = signal<RuleRow[]>([]);
  readonly #baseline = signal<PreferredTermRule[]>([]);
  readonly #submitAttempted = signal(false);
  /** Server errors keyed by row id; a field's entry is dropped when that field is edited. */
  readonly #serverErrors = signal<ReadonlyMap<number, readonly PreferredTermRuleError[]>>(new Map());
  /** Row ids in the order they were last submitted, so server error indexes map back to rows. */
  #submittedIds: number[] = [];
  #nextId = 0;

  readonly rows = this.#rows.asReadonly();

  /** Every client-side error, keyed by row id. */
  readonly #clientErrors = computed(() => {
    const rows = this.#rows();
    const byRow = new Map<number, PreferredTermRuleError[]>();
    for (const error of validatePreferredTermRules(rows.map(toRule))) {
      const row = rows[error.index];
      if (!row) continue;
      byRow.set(row.id, [...(byRow.get(row.id) ?? []), error]);
    }
    return byRow;
  });

  readonly hasErrors = computed(() => this.#clientErrors().size > 0 || this.#serverErrors().size > 0);

  readonly rowViews = computed<RuleRowView[]>(() => {
    const rows = this.#rows();
    const clientErrors = this.#clientErrors();
    const serverErrors = this.#serverErrors();
    const submitAttempted = this.#submitAttempted();

    return rows.map((row, index) => {
      const errors: Partial<Record<RuleField, RuleFieldError>> = {};
      const visible = (field: RuleField) => submitAttempted || row.original !== undefined || row.touched.has(field);

      for (const error of clientErrors.get(row.id) ?? []) {
        const field = error.field === 'rule' ? 'discouraged' : error.field;
        if (!errors[field] && visible(field)) errors[field] = describe(error, row, rows);
      }
      for (const error of serverErrors.get(row.id) ?? []) {
        const field = error.field === 'rule' ? 'discouraged' : error.field;
        if (!errors[field]) errors[field] = describe(error, row, rows);
      }

      return { row, position: index + 1, status: statusOf(row), errors };
    });
  });

  readonly hasVisibleErrors = computed(() =>
    this.rowViews().some((view) => RULE_FIELDS.some((field) => view.errors[field] !== undefined)),
  );

  /** The list a save would send: every row, trimmed, in display order. The server sorts on write. */
  readonly rulesToSave = computed(() => normalizePreferredTermRules(this.#rows().map(toRule)));

  /** Rows the file would gain, lose or change. A blank added row counts: saving it must be refused visibly. */
  readonly changeCount = computed(() => {
    const rows = this.#rows();
    const kept = rows.filter((row) => row.original !== undefined).length;
    const removed = this.#baseline().length - kept;
    return removed + rows.filter((row) => statusOf(row) !== 'unchanged').length;
  });

  readonly hasChanges = computed(() => this.changeCount() > 0);
  readonly isEmpty = computed(() => this.#rows().length === 0);

  /** Replaces every row with `rules` as the new saved baseline, dropping all edits and errors. */
  seed(rules: readonly PreferredTermRule[]): void {
    const baseline = normalizePreferredTermRules(rules);
    this.#baseline.set(baseline);
    this.#rows.set(
      baseline.map((rule) => ({
        id: this.#nextId++,
        discouraged: rule.discouraged,
        preferred: rule.preferred,
        reason: rule.reason ?? '',
        original: rule,
        touched: new Set<RuleField>(),
      })),
    );
    this.#submitAttempted.set(false);
    this.#serverErrors.set(new Map());
    this.#submittedIds = [];
  }

  /** Restores the last saved list. */
  revert(): void {
    this.seed(this.#baseline());
  }

  /** Appends a blank row and returns its id. */
  addRow(): number {
    const id = this.#nextId++;
    this.#rows.update((rows) => [
      ...rows,
      { id, discouraged: '', preferred: '', reason: '', touched: new Set<RuleField>() },
    ]);
    return id;
  }

  removeRow(id: number): void {
    this.#rows.update((rows) => rows.filter((row) => row.id !== id));
    this.#dropServerErrors(id);
  }

  updateField(id: number, field: RuleField, value: string): void {
    this.#rows.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value, touched: withField(row.touched, field) } : row)),
    );
    this.#dropServerErrors(id, field);
  }

  /** Marks a field as visited (on blur), so leaving a required field empty shows its error. */
  touch(id: number, field: RuleField): void {
    const row = this.#rows().find((candidate) => candidate.id === id);
    if (!row || row.touched.has(field)) return;
    this.#rows.update((rows) =>
      rows.map((candidate) =>
        candidate.id === id ? { ...candidate, touched: withField(candidate.touched, field) } : candidate,
      ),
    );
  }

  /** Shows every error, including those on untouched fields. Called when a save is refused. */
  revealErrors(): void {
    this.#submitAttempted.set(true);
  }

  /** Records which row each submitted index belongs to and returns the payload. */
  beginSave(): PreferredTermRule[] {
    this.#submittedIds = this.#rows().map((row) => row.id);
    return this.rulesToSave();
  }

  /** Attaches server errors to the rows that were submitted at those indexes. */
  applyServerErrors(errors: readonly PreferredTermRuleError[]): void {
    const byRow = new Map<number, PreferredTermRuleError[]>();
    for (const error of errors) {
      const id = this.#submittedIds[error.index];
      if (id === undefined || !this.#rows().some((row) => row.id === id)) continue;
      byRow.set(id, [...(byRow.get(id) ?? []), error]);
    }
    this.#serverErrors.set(byRow);
    this.#submitAttempted.set(true);
  }

  #dropServerErrors(id: number, field?: RuleField): void {
    const current = this.#serverErrors().get(id);
    if (!current) return;
    const remaining = field ? current.filter((error) => error.field !== field && error.field !== 'rule') : [];
    const next = new Map(this.#serverErrors());
    if (remaining.length > 0) next.set(id, remaining);
    else next.delete(id);
    this.#serverErrors.set(next);
  }
}

function toRule(row: RuleRow): PreferredTermRule {
  return { discouraged: row.discouraged, preferred: row.preferred, reason: row.reason };
}

function withField(touched: ReadonlySet<RuleField>, field: RuleField): ReadonlySet<RuleField> {
  return touched.has(field) ? touched : new Set([...touched, field]);
}

function statusOf(row: RuleRow): RuleRowView['status'] {
  const { original } = row;
  if (!original) return 'added';
  const [current] = normalizePreferredTermRules([toRule(row)]);
  const same =
    current?.discouraged === original.discouraged &&
    current.preferred === original.preferred &&
    current.reason === original.reason;
  return same ? 'unchanged' : 'edited';
}

const fold = (term: string) => term.trim().toLowerCase();

/**
 * Turns a domain error into a translatable code plus parameters. The domain's own
 * messages are English and cite row numbers; the UI names the terms instead, which
 * reads better next to the field and needs no row numbering.
 */
function describe(error: PreferredTermRuleError, row: RuleRow, rows: readonly RuleRow[]): RuleFieldError {
  switch (error.code) {
    case 'duplicate':
      return { code: error.code, params: { term: row.discouraged.trim() } };
    case 'chain': {
      const target = rows.find((candidate) => fold(candidate.discouraged) === fold(row.preferred));
      return { code: error.code, params: { term: row.preferred.trim(), preferred: target?.preferred.trim() ?? '' } };
    }
    case 'contains-discouraged': {
      const others = rows
        .filter((candidate) => candidate.discouraged.trim() && candidate.preferred.trim())
        .map(toRule)
        .map((rule) => ({ ...rule, discouraged: rule.discouraged.trim() }));
      const [finding] = findPreferredTermFindings(row.preferred, others);
      return { code: error.code, params: { term: finding?.rule.discouraged ?? row.discouraged.trim() } };
    }
    case 'cycle':
      return { code: error.code, params: { term: row.discouraged.trim() } };
    default:
      return { code: error.code, params: {} };
  }
}
