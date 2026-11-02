import type { AbstractControl, ValidationErrors } from '@angular/forms';
import type { Signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import {
  type NamedEntryRefusal,
  NamedEntrySubmit,
  type NamedEntrySubmitConfig,
  type NamedEntryWrite,
} from './dialog-config-submit';
import { FormAttemptState, type FormAttemptStateConfig } from './form-submit-attempt-state';
export type { ErrorReveal, FormAttemptStateConfig } from './form-submit-attempt-state';

/** What a form renders for a refusal that did not belong to the name field. */
export type MessageRefusal = Extract<NamedEntryRefusal, { kind: 'message' }>;

/** The server's own rule messages when it sent any, else its one message. */
export function detailsElseMessage(refusal: MessageRefusal): readonly string[] {
  const details = refusal.details.filter((item): item is string => typeof item === 'string');
  return details.length > 0 ? details : [refusal.message];
}

export interface FormSubmitAttemptConfig<TResult extends { name: string }>
  extends NamedEntrySubmitConfig,
    FormAttemptStateConfig {
  entry: { mode: 'create' | 'edit'; name?: string };
  /** Validates (via `check`), confirms and builds the result once; `undefined` aborts the attempt. */
  prepare: () => TResult | undefined | Promise<TResult | undefined>;
  /** Maps a refusal to the messages the form lists; defaults to the refusal's one message. */
  refusalMessages?: (refusal: MessageRefusal) => readonly string[];
  /** Runs when the server refused the editable name as taken; the name field already shows it. */
  onNameConflict?: () => void;
}

/** Named-entry attempt state composed with the dialog write lifecycle. */
export class FormSubmitAttempt<TResult extends { name: string }> {
  readonly #config: FormSubmitAttemptConfig<TResult>;
  readonly #state: FormAttemptState;
  readonly #entrySubmit: NamedEntrySubmit<TResult>;
  readonly attempted: Signal<boolean>;
  readonly errors: Signal<readonly string[]>;
  readonly saving: Signal<boolean>;
  readonly nameValidator: (control: AbstractControl) => ValidationErrors | null;

  constructor(config: FormSubmitAttemptConfig<TResult>) {
    this.#config = config;
    this.#state = new FormAttemptState(config);
    this.#entrySubmit = new NamedEntrySubmit(config);
    this.attempted = this.#state.attempted;
    this.errors = this.#state.errors;
    this.saving = this.#entrySubmit.saving;
    this.nameValidator = this.#entrySubmit.nameValidator;
  }

  check(form: AbstractControl): boolean {
    return this.#state.check(form);
  }
  reveals(control: AbstractControl): boolean {
    return this.#state.reveals(control);
  }
  showError(control: AbstractControl, error?: string): boolean {
    return this.#state.showError(control, error);
  }
  fail(messages: readonly string[]): void {
    this.#state.fail(messages);
  }
  clear(): void {
    this.#state.clear();
  }
  clearOnEdit(form: AbstractControl): Subscription {
    return this.#state.clearOnEdit(form);
  }

  /** Ignored while a write is in flight. */
  submit(options: NamedEntryWrite<TResult>): Promise<void> {
    const { entry, prepare, refusalMessages, onNameConflict } = this.#config;
    return this.#entrySubmit.submit({
      ...options,
      entry,
      prepare,
      onRefusal: (refusal) => {
        if (refusal.kind === 'name-conflict') onNameConflict?.();
        else this.fail(refusalMessages ? refusalMessages(refusal) : [refusal.message]);
      },
    });
  }
}
