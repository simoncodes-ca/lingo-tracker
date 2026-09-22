import { findPreferredTermFindings, type PreferredTermRule } from '@simoncodes-ca/domain';
import type { LoadedResource } from '../export/export-common';
import type { TerminologyValidationDetail, TerminologyValidationOptions, TerminologyValidationResult } from './types';

/**
 * Scans every base-locale value for discouraged terms from the preferred-terminology file.
 *
 * Unlike the other passes this one is advisory. A finding suggests better wording;
 * it is never a release blocker, so it lands in `warnings` and leaves `passed` alone.
 * The one failure it reports is a rule file that could not be loaded, since then
 * nothing was checked at all — that surfaces as `configError`.
 *
 * Only the base value is scanned. It is the text authors write, and the one every
 * translation is made from; target locales use their own vocabulary. `source` is the
 * collection's base-locale value by construction, so a collection whose base locale
 * differs from the project's is scanned in its own base locale.
 *
 * One detail is reported per collection, key, and rule — never per target locale or
 * per occurrence — so a term used three times in one value reads as one suggestion.
 *
 * @param resources - Resources already loaded from the collections under validation.
 * @param options - Rules, load error, and each collection's base locale.
 * @returns Findings, the load error when there was one, and how many values were scanned.
 */
export function validateTerminology(
  resources: readonly LoadedResource[],
  options: TerminologyValidationOptions,
): TerminologyValidationResult {
  if (options.loadError !== undefined) {
    return { warnings: [], configError: options.loadError, valuesChecked: 0 };
  }

  if (options.rules.length === 0) {
    return { warnings: [], valuesChecked: 0 };
  }

  const warnings: TerminologyValidationDetail[] = [];
  let valuesChecked = 0;

  for (const resource of resources) {
    if (typeof resource.source !== 'string' || resource.source.length === 0) continue;

    valuesChecked++;

    for (const finding of findPreferredTermFindings(resource.source, options.rules)) {
      warnings.push(toDetail(resource, options.baseLocaleByCollection[resource.collection] ?? '', finding.rule));
    }
  }

  return { warnings, valuesChecked };
}

/**
 * The suggestion as one line, e.g. `consider "Investment" instead of "Expenditure"`.
 * Shared with import and the CLI so every surface words it the same way.
 */
export function describePreferredTermRule(rule: PreferredTermRule): string {
  return `consider "${rule.preferred}" instead of "${rule.discouraged}"`;
}

/** @internal */
function toDetail(resource: LoadedResource, locale: string, rule: PreferredTermRule): TerminologyValidationDetail {
  return {
    key: resource.fullKey,
    collection: resource.collection,
    locale,
    discouraged: rule.discouraged,
    preferred: rule.preferred,
    ...(rule.reason ? { reason: rule.reason } : {}),
    message: describePreferredTermRule(rule),
  };
}
