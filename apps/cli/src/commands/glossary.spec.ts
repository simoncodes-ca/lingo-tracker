import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@simoncodes-ca/core', () => ({
  loadResourcesFromCollections: vi.fn(),
}));

vi.mock('../utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils')>();
  return {
    ...actual,
    loadConfiguration: vi.fn(),
    resolveCollection: vi.fn(),
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    default: {
      ...actual,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => ''),
      writeFileSync: vi.fn(),
    },
  };
});

import * as fs from 'fs';
import { loadResourcesFromCollections } from '@simoncodes-ca/core';
import { loadConfiguration, resolveCollection } from '../utils';
import { glossaryCommand } from './glossary';

const LOADED = [
  {
    key: 'save',
    fullKey: 'save',
    source: 'Save',
    translations: { fr: 'Enregistrer' },
    status: { fr: 'verified' },
    collection: 'app',
  },
  {
    key: 'settings',
    fullKey: 'settings',
    source: 'Settings',
    translations: { fr: 'Paramètres' },
    status: { fr: 'translated' },
    collection: 'app',
  },
];

const LOADED_CONFIG = {
  config: {
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: { app: { translationsFolder: 'i18n' } },
  },
  configPath: '/project/.lingo-tracker.json',
  cwd: '/project',
};

function writtenContent(): string {
  const calls = vi.mocked(fs.writeFileSync).mock.calls;
  return (calls[calls.length - 1]?.[1] as string) ?? '';
}

describe('glossaryCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    (process.stdin as unknown as { isTTY: boolean }).isTTY = true;
    vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG as never);
    vi.mocked(loadResourcesFromCollections).mockReturnValue(LOADED as never);
  });

  it('returns early when configuration is missing', async () => {
    vi.mocked(loadConfiguration).mockReturnValue(null);
    await glossaryCommand({ text: 'Save' });
    expect(loadResourcesFromCollections).not.toHaveBeenCalled();
  });

  it('exits when no input is provided', async () => {
    await expect(glossaryCommand({})).rejects.toThrow('process.exit(1)');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('extracts from --text and writes a glossary file by default', async () => {
    await glossaryCommand({ text: 'Click Save to open Settings' });
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const out = JSON.parse(writtenContent());
    expect(out.baseLocale).toBe('en');
    expect(out.locales).toEqual(['fr']); // base locale excluded
    expect(out.matchCount).toBe(2);
    const keys = out.terms.map((t: { key: string }) => t.key).sort();
    expect(keys).toEqual(['save', 'settings']);
  });

  it('writes to a millisecond-precision timestamped file by default (no same-second collisions)', async () => {
    await glossaryCommand({ text: 'Save' });
    const outPath = vi.mocked(fs.writeFileSync).mock.calls[0][0] as string;
    // ms + trailing Z retained, e.g. lingo-tracker-glossary-2026-06-21T04-41-12-123Z.json
    expect(outPath).toMatch(/lingo-tracker-glossary-\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/);
  });

  it('reads from --input file', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('Save document');
    await glossaryCommand({ input: 'help.md' });
    expect(fs.existsSync).toHaveBeenCalled();
    const out = JSON.parse(writtenContent());
    expect(out.terms.some((t: { key: string }) => t.key === 'save')).toBe(true);
  });

  it('reads from piped stdin when no --text/--input and not a TTY', async () => {
    (process.stdin as unknown as { isTTY: boolean | undefined }).isTTY = undefined;
    vi.mocked(fs.readFileSync).mockReturnValue('Please Save your work');
    await glossaryCommand({});
    const out = JSON.parse(writtenContent());
    expect(out.terms.some((t: { key: string }) => t.key === 'save')).toBe(true);
    // fd 0 was read for stdin
    expect(fs.readFileSync).toHaveBeenCalledWith(0, 'utf8');
  });

  it('exits when --input file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(glossaryCommand({ input: 'missing.md' })).rejects.toThrow('process.exit(1)');
  });

  it('prints JSON to stdout with --stdout and does not write a file', async () => {
    await glossaryCommand({ text: 'Save', stdout: true });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledTimes(1);
    const printed = vi.mocked(process.stdout.write).mock.calls[0][0] as string;
    expect(JSON.parse(printed).matchCount).toBe(1);
  });

  it('narrows output locales with --locales', async () => {
    await glossaryCommand({ text: 'Save', locales: 'fr' });
    const out = JSON.parse(writtenContent());
    expect(out.locales).toEqual(['fr']);
  });

  it('resolves a single collection with --collection', async () => {
    vi.mocked(resolveCollection).mockReturnValue({
      name: 'app',
      config: { translationsFolder: 'i18n' },
      translationsFolderPath: '/project/i18n',
    } as never);
    await glossaryCommand({ text: 'Save', collection: 'app' });
    expect(resolveCollection).toHaveBeenCalledWith('app', expect.anything(), '/project');
  });

  it('exits when --collection cannot be resolved', async () => {
    vi.mocked(resolveCollection).mockReturnValue(null);
    await expect(glossaryCommand({ text: 'Save', collection: 'nope' })).rejects.toThrow('process.exit(1)');
  });

  it('writes an empty glossary when nothing matches', async () => {
    await glossaryCommand({ text: 'completely unrelated words' });
    const out = JSON.parse(writtenContent());
    expect(out.matchCount).toBe(0);
    expect(out.terms).toEqual([]);
  });

  it('excludes stale/new entries by default but includes them with --include-all', async () => {
    vi.mocked(loadResourcesFromCollections).mockReturnValue([
      {
        key: 'save',
        fullKey: 'save',
        source: 'Save',
        translations: { fr: 'Enregistrer' },
        status: { fr: 'stale' },
        collection: 'app',
      },
    ] as never);

    await glossaryCommand({ text: 'Save' });
    expect(JSON.parse(writtenContent()).matchCount).toBe(0);

    await glossaryCommand({ text: 'Save', includeAll: true });
    expect(JSON.parse(writtenContent()).matchCount).toBe(1);
  });

  it('strips a collection base-locale override from translations', async () => {
    vi.mocked(loadConfiguration).mockReturnValue({
      config: {
        baseLocale: 'en',
        locales: ['en', 'fr', 'es'],
        collections: { app: { translationsFolder: 'i18n', baseLocale: 'fr' } },
      },
      configPath: '/p/.lingo-tracker.json',
      cwd: '/p',
    } as never);
    vi.mocked(loadResourcesFromCollections).mockReturnValue([
      {
        key: 'save',
        fullKey: 'save',
        source: 'Enregistrer',
        translations: { fr: 'Enregistrer', es: 'Guardar' },
        status: { fr: 'verified', es: 'verified' },
        collection: 'app',
      },
    ] as never);

    await glossaryCommand({ text: 'Enregistrer' });
    const out = JSON.parse(writtenContent());
    // Collection base 'fr' stripped; only non-base target locale 'es' remains.
    expect(out.terms[0].translations).toEqual({ es: 'Guardar' });
  });

  it('exits with a clear error for the unimplemented ai extractor', async () => {
    await expect(glossaryCommand({ text: 'Save', extractor: 'ai' })).rejects.toThrow('process.exit(1)');
  });
});
