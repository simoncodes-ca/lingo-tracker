import type {
  AddLocaleDto,
  BundleDefinitionDto,
  BundleDryRunRequestDto,
  CreateBundleDto,
  CreateCollectionDto,
  CreateFolderDto,
  CreateResourceDto,
  DeleteFolderDto,
  DeleteResourceDto,
  ExportFormatDto,
  ExportJsonOptionsDto,
  ExportJsonStructureDto,
  ExportRequestDto,
  GenerateBundleRequestDto,
  ImportFileRequestDto,
  ImportRequestDto,
  ImportStrategyDto,
  LingoTrackerCollectionDto,
  MoveFolderDto,
  MoveResourceDto,
  TranslateLocaleRequestDto,
  TranslateResourceDto,
  UpdateBundleDto,
  UpdateCollectionDto,
  UpdateConfigDto,
  UpdateResourceDto,
} from '@simoncodes-ca/data-transfer';
import {
  anyObject,
  array,
  boolean,
  integer,
  integerString,
  nonEmptyArray,
  nonEmptyString,
  object,
  oneOrMany,
  optional,
  record,
  type Schema,
  string,
  unknown,
} from './schema';

/**
 * HTTP shape checks only; domain/core owns rules. object<Dto>'s required mapped keys
 * deliberately fail compilation when a DTO gains a field without a matching schema.
 * The casts below defer domain values (bundle rules, terminology rows, status vocabulary)
 * to core while validating their HTTP container or primitive shape.
 */
const bundleDefinition = anyObject() as unknown as Schema<BundleDefinitionDto>;
const translationStatus = string() as Schema<NonNullable<CreateResourceDto['translations']>[number]['status']>;

export const updateConfigBody: Schema<UpdateConfigDto | undefined> = optional(
  object<UpdateConfigDto>({
    protectedTerms: optional(array(string())),
    preferredTerminology: optional(array(unknown()) as Schema<NonNullable<UpdateConfigDto['preferredTerminology']>>),
  }),
);

export const collectionConfig: Schema<LingoTrackerCollectionDto> = object<LingoTrackerCollectionDto>({
  translationsFolder: string(),
  exportFolder: optional(string()),
  importFolder: optional(string()),
  baseLocale: optional(string()),
  protectedTermsFile: optional(string()),
  protectedTermsFilePath: optional(string()),
  locales: optional(array(string())),
  tags: optional(array(string())),
  protectedTerms: optional(array(string())),
  readOnly: optional(boolean()),
  translation: optional(
    object<NonNullable<LingoTrackerCollectionDto['translation']>>({
      enabled: boolean(),
      provider: string(),
      apiKeyEnv: string(),
      batchSize: optional(integer()),
      delayMs: optional(integer()),
    }),
  ),
});

export const createCollectionBody: Schema<CreateCollectionDto> = object<CreateCollectionDto>({
  name: nonEmptyString(),
  collection: collectionConfig,
});
export const updateCollectionBody: Schema<UpdateCollectionDto> = object<UpdateCollectionDto>({
  name: optional(string()),
  collection: collectionConfig,
});
export const bundleDryRunBody: Schema<BundleDryRunRequestDto> = object<BundleDryRunRequestDto>({
  name: string(),
  bundle: bundleDefinition,
  locales: optional(array(string())),
});
export const createBundleBody: Schema<CreateBundleDto> = object<CreateBundleDto>({
  name: string(),
  bundle: bundleDefinition,
});
export const updateBundleBody: Schema<UpdateBundleDto> = object<UpdateBundleDto>({
  name: optional(string()),
  bundle: bundleDefinition,
});
export const generateBundleBody: Schema<GenerateBundleRequestDto | undefined> = optional(
  object<GenerateBundleRequestDto>({
    locales: optional(array(string())),
  }),
);
export const exportRequestBody: Schema<ExportRequestDto> = object<ExportRequestDto>({
  format: string() as Schema<ExportFormatDto>,
  collections: optional(array(string())),
  locales: optional(array(string())),
  statuses: optional(array(translationStatus as Schema<NonNullable<ExportRequestDto['statuses']>[number]>)),
  tags: optional(array(string())),
  outputDirectory: optional(string()),
  filenamePattern: optional(string()),
  protectedTermNotes: optional(boolean()),
  json: optional(
    object<ExportJsonOptionsDto>({
      structure: optional(string() as Schema<ExportJsonStructureDto>),
      rich: optional(boolean()),
      includeBase: optional(boolean()),
      basePropertyName: optional(string()),
      includeStatus: optional(boolean()),
      includeComment: optional(boolean()),
      includeTags: optional(boolean()),
    }),
  ),
});
export const addLocaleBody: Schema<AddLocaleDto> = object<AddLocaleDto>({ locale: string() });
export const translateResourceBody: Schema<TranslateResourceDto> = object<TranslateResourceDto>({ key: string() });
export const createResource: Schema<CreateResourceDto> = object<CreateResourceDto>({
  key: string(),
  baseValue: string(1),
  comment: optional(string()),
  tags: optional(array(string())),
  targetFolder: optional(string()),
  translations: optional(
    array(
      object<NonNullable<CreateResourceDto['translations']>[number]>({
        locale: string(),
        value: string(),
        status: optional(translationStatus),
      }),
    ),
  ),
});
export const createResourcesBody: Schema<CreateResourceDto | CreateResourceDto[]> = oneOrMany(createResource);
export const deleteResourcesBody: Schema<DeleteResourceDto> = object<DeleteResourceDto>({
  keys: nonEmptyArray(string()),
});
export const moveResourcesBody: Schema<MoveResourceDto> = object<MoveResourceDto>({
  moves: nonEmptyArray(
    object<MoveResourceDto['moves'][number]>({
      source: string(),
      destination: string(),
      override: optional(boolean()),
      toCollection: optional(string()),
    }),
  ),
});
export const updateResourceBody: Schema<UpdateResourceDto> = object<UpdateResourceDto>({
  key: string(),
  moveTo: optional(string()),
  baseValue: optional(string(1)),
  comment: optional(string()),
  tags: optional(array(string())),
  locales: optional(
    record(
      object<NonNullable<UpdateResourceDto['locales']>[string]>({
        value: string(),
        status: optional(translationStatus),
      }),
    ),
  ),
});
export const translateLocaleBody: Schema<TranslateLocaleRequestDto> = object<TranslateLocaleRequestDto>({
  locale: string(),
});
export const createFolderBody: Schema<CreateFolderDto> = object<CreateFolderDto>({
  folderName: string(),
  parentPath: optional(string()),
});
export const deleteFolderBody: Schema<DeleteFolderDto> = object<DeleteFolderDto>({ folderPath: string() });
export const moveFolderBody: Schema<MoveFolderDto> = object<MoveFolderDto>({
  sourceFolderPath: nonEmptyString(),
  destinationFolderPath: string(),
  override: optional(boolean()),
  nestUnderDestination: optional(boolean()),
  toCollection: optional(string()),
});

export interface TreeQuery {
  path?: string;
  includeNested?: string;
}
export interface SearchQuery {
  query?: string;
  maxResults?: string;
  mode?: string;
}
export const treeQuery: Schema<TreeQuery> = object<TreeQuery>({
  path: optional(string()),
  includeNested: optional(string()),
});
export const searchQuery: Schema<SearchQuery> = object<SearchQuery>({
  query: optional(string()),
  maxResults: optional(integerString()),
  mode: optional(string()),
});

export interface ImportSourcesQuery {
  collection: string;
  folder?: string;
  overwrite?: string;
}
export const importSourcesQuery = object<ImportSourcesQuery>({
  collection: string(),
  folder: optional(string()),
  overwrite: optional(string()),
});
export type ImportUploadQuery = ImportSourcesQuery;
export const importUploadQuery = object<ImportUploadQuery>({
  collection: string(),
  folder: optional(string()),
  overwrite: optional(string()),
});
export const importRequestBody: Schema<ImportRequestDto> = object<ImportRequestDto>({
  collection: string(),
  files: nonEmptyArray(
    object<ImportFileRequestDto>({
      path: string(1),
      locale: string(1),
      format: optional(string() as Schema<ImportFileRequestDto['format']>),
    }),
  ),
  strategy: optional(string() as Schema<ImportStrategyDto>),
  createMissing: optional(boolean()),
  updateComments: optional(boolean()),
  updateTags: optional(boolean()),
  preserveStatus: optional(boolean()),
  validateBase: optional(boolean()),
});
