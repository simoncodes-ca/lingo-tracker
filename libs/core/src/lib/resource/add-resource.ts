import { normalizeTags, type TranslationStatus, translocoToICU } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { readProjectTerms, type TerminologyFindings } from '../config/project-terms';
import { ResourceAlreadyExistsError } from '../errors/lingo-tracker-error';
import { ensureDirectoryExists } from '../file-io/directory-operations';
import type { OpenTranslatorOptions } from '../translation/translator';
import {
  assertCollectionLocales,
  type ResourceTranslation,
  seedLocales,
  withTranslatorProblems,
} from './locale-seeding';
import { type OpenedResourceEntry, openResourceEntry } from './resource-entry';
import { type ResolvedResourcePaths, validateAndResolvePaths } from './resource-file-paths';
import { resolveMutationSink, type MutationSink, type MutationSinkOptions } from './resource-mutation';
import { assertTranslationStatus } from './translation-status-input';

type ResourceTranslationInput = Pick<ResourceTranslation, 'locale' | 'value'> & { readonly status?: TranslationStatus };

export interface AddResourceParams {
  /** Dot-delimited key, e.g., "apps.common.buttons.ok". */
  readonly key: string;
  /** Base locale value (the source text). */
  readonly baseValue: string;
  /** Optional context for translators. */
  readonly comment?: string;
  /** Optional tags (normalized before they are stored). */
  readonly tags?: readonly string[];
  /** Optional dot-delimited folder the key is placed under: the stored key is `targetFolder.key`. */
  readonly targetFolder?: string;
  /**
   * Translations the caller supplies. Each locale must be one of the collection's locales
   * (a value for the base locale is ignored). Target locales without one are seeded
   * (see {@link seedLocales}). An omitted status is inferred from the value.
   */
  readonly translations?: readonly ResourceTranslationInput[];
}

export type ExistingResourcePolicy = 'replace' | 'fail';

export interface AddResourceOptions extends OpenTranslatorOptions, MutationSinkOptions {
  /** What to do when the resolved key already holds an entry. Default: 'fail'. */
  readonly onExisting?: ExistingResourcePolicy;
}

export interface ResolvedResourceAdd {
  readonly params: AddResourceParams;
  readonly paths: ResolvedResourcePaths;
}

export interface AddResourceResult {
  /** The stored key (`targetFolder.key`). */
  readonly resolvedKey: string;
  /** False when an existing entry was replaced. */
  readonly created: boolean;
  /** Every translation written, supplied and seeded. */
  readonly translations: ResourceTranslation[];
  /** Locales the Translator skipped (see {@link seedLocales}). Present only when auto-translation ran. */
  readonly skippedLocales?: string[];
  /**
   * Advisory: discouraged terms in the stored base value, any rule-file problem that limited the
   * check, and, when auto-translation ran, a named protected-terms file that does not exist.
   */
  readonly terminology: TerminologyFindings;
}

export interface PreparedResourceAdd {
  readonly params: AddResourceParams;
  readonly paths: ResolvedResourcePaths;
  readonly baseValue: string;
  readonly translations: ResourceTranslationInput[];
  readonly skippedLocales?: string[];
  readonly terminology: TerminologyFindings;
}

/**
 * Adds a resource entry to a collection. With `onExisting: 'replace'`, an existing
 * entry's previous translations and metadata are dropped. Creates the folders it needs.
 *
 * Every target locale of the collection gets a value: the supplied translation, else an
 * auto-translation when the collection has it enabled, else a copy of the base value as
 * `new` (the Locale seeding rule, {@link seedLocales}). When a supplied translation
 * has no status, the Staleness rule infers `new` for a copy or `translated` otherwise.
 *
 * Values are normalized to ICU before they are stored. Nothing is written when the
 * translation provider fails. The stored base value is checked against the preferred
 * terminology (Project Terms) and the findings returned; they never block the add.
 *
 * @param options - Existence policy and optional `provider` / `protectedTerms` overrides (see `openTranslator`).
 * @throws {ResourceAlreadyExistsError} The resolved key already exists and the policy is `fail`.
 * @throws {InvalidResourceKeyError} The key or `targetFolder` is malformed.
 * @throws {LocaleNotFoundError} A supplied translation names a locale the collection does not have.
 * @throws {TranslationError} The translation provider failed.
 * @throws {ProtectedTermsFileError} Auto-translation runs and a protected-terms file is malformed.
 */
export async function addResource(
  collection: Collection,
  params: AddResourceParams,
  options: AddResourceOptions = {},
): Promise<AddResourceResult> {
  const onExisting = options.onExisting ?? 'fail';
  const resolved = resolveResourceAdd(collection, params, onExisting);
  return writePreparedResourceAdd(
    collection,
    await prepareResourceAdd(collection, resolved, options),
    onExisting,
    resolveMutationSink(collection, options),
  );
}

/** Validates an entry and checks its resolved key before translation or writes. */
export function resolveResourceAdd(
  collection: Collection,
  params: AddResourceParams,
  onExisting: ExistingResourcePolicy,
): ResolvedResourceAdd {
  const { translationsFolder } = collection;
  const paths = validateAndResolvePaths({ key: params.key, translationsFolder, targetFolder: params.targetFolder });
  assertCollectionLocales(
    collection,
    (params.translations ?? []).map(({ locale }) => locale),
  );
  for (const translation of params.translations ?? []) {
    if (translation.status !== undefined) assertTranslationStatus(translation.status);
  }
  const existed = openResourceEntry(collection, paths.resolvedKey).exists();
  if (existed && onExisting === 'fail') throw new ResourceAlreadyExistsError(paths.resolvedKey);
  return { params, paths };
}

/** Resolves translation work for an already checked entry before a batch writes. */
export async function prepareResourceAdd(
  collection: Collection,
  resolved: ResolvedResourceAdd,
  options: OpenTranslatorOptions = {},
): Promise<PreparedResourceAdd> {
  const { baseLocale } = collection;
  const { params, paths } = resolved;
  const supplied = (params.translations ?? []).filter(({ locale }) => locale !== baseLocale);

  const baseValue = translocoToICU(params.baseValue);
  // Resolve every value before touching the disk, so a provider failure writes nothing.
  const seeding = await seedLocales(collection, { baseValue, supplied: supplied.map(({ locale }) => locale) }, options);
  const translations: ResourceTranslationInput[] = [...supplied, ...seeding.translations];

  return {
    params,
    paths,
    baseValue,
    translations,
    ...(seeding.skippedLocales !== undefined && { skippedLocales: seeding.skippedLocales }),
    terminology: withTranslatorProblems(
      readProjectTerms(collection).checkBaseValue(paths.resolvedKey, baseValue),
      seeding.problems,
    ),
  };
}

function checkWriteConflict(entry: OpenedResourceEntry, onExisting: ExistingResourcePolicy): boolean {
  const created = !entry.exists();
  if (!created && onExisting === 'fail') throw new ResourceAlreadyExistsError(entry.resolvedKey);
  return created;
}

/** Checks a prepared entry again after translation, without writing. */
export function assertPreparedResourceCanWrite(
  collection: Collection,
  prepared: PreparedResourceAdd,
  onExisting: ExistingResourcePolicy,
): void {
  checkWriteConflict(openResourceEntry(collection, prepared.paths.resolvedKey), onExisting);
}

/** Stores an already prepared entry through the same Resource Folder path as a single add. */
export function writePreparedResourceAdd(
  collection: Collection,
  prepared: PreparedResourceAdd,
  onExisting: ExistingResourcePolicy,
  onMutation?: MutationSink,
): AddResourceResult {
  const { params, baseValue, translations } = prepared;
  const resource = openResourceEntry(collection, prepared.paths.resolvedKey);
  const { folder } = resource;
  const created = checkWriteConflict(resource, onExisting);
  ensureDirectoryExists({ directoryPath: folder.folderPath, errorContext: 'Creating resource folder' });

  // setEntry clears the entry in place, so an existing key keeps its position in the file.
  folder.setEntry(resource.entryKey, { source: baseValue }, {});
  folder.setBase(resource.entryKey, baseValue);
  folder.setDetails(resource.entryKey, {
    comment: params.comment || undefined,
    tags: normalizeTags([...(params.tags ?? [])]),
  });
  for (const { locale, value, status } of translations) {
    folder.setTranslation(resource.entryKey, locale, value, status);
  }
  const stored = folder.get(resource.entryKey);
  const storedTranslations: ResourceTranslation[] = translations.map((translation) => {
    const status = stored?.meta?.[translation.locale]?.status;
    if (status === undefined) throw new Error(`Missing status for locale "${translation.locale}"`);
    const value = stored?.entry[translation.locale];
    if (typeof value !== 'string') throw new Error(`Missing value for locale "${translation.locale}"`);
    return { locale: translation.locale, value, status };
  });
  resource.save(onMutation);

  return {
    resolvedKey: resource.resolvedKey,
    created,
    translations: storedTranslations,
    ...(prepared.skippedLocales !== undefined && { skippedLocales: prepared.skippedLocales }),
    terminology: prepared.terminology,
  };
}
