import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return { ...actual, loadConfig: vi.fn(), buildGlossary: vi.fn() };
});
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false), hasPipedStdin: vi.fn(() => false) }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    default: { ...actual, existsSync: vi.fn(() => true), readFileSync: vi.fn(() => ''), writeFileSync: vi.fn() },
  };
});

import * as fs from 'fs';
import {
  buildGlossary,
  ConfigNotFoundError,
  GlossaryExtractorError,
  type LingoTrackerConfig,
  loadConfig,
} from '@simoncodes-ca/core';
import { hasPipedStdin } from '../runner/terminal';
import { glossaryCommand } from './glossary';

const CONFIG: LingoTrackerConfig = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: { app: { translationsFolder: 'i18n' } },
};
const RESULT = {
  baseLocale: 'en',
  locales: ['fr'],
  source: { chars: 4, candidates: 1 },
  matchCount: 1,
  terms: [
    {
      key: 'save',
      collection: 'app',
      base: 'Save',
      matchedTerm: 'save',
      score: 1,
      translations: { fr: 'Enregistrer' },
      status: { fr: 'verified' as const },
    },
  ],
  readProblems: [],
};
const writtenContent = (): string => (vi.mocked(fs.writeFileSync).mock.calls.at(-1)?.[1] as string) ?? '';

describe('glossaryCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.env.INIT_CWD = '/project';
    process.exitCode = undefined;
    vi.mocked(hasPipedStdin).mockReturnValue(false);
    vi.mocked(loadConfig).mockReturnValue(CONFIG);
    vi.mocked(buildGlossary).mockReturnValue(RESULT);
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('exits 1 when configuration is missing', async () => {
    vi.mocked(loadConfig).mockImplementation(() => {
      throw new ConfigNotFoundError('/project/.lingo-tracker.json');
    });
    await glossaryCommand({ text: 'Save' });
    expect(buildGlossary).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when no input is provided', async () => {
    await glossaryCommand({});
    expect(buildGlossary).not.toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalledWith(0, 'utf8');
    expect(process.exitCode).toBe(1);
  });

  it('passes --text to core and writes its JSON payload by default', async () => {
    await glossaryCommand({ text: 'Save' });
    expect(buildGlossary).toHaveBeenCalledWith([expect.objectContaining({ name: 'app' })], 'Save', {
      extractor: undefined,
      locales: undefined,
      includeAll: undefined,
    });
    const { readProblems: _readProblems, ...payload } = RESULT;
    expect(writtenContent()).toBe(JSON.stringify(payload, null, 2));
  });

  it('writes to a millisecond-precision timestamped file by default (no same-second collisions)', async () => {
    await glossaryCommand({ text: 'Save' });
    expect(vi.mocked(fs.writeFileSync).mock.calls[0][0]).toMatch(
      /lingo-tracker-glossary-\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/,
    );
  });

  it('reads from --input file', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('Save document');
    await glossaryCommand({ input: 'help.md' });
    expect(fs.existsSync).toHaveBeenCalledWith('/project/help.md');
    expect(buildGlossary).toHaveBeenCalledWith(expect.any(Array), 'Save document', expect.any(Object));
  });

  it('reads from piped stdin when no --text/--input and not a TTY', async () => {
    vi.mocked(hasPipedStdin).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('Please Save your work');
    await glossaryCommand({});
    expect(fs.readFileSync).toHaveBeenCalledWith(0, 'utf8');
    expect(buildGlossary).toHaveBeenCalledWith(expect.any(Array), 'Please Save your work', expect.any(Object));
  });

  it('exits 1 when --input file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await glossaryCommand({ input: 'missing.md' });
    expect(buildGlossary).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('prints JSON to stdout with --stdout and does not write a file', async () => {
    await glossaryCommand({ text: 'Save', stdout: true });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    const printed = vi.mocked(process.stdout.write).mock.calls[0][0] as string;
    expect(JSON.parse(printed)).toMatchObject({ matchCount: 1, terms: RESULT.terms });
    expect(JSON.parse(printed)).not.toHaveProperty('readProblems');
  });

  it('keeps stdout to the JSON payload with --stdout: warnings and the status line go to stderr', async () => {
    vi.mocked(buildGlossary).mockReturnValue({ ...RESULT, locales: [] });
    await glossaryCommand({ text: 'Save', stdout: true, locales: ['en'] });
    expect(console.error).toHaveBeenCalledWith(
      '⚠️  No target locales to include (only the base locale is configured or requested).',
    );
    expect(console.error).toHaveBeenCalledWith('✅ 1 term(s) matched from 1 candidate(s).');
    expect(console.log).not.toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledTimes(1);
  });

  it('maps --locales to a trimmed list for core', async () => {
    await glossaryCommand({ text: 'Save', locales: ['fr', 'es'] });
    expect(buildGlossary).toHaveBeenCalledWith(
      expect.any(Array),
      'Save',
      expect.objectContaining({ locales: ['fr', 'es'] }),
    );
  });

  it('reads only the collection named by --collection', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      ...CONFIG,
      collections: { app: { translationsFolder: 'i18n' }, admin: { translationsFolder: 'admin' } },
    });
    await glossaryCommand({ text: 'Save', collection: 'app' });
    expect(buildGlossary).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'app', translationsFolder: '/project/i18n' })],
      'Save',
      expect.any(Object),
    );
  });

  it('exits 1 when --collection cannot be resolved', async () => {
    await glossaryCommand({ text: 'Save', collection: 'nope' });
    expect(console.error).toHaveBeenCalledWith('❌ Collection "nope" not found');
    expect(buildGlossary).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('uses the runner no-collections failure when config is empty', async () => {
    vi.mocked(loadConfig).mockReturnValue({ ...CONFIG, collections: {} });
    await glossaryCommand({ text: 'Save' });
    expect(console.error).toHaveBeenCalledWith('❌ No collections found. Run `lingo-tracker add-collection` first.');
    expect(buildGlossary).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('writes an empty glossary when core finds nothing', async () => {
    vi.mocked(buildGlossary).mockReturnValue({ ...RESULT, matchCount: 0, terms: [] });
    await glossaryCommand({ text: 'unrelated' });
    expect(JSON.parse(writtenContent())).toMatchObject({ matchCount: 0, terms: [] });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No matching translations found.'));
  });

  it('maps --include-all to core', async () => {
    await glossaryCommand({ text: 'Save', includeAll: true });
    expect(buildGlossary).toHaveBeenCalledWith(
      expect.any(Array),
      'Save',
      expect.objectContaining({ includeAll: true }),
    );
  });

  it('passes opened collection locale overrides to core', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      ...CONFIG,
      collections: { app: { translationsFolder: 'i18n', baseLocale: 'fr', locales: ['fr', 'es'] } },
    });
    await glossaryCommand({ text: 'Enregistrer' });
    expect(buildGlossary).toHaveBeenCalledWith(
      [expect.objectContaining({ baseLocale: 'fr', targetLocales: ['es'] })],
      'Enregistrer',
      expect.any(Object),
    );
  });

  it('reports an unreadable folder on stderr and keeps JSON clean', async () => {
    vi.mocked(buildGlossary).mockReturnValue({
      ...RESULT,
      readProblems: [
        { kind: 'unreadable', folderPath: 'bad', collectionName: 'app', message: 'Failed to parse JSON file x' },
      ],
    });
    await glossaryCommand({ text: 'Save', stdout: true });
    expect(console.error).toHaveBeenCalledWith(
      "⚠️  Collection 'app': Skipped unreadable folder 'bad': Failed to parse JSON file x",
    );
    expect(console.log).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(process.stdout.write).mock.calls[0][0] as string)).not.toHaveProperty('readProblems');
  });

  it('passes core output without interpreting metadata', async () => {
    await glossaryCommand({ text: 'Save' });
    expect(JSON.parse(writtenContent()).terms).toEqual(RESULT.terms);
  });

  it('exits 1 with a clear error for the unimplemented ai extractor', async () => {
    vi.mocked(buildGlossary).mockImplementation(() => {
      throw new GlossaryExtractorError('ai');
    });
    await glossaryCommand({ text: 'Save', extractor: 'ai' });
    expect(buildGlossary).toHaveBeenCalledWith(expect.any(Array), 'Save', expect.objectContaining({ extractor: 'ai' }));
    expect(console.error).toHaveBeenCalledWith(
      '❌ The "ai" extractor is not yet implemented. Use --extractor ngram (the default).',
    );
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
