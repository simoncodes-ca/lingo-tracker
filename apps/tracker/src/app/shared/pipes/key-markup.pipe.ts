import { Pipe, type PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { escapeRegExp } from '@simoncodes-ca/domain';
import { truncateKey } from '../utils/truncate-key';

const MINIMUM_SEARCH_LENGTH = 3;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

/**
 * Break opportunities inside a resource key: after a run of separators (matched as
 * a run so the truncation ellipsis is never split) and at each camelCase hump,
 * which is where a key's own word boundaries are.
 */
const BREAK_POINTS = /(?<=\.)(?!\.)|(?<=[a-z0-9])(?=[A-Z])/g;

/**
 * Which slice of the key to render.
 *
 * `full` is the whole key, pre-shortened by `truncateKey` — the multi-line band
 * layout, where the key may wrap and nothing clips it.
 *
 * `head`/`tail` split the key so a single-line caller can elide its MIDDLE, which
 * CSS cannot do on its own. The head holds everything up to the leaf and is given
 * the ellipsis; the tail holds the leaf segment and never shrinks, so
 * `browser.translationEditor.context.allUpToDate` reads as
 * `browser.translationEd….allUpToDate` rather than losing the one segment that
 * tells sibling rows apart. Neither part is pre-shortened: the column width, not a
 * character count, decides what fits, so a second ellipsis would be arbitrary.
 */
export type KeyMarkupPart = 'full' | 'head' | 'tail';

/**
 * Index at which `head` ends and `tail` begins: the last dot in the key, so the
 * tail is `.leafSegment`. A key with no dot is all head and has no tail.
 */
export function keyLeafSplitIndex(key: string): number {
  const lastDot = key.lastIndexOf('.');
  return lastDot < 0 ? key.length : lastDot;
}

/** Whether splitting `key` into head and tail would actually produce a tail. */
export function hasKeyLeaf(key: string): boolean {
  return key.includes('.');
}

/**
 * Renders a dot-delimited resource key for display: shortens it, marks search
 * matches, and adds `<wbr>` break opportunities so a key too wide for its chip
 * wraps at its own word boundaries instead of being sliced mid-token.
 *
 * Truncation, highlighting and break opportunities are resolved together because
 * they overlap: the breaks are markup a downstream highlight pipe would escape,
 * and a break can fall on the same index where a search match starts or ends.
 *
 * Search matches are always computed against the whole key and only then sliced
 * to the requested part, so a term straddling the head/tail boundary is still
 * highlighted on both sides of it.
 */
@Pipe({
  name: 'keyMarkup',
  standalone: true,
  pure: true,
})
export class KeyMarkupPipe implements PipeTransform {
  readonly #sanitizer = inject(DomSanitizer);

  transform(key: string | null | undefined, searchTerm?: string | null, part: KeyMarkupPart = 'full'): SafeHtml {
    if (!key) {
      return '';
    }

    const text = part === 'full' ? truncateKey(key) : key;
    const splitIndex = keyLeafSplitIndex(text);
    const [from, to] =
      part === 'head' ? [0, splitIndex] : part === 'tail' ? [splitIndex, text.length] : [0, text.length];

    const term = searchTerm ?? '';
    const matches = term.length < MINIMUM_SEARCH_LENGTH ? [] : this.#matchRanges(text, term);
    const breaks = new Set([...text.matchAll(BREAK_POINTS)].map((match) => match.index ?? 0));

    let html = '';
    // A match that starts before this slice carries into it, so the <mark> is
    // reopened at the slice boundary rather than dropped.
    let inMatch = matches.some(([start, end]) => start < from && end > from);
    if (inMatch) html += '<mark class="search-highlight">';

    for (let index = from; index < to; index += 1) {
      if (breaks.has(index) && index > from) html += '<wbr>';

      if (!inMatch && matches.some(([start]) => start === index)) {
        html += '<mark class="search-highlight">';
        inMatch = true;
      }

      const char = text[index];
      html += HTML_ESCAPES[char] ?? char;

      if (inMatch && matches.some(([, end]) => end === index + 1)) {
        html += '</mark>';
        inMatch = false;
      }
    }

    // A match running past the end of this slice is closed here and reopened by
    // the next slice.
    if (inMatch) html += '</mark>';

    return this.#sanitizer.bypassSecurityTrustHtml(html);
  }

  /** Start/end index pairs for every occurrence of the search term. */
  #matchRanges(text: string, term: string): Array<[number, number]> {
    const pattern = new RegExp(escapeRegExp(term), 'gi');

    return [...text.matchAll(pattern)].map((match) => {
      const start = match.index ?? 0;
      return [start, start + match[0].length];
    });
  }
}
