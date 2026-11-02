import type { SearchResult } from '@simoncodes-ca/core';
import { collection, entry } from './resource.mapper.test-support';
import { mapSearchPageToDto, mapSearchResultToDto, searchRequestFromQuery } from './search-result.mapper';

describe('searchRequestFromQuery', () => {
  it('translates similar mode and trims the core query', () => {
    expect(searchRequestFromQuery({ query: ' Save ', mode: 'similar' })).toStrictEqual({
      kind: 'search',
      query: 'Save',
      mode: 'similar-value',
      limit: 100,
    });
  });

  it('uses text mode for absent, text and unrecognized modes', () => {
    for (const mode of [undefined, 'text', 'similar-value', 'unknown']) {
      expect(searchRequestFromQuery({ query: 'Save', mode })).toStrictEqual({
        kind: 'search',
        query: 'Save',
        mode: 'text',
        limit: 100,
      });
    }
  });

  it('parses maxResults with Number and caps valid limits at 500', () => {
    for (const [maxResults, limit] of [
      ['7', 7],
      ['101', 101],
      ['500', 500],
      ['501', 500],
      [' 8 ', 8],
      ['1e2', 100],
    ] as const) {
      expect(searchRequestFromQuery({ query: 'Save', maxResults })).toStrictEqual({
        kind: 'search',
        query: 'Save',
        mode: 'text',
        limit,
      });
    }
  });

  it('defaults absent and invalid limits to 100', () => {
    for (const maxResults of [undefined, '', 'abc', '2garbage', '0', '-1', '1.5', 'Infinity']) {
      expect(searchRequestFromQuery({ query: 'Save', maxResults })).toStrictEqual({
        kind: 'search',
        query: 'Save',
        mode: 'text',
        limit: 100,
      });
    }
  });

  it('returns the core blank outcome for absent, empty and whitespace queries', () => {
    for (const query of [undefined, '', ' \t\n ']) {
      expect(searchRequestFromQuery({ query, mode: 'similar', maxResults: 'bad' })).toStrictEqual({ kind: 'blank' });
    }
  });
});

describe('mapSearchPageToDto', () => {
  it('maps hits in order, carries the true total and limit flag, and keeps query whitespace', () => {
    const results: SearchResult[] = [
      { ...entry, key: 'app.save', matchType: 'similar-value', matchedLocales: ['en'], similarity: 0.9 },
      { ...entry, key: 'app.saveAs', matchType: 'similar-value', matchedLocales: ['en'], similarity: 0.8 },
    ];
    const dto = mapSearchPageToDto(' Save ', { results, totalFound: 10, limited: true, limit: 2 }, collection);
    expect(dto).toStrictEqual({
      query: ' Save ',
      results: results.map((hit) => mapSearchResultToDto(hit, collection)),
      totalFound: 10,
      limited: true,
    });
    expect(dto.results.map((hit) => hit.fullKey)).toEqual(['app.save', 'app.saveAs']);
    expect(Object.keys(dto)).toEqual(['query', 'results', 'totalFound', 'limited']);
  });

  it('uses the normal query fallback for a supplied page', () => {
    expect(
      mapSearchPageToDto(undefined, { results: [], totalFound: 0, limited: false, limit: 100 }, collection).query,
    ).toBe('');
  });
});

describe('mapSearchResultToDto', () => {
  it('omits undefined similarity but includes zero similarity', () => {
    const hit: SearchResult = { ...entry, key: 'app.save', matchType: 'exact-value', matchedLocales: ['en'] };
    expect(mapSearchResultToDto(hit, collection)).not.toHaveProperty('similarity');
    expect(mapSearchResultToDto({ ...hit, similarity: 0 }, collection).similarity).toBe(0);
  });
});
