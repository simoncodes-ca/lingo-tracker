import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import { PreferredTerminologyValidationError } from '../errors/lingo-tracker-error';
import type { PreferredTerminologyEdit } from './preferred-terminology-file';
import { failure, written } from './project-terms-outcome.spec-helpers';
import { updateProjectTerms } from './update-project-terms';

const config = {};

function editPreferredTerminology(
  pointers: Pick<LingoTrackerConfig, 'preferredTerminologyFile'>,
  edit: PreferredTerminologyEdit,
  cwd: string,
) {
  return updateProjectTerms(
    {
      projectRoot: cwd,
      sourceConfig: {
        baseLocale: 'en',
        locales: ['en'],
        collections: {},
        exportFolder: 'export',
        importFolder: 'import',
        ...pointers,
      },
    },
    { preferredTerminology: edit },
  );
}

describe('editPreferredTerminology', () => {
  const tempDir = useTempDir('preferred-edit-');
  const filePath = () => join(tempDir(), '.lingo-tracker-preferred-terminology.json');
  const seed = (rules: unknown) => writeFileSync(filePath(), `${JSON.stringify(rules)}\n`);
  const stored = () => JSON.parse(readFileSync(filePath(), 'utf8'));

  it('adds a trimmed rule and writes the sorted file', () => {
    seed([{ discouraged: 'Zoo', preferred: 'Park' }]);
    const result = editPreferredTerminology(
      config,
      { upsert: { discouraged: ' Expenditure ', preferred: ' Investment ' } },
      tempDir(),
    );
    const ruleResult = written(result)?.preferredTerminologyResult;
    expect(ruleResult?.action).toBe('added');
    expect(ruleResult?.changedRule).toEqual({ discouraged: 'Expenditure', preferred: 'Investment' });
    expect(stored()).toEqual([
      { discouraged: 'Expenditure', preferred: 'Investment' },
      { discouraged: 'Zoo', preferred: 'Park' },
    ]);
  });

  it('upserts case insensitively and drops an old reason when omitted', () => {
    seed([{ discouraged: 'Email', preferred: 'Mail', reason: 'old' }]);
    const result = editPreferredTerminology(
      config,
      { upsert: { discouraged: 'email', preferred: 'electronic mail' } },
      tempDir(),
    );
    const ruleResult = written(result)?.preferredTerminologyResult;
    expect(ruleResult?.action).toBe('updated');
    expect(stored()).toEqual([{ discouraged: 'email', preferred: 'electronic mail' }]);
  });

  it('removes a rule case insensitively', () => {
    seed([{ discouraged: 'Email', preferred: 'Inbox' }]);
    const result = editPreferredTerminology(config, { remove: ' EMAIL ' }, tempDir());
    const ruleResult = written(result)?.preferredTerminologyResult;
    expect(ruleResult?.action).toBe('removed');
    expect(stored()).toEqual([]);
  });

  it('reports a missing rule with the file path and leaves the file unchanged', () => {
    seed([{ discouraged: 'Email', preferred: 'Inbox' }]);
    const before = readFileSync(filePath(), 'utf8');
    expect(failure(editPreferredTerminology(config, { remove: 'Missing' }, tempDir()), 'failed').error).toMatchObject({
      message: expect.stringContaining('No preferred terminology rule for "Missing"'),
    });
    expect(readFileSync(filePath(), 'utf8')).toBe(before);
  });

  it('returns row errors and leaves the file unchanged for an invalid upsert', () => {
    seed([{ discouraged: 'Email', preferred: 'Inbox' }]);
    const before = readFileSync(filePath(), 'utf8');
    const thrown = failure(
      editPreferredTerminology(config, { upsert: { discouraged: 'Expenditure', preferred: '' } }, tempDir()),
      'failed',
    ).error;
    expect(thrown).toBeInstanceOf(PreferredTerminologyValidationError);
    const validation = thrown as PreferredTerminologyValidationError;
    expect(validation.errors).toEqual([expect.objectContaining({ index: 1, field: 'preferred', code: 'empty' })]);
    expect(validation.submittedRules?.[1]?.discouraged).toBe('Expenditure');
    expect(readFileSync(filePath(), 'utf8')).toBe(before);
  });

  it('sets the list without reading a malformed old file', () => {
    writeFileSync(filePath(), '{broken');
    const result = editPreferredTerminology(
      config,
      { set: [{ discouraged: 'Expenditure', preferred: 'Investment' }] },
      tempDir(),
    );
    const ruleResult = written(result)?.preferredTerminologyResult;
    expect(ruleResult?.rules).toEqual([{ discouraged: 'Expenditure', preferred: 'Investment' }]);
    expect(ruleResult).not.toHaveProperty('error');
    expect(stored()).toEqual(ruleResult?.rules);
  });

  it('validates a replacement before creating a file', () => {
    expect(
      failure(
        editPreferredTerminology(config, { set: [{ discouraged: 'Email', preferred: 'email' }] }, tempDir()),
        'refused',
      ).error,
    ).toBeInstanceOf(PreferredTerminologyValidationError);
    expect(existsSync(filePath())).toBe(false);
  });

  it('rejects a non-array replacement before creating a file', () => {
    expect(
      failure(editPreferredTerminology(config, { set: { discouraged: 'Email' } } as never, tempDir()), 'refused').error,
    ).toMatchObject({
      message: expect.stringContaining('Preferred terminology replacement must be an array of rules'),
    });
    expect(existsSync(filePath())).toBe(false);
  });

  it('reports invalid replacement rows before a malformed file pointer', () => {
    expect(
      failure(
        editPreferredTerminology(
          { preferredTerminologyFile: 42 as never },
          { set: [{ discouraged: 'Email', preferred: 'email' }] },
          tempDir(),
        ),
        'refused',
      ).error,
    ).toBeInstanceOf(PreferredTerminologyValidationError);
  });
});
