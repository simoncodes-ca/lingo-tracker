import { describe, it, expect } from 'vitest';
import { computeDensityModeTransition, resolveCompactLocale, type DensityModeContext } from './density-mode.utils';

const baseCtx: DensityModeContext = {
  currentDensityMode: 'full',
  currentSelectedLocales: ['en', 'es', 'de'],
  availableLocales: ['en', 'es', 'de', 'fr'],
  baseLocale: 'en',
  compactLocale: null,
  compactLocaleManuallyChanged: false,
  nonCompactSelectedLocales: [],
};

describe('computeDensityModeTransition', () => {
  describe('entering compact mode', () => {
    it('saves current multi-selection as nonCompactSelectedLocales', () => {
      const result = computeDensityModeTransition('compact', baseCtx);
      expect(result.nonCompactSelectedLocales).toEqual(['en', 'es', 'de']);
    });

    it('resets compactLocaleManuallyChanged to false', () => {
      const result = computeDensityModeTransition('compact', { ...baseCtx, compactLocaleManuallyChanged: true });
      expect(result.compactLocaleManuallyChanged).toBe(false);
    });

    it('uses previously saved compact locale when available', () => {
      const ctx: DensityModeContext = { ...baseCtx, compactLocale: 'es' };
      const result = computeDensityModeTransition('compact', ctx);
      expect(result.selectedLocales).toEqual(['es']);
    });

    it('ignores saved compact locale if not in availableLocales', () => {
      const ctx: DensityModeContext = { ...baseCtx, compactLocale: 'jp' };
      const result = computeDensityModeTransition('compact', ctx);
      expect(result.selectedLocales).toEqual(['en']); // first from currentSelectedLocales
    });

    it('falls back to first of current selection when no saved compact locale', () => {
      const result = computeDensityModeTransition('compact', baseCtx);
      expect(result.selectedLocales).toEqual(['en']);
      expect(result.compactLocale).toBe('en');
    });

    it('falls back to base locale when no selection and no compact locale', () => {
      const ctx: DensityModeContext = { ...baseCtx, currentSelectedLocales: [], compactLocale: null };
      const result = computeDensityModeTransition('compact', ctx);
      expect(result.selectedLocales).toEqual(['en']);
    });

    it('falls back to first available locale when no base locale', () => {
      const ctx: DensityModeContext = {
        ...baseCtx,
        currentSelectedLocales: [],
        compactLocale: null,
        baseLocale: '',
        availableLocales: ['fr', 'de'],
      };
      const result = computeDensityModeTransition('compact', ctx);
      expect(result.selectedLocales).toEqual(['fr']);
    });
  });

  describe('leaving compact mode', () => {
    const compactCtx: DensityModeContext = {
      ...baseCtx,
      currentDensityMode: 'compact',
      currentSelectedLocales: ['es'],
      nonCompactSelectedLocales: ['en', 'de'],
      compactLocale: 'es',
    };

    it('restores nonCompactSelectedLocales when locale was not manually changed', () => {
      const result = computeDensityModeTransition('full', compactCtx);
      expect(result.selectedLocales).toEqual(['en', 'de']);
    });

    it('keeps current selection when locale was manually changed in compact', () => {
      const ctx: DensityModeContext = { ...compactCtx, compactLocaleManuallyChanged: true };
      const result = computeDensityModeTransition('full', ctx);
      expect(result.selectedLocales).toEqual(['es']);
    });

    it('saves current compact locale for next compact entry', () => {
      const result = computeDensityModeTransition('full', compactCtx);
      expect(result.compactLocale).toBe('es');
    });

    it('keeps current selection when nonCompactSelectedLocales is empty', () => {
      const ctx: DensityModeContext = { ...compactCtx, nonCompactSelectedLocales: [] };
      const result = computeDensityModeTransition('full', ctx);
      expect(result.selectedLocales).toEqual(['es']);
    });
  });

  describe('no-op transitions', () => {
    it('does not change selection when staying in full mode', () => {
      const result = computeDensityModeTransition('full', baseCtx);
      expect(result.selectedLocales).toEqual(baseCtx.currentSelectedLocales);
    });

    it('does not change selection when staying in compact mode', () => {
      const ctx: DensityModeContext = {
        ...baseCtx,
        currentDensityMode: 'compact',
        compactLocale: 'es',
        currentSelectedLocales: ['es'],
      };
      const result = computeDensityModeTransition('compact', ctx);
      // entering compact again — saves locales and resets flags
      expect(result.compactLocaleManuallyChanged).toBe(false);
    });
  });
});

describe('resolveCompactLocale', () => {
  const availableLocales = ['en', 'es', 'de'];

  it('returns saved compact locale when it is still available', () => {
    const result = resolveCompactLocale({
      savedCompactLocale: 'es',
      currentSelectedLocales: ['en', 'de'],
      availableLocales,
      baseLocale: 'en',
    });
    expect(result).toEqual(['es']);
  });

  it('falls back to base locale when no saved compact locale and no selection', () => {
    const result = resolveCompactLocale({
      savedCompactLocale: null,
      currentSelectedLocales: [],
      availableLocales,
      baseLocale: 'en',
    });
    expect(result).toEqual(['en']);
  });

  it('falls back to first available locale when no base locale and no selection', () => {
    const result = resolveCompactLocale({
      savedCompactLocale: null,
      currentSelectedLocales: [],
      availableLocales: ['de', 'fr'],
      baseLocale: '',
    });
    expect(result).toEqual(['de']);
  });

  it('returns first of current selection when multi-selected', () => {
    const result = resolveCompactLocale({
      savedCompactLocale: null,
      currentSelectedLocales: ['de', 'en'],
      availableLocales,
      baseLocale: 'en',
    });
    expect(result).toEqual(['de']);
  });

  it('returns current single selection unchanged', () => {
    const result = resolveCompactLocale({
      savedCompactLocale: null,
      currentSelectedLocales: ['es'],
      availableLocales,
      baseLocale: 'en',
    });
    expect(result).toEqual(['es']);
  });

  it('ignores saved compact locale when it is no longer available', () => {
    const result = resolveCompactLocale({
      savedCompactLocale: 'jp',
      currentSelectedLocales: ['en'],
      availableLocales,
      baseLocale: 'en',
    });
    expect(result).toEqual(['en']);
  });
});
