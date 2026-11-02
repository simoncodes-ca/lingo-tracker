import type { CollectionSettings } from '../../collections/store/collection-settings';
import type { DensityMode } from '../types/density-mode';

/**
 * Root state for signals shared across multiple features.
 * Cross-cutting state lives here to avoid circular type dependencies between features:
 * - collectionSettings, and its projections selectedCollection, availableLocales, baseLocale,
 *   isReadOnly: the open collection's settings, written only by the Browser Session
 *   (`with-browser-session.feature.ts`)
 * - sessionId: bumped by every `openCollection`; loaders capture it (`session-guard.ts`) and drop
 *   a response that arrives after another collection was opened
 * - currentFolderPath: the folder the list shows, or returns to after a search; written only by the
 *   List Scope (`with-list-scope.feature.ts`)
 * - densityMode, compactLocale, compactLocaleManuallyChanged, nonCompactSelectedLocales:
 *   together with the filter's selectedLocales, the pure Locale Selection (`locale-selection.ts`).
 *   withFilterFeature reads its projections and writes locale transitions;
 *   withViewPreferencesFeature writes density/restoration transitions and persists preferences.
 */
export interface RootState {
  sessionId: number;
  /** The open collection's resolved settings: the one source the browser reads them from. */
  collectionSettings: CollectionSettings | null;
  selectedCollection: string | null;
  availableLocales: string[];
  baseLocale: string;
  /**
   * True when the active collection is read-only. Persistent for the lifetime of the
   * selected collection — kept apart from the transient `isDisabled` (a search is shown
   * or a move is in flight, derived in `browser.store.ts`) so it is never accidentally cleared.
   */
  isReadOnly: boolean;
  error: string | null;
  currentFolderPath: string;
  densityMode: DensityMode;
  compactLocale: string | undefined;
  compactLocaleManuallyChanged: boolean;
  nonCompactSelectedLocales: string[];
}

export const initialRootState: RootState = {
  sessionId: 0,
  collectionSettings: null,
  selectedCollection: null,
  availableLocales: [],
  baseLocale: '',
  isReadOnly: false,
  error: null,
  currentFolderPath: '',
  densityMode: 'compact',
  compactLocale: undefined,
  compactLocaleManuallyChanged: false,
  nonCompactSelectedLocales: [],
};
