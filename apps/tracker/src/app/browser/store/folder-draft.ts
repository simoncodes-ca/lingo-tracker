import type { Feedback } from '../feedback';
import type { CreateFolderOutcome } from './folder-write-feedback';

/** Sidebar and picker have independent presentation drafts, with one transition rule. */
export interface FolderDraft {
  isAddingFolder: boolean;
  addFolderParentPath: string | null;
  /** A start or cancel replaces the draft, invalidating pending confirmations. */
  folderDraftId: number;
  /** Only inline refusal feedback belongs under the draft's input. */
  folderCreateError: Feedback | null;
}

export const initialFolderDraft: FolderDraft = {
  isAddingFolder: false,
  addFolderParentPath: null,
  folderDraftId: 0,
  folderCreateError: null,
};

export function startFolderDraft(draft: FolderDraft, parentPath: string | null): FolderDraft {
  return {
    isAddingFolder: true,
    addFolderParentPath: parentPath,
    folderDraftId: draft.folderDraftId + 1,
    folderCreateError: null,
  };
}

export function cancelFolderDraft(draft: FolderDraft): FolderDraft {
  return { ...initialFolderDraft, folderDraftId: draft.folderDraftId + 1 };
}

export function dismissFolderDraftError(draft: FolderDraft): FolderDraft {
  return { ...draft, folderCreateError: null };
}

/** An obsolete write cannot settle this draft; a refusal leaves its input open for correction. */
export function settleFolderDraft(
  draft: FolderDraft,
  draftIdAtConfirm: number,
  outcome: CreateFolderOutcome,
): FolderDraft {
  if (outcome.kind === 'stale-session' || draft.folderDraftId !== draftIdAtConfirm) return draft;
  if (outcome.kind === 'refused') {
    return { ...draft, folderCreateError: outcome.feedback?.placement === 'inline' ? outcome.feedback : null };
  }
  // Settlement closes the current draft without replacing its identity.
  return { ...initialFolderDraft, folderDraftId: draft.folderDraftId };
}
