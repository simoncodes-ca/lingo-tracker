import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ResourceEntries } from './resource-entry';
import { TrackerMetadata } from './tracker-metadata';
import {
    validateKey,
    validateTargetFolder,
    resolveResourceKey,
    splitResolvedKey,
} from './resource-key';
import { calculateChecksum } from './checksum';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../constants';

export interface EditResourceOptions {
    key: string;
    targetFolder?: string;
    baseValue?: string;
    comment?: string;
    tags?: string[];
    locales?: Record<string, { value: string }>;
    baseLocale?: string;
    cwd?: string;
}

export interface EditResourceResult {
    resolvedKey: string;
    updated: boolean;
    message?: string;
}

export function editResource(
    translationsFolder: string,
    options: EditResourceOptions
): EditResourceResult {
    const { cwd = process.cwd(), baseLocale = 'en' } = options;

    validateKey(options.key);
    if (options.targetFolder) {
        validateTargetFolder(options.targetFolder);
    }

    const resolvedKey = resolveResourceKey(options.key, options.targetFolder);
    const { folderPath, entryKey } = splitResolvedKey(resolvedKey);

    const fullFolderPath = folderPath.length
        ? join(translationsFolder, ...folderPath)
        : translationsFolder;

    const entryResourcePath = resolve(cwd, fullFolderPath, RESOURCE_ENTRIES_FILENAME);
    const entryMetaPath = resolve(cwd, fullFolderPath, TRACKER_META_FILENAME);

    if (!existsSync(entryResourcePath) || !existsSync(entryMetaPath)) {
        throw new Error(`Resource not found: ${resolvedKey}`);
    }

    const resourceEntries: ResourceEntries = loadFile(entryResourcePath);
    const trackerMeta: TrackerMetadata = loadFile(entryMetaPath);

    if (!resourceEntries[entryKey] || !trackerMeta[entryKey]) {
        throw new Error(`Resource not found: ${resolvedKey}`);
    }

    const resourceEntry = resourceEntries[entryKey];
    const metaEntry = trackerMeta[entryKey];
    let hasChanges = false;

    // 1. Update Base Value
    if (options.baseValue !== undefined && options.baseValue !== resourceEntry.source) {
        resourceEntry.source = options.baseValue;
        const newBaseChecksum = calculateChecksum(options.baseValue);

        // Update base locale checksum
        if (!metaEntry[baseLocale]) {
            // Should not happen if resource exists, but handle gracefully
            metaEntry[baseLocale] = { checksum: newBaseChecksum };
        } else {
            metaEntry[baseLocale].checksum = newBaseChecksum;
        }

        // Update non-base locales
        Object.keys(metaEntry).forEach((locale) => {
            if (locale !== baseLocale) {
                metaEntry[locale].baseChecksum = newBaseChecksum;
                metaEntry[locale].status = 'stale';
            }
        });
        hasChanges = true;
    }

    // 2. Update Comment
    if (options.comment !== undefined && options.comment !== resourceEntry.comment) {
        resourceEntry.comment = options.comment;
        hasChanges = true;
    }

    // 3. Update Tags
    if (options.tags !== undefined) {
        // Simple array comparison
        const currentTags = resourceEntry.tags || [];
        const newTags = options.tags;
        const isDifferent =
            currentTags.length !== newTags.length ||
            !currentTags.every((tag, index) => tag === newTags[index]);

        if (isDifferent) {
            resourceEntry.tags = newTags;
            hasChanges = true;
        }
    }

    // 4. Update Locales
    if (options.locales) {
        const currentBaseChecksum = metaEntry[baseLocale]?.checksum;

        Object.entries(options.locales).forEach(([locale, { value }]) => {
            if (locale === baseLocale) return; // Base value handled separately

            const currentValue = resourceEntry[locale];
            if (value !== currentValue) {
                resourceEntry[locale] = value;
                const newChecksum = calculateChecksum(value);

                if (!metaEntry[locale]) {
                    metaEntry[locale] = {
                        checksum: newChecksum,
                        baseChecksum: currentBaseChecksum,
                        status: 'translated'
                    };
                } else {
                    metaEntry[locale].checksum = newChecksum;
                    metaEntry[locale].baseChecksum = currentBaseChecksum;
                    // If explicitly verified logic is needed, it would go here. 
                    // For now, edit implies 'translated' unless we add a specific flag for verification status.
                    // But if the value changes, it usually means it's a new translation or correction.
                    // The spec says: Set `status` to `translated` unless explicitly set to `verified` via a trusted import/UI action.
                    // Since we don't have a 'verified' flag in options yet, we default to 'translated'.
                    metaEntry[locale].status = 'translated';
                }
                hasChanges = true;
            }
        });
    }

    if (hasChanges) {
        writeFileSync(entryResourcePath, JSON.stringify(resourceEntries, null, 2));
        writeFileSync(entryMetaPath, JSON.stringify(trackerMeta, null, 2));
        return { resolvedKey, updated: true };
    }

    return { resolvedKey, updated: false, message: 'No changes detected' };
}

function loadFile<T>(filePath: string): T {
    try {
        const content = readFileSync(filePath, 'utf8');
        return JSON.parse(content) as T;
    } catch {
        throw new Error(`Failed to read or parse file: ${filePath}`);
    }
}
