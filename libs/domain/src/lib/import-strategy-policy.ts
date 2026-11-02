import type { TranslationStatus } from './translation-status';

/** Import strategies. Each row in the policy table defines one strategy's behavior. */
export type ImportStrategy = 'translation-service' | 'verification' | 'migration' | 'update';

/** Strategy used when an import does not specify one. */
export const DEFAULT_IMPORT_STRATEGY: ImportStrategy = 'translation-service';

/** Data-only rules shared by import processing and CLI defaults. */
export interface ImportStrategyPolicy {
  readonly defaults: {
    readonly createMissing: boolean;
    readonly updateComments: boolean;
    readonly updateTags: boolean;
  };
  /** Whether creation, comment and tag options can override the defaults. */
  readonly honoursOptionOverrides: boolean;
  readonly writesBaseLocale: boolean;
  readonly resolvesReferences: boolean;
  /** Whether the source carries app-runtime syntax or exported ICU. */
  readonly valueSyntax: 'runtime' | 'stored';
  readonly honoursSourceStatusByDefault: boolean;
  /** Refresh the base checksum when an unchanged translation is re-confirmed. */
  readonly reconfirmsUnchanged: boolean;
  readonly statusOnChanged: 'translated' | 'verified' | 'keep';
  /** `untouched` leaves the value and its metadata alone, even with a source status. */
  readonly statusOnUnchanged: 'verified' | 'keep' | 'reconfirm' | 'untouched';
}

const IMPORT_STRATEGY_POLICIES = Object.freeze({
  'translation-service': Object.freeze({
    defaults: Object.freeze({ createMissing: false, updateComments: false, updateTags: false }),
    honoursOptionOverrides: false,
    writesBaseLocale: false,
    resolvesReferences: false,
    valueSyntax: 'stored',
    honoursSourceStatusByDefault: false,
    reconfirmsUnchanged: true,
    statusOnChanged: 'translated',
    statusOnUnchanged: 'reconfirm',
  }),
  verification: Object.freeze({
    defaults: Object.freeze({ createMissing: false, updateComments: false, updateTags: false }),
    honoursOptionOverrides: false,
    writesBaseLocale: false,
    resolvesReferences: false,
    valueSyntax: 'stored',
    honoursSourceStatusByDefault: false,
    reconfirmsUnchanged: true,
    statusOnChanged: 'verified',
    statusOnUnchanged: 'verified',
  }),
  migration: Object.freeze({
    defaults: Object.freeze({ createMissing: true, updateComments: true, updateTags: true }),
    honoursOptionOverrides: true,
    writesBaseLocale: true,
    resolvesReferences: true,
    valueSyntax: 'runtime',
    honoursSourceStatusByDefault: true,
    reconfirmsUnchanged: false,
    statusOnChanged: 'translated',
    statusOnUnchanged: 'keep',
  }),
  update: Object.freeze({
    defaults: Object.freeze({ createMissing: false, updateComments: false, updateTags: false }),
    honoursOptionOverrides: false,
    writesBaseLocale: false,
    resolvesReferences: false,
    valueSyntax: 'stored',
    honoursSourceStatusByDefault: false,
    reconfirmsUnchanged: false,
    statusOnChanged: 'keep',
    statusOnUnchanged: 'untouched',
  }),
} satisfies Record<ImportStrategy, ImportStrategyPolicy>);

/** The supported strategies, in policy-table order. */
export const IMPORT_STRATEGIES: readonly ImportStrategy[] = Object.freeze(
  Object.keys(IMPORT_STRATEGY_POLICIES) as ImportStrategy[],
);

/** Checks untrusted input against the list of import strategies. */
export function isImportStrategy(value: unknown): value is ImportStrategy {
  return typeof value === 'string' && (IMPORT_STRATEGIES as readonly string[]).includes(value);
}

/** Returns the same frozen policy; an invalid strategy is a programmer error. */
export function importStrategyPolicy(strategy: ImportStrategy): ImportStrategyPolicy {
  if (!isImportStrategy(strategy)) throw new Error(`Unknown import strategy "${String(strategy)}".`);
  return IMPORT_STRATEGY_POLICIES[strategy];
}

/** A supplied preservation flag overrides the strategy's source-status default. */
export function honouredImportSourceStatus(
  strategy: ImportStrategy | undefined,
  preserveStatus: boolean | undefined,
  sourceStatus: TranslationStatus | undefined,
): TranslationStatus | undefined {
  const honoursSourceStatus =
    preserveStatus ?? (strategy ? importStrategyPolicy(strategy).honoursSourceStatusByDefault : false);
  return honoursSourceStatus ? sourceStatus : undefined;
}

export interface ResolveImportStatusParams {
  /** `undefined` gets no strategy-specific handling (rules 2, 3, and 5 do not apply). */
  readonly strategy: ImportStrategy | undefined;
  /** Status before the import, if the locale had metadata. */
  readonly oldStatus: TranslationStatus | undefined;
  /**
   * Status carried by the imported file, only when the caller has decided to honour it
   * (for example `preserveStatus`). `undefined` means "use the strategy".
   */
  readonly incomingStatus: TranslationStatus | undefined;
  /** True when the imported value differs from the stored value (or the locale had no value). */
  readonly valueChanged: boolean;
  /**
   * True when the locale's stored `baseChecksum` no longer matches the current base checksum.
   * Only relevant when the value is unchanged.
   */
  readonly baseChecksumChanged: boolean;
}

/**
 * Resolves the status of a target-locale value written (or re-confirmed) by an import.
 *
 * 1. An honoured incoming status always wins.
 * 2. `verification` → `verified`.
 * 3. `update` → keeps the previous status (`translated` if none).
 * 4. A changed value (`translation-service`, `migration`) → `translated`.
 * 5. An unchanged value re-confirmed by `translation-service` → `translated` when it was
 *    `stale` or its base checksum moved; otherwise the previous status is kept.
 * 6. Otherwise the previous status is kept (`translated` if none).
 */
export function resolveImportStatus(params: ResolveImportStatusParams): TranslationStatus {
  const { strategy, oldStatus, incomingStatus, valueChanged, baseChecksumChanged } = params;

  if (incomingStatus) return incomingStatus;
  const policy = strategy ? importStrategyPolicy(strategy) : undefined;
  if (!policy) return valueChanged ? 'translated' : (oldStatus ?? 'translated');

  if (valueChanged) {
    switch (policy.statusOnChanged) {
      case 'translated':
      case 'verified':
        return policy.statusOnChanged;
      case 'keep':
        return oldStatus ?? 'translated';
      default:
        return unexpectedStatusRule(policy.statusOnChanged);
    }
  }

  switch (policy.statusOnUnchanged) {
    case 'verified':
      return 'verified';
    case 'keep':
    case 'untouched':
      return oldStatus ?? 'translated';
    case 'reconfirm':
      return oldStatus === 'stale' || baseChecksumChanged ? 'translated' : (oldStatus ?? 'translated');
    default:
      return unexpectedStatusRule(policy.statusOnUnchanged);
  }
}

/** Extending either status-rule union requires an explicit outcome in its switch. */
function unexpectedStatusRule(rule: never): never {
  throw new Error(`Unknown import status rule "${String(rule)}".`);
}
