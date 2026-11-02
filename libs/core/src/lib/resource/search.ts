import { folderPathFromSegments, joinFolderPath, normalizedLevenshtein } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import type { StoredResource } from './read-collection';
import type { ResourceEntryMetadata } from './resource-entry-metadata';
import type { ResourceTreeNode } from './resource-tree-types';

/**
 * Resource Search — the one matcher over a collection's resources.
 *
 * `searchResources` reads any iterable of resources, so the source is the caller's choice: the
 * Collection Reader (`readCollection(collection).resources`) for the disk, or `treeResources(tree)`
 * for an index tree. It is pure: a folder the reader could not read is the caller's to report.
 *
 * Every match is ranked first and the limit is applied after, so a better match is never dropped
 * because it was found late.
 *
 * **Text mode** (the default) looks for the query (case-insensitive, trimmed) in the full key,
 * the base value and every stored translation. An entry gets one match type, the key first:
 * `exact-key`, else `partial-key`, else `exact-value` (some value equals the query), else
 * `partial-value` (some value contains it). Ranking: exact-key, exact-value, partial-key,
 * partial-value, then key.
 *
 * **Similar-value mode** compares the query with the base value only (both trimmed and
 * lowercased) and scores it with `normalizedLevenshtein` (0..1). A resource matches when
 * - the score is at least {@link SIMILARITY_THRESHOLD} (0.8: `save` / `saved`), or
 * - one text contains the other as whole words (`Save` / `Save draft`) and the score, then
 *   `shorter / longer` length (what `normalizedLevenshtein` gives for a contained text), is at
 *   least {@link CONTAINMENT_MIN_SCORE} (0.4), so a short label inside a long sentence does not count.
 * Whole words, not substrings: over a whole collection a substring rule matches fragments
 * (`No` in `Cannot`, `connect` in `connection`). Letters, digits and apostrophes are word
 * characters (`don` is not a word of "don't"). Ranking: score (highest first), then a resource
 * whose key also contains the query, then key. Each result has `matchType: 'similar-value'` and
 * its `similarity`.
 *
 * An entry whose hand-edited `source` is not a string has the base value `''`: it never matches
 * on its value, and its result carries `source: ''`.
 */

/** How the query is compared with each resource. */
export type SearchMode = 'text' | 'similar-value';

/**
 * How a result matched. A text-mode result has exactly one match type, the key checked first:
 * an entry whose key contains the query is a key match even when a value matches too.
 */
export type MatchType = 'exact-key' | 'partial-key' | 'exact-value' | 'partial-value' | 'similar-value';

export interface SearchOptions {
  /** Default: `'text'`. */
  readonly mode?: SearchMode;
  /** How many results to return, after ranking. Default: 100; maximum: 500. */
  readonly limit?: number;
}

/** A resource the search can read: its full key and entry. `StoredResource` fits; `treeResources` yields it. */
export type SearchableResource = Pick<StoredResource, 'fullKey' | 'entry'>;

/** One hit. It carries what the Resource Summary builder reads (`source`, `translations`, `metadata`, `comment`, `tags`). */
export interface SearchResult {
  /** Full dot-delimited key. */
  key: string;
  /** Base value (the entry's `source`). */
  source: string;
  /** The stored translations, keyed by locale. */
  translations: Record<string, string>;
  /** The entry's stored metadata, keyed by locale. */
  metadata: ResourceEntryMetadata;
  matchType: MatchType;
  /** Locales whose value matched (value and similar-value matches). */
  matchedLocales?: string[];
  /** Similar-value mode only: the score, 0..1. */
  similarity?: number;
  comment?: string;
  tags?: string[];
}

/** Minimum `normalizedLevenshtein` score for a similar-value match without whole-word containment. */
export const SIMILARITY_THRESHOLD = 0.8;

/**
 * Minimum score (`shorter / longer` length) for a whole-word containment match. It keeps `Save` /
 * `Save draft` (0.4) and drops a short label inside a long sentence, in either direction.
 */
export const CONTAINMENT_MIN_SCORE = 0.4;

const DEFAULT_LIMIT = 100;
const MAX_SEARCH_LIMIT = 500;

export interface SearchRequest {
  readonly kind: 'search';
  readonly query: string;
  readonly mode: SearchMode;
  readonly limit: number;
}

export type NormalizedSearchRequest = { readonly kind: 'blank' } | SearchRequest;

/** The shared request rule. Callers choose their default and map transport values before calling it. */
export function normalizeSearchRequest(
  request: { readonly query: string; readonly mode: SearchMode; readonly limit?: number },
  defaultLimit: number,
): NormalizedSearchRequest {
  const query = request.query.trim();
  if (query.length === 0) return { kind: 'blank' };
  const requested = request.limit;
  const limit = requested !== undefined && Number.isInteger(requested) && requested > 0 ? requested : defaultLimit;
  return { kind: 'search', query, mode: request.mode, limit: Math.min(limit, MAX_SEARCH_LIMIT) };
}

export interface SearchPage {
  readonly results: SearchResult[];
  readonly limited: boolean;
  readonly limit: number;
  readonly totalFound: number;
}

/** Ranks every hit once, then returns the requested page and its true total. */
export function searchPage(
  resources: Iterable<SearchableResource>,
  collection: Pick<Collection, 'baseLocale'>,
  request: SearchRequest,
): SearchPage {
  const candidates = rankCandidates(resources, collection, request.query, request.mode);
  return {
    results: candidates.slice(0, request.limit).map(toResult),
    limited: candidates.length > request.limit,
    limit: request.limit,
    totalFound: candidates.length,
  };
}

const TEXT_RANK: Record<MatchType, number> = {
  'exact-key': 1,
  'exact-value': 2,
  'partial-key': 3,
  'partial-value': 4,
  'similar-value': 5,
};

/** A match before it is ranked: just what the ranking reads. It becomes a `SearchResult` only when it survives the limit. */
interface Candidate {
  readonly resource: SearchableResource;
  readonly matchType: MatchType;
  readonly matchedLocales?: string[];
  readonly similarity?: number;
  /** The key contains the query (the similar-value tie-break). */
  readonly keyMatches: boolean;
}

type CandidateMatch = Omit<Candidate, 'resource' | 'keyMatches'>;

/** Searches `resources` (see the module rules above). A blank query returns no results. */
export function searchResources(
  resources: Iterable<SearchableResource>,
  collection: Pick<Collection, 'baseLocale'>,
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  const request = normalizeSearchRequest({ query, mode: options.mode ?? 'text', limit: options.limit }, DEFAULT_LIMIT);
  if (request.kind === 'blank') return [];
  return rankCandidates(resources, collection, request.query, request.mode).slice(0, request.limit).map(toResult);
}

function rankCandidates(
  resources: Iterable<SearchableResource>,
  collection: Pick<Collection, 'baseLocale'>,
  query: string,
  mode: SearchMode,
): Candidate[] {
  const normalizedQuery = query.toLowerCase();

  const match = mode === 'text' ? matchText : matchSimilarValue;
  const candidates: Candidate[] = [];
  for (const resource of resources) {
    const key = resource.fullKey.toLowerCase();
    const found = match(resource, key, normalizedQuery, collection.baseLocale);
    if (found) candidates.push({ ...found, resource, keyMatches: key.includes(normalizedQuery) });
  }

  candidates.sort((a, b) =>
    mode === 'text'
      ? TEXT_RANK[a.matchType] - TEXT_RANK[b.matchType] || a.resource.fullKey.localeCompare(b.resource.fullKey)
      : (b.similarity ?? 0) - (a.similarity ?? 0) ||
        Number(b.keyMatches) - Number(a.keyMatches) ||
        a.resource.fullKey.localeCompare(b.resource.fullKey),
  );

  return candidates;
}

/** Every resource of an index tree with its full key, from the loaded folders only. */
export function* treeResources(tree: ResourceTreeNode): Generator<SearchableResource> {
  const prefix = folderPathFromSegments(tree.folderPathSegments);
  for (const entry of tree.resources) {
    yield { fullKey: joinFolderPath(prefix, entry.key), entry };
  }
  for (const child of tree.children) {
    if (child.loaded && child.tree) yield* treeResources(child.tree);
  }
}

function matchText(
  resource: SearchableResource,
  key: string,
  query: string,
  baseLocale: string,
): CandidateMatch | undefined {
  if (key === query) return { matchType: 'exact-key' };
  if (key.includes(query)) return { matchType: 'partial-key' };

  const values: Array<[string, unknown]> = [
    [baseLocale, baseValueOf(resource)],
    ...Object.entries(resource.entry.translations),
  ];
  const matchedLocales: string[] = [];
  let exact = false;
  for (const [locale, value] of values) {
    // A hand-edited file can hold a non-string value; it cannot match.
    if (typeof value !== 'string') continue;
    const normalizedValue = value.toLowerCase();
    if (!normalizedValue.includes(query)) continue;
    matchedLocales.push(locale);
    exact ||= normalizedValue === query;
  }

  return matchedLocales.length > 0 ? { matchType: exact ? 'exact-value' : 'partial-value', matchedLocales } : undefined;
}

function matchSimilarValue(
  resource: SearchableResource,
  _key: string,
  query: string,
  baseLocale: string,
): CandidateMatch | undefined {
  const similarity = similarValueScore(query, baseValueOf(resource).trim().toLowerCase());
  return similarity === undefined
    ? undefined
    : { matchType: 'similar-value', matchedLocales: [baseLocale], similarity };
}

/** The entry's base value; `''` when a hand-edited entry has no string `source`. */
function baseValueOf({ entry }: SearchableResource): string {
  return typeof entry.source === 'string' ? entry.source : '';
}

/** The similar-value score of two normalized texts, or `undefined` when they do not match. */
function similarValueScore(query: string, value: string): number | undefined {
  if (value.length === 0) return undefined;

  const [shorter, longer] = query.length <= value.length ? [query, value] : [value, query];
  const lengthRatio = shorter.length / longer.length;
  if (lengthRatio >= CONTAINMENT_MIN_SCORE && containsAsWords(longer, shorter)) return lengthRatio;
  // The Levenshtein score never exceeds the length ratio, so it cannot reach the threshold either.
  if (lengthRatio < SIMILARITY_THRESHOLD) return undefined;

  const score = normalizedLevenshtein(query, value);
  return score >= SIMILARITY_THRESHOLD ? score : undefined;
}

/** `text` holds `part` with no word character right before or after it. */
function containsAsWords(text: string, part: string): boolean {
  for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + 1)) {
    if (!isWordCharacter(text[at - 1]) && !isWordCharacter(text[at + part.length])) return true;
  }
  return false;
}

/**
 * A letter, a digit, or an apostrophe (`'`, `’`), so `don` is not a word of "don't". Tested one UTF-16
 * code unit at a time, so combining marks and letters outside the Basic Multilingual Plane are approximate.
 */
function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}'’]/u.test(character);
}

function toResult({ resource, matchType, matchedLocales, similarity }: Candidate): SearchResult {
  const { fullKey, entry } = resource;
  return {
    key: fullKey,
    source: baseValueOf(resource),
    translations: { ...entry.translations },
    metadata: entry.metadata,
    matchType,
    ...(matchedLocales && { matchedLocales }),
    ...(similarity !== undefined && { similarity }),
    comment: entry.comment,
    tags: entry.tags,
  };
}
