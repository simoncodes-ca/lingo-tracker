import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  effect,
  inject,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { CollectionsStore } from '../collections/store/collections.store';
import { apiErrorMessage } from '../shared/api-error/api-error';
import { NotificationService } from '../shared/notification';
import type { RuleField, RuleFieldError } from './preferred-terminology-draft';
import { SettingsDraft } from './settings-draft';

/** Translation token for each rule error code. */
const RULE_ERROR_TOKENS: Record<RuleFieldError['code'], string> = {
  empty: TRACKER_TOKENS.SETTINGS.PREFERREDTERMINOLOGY.ERROR.EMPTY,
  'invalid-character': TRACKER_TOKENS.SETTINGS.PREFERREDTERMINOLOGY.ERROR.INVALIDCHARACTER,
  'self-mapping': TRACKER_TOKENS.SETTINGS.PREFERREDTERMINOLOGY.ERROR.SELFMAPPING,
  duplicate: TRACKER_TOKENS.SETTINGS.PREFERREDTERMINOLOGY.ERROR.DUPLICATEX,
  chain: TRACKER_TOKENS.SETTINGS.PREFERREDTERMINOLOGY.ERROR.CHAINX,
  'contains-discouraged': TRACKER_TOKENS.SETTINGS.PREFERREDTERMINOLOGY.ERROR.CONTAINSDISCOURAGEDX,
  cycle: TRACKER_TOKENS.SETTINGS.PREFERREDTERMINOLOGY.ERROR.CYCLEX,
  'invalid-type': TRACKER_TOKENS.SETTINGS.PREFERREDTERMINOLOGY.ERROR.INVALIDTYPE,
};

/**
 * Settings view. Exposes the global protected-terms list and the preferred-terminology
 * rules, both written through `PUT /api/config`. Never exposes
 * collections/locales/baseLocale editing.
 *
 * Edits are staged: adds, renames and removals are held as pending row state and
 * only reach the API on Save, so every change is visible and reversible first. One
 * save bar covers both lists; a save sends only the lists that changed, so saving
 * protected terms never rewrites a terminology file that failed to load.
 *
 * Both lists seed from the first config to arrive and, after that, only from the answer
 * of the page's own save (a Config Write returns the config as it now is). A config the
 * store reloads for another reason never reseeds them, so an edit in progress is safe.
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
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);

  readonly TOKENS = TRACKER_TOKENS;

  private readonly editInputs = viewChildren<ElementRef<HTMLInputElement>>('editInput');
  private readonly termRows = viewChildren<ElementRef<HTMLElement>>('termRow');
  private readonly ruleInputs = viewChildren<ElementRef<HTMLInputElement>>('ruleInput');

  readonly draft = new SettingsDraft();
  readonly RULE_ERROR_TOKENS = RULE_ERROR_TOKENS;
  readonly preferredTerminologyFilePath = computed(() => this.store.config()?.preferredTerminologyFilePath);
  readonly preferredTerminologyError = computed(() => this.store.config()?.preferredTerminologyError);
  readonly preferredTerminologyWarning = computed(() => this.store.config()?.preferredTerminologyWarning);
  /** Rules with a discouraged term; a blank row just added is not a rule yet. */
  readonly ruleCount = computed(() => this.draft.terminology.rulesToSave().filter((rule) => rule.discouraged).length);
  /** Row whose discouraged input takes focus once rendered — a newly added rule, or the first invalid one. */
  readonly #focusRuleInput = signal<string | null>(null);

  /** Path of the file the terms are stored in, surfaced read-only so the source of a diff is obvious. */
  readonly protectedTermsFilePath = computed(() => this.store.config()?.protectedTermsFilePath);

  /** Why the last save was refused; cleared when the next save starts. */
  readonly saveError = signal<string | null>(null);
  readonly bannerError = computed(() => this.saveError() ?? this.store.error());
  readonly editingLocked = computed(() => this.store.config() === null || this.draft.saving());

  constructor() {
    // Seed both lists from the first config to arrive (App loads it on boot), then stop
    // watching: a save reseeds from its own answer, and a reload this page did not ask for
    // must not overwrite edits in progress.
    const seedOnce = effect(() => {
      const config = this.store.config();
      if (!config) return;
      untracked(() => this.draft.seed(config));
      seedOnce.destroy();
    });

    effect(() => {
      const target = this.#focusRuleInput();
      const input = this.ruleInputs().find((ref) => ref.nativeElement.id === target);
      if (target === null || !input) return;
      input.nativeElement.focus();
      this.#focusRuleInput.set(null);
    });

    effect(() => {
      const input = this.editInputs()[0];
      if (this.draft.terms.editingId() === null || !input) return;
      input.nativeElement.focus();
      input.nativeElement.select();
    });

    // The row may not be in the query yet when the id is set, so the target is
    // held — not cleared — until it is found. Clearing early is what made an
    // added term land silently below the fold of the scrolling list.
    effect(() => {
      const id = this.draft.terms.revealId();
      const rows = this.termRows();
      if (id === null) return;
      const row = rows.find((ref) => ref.nativeElement.getAttribute('data-term-id') === String(id));
      if (!row) return;
      // Optional call: not every environment implements scrollIntoView (jsdom does not).
      row.nativeElement.scrollIntoView?.({ block: 'nearest' });
      this.draft.terms.revealId.set(null);
    });
  }

  revertAll(): void {
    this.draft.revert(this.store.config());
  }

  /** DOM id of a rule input, shared by its label wiring, its error and focus requests. */
  ruleInputId(rowId: number, field: RuleField): string {
    return `settings-rule-${rowId}-${field}`;
  }

  ruleErrorId(rowId: number, field: RuleField): string {
    return `${this.ruleInputId(rowId, field)}-error`;
  }

  addRule(): void {
    const id = this.draft.terminology.addRow();
    this.#focusRuleInput.set(this.ruleInputId(id, 'discouraged'));
  }

  onRuleInput(rowId: number, field: RuleField, value: string): void {
    this.draft.terminology.updateField(rowId, field, value);
  }

  /** A save continues after navigation so its outcome toast still appears. */
  save(): void {
    this.draft
      .save((payload) => {
        this.saveError.set(null);
        return this.store.updateGlobalConfig(payload);
      })
      .subscribe((outcome) => {
        switch (outcome.kind) {
          case 'unchanged':
            return;
          case 'blocked':
            if (outcome.focus) this.#focusRuleInput.set(this.ruleInputId(outcome.focus.rowId, outcome.focus.field));
            return;
          case 'saved':
            this.#notifications.success(this.#transloco.translate(TRACKER_TOKENS.SETTINGS.SAVESUCCESS));
            return;
          case 'refused':
            this.saveError.set(
              apiErrorMessage(outcome.error, this.#transloco.translate(TRACKER_TOKENS.SETTINGS.SAVEFAILED)),
            );
            return;
        }
      });
  }
}
