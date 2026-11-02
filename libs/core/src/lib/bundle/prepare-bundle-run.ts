import * as path from 'node:path';
import {
  type BundleDefinition,
  checkBundleDefinition,
  findBundleDefinition,
  hasTypeDistConfigured,
} from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import {
  BundleHierarchicalConflictError,
  BundleNotFoundError,
  InvalidBundleDefinitionError,
  InvalidBundleLocalesError,
} from '../errors/internal';
import {
  type BundleSelection,
  type ResolvedBundleCollections,
  resolveBundleCollections,
  selectBundleEntries,
  selectionValues,
} from './bundle-selection';
import type { BundleWarning } from './generate-bundle';
import { buildBundleHierarchy } from './hierarchy-builder';
import { type BundleSettings, type BundleSettingsOverrides, resolveBundleSettings } from './resolve-bundle-settings';
import { COLLECTION_BASE_LOCALE, type CollectionReadCache } from './resource-loader';
import { legacyTypeDistWarning } from './type-generation/generate-types';

interface BundleRunOptions extends BundleSettingsOverrides {
  readonly bundleKey: string;
  readonly config: LingoTrackerConfig;
  readonly locales?: readonly string[];
  readonly cwd?: string;
}

export type PrepareBundleRunParams =
  | (BundleRunOptions & { readonly source: 'saved' })
  | (BundleRunOptions & {
      readonly source: 'supplied';
      readonly bundleDefinition: BundleDefinition | null | undefined;
    });

export interface PreparedBundleRun {
  readonly bundleKey: string;
  readonly cwd: string;
  readonly definition: BundleDefinition;
  readonly settings: BundleSettings;
  readonly locales: readonly string[];
  readonly collections: ResolvedBundleCollections;
  content(progress?: {
    readonly onLocale?: (locale: string, index: number) => void;
    readonly onBase?: () => void;
  }): PreparedBundleContent;
  /** Config advisories, already worded, available before content selection or writes. */
  readonly warnings: readonly BundleWarning[];
  readonly tokenConstantNameOverride?: string;
}

export interface PreparedBundleContent {
  readonly locales: readonly {
    readonly locale: string;
    readonly selection: BundleSelection;
    readonly tree: Record<string, unknown>;
  }[];
  readonly base: BundleSelection;
  readonly baseKeys: readonly string[];
  readonly localeConflicts: readonly string[];
  readonly baseConflicts: readonly string[];
  readonly warnings: readonly string[];
}

/** Resolves a saved run or fully validates a supplied dry-run definition. */
export function prepareBundleRun(params: PrepareBundleRunParams): PreparedBundleRun {
  const cwd = path.resolve(params.cwd ?? process.cwd());
  const bundleKey = params.source === 'supplied' ? params.bundleKey.trim() : params.bundleKey;
  let definition: BundleDefinition;
  if (params.source === 'saved') {
    const saved = findBundleDefinition(params.config.bundles, bundleKey);
    if (!saved) throw new BundleNotFoundError(bundleKey);
    definition = saved;
  } else {
    const supplied = params.bundleDefinition;
    if (supplied === null || typeof supplied !== 'object' || Array.isArray(supplied)) {
      throw new InvalidBundleDefinitionError(['bundle definition is required.']);
    }
    const checked = checkBundleDefinition(supplied, Object.keys(params.config.collections ?? {}), bundleKey);
    if (checked.errors.length > 0) throw new InvalidBundleDefinitionError(checked.errors);
    definition = checked.definition;
  }

  validateBundleLocales(params.locales, params.config);
  let collections: ResolvedBundleCollections | undefined;
  let content: PreparedBundleContent | undefined;
  const settings = resolveBundleSettings(bundleKey, params.config, definition, params);
  const prepared: PreparedBundleRun = {
    bundleKey,
    cwd,
    definition,
    settings,
    locales: [...(params.locales ?? params.config.locales)],
    get collections() {
      collections ??= resolveBundleCollections(definition, params.config, { cwd });
      return collections;
    },
    content(progress) {
      if (content) {
        content.locales.forEach(({ locale }, index) => {
          progress?.onLocale?.(locale, index + 1);
        });
        progress?.onBase?.();
      } else {
        content = selectPreparedContent(prepared, progress);
      }
      return content;
    },
    warnings: configWarnings(bundleKey, definition, settings),
    tokenConstantNameOverride: params.tokenConstantName,
  };
  return prepared;
}

function configWarnings(bundleKey: string, definition: BundleDefinition, settings: BundleSettings): BundleWarning[] {
  const message = legacyTypeDistWarning(bundleKey, definition);
  const warnings: BundleWarning[] = message ? [{ origin: 'config', message }] : [];
  if (!settings.transformICUToTransloco && settings.runtime === 'transloco') {
    warnings.push({
      origin: 'config',
      message:
        `Bundle '${bundleKey}': transformICUToTransloco is off, so the transloco runtime setting does not apply; ` +
        'the bundle holds ICU-quoted text',
    });
  }
  return warnings;
}

/** Validates an optional project locale subset, including malformed API bodies. */
export function validateBundleLocales(locales: readonly string[] | undefined, config: LingoTrackerConfig): void {
  if (locales !== undefined) {
    if (!Array.isArray(locales) || locales.some((locale) => typeof locale !== 'string')) {
      throw new InvalidBundleLocalesError('locales must be an array of strings');
    }
    const unknown = locales.filter((locale) => !config.locales.includes(locale));
    if (unknown.length > 0) {
      throw new InvalidBundleLocalesError(
        `Unknown locale${unknown.length > 1 ? 's' : ''} ${unknown.map((locale) => `"${locale}"`).join(', ')}: must be defined in the project locales`,
      );
    }
  }
}

/** Reads and selects once, before either planning or writing. */
function selectPreparedContent(
  prepared: PreparedBundleRun,
  progress?: Parameters<PreparedBundleRun['content']>[0],
): PreparedBundleContent {
  const cache: CollectionReadCache = new Map();
  const warnings: string[] = [];
  const reportedRuntimeWarnings = new Set<string>();
  const conflicts = new Set<string>();
  const select = (locale: string | typeof COLLECTION_BASE_LOCALE): BundleSelection =>
    selectBundleEntries(prepared.collections.collections, locale, {
      runtime: prepared.settings.runtime,
      transformICUToTransloco: prepared.settings.transformICUToTransloco,
      cache,
      reportedRuntimeWarnings,
    });
  const locales = prepared.locales.map((locale, index) => {
    progress?.onLocale?.(locale, index + 1);
    const selection = select(locale);
    warnings.push(...selection.warnings);
    if (selection.entries.size === 0) warnings.push(`Bundle '${prepared.bundleKey}' for locale '${locale}' is empty`);
    const built = buildBundleHierarchy(Object.entries(selectionValues(selection)));
    for (const key of built.conflicts) conflicts.add(key);
    return { locale, selection, tree: built.tree };
  });
  progress?.onBase?.();
  const base = select(COLLECTION_BASE_LOCALE);
  for (const warning of base.warnings) {
    if (!warnings.includes(warning)) warnings.push(warning);
  }
  const baseKeys = [...base.entries.keys()];
  const baseHierarchy = buildBundleHierarchy(
    baseKeys.map((key) => [key, key] as const),
    hasTypeDistConfigured(prepared.definition) ? prepared.settings.tokenCasing : undefined,
  );
  return {
    locales,
    base,
    baseKeys,
    localeConflicts: [...conflicts].sort(),
    baseConflicts: baseHierarchy.conflicts,
    warnings: [...prepared.collections.warnings, ...warnings],
  };
}

export interface BundleRunOutputOptions {
  readonly debugKeysLocale?: string;
}

/** Base hierarchy matters only when types or debug keys consume it. */
export function bundleRunConflicts(
  prepared: PreparedBundleRun,
  content: PreparedBundleContent,
  options: BundleRunOutputOptions = {},
): string[] {
  const baseWritten = hasTypeDistConfigured(prepared.definition) || Boolean(options.debugKeysLocale);
  return [...new Set([...content.localeConflicts, ...(baseWritten ? content.baseConflicts : [])])].sort();
}

/** Plan and generation use the same output policy and diagnostics. */
export function bundleRunWarnings(
  prepared: PreparedBundleRun,
  content: PreparedBundleContent,
  options: BundleRunOutputOptions = {},
): string[] {
  const conflicts = bundleRunConflicts(prepared, content, options);
  return [
    ...content.warnings,
    ...(conflicts.length > 0 ? [new BundleHierarchicalConflictError(prepared.bundleKey, conflicts).message] : []),
    ...(options.debugKeysLocale && content.baseKeys.length === 0
      ? [`Bundle '${prepared.bundleKey}' debug bundle is empty`]
      : []),
  ];
}
