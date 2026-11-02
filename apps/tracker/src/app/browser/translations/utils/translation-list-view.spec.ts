import type { ResourceSummaryDto, SearchResultDto } from '@simoncodes-ca/data-transfer';
import {
  buildResourceSummary,
  NEEDS_WORK_STATUSES,
  STATUS_PRECEDENCE,
  type TranslationStatus,
} from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import { type SortDirection, type SortField, sortTranslationRecords } from './sort-translations';
import { resourceStatusScope, translationListRows } from './translation-list-view';

function summary(key: string, targets: Record<string, TranslationStatus | undefined>): ResourceSummaryDto {
  const metadata: Record<string, { checksum: string; status?: TranslationStatus }> = {};
  for (const [locale, status] of Object.entries(targets)) {
    if (status !== undefined) metadata[locale] = { checksum: locale, status };
  }
  return buildResourceSummary(
    key,
    { source: key, translations: {}, metadata },
    { baseLocale: 'en', targetLocales: Object.keys(targets), tags: [] },
  );
}

const items = [
  summary('gamma', { es: 'verified', fr: 'verified', de: 'verified' }),
  summary('delta', { es: 'verified', fr: undefined, de: 'verified' }),
  summary('beta', { es: 'new', fr: 'translated', de: 'translated' }),
  summary('alpha', { es: 'stale', fr: 'new', de: 'verified' }),
  summary('epsilon', { es: 'translated', fr: 'stale', de: 'stale' }),
  summary('no-target', {}),
];
const allKeys = ['alpha', 'beta', 'delta', 'epsilon', 'gamma', 'no-target'];
const allLocales = ['en', 'es', 'fr', 'de'];
const selection = { locales: allLocales, statuses: [], sortField: 'key', sortDirection: 'asc' } as const;
const zeroCounts = { new: 0, stale: 0, translated: 0, verified: 0 };
const allCounts = { new: 3, stale: 2, translated: 2, verified: 3 };

function listView<T extends ResourceSummaryDto>(
  resources: readonly T[],
  options: {
    locales: readonly string[];
    statuses: readonly TranslationStatus[];
    sortField: SortField;
    sortDirection: SortDirection;
  },
) {
  const scope = resourceStatusScope(resources, options.locales);
  return {
    rows: translationListRows(scope, options),
    statusCounts: scope.statusCounts,
    needsWorkCount: scope.needsWorkCount,
  };
}

/** Independent oracle: read the fixture's raw targets, without production status helpers. */
function expectedKeys(locales: readonly string[], statuses: readonly TranslationStatus[]): string[] {
  return items
    .filter(
      (item) =>
        statuses.length === 0 ||
        item.targets.some((target) => locales.includes(target.locale) && statuses.includes(target.status ?? 'new')),
    )
    .map((item) => item.fullKey)
    .sort();
}

describe('translationListView', () => {
  it.each<[string, string[], TranslationStatus[], string[]]>([
    ['no selected statuses keeps all', allLocales, [], allKeys],
    ['new includes missing metadata', allLocales, ['new'], ['alpha', 'beta', 'delta']],
    ['stale', allLocales, ['stale'], ['alpha', 'epsilon']],
    ['translated', allLocales, ['translated'], ['beta', 'epsilon']],
    ['verified', allLocales, ['verified'], ['alpha', 'delta', 'gamma']],
    ['multiple statuses form a union', allLocales, ['new', 'stale'], ['alpha', 'beta', 'delta', 'epsilon']],
    ['selected locale narrows the filter', ['es'], ['new'], ['beta']],
    ['base locale contributes nothing', ['en'], ['new'], []],
    ['unknown locale contributes nothing', ['it'], ['new'], []],
    ['empty locales with a status filter', [], ['new'], []],
    ['empty locales without a status filter', [], [], allKeys],
  ])('filters: %s', (_name, locales, statuses, expected) => {
    expect(listView(items, { ...selection, locales, statuses }).rows.map((item) => item.fullKey)).toEqual(expected);
  });

  it.each<[string, string[], typeof zeroCounts, number]>([
    ['all targets', allLocales, allCounts, 4],
    ['one target', ['es'], { new: 1, stale: 1, translated: 1, verified: 2 }, 2],
    ['missing metadata', ['fr'], { new: 2, stale: 1, translated: 1, verified: 1 }, 3],
    ['base locale', ['en'], zeroCounts, 0],
    ['unknown locale', ['it'], zeroCounts, 0],
    ['empty locales', [], zeroCounts, 0],
  ])('counts resources over %s, once per status and once for needs work', (_name, locales, counts, needsWorkCount) => {
    const view = listView(items, { ...selection, locales });
    expect(view.statusCounts).toEqual(counts);
    expect(view.needsWorkCount).toBe(needsWorkCount);
  });

  it('keeps counts over the status-unfiltered resources when a status is selected', () => {
    const view = listView(items, { ...selection, statuses: ['new'] });
    expect(view.rows).toHaveLength(3);
    expect(view.statusCounts).toEqual(allCounts);
    expect(view.needsWorkCount).toBe(4);
  });

  it('returns empty rows and zero counts for no items', () => {
    expect(listView([], selection)).toEqual({ rows: [], statusCounts: zeroCounts, needsWorkCount: 0 });
  });

  it.each<[SortField, SortDirection, string[], string[]]>([
    ['key', 'asc', allLocales, allKeys],
    ['key', 'desc', allLocales, [...allKeys].reverse()],
    ['status', 'asc', allLocales, ['alpha', 'epsilon', 'beta', 'delta', 'gamma', 'no-target']],
    ['status', 'desc', allLocales, ['no-target', 'gamma', 'delta', 'beta', 'epsilon', 'alpha']],
    ['status', 'asc', ['es'], ['alpha', 'beta', 'epsilon', 'delta', 'gamma', 'no-target']],
    ['status', 'asc', [], allKeys],
  ])(
    'sorts by %s %s over %j with key ties and no status ranked as verified',
    (sortField, sortDirection, locales, keys) => {
      expect(
        listView(items, { ...selection, sortField, sortDirection, locales }).rows.map((item) => item.fullKey),
      ).toEqual(keys);
      const scope = resourceStatusScope(items, locales);
      expect(sortTranslationRecords(scope.resources, sortField, sortDirection).map(({ item }) => item.fullKey)).toEqual(
        keys,
      );
    },
  );

  it('makes each count equal the rows its filter returns across every locale subset and status selection', () => {
    const localesToSelect = [...allLocales, 'unknown'];
    const localeSelections: string[][] = [[]];
    for (const locale of localesToSelect) {
      localeSelections.push(...localeSelections.map((subset) => [...subset, locale]));
    }
    const statusSelections: readonly (readonly TranslationStatus[])[] = [
      [],
      ...STATUS_PRECEDENCE.map((status) => [status]),
      NEEDS_WORK_STATUSES,
    ];
    for (const locales of localeSelections) {
      for (const statuses of statusSelections) {
        const view = listView(items, { ...selection, locales, statuses });
        expect(view.rows.map((item) => item.fullKey)).toEqual(expectedKeys(locales, statuses));
        for (const status of ['new', 'stale', 'translated', 'verified'] as const) {
          const expected = expectedKeys(locales, [status]);
          const filtered = listView(items, { ...selection, locales, statuses: [status] });
          expect(view.statusCounts[status]).toBe(expected.length);
          expect(filtered.rows.map((item) => item.fullKey)).toEqual(expected);
          expect(view.statusCounts[status]).toBe(filtered.rows.length);
        }
        const expectedNeedsWork = expectedKeys(locales, ['new', 'stale']);
        const needsWork = listView(items, { ...selection, locales, statuses: NEEDS_WORK_STATUSES });
        expect(view.needsWorkCount).toBe(expectedNeedsWork.length);
        expect(needsWork.rows.map((item) => item.fullKey)).toEqual(expectedNeedsWork);
        expect(view.needsWorkCount).toBe(needsWork.rows.length);
      }
    }
  });

  it('preserves search result fields and object identity', () => {
    const hit: SearchResultDto = { ...summary('hit', { es: 'new' }), matchType: 'exact-key' };
    const view = listView([hit], selection);
    expect(view.rows[0]).toBe(hit);
    expect(view.rows[0]?.matchType).toBe('exact-key');
  });

  it('leaves the input order and resource data unchanged', () => {
    const original = structuredClone(items);
    listView(items, { ...selection, sortField: 'status', sortDirection: 'desc', statuses: ['new'] });
    expect(items).toEqual(original);
  });
});

describe('resourceStatusScope', () => {
  it('reuses per-item counts when filtering and sorting the same scope', () => {
    let targetReads = 0;
    const resources = items.map((item) => ({
      ...item,
      get targets() {
        targetReads++;
        return item.targets;
      },
    }));
    const scope = resourceStatusScope(resources, allLocales);
    const readsAfterScope = targetReads;
    expect(readsAfterScope).toBeGreaterThan(0);

    for (const sortDirection of ['asc', 'desc'] as const) {
      for (const statuses of [[], ['new'], ['stale']] as const) {
        translationListRows(scope, { statuses, sortField: 'status', sortDirection });
      }
    }
    expect(targetReads).toBe(readsAfterScope);
    expect(scope.statusCounts).toEqual(allCounts);
  });
});
