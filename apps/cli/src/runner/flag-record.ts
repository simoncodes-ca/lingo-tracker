import { type Command, Option } from 'commander';
import type prompts from 'prompts';
import { parseListSelection, parseNameSelection, type Selection } from '../utils/prompt-utils';
import { choiceOption, commaListOption, type OptionSpec, option, repeatableListOption } from './options';

/** A flag or positional value, including the conversion applied at the Commander boundary. */
type FlagFields = Omit<OptionSpec<unknown>, 'parse'> & {
  readonly positive?: { readonly flags: string; readonly description: string };
  /** Applied after parsing; unlike defaultValue, this does not change help. */
  readonly runtimeDefault?: unknown;
  readonly selection?: SelectionRecord;
  /** Resolver fallback for an optional-value flag present without its value. */
  readonly implicitValue?: string;
};

export type FlagRecord =
  | (FlagFields &
      (
        | {
            readonly list: 'optional' | 'clear' | 'preserve' | 'repeatable';
            readonly choices?: never;
            readonly parse?: never;
          }
        | { readonly choices: readonly string[]; readonly list?: never; readonly parse?: never }
        | { readonly list?: never; readonly choices?: never; readonly parse?: (value: string) => unknown }
      ))
  | { readonly argument: readonly [name: string, description: string] };

export type PromptFactory<Options, Context> = (
  options: Options,
  context: Context,
  defaultValue: string | boolean | undefined,
) => prompts.PromptObject[];

/** Every Options key has exactly one record. Object literals reject extra keys as well. */
export type FlagRecords<Options, Context = never, PromptAnswers = Options> = {
  readonly [Key in keyof Required<Options>]: FlagRecord & {
    readonly selection?: SelectionRecord<Options, PromptAnswers>;
    readonly prompt?: PromptFactory<Options, Context>;
    readonly promptOrder?: number;
    /** Gates questions; diagnostic factories can also reuse this predicate. */
    readonly appliesWhen?: (values: Options) => boolean;
    /** Diagnostic for a supplied value; may cover more cases than the prompt gate. */
    readonly inapplicableMessage?: (values: Options) => string | undefined;
    /** Opt dynamic type/choices callbacks into flag-over-answer precedence. */
    readonly mergePromptAnswers?: true;
  };
};

/** Per-field resolution preserves the exact result type without a prompt context. */
export type ResolvingFlagRecords<
  Options,
  Context,
  Results extends Record<keyof Required<Options>, object>,
  Values = Options,
> = {
  readonly [Key in keyof Required<Options>]: Extract<FlagRecord, { readonly flags: string }> &
    FlagRecords<Options, Context, Values>[Key] & {
      readonly resolve: (values: Values, defaultValue: string | boolean | undefined) => Results[Key];
    };
};

/** Prompt dependency order is explicit when it differs from registration order. */
export type OrderedResolvingFlagRecords<Options, Context, Results extends Record<keyof Required<Options>, object>> = {
  readonly [Key in keyof Required<Options>]: ResolvingFlagRecords<Options, Context, Results>[Key] &
    (
      | { readonly prompt: PromptFactory<Options, Context>; readonly promptOrder: number }
      | { readonly prompt?: never; readonly promptOrder?: never }
    );
};

function flagDefault(record: FlagRecord): string | boolean | undefined {
  if ('argument' in record) return undefined;
  const value = record.helpDefault ?? record.defaultValue ?? record.runtimeDefault;
  return typeof value === 'string' || typeof value === 'boolean' ? value : undefined;
}

export function resolveFlag<Values, Resolved>(
  record: FlagRecord & { readonly resolve: (values: Values, defaultValue: string | boolean | undefined) => Resolved },
  values: Values,
): Resolved {
  return record.resolve(values, flagDefault(record));
}

/** Enforce both directions even for records assembled with object spreads. */
export function defineFlags<Options, Context = never, PromptAnswers = Options>() {
  return <const Records extends FlagRecords<Options, Context, PromptAnswers>>(
    records: Records & Record<Exclude<keyof Records, keyof Options>, never>,
  ): Records => records;
}

/** Preserve record key types at the object enumeration boundary. */
function flagEntries<Options, Context, PromptAnswers>(records: FlagRecords<Options, Context, PromptAnswers>) {
  const entries = [];
  for (const key in records) {
    if (Object.getOwnPropertyDescriptor(records, key)) entries.push({ key, record: records[key] });
  }
  return entries;
}

export function flagQuestions<Options, Context>(
  records: FlagRecords<Options, Context, Record<string, unknown>>,
  options: Options,
  context: Context,
): prompts.PromptObject[] {
  const supplied = Object.fromEntries(Object.entries(options as object).filter(([, value]) => value !== undefined));
  const merged = (answers: object): Options => ({ ...answers, ...supplied }) as Options;
  return flagEntries(records)
    .map(({ key, record }, index) => ({ key, record, order: record.promptOrder ?? index }))
    .sort((left, right) => left.order - right.order)
    .flatMap(({ key, record }) => {
      if (record.appliesWhen && key in supplied) return [];
      const questions = record.prompt?.(options, context, flagDefault(record)) ?? [];
      if (record.appliesWhen === undefined && record.mergePromptAnswers !== true) return questions;
      return questions.map((question) => {
        const type = question.type;
        const choices = question.choices;
        return {
          ...question,
          ...(record.appliesWhen || typeof type === 'function'
            ? {
                type: (prev: unknown, answers: object, prompt: prompts.PromptObject) => {
                  const values = merged(answers);
                  if (record.appliesWhen && record.appliesWhen(values) === false) return null;
                  return typeof type === 'function' ? type(prev, values, prompt) : type;
                },
              }
            : {}),
          ...(typeof choices === 'function'
            ? {
                choices: (prev: unknown, answers: object, prompt: prompts.PromptObject) =>
                  choices(prev, merged(answers), prompt),
              }
            : {}),
        };
      });
    });
}

/** Supplied values remain intact; applicability only adds diagnostics. */
export function flagAdvisories<Options>(
  records: FlagRecords<Options, never, Record<string, unknown>>,
  values: NoInfer<Options>,
): string[] {
  const advisories: string[] = [];
  for (const { key, record } of flagEntries(records)) {
    if (values[key] === undefined) continue;
    const message = record.inapplicableMessage?.(values);
    if (message) advisories.push(message);
  }
  return advisories;
}

type PromptFree<Record> = Record extends unknown ? Omit<Record, 'prompt' | 'promptOrder'> : never;

/** Command-specific question builders consume prompts separately from runner flags. */
export function withoutFlagPrompts<Records extends Readonly<Record<string, FlagRecord>>>(
  records: Records,
): { readonly [Key in keyof Records]: PromptFree<Records[Key]> } {
  return Object.fromEntries(
    Object.entries(records).map(([key, record]) => {
      const {
        prompt: _prompt,
        promptOrder: _promptOrder,
        ...fields
      } = record as FlagRecord & {
        readonly prompt?: unknown;
        readonly promptOrder?: number;
      };
      return [key, fields];
    }),
  ) as unknown as { readonly [Key in keyof Records]: PromptFree<Records[Key]> };
}

export function registerFlags(command: Command, records: Readonly<Record<string, FlagRecord>>): void {
  for (const record of Object.values(records)) {
    if ('argument' in record) {
      command.argument(...record.argument);
    } else {
      if (record.positive) option({ ...record, ...record.positive })(command);
      const registration = record.positive ? { flags: record.flags, description: record.description } : record;
      if (record.choices)
        choiceOption(
          record.flags,
          record.description ?? '',
          [...record.choices],
          typeof record.defaultValue === 'string' ? record.defaultValue : undefined,
        )(command);
      else if (record.list === 'repeatable') repeatableListOption(record.flags, record.description ?? '')(command);
      else if (record.list)
        commaListOption({ ...record, empty: record.list === 'optional' ? undefined : record.list })(command);
      else option(registration)(command);
    }
  }
}

/** Handler values use only record keys, independent of Commander camel-casing. */
export function flagValues(
  records: Readonly<Record<string, FlagRecord>>,
  raw: Record<string, unknown>,
  args: readonly unknown[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const attributes = new Set(Object.keys(raw));
  let index = 0;
  for (const [key, record] of Object.entries(records)) {
    if ('argument' in record) values[key] = args[index++];
    else {
      const attribute = new Option(record.flags).attributeName();
      if (attributes.has(attribute)) {
        // Commander retains raw '' when commaListOption returns undefined.
        // Optional list handlers receive the declared array-or-undefined value.
        values[key] = record.list === 'optional' && raw[attribute] === '' ? undefined : raw[attribute];
      }
    }
  }
  return values;
}

/** Selection metadata keeps prompt-only answer names at the input boundary. */
export interface SelectionRecord<Options = Record<string, unknown>, PromptAnswers = Options> {
  readonly prompt?: keyof PromptAnswers & string;
  readonly allFlag?: keyof Options & string;
  readonly defaultAll?: boolean;
  readonly emptyFlagFallsBack?: boolean;
  readonly emptyPromptError?: string;
}

/** Decode selections from flag records. */
function resolveSelection(
  record: Extract<FlagRecord, { readonly flags: string }>,
  flag: unknown,
  input: object,
): Selection | undefined {
  const selection = record.selection;
  if (!selection) return undefined;
  const answers = input as Readonly<Record<string, unknown>>;
  const answer = selection.prompt ? answers[selection.prompt] : undefined;
  if (Array.isArray(answer) && answer.length === 0 && selection.emptyPromptError)
    throw new Error(selection.emptyPromptError);
  const prompt = parseNameSelection(undefined, answer);
  if (selection.allFlag && (answers[selection.allFlag] === true || prompt?.kind === 'all')) return { kind: 'all' };
  const selected = !record.list
    ? parseNameSelection(typeof flag === 'string' ? flag : undefined, answer)
    : parseListSelection(typeof flag === 'string' || Array.isArray(flag) ? flag : undefined, answer);
  return (
    selected ??
    (selection.emptyFlagFallsBack ? prompt : undefined) ??
    (selection.defaultAll ? { kind: 'all' } : undefined)
  );
}

/** Resolve parsed values under record keys, for both production and command tests. */
export function resolveFlagValues<Options extends object = Record<string, unknown>>(
  records: Readonly<Record<string, FlagRecord>>,
  input: object,
  submitted: object = {},
): { values: Options; selections: Partial<Record<keyof Options, Selection>> } {
  const values: Record<string, unknown> = {};
  const selections: Partial<Record<keyof Options, Selection>> = {};
  const raw = input as Readonly<Record<string, unknown>>;
  const answers = { ...raw, ...submitted };
  for (const [key, record] of Object.entries<FlagRecord>(records)) {
    let value = answers[key];
    if ('flags' in record) {
      if (value === true && record.implicitValue !== undefined) value = record.implicitValue;
      // Mirror Commander defaults so runCommand receives production values.
      const fallback =
        record.runtimeDefault ??
        record.defaultValue ??
        (record.list === 'repeatable' ? [] : new Option(record.flags).negate && !record.positive ? true : undefined);
      if (value === undefined && fallback !== undefined) value = Array.isArray(fallback) ? [...fallback] : fallback;
      if (record.selection) {
        const selection = resolveSelection(record, raw[key] ?? value, answers);
        if (selection) selections[key as keyof Options] = selection;
      }
    }
    if (value !== undefined || key in answers) values[key] = value;
  }
  // The records enforce every Options key; parsed inputs are checked at their transport boundary.
  return { values: values as Options, selections };
}

/** Long spelling for user-facing advice; placeholders and short aliases are omitted. */
export function flagName(record: { readonly flags: string }): string {
  return record.flags.match(/--[\w-]+/)?.[0] ?? record.flags.split(' ')[0];
}

export const collectionFlag = (description = 'Name of the collection') => ({
  flags: '--collection <name>',
  description,
});
export const localeFlag = (description: string) => ({ flags: '--locale <locale>', description });
export const yesFlag = { flags: '--yes', description: 'Skip confirmation prompt' };
export const tokenCasingFlag = {
  flags: '--token-casing <casing>',
  description: 'Token property key casing',
  choices: ['upperCase', 'camelCase'],
};
export const collectionSetupFlags = {
  collectionName: { flags: '--collection-name <name>', description: 'Name for the translation collection' },
  translationsFolder: { flags: '--translations-folder <path>' },
  exportFolder: { flags: '--export-folder <path>', description: 'dist/lingo-export' },
  importFolder: { flags: '--import-folder <path>', description: 'dist/lingo-import' },
  baseLocale: { flags: '--base-locale <locale>', description: 'en' },
  locales: { flags: '--locales <locales...>', description: 'supported locales' },
};
export const setupBundleFlag = {
  flags: '--setup-bundle <bool>',
  description: 'Setup bundle configuration during init (true/false)',
  parse: (value: string) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${flagName(setupBundleFlag)} must be "true" or "false", got "${value}"`);
  },
};
export const addResourceFlags = {
  key: { flags: '--key <key>', description: 'Resource key (dot-delimited, e.g., apps.common.buttons.ok)' },
  value: { flags: '--value <value>', description: 'Base value (source text)' },
  comment: { flags: '--comment <comment>', description: 'Optional context for translators' },
  tags: { flags: '--tags <tags>', description: 'Optional tags (comma-separated)', list: 'optional' as const },
  targetFolder: { flags: '--target-folder <folder>', description: 'Optional target folder (dot-delimited)' },
};
export const editResourceFlags = {
  key: { flags: '--key <key>', description: 'Resource key (dot-delimited)' },
  baseValue: { flags: '--base-value <value>', description: 'New base value (source text)' },
  comment: { flags: '--comment <comment>', description: 'New comment' },
  tags: { flags: '--tags <tags>', description: 'New tags (comma-separated)', list: 'optional' as const },
  targetFolder: {
    flags: '--target-folder <folder>',
    description: 'Move the resource into this folder (dot-delimited; "" for the collection root)',
  },
};
