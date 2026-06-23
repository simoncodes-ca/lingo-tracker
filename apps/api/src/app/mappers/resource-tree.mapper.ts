import type {
  ResourceTreeDto,
  ResourceSummaryDto,
  FolderNodeDto,
  TranslationStatus,
} from '@simoncodes-ca/data-transfer';
import type { ResourceTreeNode, ResourceTreeEntry } from '@simoncodes-ca/core';

export function mapResourceTreeToDto(node: ResourceTreeNode, collectionTags?: string[]): ResourceTreeDto {
  return {
    path: node.folderPathSegments.join('.'),
    resources: node.resources.map((e) => mapResourceEntryToSummary(e, collectionTags)),
    children: node.children.map((c) => mapFolderChildToDto(c, collectionTags)),
  };
}

export function mapResourceEntryToSummary(entry: ResourceTreeEntry, collectionTags?: string[]): ResourceSummaryDto {
  // Find base locale (the one without status/baseChecksum in metadata)
  let baseLocale: string | undefined;
  for (const [locale, meta] of Object.entries(entry.metadata)) {
    if (meta.status === undefined && meta.baseChecksum === undefined) {
      baseLocale = locale;
      break;
    }
  }

  // Combine source and translations
  const translations: Record<string, string> = { ...entry.translations };
  if (baseLocale) {
    translations[baseLocale] = entry.source;
  }

  // Extract status from metadata for each locale
  const status: Record<string, TranslationStatus | undefined> = {};
  for (const [locale, meta] of Object.entries(entry.metadata)) {
    status[locale] = meta.status;
  }

  return {
    key: entry.key,
    translations,
    status,
    comment: entry.comment,
    tags: entry.tags,
    inheritedTags: collectionTags && collectionTags.length > 0 ? collectionTags : undefined,
  };
}

function mapFolderChildToDto(
  child: {
    name: string;
    fullPathSegments: string[];
    loaded: boolean;
    tree?: ResourceTreeNode;
  },
  collectionTags?: string[],
): FolderNodeDto {
  return {
    name: child.name,
    fullPath: child.fullPathSegments.join('.'),
    loaded: child.loaded,
    tree: child.tree ? mapResourceTreeToDto(child.tree, collectionTags) : undefined,
  };
}
