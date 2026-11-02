import type { Collection } from '../config/open-collection';
import type { TranslationOutcome, Translator } from '../machine-translation/translator';
import { groupByFolder } from '../resource/folder-grouping';
import type { TranslationRunOutcome, TranslationRunRow } from './translation-run';
import { writeBackTranslations } from './translation-write-back';

function pairKey(key: string, locale: string): string {
  return `${key}\0${locale}`;
}

/**
 * One Translator call followed by one write-back per folder; failures stay at their own stage.
 * The collection carries the required mutation sink. Rows have unique full keys and snapshots for every requested, non-base target locale.
 * Translator guarantees exactly one value or skip per entry x non-base locale; an invalid
 * provider response throws INVALID_RESPONSE. The counting invariant relies on this contract.
 * Provider skips are returned first, preserving the single-resource caller's skip ordering.
 * Successful saves report upsert once per written entry; Resource Folder reindexes failed saves.
 */
export async function translationBatch(
  collection: Collection,
  rows: readonly TranslationRunRow[],
  locales: readonly string[],
  translator: Translator,
): Promise<TranslationRunOutcome[]> {
  const failed = (key: string, locale: string, stage: 'provider' | 'write', error: unknown): TranslationRunOutcome => ({
    key,
    locale,
    status: 'failed',
    stage,
    error,
  });
  let translated: TranslationOutcome;
  try {
    translated = await translator.translate(
      rows.map(({ key, source }) => ({ key, source })),
      locales,
    );
  } catch (error) {
    return rows.flatMap(({ key }) => locales.map((locale) => failed(key, locale, 'provider', error)));
  }

  const values = new Map(translated.values.map((value) => [pairKey(value.key, value.locale), value]));
  const skips = new Map(translated.skipped.map((skip) => [pairKey(skip.key, skip.locale), skip]));
  const providerSkips: TranslationRunOutcome[] = [];
  const outcomes: TranslationRunOutcome[] = [];
  for (const { folderPath, members } of groupByFolder(collection, rows, (row) => row.key)) {
    const pending = members.flatMap(({ key, entryKey, item }) =>
      locales.flatMap((locale) => {
        const value = values.get(pairKey(key, locale));
        return value ? [{ entryKey, locale, value: value.value, snapshot: item.snapshots[locale] }] : [];
      }),
    );
    try {
      const result = writeBackTranslations(collection, folderPath, pending);
      const written = new Set(result.written.map(({ entryKey, locale }) => pairKey(entryKey, locale)));
      for (const { key, entryKey } of members) {
        const entry = result.folder.treeEntry(entryKey);
        for (const locale of locales) {
          const outcome: TranslationRunOutcome = {
            key,
            locale,
            entry,
            status: written.has(pairKey(entryKey, locale)) ? 'written' : 'skipped',
          };
          if (skips.has(pairKey(key, locale))) providerSkips.push(outcome);
          else outcomes.push(outcome);
        }
      }
    } catch (error) {
      for (const { key } of members) {
        for (const locale of locales) {
          outcomes.push(failed(key, locale, 'write', error));
        }
      }
    }
  }
  return [...providerSkips, ...outcomes];
}
