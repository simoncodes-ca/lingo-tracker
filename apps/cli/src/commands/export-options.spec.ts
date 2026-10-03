import type { ExportRunOptions } from '@simoncodes-ca/core';
import type prompts from 'prompts';
import { describe, expect, it } from 'vitest';
import { type ExportCommandOptions, exportQuestions, exportSelection, resolveExportOptions } from './export-options';

const context = {
  config: { exportFolder: 'custom/export', collections: { main: { translationsFolder: 'translations' } } },
  targetLocales: ['fr', 'de'],
};
const defaultOptions = {
  format: undefined,
  outputDirectory: undefined,
  locales: undefined,
  status: ['new', 'stale'],
  tags: undefined,
  filenamePattern: undefined,
  dryRun: undefined,
  verbose: undefined,
  jsonStructure: 'hierarchical',
  richJson: false,
  includeBase: false,
  includeStatus: false,
  includeComment: false,
  includeTags: false,
  basePropertyName: undefined,
  augmentProtectedTerms: true,
};
function typeOf(question: prompts.PromptObject, answers: Record<string, unknown>) {
  return typeof question.type === 'function' ? question.type(undefined, answers, question) : question.type;
}
function visibleNames(flags: ExportCommandOptions, answers: Record<string, unknown>) {
  return exportQuestions(flags, context)
    .filter((question) => typeOf(question, answers))
    .map((question) => question.name);
}

describe('export Run Options Resolution', () => {
  const cases: {
    label: string;
    answers: ExportCommandOptions & Record<string, unknown>;
    expected: Partial<ExportRunOptions>;
    advisories?: string[];
    error?: string;
  }[] = [
    {
      label: 'defaults',
      expected: {
        format: 'json',
      },
      answers: {
        format: 'json',
      },
    },
    {
      label: 'prompt answers',
      expected: {
        format: 'json',
        locales: ['fr'],
        status: ['verified'],
        jsonStructure: 'flat',
        richJson: true,
        includeBase: true,
        basePropertyName: 'source',
      },
      answers: {
        format: 'json',
        locales: ['fr'],
        statusFilter: ['verified'],
        structure: 'flat',
        rich: true,
        includeBase: true,
        basePropertyName: 'source',
      },
    },
    {
      label: 'merged explicit options',
      expected: {
        format: 'xliff',
        locales: ['de'],
        status: ['new'],
        basePropertyName: 'source',
      },
      advisories: ['--base-property-name has no effect without --include-base'],
      answers: {
        format: 'xliff',
        rich: false,
        includeBase: false,
        locales: ['fr'],
        statusFilter: ['verified'],
        locale: ['de'],
        status: ['new'],
        basePropertyName: 'source',
      },
    },
    {
      label: 'merged prompt value',
      expected: {
        richJson: true,
      },
      answers: {
        rich: true,
      },
    },
    {
      label: 'all selection dominates',
      expected: {},
      answers: {
        locales: ['fr', '__ALL__'],
      },
    },
    {
      label: 'empty flags select all and normalize optional strings',
      expected: {},
      answers: {
        locales: ['fr'],
        locale: [],
        tags: [],
        output: '',
        filename: '',
        basePropertyName: '',
      },
    },
    {
      label: 'lists and optional options',
      expected: {
        locales: ['fr', 'de'],
        status: ['verified', 'translated'],
        tags: ['ui', 'app'],
        outputDirectory: 'out',
        filenamePattern: '{locale}',
        dryRun: true,
        verbose: true,
        augmentProtectedTerms: false,
        includeStatus: true,
        includeComment: true,
        includeTags: true,
      },
      answers: {
        locale: ['fr', 'de'],
        tags: ['ui', 'app'],
        status: ['verified', 'translated'],
        output: 'out',
        filename: '{locale}',
        dryRun: true,
        verbose: true,
        protectNotes: false,
        includeStatus: true,
        includeComment: true,
        includeTags: true,
      },
    },
    {
      label: 'empty status before any advisory',
      expected: {
        status: [],
        basePropertyName: 'source',
      },
      answers: {
        status: [],
        basePropertyName: 'source',
      },
      error: 'Invalid --status "". Valid statuses: new, translated, stale, verified',
    },
    {
      label: 'hidden JSON switches retain defaults for XLIFF',
      expected: {
        format: 'xliff',
      },
      answers: {
        format: 'xliff',
      },
    },
    {
      label: 'base value enabled even without rich',
      expected: {
        format: 'json',
        includeBase: true,
        basePropertyName: 'source',
      },
      answers: {
        format: 'json',
        rich: false,
        includeBase: true,
        basePropertyName: 'source',
      },
    },
  ];
  for (const { label, answers, expected, advisories = [], error } of cases) {
    it(`resolves ${label}`, () => {
      if (error) {
        expect(() => resolveExportOptions(answers)).toThrow(error);
        return;
      }
      expect(resolveExportOptions(answers)).toEqual({ options: { ...defaultOptions, ...expected }, advisories });
    });
  }

  const visibility: {
    label: string;
    flags: ExportCommandOptions;
    answers: Record<string, unknown>;
    expected: string[];
  }[] = [
    { label: 'XLIFF flag', flags: { format: 'xliff' }, answers: {}, expected: [] },
    { label: 'XLIFF answer', flags: {}, answers: { format: 'xliff' }, expected: [] },
    { label: 'plain JSON', flags: { format: 'json' }, answers: { rich: false }, expected: ['structure', 'rich'] },
    {
      label: 'rich JSON',
      flags: { format: 'json' },
      answers: { rich: true },
      expected: ['structure', 'rich', 'includeBase', 'includeStatus', 'includeComment', 'includeTags'],
    },
    {
      label: 'rich JSON with base',
      flags: { format: 'json', rich: true, includeBase: true },
      answers: {},
      expected: ['structure', 'includeStatus', 'includeComment', 'includeTags', 'basePropertyName'],
    },
    {
      label: 'base prompt without rich',
      flags: { format: 'json', rich: false, includeBase: true },
      answers: {},
      expected: ['structure', 'basePropertyName'],
    },
    {
      label: 'flag false overrides answer',
      flags: { format: 'json', rich: false },
      answers: { rich: true },
      expected: ['structure'],
    },
  ];
  for (const { label, flags, answers, expected } of visibility) {
    it(`shows ${label} prompts`, () => {
      const names = visibleNames(flags, answers).filter((name) =>
        [
          'structure',
          'rich',
          'includeBase',
          'includeStatus',
          'includeComment',
          'includeTags',
          'basePropertyName',
        ].includes(String(name)),
      );
      expect(names).toEqual(expected);
    });
  }

  it('keeps prompt order, text, initial values and selection choices', () => {
    const questions = exportQuestions({}, context);
    expect(questions.map(({ name, message, initial }) => [name, message, initial])).toEqual([
      ['format', 'Select export format', 0],
      ['collections', 'Select collections to export', undefined],
      ['locales', 'Select target locales to export', undefined],
      ['statusFilter', 'Filter by translation status', undefined],
      ['tags', 'Filter by tags (comma-separated, optional)', ''],
      ['output', 'Output directory', 'custom/export'],
      ['structure', 'JSON structure type', 0],
      ['rich', 'Use rich JSON objects (include metadata)?', false],
      ['includeBase', 'Include base locale value in rich objects?', false],
      ['includeStatus', 'Include translation status in rich objects?', false],
      ['includeComment', 'Include comments?', false],
      ['includeTags', 'Include tags array in rich objects?', false],
      ['basePropertyName', 'Property name for base locale value', 'baseValue'],
      ['filename', 'Custom filename pattern (optional, e.g., "translations-{locale}")', ''],
    ]);
    expect(questions.find((q) => q.name === 'collections')?.choices).toEqual([
      { title: 'All Collections', value: '__ALL__', selected: true },
      { title: 'main', value: 'main' },
    ]);
    expect(questions.find((q) => q.name === 'statusFilter')?.choices).toEqual([
      { title: 'New (not yet translated)', value: 'new', selected: true },
      { title: 'Stale (source changed)', value: 'stale', selected: true },
      { title: 'Translated (has translation)', value: 'translated', selected: false },
      { title: 'Verified (reviewed)', value: 'verified', selected: false },
    ]);
  });

  it('uses the shared output default without an export folder', () => {
    expect(
      exportQuestions({}, { ...context, config: { collections: {} } }).find((q) => q.name === 'output')?.initial,
    ).toBe('dist/lingo-export');
  });

  const emptySelections = [
    { answers: { collections: [], locales: [], statusFilter: [] }, message: 'Select at least one collection.' },
    {
      answers: { collection: ['missing'], locales: [], statusFilter: [] },
      message: 'Select at least one target locale.',
    },
    {
      answers: { collection: ['missing'], locale: ['fr'], statusFilter: [] },
      message: 'Select at least one translation status.',
    },
  ];
  for (const { answers, message } of emptySelections) {
    it(`validates selection order: ${message}`, () => expect(() => exportSelection(answers)).toThrow(message));
  }

  it('resolves collection flags and all answers with Selection', () => {
    expect(exportSelection({ collection: ['main'], collections: ['__ALL__'] })).toEqual({
      kind: 'some',
      names: ['main'],
    });
    expect(exportSelection({ collections: ['main', '__ALL__'] })).toEqual({ kind: 'all' });
  });

  for (const status of ['', ' , ']) {
    it(`rejects the empty status shape for ${JSON.stringify(status)}`, () => {
      expect(() => resolveExportOptions({ status: { kind: 'empty', input: status } })).toThrow(
        `Invalid --status "${status}". Valid statuses: new, translated, stale, verified`,
      );
    });
  }
  it('preserves empty-status precedence over an invalid base property', () => {
    expect(() => resolveExportOptions({ status: [], basePropertyName: 'status' })).toThrow(
      'Invalid --status "". Valid statuses: new, translated, stale, verified',
    );
  });

  it('leaves unknown statuses to core and unrelated errors to the runner', () => {
    expect(resolveExportOptions({ status: ['new', 'verifed'] }).options.status).toEqual(['new', 'verifed']);
    // Resolution has no error-formatting surface; command specs cover unrelated failures.
  });

  // Moved from export-cmd.test.ts: these assertions describe the pure prompt schema.
  it('should prompt for JSON-specific options when JSON format is selected', () => {
    const questions = exportQuestions({}, context);
    const structure = questions.find((q) => q.name === 'structure');
    const rich = questions.find((q) => q.name === 'rich');
    expect(structure).toBeDefined();
    expect(rich).toBeDefined();
    if (structure) expect(typeOf(structure, { format: 'json' })).toBe('select');
    if (rich) expect(typeOf(rich, { format: 'json' })).toBe('toggle');
  });
  it('should not prompt for already provided options', () => {
    expect(exportQuestions({ format: 'json' }, context)).not.toContainEqual(
      expect.objectContaining({ name: 'format' }),
    );
  });
  it('should conditionally show JSON-specific prompts based on format', () => {
    const questions = exportQuestions({}, context);
    for (const name of ['structure', 'rich']) {
      const question = questions.find((q) => q.name === name);
      expect(question).toBeDefined();
      if (question) expect(typeOf(question, { format: 'xliff' })).toBeNull();
    }
  });
});
