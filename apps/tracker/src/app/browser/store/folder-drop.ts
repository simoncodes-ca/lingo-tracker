import { isDescendantFolderPath } from '@simoncodes-ca/domain';
import type { DragData } from '../types/drag-data';
import { parentFolderPath } from './folder-tree.utils';

export interface FolderDropDecision {
  canLand: boolean;
  noOp: 'same-folder' | 'already-at-location' | 'already-in-folder' | null;
}

/** Decides whether a sidebar drag can land on a folder path ('' is the collection root). */
export function folderDrop(
  drag: DragData | null | undefined,
  targetPath: string,
  readOnly: boolean,
): FolderDropDecision {
  if (readOnly || !drag) return { canLand: false, noOp: null };

  if (drag.type === 'folder') {
    const source = drag.path;
    if (!source) return { canLand: false, noOp: null };
    if (source === targetPath) return { canLand: false, noOp: 'same-folder' };
    if (isDescendantFolderPath(source, targetPath)) return { canLand: false, noOp: null };
    if ((parentFolderPath(source) ?? '') === targetPath)
      return { canLand: targetPath !== '', noOp: 'already-at-location' };
    return { canLand: true, noOp: null };
  }

  if (!drag.key || drag.folderPath === undefined) return { canLand: false, noOp: null };
  if (drag.folderPath === targetPath) return { canLand: false, noOp: 'already-in-folder' };
  if (targetPath === '') return { canLand: false, noOp: null };
  return { canLand: true, noOp: null };
}
