import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type BundleDefinition,
  hasTypeDistConfigured,
  type TokenCasing,
  validateJavaScriptIdentifier,
} from '@simoncodes-ca/domain';
import { BundleHierarchicalConflictError } from '../../errors/internal';
import type { BundleTypeOutcome } from '../generate-bundle';
import { resolveBundleSettings } from '../resolve-bundle-settings';
import { generateFileHeader } from './file-header';
import { buildTypeHierarchy, serializeHierarchy } from './hierarchy-builder';

export interface GenerateBundleTypesParams {
  readonly bundleKey: string;
  readonly definition: BundleDefinition;
  /** The bundle's keys, from the Bundle Selection (any order; the file lists them sorted). */
  readonly keys: readonly string[];
  /** Resolved casing: CLI override → bundle config → global config → default. */
  readonly tokenCasing: TokenCasing;
  /** CLI override for the constant name; wins over `definition.tokenConstantName`. */
  readonly tokenConstantName?: string;
  /** The project directory `typeDistFile` resolves against. Default: `process.cwd()`. */
  readonly cwd?: string;
}

/**
 * Writes a bundle's type file: the keys as an `as const` tree plus its type alias, at
 * `typeDistFile` (or the deprecated `typeDist`). Selecting the keys is the caller's
 * job (see Bundle Selection). Returns a not-configured or skipped outcome when there are no
 * configured files or keys, and a failed outcome for a path that does not end in `.ts`, a path that is a directory, or an
 * invalid constant name. Hierarchical conflicts throw `BundleHierarchicalConflictError` before writes.
 */
export function generateBundleTypes(params: GenerateBundleTypesParams): BundleTypeOutcome {
  const { bundleKey, definition: bundleDef, tokenCasing, tokenConstantName } = params;

  const resolvedTypeDistFile = bundleTypeOutputFile(bundleDef);

  try {
    if (!hasTypeDistConfigured(bundleDef) || !resolvedTypeDistFile) {
      return {
        status: 'not-configured',
      };
    }

    // Validate: typeDistFile must end with .ts (checked before resolving to an absolute path
    // so the error message reflects the value as configured, not the resolved path)
    if (!resolvedTypeDistFile.endsWith('.ts')) {
      return {
        status: 'failed',
        reason: `typeDistFile must end with a .ts extension (e.g. './src/types/tokens.ts'), but got: ${resolvedTypeDistFile}`,
      };
    }

    // resolvedTypeDistFile is narrowed to string by the guard above
    const outputPath = path.resolve(params.cwd ?? process.cwd(), resolvedTypeDistFile);

    // Validate: typeDistFile must not point to an existing directory
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
      return {
        status: 'failed',
        reason: `typeDistFile must be a file path (e.g. './src/types/tokens.ts'), but '${resolvedTypeDistFile}' resolves to a directory at: ${outputPath}`,
      };
    }

    const sortedKeys = [...params.keys].sort();

    if (sortedKeys.length === 0) {
      return {
        status: 'skipped',
        reason: 'empty-bundle',
      };
    }

    const resolvedConstantName = resolveBundleSettings(bundleKey, {}, bundleDef, {
      tokenConstantName,
    }).tokenConstantName;
    const explicitName = tokenConstantName ?? bundleDef.tokenConstantName;
    const validationError = explicitName ? validateJavaScriptIdentifier(explicitName) : undefined;
    if (validationError) {
      return {
        status: 'failed',
        reason: `Invalid tokenConstantName for bundle '${bundleKey}': ${validationError}`,
      };
    }

    // Generate content
    const hierarchy = buildTypeHierarchy(sortedKeys, tokenCasing, bundleKey);
    const fileContent = `${generateFileHeader(bundleKey)}\n\n${serializeHierarchy(hierarchy, resolvedConstantName, bundleKey)}`;

    const outputDir = path.dirname(outputPath);

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(outputPath, fileContent, 'utf-8');

    return {
      status: 'written',
      path: path
        .relative(params.cwd ?? process.cwd(), outputPath)
        .split(path.sep)
        .join('/'),
      keysCount: sortedKeys.length,
    };
  } catch (error) {
    if (error instanceof BundleHierarchicalConflictError) throw error;
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Shared output path for planning and generation, including saved legacy definitions. */
export function bundleTypeOutputFile(definition: BundleDefinition): string | undefined {
  const legacy = (definition as BundleDefinition & { typeDist?: unknown }).typeDist;
  return definition.typeDistFile ?? (typeof legacy === 'string' ? legacy : undefined);
}

export function legacyTypeDistWarning(bundleKey: string, definition: BundleDefinition): string | undefined {
  const legacyTypeDist = (definition as BundleDefinition & { typeDist?: unknown }).typeDist;
  return typeof legacyTypeDist === 'string' && !definition.typeDistFile
    ? `Warning: Bundle '${bundleKey}': 'typeDist' is deprecated and will be removed in the next major version. Please rename to 'typeDistFile' in your .lingo-tracker.json config.`
    : undefined;
}
