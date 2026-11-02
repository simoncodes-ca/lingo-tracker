import { existsSync, unlinkSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  type AppRuntime,
  admitValue,
  applyBaseChange,
  type ImportStrategy,
  icuParseOptionsFor,
  importStrategyPolicy,
  type LocaleMetadata,
  normalizeTags,
  recordTranslation,
  resolveImportStatus,
  type TranslationStatus,
  translocoToICU,
} from '@simoncodes-ca/domain';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import type { Collection, OpenedCollection } from '../config/open-collection';
import { readResourceEntries, readTrackerMetadata, writeJsonFile } from '../file-io/json-file-operations';
import { calculateChecksum } from './checksum';
import { assertCollectionFolderPath } from './folder-address';
import type { ResourceEntries, ResourceEntry } from './resource-entry';
import type { ResourceEntryMetadata } from './resource-entry-metadata';
import { type MutationSink, resourceMutations } from './resource-mutation';
import type { ResourceTreeEntry } from './resource-tree-types';
import type { TrackerMetadata } from './tracker-metadata';
import { assertTranslationStatus } from './translation-status-input';

/**
 * Resource Folder — the owner of one folder's `resource_entries.json` + `tracker_meta.json` pair.
 *
 * Every read-modify-write of the pair goes through this module, so:
 * - both files are always loaded and saved together,
 * - checksums are computed here, and
 * - status changes follow the domain Staleness rule (`applyBaseChange`, `recordTranslation`).
 *
 * Changes stay in memory until `save()`.
 */
export interface ReadonlyResourceFolder {
  /** Absolute or cwd-relative folder path this instance was opened with. */
  readonly folderPath: string;

  has(key: string): boolean;
  /** Returns the stored entry and its metadata (`meta` is `undefined` when tracker_meta has no record). */
  get(key: string): ResourceFolderEntry | undefined;
  keys(): string[];
  isEmpty(): boolean;
  /** Whether either file was missing when opened or after the last non-dry save. */
  hasMissingFiles(): boolean;
  /**
   * The entry as the API/UI sees it. `undefined` when the entry is missing.
   * An entry without a metadata record gets `metadata: {}` (no locale has a status).
   * With requireMetadata, that entry returns undefined instead.
   */
  treeEntry(key: string, options?: { readonly requireMetadata?: boolean }): ResourceTreeEntry | undefined;
}

export interface ResourceFolder extends ReadonlyResourceFolder {
  /**
   * Sets the base value. Creates the entry when it does not exist.
   * When an existing base value changes (or its stored checksum is out of date), the
   * Staleness rule updates every translation's status.
   *
   * @returns true when anything changed
   */
  setBase(key: string, value: string): boolean;
  /**
   * Updates comment and/or tags. `undefined` leaves a field alone; `null` (or an empty tag list) removes it.
   * @returns true when anything changed
   */
  setDetails(key: string, details: EntryDetails): boolean;
  /**
   * Writes a translation value and records `{ checksum, baseChecksum, status }` for it.
   * `baseChecksum` is the current base checksum. An omitted status is inferred from the value.
   */
  setTranslation(key: string, locale: string, value: string, status?: TranslationStatus): void;
  /**
   * Changes the status of a locale that already has metadata. The value and its checksum are kept.
   * The base checksum reference is kept; use `reconfirmTranslation` to refresh it under strategy policy.
   */
  setStatus(key: string, locale: string, status: TranslationStatus): void;
  /**
   * Re-confirms an unchanged translation under the import strategy policy.
   * `incomingStatus` is already filtered by the caller's source-status preservation policy.
   * Reports the resolved status and whether metadata changed; update leaves metadata untouched.
   */
  reconfirmTranslation(
    key: string,
    locale: string,
    strategy: ImportStrategy,
    incomingStatus?: TranslationStatus,
  ): { readonly status: TranslationStatus; readonly changed: boolean };
  /**
   * Stores an entry and its metadata, normalizing locale values to ICU (move, rename, add-resource reset).
   * With `targetLocales` (an entry moved into another collection), the entry is fitted to them: values
   * and metadata of other locales are dropped (the base locale's metadata is kept), and each missing
   * one is seeded as a `new` copy of the base, the rule `seedLocale` applies.
   */
  setEntry(
    key: string,
    entry: Readonly<ResourceEntry>,
    meta: Readonly<ResourceEntryMetadata>,
    options?: { readonly targetLocales?: readonly string[] },
  ): void;
  /**
   * Normalizes an existing entry's values and tags and makes its metadata true again:
   * - a stray base-locale property is dropped (the base value lives in `source`),
   * - every translation of a `targetLocales` locale is re-recorded with a current checksum and its
   *   stored status (a translation without metadata counts as `new`, as the reader and validate count it),
   * - a target translation whose stored `baseChecksum` differs from the base checksum was made from an
   *   older base (Staleness): it becomes `stale` (`new` when its value is a copy of the base; a `new`
   *   translation stays `new`) and gets the current `baseChecksum`,
   * - the base value goes through the Staleness rule when it changed,
   * - each of `targetLocales` the entry has no value for is seeded as a `new` copy of the base, and
   * - non-target values are also converted to ICU; only their converted checksums are updated.
   *
   * The normalize operation's write path.
   * @returns counts of converted values, normalized tag lists and seeded locales, and whether anything changed
   */
  normalizeEntry(key: string, targetLocales: readonly string[]): NormalizeEntryReport;
  /**
   * Adds `locale` to every entry that has no value for it, as a copy of the base value with status `new`.
   * @returns number of entries seeded
   */
  seedLocale(locale: string): number;
  /**
   * Removes `locale` values and metadata from every entry.
   * @returns number of entries changed
   */
  dropLocale(locale: string): number;
  /** @returns true when the entry existed */
  remove(key: string): boolean;

  /**
   * Writes both files (creating the folder if needed). When the folder has no entries,
   * both files are deleted and the result reports the emptied folder for operation-end pruning.
   * With `dryRun`, reports file changes without touching disk or emitting mutations.
   */
  save(options?: { readonly dryRun?: boolean }): ResourceFolderSaveResult;
}

export interface ResourceFolderEntry {
  readonly entry: Readonly<ResourceEntry>;
  readonly meta: Readonly<ResourceEntryMetadata> | undefined;
}

export interface EntryDetails {
  readonly comment?: string | null;
  readonly tags?: readonly string[] | null;
}

export interface NormalizeEntryReport {
  /** Base and translation values whose Transloco syntax became ICU, including non-target locales. */
  readonly valuesConverted: number;
  /** 1 when the tag list changed; otherwise 0. */
  readonly tagsNormalized: number;
  readonly localesAdded: number;
  /** True when the stored entry or its metadata differs from what the folder held before the call. */
  readonly changed: boolean;
}

export interface ResourceFolderSaveResult {
  /**
   * True when this save left the folder without entries; saving never removes directories.
   * Callers that may empty folders must pass them to `pruneEmptiedFolders` at operation end;
   * normalize prunes in batch instead.
   */
  readonly emptied: boolean;
  /** Files written (both files, or none). */
  readonly written: string[];
  /** Subset of `written` that did not exist before. */
  readonly created: string[];
  /** Files deleted because the folder became empty. */
  readonly removed: string[];
}

export interface UnreportedResourceFolderOptions {
  readonly runtime: AppRuntime;
  /** Collection root for guarded reads and saves; omit only for standalone folder fixtures. */
  readonly translationsFolder?: string;
  /** Base locale of the collection. Needed to find the base checksum in metadata. */
  readonly baseLocale: string;
}

function convertStored(value: string, runtime: AppRuntime): string {
  return admitValue(undefined, value, { name: 'stored-entry' }, icuParseOptionsFor(runtime)).admitted
    ? translocoToICU(value)
    : value;
}

const NON_LOCALE_PROPS: ReadonlySet<string> = new Set(['source', 'comment', 'tags']);

/**
 * Returns the locales that have a translation value in `entry` —
 * every string property except `source`, `comment`, and `tags`.
 */
export function translationLocales(entry: Readonly<ResourceEntry>): string[] {
  return Object.keys(entry).filter((prop) => !NON_LOCALE_PROPS.has(prop) && typeof entry[prop] === 'string');
}

/**
 * Opens the resource folder at `folderPath`. Missing files are treated as empty.
 * @throws Error when a file exists but is not valid JSON
 */
export function openResourceFolder(
  folderPath: string,
  collection: Pick<OpenedCollection, 'baseLocale' | 'translationsFolder' | 'onMutation' | 'runtime'>,
): ResourceFolder {
  const onMutation = collection.onMutation;
  if (typeof onMutation !== 'function') {
    throw new TypeError('Reported Resource Folder requires an Opened Collection Mutation Sink');
  }
  assertCollectionFolderPath(collection.translationsFolder, folderPath);
  return new FileResourceFolder(
    folderPath,
    collection.baseLocale,
    collection.runtime,
    collection.translationsFolder,
    onMutation,
  );
}

/** Opens a folder for reading; its type exposes no setters or save. */
export function openReadonlyResourceFolder(
  folderPath: string,
  options: UnreportedResourceFolderOptions,
): ReadonlyResourceFolder {
  return openUnreportedResourceFolder(folderPath, options);
}

/** Explicit legacy/fixture path: saving this folder sends no mutations. */
export function openUnreportedResourceFolder(
  folderPath: string,
  options: UnreportedResourceFolderOptions,
): ResourceFolder {
  if (options.translationsFolder !== undefined) assertCollectionFolderPath(options.translationsFolder, folderPath);
  return new FileResourceFolder(folderPath, options.baseLocale, options.runtime, options.translationsFolder);
}

/** Checks presence without reading either file, for operations that require existing storage. */
export function resourceFolderPresence(folderPath: string): { folder: boolean; entries: boolean } {
  const folder = existsSync(folderPath);
  return { folder, entries: folder && existsSync(join(folderPath, RESOURCE_ENTRIES_FILENAME)) };
}

/** Own-property check, so keys like "constructor" are not mistaken for entries (lib es2020 has no Object.hasOwn). */
function hasOwn(target: object, key: string): boolean {
  return Object.getOwnPropertyDescriptor(target, key) !== undefined;
}

/** Locale Freshness: compare a locale's reference with an explicitly resolved base checksum. */
function hasBaseDrift(meta: LocaleMetadata | undefined, baseChecksum: string): boolean {
  return meta?.baseChecksum !== baseChecksum;
}

function normalizedLocaleStatus(
  baseLocale: string,
  locale: string,
  checksum: string,
  baseChecksum: string,
  previous: LocaleMetadata | undefined,
): TranslationStatus {
  const status = previous?.status ?? 'new';
  if (status === 'new' || previous?.baseChecksum === undefined || !hasBaseDrift(previous, baseChecksum)) return status;
  // Use the same status rule as a base edit, with the translation's current checksum.
  return applyBaseChange({ [locale]: { checksum } }, baseLocale, baseChecksum)[locale]?.status ?? status;
}

function rebaseConvertedLocale(
  meta: LocaleMetadata | undefined,
  previousBaseChecksum: string,
  currentBaseChecksum: string,
): void {
  // Syntax conversion preserves status, and only rebases references to the original value.
  if (meta && !hasBaseDrift(meta, previousBaseChecksum)) meta.baseChecksum = currentBaseChecksum;
}

const saveFolderFiles = Symbol('saveFolderFiles');

class FileResourceFolder implements ResourceFolder {
  private readonly changedKeys = new Set<string>();
  private readonly entriesPath: string;
  private readonly metaPath: string;
  private readonly entries: ResourceEntries;
  private readonly meta: TrackerMetadata;
  private entriesExist: boolean;
  private metaExists: boolean;

  constructor(
    readonly folderPath: string,
    private readonly baseLocale: string,
    private readonly runtime: AppRuntime,
    private readonly translationsFolder?: string,
    private readonly onMutation?: MutationSink,
  ) {
    this.entriesPath = join(folderPath, RESOURCE_ENTRIES_FILENAME);
    this.metaPath = join(folderPath, TRACKER_META_FILENAME);
    this.entriesExist = existsSync(this.entriesPath);
    this.metaExists = existsSync(this.metaPath);
    this.entries = this.entriesExist ? readResourceEntries(this.entriesPath) : {};
    this.meta = this.metaExists ? readTrackerMetadata(this.metaPath) : {};
  }

  has(key: string): boolean {
    return hasOwn(this.entries, key);
  }

  get(key: string): ResourceFolderEntry | undefined {
    if (!this.has(key)) return undefined;
    return { entry: this.entries[key], meta: hasOwn(this.meta, key) ? this.meta[key] : undefined };
  }

  keys(): string[] {
    return Object.keys(this.entries);
  }

  isEmpty(): boolean {
    return this.keys().length === 0;
  }

  hasMissingFiles(): boolean {
    return !this.entriesExist || !this.metaExists;
  }

  treeEntry(key: string, options: { readonly requireMetadata?: boolean } = {}): ResourceTreeEntry | undefined {
    const stored = this.get(key);
    if (!stored || (options.requireMetadata && !stored.meta)) return undefined;
    const { entry, meta } = stored;

    const translations: Record<string, string> = {};
    for (const locale of translationLocales(entry)) {
      translations[locale] = entry[locale] as string;
    }

    return {
      key,
      source: entry.source,
      translations,
      metadata: meta ?? {},
      ...(entry.comment !== undefined && { comment: entry.comment }),
      // A hand-edited non-array `tags` reads as no tags, so one bad value does not make the folder unreadable.
      ...(Array.isArray(entry.tags) && entry.tags.length > 0 && { tags: entry.tags }),
    };
  }

  setBase(key: string, value: string): boolean {
    return this.setBaseICU(key, translocoToICU(value));
  }

  /** Internal writes receive values already converted at the public boundary. */
  private setBaseICU(key: string, value: string): boolean {
    const checksum = calculateChecksum(value);
    const entry = this.has(key) ? this.entries[key] : undefined;
    const entryMeta = this.metaOf(key);
    const previousChecksum = entryMeta[this.baseLocale]?.checksum;

    if (entry && entry.source === value && previousChecksum === checksum) {
      return false;
    }

    // The base changed when an existing entry gets a different value, or when the stored checksum
    // disagrees with the (hand-edited) stored value. A missing checksum on an unchanged value is just recorded.
    const baseChanged = entry !== undefined && (entry.source !== value || previousChecksum !== undefined);

    if (entry) {
      entry.source = value;
    } else {
      this.entries[key] = { source: value };
    }

    this.meta[key] = baseChanged
      ? applyBaseChange(entryMeta, this.baseLocale, checksum)
      : { ...entryMeta, [this.baseLocale]: { ...entryMeta[this.baseLocale], checksum } };

    this.changedKeys.add(key);
    return true;
  }

  setDetails(key: string, details: EntryDetails): boolean {
    const entry = this.requireEntry(key);
    let changed = false;

    if (details.comment === null && entry.comment !== undefined) {
      delete entry.comment;
      changed = true;
    } else if (typeof details.comment === 'string' && entry.comment !== details.comment) {
      entry.comment = details.comment;
      changed = true;
    }

    const removeTags = details.tags === null || details.tags?.length === 0;
    if (removeTags && entry.tags !== undefined) {
      delete entry.tags;
      changed = true;
    } else if (details.tags && !removeTags && !sameTags(entry.tags, details.tags)) {
      entry.tags = [...details.tags];
      changed = true;
    }

    if (changed) this.changedKeys.add(key);
    return changed;
  }

  setTranslation(key: string, locale: string, value: string, status?: TranslationStatus): void {
    this.setTranslationICU(key, locale, translocoToICU(value), status);
  }

  private setTranslationICU(
    key: string,
    locale: string,
    value: string,
    status?: TranslationStatus,
    baseChecksum?: string,
  ): void {
    if (status !== undefined) assertTranslationStatus(status);
    if (locale === this.baseLocale) {
      throw new Error(`Cannot set a translation for the base locale "${locale}"; use setBase`);
    }
    const entry = this.requireEntry(key);
    const previousValue = entry[locale];
    const previousMeta = JSON.stringify(this.metaOf(key)[locale]);
    entry[locale] = value;

    const entryMeta = this.metaOf(key);
    this.meta[key] = recordTranslation(
      entryMeta,
      locale,
      calculateChecksum(value),
      baseChecksum ?? this.currentBaseChecksum(key),
      status,
    );
    if (previousValue !== value || previousMeta !== JSON.stringify(this.meta[key][locale])) this.changedKeys.add(key);
  }

  setStatus(key: string, locale: string, status: TranslationStatus): void {
    assertTranslationStatus(status);
    const entryMeta = this.metaOf(key);
    const localeMeta = entryMeta[locale];
    if (!localeMeta) {
      throw new Error(`No metadata for locale "${locale}" of resource "${key}"`);
    }
    if (localeMeta.status === status) return;
    localeMeta.status = status;
    this.changedKeys.add(key);
  }

  reconfirmTranslation(
    key: string,
    locale: string,
    strategy: ImportStrategy,
    incomingStatus?: TranslationStatus,
  ): { readonly status: TranslationStatus; readonly changed: boolean } {
    const entry = this.requireEntry(key);
    const previous = this.metaOf(key)[locale];
    const oldStatus = previous?.status;
    const policy = importStrategyPolicy(strategy);
    if (policy.statusOnUnchanged === 'untouched') return { status: oldStatus ?? 'translated', changed: false };

    const baseChecksum = policy.reconfirmsUnchanged ? this.currentBaseChecksum(key) : undefined;
    const baseChecksumChanged = baseChecksum !== undefined && hasBaseDrift(previous, baseChecksum);
    const status = resolveImportStatus({
      strategy,
      oldStatus,
      incomingStatus,
      valueChanged: false,
      baseChecksumChanged,
    });
    const changed = status !== oldStatus || baseChecksumChanged;
    if (changed) {
      if (previous) {
        this.setStatus(key, locale, status);
        if (baseChecksum !== undefined) previous.baseChecksum = baseChecksum;
        this.changedKeys.add(key);
      } else {
        this.setTranslationICU(key, locale, translocoToICU(entry[locale] as string), status, baseChecksum);
      }
    }
    return { status, changed };
  }

  setEntry(
    key: string,
    entry: Readonly<ResourceEntry>,
    meta: Readonly<ResourceEntryMetadata>,
    options: { readonly targetLocales?: readonly string[] } = {},
  ): void {
    const stored: ResourceEntry = { ...entry };
    const storedMeta: ResourceEntryMetadata = Object.fromEntries(
      Object.entries(meta).map(([locale, localeMeta]) => [locale, { ...localeMeta }]),
    );
    this.entries[key] = stored;
    this.meta[key] = storedMeta;
    this.changedKeys.add(key);

    // Conversion changes syntax, not meaning. Keep a copied status and update only the
    // checksums that referred to a converted value.
    const normalizedBase = convertStored(entry.source, this.runtime);
    if (normalizedBase !== entry.source) {
      stored.source = normalizedBase;
      const baseMeta = storedMeta[this.baseLocale];
      const previousBaseChecksum = calculateChecksum(entry.source);
      const currentBaseChecksum = calculateChecksum(normalizedBase);
      if (baseMeta) baseMeta.checksum = currentBaseChecksum;
      for (const locale of translationLocales(stored)) {
        const localeMeta = storedMeta[locale];
        rebaseConvertedLocale(localeMeta, previousBaseChecksum, currentBaseChecksum);
      }
    }
    for (const locale of translationLocales(stored)) {
      const value = stored[locale];
      if (typeof value !== 'string') continue;
      const normalized = convertStored(value, this.runtime);
      if (normalized === value) continue;
      stored[locale] = normalized;
      const localeMeta = locale === this.baseLocale ? undefined : storedMeta[locale];
      if (localeMeta) localeMeta.checksum = calculateChecksum(normalized);
    }

    const { targetLocales } = options;
    if (!targetLocales) return;
    for (const locale of translationLocales(stored)) {
      if (!targetLocales.includes(locale)) delete stored[locale];
    }
    for (const locale of Object.keys(storedMeta)) {
      if (locale !== this.baseLocale && !targetLocales.includes(locale)) delete storedMeta[locale];
    }
    for (const locale of targetLocales) {
      this.seedEntryLocale(key, locale);
    }
  }

  normalizeEntry(key: string, targetLocales: readonly string[]): NormalizeEntryReport {
    const values = this.requireEntry(key);
    const before = JSON.stringify(this.get(key));
    const previousMeta = this.metaOf(key);
    const entry: ResourceEntry = { ...values };
    let valuesConverted = 0;
    for (const prop of ['source', ...translationLocales(entry)]) {
      const value = entry[prop];
      if (typeof value !== 'string') continue;
      const converted = convertStored(value, this.runtime);
      if (converted !== value) {
        entry[prop] = converted;
        valuesConverted++;
      }
    }
    let tagsNormalized = 0;
    if (Array.isArray(entry.tags) && entry.tags.length > 0) {
      const tags = normalizeTags(entry.tags);
      if (!sameTags(entry.tags, tags)) {
        if (tags.length > 0) entry.tags = tags;
        else delete entry.tags;
        tagsNormalized = 1;
      }
    }
    const baseChecksum = this.currentBaseChecksum(key, entry.source);

    if (this.baseLocale !== 'source') delete entry[this.baseLocale];
    this.entries[key] = entry;

    // Translations first, so the Staleness rule compares current checksums when the base changed.
    for (const locale of translationLocales(entry)) {
      if (!targetLocales.includes(locale)) continue;
      const value = entry[locale] as string;
      const previous = previousMeta[locale];
      this.setTranslationICU(
        key,
        locale,
        value,
        normalizedLocaleStatus(this.baseLocale, locale, calculateChecksum(value), baseChecksum, previous),
      );
    }
    this.setBaseICU(key, entry.source);
    for (const locale of translationLocales(entry)) {
      if (targetLocales.includes(locale)) continue;
      const raw = values[locale];
      const normalized = entry[locale];
      const localeMeta = this.metaOf(key)[locale];
      if (typeof raw === 'string' && typeof normalized === 'string' && raw !== normalized && localeMeta) {
        localeMeta.checksum = calculateChecksum(normalized);
      }
    }

    let localesAdded = 0;
    for (const locale of targetLocales) {
      if (this.seedEntryLocale(key, locale, entry.source)) localesAdded++;
    }

    const changed = JSON.stringify(this.get(key)) !== before;
    if (changed) this.changedKeys.add(key);
    return { valuesConverted, tagsNormalized, localesAdded, changed };
  }

  seedLocale(locale: string): number {
    let seeded = 0;
    for (const key of this.keys()) {
      if (this.seedEntryLocale(key, locale)) seeded++;
    }
    return seeded;
  }

  dropLocale(locale: string): number {
    let changedEntries = 0;
    for (const key of this.keys()) {
      const entry = this.entries[key];
      if (typeof entry !== 'object' || entry === null) continue;

      let changed = false;
      if (locale in entry) {
        delete entry[locale];
        changed = true;
      }
      const entryMeta = this.meta[key];
      if (entryMeta && locale in entryMeta) {
        delete entryMeta[locale];
        changed = true;
      }
      if (changed) {
        this.changedKeys.add(key);
        changedEntries++;
      }
    }
    return changedEntries;
  }

  remove(key: string): boolean {
    if (!this.has(key)) return false;
    delete this.entries[key];
    delete this.meta[key];
    this.changedKeys.add(key);
    return true;
  }

  save(options: { readonly dryRun?: boolean } = {}): ResourceFolderSaveResult {
    let result: ResourceFolderSaveResult;
    try {
      result = this[saveFolderFiles](options);
    } catch (error) {
      if (!options.dryRun && this.translationsFolder !== undefined)
        this.onMutation?.(resourceMutations.reindex(this.translationsFolder));
      throw error;
    }
    if (!options.dryRun && this.translationsFolder !== undefined && this.onMutation) {
      const path = relative(this.translationsFolder, this.folderPath).split(sep).join('.');
      for (const key of this.changedKeys) {
        const fullKey = path ? `${path}.${key}` : key;
        this.onMutation(
          this.has(key)
            ? resourceMutations.upsert(this.translationsFolder, fullKey, this.treeEntry(key))
            : resourceMutations.remove(this.translationsFolder, fullKey),
        );
      }
      this.changedKeys.clear();
    }
    return result;
  }

  [saveFolderFiles](options: { readonly dryRun?: boolean } = {}): ResourceFolderSaveResult {
    const dryRun = options.dryRun ?? false;
    if (this.translationsFolder !== undefined) assertCollectionFolderPath(this.translationsFolder, this.folderPath);

    if (this.isEmpty()) {
      const removed = [...(this.entriesExist ? [this.entriesPath] : []), ...(this.metaExists ? [this.metaPath] : [])];
      if (!dryRun) {
        for (const filePath of removed) unlinkSync(filePath);
        this.entriesExist = false;
        this.metaExists = false;
      }
      return { written: [], created: [], removed, emptied: true };
    }

    const created = [...(this.entriesExist ? [] : [this.entriesPath]), ...(this.metaExists ? [] : [this.metaPath])];
    if (!dryRun) {
      writeJsonFile({ filePath: this.entriesPath, data: this.entries, ensureDirectory: true });
      writeJsonFile({ filePath: this.metaPath, data: this.meta });
      this.entriesExist = true;
      this.metaExists = true;
    }
    return { written: [this.entriesPath, this.metaPath], created, removed: [], emptied: false };
  }

  /** The one seeding rule: a missing `locale` becomes a copy of the base value with status `new`. */
  private seedEntryLocale(key: string, locale: string, normalizedBase?: string): boolean {
    const entry = this.entries[key];
    if (typeof entry !== 'object' || entry === null || typeof entry.source !== 'string') return false;
    if (locale === this.baseLocale || typeof entry[locale] === 'string') return false;

    this.setTranslationICU(key, locale, normalizedBase ?? convertStored(entry.source, this.runtime), 'new');
    return true;
  }

  private currentBaseChecksum(key: string, source?: string): string {
    return this.metaOf(key)[this.baseLocale]?.checksum ?? calculateChecksum(source ?? this.requireEntry(key).source);
  }

  private metaOf(key: string): ResourceEntryMetadata {
    return hasOwn(this.meta, key) ? this.meta[key] : {};
  }

  private requireEntry(key: string): ResourceEntry {
    if (!this.has(key)) {
      throw new Error(`Resource entry not found: ${key}`);
    }
    return this.entries[key];
  }
}

function sameTags(current: readonly string[] | undefined, next: readonly string[]): boolean {
  if (!current) return false;
  return current.length === next.length && current.every((tag, index) => tag === next[index]);
}

/** Relocation alone batches private unreported saves, then all removes before all upserts. */
function saveRelocation(
  source: Collection,
  destination: Collection,
  folders: readonly ResourceFolder[],
  moved: () => readonly { readonly from: string; readonly to: string; readonly entry: ResourceTreeEntry }[],
  saved: (folder: ResourceFolder, result: ResourceFolderSaveResult) => void,
): { readonly error: unknown } | undefined {
  let failure: { readonly error: unknown } | undefined;
  try {
    for (const folder of folders) {
      // Relocation opens these folders here; the raw save capability is absent from ResourceFolder.
      saved(folder, (folder as FileResourceFolder)[saveFolderFiles]());
    }
  } catch (error) {
    failure = { error };
  }
  if (failure) {
    destination.onMutation(resourceMutations.reindex(destination.translationsFolder));
    if (resolve(source.translationsFolder) !== resolve(destination.translationsFolder))
      source.onMutation(resourceMutations.reindex(source.translationsFolder));
    return failure;
  }
  const entries = moved();
  for (const { from } of entries) source.onMutation(resourceMutations.remove(source.translationsFolder, from));
  for (const { to, entry } of entries)
    destination.onMutation(resourceMutations.upsert(destination.translationsFolder, to, entry));
  return undefined;
}

export { saveRelocation as saveResourceRelocation };

/** Directory operations have no JSON-pair save; keep their legacy success/failure notifications. */
export function reportResourceDirectoryWrite<T>(
  collection: Pick<Collection, 'translationsFolder' | 'onMutation'>,
  write: () => T,
  path: string,
  kind: 'add-folder' | 'remove-folder',
  changed: (result?: T) => boolean = () => true,
): T {
  let result: T;
  try {
    result = write();
  } catch (error) {
    if (changed()) collection.onMutation(resourceMutations.reindex(collection.translationsFolder));
    throw error;
  }
  if (changed(result)) collection.onMutation(resourceMutations.folder(kind, collection.translationsFolder, path));
  return result;
}

/** Config/lifecycle operations retain one broad reindex per affected root. */
export function reindexResourceCollection(
  collection: { readonly translationsFolder: string; readonly onMutation?: MutationSink },
  translationsFolder = collection.translationsFolder,
): void {
  collection.onMutation?.(resourceMutations.reindex(translationsFolder));
}
