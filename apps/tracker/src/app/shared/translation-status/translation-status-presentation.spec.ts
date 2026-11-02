import type { StatusCounts, TranslationStatus } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import {
  type RollupCenterState,
  rollupCenter,
  STATUS_PRESENTATION,
  statusIconFor,
  statusLabelTokenFor,
} from './translation-status-presentation';

const ZERO: StatusCounts = { stale: 0, new: 0, translated: 0, verified: 0 };

describe('statusIconFor / statusLabelTokenFor', () => {
  it.each<[TranslationStatus, string, string]>([
    ['stale', 'warning', TRACKER_TOKENS.BROWSER.STATUS.STALE],
    ['new', 'add_circle', TRACKER_TOKENS.BROWSER.STATUS.NEW],
    ['translated', 'language', TRACKER_TOKENS.BROWSER.STATUS.TRANSLATED],
    ['verified', 'check_circle', TRACKER_TOKENS.BROWSER.STATUS.VERIFIED],
  ])('%s → %s', (status, icon, labelToken) => {
    expect(statusIconFor(status)).toBe(icon);
    expect(statusLabelTokenFor(status)).toBe(labelToken);
    expect(STATUS_PRESENTATION[status].icon).toBe(icon);
  });

  it('falls back for no status and for an unknown value', () => {
    const unknown = 'missing' as TranslationStatus;
    expect(statusIconFor(undefined)).toBe('help_outline');
    expect(statusIconFor(unknown)).toBe('help_outline');
    expect(statusLabelTokenFor(undefined)).toBe('');
    expect(statusLabelTokenFor(unknown)).toBe('');
  });
});

describe('rollupCenter', () => {
  it.each<[string, Partial<StatusCounts>, RollupCenterState, string]>([
    ['new and stale together', { new: 1, stale: 2, verified: 4 }, 'mixed', 'priority_high'],
    ['stale without new', { stale: 1, translated: 3 }, 'stale', 'warning'],
    ['new without stale', { new: 1, verified: 3 }, 'new', 'add_circle'],
    ['translated and verified', { translated: 1, verified: 3 }, 'translated', 'language'],
    ['all verified', { verified: 3 }, 'verified', 'check'],
    ['no counted locale', {}, 'translated', 'language'],
  ])('%s → %s', (_name, counts, state, icon) => {
    expect(rollupCenter({ ...ZERO, ...counts })).toEqual({ state, icon });
  });
});
