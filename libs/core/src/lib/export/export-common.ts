import * as fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { findProtectedTerms, type TranslationStatus } from '@simoncodes-ca/domain';
import { type CollectionSetResource, collectionResourceStatus } from '../collection-set/collection-set';
import { CoreOperationError, InvalidExportBasePropertyNameError } from '../errors/lingo-tracker-error';
import type { FilteredResource } from './types';

/** Project Terms are attached only for export filtering and notes. */
export type ExportResource = CollectionSetResource & { protectedTerms?: string[] };

/**
 * Validates that the output directory exists or can be created, and is writable.
 */
const RESERVED_RICH_KEYS = ['value', 'comment', 'status', 'tags'] as const;

export function validateBasePropertyName(name: string): void {
  if (name.length === 0) {
    throw new InvalidExportBasePropertyNameError('basePropertyName cannot be empty');
  }
  if ((RESERVED_RICH_KEYS as readonly string[]).includes(name)) {
    throw new InvalidExportBasePropertyNameError(
      `basePropertyName "${name}" is a reserved key. Reserved: ${RESERVED_RICH_KEYS.join(', ')}`,
    );
  }
}

/** Inspects the destination or its nearest existing ancestor without creating directories. */
export function inspectOutputDirectory(directory: string): { ok: true } | { ok: false; problem: string } {
  let ancestor = resolve(directory);
  try {
    while (!fs.existsSync(ancestor)) {
      const parent = dirname(ancestor);
      if (parent === ancestor) return { ok: false, problem: `Output directory '${directory}' is not writable.` };
      ancestor = parent;
    }
    if (!fs.statSync(ancestor).isDirectory()) {
      return {
        ok: false,
        problem:
          ancestor === resolve(directory)
            ? `Output directory '${directory}' is not a directory.`
            : `Could not create output directory '${directory}': ENOTDIR: not a directory, mkdir '${directory}'`,
      };
    }
    fs.accessSync(ancestor, fs.constants.W_OK);
    return { ok: true };
  } catch {
    return { ok: false, problem: `Output directory '${directory}' is not writable.` };
  }
}

export function validateOutputDirectory(directory: string): void {
  if (!fs.existsSync(directory)) {
    try {
      fs.mkdirSync(directory, { recursive: true });
    } catch (error) {
      throw new CoreOperationError(`Could not create output directory '${directory}': ${(error as Error).message}`);
    }
  }

  try {
    fs.accessSync(directory, fs.constants.W_OK);
  } catch {
    throw new CoreOperationError(`Output directory '${directory}' is not writable.`);
  }
}

/**
 * Filters resources based on status and tags for a specific target locale.
 */
export function filterResources(
  resources: ExportResource[],
  targetLocale: string,
  statusFilter: TranslationStatus[] | undefined,
  tagFilter: string[] | undefined,
  protectedTermsOptions?: {
    augmentProtectedTerms?: boolean;
    baseLocale?: string;
  },
): FilteredResource[] {
  return resources
    .filter((res) => {
      // Status filter
      const effectiveStatus = collectionResourceStatus(res, targetLocale);

      if (statusFilter && !statusFilter.includes(effectiveStatus)) {
        return false;
      }

      // Tag filter — use effective tags (collection-level union resource-level)
      if (tagFilter && tagFilter.length > 0) {
        const hasMatch = tagFilter.some((tag) => res.effectiveTags.includes(tag));
        if (!hasMatch) {
          return false;
        }
      }

      return true;
    })
    .map((res) => {
      const augment =
        protectedTermsOptions?.augmentProtectedTerms !== false &&
        (!protectedTermsOptions?.baseLocale || targetLocale !== protectedTermsOptions.baseLocale);
      const protectedTermsFound = augment ? findProtectedTerms(res.source, res.protectedTerms ?? []) : undefined;

      return {
        key: res.fullKey,
        value: res.translations[targetLocale] || '',
        baseValue: res.source,
        comment: res.comment,
        status: collectionResourceStatus(res, targetLocale),
        tags: res.tags,
        collection: res.collection,
        locale: targetLocale,
        protectedTermsFound,
      };
    });
}
