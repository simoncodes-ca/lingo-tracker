import { STATUS_PRECEDENCE, type StatusCounts, type TranslationStatus } from '@simoncodes-ca/domain';

/** The ring draws its arcs in the reverse of the status precedence, starting at 12 o'clock. */
const RING_ORDER: readonly TranslationStatus[] = [...STATUS_PRECEDENCE].reverse();

/** Arcs shorter than this (in SVG user units) are not drawn: they would be a speck. */
const MIN_ARC_LENGTH = 0.5;

export interface RingSegment {
  readonly status: TranslationStatus;
  /** Arc length in SVG user units. */
  readonly length: number;
  /** `stroke-dasharray` value: the arc, then the gap that closes the circle. */
  readonly dashArray: string;
  /** `stroke-dashoffset` value: minus the length of the arcs drawn before this one. */
  readonly dashOffset: number;
}

/**
 * The visible arcs of the rollup ring, in drawing order. Each status takes its share
 * of the circumference; a status with no locales, or a share too small to see, is
 * omitted. No locales at all gives no arcs.
 */
export function ringSegments(counts: StatusCounts, total: number, radius: number): readonly RingSegment[] {
  if (total === 0) return [];

  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;
  const segments: RingSegment[] = [];
  for (const status of RING_ORDER) {
    const length = ((counts[status] || 0) / total) * circumference;
    if (length > MIN_ARC_LENGTH) {
      segments.push({
        status,
        length,
        dashArray: `${length} ${circumference - length}`,
        dashOffset: -accumulated,
      });
    }
    accumulated += length;
  }
  return segments;
}

/** Tooltip rows run in status precedence order (most urgent first), then by locale code. */
export function sortLocaleRows<T extends { readonly code: string; readonly status: TranslationStatus }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) => STATUS_PRECEDENCE.indexOf(a.status) - STATUS_PRECEDENCE.indexOf(b.status) || a.code.localeCompare(b.code),
  );
}
