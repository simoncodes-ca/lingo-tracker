import { existsSync } from 'node:fs';
import { readJsonFile, writeJsonFile } from '../file-io/json-file-operations';
import type { ImportOptions, ImportChange, ImportedResource } from './types';
import type { ResourceEntries, ResourceEntry } from '../../resource/resource-entry';
import type { TrackerMetadata } from '../../resource/tracker-metadata';
import { calculateChecksum } from '../../resource/checksum';
import type { LocaleMetadata, TranslationStatus } from '@simoncodes-ca/domain';
import type { ResourceGroup } from './resource-grouping';
import { shouldUseSourceStatus, determineNewResourceStatus, determineUpdatedResourceStatus } from './determine-status';

// ---------------------------------------------------------------------------
// Internal context shared across all handlers in one processResourceGroup call
// ---------------------------------------------------------------------------

interface GroupContext {
  readonly locale: string;
  readonly baseLocale: string;
  readonly options: ImportOptions;
  resourceEntries: ResourceEntries;
  trackerMeta: TrackerMetadata;
  dataModified: boolean;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function applyCommentUpdate(entry: ResourceEntry, resource: ImportedResource, options: ImportOptions): boolean {
  if (!options.updateComments || resource.comment === undefined) return false;

  if (resource.comment) {
    if (entry.comment !== resource.comment) {
      entry.comment = resource.comment;
      return true;
    }
  } else if (entry.comment !== undefined) {
    delete entry.comment;
    return true;
  }

  return false;
}

function applyTagsUpdate(entry: ResourceEntry, resource: ImportedResource, options: ImportOptions): boolean {
  if (!options.updateTags || resource.tags === undefined) return false;

  if (resource.tags.length > 0) {
    if (JSON.stringify([...(entry.tags ?? [])].sort()) !== JSON.stringify([...(resource.tags ?? [])].sort())) {
      entry.tags = resource.tags;
      return true;
    }
  } else if (entry.tags !== undefined) {
    delete entry.tags;
    return true;
  }

  return false;
}

function ensureEntryMeta(trackerMeta: TrackerMetadata, entryKey: string): void {
  if (!trackerMeta[entryKey]) {
    trackerMeta[entryKey] = {};
  }
}

// ---------------------------------------------------------------------------
// Handler: new resource (does not exist in storage yet)
// ---------------------------------------------------------------------------

function handleNewResource(
  ctx: GroupContext,
  resource: ImportedResource,
  entryKey: string,
  isBaseLocaleImport: boolean,
): ImportChange {
  const { locale, baseLocale, options, resourceEntries, trackerMeta } = ctx;

  if (isBaseLocaleImport) {
    const newEntry: ResourceEntry = { source: resource.value };
    if (resource.comment) newEntry.comment = resource.comment;
    if (resource.tags && resource.tags.length > 0) newEntry.tags = resource.tags;

    resourceEntries[entryKey] = newEntry;

    ensureEntryMeta(trackerMeta, entryKey);
    trackerMeta[entryKey][baseLocale] = { checksum: calculateChecksum(resource.value) };

    ctx.dataModified = true;
    return { key: resource.key, type: 'created', oldValue: '', newValue: resource.value };
  }

  if (!resource.baseValue) {
    return {
      key: resource.key,
      type: 'failed',
      reason: 'Cannot create resource: base value not provided (required for creation)',
    };
  }

  const newEntry: ResourceEntry = { source: resource.baseValue, [locale]: resource.value };
  if (resource.comment) newEntry.comment = resource.comment;
  if (resource.tags && resource.tags.length > 0) newEntry.tags = resource.tags;

  resourceEntries[entryKey] = newEntry;

  const newChecksum = calculateChecksum(resource.value);
  const baseChecksum = calculateChecksum(resource.baseValue);
  const createdStatus = determineNewResourceStatus(options, resource);

  ensureEntryMeta(trackerMeta, entryKey);
  trackerMeta[entryKey][baseLocale] = { checksum: baseChecksum };
  trackerMeta[entryKey][locale] = { checksum: newChecksum, baseChecksum, status: createdStatus };

  ctx.dataModified = true;
  return { key: resource.key, type: 'created', oldValue: '', newValue: resource.value, newStatus: createdStatus };
}

// ---------------------------------------------------------------------------
// Handler: existing resource, base locale import
// ---------------------------------------------------------------------------

function handleBaseLocaleUpdate(ctx: GroupContext, resource: ImportedResource, entryKey: string): ImportChange {
  const { baseLocale, options, resourceEntries, trackerMeta } = ctx;
  const entry = resourceEntries[entryKey];

  const oldValue = entry.source ?? '';
  const valueChanged = oldValue !== resource.value;

  if (valueChanged) {
    entry.source = resource.value;
    ctx.dataModified = true;
  }

  if (applyCommentUpdate(entry, resource, options)) ctx.dataModified = true;
  if (applyTagsUpdate(entry, resource, options)) ctx.dataModified = true;

  const newChecksum = calculateChecksum(resource.value);
  ensureEntryMeta(trackerMeta, entryKey);

  const existingBaseChecksum = trackerMeta[entryKey][baseLocale]?.checksum;
  if (existingBaseChecksum !== newChecksum) {
    trackerMeta[entryKey][baseLocale] = { checksum: newChecksum };
    ctx.dataModified = true;
  }

  return {
    key: resource.key,
    type: valueChanged ? 'value-changed' : 'updated',
    oldValue,
    newValue: resource.value,
  };
}

// ---------------------------------------------------------------------------
// Handler: existing resource, target locale update
// ---------------------------------------------------------------------------

function handleTargetLocaleUpdate(ctx: GroupContext, resource: ImportedResource, entryKey: string): ImportChange {
  const { locale, baseLocale, options, resourceEntries, trackerMeta } = ctx;
  const entry = resourceEntries[entryKey];
  const entryMeta = trackerMeta[entryKey];

  const oldValue = (entry[locale] as string) ?? '';
  const oldStatus = entryMeta?.[locale]?.status;
  const valueChanged = oldValue !== resource.value;

  // Strategy-specific handling for unchanged values.
  // `oldValue !== ''` distinguishes a genuinely unchanged existing value from a first-time
  // locale write: when `entry[locale]` is undefined, `oldValue` resolves to `''`, which
  // means first-time writes correctly fall through to the value-changed path below.
  if (!valueChanged && oldValue !== '') {
    return handleUnchangedTargetLocaleValue(ctx, resource, entryKey, entry, entryMeta, oldValue, oldStatus);
  }

  // Value is new or first-time write for this locale — update entry and metadata.
  entry[locale] = resource.value;
  ctx.dataModified = true;

  if (applyCommentUpdate(entry, resource, options)) ctx.dataModified = true;
  if (applyTagsUpdate(entry, resource, options)) ctx.dataModified = true;

  const newChecksum = calculateChecksum(resource.value);
  const baseChecksum = entryMeta?.[baseLocale]?.checksum ?? calculateChecksum(entry.source);
  const newStatus = determineUpdatedResourceStatus(options, resource, oldStatus);

  ensureEntryMeta(trackerMeta, entryKey);
  const newMetadata: LocaleMetadata = { checksum: newChecksum, baseChecksum, status: newStatus };
  trackerMeta[entryKey][locale] = newMetadata;

  return {
    key: resource.key,
    type: valueChanged ? 'value-changed' : 'updated',
    oldValue,
    newValue: resource.value,
    oldStatus,
    newStatus,
  };
}

function handleUnchangedTargetLocaleValue(
  ctx: GroupContext,
  resource: ImportedResource,
  entryKey: string,
  entry: ResourceEntry,
  entryMeta: TrackerMetadata[string],
  oldValue: string,
  oldStatus: TranslationStatus | undefined,
): ImportChange {
  const { locale, baseLocale, options, trackerMeta } = ctx;

  if (options.strategy === 'update') {
    return {
      key: resource.key,
      type: 'updated',
      oldValue,
      newValue: resource.value,
      oldStatus,
      newStatus: oldStatus ?? 'translated',
    };
  }

  const resolvedStatus: TranslationStatus = shouldUseSourceStatus(options, resource)
    ? resource.status
    : options.strategy === 'verification'
      ? 'verified'
      : (oldStatus ?? 'translated');

  if (resolvedStatus !== oldStatus) {
    ensureEntryMeta(trackerMeta, entryKey);

    if (!trackerMeta[entryKey][locale]) {
      trackerMeta[entryKey][locale] = {
        checksum: entryMeta?.[locale]?.checksum ?? calculateChecksum(oldValue),
        baseChecksum: entryMeta?.[baseLocale]?.checksum ?? calculateChecksum(entry.source),
        status: resolvedStatus,
      };
    } else {
      trackerMeta[entryKey][locale].status = resolvedStatus;
    }
    ctx.dataModified = true;
  }

  return {
    key: resource.key,
    type: 'updated',
    oldValue,
    newValue: resource.value,
    oldStatus,
    newStatus: resolvedStatus,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Processes a group of resources that belong to the same folder.
 *
 * This function is the core of the import operation. It handles batch processing of resources
 * that share the same resource_entries.json and tracker_meta.json files, minimizing file I/O
 * by loading and saving files once per folder instead of per resource.
 *
 * The function performs these operations for each resource in the group:
 * 1. **Resource Creation**: Creates new resources when `createMissing` is enabled and resource
 *    doesn't exist. Requires baseValue to be present (or value for base locale imports).
 * 2. **Base Value Validation**: Compares imported baseValue against existing source values
 *    and warns on mismatches (when validateBase is enabled).
 * 3. **Value Change Detection**: Determines if translation value has changed.
 * 4. **Strategy-Specific Status Handling**:
 *    - `verification`: Sets status to 'verified' (even for unchanged values)
 *    - `update`: Preserves existing status
 *    - `translation-service`: Sets status to 'translated'
 *    - `migration`: Uses source status when present and `preserveStatus` is not `false`,
 *      otherwise defaults to 'translated'
 * 5. **Metadata Updates**: Updates comment and tags when corresponding flags are enabled.
 * 6. **Checksum Calculation**: Computes checksums for change tracking and stale detection.
 * 7. **File Writing**: Atomically writes both resource_entries.json and tracker_meta.json
 *    when changes are detected (unless in dry-run mode).
 *
 * @param group - The resource group containing all resources in the same folder with their
 *                file paths and entry keys
 * @param locale - Target locale code (e.g., 'es', 'fr', 'de') or base locale for migration imports
 * @param baseLocale - Source locale code (typically 'en')
 * @param options - Import configuration including strategy, flags, and validation settings
 * @param dryRun - When true, performs all operations except file writes
 * @param isBaseLocaleImport - Whether this is a base locale import (migration strategy only)
 * @param filesModified - Set that accumulates paths of all modified files (for summary reporting)
 * @param warnings - Array that accumulates non-fatal warnings (e.g., base value mismatches)
 * @returns Array of ImportChange objects describing all changes made to resources in this group
 */
export function processResourceGroup(
  group: ResourceGroup,
  locale: string,
  baseLocale: string,
  options: ImportOptions,
  dryRun: boolean,
  isBaseLocaleImport: boolean,
  filesModified: Set<string>,
  warnings: string[],
): ImportChange[] {
  const changes: ImportChange[] = [];

  const exists = existsSync(group.entryResourcePath) && existsSync(group.entryMetaPath);

  let resourceEntries: ResourceEntries = {};
  let trackerMeta: TrackerMetadata = {};

  if (exists) {
    try {
      resourceEntries = readJsonFile<ResourceEntries>({ filePath: group.entryResourcePath, defaultValue: {} });
      trackerMeta = readJsonFile<TrackerMetadata>({ filePath: group.entryMetaPath, defaultValue: {} });
    } catch (error) {
      for (const { resource } of group.resources) {
        changes.push({ key: resource.key, type: 'failed', reason: `Failed to read resource files: ${error}` });
      }
      return changes;
    }
  }

  const ctx: GroupContext = { locale, baseLocale, options, resourceEntries, trackerMeta, dataModified: false };

  for (const { resource, entryKey } of group.resources) {
    const resourceExists = entryKey in resourceEntries;

    if (!resourceExists) {
      if (!options.createMissing) {
        changes.push({
          key: resource.key,
          type: 'skipped',
          reason: 'Resource not found (strategy does not allow creation)',
        });
        continue;
      }
      changes.push(handleNewResource(ctx, resource, entryKey, isBaseLocaleImport));
      continue;
    }

    if (isBaseLocaleImport) {
      changes.push(handleBaseLocaleUpdate(ctx, resource, entryKey));
      continue;
    }

    // Validate baseValue mismatch before dispatching to target locale handler
    if (resource.baseValue && options.validateBase !== false) {
      const existingBase = resourceEntries[entryKey].source;
      if (existingBase !== resource.baseValue) {
        warnings.push(
          `Base value mismatch for "${resource.key}": import has "${resource.baseValue}", ` +
            `LingoTracker has "${existingBase}" - preserving LingoTracker value`,
        );
      }
    }

    changes.push(handleTargetLocaleUpdate(ctx, resource, entryKey));
  }

  // Write files once for the entire group, but only when in-memory state was actually mutated.
  // Logging an 'updated' change (e.g. update strategy with unchanged value) does not imply a
  // disk write is needed — `dataModified` is the authoritative signal for that.
  if (!dryRun && ctx.dataModified) {
    writeJsonFile({ filePath: group.entryResourcePath, data: resourceEntries, ensureDirectory: true });
    writeJsonFile({ filePath: group.entryMetaPath, data: trackerMeta });

    filesModified.add(group.entryResourcePath);
    filesModified.add(group.entryMetaPath);
  }

  return changes;
}
