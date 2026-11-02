import type { StatusCounts, TranslationStatus } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import { ringSegments, sortLocaleRows } from './rollup-geometry';

const RADIUS = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const counts = (partial: Partial<StatusCounts>): StatusCounts => ({
  new: 0,
  stale: 0,
  translated: 0,
  verified: 0,
  ...partial,
});

describe('ringSegments', () => {
  it('draws nothing when there are no locales', () => {
    expect(ringSegments(counts({}), 0, RADIUS)).toEqual([]);
  });

  it('draws one full arc for a single status, starting at offset 0', () => {
    const [segment, ...rest] = ringSegments(counts({ verified: 3 }), 3, RADIUS);
    expect(rest).toEqual([]);
    expect(segment.status).toBe('verified');
    expect(segment.length).toBeCloseTo(CIRCUMFERENCE, 10);
    expect(segment.dashArray).toBe(`${CIRCUMFERENCE} ${CIRCUMFERENCE - CIRCUMFERENCE}`);
    expect(segment.dashOffset).toBe(-0);
  });

  it('draws arcs in reverse status precedence with offsets that accumulate the earlier arc lengths', () => {
    const segments = ringSegments(counts({ new: 1, stale: 1, translated: 1, verified: 1 }), 4, RADIUS);
    const quarter = CIRCUMFERENCE / 4;

    expect(segments.map((s) => s.status)).toEqual(['verified', 'translated', 'new', 'stale']);
    segments.forEach((segment, index) => {
      expect(segment.length).toBeCloseTo(quarter, 10);
      expect(segment.dashOffset).toBeCloseTo(-quarter * index, 10);
      expect(segment.dashArray).toBe(`${segment.length} ${CIRCUMFERENCE - segment.length}`);
    });
  });

  it('keeps the gap of a skipped status in the offsets of the arcs after it', () => {
    const segments = ringSegments(counts({ new: 1, verified: 1 }), 2, RADIUS);

    expect(segments.map((s) => s.status)).toEqual(['verified', 'new']);
    expect(segments[0].dashOffset).toBeCloseTo(0, 10);
    expect(segments[1].dashOffset).toBeCloseTo(-CIRCUMFERENCE / 2, 10);
  });

  it('omits an arc no longer than half a unit but still advances the offset past it', () => {
    // 1 of 1000 locales is 0.0879 units of a 87.96 unit circle.
    const segments = ringSegments(counts({ verified: 1, new: 999 }), 1000, RADIUS);

    expect(segments.map((s) => s.status)).toEqual(['new']);
    expect(segments[0].dashOffset).toBeCloseTo(-CIRCUMFERENCE / 1000, 10);
  });

  it('applies the cut-off strictly: an arc of exactly 0.5 is dropped, just above it is drawn', () => {
    const total = CIRCUMFERENCE / 0.5;
    expect(ringSegments(counts({ stale: 1 }), total, RADIUS)).toEqual([]);
    expect(ringSegments(counts({ stale: 1 }), total * 0.99, RADIUS).map((s) => s.status)).toEqual(['stale']);
  });

  it('returns the arc length as a number equal to the first dash value', () => {
    for (const segment of ringSegments(counts({ new: 2, stale: 1, translated: 4 }), 7, RADIUS)) {
      expect(typeof segment.length).toBe('number');
      expect(Number.parseFloat(segment.dashArray.split(' ')[0])).toBe(segment.length);
    }
  });
});

describe('sortLocaleRows', () => {
  const row = (code: string, status: TranslationStatus) => ({ code, status });

  it('orders by status precedence (most urgent first), then by locale code', () => {
    const sorted = sortLocaleRows([
      row('fr', 'verified'),
      row('de', 'translated'),
      row('es', 'new'),
      row('ja', 'stale'),
      row('de-ch', 'new'),
      row('ar', 'verified'),
    ]);

    expect(sorted.map((r) => `${r.status}:${r.code}`)).toEqual([
      'stale:ja',
      'new:de-ch',
      'new:es',
      'translated:de',
      'verified:ar',
      'verified:fr',
    ]);
  });

  it('does not mutate its input and keeps extra row fields', () => {
    const input = [
      { code: 'b', status: 'verified' as const, icon: 'x' },
      { code: 'a', status: 'new' as const, icon: 'y' },
    ];
    const sorted = sortLocaleRows(input);

    expect(input.map((r) => r.code)).toEqual(['b', 'a']);
    expect(sorted).toEqual([input[1], input[0]]);
  });
});
