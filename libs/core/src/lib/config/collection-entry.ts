import { isUnderNodeModules, normalizeTags } from '@simoncodes-ca/domain';
import type { LingoTrackerCollection } from '../../config/lingo-tracker-collection';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { DEFAULT_CONFIG } from '../../constants';
import {
  CollectionAlreadyExistsError,
  CollectionNotFoundError,
  InvalidCollectionError,
} from '../errors/lingo-tracker-error';
import { resolveRenameTarget } from './entry-name';

/**
 * Collection Entry: the one place that decides what a collection's record in
 * `.lingo-tracker.json` contains. Every writer of a collection record (`addCollection`,
 * `updateCollection`, `editCollectionTags`, project-term pointer changes) builds the new config through
 * these pure functions and then writes it once.
 *
 * The stored record is minimal: `translationsFolder` plus only the settings that differ
 * from the global config, so a collection inherits by omission. `STORE` holds the rule for
 * every field, keyed by the type, so a field added to `LingoTrackerCollection` does not
 * compile until its rule is written here.
 *
 * An existing record is changed by patch: a key the patch sets (to anything but `undefined`)
 * replaces the stored value; a key left out, or set to `undefined`, keeps it. A setting is
 * cleared with its empty value (`tags: []`, `readOnly: false`, `locales: []`, `''` for
 * `exportFolder`, `importFolder`, `baseLocale` and `protectedTermsFile`), which the field rule
 * then drops from the record, so the collection inherits the global setting. `translation` has no
 * empty value (a `TranslationConfig` needs `enabled`, `provider` and `apiKeyEnv`), so a patch can
 * replace the override but not clear it. `null` is never a value: a field set to `null` throws
 * `InvalidCollectionError`. So a caller that edits one setting never has to know, or carry over,
 * the others.
 */

/** What to store for one field, or `undefined` to leave it out of the record. */
type StoreRule<K extends keyof LingoTrackerCollection> = (
  value: LingoTrackerCollection[K],
  config: LingoTrackerConfig,
) => LingoTrackerCollection[K] | undefined;

/** Keep the value only when it is set, not blank (`''` clears the override), and differs from the global one. */
function unlessGlobal<K extends 'exportFolder' | 'importFolder' | 'baseLocale'>(key: K): StoreRule<K> {
  return (value, config) =>
    value !== undefined && value.trim() !== '' && value !== (config[key] || DEFAULT_CONFIG[key]) ? value : undefined;
}

function sameLocales(a: readonly string[], b: readonly string[] | undefined): boolean {
  return b !== undefined && a.length === b.length && a.every((locale, i) => locale === b[i]);
}

const STORE: { [K in keyof Required<LingoTrackerCollection>]: StoreRule<K> } = {
  // Required and already validated by toCollectionEntry; listed so the table covers every key of the type.
  translationsFolder: (value) => value.trim(),
  exportFolder: unlessGlobal('exportFolder'),
  importFolder: unlessGlobal('importFolder'),
  baseLocale: unlessGlobal('baseLocale'),
  // An empty list means "inherit" (openCollection falls back to the global list only when the key is
  // absent). Order matters to callers (the first locale is the default), so lists are compared as sequences.
  locales: (value, config) =>
    value !== undefined && value.length > 0 && !sameLocales(value, config.locales ?? DEFAULT_CONFIG.locales)
      ? value
      : undefined,
  // A per-collection override replaces the global block; it is never merged with or diffed against it.
  translation: (value) => value,
  // Stored only when set, so writable collections stay clean.
  readOnly: (value) => (value ? true : undefined),
  tags: (value) => {
    const normalized = normalizeTags(value ?? []);
    return normalized.length > 0 ? normalized : undefined;
  },
  protectedTermsFile: (value) => value?.trim() || undefined,
};

/**
 * The record to store for `collection`: `translationsFolder` (trimmed) plus every field
 * whose rule keeps it. Pure.
 *
 * @throws {InvalidCollectionError} `translationsFolder` is missing or blank, or a field is `null`.
 */
export function toCollectionEntry(
  config: LingoTrackerConfig,
  collection: LingoTrackerCollection,
): LingoTrackerCollection {
  assertCollectionFields(collection);
  const translationsFolder = collection.translationsFolder?.trim();
  if (!translationsFolder) {
    throw new InvalidCollectionError('translationsFolder is required');
  }

  const entry: LingoTrackerCollection = { translationsFolder };
  const keep = <K extends keyof LingoTrackerCollection>(key: K): void => {
    const stored = STORE[key](collection[key], config);
    if (stored !== undefined) {
      entry[key] = stored;
    }
  };
  for (const key of Object.keys(STORE) as Array<keyof LingoTrackerCollection>) {
    keep(key);
  }
  return entry;
}

/**
 * The config with `collection` registered under `name`. A collection whose folder is under
 * `node_modules` is read-only unless the caller says otherwise. Pure.
 *
 * @throws {CollectionAlreadyExistsError} A collection named `name` exists.
 * @throws {InvalidCollectionError} `translationsFolder` is missing or blank.
 */
export function addCollectionEntry(
  config: LingoTrackerConfig,
  name: string,
  collection: LingoTrackerCollection,
): LingoTrackerConfig {
  if (hasCollection(config, name)) {
    throw new CollectionAlreadyExistsError(name);
  }

  const entry = toCollectionEntry(config, collection);
  if (collection.readOnly === undefined && isUnderNodeModules(entry.translationsFolder)) {
    entry.readOnly = true;
  }
  return { ...config, collections: { ...config.collections, [name]: entry } };
}

/**
 * The config with the collection `name` changed by `patch`, and moved to `newName` when that
 * is given and differs. Patch semantics: a key `patch` sets replaces the stored value (so
 * `tags: []`, `readOnly: false`, `locales: []`, or `''` for `exportFolder`, `importFolder`,
 * `baseLocale` or `protectedTermsFile` clear a setting; `translation` cannot be cleared),
 * and a key left out or set to `undefined` keeps it. The merged record is then rebuilt by the
 * field rules, so a value that now equals the global one is stored as inherited. Pure.
 *
 * @throws {CollectionNotFoundError} No collection named `name`.
 * @throws {CollectionAlreadyExistsError} A collection named `newName` exists.
 * @throws {InvalidNameError} The supplied new name is blank after trimming.
 * @throws {InvalidCollectionError} The merged `translationsFolder` is missing or blank, or a field is `null`.
 */
export function patchCollectionEntry(
  config: LingoTrackerConfig,
  name: string,
  patch: Partial<LingoTrackerCollection>,
  newName?: string,
): LingoTrackerConfig {
  if (!hasCollection(config, name)) {
    throw new CollectionNotFoundError(name);
  }

  const targetName = newName === undefined ? name : resolveRenameTarget(name, newName).target;
  if (targetName !== name && hasCollection(config, targetName)) {
    throw new CollectionAlreadyExistsError(targetName);
  }

  assertCollectionFields(patch);
  const stored = config.collections?.[name];
  const merged: LingoTrackerCollection = { ...stored };
  for (const key of Object.keys(patch) as Array<keyof LingoTrackerCollection>) {
    setDefined(merged, key, patch[key]);
  }
  const entry = toCollectionEntry(config, merged);
  // Rebuild in the same order, so a rename keeps the collection's place in the file.
  const collections = Object.fromEntries(
    Object.entries(config.collections ?? {}).map(([key, value]) => (key === name ? [targetName, entry] : [key, value])),
  );
  return { ...config, collections };
}

/** Assigns `value` to `target[key]` unless it is `undefined` (typed per key, so the two agree). */
function setDefined<K extends keyof LingoTrackerCollection>(
  target: LingoTrackerCollection,
  key: K,
  value: LingoTrackerCollection[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function hasCollection(config: LingoTrackerConfig, name: string): boolean {
  // Own keys only: a name like 'constructor' must not resolve to an Object.prototype member.
  return Object.keys(config.collections ?? {}).includes(name);
}

/** Reject JSON-only values before defaults or patch merging can hide them. */
export function assertCollectionFields(
  collection: object,
  options: { readonly requireTranslationsFolder?: boolean } = {},
): void {
  const fields = Object.entries(collection);
  const nullField = fields.find(([, value]) => value === null)?.[0];
  if (nullField !== undefined) {
    throw new InvalidCollectionError(`${nullField} must not be null`, { field: nullField });
  }
  const folder = fields.find(([key]) => key === 'translationsFolder')?.[1];
  if (typeof folder !== 'string' && (options.requireTranslationsFolder || folder !== undefined)) {
    throw new InvalidCollectionError('translationsFolder must be a string', { field: 'translationsFolder' });
  }
}
