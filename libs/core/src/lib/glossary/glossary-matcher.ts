/**
 * Matching and ranking for the Term Glossary.
 *
 * Flattens loaded resource tree(s) into a flat entry list, matches each extracted
 * candidate term against entries' **base-locale values only** (key names are
 * ignored), scores the matches, keeps the single best entry per candidate, dedupes
 * across candidates, and applies the per-locale status filter.
 */

import { escapeRegExp, type TranslationStatus } from '@simoncodes-ca/domain';
import type { Candidate } from './glossary-extractor';

/** A translation entry to match against (mapped from the Collection Set). */
export interface FlatEntry {
  /** Full dot-delimited key. */
  key: string;
  /** Collection the entry came from. */
  collection: string;
  /** Base-locale value (what candidates are matched against). */
  source: string;
  /** Per-locale translation values. */
  translations: Record<string, string>;
  /** Per-locale translation status. */
  status: Record<string, TranslationStatus | undefined>;
  /** Allowed locales for this entry; collection targets by default, explicit choices otherwise. */
  locales?: readonly string[];
}

/** A matched term as it appears in the output glossary. */
export interface GlossaryTerm {
  key: string;
  collection: string;
  base: string;
  matchedTerm: string;
  score: number;
  translations: Record<string, string>;
  status: Record<string, TranslationStatus>;
}

/** Options controlling matching/filtering. */
export interface MatchOptions {
  /** Locales to include in output (base locale should already be excluded). */
  locales: string[];
  /** When true, include `new`/`stale` locales (default: only translated + verified). */
  includeAll?: boolean;
}

/** Statuses considered trustworthy enough for the default glossary. */
const USABLE_STATUSES: ReadonlySet<TranslationStatus> = new Set<TranslationStatus>(['translated', 'verified']);

/**
 * Builds the unicode-aware word-boundary regex for a (already lowercased) candidate.
 * Hoisted out of the entry loop so it is compiled once per candidate, not per pair.
 */
function buildBoundaryRegex(candLower: string): RegExp {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(candLower)}(?:[^\\p{L}\\p{N}]|$)`, 'u');
}

/**
 * Core scorer operating on pre-normalized inputs (both lowercased; regex precompiled).
 * - Exact match → 1.0
 * - Whole-word/phrase containment → length ratio of term within the source (< 1.0)
 * - Otherwise → 0 (no match)
 */
function scoreLowered(candLower: string, boundary: RegExp, srcLower: string): number {
  if (!srcLower || !candLower) return 0;
  if (srcLower === candLower) return 1;
  if (!boundary.test(srcLower)) return 0;
  // Reward candidates that cover more of the source value.
  return candLower.length / srcLower.length;
}

/**
 * Scores how well a candidate term matches a base value (value-only).
 * - Exact (case-insensitive) match → 1.0
 * - Whole-word/phrase containment → length ratio of term within the source (< 1.0)
 * - Otherwise → 0 (no match)
 */
export function scoreMatch(term: string, source: string): number {
  const cand = term.trim().toLowerCase();
  if (!cand) return 0;
  return scoreLowered(cand, buildBoundaryRegex(cand), source.trim().toLowerCase());
}

/**
 * Builds the output term for an entry, applying the per-locale status filter.
 * Returns null when no requested locale survives the filter.
 */
function buildTerm(entry: FlatEntry, matchedTerm: string, score: number, options: MatchOptions): GlossaryTerm | null {
  const translations: Record<string, string> = {};
  const status: Record<string, TranslationStatus> = {};

  for (const locale of options.locales) {
    if (entry.locales && !entry.locales.includes(locale)) continue;
    const value = entry.translations[locale];
    if (value === undefined || value === '') continue;
    const localeStatus = entry.status[locale];
    if (!options.includeAll && !(localeStatus && USABLE_STATUSES.has(localeStatus))) {
      continue;
    }
    translations[locale] = value;
    if (localeStatus) status[locale] = localeStatus;
  }

  if (Object.keys(translations).length === 0) return null;

  return {
    key: entry.key,
    collection: entry.collection,
    base: entry.source,
    matchedTerm,
    score,
    translations,
    status,
  };
}

/**
 * Matches candidates against entries and returns the ranked glossary terms.
 * Keeps the single best entry per candidate, dedupes the same entry across
 * candidates (keeping the higher score), and sorts by score then key.
 */
export function matchGlossary(entries: FlatEntry[], candidates: Candidate[], options: MatchOptions): GlossaryTerm[] {
  const best = new Map<string, GlossaryTerm>();

  // Normalize each source value once, not once per candidate.
  const sourcesLower = entries.map((entry) => entry.source.trim().toLowerCase());

  for (const candidate of candidates) {
    const candLower = candidate.term.trim().toLowerCase();
    if (!candLower) continue;
    const boundary = buildBoundaryRegex(candLower);

    let bestEntry: FlatEntry | null = null;
    let bestScore = 0;

    for (let i = 0; i < entries.length; i++) {
      const score = scoreLowered(candLower, boundary, sourcesLower[i]);
      if (score > bestScore) {
        bestScore = score;
        bestEntry = entries[i];
        if (bestScore === 1) break; // exact match — nothing can beat it
      }
    }

    if (!bestEntry || bestScore <= 0) continue;

    const term = buildTerm(bestEntry, candidate.term, bestScore, options);
    if (!term) continue;

    // The NUL separator keeps collection/key pairs distinct even when either contains spaces.
    const id = `${term.collection}\0${term.key}`;
    const existing = best.get(id);
    if (!existing || term.score > existing.score) {
      best.set(id, term);
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}
