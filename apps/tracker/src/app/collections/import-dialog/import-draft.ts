import type { ImportFileRequestDto, ImportRequestDto, ImportStrategyDto } from '@simoncodes-ca/data-transfer';
import { DEFAULT_IMPORT_STRATEGY, importStrategyPolicy, isImportStrategy } from '@simoncodes-ca/domain';
import { json, KeyedStorage, type StorageAdapter } from '../../shared/storage/keyed-storage';

export const IMPORT_DRAFT_STORAGE_KEY = 'lingo-tracker.importDraft';

/** One checked file with the locale it writes. */
export interface ImportFileChoice {
  path: string;
  locale: string;
  format?: ImportFileRequestDto['format'];
}

/**
 * Raw choices. An option left `undefined` follows the strategy's default, so switching strategy
 * moves the defaults without discarding what the user changed on purpose.
 */
export interface ImportDraft {
  collection: string;
  folder: string;
  files: ImportFileChoice[];
  strategy: ImportStrategyDto;
  createMissing?: boolean;
  updateComments?: boolean;
  updateTags?: boolean;
  preserveStatus: boolean;
  validateBase: boolean;
}

export interface EffectiveImportOptions {
  createMissing: boolean;
  updateComments: boolean;
  updateTags: boolean;
  preserveStatus: boolean;
  validateBase: boolean;
}

/** What is remembered between runs: never the files, and one folder per collection. */
export interface PersistedImportDraft {
  collection?: string;
  strategy: ImportStrategyDto;
  createMissing?: boolean;
  updateComments?: boolean;
  updateTags?: boolean;
  preserveStatus: boolean;
  validateBase: boolean;
  foldersByCollection: Record<string, string>;
}

export const DEFAULT_PRESERVE_STATUS = false;
export const DEFAULT_VALIDATE_BASE = true;

const MIGRATION_OPTIONS = ['createMissing', 'updateComments', 'updateTags'] as const;

export function defaultDraft(): ImportDraft {
  return {
    collection: '',
    folder: '',
    files: [],
    strategy: DEFAULT_IMPORT_STRATEGY,
    preserveStatus: DEFAULT_PRESERVE_STATUS,
    validateBase: DEFAULT_VALIDATE_BASE,
  };
}

/** The strategy's own values for the three migration switches (the same table the CLI and API read). */
export function strategyDefaults(
  strategy: ImportStrategyDto,
): Pick<EffectiveImportOptions, (typeof MIGRATION_OPTIONS)[number]> {
  return importStrategyPolicy(strategy).defaults;
}

/** Values in force: the migration switches only exist under migration, elsewhere the strategy decides. */
export function effectiveOptions(draft: ImportDraft): EffectiveImportOptions {
  const defaults = strategyDefaults(draft.strategy);
  const own = draft.strategy === 'migration';
  return {
    createMissing: own ? (draft.createMissing ?? defaults.createMissing) : defaults.createMissing,
    updateComments: own ? (draft.updateComments ?? defaults.updateComments) : defaults.updateComments,
    updateTags: own ? (draft.updateTags ?? defaults.updateTags) : defaults.updateTags,
    preserveStatus: draft.preserveStatus,
    validateBase: draft.validateBase,
  };
}

/** Options that differ from their defaults, for the rail summary. */
export function changedOptionCount(draft: ImportDraft): number {
  const effective = effectiveOptions(draft);
  const defaults = strategyDefaults(draft.strategy);
  return (
    MIGRATION_OPTIONS.filter((key) => effective[key] !== defaults[key]).length +
    Number(effective.preserveStatus !== DEFAULT_PRESERVE_STATUS) +
    Number(effective.validateBase !== DEFAULT_VALIDATE_BASE)
  );
}

/** The Advanced disclosure holds the last two options. */
export function changedAdvancedCount(draft: ImportDraft): number {
  return (
    Number(draft.preserveStatus !== DEFAULT_PRESERVE_STATUS) + Number(draft.validateBase !== DEFAULT_VALIDATE_BASE)
  );
}

/** Minimal like the CLI: option fields equal to the strategy default are left out. */
export function toImportRequest(draft: ImportDraft): ImportRequestDto {
  const effective = effectiveOptions(draft);
  const defaults = strategyDefaults(draft.strategy);
  return {
    collection: draft.collection,
    files: draft.files.map((file) => ({
      path: file.path,
      locale: file.locale,
      ...(file.format ? { format: file.format } : {}),
    })),
    strategy: draft.strategy,
    ...(effective.createMissing !== defaults.createMissing ? { createMissing: effective.createMissing } : {}),
    ...(effective.updateComments !== defaults.updateComments ? { updateComments: effective.updateComments } : {}),
    ...(effective.updateTags !== defaults.updateTags ? { updateTags: effective.updateTags } : {}),
    ...(effective.preserveStatus !== DEFAULT_PRESERVE_STATUS ? { preserveStatus: effective.preserveStatus } : {}),
    ...(effective.validateBase !== DEFAULT_VALIDATE_BASE ? { validateBase: effective.validateBase } : {}),
  };
}

/** The folder is not part of the request; the caller derives it from the files or the collection. */
export function fromImportRequest(request: ImportRequestDto): ImportDraft {
  return {
    ...defaultDraft(),
    collection: request.collection,
    files: request.files.map((file) => ({
      path: file.path,
      locale: file.locale,
      ...(file.format ? { format: file.format } : {}),
    })),
    strategy: request.strategy ?? DEFAULT_IMPORT_STRATEGY,
    ...(request.createMissing === undefined ? {} : { createMissing: request.createMissing }),
    ...(request.updateComments === undefined ? {} : { updateComments: request.updateComments }),
    ...(request.updateTags === undefined ? {} : { updateTags: request.updateTags }),
    preserveStatus: request.preserveStatus ?? DEFAULT_PRESERVE_STATUS,
    validateBase: request.validateBase ?? DEFAULT_VALIDATE_BASE,
  };
}

/** The directory every file shares, or `undefined` when they sit in different ones. */
export function sharedDirectory(paths: readonly string[]): string | undefined {
  const directories = new Set(paths.map((path) => path.slice(0, Math.max(path.lastIndexOf('/'), 0))));
  const [only] = directories;
  return directories.size === 1 && only ? only : undefined;
}

type StorageSource = () => StorageAdapter | undefined;

export function persistDraft(
  draft: ImportDraft,
  foldersByCollection: Record<string, string>,
  storage: StorageSource,
): void {
  const remembered: PersistedImportDraft = {
    ...(draft.collection ? { collection: draft.collection } : {}),
    strategy: draft.strategy,
    ...(draft.createMissing === undefined ? {} : { createMissing: draft.createMissing }),
    ...(draft.updateComments === undefined ? {} : { updateComments: draft.updateComments }),
    ...(draft.updateTags === undefined ? {} : { updateTags: draft.updateTags }),
    preserveStatus: draft.preserveStatus,
    validateBase: draft.validateBase,
    foldersByCollection,
  };
  new KeyedStorage(storage, IMPORT_DRAFT_STORAGE_KEY, json()).write(remembered);
}

/** Storage is supplied by the caller, keeping this helper independent of browser globals. */
export function readPersistedDraft(storage: StorageSource): PersistedImportDraft | undefined {
  return new KeyedStorage<PersistedImportDraft>(
    storage,
    IMPORT_DRAFT_STORAGE_KEY,
    json((raw) => {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null) return undefined;
      // Validate each field rather than spreading untrusted storage into a typed form.
      const record = value as Record<string, unknown>;
      const persisted: PersistedImportDraft = {
        strategy: DEFAULT_IMPORT_STRATEGY,
        preserveStatus: DEFAULT_PRESERVE_STATUS,
        validateBase: DEFAULT_VALIDATE_BASE,
        foldersByCollection: {},
      };
      if (typeof record['collection'] === 'string' && record['collection']) persisted.collection = record['collection'];
      const strategy = record['strategy'];
      if (isImportStrategy(strategy)) persisted.strategy = strategy;
      for (const key of MIGRATION_OPTIONS) {
        const option = record[key];
        if (typeof option === 'boolean') persisted[key] = option;
      }
      if (typeof record['preserveStatus'] === 'boolean') persisted.preserveStatus = record['preserveStatus'];
      if (typeof record['validateBase'] === 'boolean') persisted.validateBase = record['validateBase'];
      const folders = record['foldersByCollection'];
      if (typeof folders === 'object' && folders !== null) {
        for (const [name, folder] of Object.entries(folders)) {
          if (typeof folder === 'string' && folder.trim()) persisted.foldersByCollection[name] = folder;
        }
      }
      return persisted;
    }),
  ).read();
}
