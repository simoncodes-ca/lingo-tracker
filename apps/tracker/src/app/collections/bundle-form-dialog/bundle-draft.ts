import type {
  BundleDefinitionDto,
  BundleDryRunRequestDto,
  CollectionBundleDefinitionDto,
  EntrySelectionRuleDto,
  TokenCasingDto,
} from '@simoncodes-ca/data-transfer';
import { checkBundleDefinition, normalizeBundleDefinition } from '@simoncodes-ca/domain';
import type { BundleFormResult } from './bundle-form-dialog-data';

export type MergeStrategy = 'merge' | 'override';
export type TagOperator = 'Any' | 'All';
export type TokenCasingChoice = 'inherit' | TokenCasingDto;
export type IcuChoice = 'inherit' | 'on' | 'off';

export interface BundleDraftRule {
  matchingPattern: string;
  matchingTags: string[];
  matchingTagOperator: TagOperator;
}

export interface BundleDraftCollection {
  name: string;
  bundledKeyPrefix: string;
  mergeStrategy: MergeStrategy;
  allEntries: boolean;
  rules: BundleDraftRule[];
}

/** The form's raw choices, including values hidden by its toggles. */
export interface BundleDraft {
  name: string;
  dist: string;
  bundleName: string;
  allCollections: boolean;
  collections: BundleDraftCollection[];
  typesEnabled: boolean;
  typeDistFile: string;
  tokenCasing: TokenCasingChoice;
  tokenConstantName: string;
  transformICUToTransloco: IcuChoice;
}

export function toBundleDraft(
  definition: BundleDefinitionDto | undefined,
  allCollectionNames: readonly string[],
): BundleDraft {
  const bundle = definition === undefined ? undefined : normalizeBundleDefinition(definition);
  const collections = bundle?.collections;
  const selected = Array.isArray(collections) ? collections.map(toDraftCollection) : [];
  const first = allCollectionNames[0];
  if (collections !== 'All' && selected.length === 0 && first) {
    selected.push(toDraftCollection({ name: first, entriesSelectionRules: 'All' }));
  }

  return {
    name: '',
    dist: bundle?.dist ?? '',
    bundleName: bundle?.bundleName ?? '',
    allCollections: collections === 'All',
    collections: selected,
    typesEnabled: Boolean(bundle?.typeDistFile),
    typeDistFile: bundle?.typeDistFile ?? '',
    tokenCasing: bundle?.tokenCasing ?? 'inherit',
    tokenConstantName: bundle?.tokenConstantName ?? '',
    transformICUToTransloco:
      bundle?.transformICUToTransloco === undefined ? 'inherit' : bundle.transformICUToTransloco ? 'on' : 'off',
  };
}

function toDraftCollection(collection: CollectionBundleDefinitionDto): BundleDraftCollection {
  return {
    name: collection.name,
    bundledKeyPrefix: collection.bundledKeyPrefix ?? '',
    mergeStrategy: collection.mergeStrategy ?? 'merge',
    allEntries: collection.entriesSelectionRules === 'All',
    rules: Array.isArray(collection.entriesSelectionRules) ? collection.entriesSelectionRules.map(toDraftRule) : [],
  };
}

function toDraftRule(rule: EntrySelectionRuleDto): BundleDraftRule {
  return {
    matchingPattern: rule.matchingPattern,
    matchingTags: [...(rule.matchingTags ?? [])],
    matchingTagOperator: rule.matchingTagOperator ?? 'Any',
  };
}

export function toBundleDefinition(draft: BundleDraft): BundleDefinitionDto {
  const collections: BundleDefinitionDto['collections'] = draft.allCollections
    ? 'All'
    : draft.collections.map((collection) => {
        const prefix = collection.bundledKeyPrefix.trim();
        const entriesSelectionRules: CollectionBundleDefinitionDto['entriesSelectionRules'] = collection.allEntries
          ? 'All'
          : collection.rules.map((rule) => ({
              matchingPattern: rule.matchingPattern.trim(),
              ...(rule.matchingTags.length > 0
                ? { matchingTags: [...rule.matchingTags], matchingTagOperator: rule.matchingTagOperator }
                : {}),
            }));
        return {
          name: collection.name,
          ...(prefix ? { bundledKeyPrefix: prefix } : {}),
          entriesSelectionRules,
          ...(collection.mergeStrategy === 'override' ? { mergeStrategy: 'override' as const } : {}),
        };
      });

  const typeDistFile = draft.typeDistFile.trim();
  const tokenConstantName = draft.tokenConstantName.trim();
  const typesOn = draft.typesEnabled && typeDistFile.length > 0;

  return {
    bundleName: draft.bundleName.trim(),
    dist: draft.dist.trim(),
    collections,
    ...(typesOn ? { typeDistFile } : {}),
    ...(typesOn && draft.tokenCasing !== 'inherit' ? { tokenCasing: draft.tokenCasing } : {}),
    ...(typesOn && tokenConstantName ? { tokenConstantName } : {}),
    ...(draft.transformICUToTransloco !== 'inherit'
      ? { transformICUToTransloco: draft.transformICUToTransloco === 'on' }
      : {}),
  };
}

export function bundleDryRunRequest(draft: BundleDraft): BundleDryRunRequestDto | undefined {
  const name = draft.name.trim();
  if (!name || !draft.dist.trim() || !draft.bundleName.trim()) return undefined;
  return { name, bundle: toBundleDefinition(draft) };
}

/** Build the write payload once, before validation or submission. */
export function toBundleResult(draft: BundleDraft): BundleFormResult {
  return { name: draft.name.trim(), bundle: toBundleDefinition(draft) };
}

/**
 * The same domain rules the API applies on save, so the dialog never closes on a
 * definition the server would reject. The key is checked only when it can be sent
 * (it is locked in edit mode).
 */
export function bundleDraftErrors(
  { name, bundle }: BundleFormResult,
  collectionNames: readonly string[],
  nameEditable: boolean,
): string[] {
  return checkBundleDefinition(bundle, collectionNames, nameEditable ? name : undefined).errors;
}
