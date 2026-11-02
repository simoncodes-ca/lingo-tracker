import { computed, type Signal, signal } from '@angular/core';
import type { FormControl } from '@angular/forms';
import type { LingoTrackerConfigDto, ResourceSummaryDto, SearchResultDto } from '@simoncodes-ca/data-transfer';
import {
  applyPreferredTerm,
  DEFAULT_APP_RUNTIME,
  findPreferredTermFindings,
  type IcuConstructKind,
  type PreferredTermRule,
  translocoToICU,
  unrenderableIcuConstructs,
} from '@simoncodes-ca/domain';
import { type Observable, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import type { SimilarSuggestion } from '../../services/similar-values';

/** Typing pause before preferred-terminology findings refresh; matches the similar search. */
export const PREFERRED_TERM_DEBOUNCE_MS = 300;

/** Advice derived from configuration and search results; no form or DOM dependency. */
export class EditorAdvisories {
  readonly #baseValueText = signal('');
  readonly baseValueText = this.#baseValueText.asReadonly();
  readonly #checkedValue = signal('');
  readonly #similarResources = signal<SearchResultDto[]>([]);
  readonly similarResources = this.#similarResources.asReadonly();
  readonly #isSearchingSimilar = signal(false);
  readonly isSearchingSimilar = this.#isSearchingSimilar.asReadonly();
  readonly #subscriptions = new Subscription();

  readonly preferredTermFindings = computed(() => {
    const config = this.config();
    const rules = config && !config.preferredTerminologyError ? (config.preferredTerminology ?? []) : [];
    const value = this.#checkedValue();
    return rules.length > 0 && value ? findPreferredTermFindings(value, rules) : [];
  });

  /** ICU constructs plain Transloco cannot render; always empty under the default runtime. */
  readonly unrenderableConstructs = computed(() => this.unrenderableConstructsOf(this.#checkedValue()));

  /** The same check for any other value (as Core stores it, after Transloco-to-ICU conversion), such as a locale's translation. Reads the config signal. */
  unrenderableConstructsOf(value: string): readonly IcuConstructKind[] {
    return unrenderableIcuConstructs(translocoToICU(value), this.config()?.runtime ?? DEFAULT_APP_RUNTIME);
  }

  readonly exactMatch = computed(() => exactSimilarMatch(this.baseValueText(), this.similarResources()));

  constructor(private readonly config: Signal<LingoTrackerConfigDto | null>) {}

  /** Owns the immediate typed value, delayed terminology check, and similar-search state. */
  observe(
    initialValue: string,
    baseValueChanges: Observable<string>,
    similarSuggestions: Observable<SimilarSuggestion>,
  ): void {
    this.#checkedValue.set(initialValue);
    this.#subscriptions.add(baseValueChanges.subscribe((value) => this.#baseValueText.set(value)));
    this.#subscriptions.add(
      baseValueChanges
        .pipe(debounceTime(PREFERRED_TERM_DEBOUNCE_MS))
        .subscribe((value) => this.#checkedValue.set(value)),
    );
    this.#subscriptions.add(similarSuggestions.subscribe((suggestion) => this.#acceptSimilar(suggestion)));
  }

  #acceptSimilar(suggestion: SimilarSuggestion): void {
    if (suggestion.kind === 'clear') this.#similarResources.set([]);
    if (suggestion.kind === 'ready') this.#similarResources.set(suggestion.results);
    if (suggestion.kind === 'clear' && !suggestion.searching) this.#isSearchingSimilar.set(false);
    if (suggestion.kind === 'loading') this.#isSearchingSimilar.set(true);
    if (suggestion.kind === 'ready') this.#isSearchingSimilar.set(false);
  }

  /** Rewrites through the normal value-change path and removes the finding at once. */
  applyTerm(control: FormControl<string>, rule: PreferredTermRule): void {
    const next = applyPreferredTerm(control.value, rule);
    if (next !== control.value) {
      control.markAsDirty();
      control.setValue(next);
    }
    this.#checkedValue.set(next);
  }

  destroy(): void {
    this.#subscriptions.unsubscribe();
  }
}

/** Tags used in the current collection, sorted and narrowed by the entry and typed text. */
export function suggestTags(input: {
  entries: Signal<readonly ResourceSummaryDto[]>;
  inputText: Signal<string>;
  tags: Signal<readonly string[]>;
  inheritedTags: Signal<readonly string[]>;
}): Signal<string[]> {
  const suggestions = computed(() => [...new Set(input.entries().flatMap((resource) => resource.tags))].sort());
  return computed(() =>
    filteredEditorTagSuggestions(input.inputText(), input.tags(), input.inheritedTags(), suggestions()),
  );
}

export function exactSimilarMatch(value: string, results: readonly SearchResultDto[]): SearchResultDto | undefined {
  const typed = value.trim().toLowerCase();
  return typed ? results.find((result) => result.base.value.trim().toLowerCase() === typed) : undefined;
}

export function filteredEditorTagSuggestions(
  inputText: string,
  tags: readonly string[],
  inheritedTags: readonly string[],
  suggestions: readonly string[],
): string[] {
  const input = inputText.toLowerCase();
  const existing = new Set([...tags, ...inheritedTags]);
  return suggestions.filter((tag) => !existing.has(tag) && (input === '' || tag.includes(input)));
}
