import { describe, expect, it } from 'vitest';
import { ProtectedTermsDraft } from './protected-terms-draft';

const seeded = () => {
  const draft = new ProtectedTermsDraft();
  draft.seed(['iPhone', 'Node.js']);
  return draft;
};

const entryFor = (draft: ProtectedTermsDraft, value: string) => {
  const entry = draft.entries().find((candidate) => candidate.value === value);
  expect(entry).toBeDefined();
  return entry;
};

describe('ProtectedTermsDraft', () => {
  it('normalizes whitespace and exact duplicates while preserving distinct casing', () => {
    const draft = new ProtectedTermsDraft();
    draft.seed(['  iPhone ', 'iPhone', 'iphone', ' ']);
    expect(draft.activeValues()).toEqual(['iPhone', 'iphone']);
    draft.addValue('  Node.js ');
    expect(draft.activeValues()).toEqual(['iPhone', 'iphone', 'Node.js']);
  });

  it('lists terms alphabetically regardless of the order the file stored them in', () => {
    const draft = new ProtectedTermsDraft();
    draft.seed(['zulu', 'Alpha', 'mike']);
    expect(draft.sortedEntries().map((entry) => entry.value)).toEqual(['Alpha', 'mike', 'zulu']);
  });

  it('adds a trimmed term and clears the draft', () => {
    const draft = seeded();
    draft.onAddDraftChange('  C++  ');
    draft.addTerm();
    expect(draft.activeValues()).toContain('C++');
    expect(draft.addDraft()).toBe('');
    expect(draft.changeCount()).toBe(1);
    expect(draft.statusOf(entryFor(draft, 'C++') ?? draft.entries()[0])).toBe('added');
  });

  it('refuses a duplicate and reports which term collided', () => {
    const draft = seeded();
    draft.onAddDraftChange('iPhone');
    draft.addTerm();
    expect(draft.addError()).toBe('iPhone');
    expect(draft.activeValues()).toEqual(['iPhone', 'Node.js']);
  });

  it('clears the duplicate error as soon as the draft changes', () => {
    const draft = seeded();
    draft.addValue('iPhone');
    draft.onAddDraftChange('iPhon');
    expect(draft.addError()).toBeNull();
  });

  it('re-adding a term that is marked for removal takes the removal back', () => {
    const draft = seeded();
    const entry = entryFor(draft, 'iPhone');
    if (!entry) return;
    draft.removeTerm(entry);
    draft.addValue('iPhone');
    expect(entryFor(draft, 'iPhone')?.removed).toBe(false);
    expect(draft.changeCount()).toBe(0);
  });

  it('keeps a saved term visible and marked until the change is saved', () => {
    const draft = seeded();
    const entry = entryFor(draft, 'iPhone');
    if (!entry) return;
    draft.removeTerm(entry);
    expect(draft.entries()).toHaveLength(2);
    expect(draft.statusOf(entryFor(draft, 'iPhone') ?? entry)).toBe('removed');
    expect(draft.termsToSave()).toEqual(['Node.js']);
    expect(draft.changeCount()).toBe(1);
  });

  it('restores a term marked for removal', () => {
    const draft = seeded();
    const entry = entryFor(draft, 'iPhone');
    if (!entry) return;
    draft.removeTerm(entry);
    draft.restoreTerm(entry);
    expect(draft.termsToSave()).toEqual(['iPhone', 'Node.js']);
    expect(draft.hasChanges()).toBe(false);
  });

  it('drops a term added in this session outright rather than marking it', () => {
    const draft = seeded();
    draft.addValue('C++');
    const entry = entryFor(draft, 'C++');
    if (!entry) return;
    draft.removeTerm(entry);
    expect(draft.activeValues()).toEqual(['iPhone', 'Node.js']);
    expect(draft.hasChanges()).toBe(false);
  });

  it('commits an edit and remembers the previous spelling', () => {
    const draft = seeded();
    const entry = entryFor(draft, 'iPhone');
    if (!entry) return;
    draft.beginEdit(entry);
    draft.onEditDraftChange('iPad');
    draft.commitEdit();
    expect(draft.editingId()).toBeNull();
    expect(draft.termsToSave()).toEqual(['iPad', 'Node.js']);
    expect(entryFor(draft, 'iPad')?.original).toBe('iPhone');
    expect(draft.statusOf(entryFor(draft, 'iPad') ?? entry)).toBe('edited');
  });

  it('refuses an edit that collides with another term', () => {
    const draft = seeded();
    const entry = entryFor(draft, 'iPhone');
    if (!entry) return;
    draft.beginEdit(entry);
    draft.onEditDraftChange('Node.js');
    draft.commitEdit();
    expect(draft.editError()).toBe('Node.js');
    expect(draft.editingId()).toBe(entry.id);
  });

  it('allows a rename to a term marked for removal and deduplicates the save list', () => {
    const draft = seeded();
    const first = entryFor(draft, 'iPhone');
    const second = entryFor(draft, 'Node.js');
    if (!first || !second) return;
    draft.removeTerm(second);
    draft.beginEdit(first);
    draft.onEditDraftChange('Node.js');
    draft.commitEdit();
    expect(draft.editError()).toBeNull();
    expect(draft.termsToSave()).toEqual(['Node.js']);
    expect(draft.changeCount()).toBe(2);
  });

  it('treats an emptied edit as a cancel', () => {
    const draft = seeded();
    const entry = entryFor(draft, 'iPhone');
    if (!entry) return;
    draft.beginEdit(entry);
    draft.onEditDraftChange('   ');
    draft.commitEdit();
    expect(draft.editingId()).toBeNull();
    expect(draft.termsToSave()).toEqual(['iPhone', 'Node.js']);
  });

  it('cancel leaves the term untouched', () => {
    const draft = seeded();
    const entry = entryFor(draft, 'iPhone');
    if (!entry) return;
    draft.beginEdit(entry);
    draft.onEditDraftChange('iPad');
    draft.cancelEdit();
    expect(draft.hasChanges()).toBe(false);
  });

  it('drops a filter that would hide a term the user just added', () => {
    const draft = seeded();
    draft.filter.set('iphone');
    draft.addValue('Zod');
    expect(draft.filter()).toBe('');
    expect(draft.revealId()).toBe(entryFor(draft, 'Zod')?.id);
  });

  it('keeps a filter the newly added term still matches', () => {
    const draft = seeded();
    draft.filter.set('zo');
    draft.addValue('Zod');
    expect(draft.filter()).toBe('zo');
    expect(draft.visibleEntries().map((entry) => entry.value)).toEqual(['Zod']);
  });

  it('drops a filter that would hide a term the user just renamed', () => {
    const draft = seeded();
    draft.filter.set('iph');
    const entry = entryFor(draft, 'iPhone');
    if (!entry) return;
    draft.beginEdit(entry);
    draft.onEditDraftChange('Zod');
    draft.commitEdit();
    expect(draft.filter()).toBe('');
  });

  it('matches case-insensitively and reports when nothing matches', () => {
    const draft = seeded();
    draft.filter.set('iphone');
    expect(draft.visibleEntries().map((entry) => entry.value)).toEqual(['iPhone']);
    draft.filter.set('nothing here');
    expect(draft.hasNoMatches()).toBe(true);
  });

  it('sends surviving terms in display order and resets on seed', () => {
    const draft = seeded();
    const entry = entryFor(draft, 'iPhone');
    if (!entry) return;
    draft.removeTerm(entry);
    draft.addValue('C++');
    expect(draft.termsToSave()).toEqual(['C++', 'Node.js']);
    draft.seed(['Node.js']);
    expect(draft.hasChanges()).toBe(false);
    expect(draft.termsToSave()).toEqual(['Node.js']);
  });
});
