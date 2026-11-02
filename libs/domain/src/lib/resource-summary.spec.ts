import { describe, expect, it } from 'vitest';
import { buildResourceSummary, displayStatus, type ResourceSummaryEntry, summaryTarget } from './resource-summary';

describe('displayStatus', () => {
  it('is the stored status when there is one', () => {
    expect(displayStatus({ locale: 'es', status: 'stale', needsWork: true, sameAsBase: false })).toBe('stale');
    expect(displayStatus({ locale: 'es', status: 'verified', needsWork: false, sameAsBase: false })).toBe('verified');
  });

  it('is new for a target that needs work and has no stored status (no metadata)', () => {
    expect(displayStatus({ locale: 'es', needsWork: true, sameAsBase: false })).toBe('new');
  });

  it('is undefined for no target, or a target with no status that needs no work', () => {
    expect(displayStatus(undefined)).toBeUndefined();
    expect(displayStatus({ locale: 'es', needsWork: false, sameAsBase: false })).toBeUndefined();
  });
});

const collection = { baseLocale: 'en', targetLocales: ['fr', 'de', 'es'], tags: ['ui'] };

function entry(overrides: Partial<ResourceSummaryEntry> = {}): ResourceSummaryEntry {
  return {
    source: 'OK',
    translations: { fr: "D'accord", de: 'OK' },
    metadata: {
      en: { checksum: 'base' },
      fr: { checksum: 'fr', baseChecksum: 'base', status: 'verified' },
      de: { checksum: 'base', baseChecksum: 'base', status: 'new' },
    },
    ...overrides,
  };
}

describe('buildResourceSummary', () => {
  it('gives the entry an explicit address', () => {
    const summary = buildResourceSummary('apps.common.buttons.ok', entry(), collection);

    expect(summary.fullKey).toBe('apps.common.buttons.ok');
    expect(summary.folderPath).toBe('apps.common.buttons');
    expect(summary.entryKey).toBe('ok');
  });

  it('addresses a root entry with an empty folder path', () => {
    const summary = buildResourceSummary('ok', entry(), collection);

    expect(summary.folderPath).toBe('');
    expect(summary.entryKey).toBe('ok');
  });

  it('takes the base locale from the collection, not from the metadata', () => {
    // Metadata whose shape would suggest "fr" is the base (no status, no baseChecksum).
    const misleading = entry({ metadata: { fr: { checksum: 'fr' }, en: { checksum: 'base' } } });

    expect(buildResourceSummary('ok', misleading, collection).base).toEqual({ locale: 'en', value: 'OK' });
  });

  it('lists every target locale in collection order, even without a value', () => {
    const summary = buildResourceSummary('ok', entry(), collection);

    expect(summary.targets.map((target) => target.locale)).toEqual(['fr', 'de', 'es']);
    expect(summary.targets[2]).toEqual({
      locale: 'es',
      value: undefined,
      status: undefined,
      needsWork: true,
      sameAsBase: false,
    });
  });

  it('ignores values for locales the collection does not target', () => {
    const summary = buildResourceSummary('ok', entry({ translations: { fr: 'x', it: 'y', en: 'OK' } }), collection);

    expect(summary.targets.map((target) => target.locale)).toEqual(['fr', 'de', 'es']);
  });

  it('applies the Staleness rule for needsWork', () => {
    const summary = buildResourceSummary(
      'ok',
      entry({
        metadata: {
          fr: { checksum: 'a', status: 'stale' },
          de: { checksum: 'b', status: 'translated' },
          es: { checksum: 'c', status: 'new' },
        },
      }),
      collection,
    );

    expect(summary.targets.map((target) => [target.locale, target.status, target.needsWork])).toEqual([
      ['fr', 'stale', true],
      ['de', 'translated', false],
      ['es', 'new', true],
    ]);
  });

  it('flags a value that is the base value verbatim, compared trimmed', () => {
    const summary = buildResourceSummary(
      'ok',
      entry({ source: 'Save ', translations: { fr: 'Save', de: 'Speichern', es: '   ' } }),
      collection,
    );

    expect(summary.targets.map((target) => [target.locale, target.sameAsBase])).toEqual([
      ['fr', true],
      ['de', false],
      ['es', false],
    ]);
  });

  it('keeps own tags and collection tags apart, and the comment when present', () => {
    const withDetails = buildResourceSummary('ok', entry({ tags: ['button'], comment: 'Primary action' }), collection);
    const plain = buildResourceSummary('ok', entry(), { ...collection, tags: [] });

    expect(withDetails).toMatchObject({ tags: ['button'], inheritedTags: ['ui'], comment: 'Primary action' });
    expect(plain.tags).toEqual([]);
    expect(plain.inheritedTags).toEqual([]);
    expect('comment' in plain).toBe(false);
  });
});

describe('summaryTarget', () => {
  const summary = buildResourceSummary('ok', entry(), collection);

  it('finds a target by locale', () => {
    expect(summaryTarget(summary, 'fr')?.status).toBe('verified');
  });

  it('is undefined for the base locale and for untargeted locales', () => {
    expect(summaryTarget(summary, 'en')).toBeUndefined();
    expect(summaryTarget(summary, 'it')).toBeUndefined();
  });
});
