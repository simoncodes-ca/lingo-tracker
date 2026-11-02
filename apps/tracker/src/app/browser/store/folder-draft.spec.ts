import { signal } from '@angular/core';
import { type Observable, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { Feedback } from '../feedback';
import { type FolderDraft, FolderDraftSession, initialFolderDraft } from './folder-draft';
import type { CreateFolderOutcome } from './folder-write-feedback';
import { refused } from './write-refusal';

const inline: Feedback = { tone: 'error', placement: 'inline', token: 'create.failed' };
const toast: Feedback = { ...inline, placement: 'toast' };
const folder = { name: 'new', fullPath: 'common.new', loaded: false };
const refusal = { ...refused(new Error('Create failed')), feedback: inline };
const created: CreateFolderOutcome = { kind: 'created', folder, created: true, feedback: null };

function harness(surface: 'sidebar' | 'picker') {
  const stored = signal<FolderDraft>(initialFolderDraft);
  const expanded = signal<ReadonlySet<string>>(new Set());
  const selected = signal<string | null>(null);
  const emit = vi.fn();
  const create = vi.fn<(name: string, parent: string | null) => Observable<CreateFolderOutcome>>();
  const writable = signal(true);
  const session = new FolderDraftSession({
    // Sidebar state is stored by NgRx and reset by Browser Session. Picker state lives in the session.
    ...(surface === 'sidebar' ? { state: { read: stored, write: (draft: FolderDraft) => stored.set(draft) } } : {}),
    create,
    canStart: () => writable(),
    staleDraft: surface === 'sidebar' ? 'collection-reset' : 'cancel',
    ...(surface === 'picker'
      ? {
          revealParent: (path: string) => expanded.update((paths) => new Set(paths).add(path)),
          created: (node: typeof folder) => {
            emit(node);
            selected.set(node.fullPath);
          },
        }
      : {}),
  });
  return { session, create, stored, expanded, selected, emit, writable };
}

const settlements: { name: string; outcome: CreateFolderOutcome; open: boolean; error: Feedback | null }[] = [
  { name: 'created', outcome: created, open: false, error: null },
  { name: 'existing folder', outcome: { ...created, created: false, feedback: toast }, open: false, error: null },
  { name: 'inline refusal', outcome: refusal, open: true, error: inline },
  { name: 'toast refusal', outcome: { ...refusal, feedback: toast }, open: true, error: null },
  { name: 'silent refusal', outcome: { ...refusal, feedback: null }, open: true, error: null },
  { name: 'read-only', outcome: { kind: 'read-only', feedback: null }, open: false, error: null },
  { name: 'no collection', outcome: { kind: 'no-collection', feedback: null }, open: false, error: null },
];

describe.each(['sidebar', 'picker'] as const)('Folder Draft Session: %s adapter', (surface) => {
  it('starts closed with no parent or error', () => {
    const { session } = harness(surface);
    expect(session.state()).toEqual(initialFolderDraft);
    expect(session.isCreating()).toBe(false);
  });

  it.each([null, '', 'errors'])('starts at parent %s, replaces the identity and clears the error', (parent) => {
    const { session, create } = harness(surface);
    session.start('common');
    const late = new Subject<CreateFolderOutcome>();
    create.mockReturnValue(late);
    session.confirm('new').subscribe();
    late.next(refusal);
    const before = session.state();
    session.start(parent);
    expect(session.state()).toEqual({
      isAddingFolder: true,
      addFolderParentPath: parent,
      folderDraftId: before.folderDraftId + 1,
      folderCreateError: null,
    });
    expect(before.folderCreateError).toEqual(inline);
  });

  it.each(['cancel', 'edit'] as const)('%s clears a refusal without changing the previous snapshot', (action) => {
    const { session, create } = harness(surface);
    const late = new Subject<CreateFolderOutcome>();
    create.mockReturnValue(late);
    session.start('common');
    session.confirm('new').subscribe();
    late.next(refusal);
    const before = session.state();
    session[action]();
    expect(session.state().folderCreateError).toBeNull();
    expect(session.state().isAddingFolder).toBe(action === 'edit');
    expect(before.folderCreateError).toEqual(inline);
  });

  it.each(settlements)('settles $name and returns its feedback', ({ outcome, open, error }) => {
    const { session, create, selected, expanded, emit } = harness(surface);
    const late = new Subject<CreateFolderOutcome>();
    create.mockReturnValue(late);
    session.start('common');
    const results: CreateFolderOutcome[] = [];
    const confirm = session.confirm('new');
    expect(create).not.toHaveBeenCalled();
    confirm.subscribe((result) => results.push(result));
    expect(session.isCreating()).toBe(true);
    expect(create).toHaveBeenCalledWith('new', 'common');
    late.next(outcome);
    expect(session.isCreating()).toBe(false);
    expect(session.state().isAddingFolder).toBe(open);
    expect(session.state().addFolderParentPath).toBe(open ? 'common' : null);
    expect(session.state().folderCreateError).toEqual(error);
    expect(results).toEqual([outcome]);
    if (surface === 'picker' && outcome.kind === 'created') {
      expect(selected()).toBe(folder.fullPath);
      expect(expanded().has('common')).toBe(true);
      expect(emit).toHaveBeenCalledWith(folder);
    } else {
      expect(selected()).toBeNull();
      expect(emit).not.toHaveBeenCalled();
    }
  });

  it.each([...settlements, { name: 'stale session', outcome: { kind: 'stale-session', feedback: null } as const }])(
    'ignores $name for a replaced or cancelled draft',
    ({ outcome }) => {
      for (const action of ['cancel', 'replace'] as const) {
        const { session, create } = harness(surface);
        const late = new Subject<CreateFolderOutcome>();
        create.mockReturnValue(late);
        session.start('common');
        session.confirm('new').subscribe();
        if (action === 'cancel') session.cancel();
        else session.start('errors');
        const current = session.state();
        late.next(outcome);
        expect(session.state()).toBe(current);
      }
    },
  );

  it('handles a stale session according to the surface reset ownership', () => {
    const { session, create } = harness(surface);
    const late = new Subject<CreateFolderOutcome>();
    create.mockReturnValueOnce(of(refusal)).mockReturnValueOnce(late);
    session.start('common');
    session.confirm('new').subscribe();
    session.confirm('retry').subscribe();
    const before = session.state();
    late.next({ kind: 'stale-session', feedback: null });
    expect(session.isCreating()).toBe(false);
    if (surface === 'picker') {
      expect(session.state().isAddingFolder).toBe(false);
      expect(session.state().folderCreateError).toBeNull();
      expect(session.state().addFolderParentPath).toBeNull();
    } else expect(session.state()).toBe(before);
  });

  it('honours the adapter start guard', () => {
    const { session, writable } = harness(surface);
    writable.set(false);
    session.start('common');
    expect(session.state()).toEqual(initialFolderDraft);
  });

  it.each([null, ''])('sends root parent %s as null to Folder Writes', (parent) => {
    const { session, create } = harness(surface);
    create.mockReturnValue(of(created));
    session.start(parent);
    session.confirm('new').subscribe();
    expect(create).toHaveBeenCalledWith('new', null);
  });

  it('allows the sidebar to supply the confirmed row parent explicitly', () => {
    const { session, create } = harness(surface);
    create.mockReturnValue(of(created));
    session.start('common');
    session.confirm('new', 'errors').subscribe();
    expect(create).toHaveBeenCalledWith('new', 'errors');
  });

  it('keeps identities distinct after collection storage resets', () => {
    const { session, create } = harness(surface);
    const late = new Subject<CreateFolderOutcome>();
    create.mockReturnValue(late);
    session.start('common');
    session.confirm('new').subscribe();
    const previousId = session.state().folderDraftId;
    session.reset();
    expect(session.state()).toEqual({ ...initialFolderDraft, folderDraftId: previousId + 1 });
    session.start('errors');
    late.next(refusal);
    expect(session.state().addFolderParentPath).toBe('errors');
    expect(session.state().folderCreateError).toBeNull();
  });

  it('keeps pending state until every outstanding write settles', () => {
    const { session, create } = harness(surface);
    const first = new Subject<CreateFolderOutcome>();
    const second = new Subject<CreateFolderOutcome>();
    create.mockReturnValueOnce(first).mockReturnValueOnce(second);
    session.start('common');
    session.confirm('new').subscribe();
    session.start('errors');
    session.confirm('other').subscribe();
    first.next(created);
    first.complete();
    expect(session.isCreating()).toBe(true);
    second.next(refusal);
    expect(session.isCreating()).toBe(false);
    expect(session.state().folderCreateError).toEqual(inline);
  });

  it('releases pending state on unsubscribe, empty completion and unexpected errors', () => {
    const { session, create } = harness(surface);
    const pending = new Subject<CreateFolderOutcome>();
    create.mockReturnValue(pending);
    session.start('common');
    session.confirm('new').subscribe().unsubscribe();
    expect(session.isCreating()).toBe(false);
    session.confirm('new').subscribe();
    pending.complete();
    expect(session.isCreating()).toBe(false);
    const unexpected = new Error('Unexpected adapter failure');
    const error = vi.fn();
    // Real Folder Writes converts API errors to refused outcomes before the session sees them.
    const failing = new FolderDraftSession({ create: () => throwError(() => unexpected), staleDraft: 'cancel' });
    failing.confirm('new').subscribe({ error });
    expect(error).toHaveBeenCalledWith(unexpected);
    expect(failing.isCreating()).toBe(false);
  });
});

it('reveals a non-root picker parent at start and again after creation', () => {
  const { session, expanded, create } = harness('picker');
  const late = new Subject<CreateFolderOutcome>();
  create.mockReturnValue(late);
  session.start('common');
  expect(expanded()).toEqual(new Set(['common']));
  session.confirm('new').subscribe();
  expanded.set(new Set());
  late.next(created);
  expect(expanded()).toEqual(new Set(['common']));
  expect(expanded().has('')).toBe(false);
});

it('keeps the picker root out of expanded paths at start and after creation', () => {
  const { session, expanded, create } = harness('picker');
  const late = new Subject<CreateFolderOutcome>();
  create.mockReturnValue(late);
  session.start('');
  expect(expanded().has('')).toBe(false);
  session.confirm('new').subscribe();
  late.next({ ...created, folder: { ...folder, fullPath: 'new' } });
  expect(expanded()).toEqual(new Set());
});

it('uses the adapter identity when a draft is replaced directly in storage', () => {
  const { session, stored, create } = harness('sidebar');
  const late = new Subject<CreateFolderOutcome>();
  create.mockReturnValue(late);
  session.start('common');
  session.confirm('new').subscribe();
  stored.set({ ...session.state(), folderDraftId: 42, addFolderParentPath: 'errors' });
  late.next(refusal);
  expect(session.state().folderCreateError).toBeNull();
  expect(session.state().addFolderParentPath).toBe('errors');
  session.start('other');
  expect(session.state().folderDraftId).toBe(43);
  session.cancel();
  expect(session.state().folderDraftId).toBe(44);
});

it('keeps sidebar and picker sessions independent', () => {
  const sidebar = harness('sidebar');
  const picker = harness('picker');
  sidebar.session.start(null);
  picker.session.start('');
  picker.create.mockReturnValue(of(refusal));
  picker.session.confirm('new').subscribe();
  expect(picker.session.state().folderCreateError).toEqual(inline);
  expect(sidebar.session.state().folderCreateError).toBeNull();
  expect(sidebar.session.state().isAddingFolder).toBe(true);
  expect(picker.session.state().isAddingFolder).toBe(true);
});
