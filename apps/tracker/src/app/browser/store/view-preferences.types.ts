import type { TranslationStatus } from '@simoncodes-ca/data-transfer';
import type { DensityMode } from '../types/density-mode';

export interface ViewPreferences {
  densityMode: DensityMode;
  selectedLocales: string[];
  showNestedResources: boolean;
  compactLocale: string | null;
  compactLocaleManuallyChanged: boolean;
  sortField: 'key' | 'status';
  sortDirection: 'asc' | 'desc';
  selectedStatuses: TranslationStatus[];
}
