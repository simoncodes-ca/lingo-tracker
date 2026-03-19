import * as fs from 'fs';
import * as path from 'path';
import type { LingoTrackerConfig } from '../../../config/lingo-tracker-config';
import { hasTypeDistConfigured, type TokenCasing } from '../../../config/bundle-definition';
import { loadCollectionResources } from '../resource-loader';
import { matchesPattern } from '../pattern-matcher';
import { matchesTags } from '../tag-filter';
import { buildTypeHierarchy, serializeHierarchy } from './hierarchy-builder';
import { generateFileHeader } from './file-header';
import { bundleKeyToConstantName, constantNameToTypeName, validateJavaScriptIdentifier } from './key-transformer';

export interface GenerateTypesResult {
  bundleKey: string;
  typeDistFile: string | undefined;
  keysCount: number;
  fileGenerated: boolean;
  skippedReason?: 'not-configured' | 'empty-bundle';
  errorReason?: string;
}

export async function generateBundleTypes(
  bundleKey: string,
  config: LingoTrackerConfig,
  tokenCasing: TokenCasing = 'upperCase',
  tokenConstantName?: string,
): Promise<GenerateTypesResult> {
  const bundleDef = config.bundles?.[bundleKey];

  // Support deprecated 'typeDist' property — read the legacy value without mutating the config object
  const legacyTypeDist = (bundleDef as unknown as Record<string, unknown>)?.['typeDist'];
  const resolvedTypeDistFile =
    bundleDef?.typeDistFile ?? (typeof legacyTypeDist === 'string' ? legacyTypeDist : undefined);

  if (bundleDef && typeof legacyTypeDist === 'string' && !bundleDef.typeDistFile) {
    console.warn(
      `Warning: Bundle '${bundleKey}': 'typeDist' is deprecated and will be removed in the next major version. Please rename to 'typeDistFile' in your .lingo-tracker.json config.`,
    );
  }

  if (!bundleDef || !hasTypeDistConfigured(bundleDef) || !resolvedTypeDistFile) {
    return {
      bundleKey,
      typeDistFile: undefined,
      keysCount: 0,
      fileGenerated: false,
      skippedReason: 'not-configured',
    };
  }

  // Validate: typeDistFile must end with .ts (checked before resolving to an absolute path
  // so the error message reflects the value as configured, not the resolved path)
  if (!resolvedTypeDistFile.endsWith('.ts')) {
    return {
      bundleKey,
      typeDistFile: resolvedTypeDistFile,
      keysCount: 0,
      fileGenerated: false,
      errorReason: `typeDistFile must end with a .ts extension (e.g. './src/types/tokens.ts'), but got: ${resolvedTypeDistFile}`,
    };
  }

  // resolvedTypeDistFile is narrowed to string by the guard above
  const outputPath = path.resolve(resolvedTypeDistFile);

  // Validate: typeDistFile must not point to an existing directory
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
    return {
      bundleKey,
      typeDistFile: resolvedTypeDistFile,
      keysCount: 0,
      fileGenerated: false,
      errorReason: `typeDistFile must be a file path (e.g. './src/types/tokens.ts'), but '${resolvedTypeDistFile}' resolves to a directory at: ${outputPath}`,
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
      console.warn(`Collection '${collectionDef.name}' not found in configuration`);
      continue;
    }

    // Load resources (using base locale as source of truth for keys)
    const resources = loadCollectionResources(
      collectionConfig.translationsFolder,
      config.baseLocale,
      config.baseLocale,
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
            matchesTags(resource.tags || [], rule.matchingTags, rule.matchingTagOperator)
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
    console.warn(`Warning: Bundle '${bundleKey}' is empty. Skipping type generation.`);
    return {
      bundleKey,
      typeDistFile: resolvedTypeDistFile,
      keysCount: 0,
      fileGenerated: false,
      skippedReason: 'empty-bundle',
    };
  }

  // Resolve constant name: explicit override (from CLI or bundle config) → derive from bundle key
  const nameOverride = tokenConstantName ?? bundleDef.tokenConstantName;
  if (nameOverride) {
    const validationError = validateJavaScriptIdentifier(nameOverride);
    if (validationError) {
      return {
        bundleKey,
        typeDistFile: resolvedTypeDistFile,
        keysCount: 0,
        fileGenerated: false,
        errorReason: `Invalid tokenConstantName for bundle '${bundleKey}': ${validationError}`,
      };
    }
  }
  const resolvedConstantName = nameOverride ?? bundleKeyToConstantName(bundleKey);

  // Generate content
  const hierarchy = buildTypeHierarchy(sortedKeys, tokenCasing);
  const fileContent = `${generateFileHeader(bundleKey)}\n\n${serializeHierarchy(hierarchy, resolvedConstantName)}`;

  const outputDir = path.dirname(outputPath);

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write file
  fs.writeFileSync(outputPath, fileContent, 'utf-8');

  return {
    bundleKey,
    typeDistFile: outputPath,
    keysCount: sortedKeys.length,
    fileGenerated: true,
  };
}
