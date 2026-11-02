import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import type { Feedback } from '../feedback';
import { type Refusal, refusedFeedback } from './write-refusal';

const { TOAST, FOLDERPICKER } = TRACKER_TOKENS.BROWSER;
const ROOT_LABEL = { token: FOLDERPICKER.ROOTLABEL };

/**
 * What each Folder Writes call can end in, and the feedback each outcome carries.
 * The `*Result` types are what the write decided; the `*Outcome` types are the same
 * with the feedback `decide*` adds. These mappings are the only place that decides
 * what a folder write says, where it shows, and in which words.
 */
export type CreateFolderResult = Refusal | { kind: 'created'; folder: FolderNodeDto; created: boolean };
export type DeleteFolderResult = Refusal | { kind: 'deleted'; deleted: boolean };
export type MoveFolderResult =
  | Refusal
  | { kind: 'invalid-drop' }
  | { kind: 'moved'; folderName: string; destinationFolderPath: string }
  | { kind: 'noop'; reason: 'same-folder' | 'already-at-location' };
export type MoveResourceResult =
  | Refusal
  | { kind: 'moved'; entryKey: string; destinationFolderPath: string }
  | { kind: 'noop'; reason: 'already-in-folder' };

/** An outcome with the feedback it decided; `null` when the write says nothing. */
type Decided<T> = T extends unknown ? T & { readonly feedback: Feedback | null } : never;
export type CreateFolderOutcome = Decided<CreateFolderResult>;
export type DeleteFolderOutcome = Decided<DeleteFolderResult>;
export type MoveFolderOutcome = Decided<MoveFolderResult>;
export type MoveResourceOutcome = Decided<MoveResourceResult>;
export type RequestedFolderMoveOutcome = MoveFolderOutcome | { kind: 'cancelled'; feedback: null };
export type RequestedFolderDeleteOutcome = DeleteFolderOutcome | { kind: 'cancelled'; feedback: null };

/** A create refusal reads inline under the input the user typed in; an existing folder toasts. */
export function createFolderFeedback(result: CreateFolderResult): Feedback | null {
  switch (result.kind) {
    case 'created':
      // The new folder appearing (and being selected) is the feedback for a create.
      return result.created ? null : { tone: 'info', placement: 'toast', token: FOLDERPICKER.FOLDERALREADYEXISTS };
    case 'refused':
      return refusedFeedback(result.error, TOAST.CREATEFOLDERFAILED, 'inline');
    default:
      return null;
  }
}

export function deleteFolderFeedback(result: DeleteFolderResult): Feedback | null {
  return result.kind === 'refused' ? refusedFeedback(result.error, TOAST.DELETEFOLDERFAILED, 'toast') : null;
}

export function moveFolderFeedback(result: MoveFolderResult): Feedback | null {
  switch (result.kind) {
    case 'moved':
      return {
        tone: 'success',
        placement: 'toast',
        token: TOAST.FOLDERMOVEDX,
        params: { name: result.folderName, dest: result.destinationFolderPath || ROOT_LABEL },
      };
    case 'noop':
      return result.reason === 'already-at-location'
        ? { tone: 'info', placement: 'toast', token: TOAST.FOLDERALREADYATLOCATION }
        : null;
    case 'refused':
      return refusedFeedback(result.error, TOAST.MOVEFOLDERFAILED, 'toast');
    default:
      // 'invalid-drop' never reaches the user: the CDK drop predicates reject it first.
      return null;
  }
}

export function moveResourceFeedback(result: MoveResourceResult): Feedback | null {
  switch (result.kind) {
    case 'moved':
      return {
        tone: 'success',
        placement: 'toast',
        token: TOAST.RESOURCEMOVEDX,
        params: { name: result.entryKey, folder: result.destinationFolderPath || ROOT_LABEL },
      };
    case 'noop':
      return { tone: 'info', placement: 'toast', token: TOAST.RESOURCEALREADYINFOLDER };
    case 'refused':
      return refusedFeedback(result.error, TOAST.MOVERESOURCEFAILED, 'toast');
    default:
      return null;
  }
}

export const decideCreateFolder = (result: CreateFolderResult): CreateFolderOutcome => ({
  ...(result.kind === 'refused' ? { kind: result.kind, error: result.error } : result),
  feedback: createFolderFeedback(result),
});
export const decideDeleteFolder = (result: DeleteFolderResult): DeleteFolderOutcome => ({
  ...(result.kind === 'refused' ? { kind: result.kind, error: result.error } : result),
  feedback: deleteFolderFeedback(result),
});
export const decideMoveFolder = (result: MoveFolderResult): MoveFolderOutcome => ({
  ...(result.kind === 'refused' ? { kind: result.kind, error: result.error } : result),
  feedback: moveFolderFeedback(result),
});
export const decideMoveResource = (result: MoveResourceResult): MoveResourceOutcome => ({
  ...(result.kind === 'refused' ? { kind: result.kind, error: result.error } : result),
  feedback: moveResourceFeedback(result),
});

export function decideRequestedFolderDelete(
  result: DeleteFolderResult | { kind: 'cancelled' },
): RequestedFolderDeleteOutcome {
  return result.kind === 'cancelled' ? { ...result, feedback: null } : decideDeleteFolder(result);
}

export function decideRequestedFolderMove(
  result: MoveFolderResult | { kind: 'cancelled' },
): RequestedFolderMoveOutcome {
  return result.kind === 'cancelled' ? { ...result, feedback: null } : decideMoveFolder(result);
}
