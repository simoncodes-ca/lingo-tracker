import type { DensityMode } from '../types/density-mode';

/** Density and locale filtering are one value, shared by both store features. */
export interface LocaleSelection {
  readonly densityMode: DensityMode;
  readonly selectedLocales: string[];
  readonly compactLocale: string | undefined;
  readonly compactLocaleManuallyChanged: boolean;
  readonly nonCompactSelectedLocales: string[];
}

export interface LocaleContext {
  readonly availableLocales: string[];
  readonly baseLocale: string;
}

/** Older preferences can omit fields or carry the retired medium density. */
export type SavedLocaleSelection = Partial<Omit<LocaleSelection, 'densityMode' | 'nonCompactSelectedLocales'>> & {
  readonly densityMode?: DensityMode | 'medium';
};

/** The component supplies the localized wording for this data. */
export type LocaleFilterLabel = { kind: 'all' } | { kind: 'locale'; locale: string } | { kind: 'count'; count: number };

/** The one default rule: base when available, else first available, else none. */
function defaultCompactLocale(ctx: LocaleContext): string | undefined {
  if (ctx.baseLocale && ctx.availableLocales.includes(ctx.baseLocale)) return ctx.baseLocale;
  return ctx.availableLocales.at(0);
}

export function selectLocales(
  sel: Pick<LocaleSelection, 'densityMode'>,
  locales: string[],
): Pick<Partial<LocaleSelection>, 'selectedLocales' | 'compactLocale' | 'compactLocaleManuallyChanged'> {
  if (sel.densityMode === 'compact') {
    return { selectedLocales: locales, compactLocale: locales.at(0), compactLocaleManuallyChanged: true };
  }
  return { selectedLocales: locales };
}

export function toggleLocale(
  sel: Pick<LocaleSelection, 'densityMode' | 'selectedLocales'>,
  locale: string,
): Pick<Partial<LocaleSelection>, 'selectedLocales' | 'compactLocale' | 'compactLocaleManuallyChanged'> {
  const locales = sel.selectedLocales.includes(locale)
    ? sel.selectedLocales.filter((selected) => selected !== locale)
    : [...sel.selectedLocales, locale];
  return selectLocales(sel, locales);
}

// These bulk actions historically change only the filter, even in compact mode.
export function selectAll(ctx: Pick<LocaleContext, 'availableLocales'>): Pick<LocaleSelection, 'selectedLocales'> {
  return { selectedLocales: [...ctx.availableLocales] };
}

export function clearAll(): Pick<LocaleSelection, 'selectedLocales'> {
  return { selectedLocales: [] };
}

export function setDensity(sel: LocaleSelection, mode: DensityMode, ctx: LocaleContext): Partial<LocaleSelection> {
  if (mode === sel.densityMode) return {};

  if (mode === 'compact') {
    const locale =
      sel.compactLocale && ctx.availableLocales.includes(sel.compactLocale)
        ? sel.compactLocale
        : defaultCompactLocale(ctx);
    return {
      densityMode: mode,
      nonCompactSelectedLocales: sel.selectedLocales,
      compactLocaleManuallyChanged: false,
      ...(locale ? { selectedLocales: [locale], compactLocale: locale } : {}),
    };
  }

  return {
    densityMode: mode,
    ...(sel.compactLocaleManuallyChanged || sel.nonCompactSelectedLocales.length === 0
      ? {}
      : { selectedLocales: sel.nonCompactSelectedLocales }),
    ...(sel.selectedLocales.length > 0 ? { compactLocale: sel.selectedLocales[0] } : {}),
  };
}

/** Restoration never overwrites the current session's full-selection memory. */
export function restoreLocaleSelection(
  saved: SavedLocaleSelection,
  ctx: LocaleContext,
): Omit<LocaleSelection, 'nonCompactSelectedLocales'> {
  const densityMode = saved.densityMode === 'full' ? 'full' : 'compact';
  let selectedLocales = (saved.selectedLocales ?? []).filter((locale) => ctx.availableLocales.includes(locale));
  if (densityMode === 'compact') {
    if (saved.compactLocale && ctx.availableLocales.includes(saved.compactLocale)) {
      selectedLocales = [saved.compactLocale];
    } else if (selectedLocales.length !== 1) {
      const locale = defaultCompactLocale(ctx);
      selectedLocales = locale ? [locale] : [];
    }
  }
  return {
    densityMode,
    selectedLocales,
    // Restoration keeps the remembered value, even if resolving the filter needed a fallback.
    compactLocale: saved.compactLocale,
    compactLocaleManuallyChanged: saved.compactLocaleManuallyChanged ?? false,
  };
}

export function compactDisplayLocale(selectedLocales: readonly string[], ctx: LocaleContext): string {
  const picked = selectedLocales.find((locale) => ctx.availableLocales.includes(locale));
  // Empty collections historically display the base string, although restoration selects nothing.
  return picked || (defaultCompactLocale(ctx) ?? ctx.baseLocale);
}

export function filterableLocales(ctx: LocaleContext): string[] {
  return ctx.availableLocales.filter((locale) => locale !== ctx.baseLocale);
}

export function filteredLocales(selectedLocales: readonly string[], ctx: LocaleContext): string[] {
  const base = ctx.baseLocale ? [ctx.baseLocale] : [];
  const targets =
    selectedLocales.length === 0
      ? filterableLocales(ctx)
      : selectedLocales.filter((locale) => locale !== ctx.baseLocale);
  return [...base, ...targets];
}

export function isShowingAllLocales(
  selectedLocales: readonly string[],
  ctx: Pick<LocaleContext, 'availableLocales'>,
): boolean {
  return selectedLocales.length === 0 || selectedLocales.length === ctx.availableLocales.length;
}

export function localeFilterLabel(
  sel: Pick<LocaleSelection, 'densityMode' | 'selectedLocales'>,
  ctx: LocaleContext,
): LocaleFilterLabel {
  if (sel.densityMode === 'compact') return { kind: 'locale', locale: compactDisplayLocale(sel.selectedLocales, ctx) };
  if (isShowingAllLocales(sel.selectedLocales, ctx)) return { kind: 'all' };
  if (sel.selectedLocales.length === 1) return { kind: 'locale', locale: sel.selectedLocales[0] };
  return { kind: 'count', count: sel.selectedLocales.length };
}
