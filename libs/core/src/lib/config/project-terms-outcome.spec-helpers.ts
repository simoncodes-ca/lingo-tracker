import { expect } from 'vitest';
import type { ProjectTermsUpdateOutcome } from './update-project-terms';

export function failure(outcome: ProjectTermsUpdateOutcome, expectedStatus: 'refused' | 'failed') {
  expect(outcome.status).toBe(expectedStatus);
  if (outcome.status !== 'refused' && outcome.status !== 'failed') throw new Error('Expected an unsuccessful update');
  return outcome;
}

export function written(outcome: ProjectTermsUpdateOutcome) {
  if (outcome.status === 'changed') return outcome.written;
  expect(outcome).not.toHaveProperty('written');
  return undefined;
}

export function view(outcome: ProjectTermsUpdateOutcome) {
  if (outcome.status === 'refused' || outcome.view === undefined) throw new Error('Expected an update view');
  return outcome.view;
}
