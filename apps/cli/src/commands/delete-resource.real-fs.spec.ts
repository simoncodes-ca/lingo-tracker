import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { deleteResourceCommand } from './delete-resource';

describe('deleteResourceCommand (real core)', () => {
  let project: CommandProject;

  beforeEach(() => {
    project = createCommandProject();
  });
  afterEach(() => project.cleanup());

  it('exits 0 and prints no Errors list when every key is deleted', async () => {
    project.seed('a.ok');
    const result = await project.run(deleteResourceCommand, { collection: 'main', key: ['a.ok'], yes: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Deleted 1 resource(s)');
    expect(result.stderr).not.toContain('Errors');
  });

  it('exits 1 with a bulleted Errors list when some keys are missing', async () => {
    project.seed('a.ok');
    const result = await project.run(deleteResourceCommand, {
      collection: 'main',
      key: ['a.ok', 'a.missing'],
      yes: true,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Deleted 1 resource(s)');
    expect(result.stderr).toContain('❌ Errors (1):\n  - a.missing: Resource not found: a.missing');
  });

  it('warns that nothing was deleted and exits 1 when no key is deleted', async () => {
    const result = await project.run(deleteResourceCommand, { collection: 'main', key: ['x.missing'], yes: true });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No resources were deleted.');
    expect(result.stderr).toContain('❌ Errors (1):\n  - x.missing: Folder not found: x');
  });
  it('prints pruning warnings and exits 0 after successfully deleting entries', async () => {
    await project.seed('a.b.ok');
    project.write('translations/main/a/tracker_meta.json', '{ malformed');
    const result = await project.run(deleteResourceCommand, { collection: 'main', key: ['a.b.ok'], yes: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Deleted 1 resource(s)');
    expect(result.stderr).toContain('Warnings (1):');
    expect(result.stderr).toContain("Skipped unreadable folder 'a'");
    expect(result.stderr).not.toContain('Errors');
  });
});
