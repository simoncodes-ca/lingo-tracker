import type { BundleDefinitionDto } from '@simoncodes-ca/data-transfer';
import type { BundleEntry } from './store/features/with-bundles.feature';

/**
 * Total locale chips a card shows, overflow chip included. Capped so every card keeps a
 * single chip row and rows of cards stay flush with each other.
 */
const MAX_LOCALE_CHIPS = 4;

/** A collection prepared for display: chips resolved, overflow already split off. */
export interface CollectionCardView {
  readonly name: string;
  readonly translationsFolder: string;
  readonly readOnly: boolean;
  readonly baseLocale: string | undefined;
  readonly visibleLocales: readonly string[];
  readonly overflowLocales: readonly string[];
}

/** A bundle prepared for its card: consumed collections resolved, locale count computed. */
export interface BundleCardView {
  readonly entry: BundleEntry;
  readonly collectionNames: readonly string[];
  readonly localeCount: number;
}

/** Effective collection settings supplied by the store. */
export interface CollectionCardEntry {
  readonly name: string;
  readonly config: {
    readonly translationsFolder: string;
    readonly readOnly?: boolean;
  };
  readonly locales: readonly string[];
  readonly baseLocale: string;
}

/** Put the base locale first, preserving the remaining locale order, and reserve an overflow chip. */
export function toCollectionCardView(item: CollectionCardEntry): CollectionCardView {
  const locales = item.locales;
  const base = item.baseLocale;
  const ordered = locales.includes(base) ? [base, ...locales.filter((l) => l !== base)] : [...locales];

  return {
    name: item.name,
    translationsFolder: item.config.translationsFolder,
    readOnly: item.config.readOnly === true,
    baseLocale: base,
    visibleLocales: ordered.length > MAX_LOCALE_CHIPS ? ordered.slice(0, MAX_LOCALE_CHIPS - 1) : ordered,
    overflowLocales: ordered.length > MAX_LOCALE_CHIPS ? ordered.slice(MAX_LOCALE_CHIPS - 1) : [],
  };
}

export function resolveCollectionNames(
  definition: BundleDefinitionDto,
  allCollections: readonly string[],
): readonly string[] {
  if (definition.collections === 'All') return allCollections;
  return definition.collections.map((collection) => collection.name);
}

/** Filter by name or folder and sort names with the manager's case-insensitive locale ordering. */
export function collectionCards(
  entries: readonly CollectionCardEntry[],
  filter: string,
): readonly CollectionCardView[] {
  const query = filter.trim().toLowerCase();
  return entries
    .filter(
      (item) =>
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        item.config.translationsFolder.toLowerCase().includes(query),
    )
    .map(toCollectionCardView)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** Keep bundle order and resolve All from every collection, including cards hidden by the filter. */
export function bundleCards(
  entries: readonly BundleEntry[],
  allCollections: readonly string[],
  globalLocales: readonly string[],
): readonly BundleCardView[] {
  return entries.map((entry) => ({
    entry,
    collectionNames: resolveCollectionNames(entry.definition, allCollections),
    localeCount: globalLocales.length,
  }));
}
