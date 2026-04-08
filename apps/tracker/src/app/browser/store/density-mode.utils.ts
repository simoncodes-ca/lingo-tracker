import type { DensityMode } from '../types/density-mode';

export interface DensityModeTransition {
  readonly selectedLocales: string[];
  readonly compactLocale: string | null;
  readonly compactLocaleManuallyChanged: boolean;
  readonly nonCompactSelectedLocales: string[];
}

export interface DensityModeContext {
  readonly currentDensityMode: DensityMode;
  readonly currentSelectedLocales: string[];
  readonly availableLocales: string[];
  readonly baseLocale: string;
  readonly compactLocale: string | null;
  readonly compactLocaleManuallyChanged: boolean;
  readonly nonCompactSelectedLocales: string[];
}

/**
 * Computes the new locale selection state when switching density modes.
 *
 * Compact mode enforces a single-locale display. Switching to compact saves the
 * current multi-locale selection and picks a single locale. Switching away from
 * compact restores the previously saved multi-locale selection (unless the user
 * manually changed the locale while in compact mode).
 */
export function computeDensityModeTransition(
  targetMode: DensityMode,
  context: DensityModeContext,
): DensityModeTransition {
  const isEnteringCompact = targetMode === 'compact';
  const isLeavingCompact = context.currentDensityMode === 'compact' && !isEnteringCompact;

  let selectedLocales = context.currentSelectedLocales;
  let compactLocale = context.compactLocale;
  let compactLocaleManuallyChanged = context.compactLocaleManuallyChanged;
  let nonCompactSelectedLocales = context.nonCompactSelectedLocales;

  if (isEnteringCompact) {
    nonCompactSelectedLocales = context.currentSelectedLocales;
    compactLocaleManuallyChanged = false;

    if (compactLocale && context.availableLocales.includes(compactLocale)) {
      selectedLocales = [compactLocale];
    } else if (context.currentSelectedLocales.length > 0) {
      selectedLocales = [context.currentSelectedLocales[0]];
      compactLocale = context.currentSelectedLocales[0];
    } else {
      const fallback =
        context.baseLocale && context.availableLocales.includes(context.baseLocale)
          ? context.baseLocale
          : (context.availableLocales[0] ?? null);

      if (fallback) {
        selectedLocales = [fallback];
        compactLocale = fallback;
      }
    }
  } else if (isLeavingCompact) {
    if (context.compactLocaleManuallyChanged) {
      selectedLocales = context.currentSelectedLocales;
    } else if (context.nonCompactSelectedLocales.length > 0) {
      selectedLocales = context.nonCompactSelectedLocales;
    }

    if (context.currentSelectedLocales.length > 0) {
      compactLocale = context.currentSelectedLocales[0];
    }
  }

  return { selectedLocales, compactLocale, compactLocaleManuallyChanged, nonCompactSelectedLocales };
}

/**
 * Resolves a single locale to display in compact mode from a saved preference and available options.
 * Used during collection initialization when restoring view preferences.
 */
export function resolveCompactLocale(options: {
  readonly savedCompactLocale: string | null;
  readonly currentSelectedLocales: string[];
  readonly availableLocales: string[];
  readonly baseLocale: string;
}): string[] {
  const { savedCompactLocale, currentSelectedLocales, availableLocales, baseLocale } = options;

  if (savedCompactLocale && availableLocales.includes(savedCompactLocale)) {
    return [savedCompactLocale];
  }

  if (currentSelectedLocales.length === 0) {
    if (baseLocale && availableLocales.includes(baseLocale)) return [baseLocale];
    if (availableLocales.length > 0) return [availableLocales[0]];
    return [];
  }

  if (currentSelectedLocales.length > 1) {
    return [currentSelectedLocales[0]];
  }

  return currentSelectedLocales;
}
