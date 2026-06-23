import { describe, it, expect } from 'vitest';
import { matchGlossary, scoreMatch, type FlatEntry } from './glossary-matcher';

describe('scoreMatch', () => {
  it('returns 1 for an exact, case-insensitive match', () => {
    expect(scoreMatch('save', 'Save')).toBe(1);
    expect(scoreMatch('save changes', 'Save Changes')).toBe(1);
  });

  it('returns a partial score for whole-word containment', () => {
    const score = scoreMatch('save', 'Save changes');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('does not match inside a larger word', () => {
    expect(scoreMatch('cat', 'category')).toBe(0);
  });

  it('matches a bigram phrase as a whole', () => {
    expect(scoreMatch('save changes', 'You can save changes here')).toBeGreaterThan(0);
  });

  it('returns 0 for empty inputs', () => {
    expect(scoreMatch('', 'Save')).toBe(0);
    expect(scoreMatch('save', '')).toBe(0);
  });

  it('scores longer candidates higher (more coverage of the source)', () => {
    const long = scoreMatch('save changes', 'Save changes now');
    const short = scoreMatch('save', 'Save changes now');
    expect(long).toBeGreaterThan(short);
  });
});

const ENTRY = (overrides: Partial<FlatEntry>): FlatEntry => ({
  key: 'buttons.save',
  collection: 'app',
  source: 'Save',
  translations: { fr: 'Enregistrer', es: 'Guardar' },
  status: { fr: 'verified', es: 'translated' },
  ...overrides,
});

describe('matchGlossary', () => {
  it('matches candidates against base values and returns rich terms', () => {
    const result = matchGlossary([ENTRY({})], [{ term: 'save' }], { locales: ['fr', 'es'] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: 'buttons.save',
      base: 'Save',
      matchedTerm: 'save',
      score: 1,
      translations: { fr: 'Enregistrer', es: 'Guardar' },
      status: { fr: 'verified', es: 'translated' },
    });
  });

  it('excludes new/stale locales by default', () => {
    const entry = ENTRY({ status: { fr: 'new', es: 'stale' } });
    const result = matchGlossary([entry], [{ term: 'save' }], { locales: ['fr', 'es'] });
    expect(result).toHaveLength(0);
  });

  it('includes new/stale locales when includeAll is set', () => {
    const entry = ENTRY({ status: { fr: 'new', es: 'stale' } });
    const result = matchGlossary([entry], [{ term: 'save' }], { locales: ['fr', 'es'], includeAll: true });
    expect(result).toHaveLength(1);
    expect(result[0].status).toMatchObject({ fr: 'new', es: 'stale' });
  });

  it('only includes requested locales', () => {
    const result = matchGlossary([ENTRY({})], [{ term: 'save' }], { locales: ['fr'] });
    expect(result[0].translations).toEqual({ fr: 'Enregistrer' });
  });

  it('drops an entry with no usable locales after filtering', () => {
    const result = matchGlossary([ENTRY({})], [{ term: 'save' }], { locales: ['de'] });
    expect(result).toHaveLength(0);
  });

  it('keeps the single best entry per candidate', () => {
    const exact = ENTRY({ key: 'buttons.save', source: 'Save' });
    const longer = ENTRY({ key: 'buttons.saveChanges', source: 'Save changes' });
    const result = matchGlossary([exact, longer], [{ term: 'save' }], { locales: ['fr'] });
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('buttons.save');
    expect(result[0].score).toBe(1);
  });

  it('dedupes the same entry matched by multiple candidates, keeping the higher score', () => {
    const entry = ENTRY({ key: 'buttons.saveChanges', source: 'Save changes' });
    const result = matchGlossary([entry], [{ term: 'changes' }, { term: 'save changes' }], { locales: ['fr'] });
    expect(result).toHaveLength(1);
    expect(result[0].matchedTerm).toBe('save changes');
    expect(result[0].score).toBe(1);
  });

  it('sorts results by score descending', () => {
    const exact = ENTRY({ key: 'a', source: 'Settings' });
    const partial = ENTRY({ key: 'b', source: 'Open settings panel' });
    const result = matchGlossary([exact, partial], [{ term: 'settings' }, { term: 'open settings' }], {
      locales: ['fr'],
    });
    // 'settings' -> exact 'Settings' (1.0); 'open settings' -> partial in 'Open settings panel'
    expect(result[0].score).toBeGreaterThanOrEqual(result[result.length - 1].score);
    expect(result[0].key).toBe('a');
  });

  it('short-circuits on an exact match and picks it regardless of later entries', () => {
    // Exact match appears first; a later partial-containment entry must not displace it.
    const exact = ENTRY({ key: 'a', source: 'Save' });
    const partial = ENTRY({ key: 'b', source: 'Save the file' });
    const result = matchGlossary([exact, partial], [{ term: 'save' }], { locales: ['fr'] });
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('a');
    expect(result[0].score).toBe(1);
  });

  it('ignores key-name matches (value-only)', () => {
    // candidate matches the key 'save' but the base value is unrelated
    const entry = ENTRY({ key: 'buttons.save', source: 'Confirm' });
    const result = matchGlossary([entry], [{ term: 'save' }], { locales: ['fr'] });
    expect(result).toHaveLength(0);
  });
});
