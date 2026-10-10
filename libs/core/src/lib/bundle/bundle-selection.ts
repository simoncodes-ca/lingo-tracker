/**
 * Bundle Selection: which value each final key of a bundle gets for one locale, and where it came
 * from. The JSON bundle, the dry-run plan and the type file all select through here, so the
 * `'All'` expansion, the entry selection rules, `bundledKeyPrefix` and `mergeStrategy` live in one
 * place.
 */

import {
  type BundleDefinition,
  type CollectionBundleDefinition,
  type EntrySelectionRule,
  hasQuotedInterpolationDelimiter,
  hasUnbundlableBranchBody,
  icuToTransloco,
  validateICUSyntax,
} from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { type Collection, openCollection } from '../config/open-collection';
import { matchesPattern } from './pattern-matcher';
import {
  type BundleLocale,
  type CollectionReadCache,
  type FlatResource,
  loadCollectionResources,
} from './resource-loader';
import { matchesTags } from './tag-filter';

/** One collection a bundle reads: its selection settings paired with the opened collection. */
export interface BundleCollection {
  readonly definition: CollectionBundleDefinition;
  readonly collection: Collection;
}

export interface ResolvedBundleCollections {
  /** The collections to read, in definition order. */
  readonly collections: readonly BundleCollection[];
  /** One warning per collection the definition names but the config does not have. */
  readonly warnings: readonly string[];
}

/** Where a bundled value came from. */
export interface BundleEntryOrigin {
  readonly collectionName: string;
  /** The key in its collection, before `bundledKeyPrefix`. */
  readonly sourceKey: string;
}

export interface BundleEntry {
  readonly value: string;
  /** The resource whose value won (the first one, or the last `'override'` one). */
  readonly origin: BundleEntryOrigin;
}

export interface BundleSelection {
  /** Final (prefixed) key → value and winning origin, in the order keys were first selected. */
  readonly entries: ReadonlyMap<string, BundleEntry>;
  /** Final keys that more than one selected resource defines. */
  readonly conflicts: ReadonlySet<string>;
  /** Unreadable folders (first read of a run only) and ICU transformation warnings. */
  readonly warnings: readonly string[];
}

export interface SelectBundleEntriesOptions {
  /** Convert each value from ICU to Transloco syntax, warning on values that do not carry. */
  readonly transformICUToTransloco: boolean;
  /** The run's read cache, so every locale of a run reads each collection once. */
  readonly cache?: CollectionReadCache;
}

/**
 * Opens the collections a bundle definition reads, once per run. `'All'` means every collection in
 * the config with every entry and no prefix; a named collection the config lacks is left out and
 * reported in `warnings`.
 *
 * @param options.cwd Directory relative translations folders resolve against (default: `process.cwd()`).
 */
export function resolveBundleCollections(
  definition: BundleDefinition,
  config: LingoTrackerConfig,
  options: { readonly cwd?: string } = {},
): ResolvedBundleCollections {
  const configured = Object.keys(config.collections ?? {});
  const definitions: readonly CollectionBundleDefinition[] =
    definition.collections === 'All'
      ? configured.map((name) => ({ name, entriesSelectionRules: 'All' }))
      : definition.collections;

  const collections: BundleCollection[] = [];
  const warnings: string[] = [];
  for (const collectionDefinition of definitions) {
    if (!configured.includes(collectionDefinition.name)) {
      warnings.push(`Collection '${collectionDefinition.name}' not found in config`);
      continue;
    }
    const collection = openCollection(config, collectionDefinition.name, { cwd: options.cwd });
    collections.push({ definition: collectionDefinition, collection });
  }

  return { collections, warnings };
}

/**
 * Selects a bundle's entries for one locale. Each collection's entries are read for `locale` (its
 * own base locale reads `source`), filtered by its selection rules, prefixed, and merged in order:
 * the first value of a key wins unless a later collection's `mergeStrategy` is `'override'`.
 */
export function selectBundleEntries(
  collections: readonly BundleCollection[],
  locale: BundleLocale,
  options: SelectBundleEntriesOptions,
): BundleSelection {
  const entries = new Map<string, BundleEntry>();
  const conflicts = new Set<string>();
  const warnings: string[] = [];

  for (const { definition, collection } of collections) {
    const override = definition.mergeStrategy === 'override';

    for (const resource of loadCollectionResources(collection, locale, options.cache, warnings)) {
      if (!isSelected(resource, definition.entriesSelectionRules)) continue;

      const finalKey = definition.bundledKeyPrefix ? `${definition.bundledKeyPrefix}.${resource.key}` : resource.key;
      const value = options.transformICUToTransloco ? toTransloco(resource, warnings) : resource.value;

      if (entries.has(finalKey)) {
        conflicts.add(finalKey);
        if (!override) continue;
      }
      entries.set(finalKey, { value, origin: { collectionName: collection.name, sourceKey: resource.key } });
    }
  }

  return { entries, conflicts, warnings };
}

/** The selection as the flat key → value record the JSON bundle is built from. */
export function selectionValues(selection: BundleSelection): Record<string, string> {
  return Object.fromEntries(Array.from(selection.entries, ([key, entry]) => [key, entry.value]));
}

function isSelected(resource: FlatResource, rules: CollectionBundleDefinition['entriesSelectionRules']): boolean {
  return rules === 'All' || rules.some((rule) => matchesRule(resource, rule));
}

function matchesRule(resource: FlatResource, rule: EntrySelectionRule): boolean {
  const tags = resource.tags && resource.tags.length > 0 ? resource.tags : undefined;
  return (
    matchesPattern(resource.key, rule.matchingPattern) && matchesTags(tags, rule.matchingTags, rule.matchingTagOperator)
  );
}

function toTransloco(resource: FlatResource, warnings: string[]): string {
  if (resource.value.includes('{') && !validateICUSyntax(resource.value)) {
    warnings.push(`Key '${resource.key}': value has malformed ICU syntax and was included as-is`);
  }
  if (hasQuotedInterpolationDelimiter(resource.value)) {
    warnings.push(`Key '${resource.key}': quoted literal '{{' or '}}' will be consumed by Transloco interpolation`);
  }
  if (hasUnbundlableBranchBody(resource.value)) {
    warnings.push(
      `Key '${resource.key}': a branch body cannot be carried to a Transloco runtime, so the bundled ` +
        'value does not render as written. A branch body survives only as a plain parameter name — ' +
        'not an argument carrying a format, and not a run that is no parameter name. Give the branch ' +
        'body text beside the argument, or move the format out of the branch:\n' +
        '  {count, plural, =1 {{n, number} item} other {# items}}\n' +
        `  value: ${resource.value}`,
    );
  }
  return icuToTransloco(resource.value);
}
