/**
 * Bundle generation: writes a bundle's JSON file per locale (and the debug-keys file and the type
 * file when asked) from the Bundle Selection.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildKeyTree, bundleOutputFile, hasTypeDistConfigured, type TokenCasing } from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { BundleHierarchicalConflictError } from '../errors/internal';
import type { RunOutcome } from '../run-outcome';
import { type BundleFindings, bundleFindings } from './bundle-findings';
import { bundleRunConflicts, bundleRunWarnings, type PreparedBundleRun } from './prepare-bundle-run';
import { type GenerateBundleTypesParams, generateBundleTypes } from './type-generation/generate-types';

export interface GenerateBundleParams {
  readonly bundleKey: string;
  readonly config: LingoTrackerConfig;
  readonly locales?: readonly string[];
  /** CLI-level override for token casing. Takes precedence over all config values. */
  readonly tokenCasing?: TokenCasing;
  /**
   * CLI-level override for the generated TypeScript constant name.
   * Takes precedence over `bundleDefinition.tokenConstantName`.
   * Must be a valid JavaScript identifier.
   */
  readonly tokenConstantName?: string;
  /**
   * CLI-level override for ICU to Transloco transformation.
   * Takes precedence over bundle config and global config.
   */
  readonly transformICUToTransloco?: boolean;
  /**
   * When set, emits an additional bundle file where every value equals its own
   * dot-delimited key. The value is the locale code used in the output filename
   * (e.g. `"99"` produces `main.99.json`). ICU transformation is intentionally
   * skipped for this bundle — the keys themselves have no ICU content.
   */
  readonly debugKeysLocale?: string;
  /**
   * Called before selecting each locale, before any output write (the debug-keys locale, when
   * requested, is included in `total` and emitted last).
   */
  readonly onProgress?: (event: BundleProgressEvent) => void;
  /**
   * The project directory (holding `.lingo-tracker.json`): translations folders, `dist` and
   * `typeDistFile` resolve against it. Default: `process.cwd()`.
   */
  readonly cwd?: string;
}

export interface BundleProgressEvent {
  /** Locale about to be selected (the debug-keys locale code for the debug file). */
  readonly locale: string;
  /** 1-based position of this locale in the run. */
  readonly index: number;
  /** Total number of files this run will attempt, including the debug-keys file. */
  readonly total: number;
  /** Output path for the locale being selected. */
  readonly file: string;
}

export interface GenerateBundleResult {
  readonly outcome: RunOutcome;
  readonly bundleKey: string;
  readonly filesGenerated: number;
  /** Every successfully written file, in write order, relative to `cwd` with `/` separators. An output outside `cwd` begins with `../`. */
  readonly writtenFiles: string[];
  readonly findings: BundleFindings;
  readonly localesProcessed: string[];
  /** Number of keys written per processed locale (empty locales are omitted). */
  readonly keysPerLocale: Record<string, number>;
}

export interface BundleWarning {
  readonly origin: 'generation' | 'config' | 'type';
  readonly message: string;
}

export type BundleTypeOutcome =
  | { readonly status: 'written'; readonly path: string; readonly keysCount: number }
  | { readonly status: 'skipped'; readonly reason: 'empty-bundle' }
  | { readonly status: 'failed'; readonly reason: string }
  | { readonly status: 'not-configured' };

/** Returns the outcome detail without status words, bundle key or output framing. */
export function bundleTypeOutcomeDetail(outcome: BundleTypeOutcome): string {
  switch (outcome.status) {
    case 'written':
      return `${outcome.path} (${outcome.keysCount} keys)`;
    case 'skipped': {
      const { reason } = outcome;
      switch (reason) {
        case 'empty-bundle':
          return 'bundle is empty';
        default: {
          const unhandledReason: never = reason;
          throw new Error(`Unknown bundle type skip reason: ${unhandledReason}`);
        }
      }
    }
    case 'not-configured':
      return 'no typeDistFile configured';
    case 'failed':
      return outcome.reason;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unknown bundle type outcome: ${unhandled}`);
    }
  }
}

/** Presentation-free warning for a failed or skipped type result; successful results have none. */
function describeTypeOutcome(bundleKey: string, outcome: BundleTypeOutcome): string | undefined {
  switch (outcome.status) {
    case 'failed':
    case 'skipped':
      return `Type generation ${outcome.status} for '${bundleKey}': ${bundleTypeOutcomeDetail(outcome)}`;
    case 'written':
    case 'not-configured':
      return undefined;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unknown bundle type outcome: ${unhandled}`);
    }
  }
}

/** The job service and run coordinator use an already prepared run. */
export async function generatePreparedBundle(
  prepared: PreparedBundleRun,
  options: Pick<GenerateBundleParams, 'debugKeysLocale' | 'onProgress'> = {},
): Promise<GenerateBundleResult> {
  const { bundleKey, cwd } = prepared;
  const { debugKeysLocale, onProgress } = options;
  const bundleDefinition = prepared.definition;
  const { tokenCasing } = prepared.settings;
  const total = prepared.locales.length + (debugKeysLocale ? 1 : 0);
  const progress = (locale: string, index: number): void =>
    onProgress?.({ locale, index, total, file: bundleOutputFile(bundleDefinition, locale) });
  const content = prepared.content({
    onLocale: progress,
    onBase: debugKeysLocale ? () => progress(debugKeysLocale, total) : undefined,
  });
  const conflicts = bundleRunConflicts(prepared, content, options);
  if (conflicts.length > 0) throw new BundleHierarchicalConflictError(bundleKey, conflicts);
  const warnings: BundleWarning[] = bundleRunWarnings(prepared, content, options).map((message) => ({
    origin: 'generation',
    message,
  }));
  const { baseKeys } = content;

  const localesProcessed: string[] = [];
  const writtenFiles: string[] = [];
  const keysPerLocale: Record<string, number> = {};

  const write = (locale: string, data: Record<string, unknown>, keysCount: number): void => {
    const outputFile = bundleOutputFile(bundleDefinition, locale);
    writeBundleFile(path.resolve(cwd, outputFile), data);
    writtenFiles.push(toProjectRelative(outputFile, cwd));
    localesProcessed.push(locale);
    keysPerLocale[locale] = keysCount;
  };

  content.locales.forEach(({ locale, selection, tree }) => {
    if (selection.entries.size === 0) {
      return;
    }
    write(locale, tree, selection.entries.size);
  });

  if (debugKeysLocale) {
    const keys = baseKeys;
    if (keys.length > 0) {
      write(debugKeysLocale, buildKeyTree(keys.map((key) => [key, key] as const)).tree, keys.length);
    }
  }

  const typeOutcome = hasTypeDistConfigured(bundleDefinition)
    ? generateTypes(
        {
          bundleKey,
          definition: prepared.definition,
          tokenCasing,
          tokenConstantName: prepared.tokenConstantNameOverride,
          cwd,
        },
        baseKeys,
      )
    : { status: 'not-configured' as const };

  if (typeOutcome.status === 'written') writtenFiles.push(typeOutcome.path);

  warnings.push(...prepared.warnings);
  const typeOutcomeWarning = describeTypeOutcome(bundleKey, typeOutcome);
  if (typeOutcomeWarning) warnings.push({ origin: 'type', message: typeOutcomeWarning });

  return {
    outcome: typeOutcome.status === 'failed' ? 'failed' : 'succeeded',
    bundleKey,
    filesGenerated: localesProcessed.length,
    writtenFiles,
    findings: bundleFindings(warnings, typeOutcome),
    localesProcessed,
    keysPerLocale,
  };
}

/** Reports type-file failures through the structured outcome. */
function generateTypes(params: Omit<GenerateBundleTypesParams, 'keys'>, keys: readonly string[]): BundleTypeOutcome {
  try {
    return generateBundleTypes({ ...params, keys });
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

function toProjectRelative(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, path.resolve(cwd, filePath));
  return relative.split(path.sep).join('/');
}

/**
 * Writes bundle data to file
 */
function writeBundleFile(outputPath: string, data: Record<string, unknown>): void {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonContent = JSON.stringify(data, null, 2);
  fs.writeFileSync(outputPath, jsonContent, 'utf8');
}
