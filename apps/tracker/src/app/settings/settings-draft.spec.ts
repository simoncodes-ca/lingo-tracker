import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../shared/api-error/api-error';
import {
  extractRuleErrors,
  isPreferredTermRuleErrorDto,
  SettingsDraft,
  type SettingsLists,
  type SettingsSaveOutcome,
} from './settings-draft';

const config: SettingsLists = {
  protectedTerms: ['iPhone'],
  preferredTerminology: [{ discouraged: 'E-mail', preferred: 'email' }],
};

describe('SettingsDraft', () => {
  it('blocks invalid terminology, reveals its first field and does not write', () => {
    const draft = new SettingsDraft();
    draft.seed(config);
    const rowId = draft.terminology.addRow();
    const write = vi.fn(() => of(config));
    let outcome: SettingsSaveOutcome | undefined;

    draft.save(write).subscribe((result) => {
      outcome = result;
    });

    expect(outcome).toEqual({ kind: 'blocked', focus: { rowId, field: 'discouraged' } });
    expect(draft.terminology.rowViews()[1]?.errors.discouraged?.code).toBe('empty');
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps edits and maps a refused rule index to the submitted row', () => {
    const draft = new SettingsDraft();
    draft.seed(config);
    const row = draft.terminology.rows()[0];
    expect(row).toBeDefined();
    draft.terms.addValue('C++');
    draft.terminology.updateField(row?.id ?? -1, 'reason', 'House style');
    const error = { index: 0, field: 'preferred', code: 'self-mapping', message: 'server says no' };
    const write = vi.fn(() =>
      throwError(
        () =>
          new ApiError({
            kind: 'invalid',
            status: 400,
            serverMessage: 'Invalid rules',
            details: [error],
          }),
      ),
    );
    let outcome: SettingsSaveOutcome | undefined;

    draft.save(write).subscribe((result) => {
      outcome = result;
    });

    expect(write).toHaveBeenCalledWith({
      protectedTerms: ['C++', 'iPhone'],
      preferredTerminology: [{ discouraged: 'E-mail', preferred: 'email', reason: 'House style' }],
    });
    expect(outcome).toEqual({ kind: 'refused', error: expect.any(ApiError) });
    expect(draft.terms.hasChanges()).toBe(true);
    expect(draft.terminology.hasChanges()).toBe(true);
    expect(draft.terminology.rowViews()[0]?.errors.preferred?.code).toBe('self-mapping');
  });

  it('reseeds from sent lists when an accepted write cannot reload config', () => {
    const draft = new SettingsDraft();
    draft.seed(config);
    draft.terms.addValue('C++');
    const write = vi.fn(() => of(null));
    let outcome: SettingsSaveOutcome | undefined;

    draft.save(write).subscribe((result) => {
      outcome = result;
    });

    expect(write).toHaveBeenCalledWith({ protectedTerms: ['C++', 'iPhone'] });
    expect(outcome).toEqual({ kind: 'saved' });
    expect(draft.terms.termsToSave()).toEqual(['C++', 'iPhone']);
    expect(draft.terminology.rulesToSave()).toEqual([{ discouraged: 'E-mail', preferred: 'email' }]);
    expect(draft.hasChanges()).toBe(false);
  });

  it('does nothing when unchanged', () => {
    const draft = new SettingsDraft();
    draft.seed(config);
    const write = vi.fn(() => of(config));
    let outcome: SettingsSaveOutcome | undefined;

    draft.save(write).subscribe((result) => {
      outcome = result;
    });

    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(write).not.toHaveBeenCalled();
  });

  it('reverts both drafts and clears the terms filter', () => {
    const draft = new SettingsDraft();
    draft.seed(config);
    draft.terms.addValue('C++');
    draft.terms.filter.set('i');
    draft.terminology.addRow();

    draft.revert(config);

    expect(draft.terms.termsToSave()).toEqual(['iPhone']);
    expect(draft.terms.filter()).toBe('');
    expect(draft.terminology.rulesToSave()).toEqual([{ discouraged: 'E-mail', preferred: 'email' }]);
    expect(draft.hasChanges()).toBe(false);
  });

  it('clears the terms filter when reverting without a config', () => {
    const draft = new SettingsDraft();
    draft.seed(config);
    draft.terms.filter.set('i');

    draft.revert(null);

    expect(draft.terms.filter()).toBe('');
    expect(draft.terms.termsToSave()).toEqual(['iPhone']);
  });

  it('blocks a rule error without a focusable field', () => {
    const draft = new SettingsDraft();
    draft.seed(config);
    const row = draft.terminology.rows()[0];
    expect(row).toBeDefined();
    draft.terminology.updateField(row?.id ?? -1, 'reason', 'House style');
    const refused = new ApiError({
      kind: 'invalid',
      status: 400,
      details: [{ index: 0, field: 'unrendered', code: 'invalid-type', message: 'server says no' }],
    });
    draft.save(() => throwError(() => refused)).subscribe();
    const write = vi.fn(() => of(config));
    let outcome: SettingsSaveOutcome | undefined;

    draft.save(write).subscribe((result) => {
      outcome = result;
    });

    expect(draft.terminology.hasErrors()).toBe(true);
    expect(draft.terminology.hasVisibleErrors()).toBe(false);
    expect(outcome).toEqual({ kind: 'blocked' });
    expect(write).not.toHaveBeenCalled();
  });
});

describe('settings save helpers', () => {
  it('includes only changed lists and records submitted rule indexes', () => {
    const draft = new SettingsDraft();
    draft.seed({ protectedTerms: ['iPhone'], preferredTerminology: [{ discouraged: 'E-mail', preferred: 'email' }] });
    let payload: object = {};
    draft.terms.addValue('C++');
    draft
      .save((sent) => {
        payload = sent;
        return throwError(() => new Error('offline'));
      })
      .subscribe();
    expect(payload).toEqual({ protectedTerms: ['C++', 'iPhone'] });
    const row = draft.terminology.rows()[0];
    expect(row).toBeDefined();
    if (!row) return;
    draft.terminology.updateField(row.id, 'preferred', 'Email');
    draft
      .save((sent) => {
        payload = sent;
        return throwError(
          () =>
            new ApiError({
              kind: 'invalid',
              status: 400,
              details: [{ index: 0, field: 'preferred', code: 'self-mapping', message: 'invalid' }],
            }),
        );
      })
      .subscribe();
    expect(payload).toEqual({
      protectedTerms: ['C++', 'iPhone'],
      preferredTerminology: [{ discouraged: 'E-mail', preferred: 'Email' }],
    });
    expect(draft.terminology.rowViews()[0]?.errors.preferred?.code).toBe('self-mapping');
  });

  it('accepts only shaped rule errors from invalid API details', () => {
    const valid = { index: 0, field: 'preferred', code: 'self-mapping', message: 'invalid' };
    expect(isPreferredTermRuleErrorDto(valid)).toBe(true);
    expect(isPreferredTermRuleErrorDto({ index: 0, field: 'preferred' })).toBe(false);
    expect(
      extractRuleErrors(
        new ApiError({ kind: 'invalid', status: 400, details: [valid, 'bad', { ...valid, index: '0' }] }),
      ),
    ).toEqual([valid]);
  });

  it('ignores details of other refusals and non-API errors', () => {
    const details = [{ index: 0, field: 'preferred', code: 'empty', message: 'invalid' }];
    expect(extractRuleErrors(new ApiError({ kind: 'conflict', status: 409, details }))).toEqual([]);
    expect(extractRuleErrors(new Error('offline'))).toEqual([]);
  });
});
