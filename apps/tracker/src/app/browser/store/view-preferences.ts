import { type LocaleContext, type LocaleSelection, restoreLocaleSelection } from './locale-selection';
import { preferenceFields as fields, type SavedViewPreferences, type ViewPreferences } from './view-preferences.types';

export type { ViewPreferences } from './view-preferences.types';
export type PreferenceState = ViewPreferences & Pick<LocaleSelection, 'nonCompactSelectedLocales'>;
export type PreferenceReaders = { [K in keyof ViewPreferences]: () => ViewPreferences[K] };

/** Plain values or field readers; readers let the store track only persisted preferences. */
export function snapshot(state: ViewPreferences | PreferenceReaders): ViewPreferences {
  return Object.fromEntries(
    Object.keys(fields).map((key) => {
      const field = state[key as keyof ViewPreferences];
      const value = typeof field === 'function' ? field() : field;
      return [key, Array.isArray(value) ? [...value] : value];
    }),
  ) as ViewPreferences;
}

/** Invalid fields are ignored independently. Locale rules normalize the valid saved subset. */
export function restore(saved: unknown, ctx: LocaleContext): Partial<PreferenceState> {
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return {};
  const valid = Object.fromEntries(
    Object.entries(fields).flatMap(([key, accepts]) => {
      const value: unknown = (saved as Record<string, unknown>)[key];
      return Object.hasOwn(saved, key) && accepts(value) ? [[key, value]] : [];
    }),
  ) as SavedViewPreferences;
  return { ...valid, ...restoreLocaleSelection(valid, ctx) };
}
