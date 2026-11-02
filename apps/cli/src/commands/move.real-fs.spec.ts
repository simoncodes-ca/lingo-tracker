import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { moveResourceCommand } from './move';

describe('moveResourceCommand (real core)', () => {
  let project: CommandProject;

  beforeEach(() => {
    project = createCommandProject();
  });
  afterEach(() => project.cleanup());

  it('prints the typed missing destination and exits 1', async () => {
    const result = await project.run(moveResourceCommand, {
      collection: 'main',
      source: 'a.ok',
      dest: 'b.ok',
      destCollection: 'missing',
    });
    expect(result).toMatchObject({ exitCode: 1 });
    expect(result.stderr).toContain('Destination collection "missing" not found');
  });

  it('prints a bulleted Warnings list and still exits 0 when the destination already exists', async () => {
    await project.seed('a.ok');
    await project.seed('b.ok');
    const result = await project.run(moveResourceCommand, { collection: 'main', source: 'a.ok', dest: 'b.ok' });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(
      '⚠️  Warnings (1):\n  - Destination key already exists: b.ok. Use override option to force move.',
    );
  });

  it('prints the identical malformed-pattern message through the typed-error path and exits 1', async () => {
    await project.seed('a.ok');
    const result = await project.run(moveResourceCommand, { collection: 'main', source: 'invalid@char*', dest: 'b' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      '❌ Key validation: Invalid key segment "invalid@char". Segments must match pattern [A-Za-z0-9_-]+',
    );
    expect(result.stderr).not.toContain('Errors:');
    expect(project.exists('translations/main/a/resource_entries.json')).toBe(true);
  });
});
