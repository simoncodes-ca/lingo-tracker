import { describe, expect, it } from 'vitest';
import { PreferredTerminologyDraft } from './preferred-terminology-draft';

const seeded = () => {
  const draft = new PreferredTerminologyDraft();
  draft.seed([
    { discouraged: 'E-mail', preferred: 'email' },
    { discouraged: 'Expenditure', preferred: 'Investment' },
  ]);
  return draft;
};

describe('PreferredTerminologyDraft', () => {
  it('seeds normalized rows and counts edits and removals', () => {
    const draft = seeded();
    const first = draft.rows()[0];
    const second = draft.rows()[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    draft.updateField(first.id, 'preferred', 'Email');
    expect(draft.rowViews()[0]?.status).toBe('edited');
    draft.removeRow(second.id);
    expect(draft.changeCount()).toBe(2);
    expect(draft.rulesToSave()).toEqual([{ discouraged: 'E-mail', preferred: 'Email' }]);
  });

  it('keeps a new blank row hidden until touch or submit', () => {
    const draft = seeded();
    const id = draft.addRow();
    expect(draft.hasChanges()).toBe(true);
    expect(draft.hasErrors()).toBe(true);
    expect(draft.rowViews()[2]?.errors).toEqual({});
    draft.touch(id, 'discouraged');
    expect(draft.rowViews()[2]?.errors.discouraged?.code).toBe('empty');
    draft.revealErrors();
    expect(draft.rowViews()[2]?.errors.preferred?.code).toBe('empty');
  });

  it('reports duplicate, chain, and containing-discouraged findings with terms', () => {
    const draft = seeded();
    const id = draft.addRow();
    draft.updateField(id, 'discouraged', 'E-mail');
    draft.updateField(id, 'preferred', 'Expenditure');
    expect(draft.rowViews()[2]?.errors.discouraged).toEqual({ code: 'duplicate', params: { term: 'E-mail' } });
    expect(draft.rowViews()[2]?.errors.preferred).toEqual({
      code: 'chain',
      params: { term: 'Expenditure', preferred: 'Investment' },
    });
    draft.updateField(id, 'preferred', 'Use E-mail here');
    expect(draft.rowViews()[2]?.errors.preferred?.code).toBe('contains-discouraged');
  });

  it('maps server errors to submitted rows and clears a field after editing it', () => {
    const draft = seeded();
    const row = draft.rows()[1];
    expect(row).toBeDefined();
    if (!row) return;
    draft.beginSave();
    draft.applyServerErrors([{ index: 1, field: 'preferred', code: 'self-mapping', message: 'server says no' }]);
    expect(draft.rowViews()[1]?.errors.preferred?.code).toBe('self-mapping');
    draft.updateField(row.id, 'preferred', 'Capital');
    expect(draft.rowViews()[1]?.errors.preferred).toBeUndefined();
  });

  it('normalizes save values and resets errors and changes on reseed', () => {
    const draft = seeded();
    const id = draft.addRow();
    draft.updateField(id, 'discouraged', '  Cost ');
    draft.updateField(id, 'preferred', ' Price  ');
    expect(draft.rulesToSave()[2]).toEqual({ discouraged: 'Cost', preferred: 'Price' });
    draft.revealErrors();
    draft.seed(draft.rulesToSave());
    expect(draft.changeCount()).toBe(0);
    expect(draft.hasErrors()).toBe(false);
    expect(draft.rowViews()[2]?.status).toBe('unchanged');
  });
});
