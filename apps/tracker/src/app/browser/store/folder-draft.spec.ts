import { describe, expect, it } from 'vitest';
import type { Feedback } from '../feedback';
import {
  cancelFolderDraft,
  dismissFolderDraftError,
  type FolderDraft,
  initialFolderDraft,
  settleFolderDraft,
  startFolderDraft,
} from './folder-draft';
import type { CreateFolderOutcome } from './folder-write-feedback';
import { refused } from './write-refusal';

const inline: Feedback = { tone: 'error', placement: 'inline', token: 'create.failed' };
const nextInline: Feedback = { ...inline, detail: 'Correct the folder name' };
const toast: Feedback = { ...inline, placement: 'toast' };
const draft: FolderDraft = {
  isAddingFolder: true,
  addFolderParentPath: 'common',
  folderDraftId: 7,
  folderCreateError: inline,
};
const folder = { name: 'new', fullPath: 'common.new', loaded: false };
const refusal = refused(new Error('Create failed'));
const closed: FolderDraft = {
  isAddingFolder: false,
  addFolderParentPath: null,
  folderDraftId: 7,
  folderCreateError: null,
};
const cleared = { ...draft, folderCreateError: null };
const settlements: { name: string; outcome: CreateFolderOutcome; expected: FolderDraft }[] = [
  { name: 'created', outcome: { kind: 'created', folder, created: true, feedback: null }, expected: closed },
  { name: 'existing folder', outcome: { kind: 'created', folder, created: false, feedback: toast }, expected: closed },
  {
    name: 'inline refusal',
    outcome: { ...refusal, feedback: nextInline },
    expected: { ...draft, folderCreateError: nextInline },
  },
  { name: 'toast refusal', outcome: { ...refusal, feedback: toast }, expected: cleared },
  { name: 'silent refusal', outcome: { ...refusal, feedback: null }, expected: cleared },
  { name: 'read-only', outcome: { kind: 'read-only', feedback: null }, expected: closed },
  { name: 'no collection', outcome: { kind: 'no-collection', feedback: null }, expected: closed },
  { name: 'stale session', outcome: { kind: 'stale-session', feedback: null }, expected: draft },
];

describe('folder draft', () => {
  it('starts closed with no parent or error', () => {
    expect(initialFolderDraft).toEqual({
      isAddingFolder: false,
      addFolderParentPath: null,
      folderDraftId: 0,
      folderCreateError: null,
    });
  });

  it.each([null, '', 'errors'])('starts at parent %s, replaces the identity and clears the error', (parent) => {
    const before = { ...draft };
    expect(startFolderDraft(draft, parent)).toEqual({
      isAddingFolder: true,
      addFolderParentPath: parent,
      folderDraftId: 8,
      folderCreateError: null,
    });
    expect(draft).toEqual(before);
  });

  it.each([
    ['cancel', cancelFolderDraft, { ...initialFolderDraft, folderDraftId: 8 }],
    ['dismiss error', dismissFolderDraftError, { ...draft, folderCreateError: null }],
  ] as const)('%s transitions without mutating the input', (_, transition, expected) => {
    const before = { ...draft };
    expect(transition(draft)).toEqual(expected);
    expect(draft).toEqual(before);
  });

  it.each(settlements)('settles $name without mutating the input', ({ outcome, expected }) => {
    const before = { ...draft };
    const settled = settleFolderDraft(draft, draft.folderDraftId, outcome);
    expect(settled).toEqual(expected);
    if (outcome.kind === 'stale-session') expect(settled).toBe(draft);
    expect(draft).toEqual(before);
  });

  it.each(settlements)('ignores $name for a replaced or cancelled draft', ({ outcome }) => {
    for (const current of [startFolderDraft(draft, 'errors'), cancelFolderDraft(draft)]) {
      expect(settleFolderDraft(current, draft.folderDraftId, outcome)).toBe(current);
    }
  });

  it('keeps separate instances independent', () => {
    const sidebar = startFolderDraft(initialFolderDraft, null);
    const picker = startFolderDraft(initialFolderDraft, '');
    expect(settleFolderDraft(picker, picker.folderDraftId, { ...refusal, feedback: inline })).toEqual({
      ...picker,
      folderCreateError: inline,
    });
    expect(sidebar).toEqual({ ...draft, addFolderParentPath: null, folderDraftId: 1, folderCreateError: null });
    expect(initialFolderDraft.folderDraftId).toBe(0);
  });
});
