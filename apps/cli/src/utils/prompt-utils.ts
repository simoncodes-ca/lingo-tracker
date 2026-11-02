import { DEFAULT_CONFIG } from '@simoncodes-ca/domain';
import type prompts from 'prompts';
import { CommandCancelledError } from '../runner/command-cancelled-error';
import type { Ask } from '../runner/command-runner';
import type { InitOptions } from '../types/init-options';
import { parseCommaSeparatedList } from './string-parsers';

/** The CLI choice of one, several, or all named items. */
export type Selection = { readonly kind: 'all' } | { readonly kind: 'some'; readonly names: string[] };

/** Private prompt value; flags can still name an item with this spelling. */
const ALL_ITEMS_SENTINEL = '__ALL__';

interface SelectionPromptOptions {
  readonly name: string;
  readonly message: string;
  readonly choices: readonly string[];
  /** Omit this title for a prompt without an all choice. */
  readonly allTitle?: string;
  readonly mode: 'single' | 'multiple';
}

/** Builds the CLI's single or multiple selection prompt, with its existing all-choice order and defaults. */
export function selectionPrompt(options: SelectionPromptOptions): prompts.PromptObject {
  const choices: prompts.Choice[] = options.choices.map((name) => ({ title: name, value: name }));
  if (options.allTitle) {
    const all = { title: options.allTitle, value: ALL_ITEMS_SENTINEL };
    if (options.mode === 'multiple') choices.unshift({ ...all, selected: true });
    else choices.push(all);
  }
  return options.mode === 'multiple'
    ? {
        type: 'multiselect',
        name: options.name,
        message: options.message,
        choices,
        min: 1,
        hint: 'Space to select. Return to submit',
        instructions: false,
      }
    : { type: 'select', name: options.name, message: options.message, choices };
}

/** Resolves a literal single-name flag or prompt answer. A supplied flag takes precedence, including an empty flag. */
export function parseNameSelection(flagValue: string | undefined, answerValue?: unknown): Selection | undefined {
  if (flagValue !== undefined) return namedSelection(flagValue ? [flagValue] : undefined);
  return parsePromptSelection(answerValue);
}

/** Resolves a comma-list flag or prompt answer. A supplied flag takes precedence, including an empty flag. */
export function parseListSelection(
  flagValue: string[] | string | undefined,
  answerValue?: unknown,
): Selection | undefined {
  if (flagValue !== undefined) {
    return namedSelection(typeof flagValue === 'string' ? parseCommaSeparatedList(flagValue) : flagValue);
  }
  return parsePromptSelection(answerValue);
}

/** Decodes the private all choice; multiple answers retain the existing comma-list parsing. */
function parsePromptSelection(answerValue: unknown): Selection | undefined {
  if (answerValue === ALL_ITEMS_SENTINEL) return { kind: 'all' };
  if (typeof answerValue === 'string') return namedSelection(answerValue ? [answerValue] : undefined);
  if (!Array.isArray(answerValue)) return undefined;
  const names = answerValue.filter((item): item is string => typeof item === 'string');
  if (names.includes(ALL_ITEMS_SENTINEL)) return { kind: 'all' };
  return namedSelection(names.flatMap((name) => parseCommaSeparatedList(name) ?? []));
}

/** Empty input has no selection; the command decides whether it defaults to all or fails. */
function namedSelection(names: string[] | undefined): Selection | undefined {
  return names && names.length > 0 ? { kind: 'some', names } : undefined;
}

/** Maps a Selection to core's optional name filter: undefined means all. */
export function selectionNames(selection: Selection | undefined): string[] | undefined {
  return selection?.kind === 'some' ? selection.names : undefined;
}

/** The required text rule, also used by conditional text prompts. */
export function requiredText(value: string): true | 'Required' {
  return value && value.trim().length > 0 ? true : 'Required';
}

interface TextField<Name extends string> {
  readonly name: Name;
  readonly message: string;
  readonly required?: boolean;
  readonly initial?: prompts.PromptObject['initial'];
  readonly validate?: prompts.PromptObject['validate'];
}

/** Empty strings are missing, matching the commands' existing text prompt rule. */
export function missingTextQuestions<Options extends object>(
  options: Options,
  fields: readonly TextField<keyof Options & string>[],
): prompts.PromptObject[] {
  return fields
    .filter((field) => !options[field.name])
    .map(({ required, validate: customValidate, ...field }) => {
      const validate = customValidate ?? (required ? requiredText : undefined);
      return {
        type: 'text',
        ...field,
        ...(validate === undefined ? {} : { validate }),
      };
    });
}

/** Shared collection questions; init alone supplies the existing name default. */
export function collectionSetupQuestions(
  options: InitOptions,
  defaults: {
    readonly collectionName?: string;
    readonly exportFolder?: string;
    readonly importFolder?: string;
    readonly baseLocale?: string;
    readonly locales?: readonly string[];
  } = {},
): prompts.PromptObject[] {
  const questions = missingTextQuestions(options, [
    {
      name: 'collectionName',
      message: 'Collection name',
      required: true,
      ...(defaults.collectionName === undefined ? {} : { initial: defaults.collectionName }),
    },
    { name: 'translationsFolder', message: 'Path to translations folder', required: true },
    { name: 'exportFolder', message: 'Export folder', initial: defaults.exportFolder || DEFAULT_CONFIG.exportFolder },
    { name: 'importFolder', message: 'Import folder', initial: defaults.importFolder || DEFAULT_CONFIG.importFolder },
    {
      name: 'baseLocale',
      message: 'Base locale',
      initial: defaults.baseLocale || DEFAULT_CONFIG.baseLocale,
      required: true,
    },
  ]);
  if (!options.locales) {
    questions.push({
      type: 'list',
      name: 'locales',
      message: 'Supported locales (comma-separated)',
      initial: (defaults.locales ?? DEFAULT_CONFIG.locales).join(','),
      separator: ',',
    });
  }
  return questions;
}

interface ConfirmationOptions {
  readonly ask: Ask;
  readonly interactive: boolean;
  readonly yes?: boolean;
  readonly message: string;
  /** Explain the action only when the confirmation will be asked. */
  readonly beforeAsk?: () => void;
}

/** A decline cancels; explicit consent and non-interactive mode skip the question. */
export async function confirmOrCancel({
  ask,
  interactive,
  yes,
  message,
  beforeAsk,
}: ConfirmationOptions): Promise<void> {
  if (yes || !interactive) return;
  beforeAsk?.();
  const answer = await ask({ type: 'confirm', name: 'confirmed', message, initial: false });
  if (answer.confirmed !== true) throw new CommandCancelledError();
}
