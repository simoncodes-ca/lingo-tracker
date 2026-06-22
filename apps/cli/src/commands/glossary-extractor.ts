/**
 * Candidate-term extraction for the `glossary` command.
 *
 * This module is the **extraction seam** of the glossary pipeline. Given a block
 * of base-locale text, an extractor produces the candidate terms/phrases that are
 * subsequently matched against existing translation entries.
 *
 * The default `ngramExtractor` is deterministic and dependency-free: it lowercases,
 * splits into sentences, tokenizes, drops stopwords, and emits unigrams + bigrams.
 *
 * The {@link CandidateExtractor} type is the boundary that lets a future AI-based
 * extractor (e.g. Claude pulling key terms out of each sentence) drop in without
 * touching the matching/ranking/output stages. The `--extractor` flag selects the
 * implementation via {@link resolveExtractor}; only `ngram` is implemented today.
 */

/** A single candidate term extracted from the input block. */
export interface Candidate {
  /** The normalized (lowercased) term, a unigram or bigram. */
  term: string;
}

/**
 * Extraction strategy: turns a raw text block into candidate terms to match.
 * The stable seam for swapping in alternative (e.g. AI-based) extractors.
 */
export type CandidateExtractor = (block: string) => Candidate[];

/** Available extraction modes. Only `ngram` is implemented today. */
export type ExtractorMode = 'ngram' | 'ai';

/**
 * Common English words dropped before forming candidates. These are
 * either grammatical glue (articles, prepositions, conjunctions, pronouns,
 * auxiliaries) or words so common that matching them against entry values
 * produces noise rather than signal.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'done',
  'for',
  'from',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'him',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'may',
  'me',
  'might',
  'more',
  'most',
  'must',
  'my',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'out',
  'over',
  'own',
  'per',
  'said',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'upon',
  'us',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'whose',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
]);

/** Minimum length for a unigram token to be kept as a candidate. */
const MIN_TERM_LENGTH = 2;

/** Options for the n-gram extractor. */
export interface NgramExtractorOptions {
  /** Minimum unigram length (default {@link MIN_TERM_LENGTH}). */
  minLength?: number;
  /** Stopwords to drop (default {@link STOPWORDS}). */
  stopwords?: ReadonlySet<string>;
}

// Matches word tokens including unicode letters/digits (base locale may be accented).
const WORD_TOKEN = /[\p{L}\p{N}]+/gu;

/**
 * Splits a block into rough sentences so bigrams never span sentence boundaries.
 * Boundaries are sentence punctuation and line breaks.
 */
function splitSentences(block: string): string[] {
  return block
    .split(/[.!?\n\r]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Deterministic extractor: unigrams + bigrams of content words, stopwords removed.
 *
 * Bigrams are formed from *adjacent content words* (after stopword removal) so that
 * "save your changes" yields the bigram "save changes" — which can match a real UI
 * label. Spurious bigrams simply fail to match downstream, so this is safe.
 */
export function createNgramExtractor(options: NgramExtractorOptions = {}): CandidateExtractor {
  const minLength = options.minLength ?? MIN_TERM_LENGTH;
  const stopwords = options.stopwords ?? STOPWORDS;

  return (block: string): Candidate[] => {
    if (!block || block.trim().length === 0) return [];

    const seen = new Set<string>();
    const candidates: Candidate[] = [];

    const add = (term: string): void => {
      if (!seen.has(term)) {
        seen.add(term);
        candidates.push({ term });
      }
    };

    for (const sentence of splitSentences(block)) {
      const tokens = (sentence.toLowerCase().match(WORD_TOKEN) ?? []).filter(
        (t) => t.length >= minLength && !stopwords.has(t),
      );

      for (let i = 0; i < tokens.length; i++) {
        add(tokens[i]);
        if (i + 1 < tokens.length) {
          add(`${tokens[i]} ${tokens[i + 1]}`);
        }
      }
    }

    return candidates;
  };
}

/** Default n-gram extractor instance. */
export const ngramExtractor: CandidateExtractor = createNgramExtractor();

/**
 * Resolves an {@link ExtractorMode} to a concrete {@link CandidateExtractor}.
 * The `ai` mode is reserved for a future implementation and throws today.
 */
export function resolveExtractor(mode: ExtractorMode): CandidateExtractor {
  switch (mode) {
    case 'ngram':
      return ngramExtractor;
    case 'ai':
      throw new Error('The "ai" extractor is not yet implemented. Use --extractor ngram (the default).');
    default:
      throw new Error(`Unknown extractor "${mode}". Supported: ngram.`);
  }
}
