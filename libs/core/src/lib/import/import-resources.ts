import {
  bundledFormIfLost,
  checkStoredValue,
  describeStoredValueFinding,
  icuParseOptionsFor,
  importStrategyPolicy,
  resolveAllReferences,
} from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { groupByFolder } from '../resource/folder-grouping';
import { assertTranslationStatus } from '../resource/translation-status-input';
import { applyICUAutoFixToResources } from './apply-icu-auto-fix';
import { type ImportSession, openImportSession, recordImportIssues, sessionResult } from './import-session';
import { validateImportResources } from './import-validation';
import { loadBaseLocaleValues } from './load-base-locale-values';
import { normalizeImportedValues } from './normalize-imported-values';
import { processResourceGroup } from './process-resource-group';
import type { ImportedResource, ImportResult, ImportRunOptions, ParsedImport } from './types';

/**
 * Imports resources into a collection for one locale, and reports what changed.
 *
 * The resources come from a format adapter (`parseJsonImport`, `parseXliffImport`) or any other
 * source. The run:
 * 1. Applies the strategy defaults, and refuses a base-locale import unless the strategy is `migration`.
 * 2. Resolves Transloco references (`{{t('key')}}`, `{{key}}`) between the resources (`migration` only).
 * 3. Rejects unsafe values and base values through Stored Value Check (after conversion for plain Transloco runtime input).
 * 4. Normalizes values and base values to stored ICU for the strategy and runtime.
 * 5. Repairs placeholders that differ from the stored base value (ICU auto-fix).
 * 6. Drops invalid resources: bad keys, hierarchical conflicts, empty values. Duplicate keys warn.
 * 7. Warns for accepted migration keys whose resolved source changes through the runtime round trip.
 * 8. Uses Value Check as a backstop after ICU auto-fix, then applies the resources per folder
 *    with the strategy's rules for creation, status, comments, tags, and preferred terminology.
 *    Migration skips argument agreement for unresolved references but still checks protected terms.
 *    The collection's Project Terms are read when the session opens; a rule-file problem is reported in `warnings`.
 *
 * Nothing is written in a dry run; the result says what would change.
 * Optional parser findings contribute skipped changes and warnings to the result.
 *
 * @throws {InvalidImportLocaleError} The locale is the collection's base locale and the strategy is not `migration`.
 * @throws {ProtectedTermsFileError} A protected-terms file exists but is not a JSON array of strings.
 */
export function importResources(
  collection: Collection,
  resources: readonly ImportedResource[],
  options: ImportRunOptions,
  parseFindings?: Pick<ParsedImport, 'skipped' | 'warnings'>,
): ImportResult {
  for (const resource of resources) {
    if (resource.status !== undefined) assertTranslationStatus(resource.status);
  }
  const session = openImportSession(collection, options);
  const { dryRun, onProgress } = session.options;
  if (parseFindings) {
    recordImportIssues(
      session,
      parseFindings.skipped.map((issue) => ({ ...issue, type: 'skipped' as const })),
    );
    session.warnings.push(...parseFindings.warnings);
  }

  const referenced = resolveImportReferences(session, resources);
  const syntax = {
    runtime: session.collection.runtime,
    valueSyntax: importStrategyPolicy(session.options.strategy).valueSyntax,
  };
  const checkAfterConversion = syntax.valueSyntax === 'runtime' && syntax.runtime === 'transloco';
  const sources = checkAfterConversion ? referenced : rejectUnsafeStoredValues(session, referenced);
  // Plain Transloco braces are literal until normalization makes them stored ICU.
  const normalized = normalizeImportedValues(sources, syntax);
  const safe = checkAfterConversion ? rejectUnsafeStoredValues(session, normalized) : normalized;
  const repaired = repairImportPlaceholders(session, safe);
  const valid = validateResources(session, repaired);
  warnAboutRoundTripLoss(session, sources, valid);
  applyResourceGroups(session, valid);

  const result = sessionResult(session);
  onProgress?.(
    dryRun
      ? `Dry run complete: would import ${result.resourcesUpdated} resources`
      : `Import complete: ${result.resourcesUpdated} resources imported`,
  );
  return result;
}

function resolveImportReferences(session: ImportSession, resources: readonly ImportedResource[]): ImportedResource[] {
  if (importStrategyPolicy(session.options.strategy).resolvesReferences === false) return [...resources];
  session.options.onProgress?.('Resolving Transloco-style references...');
  return resolveAllReferences([...resources], true, session.warnings);
}

function rejectUnsafeStoredValues(session: ImportSession, resources: ImportedResource[]): ImportedResource[] {
  return resources.filter((resource) => {
    const descriptions = [
      ...checkStoredValue(resource.value, icuParseOptionsFor(session.collection.runtime)).map(
        (found) => `Value: ${describeStoredValueFinding(found)}`,
      ),
      ...(resource.baseValue === undefined
        ? []
        : checkStoredValue(resource.baseValue, icuParseOptionsFor(session.collection.runtime)).map(
            (found) => `Base value: ${describeStoredValueFinding(found)}`,
          )),
    ];
    if (descriptions.length === 0) return true;
    const message = descriptions.join('\n');
    recordImportIssues(session, {
      key: resource.key,
      type: 'failed',
      reason: message,
      error: `Braced placeholder: "${resource.key}": ${message}`,
    });
    return false;
  });
}

function repairImportPlaceholders(session: ImportSession, resources: ImportedResource[]): ImportedResource[] {
  const { verbose, onProgress } = session.options;
  if (verbose) onProgress?.('Checking for ICU placeholder issues...');
  const baseValues = loadBaseLocaleValues(resources, session.collection);
  const autoFix = applyICUAutoFixToResources({
    resources,
    ...icuParseOptionsFor(session.collection.runtime),
    getBaseValue: (key) => baseValues.get(key),
    verbose,
    onProgress: verbose ? onProgress : undefined,
  });
  session.icuAutoFixes.push(...autoFix.autoFixes);
  session.icuAutoFixErrors.push(...autoFix.autoFixErrors);
  return autoFix.resources;
}

function validateResources(session: ImportSession, resources: ImportedResource[]): ImportedResource[] {
  const validation = validateImportResources(resources, { skipEmptyValues: true, warnOnLongKeys: true });
  session.warnings.push(...validation.warnings);
  recordImportIssues(session, validation.issues);
  return validation.validResources;
}

function warnAboutRoundTripLoss(
  session: ImportSession,
  sources: ImportedResource[],
  validResources: ImportedResource[],
): void {
  if (importStrategyPolicy(session.options.strategy).valueSyntax !== 'runtime') return;
  const validKeys = new Set(validResources.map(({ key }) => key));
  const sourceValues = new Map(sources.map(({ key, value }) => [key, value]));
  for (const [key, value] of sourceValues) {
    if (!validKeys.has(key)) continue;
    const bundled = bundledFormIfLost(value, session.collection.runtime);
    if (bundled === undefined) continue;
    session.warnings.push(
      `Key '${key}': value will not survive the round trip to the ${session.collection.runtime} runtime and bundles as written below. ` +
        `Source: ${JSON.stringify(value)} Bundled: ${JSON.stringify(bundled)}`,
    );
  }
}

function applyResourceGroups(session: ImportSession, resources: ImportedResource[]): void {
  const { verbose, onProgress } = session.options;
  for (const group of groupByFolder(session.collection, resources, (resource) => resource.key)) {
    if (verbose) {
      for (const { item: resource } of group.members) onProgress?.(`Processing: ${resource.key}`);
    }
    processResourceGroup(session, group);
  }
}
