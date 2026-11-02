import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { InvalidProjectTermsEditError, PreferredTerminologyValidationError } from '../errors/lingo-tracker-error';
import { updateProjectTerms } from './update-project-terms';

let cwd: string;
const config: LingoTrackerConfig = {
  baseLocale: 'en',
  locales: ['en'],
  collections: {},
  exportFolder: 'export',
  importFolder: 'import',
};
const project = () => ({ projectRoot: cwd, sourceConfig: config });
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'terms-outcome-'));
  writeFileSync(join(cwd, '.lingo-tracker.json'), JSON.stringify(config));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('Project Terms outcome', () => {
  it('lists without claiming a write', () => {
    const result = updateProjectTerms(project(), { preferredTerminology: { list: true } }, {});
    expect(result.status).toBe('listed');
    expect(result).not.toHaveProperty('outcome');
    expect(result).not.toHaveProperty('written');
  });
  it('returns the written terms and previews before applying', () => {
    const result = updateProjectTerms(
      project(),
      { protectedTerms: { target: {}, change: { kind: 'edit', edit: { add: ['Brand'] } } } },
      { onPreview: (view) => expect(view.protectedTerms?.storedTerms).toEqual([]) },
    );
    expect(result.status).toBe('changed');
    if (result.status !== 'changed') throw new Error('Expected changed outcome');
    expect(result.written.protectedTermsResult?.terms).toEqual(['Brand']);
    expect(JSON.parse(readFileSync(result.written.protectedTermsResult?.filePath ?? '', 'utf8'))).toEqual(['Brand']);
  });
  it('returns a typed contradiction without previewing or throwing', () => {
    const result = updateProjectTerms(
      project(),
      { preferredTerminology: { rule: { discouraged: 'Old' }, remove: 'Other' } },
      {
        onPreview: () => {
          throw new Error('Unexpected preview');
        },
      },
    );
    expect(result.status).toBe('refused');
    if (result.status !== 'refused') throw new Error('Expected refused outcome');
    expect(result.error).toBeInstanceOf(InvalidProjectTermsEditError);
    expect((result.error as InvalidProjectTermsEditError).problem).toBe('preferred-conflict');
  });
  it('returns invalid replacement rows as typed problems', () => {
    const result = updateProjectTerms(
      project(),
      { preferredTerminology: { set: [{ discouraged: '', preferred: 'New' }] } },
      {},
    );
    expect(result.status).toBe('refused');
    if (result.status !== 'refused') throw new Error('Expected refused outcome');
    expect(result.error).toBeInstanceOf(PreferredTerminologyValidationError);
  });
  it('returns invalid incremental rows as an apply failure', () => {
    const result = updateProjectTerms(
      project(),
      { preferredTerminology: { rule: { discouraged: '', preferred: 'New' } } },
      {},
    );
    expect(result.status).toBe('failed');
  });
  it('returns broken list loads as one failure', () => {
    writeFileSync(join(cwd, '.lingo-tracker-preferred-terminology.json'), '{broken');
    const result = updateProjectTerms(project(), { preferredTerminology: { list: true } }, {});
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('Expected failed outcome');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.reverted).toBe(false);
  });
  it('carries confirmed restoration separately from the write error', () => {
    mkdirSync(join(cwd, 'directory'));
    const result = updateProjectTerms(
      project(),
      { protectedTerms: { target: {}, change: { kind: 'view' }, file: 'directory' } },
      {},
    );
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('Expected failed outcome');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.reverted).toBe(true);
    expect(JSON.parse(readFileSync(join(cwd, '.lingo-tracker.json'), 'utf8'))).toEqual(config);
  });
  it('refuses overlapping raw and complete rule routes instead of overwriting one', () => {
    const input: unknown = {
      preferredTerminology: {
        rule: { discouraged: 'Raw', preferred: 'Value' },
        upsert: { discouraged: 'Complete', preferred: 'Other' },
      },
    };
    const result = updateProjectTerms(project(), input as import('./update-project-terms').ProjectTermsUpdate);
    expect(result.status).toBe('refused');
    if (result.status !== 'refused') throw new Error('Expected refusal');
    expect(result.error).toBeInstanceOf(InvalidProjectTermsEditError);
    expect((result.error as InvalidProjectTermsEditError).problem).toBe('preferred-conflict');
  });

  it('returns a preview callback error as a reporting failure', () => {
    const original = new InvalidProjectTermsEditError('preview refused', 'protected-conflict');
    const result = updateProjectTerms(
      project(),
      { preferredTerminology: { list: true } },
      {
        onPreview: () => {
          throw original;
        },
      },
    );
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('Expected reporting failure');
    expect(result.error).toBe(original);
    expect(result.reverted).toBe(false);
    expect(result.view?.lists.preferredTerminology).toBe(true);
  });
});
