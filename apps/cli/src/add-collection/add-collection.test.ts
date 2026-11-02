import { CONFIG_FILENAME, loadConfig, openCollection } from '@simoncodes-ca/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandCancelledError } from '../runner/command-runner';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { addCollectionCommand } from './add-collection';

describe('addCollectionCommand', () => {
  let project: CommandProject;
  beforeEach(() => {
    project = createCommandProject({
      baseLocale: 'fr',
      locales: ['fr', 'de'],
      exportFolder: 'custom/export',
      importFolder: 'custom/import',
      collections: { existing: { translationsFolder: 'src/i18n' } },
    });
  });
  afterEach(() => project.cleanup());
  const stored = () => loadConfig({ cwd: project.cwd });

  it('adds the collection with the given flags and inherits the rest', async () => {
    const result = await project.run(addCollectionCommand, {
      collectionName: 'admin',
      translationsFolder: 'src/admin',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('✅ Collection "admin" added successfully in .lingo-tracker.json\n');
    expect(stored().collections?.admin).toEqual({ translationsFolder: 'src/admin' });
    expect(openCollection(stored(), 'admin', { cwd: project.cwd })).toMatchObject({
      baseLocale: 'fr',
      locales: ['fr', 'de'],
    });
  });

  it('leaves the read-only default to core when non-interactive and no flag is given', async () => {
    await project.run(addCollectionCommand, { collectionName: 'vendor', translationsFolder: 'node_modules/lib/i18n' });
    expect(stored().collections?.vendor?.readOnly).toBe(true);
  });

  it('lets --no-read-only override the node_modules detection', async () => {
    await project.run(addCollectionCommand, {
      collectionName: 'vendor',
      translationsFolder: 'node_modules/lib/i18n',
      readOnly: false,
    });
    expect(stored().collections?.vendor?.readOnly).toBeUndefined();
  });

  it('exits 1 naming the missing flags in non-interactive mode', async () => {
    const result = await project.run(addCollectionCommand, { collectionName: 'admin' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--translations-folder');
    expect(stored().collections?.admin).toBeUndefined();
  });

  it('exits 1 with the core message when the collection already exists', async () => {
    const result = await project.run(addCollectionCommand, { collectionName: 'existing', translationsFolder: 'src/x' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Collection "existing" already exists');
  });

  it('exits 1 with the core message when core refuses', async () => {
    const before = project.read(CONFIG_FILENAME);
    const result = await project.run(addCollectionCommand, { collectionName: 'admin', translationsFolder: '  ' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('translationsFolder is required');
    expect(project.read(CONFIG_FILENAME)).toBe(before);
  });

  it('asks for missing values, then the read-only question', async () => {
    let calls = 0;
    const result = await project.run(
      addCollectionCommand,
      {},
      {
        interactive: true,
        ask: async (questions) => {
          calls++;
          if (Array.isArray(questions))
            return { collectionName: 'admin', translationsFolder: 'src/admin', locales: ['fr', 'es'] };
          expect(questions.name).toBe('readOnly');
          return { readOnly: true };
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(calls).toBe(2);
    expect(stored().collections?.admin).toEqual({
      translationsFolder: 'src/admin',
      locales: ['fr', 'es'],
      readOnly: true,
    });
  });

  it('cancelling prints one cancel line and exits 0', async () => {
    const result = await project.run(
      addCollectionCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          throw new CommandCancelledError();
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('❌ Add collection cancelled.\n');
    expect(stored().collections?.admin).toBeUndefined();
  });

  it('accepting effective prompt defaults stores no inherited overrides', async () => {
    const result = await project.run(
      addCollectionCommand,
      { collectionName: 'admin', translationsFolder: 'src/admin', readOnly: false },
      {
        interactive: true,
        ask: async (questions) => {
          if (!Array.isArray(questions)) throw new Error('Unexpected confirmation');
          const defaults = Object.fromEntries(questions.map((question) => [question.name, question.initial]));
          expect(defaults).toEqual({
            exportFolder: 'custom/export',
            importFolder: 'custom/import',
            baseLocale: 'fr',
            locales: 'fr,de',
          });
          return { ...defaults, locales: ['fr', 'de'] };
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(stored().collections?.admin).toEqual({ translationsFolder: 'src/admin' });
    expect(openCollection(stored(), 'admin', { cwd: project.cwd }).baseLocale).toBe('fr');
  });

  it('accepting defaults with no global locales leaves collection locales unset', async () => {
    project.configure({ ...project.config, locales: [] });
    const result = await project.run(
      addCollectionCommand,
      { collectionName: 'admin', translationsFolder: 'src/admin', readOnly: false },
      {
        interactive: true,
        ask: async (questions) => {
          if (!Array.isArray(questions)) throw new Error('Unexpected confirmation');
          const localePrompt = questions.find((question) => question.name === 'locales');
          expect(localePrompt).toBeDefined();
          expect(localePrompt?.initial).toBe('');
          const defaults = Object.fromEntries(questions.map((question) => [question.name, question.initial]));
          return { ...defaults, locales: [] };
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(stored().collections?.admin).toEqual({ translationsFolder: 'src/admin' });
    expect(openCollection(stored(), 'admin', { cwd: project.cwd }).locales).toEqual([]);
  });
});
