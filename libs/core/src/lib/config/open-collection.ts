import { resolve } from 'node:path';
import { findCollectionEntry, inheritCollectionSettings, normalizeTags } from '@simoncodes-ca/domain';
import type { LingoTrackerCollection } from '../../config/lingo-tracker-collection';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import type { TranslationConfig } from '../../config/translation-config';
import { CollectionNotFoundError, ReadOnlyCollectionError } from '../errors/lingo-tracker-error';
import type { MutationSink } from '../resource/resource-mutation';
import { resolvePreferredTerminologyFile } from './preferred-terminology-file';
import { resolveCollectionProtectedTermsFilePath, resolveGlobalProtectedTermsFile } from './protected-terms-file';
import type { TermFile } from './term-file';

/**
 * A collection with every setting resolved: the collection's own value where it has one,
 * otherwise the global value, otherwise the default. Get one from {@link openCollection};
 * shared inheritance comes from domain's {@link inheritCollectionSettings}.
 */
export interface Collection {
  /** Default consumer of mutations from writes against this collection. */
  readonly onMutation?: MutationSink;
  readonly name: string;
  /** Absolute path of the collection's translations folder. */
  readonly translationsFolder: string;
  /** Non-empty collection `baseLocale`, else global `baseLocale`, else `'en'`. */
  readonly baseLocale: string;
  /** Non-empty collection `locales`, else global `locales`, else `[]`. May include the base locale. */
  readonly locales: readonly string[];
  /** {@link locales} without the base locale. */
  readonly targetLocales: readonly string[];
  /** Collection `translation`, else global `translation`. The two are not merged. */
  readonly translationConfig: TranslationConfig | undefined;
  /** Collection-level tags (normalized), inherited by every resource in the collection. */
  readonly tags: readonly string[];
  /**
   * Where the collection's Project Terms live (absolute paths, resolved but not read). Read them
   * with `readProjectTerms`; opening a collection does no file I/O.
   */
  readonly termFiles: TermFiles;
  readonly readOnly: boolean;
  /** The collection's raw config entry, for settings not modelled here. */
  readonly config: LingoTrackerCollection;
}

/** A project opened from its config, carrying the read version used to guard every config write. */
export interface OpenedProject {
  readonly sourceConfig: LingoTrackerConfig;
  readonly projectRoot: string;
}

/** An opened collection is an opened project plus the resolved collection. */
export interface OpenedCollection extends Collection, OpenedProject {}

/** The term files in force for a collection (see `readProjectTerms`). */
export interface TermFiles {
  /** The global protected-terms file: `protectedTermsFile` from the config, else the default file beside it. */
  readonly protectedTerms: TermFile;
  /** The collection's own protected-terms file, when it names one. */
  readonly collectionProtectedTerms?: TermFile;
  /** The preferred-terminology file: one per project, which a collection cannot override. */
  readonly preferredTerminology: TermFile;
}

export interface OpenCollectionOptions {
  /**
   * Directory a relative `translationsFolder` or protected-terms file pointer resolves against
   * (the directory holding `.lingo-tracker.json`). Default: `process.cwd()`.
   */
  readonly cwd?: string;
  /** Refuse a read-only collection. Set this for operations that change resources. */
  readonly writable?: boolean;
  /** Default consumer for writes; an operation can override it with its own callback. */
  readonly onMutation?: MutationSink;
  /**
   * Open a collection for deletion only. A missing or non-string `translationsFolder` becomes
   * an empty path; other malformed fields are still resolved normally and may fail.
   */
  readonly forDeletion?: boolean;
}

/**
 * Resolves a collection's effective settings from the config.
 *
 * @throws {CollectionNotFoundError} The config has no collection with this name.
 * @throws {ReadOnlyCollectionError} `writable` is set and the collection is read-only.
 */
export function openCollection(
  config: LingoTrackerConfig,
  name: string,
  options: OpenCollectionOptions = {},
): OpenedCollection {
  const raw = findCollectionEntry(config.collections, name);
  if (!raw) {
    throw new CollectionNotFoundError(name);
  }

  const { baseLocale, locales, translation, readOnly } = inheritCollectionSettings(raw, config);
  if (options.writable && readOnly) {
    throw new ReadOnlyCollectionError(name);
  }

  const { cwd = process.cwd(), onMutation } = options;
  const collectionTermsPath = resolveCollectionProtectedTermsFilePath(raw, cwd);

  return {
    name,
    onMutation,
    sourceConfig: config,
    projectRoot: cwd,
    translationsFolder:
      options.forDeletion && typeof raw.translationsFolder !== 'string' ? '' : resolve(cwd, raw.translationsFolder),
    baseLocale,
    locales,
    targetLocales: locales.filter((locale) => locale !== baseLocale),
    translationConfig: translation,
    tags: normalizeTags(raw.tags ?? []),
    termFiles: {
      protectedTerms: resolveGlobalProtectedTermsFile(config, cwd),
      ...(collectionTermsPath !== undefined && {
        collectionProtectedTerms: { path: collectionTermsPath, explicit: true },
      }),
      preferredTerminology: resolvePreferredTerminologyFile(config, cwd),
    },
    readOnly,
    config: raw,
  };
}
