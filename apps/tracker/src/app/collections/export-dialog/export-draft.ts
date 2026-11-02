import type {
  ExportFormatDto,
  ExportJsonStructureDto,
  ExportRequestDto,
  LingoTrackerConfigDto,
  TranslationStatus,
} from '@simoncodes-ca/data-transfer';
import { exportOptionsPolicy, isTranslationStatus } from '@simoncodes-ca/domain';
import { json, KeyedStorage, type StorageAdapter } from '../../shared/storage/keyed-storage';

export const EXPORT_DRAFT_STORAGE_KEY = 'lingo-tracker.exportDraft';
type DraftConfig = Partial<Pick<LingoTrackerConfigDto, 'exportFolder'>>;

/** Raw choices retain disabled fields so toggling Rich off and on loses nothing. */
export interface ExportDraft {
  format: ExportFormatDto;
  allCollections: boolean;
  collections: string[];
  allLocales: boolean;
  locales: string[];
  statuses: TranslationStatus[];
  tags: string[];
  outputDirectory: string;
  filenamePattern: string;
  protectedTermNotes: boolean;
  json: {
    structure: ExportJsonStructureDto;
    rich: boolean;
    includeBase: boolean;
    basePropertyName: string;
    includeStatus: boolean;
    includeComment: boolean;
    includeTags: boolean;
  };
}

export interface ExportContext {
  collectionNames: readonly string[];
  /** Target locale union for the selected collections, excluding their base locales. */
  locales: readonly string[];
}

export function defaultDraft(config: DraftConfig = {}): ExportDraft {
  return {
    format: exportOptionsPolicy.initialFormat,
    allCollections: true,
    collections: [],
    allLocales: true,
    locales: [],
    statuses: [...exportOptionsPolicy.defaults.statuses],
    tags: [],
    outputDirectory: config.exportFolder || 'dist/lingo-export',
    filenamePattern: '',
    protectedTermNotes: exportOptionsPolicy.defaults.protectNotes,
    json: {
      structure: exportOptionsPolicy.defaults.structure,
      rich: exportOptionsPolicy.defaults.rich,
      includeBase: exportOptionsPolicy.defaults.includeBase,
      basePropertyName: exportOptionsPolicy.defaults.basePropertyName,
      includeStatus: exportOptionsPolicy.defaults.includeStatus,
      includeComment: exportOptionsPolicy.defaults.includeComment,
      includeTags: exportOptionsPolicy.defaults.includeTags,
    },
  };
}

export function toExportRequest(draft: ExportDraft, context: ExportContext): ExportRequestDto {
  const outputDirectory = draft.outputDirectory.trim();
  const filenamePattern = draft.filenamePattern.trim();
  const options = draft.json;
  return {
    format: draft.format,
    ...(draft.allCollections
      ? {}
      : { collections: draft.collections.filter((name) => context.collectionNames.includes(name)) }),
    ...(draft.allLocales ? {} : { locales: draft.locales.filter((locale) => context.locales.includes(locale)) }),
    statuses: [...draft.statuses],
    ...(draft.tags.length ? { tags: [...draft.tags] } : {}),
    ...(outputDirectory ? { outputDirectory } : {}),
    ...(filenamePattern ? { filenamePattern } : {}),
    protectedTermNotes: draft.protectedTermNotes,
    ...(draft.format === 'json'
      ? {
          json: {
            structure: options.structure,
            rich: options.rich,
            ...(options.rich
              ? {
                  includeBase: options.includeBase,
                  ...(options.includeBase && options.basePropertyName.trim()
                    ? { basePropertyName: options.basePropertyName.trim() }
                    : {}),
                  includeStatus: options.includeStatus,
                  includeComment: options.includeComment,
                  includeTags: options.includeTags,
                }
              : {}),
          },
        }
      : {}),
  };
}

export function fromExportRequest(request: ExportRequestDto, config: DraftConfig = {}): ExportDraft {
  const defaults = defaultDraft(config);
  return {
    ...defaults,
    format: request.format,
    allCollections: request.collections === undefined,
    collections: [...(request.collections ?? [])],
    allLocales: request.locales === undefined,
    locales: [...(request.locales ?? [])],
    statuses: [...(request.statuses ?? defaults.statuses)],
    tags: [...(request.tags ?? [])],
    outputDirectory: request.outputDirectory ?? defaults.outputDirectory,
    filenamePattern: request.filenamePattern ?? '',
    protectedTermNotes: request.protectedTermNotes ?? defaults.protectedTermNotes,
    json: {
      structure: request.json?.structure ?? defaults.json.structure,
      rich: request.json?.rich ?? defaults.json.rich,
      includeBase: request.json?.includeBase ?? defaults.json.includeBase,
      basePropertyName: request.json?.basePropertyName ?? defaults.json.basePropertyName,
      includeStatus: request.json?.includeStatus ?? defaults.json.includeStatus,
      includeComment: request.json?.includeComment ?? defaults.json.includeComment,
      includeTags: request.json?.includeTags ?? defaults.json.includeTags,
    },
  };
}

type StorageSource = () => StorageAdapter | undefined;

/** Local memory deliberately excludes both selection switches and selection arrays. */
export function persistDraft(draft: ExportDraft, storage: StorageSource): void {
  const {
    allCollections: _allCollections,
    collections: _collections,
    allLocales: _allLocales,
    locales: _locales,
    ...remembered
  } = draft;
  new KeyedStorage(storage, EXPORT_DRAFT_STORAGE_KEY, json()).write(remembered);
}

/** Storage is supplied by the caller, keeping this helper independent of browser globals. */
export function readPersistedDraft(storage: StorageSource, config: DraftConfig = {}): ExportDraft | undefined {
  return new KeyedStorage<ExportDraft>(
    storage,
    EXPORT_DRAFT_STORAGE_KEY,
    json((raw) => {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null) return undefined;
      const draft = defaultDraft(config);
      // Validate each field rather than spreading untrusted storage into a typed form.
      if ('format' in value && exportOptionsPolicy.isFormat(value.format)) draft.format = value.format;
      for (const key of ['outputDirectory', 'filenamePattern'] as const) {
        if (key in value && typeof (value as Record<string, unknown>)[key] === 'string')
          draft[key] = (value as Record<string, string>)[key];
      }
      if ('protectedTermNotes' in value && typeof value.protectedTermNotes === 'boolean')
        draft.protectedTermNotes = value.protectedTermNotes;
      if ('statuses' in value && Array.isArray(value.statuses)) {
        const statuses = value.statuses.filter(isTranslationStatus);
        if (statuses.length > 0) draft.statuses = statuses;
      }
      if ('tags' in value && Array.isArray(value.tags))
        draft.tags = value.tags.filter((tag): tag is string => typeof tag === 'string');
      if ('json' in value && typeof value.json === 'object' && value.json !== null) {
        const options = value.json;
        for (const key of ['rich', 'includeBase', 'includeStatus', 'includeComment', 'includeTags'] as const) {
          if (key in options && typeof (options as Record<string, unknown>)[key] === 'boolean')
            draft.json[key] = (options as Record<string, boolean>)[key];
        }
        if ('structure' in options && exportOptionsPolicy.isJsonStructure(options.structure))
          draft.json.structure = options.structure;
        if ('basePropertyName' in options && typeof options.basePropertyName === 'string')
          draft.json.basePropertyName = options.basePropertyName;
      }
      return draft;
    }),
  ).read();
}
