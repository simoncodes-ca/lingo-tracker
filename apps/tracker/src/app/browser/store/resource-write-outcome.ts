import type { DeleteResourceResponseDto, TranslateResourceResponseDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import type { Feedback } from '../feedback';
import { type Refusal, refused, refusedFeedback } from './write-refusal';

/** How a row's delete ended: the server removed the entry, found nothing to remove, or refused. */
export type DeleteResourceResult = Refusal | { kind: 'deleted' } | { kind: 'not-deleted' };
export type DeleteResourceOutcome = DeleteResourceResult & { readonly feedback: Feedback | null };
export type RequestedEntryDeleteOutcome = DeleteResourceOutcome | { kind: 'cancelled'; feedback: null };

/**
 * How a row's auto-translate ended.
 * - `translated`: at least one locale was translated and none skipped.
 * - `up-to-date`: nothing to translate and nothing skipped.
 * - `partial`: some locales were skipped (unsupported ICU, lost placeholder or protected term, or a concurrent change), whether or not others were translated.
 * - `refused`: the request failed.
 */
export type TranslateResourceResult =
  | Refusal
  | { kind: 'translated'; translatedCount: number }
  | { kind: 'up-to-date' }
  | { kind: 'partial'; translatedCount: number; skippedLocales: readonly string[] };

export type TranslateResourceOutcome = TranslateResourceResult & { readonly feedback: readonly Feedback[] };

export function deleteOutcome(response: DeleteResourceResponseDto): DeleteResourceResult {
  return { kind: response.entriesDeleted > 0 ? 'deleted' : 'not-deleted' };
}

export function translateOutcome({
  translatedCount,
  skippedLocales,
}: Pick<TranslateResourceResponseDto, 'translatedCount' | 'skippedLocales'>): TranslateResourceResult {
  if (skippedLocales.length > 0) return { kind: 'partial', translatedCount, skippedLocales };
  return translatedCount > 0 ? { kind: 'translated', translatedCount } : { kind: 'up-to-date' };
}

const { TOAST } = TRACKER_TOKENS.BROWSER;

/** The toast for a row's delete. */
export function deleteFeedback(outcome: DeleteResourceResult): Feedback | null {
  switch (outcome.kind) {
    case 'deleted':
      return { tone: 'success', placement: 'toast', token: TOAST.RESOURCEDELETED };
    case 'not-deleted':
      return { tone: 'error', placement: 'toast', token: TOAST.DELETEFAILED };
    case 'refused':
      return refusedFeedback(outcome.cause ?? outcome.error, TOAST.DELETEFAILED);
    default:
      return null;
  }
}

/**
 * The toasts for a row's auto-translate, in the order they show: a success when any locale was
 * translated, then a warning naming the locales that were skipped. A partial result can have both.
 */
export function translateFeedback(outcome: TranslateResourceResult): Feedback[] {
  switch (outcome.kind) {
    case 'translated':
      return [translatedFeedback(outcome.translatedCount)];
    case 'up-to-date':
      return [{ tone: 'info', placement: 'toast', token: TOAST.ALLLOCALESUPTODATE }];
    case 'partial':
      return [
        ...(outcome.translatedCount > 0 ? [translatedFeedback(outcome.translatedCount)] : []),
        {
          tone: 'warning',
          placement: 'toast',
          token: TOAST.SKIPPEDLOCALESX,
          params: { locales: outcome.skippedLocales.join(', ') },
        },
      ];
    case 'refused':
      return [refusedFeedback(outcome.cause ?? outcome.error, TOAST.TRANSLATEFAILED)];
    default:
      return [];
  }
}

function translatedFeedback(count: number): Feedback {
  return count === 1
    ? { tone: 'success', placement: 'toast', token: TOAST.LOCALETRANSLATED }
    : { tone: 'success', placement: 'toast', token: TOAST.LOCALESTRANSLATEDX, params: { count } };
}

export const decideDeleteResource = (result: DeleteResourceResult): DeleteResourceOutcome => ({
  ...(result.kind === 'refused' ? { kind: result.kind, error: result.error } : result),
  feedback: deleteFeedback(result),
});
export const decideTranslateResource = (result: TranslateResourceResult): TranslateResourceOutcome => ({
  ...(result.kind === 'refused' ? { kind: result.kind, error: result.error } : result),
  feedback: translateFeedback(result),
});

/** Preserve unexpected Error messages as well as API messages while normalising the refusal. */
export function deleteRefusal(error: unknown): DeleteResourceOutcome {
  return decideDeleteResource({ ...refused(error), cause: error });
}
export function translateRefusal(error: unknown): TranslateResourceOutcome {
  return decideTranslateResource({ ...refused(error), cause: error });
}

export function decideRequestedEntryDelete(
  result: DeleteResourceResult | { kind: 'cancelled' },
): RequestedEntryDeleteOutcome {
  return result.kind === 'cancelled' ? { ...result, feedback: null } : decideDeleteResource(result);
}

/** Successful translate responses replace the row, including up-to-date and partial results. */
export function translationChangedRow(outcome: TranslateResourceResult): boolean {
  return outcome.kind === 'translated' || outcome.kind === 'up-to-date' || outcome.kind === 'partial';
}
