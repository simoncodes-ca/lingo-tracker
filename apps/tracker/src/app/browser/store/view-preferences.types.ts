import { isTranslationStatus, type TranslationStatus } from '@simoncodes-ca/domain';
import type { SortDirection, SortField } from '../translations/utils/sort-translations';
import type { DensityMode } from '../types/density-mode';

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const boolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** The sole persisted field list also defines the preference type and validates old data. */
export const preferenceFields = {
  densityMode: (value: unknown): value is DensityMode | 'medium' =>
    value === 'compact' || value === 'full' || value === 'medium',
  selectedLocales: strings,
  showNestedResources: boolean,
  compactLocale: (value: unknown): value is string | undefined => value === undefined || typeof value === 'string',
  compactLocaleManuallyChanged: boolean,
  sortField: (value: unknown): value is SortField => value === 'key' || value === 'status',
  sortDirection: (value: unknown): value is SortDirection => value === 'asc' || value === 'desc',
  selectedStatuses: (value: unknown): value is TranslationStatus[] =>
    Array.isArray(value) && value.every(isTranslationStatus),
};

type GuardValue<T> = T extends (value: unknown) => value is infer V ? V : never;
type PreferenceValues = { [K in keyof typeof preferenceFields]: GuardValue<(typeof preferenceFields)[K]> };
export type SavedViewPreferences = Partial<PreferenceValues>;
export type ViewPreferences = Omit<PreferenceValues, 'densityMode'> & { densityMode: DensityMode };
