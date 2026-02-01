/**
 * Core bundle generation logic
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  BundleDefinition,
  CollectionBundleDefinition,
  EntrySelectionRule,
} from '../../config/bundle-definition';
import { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { loadCollectionResources, FlatResource } from './resource-loader';
import { matchesPattern } from './pattern-matcher';
import { matchesTags } from './tag-filter';
import { buildHierarchy } from './hierarchy-builder';
import {
  generateBundleTypes,
  GenerateTypesResult,
} from './type-generation/generate-types';

export interface GenerateBundleParams {
  readonly bundleKey: string;
  readonly bundleDefinition: BundleDefinition;
  readonly config: LingoTrackerConfig;
  readonly locales?: string[];
}

export interface GenerateBundleResult {
  readonly bundleKey: string;
  readonly filesGenerated: number;
  readonly warnings: string[];
  readonly localesProcessed: string[];
  readonly typeGenerationResult?: GenerateTypesResult;
}

/**
 * Generates translation bundle files for specified bundle configuration
 *
 * @param params - Bundle generation parameters
 * @returns Result with count of files generated and any warnings
 */
export async function generateBundle(
  params: GenerateBundleParams,
): Promise<GenerateBundleResult> {
  const { bundleKey, bundleDefinition, config, locales } = params;
  const warnings: string[] = [];
  const localesProcessed: string[] = [];

  const targetLocales = locales ?? config.locales;
  let filesGenerated = 0;

  for (const locale of targetLocales) {
    const bundleData = collectBundleData(
      bundleDefinition,
      config,
      locale,
      warnings,
    );

    if (Object.keys(bundleData).length === 0) {
      warnings.push(`Bundle '${bundleKey}' for locale '${locale}' is empty`);
      continue;
    }

    const hierarchicalData = buildHierarchy(bundleData);

    const outputPath = getBundleOutputPath(bundleDefinition, locale);
    writeBundleFile(outputPath, hierarchicalData);

    filesGenerated++;
    localesProcessed.push(locale);
  }

  // Generate types if configured
  let typeGenerationResult: GenerateTypesResult | undefined;
  if (bundleDefinition.typeDist) {
    try {
      typeGenerationResult = await generateBundleTypes(bundleKey, config);
      if (typeGenerationResult.fileGenerated) {
        // We don't increment filesGenerated here as it tracks bundle JSON files
        // But we could add a note to warnings or a new field if needed
      } else if (typeGenerationResult.skippedReason === 'empty-bundle') {
        warnings.push(
          `Type generation skipped for '${bundleKey}': Bundle is empty`,
        );
      }
    } catch (error) {
      warnings.push(
        `Type generation failed for '${bundleKey}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    bundleKey,
    filesGenerated,
    warnings,
    localesProcessed,
    typeGenerationResult,
  };
}

/**
 * Collects all bundle data for a locale by processing collections
 */
function collectBundleData(
  bundleDefinition: BundleDefinition,
  config: LingoTrackerConfig,
  locale: string,
  warnings: string[],
): Record<string, string> {
  const bundleData: Record<string, string> = {};

  const baseLocale = config.baseLocale;

  if (bundleDefinition.collections === 'All') {
    for (const [collectionName, collectionConfig] of Object.entries(
      config.collections,
    )) {
      const collectionBundleDef: CollectionBundleDefinition = {
        name: collectionName,
        entriesSelectionRules: 'All',
      };
      processCollection(
        collectionBundleDef,
        collectionConfig.translationsFolder,
        locale,
        baseLocale,
        bundleData,
      );
    }
  } else {
    for (const collectionBundleDef of bundleDefinition.collections) {
      const collectionConfig = config.collections[collectionBundleDef.name];

      if (!collectionConfig) {
        warnings.push(
          `Collection '${collectionBundleDef.name}' not found in config`,
        );
        continue;
      }

      processCollection(
        collectionBundleDef,
        collectionConfig.translationsFolder,
        locale,
        baseLocale,
        bundleData,
      );
    }
  }

  return bundleData;
}

/**
 * Processes a single collection and adds its entries to bundle data
 */
function processCollection(
  collectionDef: CollectionBundleDefinition,
  translationsFolder: string,
  locale: string,
  baseLocale: string,
  bundleData: Record<string, string>,
): void {
  const resources = loadCollectionResources(
    translationsFolder,
    locale,
    baseLocale,
  );
  const filteredResources = filterResources(resources, collectionDef);
  const mergeStrategy = collectionDef.mergeStrategy ?? 'merge';

  for (const resource of filteredResources) {
    const finalKey = collectionDef.bundledKeyPrefix
      ? `${collectionDef.bundledKeyPrefix}.${resource.key}`
      : resource.key;

    if (finalKey in bundleData) {
      if (mergeStrategy === 'override') {
        bundleData[finalKey] = resource.value;
      }
      // merge (default) - keep existing (first wins)
      // Skip to next resource since key already exists
    } else {
      // New key - add it
      bundleData[finalKey] = resource.value;
    }
  }
}

/**
 * Filters resources based on entry selection rules
 */
function filterResources(
  resources: FlatResource[],
  collectionDef: CollectionBundleDefinition,
): FlatResource[] {
  if (collectionDef.entriesSelectionRules === 'All') {
    return resources;
  }

  // Apply selection rules (TypeScript knows it's EntrySelectionRule[] here)
  const rules = collectionDef.entriesSelectionRules;
  return resources.filter((resource) => matchesAnyRule(resource, rules));
}

/**
 * Checks if resource matches any of the selection rules
 */
function matchesAnyRule(
  resource: FlatResource,
  rules: EntrySelectionRule[],
): boolean {
  return rules.some((rule) => {
    const patternMatch = matchesPattern(resource.key, rule.matchingPattern);
    const tagMatch = matchesTags(
      resource.tags,
      rule.matchingTags,
      rule.matchingTagOperator,
    );
    return patternMatch && tagMatch;
  });
}

/**
 * Determines output file path for bundle
 */
function getBundleOutputPath(
  bundleDefinition: BundleDefinition,
  locale: string,
): string {
  const fileName = bundleDefinition.bundleName.replace('{locale}', locale);

  // Handle subdirectory pattern (e.g., "{locale}/main")
  if (fileName.includes('/')) {
    return path.join(bundleDefinition.dist, fileName + '.json');
  }

  // Standard file pattern
  return path.join(bundleDefinition.dist, fileName + '.json');
}

/**
 * Writes bundle data to file
 */
function writeBundleFile(
  outputPath: string,
  data: Record<string, unknown>,
): void {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonContent = JSON.stringify(data, null, 2);
  fs.writeFileSync(outputPath, jsonContent, 'utf8');
}
