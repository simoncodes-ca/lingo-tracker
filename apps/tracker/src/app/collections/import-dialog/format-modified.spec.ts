import { describe, expect, it } from 'vitest';
import { formatModified } from './format-modified';

// Local-time constructors keep the day arithmetic independent of the machine's zone.
const now = new Date(2026, 9, 20, 18, 0);
const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute);

describe('formatModified', () => {
  it('says today with the time', () => {
    expect(formatModified(at(20, 16, 45), now, 'en')).toMatch(/^today 4:45\sPM$/);
  });

  it('says yesterday with the time', () => {
    expect(formatModified(at(19, 9, 10), now, 'en')).toMatch(/^yesterday 9:10\sAM$/);
  });

  it('counts days for the last week, without a time', () => {
    expect(formatModified(at(17, 12, 0), now, 'en')).toBe('3 days ago');
    expect(formatModified(at(14, 12, 0), now, 'en')).toBe('6 days ago');
  });

  it('uses a short date beyond that', () => {
    expect(formatModified(at(13, 12, 0), now, 'en')).toBe('Oct 13, 2026');
  });

  it('uses the active language for the words', () => {
    expect(formatModified(at(19, 9, 10), now, 'de')).toContain('gestern');
    expect(formatModified(at(17, 12, 0), now, 'es')).toBe('hace 3 días');
  });

  it('shows an absolute date and time for a future timestamp', () => {
    expect(formatModified(at(22, 8, 0), now, 'en')).toMatch(/^Oct 22, 2026/);
  });

  it('accepts an ISO string', () => {
    expect(formatModified(at(20, 8, 5).toISOString(), now, 'en')).toMatch(/^today 8:05\sAM$/);
  });
});
