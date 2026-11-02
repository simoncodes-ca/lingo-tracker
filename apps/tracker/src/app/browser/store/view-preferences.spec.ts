import { describe, expect, it } from 'vitest';
import { type PreferenceReaders, restore, snapshot, type ViewPreferences } from './view-preferences';

const ctx = { availableLocales: ['en', 'fr'], baseLocale: 'en' };
const state: ViewPreferences = {
  densityMode: 'full',
  selectedLocales: ['fr'],
  showNestedResources: true,
  compactLocale: 'fr',
  compactLocaleManuallyChanged: true,
  sortField: 'status',
  sortDirection: 'desc',
  selectedStatuses: ['stale'],
};

describe('stored view preferences', () => {
  it('round trips all fields without persisting unrelated state or sharing arrays', () => {
    const session = { ...state, nonCompactSelectedLocales: ['en'] };
    const saved = snapshot(session);
    expect(saved).toEqual(state);
    expect(saved.selectedLocales).not.toBe(state.selectedLocales);
    expect(saved.selectedStatuses).not.toBe(state.selectedStatuses);
    expect(restore(saved, ctx)).toEqual(state);
  });

  it('reads the same field list from signal-like readers without reading transient state', () => {
    const readers = Object.fromEntries(
      Object.entries(state).map(([key, value]) => [key, () => value]),
    ) as PreferenceReaders;
    const source = {
      ...readers,
      transient: () => {
        throw new Error('must not read transient state');
      },
    };
    expect(snapshot(source)).toEqual(state);
  });

  it('ignores absent, primitive and array data', () => {
    for (const value of [undefined, null, 1, 'corrupt', []]) expect(restore(value, ctx)).toEqual({});
  });

  it('restores partial old data without overwriting unsaved fields', () => {
    expect(restore({ sortDirection: 'desc' }, ctx)).toEqual({
      densityMode: 'compact',
      selectedLocales: ['en'],
      compactLocale: undefined,
      compactLocaleManuallyChanged: false,
      sortDirection: 'desc',
    });
  });

  it('normalizes retired density and removed locales using locale selection rules', () => {
    expect(
      restore({ densityMode: 'medium', compactLocale: 'removed', selectedLocales: ['removed'] }, ctx),
    ).toMatchObject({ densityMode: 'compact', selectedLocales: ['en'], compactLocale: 'removed' });
    expect(restore({ densityMode: 'full', selectedLocales: ['removed', 'fr'] }, ctx)).toMatchObject({
      densityMode: 'full',
      selectedLocales: ['fr'],
    });
    expect(restore({ densityMode: 'compact' }, { availableLocales: [], baseLocale: 'en' }).selectedLocales).toEqual([]);
  });

  it('validates fields independently, keeping defaults for corrupt values', () => {
    expect(
      restore(
        {
          densityMode: {},
          selectedLocales: 'fr',
          compactLocale: 12,
          compactLocaleManuallyChanged: 'yes',
          showNestedResources: false,
          sortField: 'unknown',
          sortDirection: 1,
          selectedStatuses: ['invalid'],
        },
        ctx,
      ),
    ).toEqual({
      densityMode: 'compact',
      selectedLocales: ['en'],
      compactLocale: undefined,
      compactLocaleManuallyChanged: false,
      showNestedResources: false,
    });
    expect(restore({ selectedLocales: ['fr', 3], selectedStatuses: [] }, ctx).selectedStatuses).toEqual([]);
  });
});
