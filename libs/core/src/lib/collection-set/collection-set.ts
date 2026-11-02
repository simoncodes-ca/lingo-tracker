import type { TranslationStatus } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { CollectionBaseLocaleMismatchError } from '../errors/lingo-tracker-error';
import type { CollectionFolderProblem } from '../resource/collection-folders';
import { readCollection } from '../resource/read-collection';

/** One entry from a whole-collection read, with its origin and stored locale data. */
export interface CollectionSetResource {
  key: string;
  fullKey: string;
  source: string;
  translations: Record<string, string>;
  tags?: string[];
  effectiveTags: readonly string[];
  comment?: string;
  status: Record<string, TranslationStatus>;
  collection: string;
  /** Export: the one winning locale. Validation: own targets minus skips.
   * Glossary: own targets by default, or explicit locales minus the base (duplicates retained). */
  targetLocales: readonly string[];
}

export interface CollectionSetReadProblem {
  kind: CollectionFolderProblem['kind'];
  collection: string;
  folderPath: string;
  message: string;
}

export interface CollectionSet {
  /** First collection's base locale, or undefined when empty. Validation uses each collection's own base locale. */
  baseLocale: string | undefined;
  targetLocales: string[];
  resources: CollectionSetResource[];
  readProblems: CollectionSetReadProblem[];
}

/** Only the options meaningful to the selected whole-collection intent are accepted. */
export type CollectionSetOptions =
  | { scope: 'validation'; skippedLocales?: readonly string[]; locales?: never; onBeforeRead?: never }
  | {
      scope: 'export';
      skippedLocales?: never;
      locales?: readonly string[];
      /** Called with resolved targets before reading folders or checking base agreement. */
      onBeforeRead?: (targetLocales: readonly string[]) => void;
    }
  | { scope: 'glossary'; locales?: readonly string[]; skippedLocales?: never; onBeforeRead?: never };

interface ScopedCollectionSet {
  baseLocale: string | undefined;
  targetLocales: string[];
  /** Resolved once, including collections with no resources. */
  localesByCollection: ReadonlyMap<Collection, readonly string[]>;
  /** Deferred until preconditions and term-file reads are complete; subsequent calls reuse the read. */
  read(): CollectionSet;
}

export interface ValidationCollectionSet extends ScopedCollectionSet {
  scope: 'validation';
  outcome: 'ready' | 'no-collections' | 'no-targets' | 'all-skipped';
  skippedLocales: string[];
  warnings: string[];
}

const scopePolicies = {
  validation: { collisions: 'retain', baseLocales: 'independent', emptyTargets: 'read' },
  export: { collisions: 'last-per-target', baseLocales: 'agree', emptyTargets: 'skip' },
  glossary: { collisions: 'retain', baseLocales: 'agree', emptyTargets: 'read' },
} as const;

/** The export scope's ordered configured targets, narrowed to requested locales. */
export function collectionSetTargetLocales(
  collections: readonly Collection[],
  requested?: readonly string[],
): string[] {
  const configured = [...new Set(collections.flatMap((collection) => collection.targetLocales))];
  return configured.filter((locale) => !requested || requested.includes(locale));
}

/** Resolve once, returning the scope and its deferred collection read together. */
export function readCollectionSet(
  collections: readonly Collection[],
  options: Extract<CollectionSetOptions, { scope: 'validation' }>,
): ValidationCollectionSet;
export function readCollectionSet(
  collections: readonly Collection[],
  options: Exclude<CollectionSetOptions, { scope: 'validation' }>,
): ScopedCollectionSet;
export function readCollectionSet(
  collections: readonly Collection[],
  options: CollectionSetOptions,
): ValidationCollectionSet | ScopedCollectionSet {
  const baseLocale = collections[0]?.baseLocale;
  const targetLocales =
    options.scope === 'glossary' && options.locales
      ? options.locales.filter((locale) => locale !== baseLocale)
      : collectionSetTargetLocales(collections, options.scope === 'validation' ? undefined : options.locales);
  const skippedLocales: string[] = [];
  const warnings: string[] = [];
  if (options.scope === 'validation' && collections.length > 0 && targetLocales.length > 0) {
    const baseLocales = new Set(collections.map((collection) => collection.baseLocale));
    for (const locale of options.skippedLocales ?? []) {
      if (targetLocales.includes(locale)) skippedLocales.push(locale);
      else if (!baseLocales.has(locale))
        warnings.push(`Skipping unknown locale '${locale}' — not in configured locales`);
    }
  }
  const localesByCollection = new Map(
    collections.map((collection) => [
      collection,
      options.scope === 'glossary' && options.locales
        ? targetLocales
        : options.scope === 'validation'
          ? collection.targetLocales.filter((locale) => !skippedLocales.includes(locale))
          : collection.targetLocales,
    ]),
  );
  let read: CollectionSet | undefined;
  const resolved: ScopedCollectionSet = {
    baseLocale,
    targetLocales,
    localesByCollection,
    read: () => {
      read ??= readScopedCollections(collections, options, resolved);
      return read;
    },
  };
  if (options.scope !== 'validation') return resolved;
  return {
    ...resolved,
    scope: 'validation',
    outcome:
      collections.length === 0
        ? 'no-collections'
        : targetLocales.length === 0
          ? 'no-targets'
          : targetLocales.every((locale) => skippedLocales.includes(locale))
            ? 'all-skipped'
            : 'ready',
    skippedLocales,
    warnings,
  };
}

/** A locale without metadata is untracked and counts as new for status checks. */
export function collectionResourceStatus(resource: CollectionSetResource, locale: string): TranslationStatus {
  return resource.status[locale] ?? 'new';
}

/** Apply the already resolved scope without resolving locales again. */
function readScopedCollections(
  collections: readonly Collection[],
  options: CollectionSetOptions,
  resolved: ScopedCollectionSet,
): CollectionSet {
  const policy = scopePolicies[options.scope];
  const { baseLocale, targetLocales } = resolved;
  if (options.scope === 'export' && targetLocales.length > 0) options.onBeforeRead?.(targetLocales);
  if (targetLocales.length === 0 && policy.emptyTargets === 'skip') {
    return { baseLocale, targetLocales, resources: [], readProblems: [] };
  }
  if (policy.baseLocales === 'agree' && collections.some((collection) => collection.baseLocale !== baseLocale)) {
    throw new CollectionBaseLocaleMismatchError(collections.map(({ name, baseLocale }) => ({ name, baseLocale })));
  }
  const resources: CollectionSetResource[] = [];
  const readProblems: CollectionSetReadProblem[] = [];

  for (const collection of collections) {
    const read = readCollection(collection);
    readProblems.push(
      ...read.problems.map((problem) => ({
        kind: problem.kind,
        collection: collection.name,
        folderPath: problem.folderPath,
        message: problem.message,
      })),
    );
    for (const { fullKey, entryKey, entry, effectiveTags } of read.resources) {
      const status: Record<string, TranslationStatus> = {};
      for (const [locale, metadata] of Object.entries(entry.metadata)) {
        if (metadata?.status) status[locale] = metadata.status;
      }
      resources.push({
        key: entryKey,
        fullKey,
        source: entry.source,
        translations: { ...entry.translations },
        tags: entry.tags,
        effectiveTags,
        comment: entry.comment,
        status,
        collection: collection.name,
        targetLocales: resolved.localesByCollection.get(collection) ?? [],
      });
    }
  }

  // Export collisions are resolved before status/tag filtering, separately for each target.
  // Map replacement keeps the position of the first occurrence, as the export run has always done.
  const selected =
    policy.collisions === 'last-per-target'
      ? targetLocales.flatMap((locale) =>
          [
            ...new Map(
              collections
                .filter((collection) => collection.targetLocales.includes(locale))
                .flatMap((collection) => resources.filter((resource) => resource.collection === collection.name))
                .map((resource) => [resource.fullKey, resource]),
            ).values(),
          ].map((resource) => ({ ...resource, targetLocales: [locale] })),
        )
      : resources;
  return { baseLocale, targetLocales, resources: selected, readProblems };
}
