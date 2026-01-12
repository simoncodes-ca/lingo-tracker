import {
  ResourceTreeDto,
  ResourceSummaryDto,
  FolderNodeDto,
  TranslationStatus
} from '@simoncodes-ca/data-transfer';
import { ResourceTreeNode, ResourceTreeEntry } from '@simoncodes-ca/core';

export function mapResourceTreeToDto(node: ResourceTreeNode): ResourceTreeDto {
  return {
    path: node.folderPathSegments.join('.'),
    resources: node.resources.map(mapResourceEntryToSummary),
    children: node.children.map(mapFolderChildToDto)
  };
}

function mapResourceEntryToSummary(entry: ResourceTreeEntry): ResourceSummaryDto {
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
    tags: entry.tags
  };
}

function mapFolderChildToDto(child: {
  name: string;
  fullPathSegments: string[];
  loaded: boolean;
  tree?: ResourceTreeNode;
}): FolderNodeDto {
  return {
    name: child.name,
    fullPath: child.fullPathSegments.join('.'),
    loaded: child.loaded,
    tree: child.tree ? mapResourceTreeToDto(child.tree) : undefined
  };
}
