import { TranslationStatus } from './translation-status';

export interface ResourceTreeDto {
  /** Current folder path (dot-delimited, empty string for root) */
  path: string;

  /** Resources in this folder */
  resources: ResourceSummaryDto[];

  /** Child folders (loaded or unloaded based on depth) */
  children: FolderNodeDto[];
}

export interface ResourceSummaryDto {
  /** Entry key within folder (not full path) */
  key: string;

  /** Translation values per locale (includes source locale) */
  translations: Record<string, string>;

  /** Translation status per locale (undefined for base locale) */
  status: Record<string, TranslationStatus | undefined>;

  /** Optional comment/note for translators */
  comment?: string;

  /** Optional tags for categorization/filtering */
  tags?: string[];
}

export interface FolderNodeDto {
  /** Folder name (single segment, not full path) */
  name: string;

  /** Full dot-delimited path to this folder */
  fullPath: string;

  /** Whether this folder's contents are loaded */
  loaded: boolean;

  /** If loaded=true, contains nested tree structure */
  tree?: ResourceTreeDto;
}
