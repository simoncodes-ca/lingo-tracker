import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { protectedTermsCommand } from './protected-terms';

vi.mock('@simoncodes-ca/core', () => ({
  setGlobalProtectedTerms: vi.fn(() => ({ message: 'ok', filePath: '/project/.lingo-tracker-protected-terms.json' })),
  setCollectionProtectedTerms: vi.fn(() => ({ message: 'ok', filePath: '/project/i18n/terms.json' })),
  setGlobalProtectedTermsFile: vi.fn(() => ({ message: 'file set', filePath: '/project/custom.json' })),
  setCollectionProtectedTermsFile: vi.fn(async () => ({ message: 'file set', filePath: '/project/i18n/terms.json' })),
  readGlobalProtectedTerms: vi.fn(() => []),
  readCollectionProtectedTerms: vi.fn(() => []),
  resolveGlobalProtectedTermsFilePath: vi.fn(() => '/project/.lingo-tracker-protected-terms.json'),
  resolveCollectionProtectedTermsFilePath: vi.fn(() => undefined),
}));

vi.mock('../utils', () => ({
  loadConfiguration: vi.fn(),
  ConsoleFormatter: {
    section: vi.fn(),
    keyValue: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { loadConfiguration, ConsoleFormatter } from '../utils';
import {
  readCollectionProtectedTerms,
  readGlobalProtectedTerms,
  resolveCollectionProtectedTermsFilePath,
  setCollectionProtectedTerms,
  setCollectionProtectedTermsFile,
  setGlobalProtectedTerms,
  setGlobalProtectedTermsFile,
} from '@simoncodes-ca/core';

const BASE_CONFIG = {
  baseLocale: 'en',
  locales: ['en', 'es'],
  collections: {
    main: { translationsFolder: 'src/i18n' },
  },
};

const loaded = () => ({ config: BASE_CONFIG, cwd: '/project' });

describe('protectedTermsCommand', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfiguration).mockReturnValue(loaded() as never);
    vi.mocked(readGlobalProtectedTerms).mockReturnValue([]);
    vi.mocked(readCollectionProtectedTerms).mockReturnValue([]);
    vi.mocked(resolveCollectionProtectedTermsFilePath).mockReturnValue(undefined);
  });

  afterEach(() => {
    exitSpy.mockClear();
  });

  it('errors when --set is combined with --add', async () => {
    await protectedTermsCommand({ set: 'iPhone', add: ['C++'] });

    expect(ConsoleFormatter.error).toHaveBeenCalledWith('--set cannot be combined with --add or --remove');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when no operation is given', async () => {
    await protectedTermsCommand({});

    expect(ConsoleFormatter.error).toHaveBeenCalledWith(
      'Provide at least one of --add, --remove, --set, --list, or --file',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('adds globally when no --collection is present, storing terms verbatim', async () => {
    await protectedTermsCommand({ add: [' iPhone ', 'iPhone'] });

    expect(setGlobalProtectedTerms).toHaveBeenCalledWith(['iPhone'], { cwd: '/project' });
  });

  it('adds to a collection when --collection is present', async () => {
    await protectedTermsCommand({ collection: 'main', add: ['iPhone', 'C++'] });

    expect(setCollectionProtectedTerms).toHaveBeenCalledWith('main', ['iPhone', 'C++'], { cwd: '/project' });
  });

  it('removes from the terms already in the file', async () => {
    vi.mocked(readGlobalProtectedTerms).mockReturnValue(['iPhone', 'C++']);

    await protectedTermsCommand({ remove: ['iPhone'] });

    expect(setGlobalProtectedTerms).toHaveBeenCalledWith(['C++'], { cwd: '/project' });
  });

  it('replaces the list with --set', async () => {
    vi.mocked(readGlobalProtectedTerms).mockReturnValue(['C++']);

    await protectedTermsCommand({ set: 'iPhone, Node.js' });

    expect(setGlobalProtectedTerms).toHaveBeenCalledWith(['iPhone', 'Node.js'], { cwd: '/project' });
  });

  it('clears the list when --set is empty', async () => {
    await protectedTermsCommand({ set: '' });

    expect(setGlobalProtectedTerms).toHaveBeenCalledWith([], { cwd: '/project' });
  });

  it('errors when the collection does not exist', async () => {
    await protectedTermsCommand({ collection: 'missing', add: ['iPhone'] });

    expect(ConsoleFormatter.error).toHaveBeenCalledWith('Collection "missing" not found');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(setCollectionProtectedTerms).not.toHaveBeenCalled();
  });

  it('lists the global terms and the file they live in', async () => {
    vi.mocked(readGlobalProtectedTerms).mockReturnValue(['iPhone']);

    await protectedTermsCommand({ list: true });

    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Scope', 'Global');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('File', '.lingo-tracker-protected-terms.json');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Terms', 'iPhone');
  });

  it('lists the effective union for a collection, naming both files', async () => {
    vi.mocked(readGlobalProtectedTerms).mockReturnValue(['SimonCodes']);
    vi.mocked(readCollectionProtectedTerms).mockReturnValue(['iPhone']);
    vi.mocked(resolveCollectionProtectedTermsFilePath).mockReturnValue('/project/i18n/terms.json');

    await protectedTermsCommand({ collection: 'main', list: true });

    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Global file', '.lingo-tracker-protected-terms.json');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Collection file', 'i18n/terms.json');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Effective', 'SimonCodes, iPhone');
  });

  it('points the global scope at a file with --file', async () => {
    await protectedTermsCommand({ file: 'config/terms.json' });

    expect(setGlobalProtectedTermsFile).toHaveBeenCalledWith('config/terms.json', { cwd: '/project' });
  });

  it('clears the pointer when --file is empty', async () => {
    await protectedTermsCommand({ file: '' });

    expect(setGlobalProtectedTermsFile).toHaveBeenCalledWith(undefined, { cwd: '/project' });
  });

  it('points a collection at its own file with --file', async () => {
    await protectedTermsCommand({ collection: 'main', file: 'i18n/terms.json' });

    expect(setCollectionProtectedTermsFile).toHaveBeenCalledWith('main', 'i18n/terms.json', { cwd: '/project' });
  });

  it('sets the pointer before writing terms when --file and --add are combined', async () => {
    await protectedTermsCommand({ file: 'config/terms.json', add: ['iPhone'] });

    const fileOrder = vi.mocked(setGlobalProtectedTermsFile).mock.invocationCallOrder[0];
    const termsOrder = vi.mocked(setGlobalProtectedTerms).mock.invocationCallOrder[0];
    expect(fileOrder).toBeLessThan(termsOrder);
  });

  it('reports a malformed terms file instead of writing over it', async () => {
    vi.mocked(readGlobalProtectedTerms).mockImplementation(() => {
      throw new Error('Protected terms file is not valid JSON: /project/terms.json');
    });

    await protectedTermsCommand({ add: ['iPhone'] });

    expect(ConsoleFormatter.error).toHaveBeenCalledWith('Protected terms file is not valid JSON: /project/terms.json');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(setGlobalProtectedTerms).not.toHaveBeenCalled();
  });

  it('reports a collection with no terms file rather than failing silently', async () => {
    vi.mocked(setCollectionProtectedTerms).mockImplementation(() => {
      throw new Error('Collection "main" has no protected terms file. Set one first with --file <path>.');
    });

    await protectedTermsCommand({ collection: 'main', add: ['iPhone'] });

    expect(ConsoleFormatter.error).toHaveBeenCalledWith(
      'Collection "main" has no protected terms file. Set one first with --file <path>.',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
