import { computed, signal } from '@angular/core';
import type { LingoTrackerConfigDto, PreferredTermRuleErrorDto } from '@simoncodes-ca/data-transfer';
import { catchError, defer, map, type Observable, of } from 'rxjs';
import { classifyConfigRefusal } from '../collections/store/config-write';
import { ProtectedTermsDraft } from '../shared/protected-terms/protected-terms-draft';
import { PreferredTerminologyDraft, type RuleField } from './preferred-terminology-draft';

export type SettingsLists = Pick<LingoTrackerConfigDto, 'protectedTerms' | 'preferredTerminology'>;
type SettingsPayload = Partial<SettingsLists>;

export type SettingsSaveOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'blocked'; readonly focus?: { readonly rowId: number; readonly field: RuleField } }
  | { readonly kind: 'refused'; readonly error: unknown }
  | { readonly kind: 'unchanged' };

/** Staged settings lists and their one Config Write. The page supplies the write and renders the outcome. */
export class SettingsDraft {
  readonly terms = new ProtectedTermsDraft();
  readonly terminology = new PreferredTerminologyDraft();
  readonly #saving = signal(false);
  readonly saving = this.#saving.asReadonly();
  readonly #seeded = signal(false);
  readonly totalChangeCount = computed(() => this.terms.changeCount() + this.terminology.changeCount());
  readonly hasChanges = computed(() => this.totalChangeCount() > 0);
  readonly showSaveBar = computed(() => !this.terms.isEmpty() || !this.terminology.isEmpty() || this.hasChanges());
  /** Hidden errors are revealed by Save; visible errors disable it. */
  readonly canSave = computed(
    () => this.hasChanges() && this.#seeded() && !this.saving() && !this.terminology.hasVisibleErrors(),
  );

  seed(config: SettingsLists): void {
    this.terms.seed(config.protectedTerms ?? []);
    this.terminology.seed(config.preferredTerminology ?? []);
    this.#seeded.set(true);
  }

  revert(config: SettingsLists | null): void {
    if (config) this.seed(config);
    this.terms.filter.set('');
  }

  save(write: (payload: SettingsPayload) => Observable<SettingsLists | null>): Observable<SettingsSaveOutcome> {
    return defer(() => {
      if (!this.hasChanges()) return of({ kind: 'unchanged' } as const);
      if (this.terminology.hasChanges() && this.terminology.hasErrors()) {
        this.terminology.revealErrors();
        for (const view of this.terminology.rowViews()) {
          const field = (['discouraged', 'preferred', 'reason'] as const).find((candidate) => view.errors[candidate]);
          if (field) return of({ kind: 'blocked', focus: { rowId: view.row.id, field } } as const);
        }
        return of({ kind: 'blocked' } as const);
      }

      this.terms.cancelEdit();
      this.#saving.set(true);
      const sent: SettingsLists = {
        protectedTerms: this.terms.termsToSave(),
        preferredTerminology: this.terminology.rulesToSave(),
      };
      const payload: SettingsPayload = {
        ...(this.terms.hasChanges() && { protectedTerms: sent.protectedTerms }),
        ...(this.terminology.hasChanges() && { preferredTerminology: this.terminology.beginSave() }),
      };
      return write(payload).pipe(
        map((config): SettingsSaveOutcome => {
          const saved = config ?? sent;
          this.seed(saved);
          this.#saving.set(false);
          return { kind: 'saved' };
        }),
        catchError((error: unknown) => {
          const ruleErrors = extractRuleErrors(error);
          if (ruleErrors.length > 0) this.terminology.applyServerErrors(ruleErrors);
          this.#saving.set(false);
          return of({ kind: 'refused', error } as const);
        }),
      );
    });
  }
}

/** Validate an API detail before assigning it to a rule row. */
export function isPreferredTermRuleErrorDto(value: unknown): value is PreferredTermRuleErrorDto {
  if (typeof value !== 'object' || value === null) return false;
  const { index, field, code, message } = value as Record<string, unknown>;
  return (
    typeof index === 'number' && typeof field === 'string' && typeof code === 'string' && typeof message === 'string'
  );
}

export function extractRuleErrors(error: unknown): PreferredTermRuleErrorDto[] {
  const refusal = classifyConfigRefusal(error);
  return refusal.kind === 'invalid' ? refusal.details.filter(isPreferredTermRuleErrorDto) : [];
}
