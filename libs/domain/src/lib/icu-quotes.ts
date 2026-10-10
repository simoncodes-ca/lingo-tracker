/**
 * ICU quote scanning shared by extraction, auto-fix, brace scanning and export.
 * Kept dependency-free so every ICU module can import it without a cycle.
 *
 * @module icu-quotes
 */

// Mirrors @messageformat/parser's opaque quoted token, including its closing-quote rule.
const ICU_QUOTED_RUN = /'[{}#](?:[^']|'')*'(?!')/uy;

/** Marks opaque ICU quoted runs in every context, preserving their raw apostrophes. */
export function scanIcuQuotes(value: string): { quoted: boolean[] } {
  const quoted = Array<boolean>(value.length).fill(false);
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "'") continue;
    if (value[i + 1] === "'") {
      i++;
      continue;
    }
    ICU_QUOTED_RUN.lastIndex = i;
    const run = ICU_QUOTED_RUN.exec(value);
    if (run) {
      quoted.fill(true, i, i + run[0].length);
      i += run[0].length - 1;
    }
  }
  return { quoted };
}

/** Reports complete Transloco interpolations with a delimiter inside an ICU quoted run. */
export function hasQuotedInterpolationDelimiter(icu: string): boolean {
  const { quoted } = scanIcuQuotes(icu);
  for (const match of icu.matchAll(/\{\{[^{}]*?\}\}/g)) {
    if (quoted[match.index] || quoted[match.index + match[0].length - 2]) return true;
  }
  return false;
}
