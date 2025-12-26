import { ExportOptions, ExportResult, FilteredResource } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Exports resources to JSON format.
 */
export function exportToJson(
    resources: FilteredResource[],
    options: ExportOptions,
    baseLocale?: string
): ExportResult {
    const result: ExportResult = {
        format: 'json',
        filesCreated: [],
        resourcesExported: 0,
        warnings: [],
        errors: [],
        collections: options.collections || [],
        locales: options.locales || [],
        outputDirectory: options.outputDirectory,
        omittedResources: [],
        malformedFiles: [],
        hierarchicalConflicts: [],
    };

    // Group resources by locale
    const resourcesByLocale = new Map<string, FilteredResource[]>();
    for (const resource of resources) {
        if (!resourcesByLocale.has(resource.locale)) {
            resourcesByLocale.set(resource.locale, []);
        }
        resourcesByLocale.get(resource.locale)?.push(resource);
    }

    for (const [locale, localeResources] of resourcesByLocale.entries()) {
        try {
            if (options.onProgress) {
                options.onProgress(`Processing ${locale} (${localeResources.length} resources)`);
            }

            const filename = getFilename(locale, options, baseLocale);
            const filePath = path.join(options.outputDirectory, filename);

            let content: Record<string, any>;
            const conflicts: string[] = [];

            if (options.jsonStructure === 'flat') {
                content = buildFlatStructure(localeResources, options);
            } else {
                // Default to hierarchical
                content = buildHierarchicalStructure(localeResources, options, conflicts);
            }

            if (conflicts.length > 0) {
                result.hierarchicalConflicts.push(...conflicts.map(c => `[${locale}] ${c}`));
            }

            if (fs.existsSync(filePath)) {
                result.warnings.push(`Overwriting existing file: ${filename}`);
            }

            if (!options.dryRun) {
                if (options.onProgress) {
                    options.onProgress(`Writing ${filePath}`);
                }
                fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
            }

            result.filesCreated.push(filename);
            result.resourcesExported += localeResources.length;

        } catch (error) {
            result.errors.push(`Failed to export locale ${locale}: ${(error as Error).message}`);
        }
    }

    return result;
}

function getFilename(locale: string, options: ExportOptions, baseLocale?: string): string {
    if (options.filenamePattern) {
        let name = options.filenamePattern
            .replace('{locale}', locale)
            .replace('{target}', locale) // Alias for locale in JSON context
            .replace('{date}', new Date().toISOString().split('T')[0]);

        if (baseLocale) {
            name = name.replace('{source}', baseLocale);
        }

        if (!name.endsWith('.json')) {
            name += '.json';
        }
        return name;
    }
    return `${locale}.json`;
}

export function buildFlatStructure(
    resources: FilteredResource[],
    options: ExportOptions
): Record<string, any> {
    const result: Record<string, any> = {};

    for (const res of resources) {
        result[res.key] = formatValue(res, options);
    }

    return result;
}

export function buildHierarchicalStructure(
    resources: FilteredResource[],
    options: ExportOptions,
    conflicts: string[]
): Record<string, any> {
    const result: Record<string, any> = {};

    // Sort resources by key length to process shorter keys first (parents before children)
    // Actually, processing order matters for conflict detection.
    // If we have 'a' and 'a.b', and we process 'a' first, we set result['a'] = value.
    // Then 'a.b' comes, we try to access result['a'] and see it's not an object (or it is a value object).

    for (const res of resources) {
        const parts = res.key.split('.');
        let current = result;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;

            if (isLast) {
                // We are at the leaf, assign value
                if (current[part] !== undefined) {
                    // Conflict: Key already exists. 
                    // If it's an object, it means we have a parent collision (e.g. 'a.b' existed, now adding 'a').
                    // But since we are at the leaf of 'a', 'a' is the key.
                    // If current[part] is an object, it means 'a' was already created as a parent for something else.
                    if (typeof current[part] === 'object' && !isRichValue(current[part])) {
                        conflicts.push(`${res.key} conflicts with existing children`);
                    } else {
                        // Overwrite or duplicate key?
                        // Last write wins, but warn?
                        // For now, just overwrite.
                    }
                }
                current[part] = formatValue(res, options);
            } else {
                // We are traversing
                if (current[part] === undefined) {
                    current[part] = {};
                }

                // If current[part] exists but is not an object (it's a leaf value from a previous key),
                // or it is a rich value object (which is technically an object but conceptually a leaf).
                if (typeof current[part] !== 'object' || isRichValue(current[part])) {
                    conflicts.push(`${res.key} conflicts with parent ${parts.slice(0, i + 1).join('.')}`);
                    // We can't continue traversing down a leaf.
                    // We have to stop or overwrite.
                    // Requirement says: "Hierarchical format will error if a key is both a parent and leaf value"
                    // "Resource is still exported but marked as problematic" - this implies we might skip it or do something best-effort.
                    // Let's skip this resource to avoid crashing, and log conflict.
                    break;
                }

                current = current[part];
            }
        }
    }

    return result;
}

function isRichValue(obj: any): boolean {
    return obj && typeof obj === 'object' && 'value' in obj && Object.keys(obj).every(k =>
        ['value', 'baseValue', 'comment', 'status', 'tags'].includes(k)
    );
}

function formatValue(resource: FilteredResource, options: ExportOptions): any {
    if (options.richJson) {
        const richObj: any = {
            value: resource.value
        };

        if (options.includeBase && resource.baseValue) {
            richObj.baseValue = resource.baseValue;
        }

        if (options.includeComment && resource.comment) {
            richObj.comment = resource.comment;
        }

        if (options.includeStatus) {
            richObj.status = resource.status;
        }

        if (options.includeTags && resource.tags && resource.tags.length > 0) {
            richObj.tags = resource.tags;
        }

        return richObj;
    } else {
        // Simple value
        if (options.includeBase) {
            // Special case: --include-base without --rich
            return {
                value: resource.value,
                baseValue: resource.baseValue
            };
        }
        return resource.value;
    }
}
