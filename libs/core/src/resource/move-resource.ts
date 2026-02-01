import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { addResource } from './add-resource';
import { deleteResource } from './delete-resource';
import {
  resolveResourceKey,
  splitResolvedKey,
  validateKey,
} from './resource-key';
import { ResourceEntries } from './resource-entry';
import { TranslationStatus } from './translation-status';
import { RESOURCE_ENTRIES_FILENAME } from '../constants';

export interface MoveResourceParams {
  source: string;
  destination: string;
  override?: boolean;
  destinationTranslationsFolder?: string;
}

export interface MoveResourceResult {
  movedCount: number;
  warnings: string[];
  errors: string[];
}

/**
 * Moves resources from source to destination.
 * Supports single key move and wildcard pattern move (ending with *).
 */
export function moveResource(
  translationsFolder: string,
  params: MoveResourceParams,
): MoveResourceResult {
  const {
    source,
    destination,
    override = false,
    destinationTranslationsFolder,
  } = params;
  const targetFolder = destinationTranslationsFolder || translationsFolder;

  if (source.endsWith('*')) {
    return moveResourcesByPattern(
      translationsFolder,
      source,
      destination,
      override,
      targetFolder,
    );
  } else {
    return moveSingleResource(
      translationsFolder,
      source,
      destination,
      override,
      targetFolder,
    );
  }
}

function moveSingleResource(
  sourceTranslationsFolder: string,
  sourceKey: string,
  destinationKey: string,
  override: boolean,
  destinationTranslationsFolder: string,
): MoveResourceResult {
  const result: MoveResourceResult = {
    movedCount: 0,
    warnings: [],
    errors: [],
  };

  try {
    validateKey(sourceKey);
    validateKey(destinationKey);
  } catch (error) {
    result.errors.push((error as Error).message);
    return result;
  }

  // 1. Check if source exists
  const sourceResolved = resolveResourceKey(sourceKey);
  const { folderPath: srcFolder, entryKey: srcEntryKey } =
    splitResolvedKey(sourceResolved);
  const srcFullPath = srcFolder.length
    ? join(sourceTranslationsFolder, ...srcFolder)
    : sourceTranslationsFolder;
  const srcResourcePath = resolve(srcFullPath, RESOURCE_ENTRIES_FILENAME);

  if (!existsSync(srcResourcePath)) {
    result.errors.push(`Source resource file not found for key: ${sourceKey}`);
    return result;
  }

  let sourceEntries: ResourceEntries;
  try {
    sourceEntries = JSON.parse(readFileSync(srcResourcePath, 'utf8'));
  } catch {
    result.errors.push(`Failed to read source file for key: ${sourceKey}`);
    return result;
  }

  if (!(srcEntryKey in sourceEntries)) {
    result.errors.push(`Source key not found: ${sourceKey}`);
    return result;
  }

  const sourceData = sourceEntries[srcEntryKey];

  // 2. Check if destination exists (Collision Check)
  const destResolved = resolveResourceKey(destinationKey);
  const { folderPath: destFolder, entryKey: destEntryKey } =
    splitResolvedKey(destResolved);
  const destFullPath = destFolder.length
    ? join(destinationTranslationsFolder, ...destFolder)
    : destinationTranslationsFolder;
  const destResourcePath = resolve(destFullPath, RESOURCE_ENTRIES_FILENAME);

  if (existsSync(destResourcePath)) {
    try {
      const destEntries: ResourceEntries = JSON.parse(
        readFileSync(destResourcePath, 'utf8'),
      );
      if (destEntryKey in destEntries && !override) {
        result.warnings.push(
          `Destination key already exists: ${destinationKey}. Use override option to force move.`,
        );
        return result;
      }
    } catch {
      // Ignore read error on dest, addResource will handle or fail
    }
  }

  // 3. Perform Move
  const translations: Array<{
    locale: string;
    value: string;
    status: TranslationStatus;
  }> = [];

  Object.keys(sourceData).forEach((key) => {
    if (key !== 'source' && key !== 'comment' && key !== 'tags') {
      translations.push({
        locale: key,
        value: sourceData[key] as string,
        status: 'translated',
      });
    }
  });

  try {
    addResource(destinationTranslationsFolder, {
      key: destinationKey,
      baseValue: sourceData.source,
      comment: sourceData.comment,
      tags: sourceData.tags,
      translations: translations,
    });
  } catch (error) {
    result.errors.push(
      `Failed to create destination resource: ${(error as Error).message}`,
    );
    return result;
  }

  // Delete from source
  try {
    deleteResource(sourceTranslationsFolder, { keys: [sourceKey] });
  } catch (error) {
    result.warnings.push(
      `Resource moved to ${destinationKey} but failed to delete source ${sourceKey}: ${
        (error as Error).message
      }`,
    );
    // Even if delete failed, we count it as moved (or partially moved)
    result.movedCount++;
    return result;
  }

  result.movedCount++;
  return result;
}

function moveResourcesByPattern(
  sourceTranslationsFolder: string,
  pattern: string,
  destinationKey: string,
  override: boolean,
  destinationTranslationsFolder: string,
): MoveResourceResult {
  const result: MoveResourceResult = {
    movedCount: 0,
    warnings: [],
    errors: [],
  };

  const prefix = pattern.slice(0, -1); // remove '*'
  const cleanPrefix = prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;

  const keysToMove: string[] = [];

  // Helper to recursively scan
  function scanFolder(currentPath: string, currentKeyPrefix: string) {
    if (!existsSync(currentPath)) return;

    // Check for resources in this folder
    const resourcePath = join(currentPath, RESOURCE_ENTRIES_FILENAME);
    if (existsSync(resourcePath)) {
      try {
        const entries: ResourceEntries = JSON.parse(
          readFileSync(resourcePath, 'utf8'),
        );
        Object.keys(entries).forEach((key) => {
          keysToMove.push(`${currentKeyPrefix}.${key}`);
        });
      } catch (_e) {
        result.errors.push(`Failed to read file at ${resourcePath}`);
      }
    }

    // Check for subdirectories
    const items = readdirSync(currentPath);
    for (const item of items) {
      const itemPath = join(currentPath, item);
      if (statSync(itemPath).isDirectory()) {
        scanFolder(itemPath, `${currentKeyPrefix}.${item}`);
      }
    }
  }

  const rootFolderParts = cleanPrefix.split('.');
  const rootFolderPath = join(sourceTranslationsFolder, ...rootFolderParts);

  if (cleanPrefix.length > 0) {
    try {
      validateKey(cleanPrefix);
    } catch (error) {
      result.errors.push((error as Error).message);
      return result;
    }
  }

  if (existsSync(rootFolderPath)) {
    scanFolder(rootFolderPath, cleanPrefix);
  } else {
    result.warnings.push(
      `No folder found for prefix ${cleanPrefix}. Nothing moved.`,
    );
    return result;
  }

  // Move each key
  for (const sourceKey of keysToMove) {
    const suffix = sourceKey.slice(cleanPrefix.length + 1); // +1 for dot
    const newKey = `${destinationKey}.${suffix}`;

    const singleResult = moveSingleResource(
      sourceTranslationsFolder,
      sourceKey,
      newKey,
      override,
      destinationTranslationsFolder,
    );

    result.movedCount += singleResult.movedCount;
    result.warnings.push(...singleResult.warnings);
    result.errors.push(...singleResult.errors);
  }

  return result;
}
