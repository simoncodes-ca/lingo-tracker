import type { AppRuntime } from './app-runtime';
import { toRuntimeValue, toStoredIcu } from './runtime-conversion';

/** Returns the bundled Transloco form if the ICU round trip changes more than interpolation whitespace. */
export function bundledFormIfLost(value: string, runtime: AppRuntime): string | undefined {
  const bundled = toRuntimeValue(toStoredIcu(value, runtime), runtime);
  return normalizeInterpolationWhitespace(bundled) === normalizeInterpolationWhitespace(value) ? undefined : bundled;
}

function normalizeInterpolationWhitespace(value: string): string {
  return value.replace(/\{\{\s*([^}]*?)\s*\}\}/g, '{{$1}}');
}
