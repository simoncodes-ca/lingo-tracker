import type { ResourceSummaryDto, TranslationStatus } from '@simoncodes-ca/data-transfer';
import { buildResourceSummary } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import { LONG_VALUE_THRESHOLD, type RowViewSelection, rowView, sharedStatus } from './row-view';

type Target = readonly [value: string | undefined, status: TranslationStatus | undefined];

/** A summary of `common.buttons.save` with the given base value and targets (collection order = object order). */
function summary(base: string, targets: Record<string, Target>): ResourceSummaryDto {
  const translations: Record<string, string> = {};
  const metadata: Record<string, { checksum: string; status?: TranslationStatus }> = { en: { checksum: 'base' } };
  for (const [locale, [value, status]] of Object.entries(targets)) {
    if (value !== undefined) translations[locale] = value;
    if (status !== undefined) metadata[locale] = { checksum: locale, status };
  }
  return buildResourceSummary(
    'common.buttons.save',
    { source: base, translations, metadata },
    { baseLocale: 'en', targetLocales: Object.keys(targets), tags: [] },
  );
}

const save = summary('Save', { es: ['Guardar', 'translated'], fr: ['Enregistrer', 'verified'] });

function selection(overrides: Partial<RowViewSelection> = {}): RowViewSelection {
  return { visibleLocales: ['en', 'es', 'fr'], compactLocale: 'en', ...overrides };
}

describe('rowView', () => {
  describe('locale rows', () => {
    it('shows the visible target locales and skips the base locale', () => {
      expect(rowView(save, selection()).localeRows.map((row) => row.locale)).toEqual(['es', 'fr']);
    });

    it('follows the locale filter', () => {
      expect(rowView(save, selection({ visibleLocales: ['en', 'fr'] })).localeRows).toEqual([
        { locale: 'fr', value: 'Enregistrer', status: 'verified', isSameAsBase: false },
      ]);
    });

    it('orders worst status first, then by locale code; a locale with no metadata ranks with new', () => {
      const mixed = summary('Save', {
        de: ['Speichern', 'verified'],
        it: [undefined, undefined],
        fr: ['x', 'stale'],
        es: ['y', 'new'],
        pt: ['z', 'stale'],
      });
      const rows = rowView(mixed, selection({ visibleLocales: ['en', 'de', 'it', 'fr', 'es', 'pt'] })).localeRows;

      expect(rows.map((row) => row.locale)).toEqual(['fr', 'pt', 'es', 'it', 'de']);
      expect(rows.find((row) => row.locale === 'it')?.status).toBe('new');
    });

    it('shows a missing value as empty', () => {
      const missing = summary('Save', { es: [undefined, 'new'] });

      expect(rowView(missing, selection({ visibleLocales: ['en', 'es'] })).localeRows[0]?.value).toBe('');
    });

    it('flags a value that is the source text verbatim, whatever the status says', () => {
      const copied = summary('Save', { es: ['Save', 'translated'] });

      expect(rowView(copied, selection({ visibleLocales: ['en', 'es'] })).localeRows[0]?.isSameAsBase).toBe(true);
    });
  });

  describe('base row', () => {
    it('is the base locale and its value', () => {
      expect(rowView(save, selection()).baseRow).toEqual({ locale: 'en', value: 'Save' });
    });

    it('is absent when the base value is blank', () => {
      expect(rowView(summary('  ', { es: ['x', 'new'] }), selection()).baseRow).toBeUndefined();
    });
  });

  describe('compact row', () => {
    it('shows the base value alone by default, with no status and no marker', () => {
      expect(rowView(save, selection()).compact).toEqual({
        locale: 'en',
        value: 'Save',
        isBase: true,
        needsAttention: false,
        isSameAsBase: false,
      });
    });

    it('shows the selected locale value in place of the base value', () => {
      const compact = rowView(save, selection({ compactLocale: 'es' })).compact;

      expect(compact).toMatchObject({ locale: 'es', value: 'Guardar', isBase: false, status: 'translated' });
    });

    it.each<[TranslationStatus, boolean]>([
      ['new', true],
      ['stale', true],
      ['translated', false],
      ['verified', false],
    ])('asks for attention on %s: %s', (status, expected) => {
      const row = summary('Save', { es: ['Guardar', status] });

      expect(rowView(row, selection({ compactLocale: 'es' })).compact.needsAttention).toBe(expected);
    });

    it('asks for attention for a locale with no metadata, shown as new', () => {
      const row = summary('Save', { es: [undefined, undefined] });

      expect(rowView(row, selection({ compactLocale: 'es' })).compact).toMatchObject({
        value: '',
        status: 'new',
        needsAttention: true,
        isSameAsBase: false,
      });
    });

    it('shows one marker for a copied value with no metadata: the chip', () => {
      const row = summary('Save', { es: ['Save', undefined] });

      expect(rowView(row, selection({ compactLocale: 'es' })).compact).toMatchObject({
        needsAttention: true,
        isSameAsBase: false,
      });
    });

    it('marks a finished translation that is the source text verbatim', () => {
      const row = summary('Save', { es: ['Save', 'translated'] });

      expect(rowView(row, selection({ compactLocale: 'es' })).compact).toMatchObject({
        needsAttention: false,
        isSameAsBase: true,
      });
    });

    it('shows one marker at most: the status chip wins over same-as-source', () => {
      const row = summary('Save', { es: ['Save', 'new'] });

      expect(rowView(row, selection({ compactLocale: 'es' })).compact).toMatchObject({
        needsAttention: true,
        isSameAsBase: false,
      });
    });
  });

  describe('rollup', () => {
    it('counts every target locale, whatever the filter shows; one with no metadata as new', () => {
      const row = summary('Save', {
        es: ['a', 'stale'],
        fr: ['b', 'verified'],
        de: ['c', 'verified'],
        it: [undefined, undefined],
      });
      const view = rowView(row, selection({ visibleLocales: ['en', 'es'] }));

      expect(view.rollupLocales).toEqual([
        { code: 'es', status: 'stale' },
        { code: 'fr', status: 'verified' },
        { code: 'de', status: 'verified' },
        { code: 'it', status: 'new' },
      ]);
      expect(view.statusCounts).toEqual({ stale: 1, new: 1, translated: 0, verified: 2 });
    });
  });

  describe('canTranslate', () => {
    it('is true when some target needs work, even outside the filter', () => {
      const row = summary('Save', { es: ['a', 'verified'], fr: ['b', 'stale'] });

      expect(rowView(row, selection({ visibleLocales: ['en', 'es'] })).canTranslate).toBe(true);
    });

    it('is true for a target with no metadata, which the auto-translator would fill', () => {
      expect(rowView(summary('Save', { es: [undefined, undefined] }), selection()).canTranslate).toBe(true);
    });

    it('is false when every target is translated or verified', () => {
      expect(rowView(save, selection()).canTranslate).toBe(false);
    });
  });

  describe('hasLongValue', () => {
    const long = 'x'.repeat(LONG_VALUE_THRESHOLD + 1);

    it('is false for short values', () => {
      expect(rowView(save, selection()).hasLongValue).toBe(false);
    });

    it('is true for a long base value', () => {
      expect(rowView(summary(long, { es: ['a', 'new'] }), selection()).hasLongValue).toBe(true);
    });

    it('is true for a long visible locale value, not for a hidden one', () => {
      const row = summary('Save', { es: [long, 'new'], fr: ['b', 'new'] });

      expect(rowView(row, selection()).hasLongValue).toBe(true);
      expect(rowView(row, selection({ visibleLocales: ['en', 'fr'] })).hasLongValue).toBe(false);
    });
  });
});

describe('sharedStatus', () => {
  it('is the status every row shares', () => {
    expect(sharedStatus([{ status: 'verified' }, { status: 'verified' }])).toBe('verified');
  });

  it('needs two rows before collapsing wins anything', () => {
    expect(sharedStatus([{ status: 'verified' }])).toBeUndefined();
  });

  it('is undefined for mixed rows and for rows without a status', () => {
    expect(sharedStatus([{ status: 'verified' }, { status: 'new' }])).toBeUndefined();
    expect(sharedStatus([{ status: undefined }, { status: undefined }])).toBeUndefined();
  });
});
