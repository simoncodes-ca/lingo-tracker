/**
 * Similarity between two strings on a 0..1 scale, where 1 means identical.
 *
 * The score is the Levenshtein edit distance normalized by the length of the
 * longer string: `1 - distance / max(a.length, b.length)`. Comparison is
 * case sensitive — callers that want case-insensitive matching should lower
 * case both inputs first, as the CLI's `find-similar` command does.
 *
 * Edits are counted per UTF-16 code unit, not per grapheme, so an emoji or a
 * combining mark costs more than one edit.
 */
export function normalizedLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0 && lb === 0) return 1;
  if (la === 0 || lb === 0) return 0;

  // Single-row Levenshtein: `dp` holds the previous row as the loop starts each
  // row, and `prev` carries the diagonal cell (previous row, j - 1).
  const dp: number[] = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= lb; j++) {
      // `dp[j]` still holds the previous row's value here, so it must be read
      // into `prev` (the next cell's diagonal) before it is overwritten.
      const diagonal = prev;
      prev = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? diagonal : 1 + Math.min(dp[j - 1], dp[j], diagonal);
    }
  }

  return 1 - dp[lb] / Math.max(la, lb);
}
