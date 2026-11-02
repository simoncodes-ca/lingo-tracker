import { describe, expect, it } from 'vitest';
import {
  canRemoveLocale,
  chooseBaseLocale,
  displayedBaseLocale,
  removedLocales,
  toCollectionDraft,
  toCollectionResult,
  withAddedLocale,
  withFolder,
  withoutLocale,
  withoutProtectedTerm,
  withoutTag,
  withProtectedTerm,
  withTag,
  withUserReadOnly,
} from './collection-draft';

describe('Collection Draft', () => {
  it('seeds a blank create draft', () => {
    expect(toCollectionDraft({ mode: 'create', name: 'ignored', effectiveBaseLocale: 'en' })).toMatchObject({
      name: '',
      translationsFolder: '',
      baseLocale: '',
      locales: [],
      originalLocales: [],
      readOnly: false,
      effectiveBaseLocale: '',
      readOnlyTouchedByUser: false,
      tags: [],
      protectedTerms: [],
    });
  });

  it('seeds an edit with copies of its lists and preserves an explicit read-only choice', () => {
    const locales = ['en', 'fr'];
    const draft = toCollectionDraft({
      mode: 'edit',
      name: 'app',
      effectiveBaseLocale: 'en',
      config: { translationsFolder: './i18n', locales, tags: ['ui'], readOnly: false },
    });
    locales.push('de');
    expect(draft.locales).toEqual(['en', 'fr']);
    expect(draft.originalLocales).toEqual(['en', 'fr']);
    expect(draft.readOnlyTouchedByUser).toBe(true);
    expect(displayedBaseLocale(draft.mode, draft.baseLocale, draft.effectiveBaseLocale)).toBe('en');
  });

  it('adds a normalized locale and picks the first as base only in create mode', () => {
    const first = withAddedLocale(toCollectionDraft({ mode: 'create' }), ' EN ');
    expect(first.kind).toBe('added');
    if (first.kind === 'added') expect(first.locale).toBe('en');
    expect(first.draft.locales).toEqual(['en']);
    expect(first.draft.baseLocale).toBe('en');
    const second = withAddedLocale(first.draft, 'fr-ca');
    expect(second.draft.baseLocale).toBe('en');
    expect(second.draft.locales).toEqual(['en', 'fr-ca']);
  });

  it('rejects an invalid or duplicate locale without changing the draft', () => {
    const draft = withAddedLocale(toCollectionDraft({ mode: 'create' }), 'en').draft;
    expect(withAddedLocale(draft, 'xx-invalid-code')).toEqual({ draft, kind: 'invalidLocale' });
    expect(withAddedLocale(draft, 'EN')).toEqual({ draft, kind: 'duplicateLocale' });
    expect(withAddedLocale(draft, '  ')).toEqual({ draft, kind: 'blank' });
  });

  it('lets a listed locale become base in create mode', () => {
    const draft = withAddedLocale(withAddedLocale(toCollectionDraft({ mode: 'create' }), 'en').draft, 'de').draft;
    expect(chooseBaseLocale(draft.mode, draft.baseLocale, draft.locales, 'de')).toBe('de');
    expect(chooseBaseLocale(draft.mode, draft.baseLocale, draft.locales, 'es')).toBe('en');
  });

  it('remove the base locale in create mode → the base becomes the first remaining locale', () => {
    const draft = withAddedLocale(withAddedLocale(toCollectionDraft({ mode: 'create' }), 'en').draft, 'de').draft;
    expect(withoutLocale(draft, 0)).toMatchObject({ locales: ['de'], baseLocale: 'de' });
    expect(withoutLocale(withoutLocale(draft, 1), 0)).toMatchObject({ locales: [], baseLocale: '' });
  });

  it('edit mode: base locale cannot be removed or changed', () => {
    const draft = toCollectionDraft({
      mode: 'edit',
      effectiveBaseLocale: 'en',
      config: {
        translationsFolder: './i18n',
        locales: ['en', 'de'],
      },
    });
    expect(canRemoveLocale(draft.mode, draft.locales[0], 'en')).toBe(false);
    expect(canRemoveLocale(draft.mode, draft.locales[1], 'en')).toBe(true);
    expect(withoutLocale(draft, 0)).toBe(draft);
    expect(chooseBaseLocale(draft.mode, draft.baseLocale, draft.locales, 'de')).toBe('');
    expect(withoutLocale(draft, 1).locales).toEqual(['en']);
    expect(withAddedLocale(draft, 'fr').draft.baseLocale).toBe('');
  });

  it('reports removed locales against the original list, in original order', () => {
    const draft = toCollectionDraft({
      mode: 'edit',
      config: {
        translationsFolder: './i18n',
        locales: ['en', 'de', 'fr'],
      },
    });
    const withoutGerman = withoutLocale(draft, 1);
    const withSpanish = withAddedLocale(withoutGerman, 'es').draft;
    expect(removedLocales(withSpanish)).toEqual(['de']);
    expect(removedLocales(withoutLocale(withoutGerman, 1))).toEqual(['de', 'fr']);
    expect(removedLocales(draft)).toEqual([]);
  });

  it('read-only default follows the folder until the user touches it', () => {
    const draft = toCollectionDraft({ mode: 'create' });
    const nested = withFolder(draft, './node_modules/pkg/i18n');
    expect(nested.readOnly).toBe(true);
    const outside = withFolder(nested, './src/i18n');
    expect(outside.readOnly).toBe(false);
    const touched = withUserReadOnly(nested, false);
    expect(withFolder(touched, './node_modules/other').readOnly).toBe(false);
  });

  it('keeps an existing read-only choice when the folder changes', () => {
    const draft = toCollectionDraft({
      mode: 'edit',
      config: {
        translationsFolder: './src/i18n',
        readOnly: false,
      },
    });
    expect(withFolder(draft, './node_modules/pkg').readOnly).toBe(false);
  });

  it('adds a normalized tag once and removes every matching tag', () => {
    const draft = toCollectionDraft({ mode: 'create' });
    const tagged = withTag(draft, ' Design System ');
    expect(tagged.tags).toEqual(['design-system']);
    expect(withTag(tagged, 'design-system')).toBe(tagged);
    expect(withTag(tagged, '  ')).toBe(tagged);
    expect(withoutTag(tagged, 'design-system').tags).toEqual([]);
  });

  it('adds protected terms trimmed and deduplicated case-sensitively, and keeps stored terms verbatim', () => {
    const draft = toCollectionDraft({
      mode: 'edit',
      config: { translationsFolder: './i18n', protectedTerms: ['iPhone', ' a'] },
    });
    const added = withProtectedTerm(withProtectedTerm(draft, '  C++ '), 'C++');
    expect(added.protectedTerms).toEqual(['iPhone', ' a', 'C++']);
    expect(withProtectedTerm(added, 'iPhone')).toBe(added);
    expect(withProtectedTerm(added, ' ')).toBe(added);
    expect(withProtectedTerm(added, 'iphone').protectedTerms).toEqual(['iPhone', ' a', 'C++', 'iphone']);
    expect(withoutProtectedTerm(added, 'iPhone').protectedTerms).toEqual([' a', 'C++']);
  });

  it('builds the exact empty create payload without a base locale or terms', () => {
    expect(toCollectionResult(toCollectionDraft({ mode: 'create' }))).toEqual({
      name: '',
      config: {
        translationsFolder: '',
        locales: [],
        readOnly: false,
        tags: [],
        protectedTermsFile: '',
      },
    });
  });

  it('sends terms only with a file and preserves the pointer', () => {
    const draft = toCollectionDraft({
      mode: 'edit',
      name: 'app',
      config: {
        translationsFolder: './i18n',
        baseLocale: 'en',
        locales: ['en'],
        tags: ['ui'],
        protectedTerms: ['iPhone'],
        protectedTermsFile: 'i18n/terms.json',
      },
    });
    expect(toCollectionResult(draft)).toEqual({
      name: 'app',
      config: {
        translationsFolder: './i18n',
        locales: ['en'],
        baseLocale: 'en',
        readOnly: false,
        tags: ['ui'],
        protectedTermsFile: 'i18n/terms.json',
        protectedTerms: ['iPhone'],
      },
    });
    expect(toCollectionResult({ ...draft, protectedTermsFile: undefined }).config).toEqual({
      translationsFolder: './i18n',
      locales: ['en'],
      baseLocale: 'en',
      readOnly: false,
      tags: ['ui'],
      protectedTermsFile: '',
    });
  });

  it('does not write an inherited base locale, and sends empty lists to clear overrides', () => {
    const draft = toCollectionDraft({
      mode: 'edit',
      effectiveBaseLocale: 'en',
      config: {
        translationsFolder: './i18n',
        locales: [],
        tags: [],
      },
    });
    expect(displayedBaseLocale(draft.mode, draft.baseLocale, draft.effectiveBaseLocale)).toBe('en');
    expect(toCollectionResult(draft).config).not.toHaveProperty('baseLocale');
    expect(toCollectionResult(draft).config.locales).toEqual([]);
    expect(toCollectionResult(draft).config.tags).toEqual([]);
  });
});
