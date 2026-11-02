import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BuildGlossaryResult } from '@simoncodes-ca/core';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { editResourceCommand } from './edit-resource';
import { glossaryCommand } from './glossary';

type Glossary = Omit<BuildGlossaryResult, 'warnings'>;

const helloTerm = {
  key: 'terms.hello',
  collection: 'main',
  base: 'Hello',
  matchedTerm: 'hello',
  score: 1,
  translations: { fr: 'Bonjour' },
  status: { fr: 'translated' },
};

describe('glossaryCommand (real project)', () => {
  let project: CommandProject;
  const glossaryFiles = () => readdirSync(project.cwd).filter((name) => name.startsWith('lingo-tracker-glossary-'));
  const payload = (stdout: string): Glossary => JSON.parse(stdout);
  const expectedHello = () => ({
    baseLocale: 'en',
    locales: ['fr', 'es'],
    source: { chars: 5, candidates: 1 },
    matchCount: 1,
    terms: [helloTerm],
  });
  beforeEach(async () => {
    project = createCommandProject();
    await project.seed('terms.hello', 'Hello');
    await project.seed('terms.goodbye', 'Goodbye');
    const result = await project.run(editResourceCommand, { key: 'terms.hello', locale: 'fr', localeValue: 'Bonjour' });
    expect(result.exitCode).toBe(0);
    expect(project.json('translations/main/terms/tracker_meta.json')).toMatchObject({
      hello: { fr: { status: 'translated' } },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    project.cleanup();
  });

  it('fails when configuration is missing', async () => {
    project.remove('.lingo-tracker.json');
    const result = await project.run(glossaryCommand, { text: 'Hello' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Configuration file .lingo-tracker.json not found');
    expect(glossaryFiles()).toEqual([]);
  });
  it('fails when no input is provided', async () => {
    let readCalls = 0;
    const result = await project.run(
      glossaryCommand,
      {},
      {
        stdin: {
          isTTY: true,
          read: () => {
            readCalls++;
            throw new Error('Unexpected stdin read');
          },
        },
      },
    );
    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ No input provided. Use --text "...", --input <file>, or pipe text via stdin.\n',
    });
    expect(readCalls).toBe(0);
    expect(glossaryFiles()).toEqual([]);
  });
  it('derives glossary terms from piped stdin when no text or input file is supplied', async () => {
    let readCalls = 0;
    const result = await project.run(
      glossaryCommand,
      { stdout: true },
      {
        stdin: {
          isTTY: false,
          read: () => {
            readCalls++;
            return 'Hello';
          },
        },
      },
    );
    expect(readCalls).toBe(1);
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout)).toEqual(expectedHello());
    expect(result.stderr).toBe('✅ 1 term(s) matched from 1 candidate(s).\n');
    expect(glossaryFiles()).toEqual([]);
  });
  it('writes the complete term payload to a timestamped file by default', async () => {
    const result = await project.run(glossaryCommand, { text: 'Hello' });
    const files = glossaryFiles();
    expect(result.exitCode).toBe(0);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^lingo-tracker-glossary-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/);
    expect(project.json(files[0] ?? '')).toEqual(expectedHello());
    expect(project.json(files[0] ?? '')).not.toHaveProperty('readProblems');
    expect(result.stdout).toContain('1 term(s) matched from 1 candidate(s).');
    expect(result.stdout).toContain(join(project.cwd, files[0] ?? ''));
    expect(result.stderr).toBe('');
  });
  it('uses millisecond precision to keep two same-second runs in distinct files', async () => {
    vi.spyOn(Date.prototype, 'toISOString')
      .mockReturnValueOnce('2026-10-04T12:30:00.001Z')
      .mockReturnValueOnce('2026-10-04T12:30:00.002Z');
    const first = await project.run(glossaryCommand, { text: 'Hello' });
    const second = await project.run(glossaryCommand, { text: 'Goodbye', includeAll: true });
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(glossaryFiles()).toEqual([
      'lingo-tracker-glossary-2026-10-04T12-30-00-001Z.json',
      'lingo-tracker-glossary-2026-10-04T12-30-00-002Z.json',
    ]);
    expect(project.json(glossaryFiles()[0] ?? '')).toEqual(expectedHello());
    expect(project.json(glossaryFiles()[1] ?? '')).toMatchObject({
      terms: [{ key: 'terms.goodbye', base: 'Goodbye' }],
    });
  });
  it('reads from input file', async () => {
    project.write('input.txt', 'Hello');
    const result = await project.run(glossaryCommand, { input: 'input.txt', stdout: true });
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout)).toEqual(expectedHello());
    expect(glossaryFiles()).toEqual([]);
  });
  it('fails when input file does not exist', async () => {
    const result = await project.run(glossaryCommand, { input: 'missing.txt' });
    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: `❌ Input file not found: ${join(project.cwd, 'missing.txt')}\n`,
    });
    expect(glossaryFiles()).toEqual([]);
  });
  it('prints the complete JSON term to stdout without writing a file', async () => {
    const result = await project.run(glossaryCommand, { text: 'Hello', stdout: true });
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout)).toEqual(expectedHello());
    expect(payload(result.stdout)).not.toHaveProperty('readProblems');
    expect(payload(result.stdout)).not.toHaveProperty('warnings');
    expect(glossaryFiles()).toEqual([]);
  });
  it('keeps stdout to JSON while warnings and status go to stderr', async () => {
    project.write('translations/main/broken/resource_entries.json', '{');
    const result = await project.run(glossaryCommand, { text: 'Hello', stdout: true });
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout)).toEqual(expectedHello());
    expect(result.stderr).toMatch(
      /^⚠️ {2}Collection 'main': Skipped unreadable folder 'broken': .+\n✅ 1 term\(s\) matched from 1 candidate\(s\).\n$/,
    );
    expect(glossaryFiles()).toEqual([]);
  });
  it('accepts explicit locales', async () => {
    const result = await project.run(glossaryCommand, { text: 'Hello', stdout: true, locales: ['fr', 'es'] });
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout)).toEqual(expectedHello());
  });
  it('warns when only the base locale is requested', async () => {
    const result = await project.run(glossaryCommand, { text: 'Hello', stdout: true, locales: ['en'] });
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout)).toMatchObject({ locales: [], matchCount: 0, terms: [] });
    expect(result.stderr).toBe(
      '⚠️  No target locales to include (only the base locale is configured or requested).\n✅ 0 term(s) matched from 1 candidate(s).\n',
    );
  });
  it('reads only the selected collection when two collections have matching terms', async () => {
    project.configure({
      ...project.config,
      collections: { ...project.config.collections, other: { translationsFolder: 'translations/other' } },
    });
    await project.seed('terms.save', 'Save', 'other');
    const updated = await project.run(editResourceCommand, {
      collection: 'other',
      key: 'terms.save',
      locale: 'fr',
      localeValue: 'Enregistrer',
    });
    expect(updated.exitCode).toBe(0);
    const all = await project.run(glossaryCommand, { text: 'Hello Save', stdout: true });
    expect(payload(all.stdout).terms.map((term) => term.collection)).toEqual(expect.arrayContaining(['main', 'other']));
    const result = await project.run(glossaryCommand, { text: 'Hello Save', stdout: true, collection: 'main' });
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout).terms).toEqual([helloTerm]);
  });
  it('fails when collection cannot be resolved', async () => {
    const result = await project.run(glossaryCommand, { text: 'Hello', collection: 'missing' });
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: '❌ Collection "missing" not found\n' });
    expect(glossaryFiles()).toEqual([]);
  });
  it('uses runner no-collections error for empty config', async () => {
    project.configure({ ...project.config, collections: {} });
    const result = await project.run(glossaryCommand, { text: 'Hello' });
    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ No collections found. Run `lingo-tracker add-collection` first.\n',
    });
    expect(glossaryFiles()).toEqual([]);
  });
  it('writes an empty glossary and reports no matching translations', async () => {
    const result = await project.run(glossaryCommand, { text: 'unrelated' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No matching translations found.');
    expect(project.json(glossaryFiles()[0] ?? '')).toMatchObject({ matchCount: 0, terms: [] });
    expect(project.json(glossaryFiles()[0] ?? '')).not.toHaveProperty('readProblems');
    expect(project.json(glossaryFiles()[0] ?? '')).not.toHaveProperty('warnings');
  });
  it('includes new translations only when include-all is enabled', async () => {
    const defaults = await project.run(glossaryCommand, { text: 'Goodbye', stdout: true });
    expect(payload(defaults.stdout)).toMatchObject({ matchCount: 0, terms: [] });
    const result = await project.run(glossaryCommand, { text: 'Goodbye', stdout: true, includeAll: true });
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout)).toMatchObject({
      matchCount: 1,
      terms: [
        {
          key: 'terms.goodbye',
          base: 'Goodbye',
          translations: { fr: 'Goodbye', es: 'Goodbye' },
          status: { fr: 'new', es: 'new' },
        },
      ],
    });
  });
  it('reports unreadable collection and folder names while keeping problems out of the saved file', async () => {
    project.write('translations/main/broken/resource_entries.json', '{');
    const result = await project.run(glossaryCommand, { text: 'Hello' });
    expect(result.exitCode).toBe(0);
    expect(project.json(glossaryFiles()[0] ?? '')).toEqual(expectedHello());
    expect(project.json(glossaryFiles()[0] ?? '')).not.toHaveProperty('readProblems');
    expect(project.json(glossaryFiles()[0] ?? '')).not.toHaveProperty('warnings');
    expect(result.stderr).toContain("Collection 'main': Skipped unreadable folder 'broken':");
    expect(result.stderr).toContain('resource_entries.json');
    expect(result.stdout).toContain('1 term(s) matched from 1 candidate(s).');
  });
  it('uses collection base and locale overrides in the glossary payload', async () => {
    project.configure({
      ...project.config,
      collections: { main: { translationsFolder: 'translations/main', baseLocale: 'fr', locales: ['fr', 'es'] } },
    });
    await project.seed('terms.save', 'Enregistrer');
    const updated = await project.run(editResourceCommand, { key: 'terms.save', locale: 'es', localeValue: 'Guardar' });
    expect(updated.exitCode).toBe(0);
    const result = await project.run(glossaryCommand, { text: 'Enregistrer', stdout: true });
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout)).toMatchObject({
      baseLocale: 'fr',
      locales: ['es'],
      matchCount: 1,
      terms: [
        {
          key: 'terms.save',
          base: 'Enregistrer',
          translations: { es: 'Guardar' },
          status: { es: 'translated' },
        },
      ],
    });
    expect(payload(result.stdout)).not.toHaveProperty('readProblems');
    expect(payload(result.stdout)).not.toHaveProperty('warnings');
  });
  it('reports the unimplemented ai extractor with the ngram hint and writes no file', async () => {
    const result = await project.run(glossaryCommand, { text: 'Hello', extractor: 'ai' });
    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ The "ai" extractor is not yet implemented. Use --extractor ngram (the default).\n',
    });
    expect(glossaryFiles()).toEqual([]);
  });
});
