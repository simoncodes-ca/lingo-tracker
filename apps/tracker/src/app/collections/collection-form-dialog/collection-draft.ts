import type { LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';
import { isUnderNodeModules, validateLocale } from '@simoncodes-ca/domain';
import { prepareProtectedTermAdd } from '../../shared/protected-terms/protected-term-add';
import { addTagToList, removeTagFromList } from '../../shared/tag-list-edit';
import type { CollectionFormDialogData } from './collection-form-dialog-data';

/** The collection form's values and the original choices needed to decide an edit. */
export interface CollectionDraft {
  mode: 'create' | 'edit';
  name: string;
  translationsFolder: string;
  baseLocale: string;
  effectiveBaseLocale: string;
  locales: string[];
  originalLocales: readonly string[];
  readOnly: boolean;
  readOnlyTouchedByUser: boolean;
  tags: string[];
  protectedTerms: string[];
  protectedTermsFile?: string;
  protectedTermsFilePath?: string;
}

export interface CollectionDraftResult {
  name: string;
  config: LingoTrackerCollectionDto;
}

export function toCollectionDraft(data: CollectionFormDialogData): CollectionDraft {
  const config = data.mode === 'edit' ? data.config : undefined;
  const locales = [...(config?.locales ?? [])];
  return {
    mode: data.mode,
    name: data.mode === 'edit' ? (data.name ?? '') : '',
    translationsFolder: config?.translationsFolder ?? '',
    baseLocale: config?.baseLocale ?? '',
    effectiveBaseLocale: data.mode === 'edit' ? (data.effectiveBaseLocale ?? '') : '',
    locales,
    originalLocales: [...locales],
    readOnly: config?.readOnly ?? false,
    readOnlyTouchedByUser: config?.readOnly !== undefined,
    tags: [...(config?.tags ?? [])],
    protectedTerms: [...(config?.protectedTerms ?? [])],
    protectedTermsFile: config?.protectedTermsFile,
    protectedTermsFilePath: config?.protectedTermsFilePath,
  };
}

export function displayedBaseLocale(
  mode: CollectionDraft['mode'],
  baseLocale: string,
  effectiveBaseLocale: string,
): string {
  return baseLocale || (mode === 'edit' ? effectiveBaseLocale : '');
}

export function chooseBaseLocale(
  mode: CollectionDraft['mode'],
  baseLocale: string,
  locales: readonly string[],
  locale: string,
): string {
  return mode === 'create' && locales.includes(locale) ? locale : baseLocale;
}

export function canRemoveLocale(
  mode: CollectionDraft['mode'],
  locale: string | undefined,
  baseLocale: string,
): boolean {
  return !(mode === 'edit' && locale === baseLocale);
}

export type AddLocaleResult =
  | { draft: CollectionDraft; kind: 'blank' }
  | { draft: CollectionDraft; kind: 'invalidLocale' | 'duplicateLocale' }
  | { draft: CollectionDraft; kind: 'added'; locale: string };

export function withAddedLocale(draft: CollectionDraft, raw: string): AddLocaleResult {
  const locale = raw.trim().toLowerCase();
  if (!locale) return { draft, kind: 'blank' };
  try {
    validateLocale(locale);
  } catch {
    return { draft, kind: 'invalidLocale' };
  }
  if (draft.locales.includes(locale)) return { draft, kind: 'duplicateLocale' };
  return {
    kind: 'added',
    locale,
    draft: {
      ...draft,
      locales: [...draft.locales, locale],
      baseLocale: draft.mode === 'create' && draft.locales.length === 0 ? locale : draft.baseLocale,
    },
  };
}

export function withoutLocale(draft: CollectionDraft, index: number): CollectionDraft {
  if (
    index < 0 ||
    index >= draft.locales.length ||
    !canRemoveLocale(
      draft.mode,
      draft.locales[index],
      displayedBaseLocale(draft.mode, draft.baseLocale, draft.effectiveBaseLocale),
    )
  )
    return draft;
  const locales = draft.locales.filter((_, position) => position !== index);
  const removed = draft.locales[index];
  return {
    ...draft,
    locales,
    baseLocale: draft.mode === 'create' && draft.baseLocale === removed ? (locales[0] ?? '') : draft.baseLocale,
  };
}

export function removedLocales(draft: CollectionDraft): string[] {
  return draft.originalLocales.filter((locale) => !draft.locales.includes(locale));
}

export function withFolder(draft: CollectionDraft, translationsFolder: string): CollectionDraft {
  return {
    ...draft,
    translationsFolder,
    readOnly: draft.readOnlyTouchedByUser ? draft.readOnly : isUnderNodeModules(translationsFolder),
  };
}

export function withUserReadOnly(draft: CollectionDraft, readOnly: boolean): CollectionDraft {
  return { ...draft, readOnly, readOnlyTouchedByUser: true };
}

/** A normalized, deduplicated tag; the same draft for an empty or duplicate one. */
export function withTag(draft: CollectionDraft, raw: string): CollectionDraft {
  const tags = addTagToList(draft.tags, raw);
  return tags === draft.tags ? draft : { ...draft, tags: [...tags] };
}

export function withoutTag(draft: CollectionDraft, tag: string): CollectionDraft {
  return { ...draft, tags: [...removeTagFromList(draft.tags, tag)] };
}

/** A protected term by the shared add rule; stored terms stay verbatim, and a blank or duplicate changes nothing. */
export function withProtectedTerm(draft: CollectionDraft, raw: string): CollectionDraft {
  const result = prepareProtectedTermAdd(draft.protectedTerms, raw);
  return result.kind === 'added' ? { ...draft, protectedTerms: [...draft.protectedTerms, result.term] } : draft;
}

export function withoutProtectedTerm(draft: CollectionDraft, term: string): CollectionDraft {
  return { ...draft, protectedTerms: draft.protectedTerms.filter((existing) => existing !== term) };
}

export function toCollectionResult(draft: CollectionDraft): CollectionDraftResult {
  return {
    name: draft.name,
    config: {
      translationsFolder: draft.translationsFolder,
      locales: [...draft.locales],
      ...(draft.baseLocale ? { baseLocale: draft.baseLocale } : {}),
      readOnly: draft.readOnly,
      tags: [...draft.tags],
      protectedTermsFile: draft.protectedTermsFile ?? '',
      ...(draft.protectedTermsFile ? { protectedTerms: [...draft.protectedTerms] } : {}),
    },
  };
}
