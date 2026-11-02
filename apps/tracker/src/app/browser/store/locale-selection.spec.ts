import { describe, expect, it } from 'vitest';
import {
  clearAll,
  compactDisplayLocale,
  filterableLocales,
  filteredLocales,
  isShowingAllLocales,
  type LocaleContext,
  type LocaleSelection,
  localeFilterLabel,
  restoreLocaleSelection,
  type SavedLocaleSelection,
  selectAll,
  selectLocales,
  setDensity,
  toggleLocale,
} from './locale-selection';

const context: LocaleContext = { availableLocales: ['en', 'es', 'de', 'fr'], baseLocale: 'en' };

const baseCtx: LocaleSelection = {
  densityMode: 'full',
  selectedLocales: ['en', 'es', 'de'],
  compactLocale: undefined,
  compactLocaleManuallyChanged: false,
  nonCompactSelectedLocales: [],
};

function applyDensity(sel: LocaleSelection, mode: LocaleSelection['densityMode'], ctx: LocaleContext): LocaleSelection {
  return { ...sel, ...setDensity(sel, mode, ctx) };
}

describe('setDensity', () => {
  describe('entering compact mode', () => {
    it('saves current multi-selection as nonCompactSelectedLocales', () => {
      const result = applyDensity(baseCtx, 'compact', context);
      expect(result.nonCompactSelectedLocales).toEqual(['en', 'es', 'de']);
    });

    it('resets compactLocaleManuallyChanged to false', () => {
      const result = applyDensity({ ...baseCtx, compactLocaleManuallyChanged: true }, 'compact', context);
      expect(result.compactLocaleManuallyChanged).toBe(false);
    });

    it('uses previously saved compact locale when available', () => {
      const ctx: LocaleSelection = { ...baseCtx, compactLocale: 'es' };
      const result = applyDensity(ctx, 'compact', context);
      expect(result.selectedLocales).toEqual(['es']);
    });

    it('ignores saved compact locale if not in availableLocales', () => {
      const ctx: LocaleSelection = { ...baseCtx, compactLocale: 'jp' };
      const result = applyDensity(ctx, 'compact', context);
      expect(result.selectedLocales).toEqual(['en']); // base locale
    });

    it('starts on the base locale, not the full-density filter, when nothing is saved', () => {
      // The full-density filter is a set to compare, not a choice of what to read alone.
      const ctx: LocaleSelection = { ...baseCtx, selectedLocales: ['de', 'es'] };
      const result = applyDensity(ctx, 'compact', context);
      expect(result.selectedLocales).toEqual(['en']);
      expect(result.compactLocale).toBe('en');
    });

    it('falls back to base locale when no selection and no compact locale', () => {
      const ctx: LocaleSelection = { ...baseCtx, selectedLocales: [], compactLocale: undefined };
      const result = applyDensity(ctx, 'compact', context);
      expect(result.selectedLocales).toEqual(['en']);
    });

    it('falls back to first available locale when no base locale', () => {
      const ctx: LocaleSelection = {
        ...baseCtx,
        selectedLocales: [],
        compactLocale: undefined,
      };
      const result = applyDensity(ctx, 'compact', { availableLocales: ['fr', 'de'], baseLocale: '' });
      expect(result.selectedLocales).toEqual(['fr']);
    });
  });

  describe('leaving compact mode', () => {
    const compactCtx: LocaleSelection = {
      ...baseCtx,
      densityMode: 'compact',
      selectedLocales: ['es'],
      nonCompactSelectedLocales: ['en', 'de'],
      compactLocale: 'es',
    };

    it('restores nonCompactSelectedLocales when locale was not manually changed', () => {
      const result = applyDensity(compactCtx, 'full', context);
      expect(result.selectedLocales).toEqual(['en', 'de']);
    });

    it('keeps current selection when locale was manually changed in compact', () => {
      const ctx: LocaleSelection = { ...compactCtx, compactLocaleManuallyChanged: true };
      const result = applyDensity(ctx, 'full', context);
      expect(result.selectedLocales).toEqual(['es']);
    });

    it('saves current compact locale for next compact entry', () => {
      const result = applyDensity(compactCtx, 'full', context);
      expect(result.compactLocale).toBe('es');
    });

    it('keeps current selection when nonCompactSelectedLocales is empty', () => {
      const ctx: LocaleSelection = { ...compactCtx, nonCompactSelectedLocales: [] };
      const result = applyDensity(ctx, 'full', context);
      expect(result.selectedLocales).toEqual(['es']);
    });
  });

  describe('no-op transitions', () => {
    it('does not change selection when staying in full mode', () => {
      expect(setDensity(baseCtx, 'full', context)).toEqual({});
    });

    it('does not change selection when staying in compact mode', () => {
      const ctx: LocaleSelection = {
        ...baseCtx,
        densityMode: 'compact',
        compactLocale: 'es',
        selectedLocales: ['es'],
        compactLocaleManuallyChanged: true,
        nonCompactSelectedLocales: ['en', 'de'],
      };
      expect(setDensity(ctx, 'compact', context)).toEqual({});
      expect(applyDensity(ctx, 'compact', context)).toEqual(ctx);
    });
  });
});

describe('restoreLocaleSelection (ported compact resolution cases)', () => {
  const availableLocales = ['en', 'es', 'de'];

  it('returns saved compact locale when it is still available', () => {
    const result = restoreLocaleSelection(
      {
        compactLocale: 'es',
        selectedLocales: ['en', 'de'],
      },
      {
        availableLocales,
        baseLocale: 'en',
      },
    ).selectedLocales;
    expect(result).toEqual(['es']);
  });

  it('falls back to base locale when no saved compact locale and no selection', () => {
    const result = restoreLocaleSelection(
      {
        compactLocale: undefined,
        selectedLocales: [],
      },
      {
        availableLocales,
        baseLocale: 'en',
      },
    ).selectedLocales;
    expect(result).toEqual(['en']);
  });

  it('falls back to first available locale when no base locale and no selection', () => {
    const result = restoreLocaleSelection(
      {
        compactLocale: undefined,
        selectedLocales: [],
      },
      {
        availableLocales: ['de', 'fr'],
        baseLocale: '',
      },
    ).selectedLocales;
    expect(result).toEqual(['de']);
  });

  it('falls back to base locale when the saved selection is not a single locale', () => {
    const result = restoreLocaleSelection(
      {
        compactLocale: undefined,
        selectedLocales: ['de', 'en'],
      },
      {
        availableLocales,
        baseLocale: 'en',
      },
    ).selectedLocales;
    expect(result).toEqual(['en']);
  });

  it('falls back to base locale when the saved single selection is no longer available', () => {
    const result = restoreLocaleSelection(
      {
        compactLocale: undefined,
        selectedLocales: ['jp'],
      },
      {
        availableLocales,
        baseLocale: 'en',
      },
    ).selectedLocales;
    expect(result).toEqual(['en']);
  });

  it('returns current single selection unchanged', () => {
    const result = restoreLocaleSelection(
      {
        compactLocale: undefined,
        selectedLocales: ['es'],
      },
      {
        availableLocales,
        baseLocale: 'en',
      },
    ).selectedLocales;
    expect(result).toEqual(['es']);
  });

  it('ignores saved compact locale when it is no longer available', () => {
    const result = restoreLocaleSelection(
      {
        compactLocale: 'jp',
        selectedLocales: ['en'],
      },
      {
        availableLocales,
        baseLocale: 'en',
      },
    ).selectedLocales;
    expect(result).toEqual(['en']);
  });
});

const emptyContext: LocaleContext = { availableLocales: [], baseLocale: 'en' };
const withoutBase: LocaleContext = { availableLocales: ['de', 'fr'], baseLocale: 'en' };
const compactSelection: LocaleSelection = {
  ...baseCtx,
  densityMode: 'compact',
  selectedLocales: ['es'],
  compactLocale: 'es',
  nonCompactSelectedLocales: ['en', 'de'],
};

// Compare the entire value, including memory fields, and freeze inputs to catch mutations.
describe('locale transitions', () => {
  const cases: {
    name: string;
    selection: LocaleSelection;
    transition: (sel: LocaleSelection) => Partial<LocaleSelection>;
    expected: LocaleSelection;
  }[] = [
    {
      name: 'select in full leaves compact memory alone',
      selection: baseCtx,
      transition: (sel) => selectLocales(sel, ['fr']),
      expected: { ...baseCtx, selectedLocales: ['fr'] },
    },
    {
      name: 'select in compact remembers the first locale immediately',
      selection: compactSelection,
      transition: (sel) => selectLocales(sel, ['fr', 'de']),
      expected: {
        ...compactSelection,
        selectedLocales: ['fr', 'de'],
        compactLocale: 'fr',
        compactLocaleManuallyChanged: true,
      },
    },
    {
      name: 'empty compact selection clears remembered locale',
      selection: compactSelection,
      transition: (sel) => selectLocales(sel, []),
      expected: {
        ...compactSelection,
        selectedLocales: [],
        compactLocale: undefined,
        compactLocaleManuallyChanged: true,
      },
    },
    {
      name: 'toggle adds in full',
      selection: baseCtx,
      transition: (sel) => toggleLocale(sel, 'fr'),
      expected: { ...baseCtx, selectedLocales: ['en', 'es', 'de', 'fr'] },
    },
    {
      name: 'toggle removes in full',
      selection: baseCtx,
      transition: (sel) => toggleLocale(sel, 'es'),
      expected: { ...baseCtx, selectedLocales: ['en', 'de'] },
    },
    {
      name: 'toggle adds in compact and remembers the first selected locale',
      selection: compactSelection,
      transition: (sel) => toggleLocale(sel, 'fr'),
      expected: { ...compactSelection, selectedLocales: ['es', 'fr'], compactLocaleManuallyChanged: true },
    },
    {
      name: 'toggle removes the last compact locale',
      selection: compactSelection,
      transition: (sel) => toggleLocale(sel, 'es'),
      expected: {
        ...compactSelection,
        selectedLocales: [],
        compactLocale: undefined,
        compactLocaleManuallyChanged: true,
      },
    },
    ...[baseCtx, compactSelection].flatMap((selection) => [
      {
        name: `select all in ${selection.densityMode} preserves memory`,
        selection,
        transition: () => selectAll(context),
        expected: { ...selection, selectedLocales: context.availableLocales },
      },
      {
        name: `clear all in ${selection.densityMode} preserves memory`,
        selection,
        transition: () => clearAll(),
        expected: { ...selection, selectedLocales: [] },
      },
      {
        name: `select all in empty ${selection.densityMode} collection`,
        selection,
        transition: () => selectAll(emptyContext),
        expected: { ...selection, selectedLocales: [] },
      },
    ]),
    {
      name: 'enter compact without base uses first available',
      selection: baseCtx,
      transition: (sel) => setDensity(sel, 'compact', withoutBase),
      expected: {
        ...baseCtx,
        densityMode: 'compact',
        selectedLocales: ['de'],
        compactLocale: 'de',
        nonCompactSelectedLocales: baseCtx.selectedLocales,
      },
    },
    {
      name: 'enter compact in an empty collection retains the old selection and memory',
      selection: baseCtx,
      transition: (sel) => setDensity(sel, 'compact', emptyContext),
      expected: { ...baseCtx, densityMode: 'compact', nonCompactSelectedLocales: baseCtx.selectedLocales },
    },
    {
      name: 'leave compact after clearing the filter restores remembered selection',
      selection: { ...compactSelection, selectedLocales: [] },
      transition: (sel) => setDensity(sel, 'full', context),
      expected: { ...compactSelection, densityMode: 'full', selectedLocales: ['en', 'de'] },
    },
    {
      name: 'reenter compact preserves selection memory and manual flag',
      selection: { ...compactSelection, compactLocaleManuallyChanged: true },
      transition: (sel) => setDensity(sel, 'compact', context),
      expected: { ...compactSelection, compactLocaleManuallyChanged: true },
    },
  ];

  it.each(cases)('$name', ({ selection, transition, expected }) => {
    Object.freeze(selection.selectedLocales);
    Object.freeze(selection.nonCompactSelectedLocales);
    Object.freeze(selection);
    const result = transition(selection);
    expect({ ...selection, ...result }).toEqual(expected);
  });

  it('restores multi-selection unless a locale was selected in compact', () => {
    const compact = applyDensity(baseCtx, 'compact', context);
    expect(applyDensity(compact, 'full', context).selectedLocales).toEqual(baseCtx.selectedLocales);
    const changed = { ...compact, ...selectLocales(compact, ['fr']) };
    expect(changed.compactLocale).toBe('fr');
    expect(applyDensity(changed, 'full', context).selectedLocales).toEqual(['fr']);
  });
});

describe('restoreLocaleSelection table', () => {
  const cases: {
    name: string;
    saved: SavedLocaleSelection;
    current?: LocaleSelection;
    ctx: LocaleContext;
    expected: LocaleSelection;
  }[] = [
    {
      name: 'full drops removed locales',
      saved: { densityMode: 'full', selectedLocales: ['es', 'jp', 'de'] },
      ctx: context,
      expected: { ...baseCtx, selectedLocales: ['es', 'de'] },
    },
    {
      name: 'full restores optional compact memory and leaves session selection memory alone',
      current: { ...baseCtx, nonCompactSelectedLocales: ['de'] },
      saved: {
        densityMode: 'full',
        compactLocale: 'jp',
        compactLocaleManuallyChanged: true,
      },
      ctx: context,
      expected: {
        ...baseCtx,
        selectedLocales: [],
        compactLocale: 'jp',
        compactLocaleManuallyChanged: true,
        nonCompactSelectedLocales: ['de'],
      },
    },
    {
      name: 'medium reads compact and favors compact memory',
      saved: { densityMode: 'medium', selectedLocales: ['en', 'de'], compactLocale: 'es' },
      ctx: context,
      expected: { ...compactSelection, nonCompactSelectedLocales: [] },
    },
    {
      name: 'missing density reads compact and defaults to base',
      saved: {},
      ctx: context,
      expected: { ...baseCtx, densityMode: 'compact', selectedLocales: ['en'] },
    },
    {
      name: 'removed compact locale falls back to the remaining saved single selection',
      saved: { densityMode: 'compact', compactLocale: 'jp', selectedLocales: ['jp', 'de'] },
      ctx: context,
      expected: { ...baseCtx, densityMode: 'compact', selectedLocales: ['de'], compactLocale: 'jp' },
    },
    {
      name: 'without base uses first available',
      saved: { selectedLocales: ['jp'] },
      ctx: withoutBase,
      expected: { ...baseCtx, densityMode: 'compact', selectedLocales: ['de'] },
    },
    ...(['full', 'compact', 'medium'] as const).map((densityMode) => ({
      name: `empty collection restores ${densityMode} without selection`,
      saved: { densityMode, selectedLocales: ['es'], compactLocale: 'es' },
      ctx: emptyContext,
      expected: {
        ...baseCtx,
        densityMode: densityMode === 'full' ? ('full' as const) : ('compact' as const),
        selectedLocales: [],
        compactLocale: 'es',
      },
    })),
  ];

  it.each(cases)('$name', ({ saved, current, ctx, expected }) => {
    Object.freeze(saved.selectedLocales);
    Object.freeze(saved);
    const patch = restoreLocaleSelection(saved, ctx);
    expect(patch).not.toHaveProperty('nonCompactSelectedLocales');
    expect({ ...(current ?? baseCtx), ...patch }).toEqual(expected);
  });
});

describe('locale projections', () => {
  const cases: {
    name: string;
    selectedLocales: string[];
    ctx: LocaleContext;
    display: string;
    filtered: string[];
    filterable: string[];
    all: boolean;
    fullLabel: ReturnType<typeof localeFilterLabel>;
  }[] = [
    {
      name: 'no selection',
      selectedLocales: [],
      ctx: context,
      display: 'en',
      filtered: ['en', 'es', 'de', 'fr'],
      filterable: ['es', 'de', 'fr'],
      all: true,
      fullLabel: { kind: 'all' },
    },
    {
      name: 'single target',
      selectedLocales: ['de'],
      ctx: context,
      display: 'de',
      filtered: ['en', 'de'],
      filterable: ['es', 'de', 'fr'],
      all: false,
      fullLabel: { kind: 'locale', locale: 'de' },
    },
    {
      name: 'base only',
      selectedLocales: ['en'],
      ctx: context,
      display: 'en',
      filtered: ['en'],
      filterable: ['es', 'de', 'fr'],
      all: false,
      fullLabel: { kind: 'locale', locale: 'en' },
    },
    {
      name: 'base first and selected order retained',
      selectedLocales: ['de', 'en', 'es'],
      ctx: context,
      display: 'de',
      filtered: ['en', 'de', 'es'],
      filterable: ['es', 'de', 'fr'],
      all: false,
      fullLabel: { kind: 'count', count: 3 },
    },
    {
      name: 'all explicitly selected',
      selectedLocales: ['fr', 'es', 'de', 'en'],
      ctx: context,
      display: 'fr',
      filtered: ['en', 'fr', 'es', 'de'],
      filterable: ['es', 'de', 'fr'],
      all: true,
      fullLabel: { kind: 'all' },
    },
    {
      name: 'invalid selection ignored only for compact display',
      selectedLocales: ['jp', 'es'],
      ctx: context,
      display: 'es',
      filtered: ['en', 'jp', 'es'],
      filterable: ['es', 'de', 'fr'],
      all: false,
      fullLabel: { kind: 'count', count: 2 },
    },
    {
      name: 'show-all uses length rather than membership',
      selectedLocales: ['jp', 'jp', 'jp', 'jp'],
      ctx: context,
      display: 'en',
      filtered: ['en', 'jp', 'jp', 'jp', 'jp'],
      filterable: ['es', 'de', 'fr'],
      all: true,
      fullLabel: { kind: 'all' },
    },
    {
      name: 'base missing from collection',
      selectedLocales: [],
      ctx: withoutBase,
      display: 'de',
      filtered: ['en', 'de', 'fr'],
      filterable: ['de', 'fr'],
      all: true,
      fullLabel: { kind: 'all' },
    },
    {
      name: 'no base string',
      selectedLocales: [],
      ctx: { ...withoutBase, baseLocale: '' },
      display: 'de',
      filtered: ['de', 'fr'],
      filterable: ['de', 'fr'],
      all: true,
      fullLabel: { kind: 'all' },
    },
    {
      name: 'empty collection still displays base string',
      selectedLocales: [],
      ctx: emptyContext,
      display: 'en',
      filtered: ['en'],
      filterable: [],
      all: true,
      fullLabel: { kind: 'all' },
    },
    {
      name: 'empty collection and base string',
      selectedLocales: [],
      ctx: { ...emptyContext, baseLocale: '' },
      display: '',
      filtered: [],
      filterable: [],
      all: true,
      fullLabel: { kind: 'all' },
    },
    {
      name: 'empty collection retains selected columns',
      selectedLocales: ['es'],
      ctx: emptyContext,
      display: 'en',
      filtered: ['en', 'es'],
      filterable: [],
      all: false,
      fullLabel: { kind: 'locale', locale: 'es' },
    },
  ];

  it.each(cases)('$name', ({ selectedLocales, ctx, display, filtered, filterable, all, fullLabel }) => {
    for (const densityMode of ['compact', 'full'] as const) {
      const sel: LocaleSelection = { ...baseCtx, densityMode, selectedLocales, compactLocale: 'fr' };
      Object.freeze(sel.selectedLocales);
      Object.freeze(sel);
      expect(compactDisplayLocale(selectedLocales, ctx)).toBe(display);
      expect(filteredLocales(selectedLocales, ctx)).toEqual(filtered);
      expect(filterableLocales(ctx)).toEqual(filterable);
      expect(isShowingAllLocales(selectedLocales, ctx)).toBe(all);
      expect(localeFilterLabel(sel, ctx)).toEqual(
        densityMode === 'compact' ? { kind: 'locale', locale: display } : fullLabel,
      );
    }
  });
});

describe('patch contracts', () => {
  it('returns only the fields owned by each transition', () => {
    expect(selectLocales(baseCtx, ['fr'])).toEqual({ selectedLocales: ['fr'] });
    expect(selectLocales(compactSelection, ['fr'])).toEqual({
      selectedLocales: ['fr'],
      compactLocale: 'fr',
      compactLocaleManuallyChanged: true,
    });
    expect(toggleLocale(baseCtx, 'es')).toEqual({ selectedLocales: ['en', 'de'] });
    expect(toggleLocale(compactSelection, 'es')).toEqual({
      selectedLocales: [],
      compactLocale: undefined,
      compactLocaleManuallyChanged: true,
    });
    expect(selectAll(context)).toEqual({ selectedLocales: context.availableLocales });
    expect(clearAll()).toEqual({ selectedLocales: [] });
    expect(setDensity(baseCtx, 'compact', context)).toEqual({
      densityMode: 'compact',
      selectedLocales: ['en'],
      compactLocale: 'en',
      compactLocaleManuallyChanged: false,
      nonCompactSelectedLocales: baseCtx.selectedLocales,
    });
    expect(setDensity(compactSelection, 'full', context)).toEqual({
      densityMode: 'full',
      selectedLocales: ['en', 'de'],
      compactLocale: 'es',
    });
    expect(setDensity(baseCtx, 'compact', emptyContext)).toEqual({
      densityMode: 'compact',
      nonCompactSelectedLocales: baseCtx.selectedLocales,
      compactLocaleManuallyChanged: false,
    });
  });

  it('preserves the multi-selection through compact to compact to full', () => {
    const compact = applyDensity(baseCtx, 'compact', context);
    const repeated = setDensity(compact, 'compact', context);
    expect(repeated).toEqual({});
    const full = applyDensity({ ...compact, ...repeated }, 'full', context);
    expect(full.selectedLocales).toEqual(baseCtx.selectedLocales);
  });
});
