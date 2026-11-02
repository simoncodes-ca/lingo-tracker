import { IMPORT_STRATEGIES } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import { flagAdvisories, flagQuestions } from '../runner/flag-record';
import { EXPORT_FLAGS, type ExportPromptContext, resolveExportFlags } from './export-cmd-flags';
import type { ExportCommandOptions } from './export-options';
import { IMPORT_FLAGS, resolveImportFlags } from './import-cmd-flags';
import type { ImportCommandOptions } from './import-options';

const jsonFields = ['structure', 'rich'] as const;
const richFields = ['includeBase', 'includeStatus', 'includeComment', 'includeTags'] as const;
const exportFields = [...jsonFields, ...richFields, 'basePropertyName'] as const;
const migrationFields = ['updateComments', 'updateTags', 'createMissing'] as const;

describe('flag applicability as plain data', () => {
  for (const format of [undefined, 'json', 'xliff'] as const) {
    for (const rich of [undefined, false, true]) {
      for (const includeBase of [undefined, false, true]) {
        const values = { format, rich, includeBase };
        it(`declares export applicability for ${JSON.stringify(values)}`, () => {
          const isJson = format === 'json';
          expect(exportFields.map((key) => EXPORT_FLAGS[key].appliesWhen?.(values))).toEqual([
            isJson,
            isJson,
            isJson && Boolean(rich),
            isJson && Boolean(rich),
            isJson && Boolean(rich),
            isJson && Boolean(rich),
            isJson && Boolean(includeBase),
          ]);
        });
      }
    }
  }

  const exportCases: { values: ExportCommandOptions; expected: string[] }[] = [
    { values: {}, expected: [] },
    { values: { format: 'xliff' }, expected: [] },
    {
      values: {
        format: 'xliff',
        structure: 'flat',
        rich: false,
        includeBase: false,
        includeStatus: true,
        includeComment: true,
        includeTags: true,
        basePropertyName: 'source',
      },
      expected: [
        '--structure has no effect with --format xliff.',
        '--rich has no effect with --format xliff.',
        '--include-base has no effect with --format xliff.',
        '--include-status has no effect with --format xliff.',
        '--include-comment has no effect with --format xliff.',
        '--include-tags has no effect with --format xliff.',
        '--base-property-name has no effect without --include-base.',
      ],
    },
    {
      values: { format: 'xliff', includeBase: true, basePropertyName: 'source' },
      expected: [
        '--include-base has no effect with --format xliff.',
        '--base-property-name has no effect with --format xliff.',
      ],
    },
    {
      values: {
        format: 'json',
        rich: false,
        includeBase: true,
        includeStatus: false,
        includeComment: true,
        includeTags: true,
        basePropertyName: 'source',
      },
      expected: [
        '--include-base has no effect without --rich.',
        '--include-status has no effect without --rich.',
        '--include-comment has no effect without --rich.',
        '--include-tags has no effect without --rich.',
        '--base-property-name has no effect without --rich.',
      ],
    },
    {
      values: {
        format: 'json',
        rich: true,
        includeBase: true,
        structure: 'flat',
        includeStatus: true,
        includeComment: true,
        includeTags: true,
        basePropertyName: 'source',
      },
      expected: [],
    },
    {
      values: { format: 'json', includeBase: true, basePropertyName: 'x' },
      expected: ['--include-base has no effect without --rich.', '--base-property-name has no effect without --rich.'],
    },
    {
      values: {
        format: 'unknown' as ExportCommandOptions['format'],
        structure: 'flat',
        rich: true,
        includeBase: true,
        basePropertyName: 'source',
      },
      expected: [
        '--structure applies only to JSON exports.',
        '--rich applies only to JSON exports.',
        '--include-base applies only to JSON exports.',
        '--base-property-name applies only to JSON exports.',
      ],
    },
    { values: { basePropertyName: '' }, expected: [] },
    {
      values: { format: 'json', basePropertyName: 'source' },
      expected: ['--base-property-name has no effect without --include-base.'],
    },
  ];
  it.each(exportCases)('never emits two advisories for one export flag: $values', ({ values }) => {
    const messages = flagAdvisories<ExportCommandOptions>(EXPORT_FLAGS, values);
    const flags = messages.map((message) => message.split(' ')[0]);
    expect(flags.length).toBe(new Set(flags).size);
  });
  it.each(exportCases)('collects ordered export advisories for $values', ({ values, expected }) => {
    const before = resolveExportFlags(values);
    expect(flagAdvisories<ExportCommandOptions>(EXPORT_FLAGS, Object.freeze(values))).toEqual(expected);
    expect(resolveExportFlags(values)).toEqual(before);
  });

  for (const strategy of [undefined, ...IMPORT_STRATEGIES]) {
    for (const supplied of [undefined, false, true]) {
      it(`declares import applicability and advisories for ${strategy}, switches=${supplied}`, () => {
        const values: ImportCommandOptions = {
          strategy,
          updateComments: supplied,
          updateTags: supplied,
          createMissing: supplied,
        };
        expect(migrationFields.map((key) => IMPORT_FLAGS[key].appliesWhen?.(values))).toEqual(
          migrationFields.map(() => strategy === 'migration'),
        );
        const expected =
          strategy === 'migration' || supplied === undefined
            ? []
            : strategy === undefined
              ? [
                  '--update-comments has no effect with the default --strategy translation-service.',
                  '--update-tags has no effect with the default --strategy translation-service.',
                  '--create-missing has no effect with the default --strategy translation-service.',
                ]
              : [
                  `--update-comments has no effect with --strategy ${strategy}.`,
                  `--update-tags has no effect with --strategy ${strategy}.`,
                  `--create-missing has no effect with --strategy ${strategy}.`,
                ];
        expect(flagAdvisories<ImportCommandOptions>(IMPORT_FLAGS, Object.freeze(values))).toEqual(expected);
        expect(resolveImportFlags(values)).toMatchObject({
          updateComments: supplied,
          updateTags: supplied,
          createMissing: supplied,
        });
      });
    }
  }
});

describe('shared prompt dependency precedence', () => {
  it.each([false, true, ''])('keeps a supplied %j over prior answers for type and choices', (value) => {
    type Options = { dependency?: unknown; field?: string };
    const records = {
      dependency: { flags: '--dependency <value>' },
      field: {
        flags: '--field <value>',
        appliesWhen: (values: Options) => values.dependency === value,
        prompt: () => [
          {
            name: 'field',
            type: (_prev: unknown, values: Options) => (values.dependency === value ? ('select' as const) : null),
            choices: (_prev: unknown, values: Options) => [{ title: String(values.dependency), value: 'chosen' }],
          },
        ],
      },
    };
    const questions = flagQuestions<Options, undefined>(records, { dependency: value }, undefined);
    const question = questions[0];
    const answers = { dependency: 'conflicting answer' };
    expect(typeof question.type === 'function' ? question.type(undefined, answers, question) : question.type).toBe(
      'select',
    );
    expect(
      typeof question.choices === 'function' ? question.choices(undefined, answers, question) : question.choices,
    ).toEqual([{ title: String(value), value: 'chosen' }]);
    expect(flagQuestions<Options, undefined>(records, { field: '' }, undefined)).toEqual([]);
  });
});

describe('flagQuestions export equivalence', () => {
  const context: ExportPromptContext = {
    config: {},
    targetLocales: ['fr'],
    outputInitial: 'out',
    selectionPrompt: ({ name, message }) => ({ type: 'multiselect', name, message }),
  };
  const jsonQuestions = (flags: ExportCommandOptions) =>
    flagQuestions<ExportCommandOptions, ExportPromptContext>(EXPORT_FLAGS, flags, context).filter((question) =>
      exportFields.some((key) => key === question.name),
    );
  const visibleNames = (questions: ReturnType<typeof jsonQuestions>, answers: ExportCommandOptions) =>
    questions
      .filter((question) =>
        typeof question.type === 'function' ? question.type(undefined, answers, question) : question.type,
      )
      .map((question) => question.name);

  it('uses answer-supplied format on each evaluation: XLIFF, then JSON', () => {
    const questions = jsonQuestions({});
    expect(visibleNames(questions, { format: 'xliff' })).toEqual([]);
    expect(visibleNames(questions, { format: 'json' })).toEqual(['structure', 'rich']);
  });

  it('keeps a supplied false rich flag over a true answer', () => {
    const questions = jsonQuestions({ rich: false });
    expect(visibleNames(questions, { format: 'json', rich: true })).toEqual(['structure']);
  });

  it.each([false, true])('preserves include-base supplied while rich is answered %j', (rich) => {
    const questions = jsonQuestions({ includeBase: true });
    const answers = { format: 'json' as const, rich, includeBase: false };
    expect(visibleNames(questions, answers)).toEqual(
      rich
        ? ['structure', 'rich', 'includeStatus', 'includeComment', 'includeTags', 'basePropertyName']
        : ['structure', 'rich', 'basePropertyName'],
    );
  });
});

describe('prompt merge opt-in', () => {
  it('leaves unrelated records and their type/choices callbacks untouched', () => {
    type Options = { dependency?: string; field?: string };
    const question = {
      name: 'field',
      type: (_prev: unknown, answers: Options) => (answers.dependency === 'answer' ? ('select' as const) : null),
      choices: (_prev: unknown, answers: Options) => [{ title: String(answers.dependency), value: 'value' }],
    };
    const records = {
      dependency: { flags: '--dependency <value>' },
      field: { flags: '--field <value>', prompt: () => [question] },
    };
    const questions = flagQuestions<Options, undefined>(records, { dependency: 'flag' }, undefined);
    expect(questions[0]).toBe(question);
    expect(questions[0].type).toBe(question.type);
    expect(questions[0].choices).toBe(question.choices);
    expect(question.type(undefined, { dependency: 'answer' })).toBe('select');
    expect(question.choices(undefined, { dependency: 'answer' })).toEqual([{ title: 'answer', value: 'value' }]);
  });

  it('merges a dependency for records explicitly opting in without applicability', () => {
    type Options = { dependency?: string; field?: string };
    const records = {
      dependency: { flags: '--dependency <value>' },
      field: {
        flags: '--field <value>',
        mergePromptAnswers: true as const,
        prompt: () => [
          {
            name: 'field',
            type: (_prev: unknown, answers: Options) => (answers.dependency === 'flag' ? ('select' as const) : null),
            choices: (_prev: unknown, answers: Options) => [{ title: String(answers.dependency), value: 'value' }],
          },
        ],
      },
    };
    const [question] = flagQuestions<Options, undefined>(records, { dependency: 'flag' }, undefined);
    const answers = { dependency: 'answer' };
    expect(typeof question.type === 'function' ? question.type(undefined, answers, question) : question.type).toBe(
      'select',
    );
    expect(
      typeof question.choices === 'function' ? question.choices(undefined, answers, question) : question.choices,
    ).toEqual([{ title: 'flag', value: 'value' }]);
  });
});
