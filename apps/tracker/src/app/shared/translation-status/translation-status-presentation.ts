import { type StatusCounts, type TranslationStatus, worstStatus } from '@simoncodes-ca/domain';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';

/**
 * How the Tracker shows a translation status. The counting and the worst-status
 * rule live in `@simoncodes-ca/domain` (translation-status-summary); this module
 * only holds what is presentational: glyphs and label tokens. Every status ranking uses `STATUS_PRECEDENCE`. Colour
 * lives in CSS (`--color-status-*`) so both themes can move it.
 */
interface StatusPresentation {
  /** Material icon on status chips and rollup tooltip rows. */
  readonly icon: string;
  /** Glyph in the centre of the rollup ring. */
  readonly centerIcon: string;
  /** Transloco token for the status name. */
  readonly labelToken: string;
  /** Transloco token for the pluralized "{count} <status>". */
  readonly countToken: string;
}

export const STATUS_PRESENTATION: Readonly<Record<TranslationStatus, StatusPresentation>> = {
  stale: {
    icon: 'warning',
    centerIcon: 'warning',
    labelToken: TRACKER_TOKENS.BROWSER.STATUS.STALE,
    countToken: TRACKER_TOKENS.BROWSER.STATUS.STALECOUNTX,
  },
  new: {
    icon: 'add_circle',
    centerIcon: 'add_circle',
    labelToken: TRACKER_TOKENS.BROWSER.STATUS.NEW,
    countToken: TRACKER_TOKENS.BROWSER.STATUS.NEWCOUNTX,
  },
  translated: {
    icon: 'language',
    centerIcon: 'language',
    labelToken: TRACKER_TOKENS.BROWSER.STATUS.TRANSLATED,
    countToken: TRACKER_TOKENS.BROWSER.STATUS.TRANSLATEDCOUNTX,
  },
  verified: {
    icon: 'check_circle',
    centerIcon: 'check',
    labelToken: TRACKER_TOKENS.BROWSER.STATUS.VERIFIED,
    countToken: TRACKER_TOKENS.BROWSER.STATUS.VERIFIEDCOUNTX,
  },
};

/** Presentation for a status, or `undefined` for no status or a value that is not a known status. */
function presentationOf(status: TranslationStatus | undefined): StatusPresentation | undefined {
  return status ? STATUS_PRESENTATION[status] : undefined;
}

/** Material icon for a status chip; `help_outline` when the status is unknown. */
export function statusIconFor(status: TranslationStatus | undefined): string {
  return presentationOf(status)?.icon ?? 'help_outline';
}

/** Transloco token for a status label; `''` when the status is unknown. */
export function statusLabelTokenFor(status: TranslationStatus | undefined): string {
  return presentationOf(status)?.labelToken ?? '';
}

/**
 * What the rollup ring's centre reports: the worst status, except that `new`
 * and `stale` together are `mixed` — the two states a translator triages
 * differently, merged only because both are present.
 */
export type RollupCenterState = TranslationStatus | 'mixed';

/**
 * The rollup centre's state and glyph for an entry's counts. With no counted
 * locale the centre reads `translated`; the item header does not render the
 * rollup in that case.
 */
export function rollupCenter(counts: StatusCounts): { readonly state: RollupCenterState; readonly icon: string } {
  if (counts.new > 0 && counts.stale > 0) return { state: 'mixed', icon: 'priority_high' };

  const state = worstStatus(counts) ?? 'translated';
  return { state, icon: STATUS_PRESENTATION[state].centerIcon };
}
