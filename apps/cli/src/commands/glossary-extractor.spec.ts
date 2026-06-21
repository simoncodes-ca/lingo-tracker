import { describe, it, expect } from 'vitest';
import { createNgramExtractor, ngramExtractor, resolveExtractor, STOPWORDS } from './glossary-extractor';

describe('ngramExtractor', () => {
  const terms = (block: string): string[] => ngramExtractor(block).map((c) => c.term);

  it('returns no candidates for empty or whitespace input', () => {
    expect(ngramExtractor('')).toEqual([]);
    expect(ngramExtractor('   \n  ')).toEqual([]);
  });

  it('lowercases tokens', () => {
    expect(terms('Save Settings')).toContain('save');
    expect(terms('Save Settings')).toContain('settings');
  });

  it('drops stopwords', () => {
    const result = terms('Click the Save button in the Settings');
    expect(result).not.toContain('the');
    expect(result).not.toContain('in');
    expect(result).toContain('save');
    expect(result).toContain('settings');
  });

  it('drops single-character tokens (min length 2)', () => {
    const result = terms('a I save');
    expect(result).not.toContain('a');
    expect(result).not.toContain('i');
    expect(result).toContain('save');
  });

  it('emits unigrams and bigrams of adjacent content words', () => {
    const result = terms('Save changes');
    expect(result).toContain('save');
    expect(result).toContain('changes');
    expect(result).toContain('save changes');
  });

  it('forms bigrams across removed stopwords (content-word adjacency)', () => {
    // "save your changes" -> stopword "your" removed -> bigram "save changes"
    const result = terms('save your changes');
    expect(result).toContain('save changes');
  });

  it('does not form bigrams across sentence boundaries', () => {
    const result = terms('Open Settings. Save changes.');
    expect(result).toContain('settings');
    expect(result).toContain('save changes');
    expect(result).not.toContain('settings save');
  });

  it('dedupes repeated candidates', () => {
    const result = terms('Save and save again');
    expect(result.filter((t) => t === 'save')).toHaveLength(1);
  });

  it('handles unicode/accented words', () => {
    const result = terms('Paramètres généraux');
    expect(result).toContain('paramètres');
    expect(result).toContain('généraux');
  });
});

describe('createNgramExtractor', () => {
  it('respects a custom minLength', () => {
    const extract = createNgramExtractor({ minLength: 5 });
    const result = extract('save settings').map((c) => c.term);
    expect(result).not.toContain('save'); // 4 chars, below 5
    expect(result).toContain('settings');
  });

  it('respects a custom stopword set', () => {
    const extract = createNgramExtractor({ stopwords: new Set(['save']) });
    const result = extract('save settings').map((c) => c.term);
    expect(result).not.toContain('save');
    expect(result).toContain('settings');
  });
});

describe('STOPWORDS', () => {
  it('contains common glue words', () => {
    for (const word of ['the', 'a', 'to', 'in', 'of', 'and']) {
      expect(STOPWORDS.has(word)).toBe(true);
    }
  });
});

describe('resolveExtractor', () => {
  it('returns the ngram extractor for "ngram"', () => {
    expect(resolveExtractor('ngram')).toBe(ngramExtractor);
  });

  it('throws a clear not-implemented error for "ai"', () => {
    expect(() => resolveExtractor('ai')).toThrow(/not yet implemented/i);
  });

  it('throws for an unknown extractor mode', () => {
    expect(() => resolveExtractor('bogus' as never)).toThrow(/unknown extractor/i);
  });
});
