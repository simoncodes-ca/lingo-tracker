import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { STATUS_PRECEDENCE, type StatusCounts } from '@simoncodes-ca/domain';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { STATUS_PRESENTATION } from '../translation-status/translation-status-presentation';

/**
 * Signal of the active UI language. Read it inside a `computed` that calls
 * `TranslocoService.translate()` imperatively — that call is not reactive on its
 * own, so without this dependency the derived text survives a language switch
 * unchanged. Must be called from an injection context.
 */
export function injectActiveLang(): Signal<string> {
  const transloco = inject(TranslocoService);
  return toSignal(transloco.langChanges$, { initialValue: transloco.getActiveLang() });
}

/**
 * Builds a localized status breakdown such as "2 stale, 1 new" from a signal of
 * counts, worst status first so the part that needs attention is read first,
 * omitting statuses with no locales and falling back to the "no statuses"
 * message when every count is zero. The list is joined with `Intl.ListFormat` so
 * the separator follows the reader's language rather than a hardcoded comma.
 * Must be called from an injection context.
 */
export function injectStatusBreakdown(counts: Signal<StatusCounts>): Signal<string> {
  const transloco = inject(TranslocoService);
  const activeLang = injectActiveLang();

  return computed(() => {
    const lang = activeLang();
    const current = counts();

    const parts = STATUS_PRECEDENCE.filter((status) => current[status] > 0).map((status) =>
      transloco.translate(STATUS_PRESENTATION[status].countToken, { count: current[status] }),
    );

    if (parts.length === 0) {
      return transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONITEM.NOSTATUSES);
    }

    return formatList(parts, lang);
  });
}

/** Joins list parts for a language, falling back when the tag is not usable. */
function formatList(parts: string[], lang: string): string {
  try {
    return new Intl.ListFormat(lang, { style: 'short', type: 'unit' }).format(parts);
  } catch {
    return parts.join(', ');
  }
}
