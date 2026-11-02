import type { AbstractControl, ValidationErrors } from '@angular/forms';

/** Like `Validators.required`, but a whitespace-only string also reports the `required` error. */
export function nonBlankValidator(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}
