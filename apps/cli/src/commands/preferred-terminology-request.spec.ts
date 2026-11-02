import { InvalidProjectTermsEditError, updateProjectTerms } from '@simoncodes-ca/core';
import { describe, expect, it } from 'vitest';
import { createCommandProject } from '../testing/command-project';
import { preferredTerminologyRequestFromFlags } from './preferred-terminology-request';

describe('preferredTerminologyRequestFromFlags', () => {
  it('carries each command problem as typed facts', () => {
    for (const problem of ['protected-file-path', 'preferred-incomplete-flags'] as const) {
      const error = new InvalidProjectTermsEditError('Edit refused', problem);
      expect(error.facts.problem).toBe(problem);
      expect(error.facts.problem).toBe(error.problem);
    }
  });
  it('builds rule and list requests without CLI wording', () => {
    expect(
      preferredTerminologyRequestFromFlags({ list: true, add: 'Old', preferred: 'New', reason: 'Use this' }),
    ).toEqual({ list: true, upsert: { discouraged: 'Old', preferred: 'New', reason: 'Use this' } });
    expect(preferredTerminologyRequestFromFlags({ remove: 'Old' })).toEqual({
      list: false,
      remove: 'Old',
    });
  });

  it('reports typed incomplete groups in the existing refusal order', () => {
    const inputs = [
      [{ add: 'Old', remove: 'Other' }, 'preferred-conflict'],
      [{ preferred: 'New', list: true }, 'preferred-orphan-flags'],
      [{ add: 'Old' }, 'preferred-incomplete-flags'],
    ] as const;
    const project = createCommandProject();
    try {
      for (const [flags, problem] of inputs) {
        const outcome = updateProjectTerms(
          { projectRoot: project.cwd, sourceConfig: project.config },
          { preferredTerminology: preferredTerminologyRequestFromFlags(flags) },
        );
        expect(outcome.status).toBe('refused');
        if (outcome.status !== 'refused') throw new Error('Expected refusal');
        expect(outcome.error).toBeInstanceOf(InvalidProjectTermsEditError);
        expect((outcome.error as InvalidProjectTermsEditError).problem).toBe(problem);
      }
      // With neither an action nor list, structured validation still owns the missing-edit refusal.
      expect(preferredTerminologyRequestFromFlags({ preferred: 'New' })).toEqual({
        list: false,
        rule: { discouraged: undefined, preferred: 'New', reason: undefined },
      });
    } finally {
      project.cleanup();
    }
  });
});
