import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { normalizeCommand } from './normalize';

describe('normalizeCommand (real core)', () => {
  let project: CommandProject;

  beforeEach(() => {
    project = createCommandProject({
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: {
        main: { translationsFolder: 'translations/main' },
        vendor: { translationsFolder: 'translations/vendor', readOnly: true },
      },
    });
  });
  afterEach(() => project.cleanup());

  it('prints a bulleted Warnings list for a skipped read-only collection and still exits 0', async () => {
    const result = await project.run(normalizeCommand, { all: true, yes: true });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('⚠️  Warnings (1):\n  - Skipping read-only collection: vendor');
    expect(result.stderr).not.toContain('Errors');
  });
});
