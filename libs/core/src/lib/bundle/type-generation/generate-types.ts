import * as fs from 'fs';
import * as path from 'path';
import { LingoTrackerConfig } from '../../../config/lingo-tracker-config';
import { loadCollectionResources } from '../resource-loader';
import { matchesPattern } from '../pattern-matcher';
import { matchesTags } from '../tag-filter';
import { buildTypeHierarchy, serializeHierarchy } from './hierarchy-builder';
import { generateFileHeader } from './file-header';
import { bundleKeyToConstantName } from './key-transformer';

export interface GenerateTypesResult {
    bundleKey: string;
    typeDist: string | null;
    keysCount: number;
    fileGenerated: boolean;
    skippedReason?: 'no-typeDist' | 'empty-bundle';
}

export async function generateBundleTypes(
    bundleKey: string,
    config: LingoTrackerConfig
): Promise<GenerateTypesResult> {
    const bundleDef = config.bundles?.[bundleKey];

    if (!bundleDef || !bundleDef.typeDist) {
        return {
            bundleKey,
            typeDist: null,
            keysCount: 0,
            fileGenerated: false,
            skippedReason: 'no-typeDist',
        };
    }

    // Collect all keys for the bundle (reusing logic from generate-bundle)
    // We don't need to process values, just keys
    const allKeys = new Set<string>();
    const collections =
        bundleDef.collections === 'All'
            ? Object.keys(config.collections).map((name) => ({
                name,
                entriesSelectionRules: 'All' as const,
                bundledKeyPrefix: undefined,
            }))
            : bundleDef.collections;

    for (const collectionDef of collections) {
        const collectionConfig = config.collections[collectionDef.name];

        if (!collectionConfig) {
            console.warn(
                `Collection '${collectionDef.name}' not found in configuration`
            );
            continue;
        }

        // Load resources (using base locale as source of truth for keys)
        const resources = loadCollectionResources(
            collectionConfig.translationsFolder,
            config.baseLocale,
            config.baseLocale
        );

        for (const resource of resources) {
            // Apply filters
            let isMatch = false;

            if (collectionDef.entriesSelectionRules === 'All') {
                isMatch = true;
            } else {
                for (const rule of collectionDef.entriesSelectionRules) {
                    if (
                        matchesPattern(resource.key, rule.matchingPattern) &&
                        matchesTags(
                            resource.tags || [],
                            rule.matchingTags,
                            rule.matchingTagOperator
                        )
                    ) {
                        isMatch = true;
                        break;
                    }
                }
            }

            if (isMatch) {
                // Apply prefix if configured
                const finalKey = collectionDef.bundledKeyPrefix
                    ? `${collectionDef.bundledKeyPrefix}.${resource.key}`
                    : resource.key;

                allKeys.add(finalKey);
            }
        }
    }

    const sortedKeys = Array.from(allKeys).sort();

    if (sortedKeys.length === 0) {
        console.warn(
            `Warning: Bundle '${bundleKey}' is empty. Skipping type generation.`
        );
        return {
            bundleKey,
            typeDist: bundleDef.typeDist,
            keysCount: 0,
            fileGenerated: false,
            skippedReason: 'empty-bundle',
        };
    }

    // Generate content
    const hierarchy = buildTypeHierarchy(sortedKeys);
    const constantName = bundleKeyToConstantName(bundleKey);
    const fileContent =
        generateFileHeader(bundleKey) +
        '\n\n' +
        serializeHierarchy(hierarchy, constantName);

    // Resolve output path
    // If typeDist is relative, resolve it relative to the config file location (which we don't have directly here, 
    // but usually we assume CWD or we'd need the config path passed in. 
    // For now, we'll resolve relative to CWD as is standard for CLI tools)
    const outputPath = path.resolve(bundleDef.typeDist);
    const outputDir = path.dirname(outputPath);

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(outputPath, fileContent, 'utf-8');

    return {
        bundleKey,
        typeDist: outputPath,
        keysCount: sortedKeys.length,
        fileGenerated: true,
    };
}
