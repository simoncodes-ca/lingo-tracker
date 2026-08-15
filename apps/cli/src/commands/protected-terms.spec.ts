import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { protectedTermsCommand } from './protected-terms';

vi.mock('@simoncodes-ca/core', () => ({
  setGlobalProtectedTerms: vi.fn(() => ({ message: 'ok' })),
  setCollectionProtectedTerms: vi.fn(async () => ({ message: 'ok' })),
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
import { setGlobalProtectedTerms, setCollectionProtectedTerms } from '@simoncodes-ca/core';

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
  });

  afterEach(() => {
    exitSpy.mockClear();
  });

  it('errors when --set is combined with --add', async () => {
    await protectedTermsCommand({ set: 'iPhone', add: ['C++'] });

    expect(ConsoleFormatter.error).toHaveBeenCalledWith('--set cannot be combined with --add or --remove');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(setGlobalProtectedTerms).not.toHaveBeenCalled();
  });

  it('errors when no operation is given', async () => {
    await protectedTermsCommand({});

    expect(ConsoleFormatter.error).toHaveBeenCalledWith('Provide at least one of --add, --remove, --set, or --list');
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

  it('removes terms from the global list', async () => {
    vi.mocked(loadConfiguration).mockReturnValue({
      config: { ...BASE_CONFIG, protectedTerms: ['iPhone', 'C++'] },
      cwd: '/project',
    } as never);

    await protectedTermsCommand({ remove: ['iPhone'] });

    expect(setGlobalProtectedTerms).toHaveBeenCalledWith(['C++'], { cwd: '/project' });
  });

  it('sets the full list from a comma-separated value', async () => {
    await protectedTermsCommand({ set: 'iPhone, Node.js' });

    expect(setGlobalProtectedTerms).toHaveBeenCalledWith(['iPhone', 'Node.js'], { cwd: '/project' });
  });

  it('errors on an unknown collection', async () => {
    await protectedTermsCommand({ collection: 'missing', add: ['iPhone'] });

    expect(ConsoleFormatter.error).toHaveBeenCalledWith('Collection "missing" not found');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('lists the global terms', async () => {
    vi.mocked(loadConfiguration).mockReturnValue({
      config: { ...BASE_CONFIG, protectedTerms: ['iPhone'] },
      cwd: '/project',
    } as never);

    await protectedTermsCommand({ list: true });

    expect(ConsoleFormatter.section).toHaveBeenCalledWith('Protected Terms');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Scope', 'Global');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Terms', 'iPhone');
  });

  it('lists the effective (global + collection) terms for a collection', async () => {
    vi.mocked(loadConfiguration).mockReturnValue({
      config: {
        ...BASE_CONFIG,
        protectedTerms: ['SimonCodes'],
        collections: { main: { translationsFolder: 'src/i18n', protectedTerms: ['iPhone'] } },
      },
      cwd: '/project',
    } as never);

    await protectedTermsCommand({ collection: 'main', list: true });

    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Scope', 'Collection "main" (global + collection)');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Global', 'SimonCodes');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Collection-specific', 'iPhone');
    expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Effective', 'SimonCodes, iPhone');
  });

  it('clears terms when --set is empty', async () => {
    await protectedTermsCommand({ set: '' });

    expect(setGlobalProtectedTerms).toHaveBeenCalledWith([], { cwd: '/project' });
  });
});
