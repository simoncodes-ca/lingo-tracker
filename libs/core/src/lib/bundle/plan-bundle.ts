/**
 * Dry-run planner for bundle generation.
 *
 * `planBundle` computes everything `generateBundle` would do — which files it
 * would write, how many keys each locale gets, which keys collide between
 * collections — without touching the filesystem. It never calls type
 * generation; the types file is only described.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type BundleDefinition,
  bundleOutputFile,
  hasTypeDistConfigured,
  type TokenCasing,
} from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import type { BundleSelection } from './bundle-selection';
import {
  type BundleRunOutputOptions,
  bundleRunConflicts,
  bundleRunWarnings,
  type PreparedBundleRun,
  prepareBundleRun,
} from './prepare-bundle-run';
import { bundleTypeOutputFile } from './type-generation/generate-types';
import { segmentToPropertyName, splitKeyIntoSegments } from './type-generation/key-transformer';

export interface PlanBundleParams extends BundleRunOutputOptions {
  readonly bundleKey: string;
  readonly bundleDefinition: BundleDefinition;
  readonly config: LingoTrackerConfig;
  /** Subset of locales to plan for (defaults to `config.locales`). */
  readonly locales?: readonly string[];
  /** Override for token casing; same precedence as `generateBundle`. */
  readonly tokenCasing?: TokenCasing;
  /** Override for the generated constant name; same precedence as `generateBundle`. */
  readonly tokenConstantName?: string;
  /** Override for ICU → Transloco transformation; same precedence as `generateBundle`. */
  readonly transformICUToTransloco?: boolean;
  /**
   * The project directory (holding `.lingo-tracker.json`): translations folders and the planned
   * files resolve against it. Default: `process.cwd()`.
   */
  readonly cwd?: string;
}

export interface BundlePlanFile {
  /** Path as configured (relative or absolute), exactly what generation would use. */
  readonly path: string;
  /** Path resolved against `cwd`. */
  readonly absolutePath: string;
  readonly kind: 'bundle' | 'types';
  /** Present for `bundle` files only. */
  readonly locale?: string;
  /** Whether a file already exists at `absolutePath`. */
  readonly exists: boolean;
  /** Keys the file would contain. For the types file this is the base-locale key count. */
  readonly keysCount: number;
}

/** One bundled key, to show where a resource lands: the first key the selection produced. */
export interface BundlePlanExampleKey {
  readonly collectionName: string;
  readonly sourceKey: string;
  /** Key as it appears in the bundle output (after `bundledKeyPrefix`). */
  readonly bundledKey: string;
  /** Property path in the generated types constant; only when types are configured. */
  readonly tokenPath?: string;
}

export interface BundlePlan {
  readonly bundleKey: string;
  readonly locales: string[];
  readonly files: BundlePlanFile[];
  readonly keysPerLocale: Record<string, number>;
  /** Number of keys defined by more than one collection. */
  readonly conflictsCount: number;
  /** Keys defined by more than one collection. */
  readonly conflictKeys: string[];
  /**
   * Selected locale or base keys that are both a leaf and a parent, e.g. `buttons.ok`
   * alongside `buttons.ok.label`. Generation cannot build a hierarchy from
   * these, so a plan that reports any of them describes a bundle that would
   * fail. Each one is also echoed in `warnings`.
   */
  readonly hierarchicalConflicts: string[];
  /**
   * The first key the selection produced, in collection then folder order (from every collection's
   * base values). Absent when the bundle has no keys.
   */
  readonly exampleKey?: BundlePlanExampleKey;
  readonly warnings: string[];
}

/**
 * Plans a bundle run without writing anything. Core trims the supplied bundle key before validation.
 */
export function planBundle(params: PlanBundleParams): BundlePlan {
  return planPreparedBundle(prepareBundleRun({ ...params, source: 'supplied' }), params);
}

/** Describes the exact selections that generation will consume. */
export function planPreparedBundle(prepared: PreparedBundleRun, options: BundleRunOutputOptions = {}): BundlePlan {
  const { bundleKey, cwd } = prepared;
  const { definition: bundleDefinition, settings, locales: targetLocales } = prepared;
  const content = prepared.content();
  const warnings = bundleRunWarnings(prepared, content, options);
  const keysPerLocale: Record<string, number> = {};
  const files: BundlePlanFile[] = [];
  for (const { locale, selection } of content.locales) {
    const keysCount = selection.entries.size;
    keysPerLocale[locale] = keysCount;
    if (keysCount > 0) {
      files.push(describeFile(bundleOutputFile(bundleDefinition, locale), 'bundle', keysCount, cwd, locale));
    }
  }
  const { base, baseKeys } = content;
  if (options.debugKeysLocale && baseKeys.length > 0) {
    const locale = options.debugKeysLocale;
    keysPerLocale[locale] = baseKeys.length;
    files.push(describeFile(bundleOutputFile(bundleDefinition, locale), 'bundle', baseKeys.length, cwd, locale));
  }
  const typesConfigured = hasTypeDistConfigured(bundleDefinition);
  const typeFile = bundleTypeOutputFile(bundleDefinition);
  if (typesConfigured && typeFile && baseKeys.length > 0) {
    files.push(describeFile(typeFile, 'types', baseKeys.length, cwd));
  }
  const conflictKeys = [...base.conflicts].sort();
  const hierarchicalConflicts = bundleRunConflicts(prepared, content, options);

  const exampleKey = pickExampleKey(base, typesConfigured, settings.tokenConstantName, settings.tokenCasing);

  return {
    bundleKey,
    locales: [...targetLocales],
    files,
    keysPerLocale,
    conflictsCount: conflictKeys.length,
    conflictKeys,
    hierarchicalConflicts,
    exampleKey,
    warnings,
  };
}

function describeFile(
  filePath: string,
  kind: BundlePlanFile['kind'],
  keysCount: number,
  cwd: string,
  locale?: string,
): BundlePlanFile {
  const absolutePath = path.resolve(cwd, filePath);
  const file: BundlePlanFile = {
    path: filePath,
    absolutePath,
    kind,
    exists: fs.existsSync(absolutePath),
    keysCount,
  };
  return locale === undefined ? file : { ...file, locale };
}

function pickExampleKey(
  base: BundleSelection,
  typesConfigured: boolean,
  constantName: string,
  tokenCasing: TokenCasing,
): BundlePlanExampleKey | undefined {
  const [first] = base.entries;
  if (first === undefined) {
    return undefined;
  }

  const [firstKey, { origin }] = first;
  const example: BundlePlanExampleKey = {
    collectionName: origin.collectionName,
    sourceKey: origin.sourceKey,
    bundledKey: firstKey,
  };

  if (!typesConfigured) {
    return example;
  }

  const segments = splitKeyIntoSegments(firstKey).map((segment) => segmentToPropertyName(segment, tokenCasing));
  return { ...example, tokenPath: [constantName, ...segments].join('.') };
}
