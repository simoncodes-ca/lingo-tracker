import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { type AppRuntime, checkStoredValue, DEFAULT_APP_RUNTIME, icuParseOptionsFor } from '@simoncodes-ca/domain';

/**
 * Rejects a Transloco interpolation inside literal braces, `{{{name}}}`, which
 * the save would collapse to `{name}`. The domain decides what counts
 * (`checkStoredValue`); a case body that is only a placeholder is fine.
 *
 * It reports the first finding as `{ name, position }`, the position being the
 * outer opening brace. Like `Validators.required`'s partner validators, it
 * leaves an empty value to `Validators.required`.
 */
export function bracedPlaceholderValidator(
  control: AbstractControl<unknown>,
  runtime: AppRuntime = DEFAULT_APP_RUNTIME,
): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const first = checkStoredValue(value, icuParseOptionsFor(runtime)).find(
    (finding) => finding.kind === 'braced-placeholder',
  );
  return first ? { bracedPlaceholder: { name: first.name, position: first.range.start } } : null;
}
