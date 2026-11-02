import type {
  CreateResourceDto,
  FolderNodeDto,
  ResourceSummaryDto,
  TranslationStatus,
  UpdateResourceDto,
} from '@simoncodes-ca/data-transfer';
import {
  type AppRuntime,
  DEFAULT_MISSING_METADATA_STATUS,
  folderPathFromSegments,
  folderPathLeaf,
  folderPathSegments,
  type IcuConstructKind,
  isValidSegment,
  joinFolderPath,
  parentFolderPath,
  resolveResourceKey,
  splitResolvedKey,
  summaryTarget,
  translocoToICU,
  unrenderableIcuConstructs,
} from '@simoncodes-ca/domain';
import { addTagToList, removeTagFromList } from '../../../shared/tag-list-edit';
import { findFolderInTree } from '../../store/folder-tree.utils';

/*
 * Resource Entry Draft: the translation editor's rules, as plain data and functions.
 *
 * The dialog owns the forms, focus, popovers and timers. Everything it decides
 * about the entry itself lives here, with no Angular dependency: where a dotted
 * key lands, whether the key is taken, what "Where it lands" shows, what a save
 * sends, and whether closing would lose work.
 */

/** One non-base locale as the editor holds it. */
export interface LocaleDraft {
  locale: string;
  value: string;
  status: TranslationStatus;
}

/** The entry the editor is writing, as plain data. */
export interface ResourceEntryDraft {
  /** The entry key: a single segment inside `folderPath`. */
  key: string;
  /** Dot-delimited folder the entry lands in; '' for the collection root. */
  folderPath: string;
  baseValue: string;
  comment: string;
  tags: readonly string[];
  /** Every non-base locale, in the editor's order. */
  translations: readonly LocaleDraft[];
}

/** One trimmed address for the preview, conflict hand-off and create request. */
export function resolveDraftKey(draft: Pick<ResourceEntryDraft, 'key' | 'folderPath'>): string {
  return resolveResourceKey(draft.key.trim(), draft.folderPath);
}

// ── Dotted-key absorption ────────────────────────────────────────────────────

export interface KeyAbsorption {
  /** What stays in the key field. */
  leaf: string;
  /** The folder the key's prefix names; absent when the key carried no folder. */
  folder?: string;
}

/**
 * The primary user arrives holding a full dotted key (`apps.common.buttons.ok`),
 * and the key field accepts one segment. Rather than reject the one string they
 * have, the dotted prefix becomes the folder and the leaf stays in the field.
 *
 * Leading and consecutive dots leave invalid empty folder segments; a
 * trailing dot means a folder is finished but no leaf started. A prefix with an
 * invalid segment is not absorbed (returns null), so the validator names the
 * real problem instead of a silently mangled key.
 *
 * Continuation: while the target folder is still the one the last absorption
 * produced (`folderFromKey`), typing `a.` then `b.` extends `a` to `a.b`. A
 * folder the user picked is never extended, only replaced.
 */
export function absorbDottedKey(
  rawKey: string,
  currentFolder: string,
  folderFromKey: string | null,
): KeyAbsorption | null {
  if (!rawKey.includes('.')) {
    return null;
  }

  const { folderPath: segments, entryKey: leaf } = splitResolvedKey(rawKey);

  if (segments.some((segment) => !isValidSegment(segment))) {
    return null;
  }
  if (segments.length === 0) {
    return { leaf };
  }

  const prefix = folderPathFromSegments(segments);
  const continues = folderFromKey !== null && currentFolder === folderFromKey;
  return { leaf, folder: continues ? joinFolderPath(folderFromKey, prefix) : prefix };
}

// ── Key collision ────────────────────────────────────────────────────────────

/** Where the editor can learn which entries a folder already holds. */
export interface KnownEntries {
  /** The browser's folder tree. A folder the tree has expanded carries its resources. */
  rootFolders: readonly FolderNodeDto[];
  /** The folder the browser list is showing. */
  browserFolderPath: string;
  /** What the browser list holds for that folder, nested resources included. */
  browserEntries: readonly ResourceSummaryDto[];
  /** Entry keys the editor fetched itself, per folder path. */
  fetched: ReadonlyMap<string, readonly string[]>;
}

/**
 * The entry keys known for a folder, or undefined when they are not known at all.
 * Three sources, cheapest first: a folder already expanded in the tree, the folder
 * the browser is showing, then anything the editor fetched.
 *
 * The browser lists a folder with its nested resources folded in. Those live in
 * another folder, so only resources whose `folderPath` is this folder count.
 */
export function folderEntryKeys(folderPath: string, known: KnownEntries): ReadonlySet<string> | undefined {
  const expanded = folderPath ? findFolderInTree(known.rootFolders, folderPath)?.tree?.resources : undefined;
  const listed = expanded ?? (known.browserFolderPath === folderPath ? known.browserEntries : undefined);
  const keys =
    listed?.filter((resource) => resource.folderPath === folderPath).map((resource) => resource.entryKey) ??
    known.fetched.get(folderPath);
  return keys ? new Set(keys) : undefined;
}

/**
 * Whether `key` is already taken in `folderPath`.
 *
 * The same rule as the writer's `addResource`: the entry key is an exact,
 * case-sensitive property of the folder's `resource_entries.json`. A folder whose
 * entries are not known yet claims nothing. `ownKey` is the entry being edited:
 * its key is locked, and it never collides with itself.
 */
export function collisionFor(key: string, folderPath: string, known: KnownEntries, ownKey?: string): boolean {
  const entryKey = key.trim();
  if (!entryKey || entryKey === ownKey) {
    return false;
  }
  return folderEntryKeys(folderPath, known)?.has(entryKey) === true;
}

// ── "Where it lands" context tree ────────────────────────────────────────────

/** How many sibling entries the context tree lists before it counts the rest. */
export const CONTEXT_TREE_ENTRY_LIMIT = 8;

/** One row of the context column's "Where it lands" tree. */
export interface ContextTreeNode {
  kind: 'folder' | 'entry' | 'more';
  name: string;
  path: string;
  depth: number;
  /** The folder the entry lands in. */
  here?: boolean;
  expanded?: boolean;
  /** The entry this dialog is writing, and what it is doing to it. */
  mark?: 'new' | 'editing' | 'exists';
}

export interface ContextTreeInput {
  folderPath: string;
  key: string;
  known: KnownEntries;
  /** Folders whose entries are in flight. They show as a folder and nothing more. */
  loadingFolders: ReadonlySet<string>;
  /** The entry being edited, marked `editing` rather than `new` or `exists`. */
  ownKey?: string;
}

/**
 * The mini tree in "Where it lands": the target folder's siblings under their
 * shared parent, the target expanded over the entries it holds, and the entry
 * being written marked. Entries are only known for folders something has loaded;
 * an unloaded folder shows as a folder node and nothing more.
 *
 * `moreLabel` names the row that counts the entries outside the window.
 */
export function contextTree(input: ContextTreeInput, moreLabel: (hidden: number) => string): ContextTreeNode[] {
  const roots = input.known.rootFolders;
  const targetPath = input.folderPath;
  const segments = folderPathSegments(targetPath);
  const nodes: ContextTreeNode[] = [];

  if (segments.length === 0) {
    for (const folder of roots) {
      nodes.push({ kind: 'folder', name: folder.name, path: folder.fullPath, depth: 0 });
    }
    nodes.push(...entryNodes(input, 0, moreLabel));
    return nodes;
  }

  const parentPath = parentFolderPath(targetPath) ?? '';
  const siblings = parentPath ? (findFolderInTree(roots, parentPath)?.tree?.children ?? []) : roots;
  let depth = 0;

  if (parentPath) {
    nodes.push({ kind: 'folder', name: folderPathLeaf(parentPath), path: parentPath, depth: 0, expanded: true });
    depth = 1;
  }

  let placed = false;
  for (const sibling of siblings) {
    const here = sibling.fullPath === targetPath;
    placed = placed || here;
    nodes.push({ kind: 'folder', name: sibling.name, path: sibling.fullPath, depth, here, expanded: here });
    if (here) {
      nodes.push(...entryNodes(input, depth + 1, moreLabel));
    }
  }

  // The folder may not be in the tree yet: a path absorbed from a dotted key, or
  // one the user has not expanded. It is still where the entry lands.
  if (!placed) {
    nodes.push({
      kind: 'folder',
      name: folderPathLeaf(targetPath),
      path: targetPath,
      depth,
      here: true,
      expanded: true,
    });
    nodes.push(...entryNodes(input, depth + 1, moreLabel));
  }

  return nodes;
}

/**
 * The entries already in the target folder, plus the one being written. A folder
 * can hold hundreds of keys and this is a glance, not a browser, so the list is a
 * window around the entry being written; the rest is one count.
 */
function entryNodes(input: ContextTreeInput, depth: number, moreLabel: (hidden: number) => string): ContextTreeNode[] {
  const { folderPath, known, loadingFolders, ownKey } = input;
  const key = input.key.trim();
  const loaded = folderEntryKeys(folderPath, known);

  // Listing the new entry alone would claim the folder is empty before we know it.
  if (!loaded && loadingFolders.has(folderPath)) {
    return [];
  }

  const names = new Set(loaded ?? []);
  const taken = key.length > 0 && names.has(key);
  if (key) {
    names.add(key);
  }

  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const limit = CONTEXT_TREE_ENTRY_LIMIT;
  let shown = sorted;
  if (sorted.length > limit) {
    const anchor = key ? Math.max(0, sorted.indexOf(key)) : 0;
    const start = Math.min(Math.max(0, anchor - Math.floor(limit / 2)), sorted.length - limit);
    shown = sorted.slice(start, start + limit);
  }

  const markFor = (name: string): ContextTreeNode['mark'] => {
    if (!key || name !== key) return undefined;
    if (key === ownKey) return 'editing';
    return taken ? 'exists' : 'new';
  };

  const nodes: ContextTreeNode[] = shown.map((name) => ({
    kind: 'entry',
    name,
    path: resolveResourceKey(name, folderPath),
    depth,
    mark: markFor(name),
  }));

  const hidden = sorted.length - shown.length;
  if (hidden > 0) {
    nodes.push({ kind: 'more', name: moreLabel(hidden), path: `${folderPath}::more`, depth });
  }

  return nodes;
}

// ── Tags ─────────────────────────────────────────────────────────────────────

/** The tag list with `raw` added in normalized form; the same list when it adds nothing new. */
export function addTag(tags: readonly string[], raw: string): readonly string[] {
  return addTagToList(tags, raw);
}

/** The tag list without `tag`. An inherited tag belongs to a folder and stays. */
export function removeTag(tags: readonly string[], tag: string, inherited: readonly string[]): readonly string[] {
  return removeTagFromList(tags, tag, { inherited });
}

// ── Saving ───────────────────────────────────────────────────────────────────

/**
 * The create request. Every translation typed alongside the base value goes in
 * as `new`, whatever its status pill says: nothing has been reviewed yet. The
 * server seeds the locales left empty by the collection's rule (auto-translated,
 * or a copy of the base value as `new`).
 */
export function toCreateDto(draft: ResourceEntryDraft): CreateResourceDto {
  const translations = draft.translations
    .filter((translation) => translation.value.trim().length > 0)
    .map((translation) => ({
      locale: translation.locale,
      value: translation.value,
      status: DEFAULT_MISSING_METADATA_STATUS,
    }));

  return {
    key: resolveDraftKey(draft),
    baseValue: draft.baseValue,
    comment: draft.comment.trim() || undefined,
    tags: draft.tags.length > 0 ? [...draft.tags] : undefined,
    translations: translations.length > 0 ? translations : undefined,
  };
}

/**
 * The locales an edit writes: those whose non-empty value changed or whose status moved.
 * An emptied locale with its status untouched is left alone.
 */
export function editedLocales(draft: ResourceEntryDraft, original: ResourceSummaryDto): LocaleDraft[] {
  return draft.translations.filter((translation) => {
    const previous = summaryTarget(original, translation.locale);
    const valueChanged = translation.value.trim().length > 0 && translation.value !== (previous?.value ?? '');
    const statusChanged = translation.status !== (previous?.status ?? DEFAULT_MISSING_METADATA_STATUS);
    return valueChanged || statusChanged;
  });
}

/** One value a save writes that the runtime cannot render, with the ICU constructs responsible. */
export interface UnrenderableWrite {
  locale: string;
  /** The value as written by the editor. */
  value: string;
  kinds: readonly IcuConstructKind[];
}

/**
 * The values a save writes that the runtime cannot render, base locale first.
 * Constructs are detected on the ICU form Core stores. Create writes the base value and every non-empty translation. Edit writes the
 * base value only when it changed, plus the locales `editedLocales` names.
 */
export function unrenderableWrites(
  draft: ResourceEntryDraft,
  original: ResourceSummaryDto | undefined,
  baseLocale: string,
  runtime: AppRuntime,
): UnrenderableWrite[] {
  const writes: { locale: string; value: string }[] = [];
  if (original) {
    if (draft.baseValue !== original.base.value) writes.push({ locale: baseLocale, value: draft.baseValue });
    writes.push(...editedLocales(draft, original));
  } else {
    writes.push({ locale: baseLocale, value: draft.baseValue });
    writes.push(...draft.translations.filter((translation) => translation.value.trim().length > 0));
  }
  return writes
    .map(({ locale, value }) => ({ locale, value, kinds: unrenderableIcuConstructs(translocoToICU(value), runtime) }))
    .filter(({ kinds }) => kinds.length > 0);
}

/**
 * The update request. The key is the entry's full key where it lives now (the
 * `original` it started from). A change of folder, the collection root included,
 * travels as `moveTo` (the destination folder; '' for the root). Tags are always
 * sent, so removing the last one clears them. Only changed locales are sent,
 * each with the draft's status. Untouched locales are omitted so Core can mark
 * them stale when the base value changes.
 */
export function toUpdateDto(draft: ResourceEntryDraft, original: ResourceSummaryDto): UpdateResourceDto {
  const dto: UpdateResourceDto = {
    key: original.fullKey,
    baseValue: draft.baseValue,
    comment: draft.comment.trim() || undefined,
    tags: [...draft.tags],
  };

  if (draft.folderPath !== original.folderPath) {
    dto.moveTo = draft.folderPath;
  }

  const locales = editedLocales(draft, original);
  if (locales.length > 0) {
    dto.locales = Object.fromEntries(
      locales.map((translation) => [translation.locale, { value: translation.value, status: translation.status }]),
    );
  }

  return dto;
}

/**
 * True when closing now would throw away work.
 *
 * `fieldsEdited` is the form's dirty flag: a field the user typed in counts even
 * when typed back to what it was. The folder and the tags are not form fields, so
 * they count only when they differ from where the editor started.
 */
export function hasUnsavedChanges(
  draft: ResourceEntryDraft,
  initial: ResourceEntryDraft,
  fieldsEdited: boolean,
): boolean {
  if (fieldsEdited || draft.folderPath !== initial.folderPath) {
    return true;
  }
  return draft.tags.length !== initial.tags.length || draft.tags.some((tag, i) => tag !== initial.tags[i]);
}
