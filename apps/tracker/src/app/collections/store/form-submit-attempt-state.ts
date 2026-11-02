import { signal } from '@angular/core';
import type { AbstractControl } from '@angular/forms';
import type { Subscription } from 'rxjs';

/** When a form shows a control's error: after it was touched, or also once edited or submitted. */
export type ErrorReveal = 'touched' | 'touched-dirty-attempted';

export interface FormAttemptStateConfig {
  /** Defaults to `'touched'`. */
  reveal?: ErrorReveal;
  /** Defaults to any status but invalid, so a pending form passes. */
  accepts?: (form: AbstractControl) => boolean;
}

/** Attempt, error reveal and refusal state shared by named writes and job starts. */
export class FormAttemptState {
  readonly #attempted = signal(false);
  readonly #errors = signal<readonly string[]>([]);
  readonly attempted = this.#attempted.asReadonly();
  readonly errors = this.#errors.asReadonly();

  constructor(private readonly config: FormAttemptStateConfig = {}) {}

  /** Records the attempt. True when the form may be submitted; otherwise marks every field so its error shows. */
  check(form: AbstractControl): boolean {
    this.#attempted.set(true);
    if (this.config.accepts ? this.config.accepts(form) : !form.invalid) return true;
    form.markAllAsTouched();
    return false;
  }

  /** Whether the form shows this control's errors yet. */
  reveals(control: AbstractControl): boolean {
    if (control.touched) return true;
    return this.config.reveal === 'touched-dirty-attempted' && (control.dirty || this.#attempted());
  }

  showError(control: AbstractControl, error?: string): boolean {
    if (!this.reveals(control)) return false;
    return error ? control.hasError(error) : control.invalid;
  }

  fail(messages: readonly string[]): void {
    this.#errors.set(messages);
  }

  clear(): void {
    this.#errors.set([]);
  }

  /** Clears the messages whenever `form` changes; the caller releases the subscription. */
  clearOnEdit(form: AbstractControl): Subscription {
    return form.valueChanges.subscribe(() => this.clear());
  }
}
