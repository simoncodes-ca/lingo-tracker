import { Pipe, type PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'highlight',
  standalone: true,
  pure: true,
})
export class HighlightPipe implements PipeTransform {
  readonly #sanitizer = inject(DomSanitizer);
  readonly #minimumSearchLength = 3;

  transform(text: string | null | undefined, searchTerm: string | null | undefined): SafeHtml {
    if (!text) {
      return '';
    }

    if (!searchTerm || searchTerm.length < this.#minimumSearchLength) {
      return this.#sanitizer.bypassSecurityTrustHtml(this.#escapeHtml(text));
    }

    const escapedSearchTerm = this.#escapeRegex(searchTerm);
    const searchPattern = new RegExp(escapedSearchTerm, 'gi');
    const highlightedText = text.replace(searchPattern, (match) => {
      return `<mark class="search-highlight">${this.#escapeHtml(match)}</mark>`;
    });

    return this.#sanitizer.bypassSecurityTrustHtml(highlightedText);
  }

  #escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  #escapeHtml(text: string): string {
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
  }
}
