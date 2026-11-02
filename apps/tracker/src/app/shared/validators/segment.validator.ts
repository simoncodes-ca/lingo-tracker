import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidSegment } from '@simoncodes-ca/domain';

/**
 * One segment of a dot-delimited key, by the domain's rule (`isValidSegment`):
 * letters, digits, `_` and `-`.
 *
 * It reports under `pattern`, the key `Validators.pattern` used, so error
 * messages keyed on it keep working. Like `Validators.pattern`, it leaves an
 * empty value to `Validators.required`.
 */
export const segmentValidator: ValidatorFn = (control: AbstractControl<unknown>): ValidationErrors | null => {
  const value = control.value;
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  return isValidSegment(value) ? null : { pattern: { actualValue: value } };
};
