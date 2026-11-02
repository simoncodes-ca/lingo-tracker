import {
  type AppRuntime,
  admitValue,
  icuParseOptionsFor,
  isUntranslatedCopy,
  needsTranslation,
  normalizeTags,
  type TranslationInput,
  type TranslationStatus,
  translocoToICU,
} from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { readProjectTerms, type TerminologyFinding, type TerminologyFindings } from '../config/project-terms';
import {
  BracedPlaceholderError,
  CoreOperationError,
  FolderNotFoundError,
  InvalidBaseValueError,
  InvalidCollectionFolderError,
  ResourceAlreadyExistsError,
  ResourceNotFoundError,
} from '../errors/lingo-tracker-error';
import { ensureDirectoryExists } from '../file-io/directory-operations';
import type { OpenTranslatorOptions } from '../machine-translation/translator';
import { snapshotTranslation, writeBackTranslations } from '../translation/translation-write-back';
import {
  assertCollectionLocales,
  type ResourceTranslation,
  seedLocales,
  withTranslatorProblems,
} from './locale-seeding';
import { planMove } from './move-plan';
import { relocateEntries } from './relocate-entries';
import { type ResolvedResourcePaths, resolveResolvedResourcePaths, resolveResourcePaths } from './resource-file-paths';
import { openResourceFolder, type ResourceFolder, resourceFolderPresence } from './resource-folder';
import { resolveCheckedResourceKey } from './resource-key';
import type { ResourceTreeEntry } from './resource-tree-types';
import { assertTranslationStatus } from './translation-status-input';

/** Entry shapes and operation contracts. */
interface LocatedEntry {
  readonly resolvedKey: string;
  readonly entryKey: string;
  readonly folder: ResourceFolder;
}

/**
 * Represents a single translation resource entry.
 * This is stored in resource_entries.json at each folder level.
 */
export interface ResourceEntry {
  /** Base locale value (required) */
  source: string;
  /** Optional context to aid translators */
  comment?: string;
  /** Optional comma-separated tags for filtering/exporting */
  tags?: string[];
  /** Additional translated values keyed by locale (e.g., "fr-ca", "es") */
  [locale: string]: string | string[] | undefined;
}

/**
 * All resource entries at a given folder level.
 * Key is the final segment of the resource key.
 */
export interface ResourceEntries {
  [key: string]: ResourceEntry;
}

interface ResourceEntryRemoval {
  readonly resolvedKey: string;
  /** Collect at operation end, then call pruneEmptiedFolders once. */
  readonly emptied?: string;
}

interface EntryAddChanges {
  /** Base locale value (the source text). */
  readonly baseValue: string;
  /** Optional context for translators. */
  readonly comment?: string;
  /** Optional tags (normalized before they are stored). */
  readonly tags?: readonly string[];
  /**
   * Translations the caller supplies. Each locale must be one of the collection's locales
   * (a value for the base locale is ignored). Target locales without one are seeded
   * (see {@link seedLocales}). An omitted status is inferred from the value.
   */
  readonly translations?: readonly TranslationInput[];
}

export type ExistingResourcePolicy = 'replace' | 'fail';

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

/** What to change on an entry. `undefined` leaves a field alone. */
export interface EditResourceChanges {
  /** New base value. When it changes, the Staleness rule and Locale seeding run (see {@link editResource}). */
  readonly baseValue?: string;
  readonly comment?: string;
  /** Replaces the tags; an empty list removes them. */
  readonly tags?: readonly string[];
  /** Translations by locale. An omitted status is inferred when the value changes. A base-locale value is ignored. */
  readonly translations?: Readonly<Record<string, { readonly value: string; readonly status?: TranslationStatus }>>;
  /**
   * Destination folder (dot-delimited; `''` for the collection root). The entry keeps its
   * entry key (the last key segment) and moves there, with its values, metadata and edits.
   */
  readonly moveTo?: string;
}

export interface EditResourceResult {
  /** Problems pruning the source folder after a completed move. */
  readonly warnings?: string[];
  /** The entry's key after the edit: the destination key when it moved. */
  readonly resolvedKey: string;
  readonly updated: boolean;
  readonly message?: string;
  readonly entry?: ResourceTreeEntry;
  /**
   * Locales the Translator skipped (see {@link seedLocales}), or whose value changed on disk
   * during the provider call. Present only when auto-translation ran.
   */
  readonly skippedLocales?: string[];
  /**
   * Advisory: discouraged terms in the base value, any rule-file problem that limited the check,
   * and, when auto-translation ran, a named protected-terms file that does not exist. Present
   * only when the edit supplied a base value and updated the entry; editing a comment or a
   * translation does not re-raise advice about untouched wording.
   */
  readonly terminology?: TerminologyFindings;
}

interface EntryEditResult extends EditResourceResult {
  readonly entry: ResourceTreeEntry;
}

type EntryWriteOptions = OpenTranslatorOptions;

export interface AddResourceParams extends EntryAddChanges {
  /** Dot-delimited key, e.g., "apps.common.buttons.ok". */
  readonly key: string;
  /** The stored key is targetFolder.key. */
  readonly targetFolder?: string;
}

export interface AddResourceOptions extends EntryWriteOptions {
  readonly onExisting?: ExistingResourcePolicy;
}

export type EditResourceOptions = EntryWriteOptions;

export interface AddResourcesResult {
  readonly entriesCreated: number;
  readonly created: boolean;
  readonly skippedLocales: string[];
  readonly terminology: TerminologyFindings;
}

interface AddPreflight {
  readonly collection: Collection;
  readonly resolvedKey: string;
  readonly changes: EntryAddChanges;
  readonly onExisting: ExistingResourcePolicy;
  /** Reads fresh disk state; batches call this for every item immediately before writing. */
  readonly recheck: () => void;
}

/** All values and advice needed to commit an add; preparation never writes files. */
interface PreparedAdd extends AddPreflight {
  readonly skippedLocales?: string[];
  readonly terminology: TerminologyFindings;
}

interface EditContext {
  readonly collection: Collection;
  readonly resource: LocatedEntry;
  readonly options: EntryWriteOptions;
}

type SuppliedEditTranslations = [string, { readonly value: string; readonly status?: TranslationStatus }][];

/** Shared entry lookup, validation and saving. */
/** Validates an address and opens its folder for inspection or an existing-entry write. */
function locateEntry(
  collection: Collection,
  key: string,
  options: { readonly targetFolder?: string } = {},
): LocatedEntry {
  const paths = resolveResourcePaths({
    key,
    translationsFolder: collection.translationsFolder,
    targetFolder: options.targetFolder,
  });
  return openEntryAt(collection, paths);
}

/** An add's full key has already been validated and placed by its caller. */
function locateResolvedEntry(collection: Collection, resolvedKey: string): LocatedEntry {
  const paths = resolveResolvedResourcePaths({ key: resolvedKey, translationsFolder: collection.translationsFolder });
  return openEntryAt(collection, paths);
}

/** Opens a resolved address without repeating its validation or folder resolution. */
function openEntryAt(collection: Collection, paths: ResolvedResourcePaths): LocatedEntry {
  return {
    resolvedKey: paths.resolvedKey,
    entryKey: paths.entryKey,
    folder: openResourceFolder(paths.folderPath, collection),
  };
}

function assertConversionSafe(locale: string, value: string, runtime: AppRuntime): void {
  const admission = admitValue(undefined, value, { name: 'stored-entry' }, icuParseOptionsFor(runtime));
  if (admission.admitted === false) {
    throw new BracedPlaceholderError(
      locale,
      admission.violations.map((violation) => violation.description),
    );
  }
}

/** Add: prepare values before single or batch writes. */
function validateAddChanges(collection: Collection, changes: EntryAddChanges): void {
  assertCollectionLocales(
    collection,
    (changes.translations ?? []).map(({ locale }) => locale),
  );
  assertConversionSafe(collection.baseLocale, changes.baseValue, collection.runtime);
  for (const translation of changes.translations ?? []) {
    if (translation.status !== undefined) assertTranslationStatus(translation.status);
  }
  for (const translation of (changes.translations ?? []).filter(({ locale }) => locale !== collection.baseLocale)) {
    assertConversionSafe(translation.locale, translation.value, collection.runtime);
  }
}

function assertBaseValue(key: string, baseValue: string): void {
  if (baseValue.trim() === '') throw new InvalidBaseValueError(key);
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
 * @throws {InvalidBaseValueError} The base value is empty or contains only whitespace.
 * @throws {LocaleNotFoundError} A supplied translation names a locale the collection does not have.
 * @throws {TranslationError} The translation provider failed.
 * @throws {ProtectedTermsFileError} Auto-translation runs and a protected-terms file is malformed.
 */
export async function addResource(
  collection: Collection,
  params: AddResourceParams,
  options: AddResourceOptions = {},
): Promise<AddResourceResult> {
  const resolvedKey = resolveCheckedResourceKey(params.key, params.targetFolder);
  const prepared = await prepareAdd(
    preflightAdd(collection, resolvedKey, params, options.onExisting ?? 'fail'),
    options,
  );
  return commitPrepared(prepared);
}

/** Validates supplied values, then checks existence, without seeding or writing. */
function preflightAdd(
  collection: Collection,
  resolvedKey: string,
  changes: EntryAddChanges,
  onExisting: ExistingResourcePolicy,
): AddPreflight {
  const paths = resolveResolvedResourcePaths({ key: resolvedKey, translationsFolder: collection.translationsFolder });
  assertBaseValue(resolvedKey, changes.baseValue);
  validateAddChanges(collection, changes);
  checkWriteConflict(openEntryAt(collection, paths), onExisting);
  return {
    collection,
    resolvedKey,
    changes,
    onExisting,
    recheck: () => assertAddable(collection, resolvedKey, onExisting),
  };
}

/** Seeds a preflighted add once, retaining its diagnostics for the eventual write. */
async function prepareAdd(preflight: AddPreflight, options: OpenTranslatorOptions = {}): Promise<PreparedAdd> {
  const { collection, resolvedKey, changes } = preflight;
  const { baseValue: input, translations: requested = [], ...details } = changes;
  const baseValue = translocoToICU(input);
  const supplied = requested.filter(({ locale }) => locale !== collection.baseLocale);
  const seeding = await seedLocales(collection, { baseValue, supplied: supplied.map(({ locale }) => locale) }, options);
  const terminology = withTranslatorProblems(
    readProjectTerms(collection).checkBaseValue(resolvedKey, baseValue),
    seeding.problems,
  );
  return {
    ...preflight,
    changes: { baseValue, translations: [...supplied, ...seeding.translations], ...details },
    ...(seeding.skippedLocales !== undefined && { skippedLocales: seeding.skippedLocales }),
    terminology,
  };
}

/** Reopens fresh state and writes the prepared values through the shared save/report path. */
function commitPrepared(prepared: PreparedAdd): AddResourceResult {
  const committed = commitAdd(prepared.collection, prepared.resolvedKey, prepared.changes, prepared.onExisting);
  return {
    ...committed,
    ...(prepared.skippedLocales !== undefined && { skippedLocales: prepared.skippedLocales }),
    terminology: prepared.terminology,
  };
}

/** Rechecks fresh state, applies the add and reports its one save. Shared by single and batch adds. */
function commitAdd(
  collection: Collection,
  resolvedKey: string,
  changes: EntryAddChanges,
  onExisting: ExistingResourcePolicy,
): Pick<AddResourceResult, 'resolvedKey' | 'created' | 'translations'> {
  const resource = locateResolvedEntry(collection, resolvedKey);
  const created = checkWriteConflict(resource, onExisting);
  const translations = applyEntryAdd(resource, changes);
  resource.folder.save();
  return { resolvedKey, created, translations };
}

/** Checks a placed key without writing, including the post-translation batch conflict check. */
function assertAddable(collection: Collection, resolvedKey: string, onExisting: ExistingResourcePolicy): void {
  checkWriteConflict(locateResolvedEntry(collection, resolvedKey), onExisting);
}

function checkWriteConflict(resource: LocatedEntry, onExisting: ExistingResourcePolicy): boolean {
  const created = !resource.folder.has(resource.entryKey);
  if (!created && onExisting === 'fail') throw new ResourceAlreadyExistsError(resource.resolvedKey);
  return created;
}

/** Applies normalized add values; the Resource Folder reports the save. */
function applyEntryAdd(resource: LocatedEntry, changes: EntryAddChanges): ResourceTranslation[] {
  const { folder, entryKey } = resource;
  ensureDirectoryExists({ directoryPath: folder.folderPath, errorContext: 'Creating resource folder' });
  // setEntry clears the entry in place, so an existing key keeps its position in the file.
  folder.setEntry(entryKey, { source: changes.baseValue }, {});
  folder.setBase(entryKey, changes.baseValue);
  folder.setDetails(entryKey, {
    comment: changes.comment || undefined,
    tags: normalizeTags([...(changes.tags ?? [])]),
  });
  for (const { locale, value, status } of changes.translations ?? [])
    folder.setTranslation(entryKey, locale, value, status);
  const stored = folder.get(entryKey);
  return (changes.translations ?? []).map((translation) => {
    const status = stored?.meta?.[translation.locale]?.status;
    if (status === undefined) throw new CoreOperationError(`Missing status for locale "${translation.locale}"`);
    const value = stored?.entry[translation.locale];
    if (typeof value !== 'string') throw new CoreOperationError(`Missing value for locale "${translation.locale}"`);
    return { locale: translation.locale, value, status };
  });
}

/**
 * Resolves every item before translation, prepares every item before writing, then
 * writes in input order. Preflight refuses malformed keys and target-folder addresses,
 * unknown locales, duplicate resolved keys within the batch, unreadable folder JSON,
 * existing exact keys unless `onExisting` is `replace`, and translation failures.
 * Preflight reads folders but does not create them or check whether a later write can succeed.
 *
 * A filesystem failure during writing (for example, an existing regular file in a
 * folder path or insufficient permissions) can therefore occur after earlier items
 * were written. Every earlier completed item remains saved in both
 * JSON files. The failing item may have created its folder and may have written
 * `resource_entries.json` without `tracker_meta.json`. There is no rollback or result on
 * failure. Every earlier item's `upsert` was already delivered through `onMutation`;
 * the failing folder delivers a `reindex` if its save started.
 *
 * @throws {InvalidBaseValueError} Any item has an empty or whitespace-only base value (before translation or writes).
 */
export async function addResources(
  collection: Collection,
  items: readonly AddResourceParams[],
  options: AddResourceOptions = {},
): Promise<AddResourcesResult> {
  const onExisting = options.onExisting ?? 'fail';
  const batchKeys = new Set<string>();
  const resolved: AddPreflight[] = [];
  const prepared: PreparedAdd[] = [];

  for (const item of items) {
    const key = resolveCheckedResourceKey(item.key, item.targetFolder);
    const candidate = preflightAdd(collection, key, item, onExisting);
    if (batchKeys.has(key)) throw new ResourceAlreadyExistsError(key);
    batchKeys.add(key);
    resolved.push(candidate);
  }
  for (const candidate of resolved) {
    prepared.push(await prepareAdd(candidate, options));
  }
  // No await separates this check from the write loop, so a late conflict writes nothing.
  for (const candidate of prepared) {
    candidate.recheck();
  }

  let entriesCreated = 0;
  const skippedLocales = new Set<string>();
  const findings: TerminologyFinding[] = [];
  const problems = new Set<string>();
  for (const candidate of prepared) {
    const result = commitPrepared(candidate);
    if (result.created) entriesCreated++;
    for (const locale of result.skippedLocales ?? []) skippedLocales.add(locale);
    findings.push(...result.terminology.findings);
    for (const problem of result.terminology.problems) problems.add(problem);
  }

  return {
    entriesCreated,
    created: entriesCreated > 0,
    skippedLocales: [...skippedLocales],
    terminology: { findings, problems: [...problems] },
  };
}

/**
 * Edits an existing resource entry of a collection.
 *
 * When the base value changes, the Staleness rule updates every translation's status, then
 * Locale seeding ({@link seedLocales}) fills the locales that need work and were not supplied
 * in `changes.translations`: auto-translated when the collection has it enabled, else a copy
 * of the new base value as `new` for a locale that has no value or held an untranslated copy
 * of the old base value. A real translation is kept (and is `stale`).
 *
 * The edit is saved before auto-translation runs, so it is kept even if the provider fails.
 * With `moveTo`, the edited entry then moves to the destination folder: the destination is
 * written before the source entry is removed. `moveTo` is validated, and the destination
 * checked for a collision, before anything is written. The destination is read again just
 * before the move (auto-translation may have taken a while), and a collision found then
 * throws `ResourceAlreadyExistsError` with the edit already saved in the source folder.
 *
 * @param key - The entry's full, existing key.
 * @param options - `provider` / `protectedTerms`: used instead of the collection's (see `openTranslator`).
 * @throws {InvalidResourceKeyError} `key` or `moveTo` is malformed.
 * @throws {InvalidBaseValueError} A supplied base value is empty or contains only whitespace.
 * @throws {ResourceNotFoundError} No entry exists at `key`.
 * @throws {ResourceAlreadyExistsError} The destination folder already has an entry with this entry key
 *   (checked before the edit, and again, on fresh disk state, just before the move).
 * @throws {LocaleNotFoundError} A translation names a locale the collection does not have.
 * @throws {TranslationError} The translation provider failed (the edit itself is saved).
 * @throws {ProtectedTermsFileError} Auto-translation runs and a protected-terms file is malformed.
 */
export async function editResource(
  collection: Collection,
  key: string,
  changes: EditResourceChanges,
  options: EditResourceOptions = {},
): Promise<EditResourceResult> {
  const { resource, translations, destination, liveEntry } = validateEntryEdit(collection, key, changes);
  const context: EditContext = { collection, resource, options };
  const previousBase = liveEntry.source;
  const base = applyEditBaseAndDetails(resource, changes, previousBase);
  const translationsChanged = applySuppliedEditTranslations(resource, translations, liveEntry);
  if (!base.hasChanges && !translationsChanged && !destination) {
    return {
      resolvedKey: resource.resolvedKey,
      updated: false,
      message: 'No changes detected',
    };
  }

  // Two-phase write: the edit is saved before auto-translation, so it is kept if the provider fails.
  if (base.hasChanges || translationsChanged) resource.folder.save();
  const seeded =
    base.baseValue !== undefined && base.baseValue !== previousBase
      ? await seedEditedEntry(context, base.baseValue, previousBase, translations, liveEntry)
      : undefined;
  return finishEntryEdit(context, destination, base.baseValue, seeded);
}

function validateEntryEdit(
  collection: Collection,
  key: string,
  changes: EditResourceChanges,
): { resource: LocatedEntry; liveEntry: ResourceEntry; translations: SuppliedEditTranslations; destination?: string } {
  const { baseLocale } = collection;
  if (changes.baseValue !== undefined) assertBaseValue(key, changes.baseValue);
  const resource = locateEntry(collection, key);
  const current = resource.folder.get(resource.entryKey);
  if (!current?.meta) throw new ResourceNotFoundError(resource.resolvedKey);

  if (changes.baseValue !== undefined && changes.baseValue !== current.entry.source) {
    assertConversionSafe(baseLocale, changes.baseValue, collection.runtime);
  }
  const requestedTranslations = Object.entries(changes.translations ?? {});
  for (const [, translation] of requestedTranslations) {
    if (translation.status !== undefined) assertTranslationStatus(translation.status);
  }
  const translations = requestedTranslations.filter(([locale]) => locale !== baseLocale);
  for (const [locale, translation] of translations) {
    if (translation.value !== current.entry[locale]) {
      assertConversionSafe(locale, translation.value, collection.runtime);
    }
  }
  assertCollectionLocales(
    collection,
    translations.map(([locale]) => locale),
  );

  const destination =
    changes.moveTo === undefined ? undefined : resolveDestination(collection, resource, changes.moveTo);

  // Live view of the stored entry: it reflects every change made through `folder`.
  return { resource, liveEntry: current.entry, translations, destination };
}

function applyEditBaseAndDetails(resource: LocatedEntry, changes: EditResourceChanges, previousBase: string) {
  const { folder, entryKey } = resource;
  let hasChanges = false;
  // setBase applies the Staleness rule to every translation.
  const baseValue =
    changes.baseValue === undefined || changes.baseValue === previousBase
      ? changes.baseValue
      : translocoToICU(changes.baseValue);
  if (baseValue !== undefined && baseValue !== previousBase) {
    folder.setBase(entryKey, baseValue);
    hasChanges = true;
  }

  if (changes.comment !== undefined && folder.setDetails(entryKey, { comment: changes.comment })) {
    hasChanges = true;
  }
  if (changes.tags !== undefined && folder.setDetails(entryKey, { tags: normalizeTags([...changes.tags]) })) {
    hasChanges = true;
  }

  return { baseValue, hasChanges };
}

function applySuppliedEditTranslations(
  resource: LocatedEntry,
  translations: SuppliedEditTranslations,
  liveEntry: ResourceEntry,
): boolean {
  const { folder, entryKey } = resource;
  let hasChanges = false;
  for (const [locale, { value, status }] of translations) {
    if (value !== liveEntry[locale] && translocoToICU(value) !== liveEntry[locale]) {
      folder.setTranslation(entryKey, locale, value, status);
      hasChanges = true;
    } else {
      const localeMeta = folder.get(entryKey)?.meta?.[locale];
      if (status !== undefined && localeMeta && localeMeta.status !== status) {
        folder.setStatus(entryKey, locale, status);
        hasChanges = true;
      }
    }
  }

  return hasChanges;
}

async function seedEditedEntry(
  context: EditContext,
  baseValue: string,
  previousBase: string,
  translations: SuppliedEditTranslations,
  liveEntry: ResourceEntry,
) {
  const { collection, resource, options } = context;
  const { folder, entryKey } = resource;
  let skippedLocales: string[] | undefined;
  const snapshots = new Map(
    collection.targetLocales.map((locale) => [
      locale,
      snapshotTranslation(liveEntry.source, folder.get(entryKey)?.meta?.[locale]),
    ]),
  );
  const seeding = await seedLocales(
    collection,
    {
      baseValue,
      supplied: translations.map(([locale]) => locale),
      needsWork: (locale) => needsTranslation(folder.get(entryKey)?.meta?.[locale]),
      // A real translation is kept; no value, or an untranslated copy of the old base, is not.
      keepsValue: (locale) => {
        const value = liveEntry[locale];
        return typeof value === 'string' && !isUntranslatedCopy(value, previousBase);
      },
    },
    options,
  );
  const pending = seeding.translations.flatMap((translation) => {
    const snapshot = snapshots.get(translation.locale);
    return snapshot ? [{ entryKey, ...translation, snapshot }] : [];
  });
  const writeBack = writeBackTranslations(collection, folder.folderPath, pending);

  if (!writeBack.folder.has(entryKey)) {
    throw new ResourceNotFoundError(resource.resolvedKey);
  }
  if (seeding.skippedLocales !== undefined) {
    const skipped = [...new Set([...seeding.skippedLocales, ...writeBack.skipped.map(({ locale }) => locale)])];
    if (skipped.length > 0) skippedLocales = skipped;
  }
  return { folder: writeBack.folder, skippedLocales, translatorProblems: seeding.problems };
}

function finishEntryEdit(
  context: EditContext,
  destination: string | undefined,
  baseValue: string | undefined,
  seeded: Awaited<ReturnType<typeof seedEditedEntry>> | undefined,
): EntryEditResult {
  const { collection, resource } = context;
  const { skippedLocales, translatorProblems } = seeded ?? {};
  const moved = destination ? moveEntry(collection, resource.resolvedKey, destination) : undefined;
  const resolvedKey = moved?.resolvedKey ?? resource.resolvedKey;
  const updatedEntry = moved?.entry ?? (seeded?.folder ?? resource.folder).treeEntry(resource.entryKey);
  if (!updatedEntry) {
    throw new ResourceNotFoundError(resolvedKey);
  }

  return {
    resolvedKey,
    updated: true,
    entry: updatedEntry,
    ...(moved?.warnings && { warnings: moved.warnings }),
    ...(skippedLocales !== undefined && { skippedLocales }),
    ...(baseValue !== undefined && {
      terminology: withTranslatorProblems(
        readProjectTerms(collection).checkBaseValue(resolvedKey, baseValue),
        translatorProblems,
      ),
    }),
  };
}

/**
 * The key `moveTo` sends the entry to; `undefined` when it is the entry's own folder.
 * @throws {InvalidResourceKeyError} `moveTo` is malformed.
 * @throws {ResourceAlreadyExistsError} The destination already has this entry key.
 */
function resolveDestination(
  collection: Collection,
  source: { readonly resolvedKey: string; readonly entryKey: string },
  moveTo: string,
): string | undefined {
  resolveCheckedResourceKey(source.entryKey, moveTo);
  const [relocation] = planMove({
    source: collection,
    destination: collection,
    selection: { kind: 'entry', key: source.resolvedKey },
    destinationPath: moveTo,
  }).relocations;
  if (!relocation || relocation.to === source.resolvedKey) {
    return undefined;
  }

  if (locateEntry(collection, relocation.to).folder.has(source.entryKey)) {
    throw new ResourceAlreadyExistsError(relocation.to);
  }
  return relocation.to;
}

/**
 * Moves the entry, as saved, to the destination through the Entry Relocation (`relocateEntries`),
 * which reads both folders from disk again, so writes made to the destination meanwhile are kept
 * and a new collision is caught. The destination is written before the source entry is removed.
 * A failed write throws after the relocation reports a `reindex`.
 * @throws {ResourceAlreadyExistsError} The destination has the entry key now.
 */
function moveEntry(
  collection: Collection,
  sourceKey: string,
  destinationKey: string,
): { resolvedKey: string; entry: ResourceTreeEntry; warnings?: string[] } {
  const plan = planMove({
    source: collection,
    destination: collection,
    selection: { kind: 'key', key: sourceKey },
    destinationPath: destinationKey,
  });
  const relocation = relocateEntries(plan);
  if (relocation.collisions.length > 0) {
    throw new ResourceAlreadyExistsError(destinationKey);
  }
  const [moved] = relocation.moved;
  if (!moved) {
    throw new CoreOperationError(relocation.errors.join('; ') || `Resource ${sourceKey} was not moved`);
  }
  return { resolvedKey: moved.to, entry: moved.entry, ...(relocation.warnings && { warnings: relocation.warnings }) };
}

/** Remove an existing entry. */
export function removeEntry(collection: Collection, key: string): ResourceEntryRemoval {
  const paths = resolveResourcePaths({ key, translationsFolder: collection.translationsFolder });
  const folderAddress = paths.folderPathSegments.join('.') || '.';
  const presence = resourceFolderPresence(paths.folderPath);
  if (!presence.folder) throw new FolderNotFoundError(folderAddress);
  if (!presence.entries) throw new ResourceNotFoundError(paths.resolvedKey);

  const deletionStep = <T>(run: () => T, detail: string): T => {
    try {
      return run();
    } catch (error) {
      if (error instanceof InvalidCollectionFolderError) throw error;
      throw new CoreOperationError(`Failed to delete resource ${paths.resolvedKey}: ${detail}`, { cause: error });
    }
  };
  const resource = deletionStep(
    () => openEntryAt(collection, paths),
    `folder ${folderAddress} has unreadable resource files`,
  );
  const removed = deletionStep(
    () => resource.folder.remove(resource.entryKey),
    `could not update folder ${folderAddress}`,
  );
  if (!removed) throw new ResourceNotFoundError(paths.resolvedKey);
  const saved = deletionStep(() => resource.folder.save(), `could not write folder ${folderAddress}`);
  return { resolvedKey: paths.resolvedKey, emptied: saved.emptied ? paths.folderPath : undefined };
}
