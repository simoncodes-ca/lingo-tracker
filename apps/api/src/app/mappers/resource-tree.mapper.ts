import {
  type Collection,
  extractResourcesRecursively,
  type FolderChild,
  type ResourceTreeEntry,
  type ResourceTreeNode,
} from '@simoncodes-ca/core';
import type { FolderNodeDto, ResourceSummaryDto, ResourceTreeDto } from '@simoncodes-ca/data-transfer';
import { buildResourceSummary, resolveResourceKey } from '@simoncodes-ca/domain';

/**
 * Maps the tree endpoint result, including nested entries only for the literal query value 'true'.
 *
 * An empty path addresses the collection root, which the artificial root node in the
 * Tracker sidebar selects. It is a folder like any other here, so it honours
 * includeNested too and can list every resource in the collection.
 * Nested entries carry keys relative to the requested folder, so they resolve against it.
 */
export function mapGetTreeResultToDto(
  node: ResourceTreeNode,
  collection: Collection,
  includeNested: string | undefined,
): ResourceTreeDto {
  const dto = mapResourceTreeToDto(node, collection);
  if (includeNested === 'true') {
    dto.resources = extractResourcesRecursively(node).map((entry) =>
      mapResourceEntryToSummary(entry, dto.path, collection),
    );
  }
  return dto;
}

/** Maps a tree node to its DTO. Every resource becomes a Resource Summary of `collection`. */
export function mapResourceTreeToDto(node: ResourceTreeNode, collection: Collection): ResourceTreeDto {
  const path = node.folderPathSegments.join('.');
  return {
    path,
    resources: node.resources.map((entry) => mapResourceEntryToSummary(entry, path, collection)),
    children: node.children.map((child) => mapFolderChildToDto(child, collection)),
  };
}

/**
 * Maps a stored entry to its Resource Summary.
 *
 * @param entry - The entry; its `key` is relative to `folderPath` (a single segment, or a
 *   sub-path for entries collected from nested folders).
 * @param folderPath - Dot-delimited folder `entry.key` is relative to; `''` for the root.
 */
export function mapResourceEntryToSummary(
  entry: ResourceTreeEntry,
  folderPath: string,
  collection: Collection,
): ResourceSummaryDto {
  return buildResourceSummary(resolveResourceKey(entry.key, folderPath), entry, collection);
}

function mapFolderChildToDto(child: FolderChild, collection: Collection): FolderNodeDto {
  return {
    name: child.name,
    fullPath: child.fullPathSegments.join('.'),
    loaded: child.loaded,
    tree: child.tree ? mapResourceTreeToDto(child.tree, collection) : undefined,
  };
}
