import type { ResourceSummary, ResourceSummaryTarget } from '@simoncodes-ca/domain';

export interface ResourceTreeDto {
  /** Current folder path (dot-delimited, empty string for root) */
  path: string;

  /** Resources in this folder (with `includeNested`, also every resource below it) */
  resources: ResourceSummaryDto[];

  /** Child folders (loaded or unloaded based on depth) */
  children: FolderNodeDto[];
}

/**
 * One resource entry: explicit address (`fullKey`, `folderPath`, `entryKey`), the base
 * value, and one row per target locale of the collection (in collection order) with
 * `needsWork` and `sameAsBase` already decided. Declared once, in domain (Resource Summary).
 */
export type ResourceSummaryDto = ResourceSummary;

/** One target locale of a {@link ResourceSummaryDto}. */
export type ResourceSummaryTargetDto = ResourceSummaryTarget;

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
