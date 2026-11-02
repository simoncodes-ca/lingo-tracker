import { describe, expect, it } from 'vitest';
import {
  honouredImportSourceStatus,
  IMPORT_STRATEGIES,
  type ImportStrategy,
  type ImportStrategyPolicy,
  importStrategyPolicy,
  isImportStrategy,
  type ResolveImportStatusParams,
  resolveImportStatus,
} from './import-strategy-policy';

// Expected rows pin every field independently of the production policy table.
const policies: readonly (readonly [ImportStrategy, ImportStrategyPolicy])[] = [
  [
    'translation-service',
    {
      defaults: { createMissing: false, updateComments: false, updateTags: false },
      honoursOptionOverrides: false,
      writesBaseLocale: false,
      resolvesReferences: false,
      valueSyntax: 'stored',
      honoursSourceStatusByDefault: false,
      reconfirmsUnchanged: true,
      statusOnChanged: 'translated',
      statusOnUnchanged: 'reconfirm',
    },
  ],
  [
    'verification',
    {
      defaults: { createMissing: false, updateComments: false, updateTags: false },
      honoursOptionOverrides: false,
      writesBaseLocale: false,
      resolvesReferences: false,
      valueSyntax: 'stored',
      honoursSourceStatusByDefault: false,
      reconfirmsUnchanged: true,
      statusOnChanged: 'verified',
      statusOnUnchanged: 'verified',
    },
  ],
  [
    'migration',
    {
      defaults: { createMissing: true, updateComments: true, updateTags: true },
      honoursOptionOverrides: true,
      writesBaseLocale: true,
      resolvesReferences: true,
      valueSyntax: 'runtime',
      honoursSourceStatusByDefault: true,
      reconfirmsUnchanged: false,
      statusOnChanged: 'translated',
      statusOnUnchanged: 'keep',
    },
  ],
  [
    'update',
    {
      defaults: { createMissing: false, updateComments: false, updateTags: false },
      honoursOptionOverrides: false,
      writesBaseLocale: false,
      resolvesReferences: false,
      valueSyntax: 'stored',
      honoursSourceStatusByDefault: false,
      reconfirmsUnchanged: false,
      statusOnChanged: 'keep',
      statusOnUnchanged: 'untouched',
    },
  ],
];

describe('importStrategyPolicy', () => {
  it('lists the supported strategies in a frozen array', () => {
    expect(IMPORT_STRATEGIES).toEqual(['translation-service', 'verification', 'migration', 'update']);
    expect(Object.isFrozen(IMPORT_STRATEGIES)).toBe(true);
  });

  it('accepts only supported string strategies', () => {
    for (const strategy of IMPORT_STRATEGIES) expect(isImportStrategy(strategy)).toBe(true);
    for (const invalid of [
      'foo',
      '',
      'Verification',
      'constructor',
      '__proto__',
      'toString',
      undefined,
      null,
      1,
      true,
      {},
      [],
    ]) {
      expect(isImportStrategy(invalid)).toBe(false);
    }
  });

  it('throws a plain programmer error naming an invalid strategy', () => {
    for (const invalid of ['foo', 'constructor', '__proto__']) {
      try {
        importStrategyPolicy(invalid as ImportStrategy);
        expect.fail('Invalid strategies must throw');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
        expect((error as Error).message).toBe(`Unknown import strategy "${invalid}".`);
      }
    }
  });

  it.each(policies)('defines every field for %s in a stable frozen record', (strategy, expected) => {
    const policy = importStrategyPolicy(strategy);
    expect(policy).toEqual(expected);
    expect(importStrategyPolicy(strategy)).toBe(policy);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.defaults)).toBe(true);
  });
});

describe('honouredImportSourceStatus', () => {
  it.each([
    ['translation-service', true, true],
    ['translation-service', false, false],
    ['translation-service', undefined, false],
    ['verification', true, true],
    ['verification', false, false],
    ['verification', undefined, false],
    ['migration', true, true],
    ['migration', false, false],
    ['migration', undefined, true],
    ['update', true, true],
    ['update', false, false],
    ['update', undefined, false],
    [undefined, true, true],
    [undefined, false, false],
    [undefined, undefined, false],
  ] as const)('%s with preserveStatus %s honours source status: %s', (strategy, preserveStatus, honours) => {
    for (const status of ['new', 'translated', 'stale', 'verified', undefined] as const) {
      expect(honouredImportSourceStatus(strategy, preserveStatus, status)).toBe(honours ? status : undefined);
    }
  });
});

describe('resolveImportStatus', () => {
  const base: ResolveImportStatusParams = {
    strategy: 'translation-service',
    oldStatus: undefined,
    incomingStatus: undefined,
    valueChanged: true,
    baseChecksumChanged: false,
  };

  it('uses an honoured incoming status over every strategy', () => {
    expect(resolveImportStatus({ ...base, strategy: 'verification', incomingStatus: 'stale' })).toBe('stale');
  });

  it('verification always verifies', () => {
    expect(resolveImportStatus({ ...base, strategy: 'verification', valueChanged: false, oldStatus: 'stale' })).toBe(
      'verified',
    );
  });

  it('update keeps the previous status, defaulting to translated', () => {
    expect(resolveImportStatus({ ...base, strategy: 'update', oldStatus: 'verified' })).toBe('verified');
    expect(resolveImportStatus({ ...base, strategy: 'update' })).toBe('translated');
  });

  it.each(['translation-service', 'migration'] as const)('%s marks a changed value translated', (strategy) => {
    expect(resolveImportStatus({ ...base, strategy, oldStatus: 'verified' })).toBe('translated');
  });

  describe('unchanged value', () => {
    const unchanged = { ...base, valueChanged: false };

    it('translation-service re-confirms a stale value as translated', () => {
      expect(resolveImportStatus({ ...unchanged, oldStatus: 'stale' })).toBe('translated');
    });

    it('translation-service re-confirms when the base checksum moved', () => {
      expect(resolveImportStatus({ ...unchanged, oldStatus: 'new', baseChecksumChanged: true })).toBe('translated');
    });

    it('translation-service keeps a verified status when nothing moved', () => {
      expect(resolveImportStatus({ ...unchanged, oldStatus: 'verified' })).toBe('verified');
    });

    it('migration keeps the previous status', () => {
      expect(resolveImportStatus({ ...unchanged, strategy: 'migration', oldStatus: 'stale' })).toBe('stale');
      expect(resolveImportStatus({ ...unchanged, strategy: 'migration' })).toBe('translated');
    });
  });
});

describe('resolveImportStatus policy outcomes', () => {
  it.each([
    ['translation-service', 'translated', 'translated', 'translated', 'verified'],
    ['verification', 'verified', 'verified', 'verified', 'verified'],
    ['migration', 'translated', 'stale', 'new', 'verified'],
    ['update', 'verified', 'stale', 'new', 'verified'],
    [undefined, 'translated', 'stale', 'new', 'verified'],
  ] as const)('%s preserves changed and unchanged outcomes', (strategy, changed, stale, moved, stable) => {
    const params: ResolveImportStatusParams = {
      strategy,
      oldStatus: 'verified',
      incomingStatus: undefined,
      valueChanged: true,
      baseChecksumChanged: false,
    };
    expect(resolveImportStatus(params)).toBe(changed);
    expect(resolveImportStatus({ ...params, valueChanged: false, oldStatus: 'stale' })).toBe(stale);
    expect(resolveImportStatus({ ...params, valueChanged: false, oldStatus: 'new', baseChecksumChanged: true })).toBe(
      moved,
    );
    expect(resolveImportStatus({ ...params, valueChanged: false })).toBe(stable);
    const missingStatus = strategy === 'verification' ? 'verified' : 'translated';
    expect(resolveImportStatus({ ...params, oldStatus: undefined })).toBe(missingStatus);
    expect(resolveImportStatus({ ...params, oldStatus: undefined, valueChanged: false })).toBe(missingStatus);
    for (const incomingStatus of ['new', 'translated', 'stale', 'verified'] as const) {
      expect(resolveImportStatus({ ...params, incomingStatus })).toBe(incomingStatus);
      expect(resolveImportStatus({ ...params, incomingStatus, valueChanged: false })).toBe(incomingStatus);
    }
  });
});
