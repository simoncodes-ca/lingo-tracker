import * as core from '@simoncodes-ca/core';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInteractiveTerminal } from '../runner/terminal';
import { addResourceCommand } from './add-resource';

// Mock prompts to avoid interactive input
vi.mock('prompts', () => ({
  default: vi.fn(),
}));
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false) }));

vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
    addResource: vi
      .fn()
      .mockResolvedValue({ resolvedKey: 'test.key', created: true, terminology: { findings: [], problems: [] } }),
  };
});

describe('addResourceCommand', () => {
  const configDefaults: Pick<core.LingoTrackerConfig, 'exportFolder' | 'importFolder' | 'baseLocale' | 'locales'> = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en'],
  };

  beforeEach(() => {
    process.env.INIT_CWD = '/test';
    process.exitCode = undefined;
    vi.clearAllMocks();
    vi.mocked(prompts).mockResolvedValue({});
    vi.mocked(isInteractiveTerminal).mockReturnValue(false);
    vi.mocked(core.loadConfig).mockImplementation(() => {
      throw new core.ConfigNotFoundError('/test/.lingo-tracker.json');
    });
  });

  afterEach(() => {
    delete process.env.INIT_CWD;
    process.exitCode = undefined;
  });

  it('trims comma-string tags from an interactive answer', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      collections: { TestCollection: { translationsFolder: 'translations' } },
    });
    vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    vi.mocked(prompts).mockResolvedValue({ tags: ' a, , b, ' });
    await addResourceCommand({ collection: 'TestCollection', key: 'buttons.ok', value: 'OK' });
    expect(core.addResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'TestCollection' }),
      expect.objectContaining({ tags: ['a', 'b'] }),
      { onExisting: 'fail' },
    );
    expect(process.exitCode).toBe(0);
  });

  it('should show error and exit 1 when config file does not exist', async () => {
    await addResourceCommand({
      collection: 'test-collection',
      key: 'buttons.ok',
      value: 'OK',
    });

    expect(core.loadConfig).toHaveBeenCalledWith({ cwd: '/test' });
    expect(console.error).toHaveBeenCalledWith('❌ Configuration file .lingo-tracker.json not found.');
    expect(core.addResource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should print a core error (invalid key) and exit 1', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      collections: { TestCollection: { translationsFolder: 'translations' } },
    });
    vi.mocked(core.addResource).mockRejectedValueOnce(
      new core.InvalidResourceKeyError('invalid key with spaces', 'Invalid resource key'),
    );

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'invalid key with spaces',
      value: 'Test',
    });

    expect(console.error).toHaveBeenCalledWith('❌ Invalid resource key');
    expect(process.exitCode).toBe(1);
  });

  it('should show error when collection does not exist', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      collections: {
        ExistingCollection: { translationsFolder: 'translations' },
      },
    });

    await addResourceCommand({
      collection: 'NonExistentCollection',
      key: 'buttons.ok',
      value: 'OK',
    });

    expect(console.error).toHaveBeenCalledWith('❌ Collection "NonExistentCollection" not found');
    expect(core.addResource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should refuse a read-only collection with exit 1', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      collections: { Vendor: { translationsFolder: 'node_modules/x', readOnly: true } },
    });

    await addResourceCommand({ collection: 'Vendor', key: 'buttons.ok', value: 'OK' });

    expect(core.addResource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should exit 1 naming --key and --value when both are missing in non-interactive mode', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      collections: { TestCollection: { translationsFolder: 'translations' } },
    });

    await addResourceCommand({ collection: 'TestCollection' });

    expect(console.error).toHaveBeenCalledWith('❌ Missing required options in non-interactive mode: --key, --value');
    expect(core.addResource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should pass the opened collection and supplied fields through to core', async () => {
    const config = {
      ...configDefaults,
      collections: {
        TestCollection: {
          translationsFolder: 'translations',
          baseLocale: 'en',
          locales: ['en', 'fr-ca', 'es'],
        },
      },
      baseLocale: 'en',
      locales: ['en', 'fr-ca', 'es'],
    };
    vi.mocked(core.loadConfig).mockReturnValue(config);

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'buttons.ok',
      value: 'OK',
      comment: 'Primary confirmation action',
      tags: ['ui', 'buttons'],
      targetFolder: 'common',
      translations: JSON.stringify([
        { locale: 'fr-ca', value: "D'accord", status: 'translated' },
        { locale: 'es', value: 'Aceptar', status: 'verified' },
      ]),
    });

    expect(core.addResource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TestCollection',
        translationsFolder: '/test/translations',
        baseLocale: 'en',
      }),
      {
        key: 'buttons.ok',
        baseValue: 'OK',
        comment: 'Primary confirmation action',
        tags: ['ui', 'buttons'],
        targetFolder: 'common',
        translations: [
          { locale: 'fr-ca', value: "D'accord", status: 'translated' },
          { locale: 'es', value: 'Aceptar', status: 'verified' },
        ],
      },
      { onExisting: 'fail' },
    );
    expect(process.exitCode).toBe(0);
  });

  it('should exit 1 with a clear message on malformed --translations JSON', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      collections: { TestCollection: { translationsFolder: 'translations' } },
    });

    await addResourceCommand({ collection: 'TestCollection', key: 'a.b', value: 'OK', translations: '[{"locale":' });

    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^❌ Invalid --translations JSON: /));
    expect(core.addResource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('accepts a supplied translation without a status', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      collections: { TestCollection: { translationsFolder: 'translations' } },
    });

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'a.b',
      value: 'OK',
      translations: '[{"locale":"fr","value":"OK"}]',
    });

    expect(core.addResource).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ translations: [{ locale: 'fr', value: 'OK' }] }),
      { onExisting: 'fail' },
    );
    expect(process.exitCode).toBe(0);
  });

  it('prints the typed core error for an invalid translation status', async () => {
    vi.mocked(core.addResource).mockRejectedValueOnce(new core.InvalidTranslationStatusError('done'));
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      locales: ['en', 'fr'],
      collections: { TestCollection: { translationsFolder: 'translations' } },
    });

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'a.b',
      value: 'OK',
      translations: '[{"locale":"fr","value":"Oui","status":"done"}]',
    });

    expect(console.error).toHaveBeenCalledWith(
      '❌ Invalid translation status "done". Valid statuses: new, translated, stale, verified',
    );
    expect(core.addResource).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ translations: [{ locale: 'fr', value: 'Oui', status: 'done' }] }),
      { onExisting: 'fail' },
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects a translation missing its value before calling core', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      collections: { TestCollection: { translationsFolder: 'translations' } },
    });

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'a.b',
      value: 'OK',
      translations: '[{"locale":"fr","status":"verified"}]',
    });

    expect(console.error).toHaveBeenCalledWith(
      '❌ Invalid --translations: expected a JSON array of { "locale", "value" } with optional "status" one of new, translated, stale, verified',
    );
    expect(core.addResource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  const existingConfig = () => ({
    ...configDefaults,
    collections: { TestCollection: { translationsFolder: 'translations', baseLocale: 'en' } },
    baseLocale: 'en',
  });

  it('cancels after an interactive conflict is declined', async () => {
    vi.mocked(core.loadConfig).mockReturnValue(existingConfig());
    vi.mocked(core.addResource).mockRejectedValueOnce(new core.ResourceAlreadyExistsError('buttons.ok'));
    vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    vi.mocked(prompts).mockResolvedValueOnce({}).mockResolvedValueOnce({ confirmed: false });

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'buttons.ok',
      value: 'OK',
    });

    expect(prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        name: 'confirmed',
        message: expect.stringContaining('already exists'),
      }),
      expect.anything(),
    );
    expect(core.addResource).toHaveBeenCalledTimes(1);
    expect(core.addResource).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), { onExisting: 'fail' });
    expect(console.error).toHaveBeenCalledWith('❌ Add resource cancelled.');
    expect(process.exitCode).toBe(0);
  });

  it('retries with replace after an interactive conflict is accepted', async () => {
    vi.mocked(core.loadConfig).mockReturnValue(existingConfig());
    vi.mocked(core.addResource).mockRejectedValueOnce(new core.ResourceAlreadyExistsError('buttons.ok'));
    vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    vi.mocked(prompts).mockResolvedValueOnce({}).mockResolvedValueOnce({ confirmed: true });

    await addResourceCommand({ collection: 'TestCollection', key: 'buttons.ok', value: 'OK' });

    expect(prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        name: 'confirmed',
        message: 'Resource "buttons.ok" already exists. Override?',
        initial: false,
      }),
      expect.anything(),
    );
    expect(core.addResource).toHaveBeenCalledTimes(2);
    expect(vi.mocked(core.addResource).mock.calls[0][2]).toEqual({ onExisting: 'fail' });
    expect(vi.mocked(core.addResource).mock.calls[1][2]).toEqual({ onExisting: 'replace' });
    expect(process.exitCode).toBe(0);
  });

  it('reports an existing key and exits 1 without prompting in non-interactive mode', async () => {
    vi.mocked(core.loadConfig).mockReturnValue(existingConfig());
    vi.mocked(core.addResource).mockRejectedValueOnce(new core.ResourceAlreadyExistsError('buttons.ok'));

    await addResourceCommand({ collection: 'TestCollection', key: 'buttons.ok', value: 'OK' });

    expect(console.error).toHaveBeenCalledWith('❌ Resource already exists: buttons.ok');
    expect(console.error).toHaveBeenCalledWith('  Use --override to replace it, or edit-resource to change it.');
    expect(core.addResource).toHaveBeenCalledTimes(1);
    expect(prompts).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('passes --override as replace in one call without prompting', async () => {
    vi.mocked(core.loadConfig).mockReturnValue(existingConfig());

    await addResourceCommand({ collection: 'TestCollection', key: 'buttons.ok', value: 'OK', override: true });

    expect(core.addResource).toHaveBeenCalledTimes(1);
    expect(core.addResource).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), { onExisting: 'replace' });
    expect(prompts).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  describe('preferred terminology', () => {
    const config = {
      ...configDefaults,
      collections: { TestCollection: { translationsFolder: 'translations', baseLocale: 'en', locales: ['en', 'fr'] } },
      baseLocale: 'en',
      locales: ['en', 'fr'],
    };
    // Warnings are diagnostics: they go to stderr.
    let stderrSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.mocked(core.loadConfig).mockReturnValue(config);
      stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    const add = (value: string) => addResourceCommand({ collection: 'TestCollection', key: 'budget.title', value });

    /** What core returns for a stored value: the findings are core's, the CLI only renders them. */
    const added = (terminology: core.TerminologyFindings) =>
      vi.mocked(core.addResource).mockResolvedValue({
        resolvedKey: 'budget.title',
        created: true,
        translations: [],
        terminology,
      });

    it('prints one warning per finding after a successful add, with the reason on its own line', async () => {
      added({
        findings: [
          {
            key: 'budget.title',
            discouraged: 'Expenditure',
            preferred: 'Investment',
            reason: 'Finance style guide',
            message: 'consider "Investment" instead of "Expenditure"',
          },
          {
            key: 'budget.title',
            discouraged: 'e-mail',
            preferred: 'email',
            message: 'consider "email" instead of "e-mail"',
          },
        ],
        problems: [],
      });

      await add('Expenditure and more expenditure, by e-mail');

      const lines = stderrSpy.mock.calls.map((call) => String(call[0]));
      expect(lines).toContain('⚠️  Preferred terminology: consider "Investment" instead of "Expenditure"');
      expect(lines).toContain('  Finance style guide');
      expect(lines).toContain('⚠️  Preferred terminology: consider "email" instead of "e-mail"');
      expect(lines.filter((line) => line.includes('Preferred terminology:'))).toHaveLength(2);
      expect(process.exitCode).toBe(0);
    });

    it('prints nothing when there are no findings', async () => {
      added({ findings: [], problems: [] });

      await add('Investment summary');

      expect(stderrSpy.mock.calls.some((call) => String(call[0]).includes('Preferred terminology'))).toBe(false);
    });

    it('prints each rule-file problem as a warning', async () => {
      added({ findings: [], problems: ['Preferred terminology checks skipped: not valid JSON'] });

      await add('Expenditure');

      const lines = stderrSpy.mock.calls.map((call) => String(call[0]));
      expect(lines).toContain('⚠️  Preferred terminology checks skipped: not valid JSON');
      expect(lines.filter((line) => line.includes('Preferred terminology'))).toHaveLength(1);
    });

    it('prints only the failure when the add fails', async () => {
      vi.mocked(core.addResource).mockRejectedValueOnce(new Error('boom'));

      await add('Expenditure');

      expect(stderrSpy.mock.calls.some((call) => String(call[0]).includes('Preferred terminology'))).toBe(false);
      expect(stderrSpy).toHaveBeenCalledWith('❌ boom');
      expect(process.exitCode).toBe(1);
    });
  });

  it('reports a cancelled prompt once and exits 0 without adding the resource', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...configDefaults,
      collections: { TestCollection: { translationsFolder: 'translations', baseLocale: 'en' } },
      baseLocale: 'en',
    });
    vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit');
    // The user presses Esc: prompts calls onCancel.
    vi.mocked(prompts).mockImplementation(async (questions, options) => {
      const [question] = Array.isArray(questions) ? questions : [questions];
      options?.onCancel?.(question, {});
      return {};
    });

    try {
      await expect(addResourceCommand({})).resolves.toBeUndefined();

      expect(log.mock.calls.filter(([line]) => String(line).includes('cancelled'))).toEqual([
        ['❌ Add resource cancelled.'],
      ]);
      expect(core.addResource).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
    } finally {
      log.mockRestore();
      exit.mockRestore();
    }
  });
});
