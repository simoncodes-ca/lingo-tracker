import { DEFAULT_CONFIG } from '@simoncodes-ca/core';
import { describe, expect, it, vi } from 'vitest';
import { type Ask, CommandCancelledError } from '../runner/command-runner';
import type { InitOptions } from '../types/init-options';
import {
  collectionSetupQuestions,
  confirmOrCancel,
  missingTextQuestions,
  parseListSelection,
  parseNameSelection,
  requiredText,
  type Selection,
  selectionNames,
  selectionPrompt,
} from './prompt-utils';

const ALL_ITEMS_SENTINEL = '__ALL__';

describe('selectionPrompt', () => {
  it('should have the correct sentinel value', () => {
    expect(
      selectionPrompt({ mode: 'single', name: 'items', message: 'Select items', choices: [], allTitle: 'All items' }),
    ).toMatchObject({
      choices: [{ title: 'All items', value: '__ALL__' }],
    });
  });
});

describe('prompt selections', () => {
  it('should return selected items when specific items are chosen', () => {
    const result = selectionNames(parseListSelection(undefined, ['en', 'fr']));
    expect(result).toEqual(['en', 'fr']);
  });

  it('should return undefined when __ALL__ is selected', () => {
    const result = selectionNames(parseListSelection(undefined, [ALL_ITEMS_SENTINEL]));
    expect(result).toBeUndefined();
  });

  it('should return undefined when __ALL__ plus other items are selected (All takes precedence)', () => {
    const result = selectionNames(parseListSelection(undefined, [ALL_ITEMS_SENTINEL, 'en', 'fr']));
    expect(result).toBeUndefined();
  });

  it('should return undefined when __ALL__ is in the middle of selections', () => {
    const result = selectionNames(parseListSelection(undefined, ['en', ALL_ITEMS_SENTINEL, 'fr']));
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty array', () => {
    const result = selectionNames(parseListSelection(undefined, []));
    expect(result).toBeUndefined();
  });

  it('should return undefined for undefined input', () => {
    const result = selectionNames(parseListSelection(undefined, undefined));
    expect(result).toBeUndefined();
  });

  it('should return single item in array when one item is selected', () => {
    const result = selectionNames(parseListSelection(undefined, ['en']));
    expect(result).toEqual(['en']);
  });

  it('should return all items when all are manually selected (no __ALL__)', () => {
    const result = selectionNames(parseListSelection(undefined, ['en', 'fr', 'de', 'es']));
    expect(result).toEqual(['en', 'fr', 'de', 'es']);
  });

  it('should preserve order of selected items', () => {
    const result = selectionNames(parseListSelection(undefined, ['es', 'en', 'de']));
    expect(result).toEqual(['es', 'en', 'de']);
  });

  it('should handle empty available items list', () => {
    const result = selectionNames(parseListSelection(undefined, ['en', 'fr']));
    expect(result).toEqual(['en', 'fr']);
  });

  it('should return undefined when __ALL__ is selected with empty available items', () => {
    const result = selectionNames(parseListSelection(undefined, [ALL_ITEMS_SENTINEL]));
    expect(result).toBeUndefined();
  });
});

describe('name filters', () => {
  it('should return undefined for undefined input', () => {
    const result = selectionNames(parseListSelection(undefined, undefined));
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty array', () => {
    const result = selectionNames(parseListSelection(undefined, []));
    expect(result).toBeUndefined();
  });

  it('should resolve a single name', () => {
    const result = selectionNames(parseListSelection(undefined, ['en']));
    expect(result).toEqual(['en']);
  });

  it('should resolve multiple names', () => {
    const result = selectionNames(parseListSelection(undefined, ['en', 'fr', 'de']));
    expect(result).toEqual(['en', 'fr', 'de']);
  });

  it('should preserve order of items', () => {
    const result = selectionNames(parseListSelection(undefined, ['es', 'en', 'de']));
    expect(result).toEqual(['es', 'en', 'de']);
  });

  it('should handle items with special characters', () => {
    const result = selectionNames(parseListSelection(undefined, ['en-US', 'fr-FR']));
    expect(result).toEqual(['en-US', 'fr-FR']);
  });

  it('should handle many items', () => {
    const result = selectionNames(parseListSelection(undefined, ['a', 'b', 'c', 'd', 'e', 'f']));
    expect(result).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

describe('parseListSelection', () => {
  const cases: { label: string; flag?: string; answer?: unknown; expected: Selection | undefined }[] = [
    { label: 'flag only', flag: ' en, fr, ,', expected: { kind: 'some', names: ['en', 'fr'] } },
    { label: 'answer only', answer: 'main', expected: { kind: 'some', names: ['main'] } },
    { label: 'multiple answers', answer: ['en', 'fr'], expected: { kind: 'some', names: ['en', 'fr'] } },
    { label: 'single sentinel', answer: '__ALL__', expected: { kind: 'all' } },
    { label: 'sentinel with names', answer: ['en', '__ALL__', 'fr'], expected: { kind: 'all' } },
    { label: 'empty list', answer: [], expected: undefined },
    { label: 'empty flag', flag: '', expected: undefined },
    { label: 'empty answer', answer: '', expected: undefined },
    { label: 'no input', expected: undefined },
    { label: 'both supplied', flag: 'en', answer: ['fr'], expected: { kind: 'some', names: ['en'] } },
    { label: 'flag over sentinel', flag: 'en', answer: '__ALL__', expected: { kind: 'some', names: ['en'] } },
    { label: 'empty flag over answer', flag: '', answer: 'main', expected: undefined },
    { label: 'sentinel spelling in flag is a name', flag: '__ALL__', expected: { kind: 'some', names: ['__ALL__'] } },
    { label: 'comma-only flag', flag: ' , ', expected: undefined },
    { label: 'prompt list parsing', answer: [' en, fr ', '', 1], expected: { kind: 'some', names: ['en', 'fr'] } },
  ];

  for (const { label, flag, answer, expected } of cases) {
    it(label, () => {
      expect(parseListSelection(flag, answer)).toEqual(expected);
    });
  }

  it('keeps single-name flags literal for normalize and glossary', () => {
    expect(parseNameSelection(' main, admin ')).toEqual({
      kind: 'some',
      names: [' main, admin '],
    });
  });

  it('builds the existing multiselect prompt with all first and selected', () => {
    expect(
      selectionPrompt({
        name: 'collections',
        message: 'Select collections to export',
        choices: ['main'],
        allTitle: 'All Collections',
        mode: 'multiple',
      }),
    ).toEqual({
      type: 'multiselect',
      name: 'collections',
      message: 'Select collections to export',
      choices: [
        { title: 'All Collections', value: '__ALL__', selected: true },
        { title: 'main', value: 'main' },
      ],
      min: 1,
      hint: 'Space to select. Return to submit',
      instructions: false,
    });
  });

  it('builds a single selection without an all choice', () => {
    expect(
      selectionPrompt({ mode: 'single', name: 'collection', message: 'Select collection', choices: ['main'] }),
    ).toEqual({
      type: 'select',
      name: 'collection',
      message: 'Select collection',
      choices: [{ title: 'main', value: 'main' }],
    });
  });
});

describe('parseNameSelection', () => {
  const cases: { label: string; flag?: string; answer?: unknown; expected: Selection | undefined }[] = [
    { label: 'flag only', flag: ' main, admin ', expected: { kind: 'some', names: [' main, admin '] } },
    { label: 'answer only', answer: 'main', expected: { kind: 'some', names: ['main'] } },
    { label: 'sentinel', answer: '__ALL__', expected: { kind: 'all' } },
    { label: 'empty flag', flag: '', expected: undefined },
    { label: 'empty answer', answer: '', expected: undefined },
    { label: 'both supplied', flag: 'main', answer: 'admin', expected: { kind: 'some', names: ['main'] } },
    { label: 'flag beats all answer', flag: 'main', answer: '__ALL__', expected: { kind: 'some', names: ['main'] } },
    { label: 'empty flag beats answer', flag: '', answer: 'main', expected: undefined },
  ];
  for (const { label, flag, answer, expected } of cases) {
    it(label, () => {
      expect(parseNameSelection(flag, answer)).toEqual(expected);
    });
  }
});

describe('missingTextQuestions', () => {
  it.each([
    { label: 'absent', options: {}, expected: [{ type: 'text', name: 'value', message: 'Value' }] },
    {
      label: 'undefined',
      options: { value: undefined },
      expected: [{ type: 'text', name: 'value', message: 'Value' }],
    },
    { label: 'present', options: { value: 'provided' }, expected: [] },
    { label: 'empty string', options: { value: '' }, expected: [{ type: 'text', name: 'value', message: 'Value' }] },
    { label: 'whitespace flag', options: { value: ' ' }, expected: [] },
  ])('$label option', ({ options, expected }) => {
    expect(missingTextQuestions<{ value?: string }>(options, [{ name: 'value', message: 'Value' }])).toEqual(expected);
  });

  it.each([
    { value: '', expected: 'Required' },
    { value: '  ', expected: 'Required' },
    { value: 'valid', expected: true },
    { value: ' valid ', expected: true },
  ])('validates required text "$value"', ({ value, expected }) => {
    const questions = missingTextQuestions<{ value?: string }>({}, [
      { name: 'value', message: 'Value', required: true },
    ]);
    expect(questions[0]?.validate).toBe(requiredText);
    expect(requiredText(value)).toBe(expected);
  });

  it('keeps field order, initial values and custom validation', () => {
    const validate = (value: string) => value === 'allowed' || 'Not allowed';
    expect(
      missingTextQuestions({ first: undefined, supplied: 'flag', last: undefined }, [
        { name: 'first', message: 'First', initial: 'default', required: true },
        { name: 'supplied', message: 'Supplied' },
        { name: 'last', message: 'Last', required: true, validate },
      ]),
    ).toEqual([
      { type: 'text', name: 'first', message: 'First', initial: 'default', validate: requiredText },
      { type: 'text', name: 'last', message: 'Last', validate },
    ]);
  });
});

describe('collectionSetupQuestions', () => {
  it.each([
    { label: 'add-collection', defaults: {}, nameInitial: {} },
    { label: 'init', defaults: { collectionName: 'Main' }, nameInitial: { initial: 'Main' } },
  ])('preserves $label messages, order and defaults', ({ defaults, nameInitial }) => {
    expect(collectionSetupQuestions({}, defaults)).toEqual([
      { type: 'text', name: 'collectionName', message: 'Collection name', ...nameInitial, validate: requiredText },
      { type: 'text', name: 'translationsFolder', message: 'Path to translations folder', validate: requiredText },
      { type: 'text', name: 'exportFolder', message: 'Export folder', initial: DEFAULT_CONFIG.exportFolder },
      { type: 'text', name: 'importFolder', message: 'Import folder', initial: DEFAULT_CONFIG.importFolder },
      {
        type: 'text',
        name: 'baseLocale',
        message: 'Base locale',
        initial: DEFAULT_CONFIG.baseLocale,
        validate: requiredText,
      },
      {
        type: 'list',
        name: 'locales',
        message: 'Supported locales (comma-separated)',
        initial: 'en,fr-ca,es,de',
        separator: ',',
      },
    ]);
  });

  const cases: { label: string; options: InitOptions; names: string[] }[] = [
    {
      label: 'all supplied',
      options: {
        collectionName: 'main',
        translationsFolder: 'translations',
        exportFolder: 'export',
        importFolder: 'import',
        baseLocale: 'fr',
        locales: ['fr'],
      },
      names: [],
    },
    {
      label: 'empty text flags',
      options: { collectionName: '', translationsFolder: '', exportFolder: '', importFolder: '', baseLocale: '' },
      names: ['collectionName', 'translationsFolder', 'exportFolder', 'importFolder', 'baseLocale', 'locales'],
    },
    {
      label: 'partial flags',
      options: { collectionName: 'main', baseLocale: 'fr' },
      names: ['translationsFolder', 'exportFolder', 'importFolder', 'locales'],
    },
    {
      label: 'empty locale array is supplied',
      options: { locales: [] },
      names: ['collectionName', 'translationsFolder', 'exportFolder', 'importFolder', 'baseLocale'],
    },
  ];
  it.each(cases)('$label', ({ options, names }) => {
    expect(collectionSetupQuestions(options).map((question) => question.name)).toEqual(names);
  });
});

describe('confirmOrCancel', () => {
  it.each([
    { label: 'confirmed', answer: { confirmed: true }, cancelled: false },
    { label: 'declined', answer: { confirmed: false }, cancelled: true },
    { label: 'missing answer', answer: {}, cancelled: true },
    { label: 'truthy answer is not consent', answer: { confirmed: 'yes' }, cancelled: true },
  ])('$label', async ({ answer, cancelled }) => {
    const ask = vi.fn<Ask>().mockResolvedValue(answer);
    const beforeAsk = vi.fn();
    const result = confirmOrCancel({ ask, interactive: true, message: 'Are you sure?', beforeAsk });
    if (cancelled) await expect(result).rejects.toBeInstanceOf(CommandCancelledError);
    else await expect(result).resolves.toBeUndefined();
    expect(ask).toHaveBeenCalledExactlyOnceWith({
      type: 'confirm',
      name: 'confirmed',
      message: 'Are you sure?',
      initial: false,
    });
    expect(beforeAsk).toHaveBeenCalledOnce();
    expect(beforeAsk.mock.invocationCallOrder[0]).toBeLessThan(ask.mock.invocationCallOrder[0]);
  });

  it.each([
    { label: '--yes', interactive: true, yes: true },
    { label: 'non-interactive', interactive: false, yes: false },
    { label: 'non-interactive with --yes', interactive: false, yes: true },
  ])('skips $label confirmation and explanation', async ({ interactive, yes }) => {
    const ask = vi.fn<Ask>();
    const beforeAsk = vi.fn();
    await expect(confirmOrCancel({ ask, interactive, yes, message: 'Confirm', beforeAsk })).resolves.toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
    expect(beforeAsk).not.toHaveBeenCalled();
  });

  it('propagates a prompt cancellation from the runner', async () => {
    const error = new CommandCancelledError();
    const ask = vi.fn<Ask>().mockRejectedValue(error);
    await expect(confirmOrCancel({ ask, interactive: true, yes: false, message: 'Confirm' })).rejects.toBe(error);
  });
});
