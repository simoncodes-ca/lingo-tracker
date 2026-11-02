/**
 * Translation status for a resource in a specific locale.
 */
export const TRANSLATION_STATUSES = ['new', 'translated', 'stale', 'verified'] as const;

export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

/** A locale without stored metadata starts as new. */
export const DEFAULT_MISSING_METADATA_STATUS = 'new' as const;

/** Statuses that still need translation work: the "Needs work" selection set. Order is not a ranking; `STATUS_PRECEDENCE` owns all ranking. */
export const NEEDS_WORK_STATUSES = ['new', 'stale'] as const satisfies readonly TranslationStatus[];

export function isNeedsWorkStatus(status: TranslationStatus): boolean {
  return NEEDS_WORK_STATUSES.some((needsWorkStatus) => needsWorkStatus === status);
}

/** True only for the complete needs-work selection, regardless of order. */
export function isNeedsWorkStatusSelection(statuses: readonly TranslationStatus[]): boolean {
  return (
    statuses.length === NEEDS_WORK_STATUSES.length && NEEDS_WORK_STATUSES.every((status) => statuses.includes(status))
  );
}

export function isTranslationStatus(value: unknown): value is TranslationStatus {
  return TRANSLATION_STATUSES.some((status) => status === value);
}
