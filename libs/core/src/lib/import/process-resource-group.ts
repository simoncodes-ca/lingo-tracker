import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ImportOptions, ImportChange } from './types';
import { ResourceEntries, ResourceEntry } from '../../resource/resource-entry';
import { TrackerMetadata } from '../../resource/tracker-metadata';
import { calculateChecksum } from '../../resource/checksum';
import { LocaleMetadata } from '../../resource/locale-metadata';
import { TranslationStatus } from '../../resource/translation-status';
import { ResourceGroup } from './resource-grouping';

/**
 * Processes a group of resources that belong to the same folder.
 *
 * This function is the core of the import operation. It handles batch processing of resources
 * that share the same resource_entries.json and tracker_meta.json files, minimizing file I/O
 * by loading and saving files once per folder instead of per resource.
 *
 * The function performs these operations for each resource in the group:
 * 1. **Resource Creation**: Creates new resources when `createMissing` is enabled and resource
 *    doesn't exist. Requires baseValue to be present.
 * 2. **Base Value Validation**: Compares imported baseValue against existing source values
 *    and warns on mismatches (when validateBase is enabled).
 * 3. **Value Change Detection**: Determines if translation value has changed.
 * 4. **Strategy-Specific Status Handling**:
 *    - `verification`: Sets status to 'verified' (even for unchanged values)
 *    - `update`: Preserves existing status
 *    - `translation-service`/`migration`: Sets status to 'translated'
 * 5. **Metadata Updates**: Updates comment and tags when corresponding flags are enabled.
 * 6. **Checksum Calculation**: Computes checksums for change tracking and stale detection.
 * 7. **File Writing**: Atomically writes both resource_entries.json and tracker_meta.json
 *    when changes are detected (unless in dry-run mode).
 *
 * The function maintains referential integrity by ensuring base locale metadata exists
 * and properly linking target locale metadata to the base checksum.
 *
 * @param group - The resource group containing all resources in the same folder with their
 *                file paths and entry keys
 * @param locale - Target locale code (e.g., 'es', 'fr', 'de')
 * @param baseLocale - Source locale code (typically 'en')
 * @param options - Import configuration including strategy, flags, and validation settings
 * @param dryRun - When true, performs all operations except file writes
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
  filesModified: Set<string>,
  warnings: string[]
): ImportChange[] {
  const changes: ImportChange[] = [];

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
      // Validate that we have a base value
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
      trackerMeta[entryKey][locale] = {
        checksum: newChecksum,
        baseChecksum,
        status: 'translated',
      };

      changes.push({
        key: resource.key,
        type: 'created',
        oldValue: '',
        newValue: resource.value,
        oldStatus: undefined,
        newStatus: 'translated',
      });

      continue;
    }

    const entry = resourceEntries[entryKey];
    const entryMeta = trackerMeta[entryKey];

    // Validate baseValue if present
    if (resource.baseValue && options.validateBase !== false) {
      const existingBase = entry.source;
      if (existingBase !== resource.baseValue) {
        warnings.push(
          `Base value mismatch for "${resource.key}": import has "${resource.baseValue}", ` +
          `LingoTracker has "${existingBase}" - preserving LingoTracker value`
        );
      }
    }

    // Get old value and status
    const oldValue = (entry[locale] as string) || '';
    const oldStatus = entryMeta?.[locale]?.status;

    // Check if value changed
    const valueChanged = oldValue !== resource.value;

    // Strategy-specific handling for unchanged values
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

      // Translation-service and migration: set to translated
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

    // Update the value
    entry[locale] = resource.value;

    // Update comment if flag is set and comment is provided
    if (options.updateComments && resource.comment !== undefined) {
      if (resource.comment) {
        entry.comment = resource.comment;
      } else {
        // Empty comment means remove it
        delete entry.comment;
      }
    }

    // Update tags if flag is set and tags are provided
    if (options.updateTags && resource.tags !== undefined) {
      if (resource.tags.length > 0) {
        entry.tags = resource.tags;
      } else {
        // Empty tags array means remove tags
        delete entry.tags;
      }
    }

    // Recalculate checksum
    const newChecksum = calculateChecksum(resource.value);

    // Get base checksum from metadata
    const baseChecksum = entryMeta?.[baseLocale]?.checksum || calculateChecksum(entry.source);

    // Determine status based on strategy
    let newStatus: TranslationStatus;
    if (options.preserveStatus && resource.status) {
      // Use status from import if preserve-status flag is set
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
        case 'translation-service':
        case 'migration':
        default:
          // Translation-service and migration: set to translated
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

  // Write files once for the entire group
  const hasChanges = changes.some(
    c => c.type === 'updated' || c.type === 'value-changed' || c.type === 'created'
  );

  if (!dryRun && hasChanges) {
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
