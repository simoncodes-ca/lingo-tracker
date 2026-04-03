import * as fs from 'fs';
import * as path from 'path';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import type { ResourceEntries } from '../../resource/resource-entry';
import type { TrackerMetadata } from '../../resource/tracker-metadata';
import type { TranslationStatus } from '@simoncodes-ca/domain';
import type { FilteredResource } from './types';

export interface LoadedResource {
  key: string;
  fullKey: string;
  source: string;
  translations: Record<string, string>;
  tags?: string[];
  comment?: string;
  status: Record<string, TranslationStatus>;
  collection: string;
}

/**
 * Validates that the output directory exists or can be created, and is writable.
 */
export function validateOutputDirectory(directory: string): void {
  if (!fs.existsSync(directory)) {
    try {
      fs.mkdirSync(directory, { recursive: true });
    } catch (error) {
      throw new Error(`Could not create output directory '${directory}': ${(error as Error).message}`);
    }
  }

  try {
    fs.accessSync(directory, fs.constants.W_OK);
  } catch {
    throw new Error(`Output directory '${directory}' is not writable.`);
  }
}

/**
 * Loads all resources and metadata from a list of collections.
 */
export function loadResourcesFromCollections(collections: { name: string; path: string }[]): LoadedResource[] {
  const allResources: Map<string, LoadedResource> = new Map();

  for (const collection of collections) {
    if (!fs.existsSync(collection.path)) {
      console.warn(`Collection path not found: ${collection.path}`);
      continue;
    }

    // The collection.path should point directly to where translations are stored
    loadFolderRecursively(collection.path, '', collection.name, allResources);
  }

  return Array.from(allResources.values());
}

function loadFolderRecursively(
  folderPath: string,
  keyPrefix: string,
  collectionName: string,
  allResources: Map<string, LoadedResource>,
): void {
  const entriesPath = path.join(folderPath, RESOURCE_ENTRIES_FILENAME);
  const metaPath = path.join(folderPath, TRACKER_META_FILENAME);

  if (fs.existsSync(entriesPath) && fs.existsSync(metaPath)) {
    try {
      const entries: ResourceEntries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
      const metadata: TrackerMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

      for (const [key, entry] of Object.entries(entries)) {
        const fullKey = keyPrefix ? `${keyPrefix}.${key}` : key;
        const meta = metadata[key];

        if (!meta) {
          // Skip if no metadata (will be reported as omitted in summary if we track it)
          continue;
        }

        const loadedResource: LoadedResource = {
          key,
          fullKey,
          source: entry.source,
          translations: {},
          tags: entry.tags,
          comment: entry.comment,
          status: {},
          collection: collectionName,
        };

        // Extract translations and status
        // We assume the entry has keys for locales like 'es', 'fr', etc.
        // But ResourceEntry type is flexible.
        // We'll iterate over keys that are not source, tags, comment
        for (const [prop, value] of Object.entries(entry)) {
          if (prop !== 'source' && prop !== 'tags' && prop !== 'comment' && typeof value === 'string') {
            loadedResource.translations[prop] = value;
          }
        }

        // Extract status
        for (const [locale, localeMeta] of Object.entries(meta)) {
          if (localeMeta && typeof localeMeta === 'object' && 'status' in localeMeta) {
            loadedResource.status[locale] = localeMeta.status as TranslationStatus;
          }
        }

        // Add to map (last write wins for same fullKey)
        allResources.set(fullKey, loadedResource);
      }
    } catch (e) {
      console.warn(`Error loading files in ${folderPath}: ${(e as Error).message}`);
    }
  }

  const children = fs.readdirSync(folderPath, { withFileTypes: true });
  for (const child of children) {
    if (child.isDirectory()) {
      loadFolderRecursively(
        path.join(folderPath, child.name),
        keyPrefix ? `${keyPrefix}.${child.name}` : child.name,
        collectionName,
        allResources,
      );
    }
  }
}

/**
 * Filters resources based on status and tags for a specific target locale.
 */
export function filterResources(
  resources: LoadedResource[],
  targetLocale: string,
  statusFilter: TranslationStatus[] | undefined,
  tagFilter: string[] | undefined,
): FilteredResource[] {
  return resources
    .filter((res) => {
      // Status filter
      const status = res.status[targetLocale];
      // If status is undefined, it's effectively 'new' if we consider untranslated as new,
      // but usually metadata should exist. If no metadata for locale, it's untracked/new.
      // For now, let's assume if status is missing, it might be 'new' or we skip.
      // The requirement says: "Resources with no translation in target locale are considered new"

      const effectiveStatus = status || 'new';

      if (statusFilter && !statusFilter.includes(effectiveStatus)) {
        return false;
      }

      // Tag filter
      if (tagFilter && tagFilter.length > 0) {
        const resTags = res.tags || [];
        const hasMatch = tagFilter.some((tag) => resTags.includes(tag));
        if (!hasMatch) {
          return false;
        }
      }

      return true;
    })
    .map((res) => ({
      key: res.fullKey,
      value: res.translations[targetLocale] || '',
      baseValue: res.source,
      comment: res.comment,
      status: res.status[targetLocale] || 'new',
      tags: res.tags,
      collection: res.collection,
      locale: targetLocale,
    }));
}
