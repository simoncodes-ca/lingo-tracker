import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ImportOptions, ImportChange, ImportedResource } from './types';
import type { ResourceEntries, ResourceEntry } from '../../resource/resource-entry';
import type { TrackerMetadata } from '../../resource/tracker-metadata';
import { calculateChecksum } from '../../resource/checksum';
import type { LocaleMetadata } from '@simoncodes-ca/domain';
import type { TranslationStatus } from '@simoncodes-ca/domain';
import type { ResourceGroup } from './resource-grouping';

/**
 * Returns true when the imported resource's status field should be used as the resulting
 * translation status, rather than the strategy's default status.
 *
 * This is the case when:
 * - `preserveStatus` is explicitly `true` (all strategies, existing behaviour), OR
 * - the strategy is `'migration'` and `preserveStatus` has not been explicitly disabled
 *   (i.e. is `undefined`), which is the new default-on behaviour for migration imports.
 *
 * The check on `resource.status` ensures we only override when the source data actually
 * carries a status value — missing status fields fall through to strategy defaults.
 */
function shouldUseSourceStatus(
  options: ImportOptions,
  resource: ImportedResource,
): resource is ImportedResource & { status: TranslationStatus } {
  if (!resource.status) {
    return false;
  }

  if (options.preserveStatus === true) {
    return true;
  }

  return options.strategy === 'migration' && options.preserveStatus !== false;
}

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
 * The function maintains referential integrity by ensuring base locale metadata exists
 * and properly linking target locale metadata to the base checksum.
 *
 * Special handling for base locale imports (migration strategy only):
 * - Updates the `source` field instead of locale-specific translations
 * - Creates/updates base locale metadata with checksum only (no status or baseChecksum)
 * - Enables bulk resource creation from JSON files
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
 *
 * @example
 * ```typescript
 * const group: ResourceGroup = {
 *   folderPath: '/translations/common/buttons',
 *   entryResourcePath: '/translations/common/buttons/resource_entries.json',
 *   entryMetaPath: '/translations/common/buttons/tracker_meta.json',
 *   resources: [
 *     { resource: { key: 'common.buttons.ok', value: 'Aceptar' }, entryKey: 'ok' },
 *     { resource: { key: 'common.buttons.cancel', value: 'Cancelar' }, entryKey: 'cancel' }
 *   ]
 * };
 *
 * const filesModified = new Set<string>();
 * const warnings: string[] = [];
 *
 * const changes = processResourceGroup(
 *   group,
 *   'es',
 *   'en',
 *   { strategy: 'translation-service', createMissing: false },
 *   false,
 *   false,
 *   filesModified,
 *   warnings
 * );
 *
 * console.log(`Processed ${changes.length} resources`);
 * console.log(`Modified files:`, Array.from(filesModified));
 * ```
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
  let dataModified = false;

  // Load existing data once for the folder
  const exists = existsSync(group.entryResourcePath) && existsSync(group.entryMetaPath);

  let resourceEntries: ResourceEntries = {};
  let trackerMeta: TrackerMetadata = {};

  if (exists) {
    try {
      const entriesContent = readFileSync(group.entryResourcePath, 'utf8');
      resourceEntries = JSON.parse(entriesContent);

      const metaContent = readFileSync(group.entryMetaPath, 'utf8');
      trackerMeta = JSON.parse(metaContent);
    } catch (error) {
      // Return failed changes for all resources in this group
      for (const { resource } of group.resources) {
        changes.push({
          key: resource.key,
          type: 'failed',
          reason: `Failed to read resource files: ${error}`,
        });
      }
      return changes;
    }
  }

  // Process each resource in the group
  for (const { resource, entryKey } of group.resources) {
    const resourceExists = entryKey in resourceEntries;

    if (!resourceExists) {
      // Check if strategy allows creation
      if (!options.createMissing) {
        changes.push({
          key: resource.key,
          type: 'skipped',
          reason: 'Resource not found (strategy does not allow creation)',
        });
        continue;
      }

      // Create missing resource
      if (isBaseLocaleImport) {
        // Base locale import: create resource with source field
        const newEntry: ResourceEntry = {
          source: resource.value,
        };

        // Add comment if provided
        if (resource.comment) {
          newEntry.comment = resource.comment;
        }

        // Add tags if provided
        if (resource.tags && resource.tags.length > 0) {
          newEntry.tags = resource.tags;
        }

        resourceEntries[entryKey] = newEntry;
        dataModified = true;

        // Create base locale metadata (checksum only, no status or baseChecksum)
        const sourceChecksum = calculateChecksum(resource.value);

        if (!trackerMeta[entryKey]) {
          trackerMeta[entryKey] = {};
        }

        trackerMeta[entryKey][baseLocale] = {
          checksum: sourceChecksum,
        };

        changes.push({
          key: resource.key,
          type: 'created',
          oldValue: '',
          newValue: resource.value,
          oldStatus: undefined,
          newStatus: undefined,
        });

        continue;
      }

      // Standard locale import: validate that we have a base value
      if (!resource.baseValue) {
        changes.push({
          key: resource.key,
          type: 'failed',
          reason: 'Cannot create resource: base value not provided (required for creation)',
        });
        continue;
      }

      // Create new resource entry
      const newEntry: ResourceEntry = {
        source: resource.baseValue,
        [locale]: resource.value,
      };

      // Add comment if provided
      if (resource.comment) {
        newEntry.comment = resource.comment;
      }

      // Add tags if provided
      if (resource.tags && resource.tags.length > 0) {
        newEntry.tags = resource.tags;
      }

      resourceEntries[entryKey] = newEntry;
      dataModified = true;

      // Create metadata for new resource
      const newChecksum = calculateChecksum(resource.value);
      const baseChecksum = calculateChecksum(resource.baseValue);

      if (!trackerMeta[entryKey]) {
        trackerMeta[entryKey] = {};
      }

      // Create base locale metadata
      trackerMeta[entryKey][baseLocale] = {
        checksum: baseChecksum,
      };

      // Create target locale metadata
      const createdStatus: TranslationStatus = shouldUseSourceStatus(options, resource)
        ? resource.status
        : 'translated';

      trackerMeta[entryKey][locale] = {
        checksum: newChecksum,
        baseChecksum,
        status: createdStatus,
      };

      changes.push({
        key: resource.key,
        type: 'created',
        oldValue: '',
        newValue: resource.value,
        oldStatus: undefined,
        newStatus: createdStatus,
      });

      continue;
    }

    const entry = resourceEntries[entryKey];
    const entryMeta = trackerMeta[entryKey];

    // Special handling for base locale imports
    if (isBaseLocaleImport) {
      // Get old source value
      const oldValue = entry.source || '';

      // Check if source value changed
      const valueChanged = oldValue !== resource.value;

      // Update the source value if changed
      if (valueChanged) {
        entry.source = resource.value;
        dataModified = true;
      }

      // Update comment if flag is set and comment is provided
      if (options.updateComments && resource.comment !== undefined) {
        if (resource.comment) {
          if (entry.comment !== resource.comment) {
            entry.comment = resource.comment;
            dataModified = true;
          }
        } else if (entry.comment !== undefined) {
          delete entry.comment;
          dataModified = true;
        }
      }

      // Update tags if flag is set and tags are provided
      if (options.updateTags && resource.tags !== undefined) {
        if (resource.tags.length > 0) {
          if (JSON.stringify([...(entry.tags ?? [])].sort()) !== JSON.stringify([...(resource.tags ?? [])].sort())) {
            entry.tags = resource.tags;
            dataModified = true;
          }
        } else if (entry.tags !== undefined) {
          delete entry.tags;
          dataModified = true;
        }
      }

      // Update base locale metadata with new checksum
      const newChecksum = calculateChecksum(resource.value);

      if (!trackerMeta[entryKey]) {
        trackerMeta[entryKey] = {};
      }

      const existingBaseChecksum = trackerMeta[entryKey][baseLocale]?.checksum;
      if (existingBaseChecksum !== newChecksum) {
        trackerMeta[entryKey][baseLocale] = { checksum: newChecksum };
        dataModified = true;
      }

      changes.push({
        key: resource.key,
        type: valueChanged ? 'value-changed' : 'updated',
        oldValue,
        newValue: resource.value,
        oldStatus: undefined,
        newStatus: undefined,
      });

      continue;
    }

    // Validate baseValue if present
    if (resource.baseValue && options.validateBase !== false) {
      const existingBase = entry.source;
      if (existingBase !== resource.baseValue) {
        warnings.push(
          `Base value mismatch for "${resource.key}": import has "${resource.baseValue}", ` +
            `LingoTracker has "${existingBase}" - preserving LingoTracker value`,
        );
      }
    }

    // Get old value and status
    const oldValue = (entry[locale] as string) || '';
    const oldStatus = entryMeta?.[locale]?.status;

    // Check if value changed
    const valueChanged = oldValue !== resource.value;

    // Strategy-specific handling for unchanged values.
    // `oldValue !== ''` distinguishes a genuinely unchanged existing value from a first-time
    // locale write: when `entry[locale]` is undefined, `oldValue` resolves to `''`, which
    // means first-time writes correctly fall through to the value-changed path below.
    if (!valueChanged && oldValue !== '') {
      // Verification strategy: set to verified without updating checksum
      if (options.strategy === 'verification') {
        const verifiedStatus: TranslationStatus = 'verified';

        // Update status but keep existing checksum
        if (!trackerMeta[entryKey]) {
          trackerMeta[entryKey] = {};
        }

        if (!trackerMeta[entryKey][locale]) {
          trackerMeta[entryKey][locale] = {
            checksum: entryMeta?.[locale]?.checksum || calculateChecksum(oldValue),
            baseChecksum: entryMeta?.[baseLocale]?.checksum || calculateChecksum(entry.source),
            status: verifiedStatus,
          };
        } else {
          trackerMeta[entryKey][locale].status = verifiedStatus;
        }
        dataModified = true;

        changes.push({
          key: resource.key,
          type: 'updated',
          oldValue,
          newValue: resource.value,
          oldStatus,
          newStatus: verifiedStatus,
        });
        continue;
      }

      // Update strategy: preserve existing status
      if (options.strategy === 'update') {
        changes.push({
          key: resource.key,
          type: 'updated',
          oldValue,
          newValue: resource.value,
          oldStatus,
          newStatus: oldStatus || 'translated',
        });
        continue;
      }

      // Translation-service: value is unchanged. When `preserveStatus` is explicitly set to
      // `true` and the source data carries a status, honour it (same as the value-changed path).
      // Otherwise, leave the status as-is — the translation service only changes status when
      // it supplies a new value.
      if (options.strategy === 'translation-service') {
        const resolvedStatus: TranslationStatus = shouldUseSourceStatus(options, resource)
          ? resource.status
          : oldStatus || 'translated';

        if (resolvedStatus !== oldStatus) {
          if (!trackerMeta[entryKey]) {
            trackerMeta[entryKey] = {};
          }

          if (!trackerMeta[entryKey][locale]) {
            trackerMeta[entryKey][locale] = {
              checksum: entryMeta?.[locale]?.checksum || calculateChecksum(oldValue),
              baseChecksum: entryMeta?.[baseLocale]?.checksum || calculateChecksum(entry.source),
              status: resolvedStatus,
            };
          } else {
            trackerMeta[entryKey][locale].status = resolvedStatus;
          }
          dataModified = true;
        }

        changes.push({
          key: resource.key,
          type: 'updated',
          oldValue,
          newValue: resource.value,
          oldStatus,
          newStatus: resolvedStatus,
        });
        continue;
      }

      // Migration: prefer the status carried in the imported data when `shouldUseSourceStatus`
      // is satisfied, otherwise fall back to preserving the existing status.
      const resolvedStatus: TranslationStatus = shouldUseSourceStatus(options, resource)
        ? resource.status
        : oldStatus || 'translated';

      if (resolvedStatus !== oldStatus) {
        if (!trackerMeta[entryKey]) {
          trackerMeta[entryKey] = {};
        }

        if (!trackerMeta[entryKey][locale]) {
          trackerMeta[entryKey][locale] = {
            checksum: entryMeta?.[locale]?.checksum || calculateChecksum(oldValue),
            baseChecksum: entryMeta?.[baseLocale]?.checksum || calculateChecksum(entry.source),
            status: resolvedStatus,
          };
        } else {
          trackerMeta[entryKey][locale].status = resolvedStatus;
        }
        dataModified = true;
      }

      changes.push({
        key: resource.key,
        type: 'updated',
        oldValue,
        newValue: resource.value,
        oldStatus,
        newStatus: resolvedStatus,
      });
      continue;
    }

    // Update the value
    entry[locale] = resource.value;
    dataModified = true;

    // Update comment if flag is set and comment is provided
    if (options.updateComments && resource.comment !== undefined) {
      if (resource.comment) {
        if (entry.comment !== resource.comment) {
          entry.comment = resource.comment;
          dataModified = true;
        }
      } else if (entry.comment !== undefined) {
        delete entry.comment;
        dataModified = true;
      }
    }

    // Update tags if flag is set and tags are provided
    if (options.updateTags && resource.tags !== undefined) {
      if (resource.tags.length > 0) {
        if (JSON.stringify([...(entry.tags ?? [])].sort()) !== JSON.stringify([...(resource.tags ?? [])].sort())) {
          entry.tags = resource.tags;
          dataModified = true;
        }
      } else if (entry.tags !== undefined) {
        delete entry.tags;
        dataModified = true;
      }
    }

    // Recalculate checksum
    const newChecksum = calculateChecksum(resource.value);

    // Get base checksum from metadata
    const baseChecksum = entryMeta?.[baseLocale]?.checksum || calculateChecksum(entry.source);

    // Determine status based on strategy
    let newStatus: TranslationStatus;
    if (shouldUseSourceStatus(options, resource)) {
      // Use status from imported data when preserve-status is active or strategy is migration
      newStatus = resource.status;
    } else {
      // Strategy-specific status determination
      switch (options.strategy) {
        case 'verification':
          // Verification with value change: verified
          newStatus = 'verified';
          break;
        case 'update':
          // Update strategy: preserve existing status
          newStatus = oldStatus || 'translated';
          break;
        default:
          // Translation-service and migration (no source status): set to translated
          newStatus = 'translated';
          break;
      }
    }

    // Update metadata
    if (!trackerMeta[entryKey]) {
      trackerMeta[entryKey] = {};
    }

    const newMetadata: LocaleMetadata = {
      checksum: newChecksum,
      baseChecksum,
      status: newStatus,
    };

    trackerMeta[entryKey][locale] = newMetadata;

    changes.push({
      key: resource.key,
      type: valueChanged ? 'value-changed' : 'updated',
      oldValue,
      newValue: resource.value,
      oldStatus,
      newStatus,
    });
  }

  // Write files once for the entire group, but only when in-memory state was actually mutated.
  // Logging an 'updated' change (e.g. update strategy with unchanged value) does not imply a
  // disk write is needed — `dataModified` is the authoritative signal for that.
  if (!dryRun && dataModified) {
    // Ensure folder exists (important for created resources)
    const folderPath = dirname(group.entryResourcePath);
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }

    writeFileSync(group.entryResourcePath, JSON.stringify(resourceEntries, null, 2));
    writeFileSync(group.entryMetaPath, JSON.stringify(trackerMeta, null, 2));

    filesModified.add(group.entryResourcePath);
    filesModified.add(group.entryMetaPath);
  }

  return changes;
}
