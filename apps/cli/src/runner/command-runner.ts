import { readFileSync } from 'node:fs';
import {
  CONFIG_FILENAME,
  type Collection,
  ConfigNotFoundError,
  ConfigParseError,
  type LingoTrackerConfig,
  loadConfig,
  type OpenedCollection,
  type OpenedProject,
  openCollection,
} from '@simoncodes-ca/core';
import * as path from 'path';
import prompts from 'prompts';
import { ConsoleFormatter } from '../utils/console-formatter';
import { type Selection, selectionPrompt } from '../utils/prompt-utils';
import { parseCommaSeparatedList } from '../utils/string-parsers';
import { printCliError } from './cli-error-wording';
import { CommandCancelledError } from './command-cancelled-error';
import { type CommandOutputSink, withCommandOutput } from './command-output';
import { type FlagRecords, flagName, flagQuestions, resolveFlagValues } from './flag-record';
import { isInteractiveTerminal } from './terminal';

export { CommandCancelledError } from './command-cancelled-error';

/**
 * What a command needs opened before it runs.
 * - `'writable'` — one collection, opened with `writable: true` (a read-only one fails).
 * - `'read'` — one collection, opened for reading.
 * - `'many'` — several collections, selected and opened by the runner.
 * - `'none'` — no collection; the command reads `config` itself (or nothing, with `config: false`).
 */
export type CollectionNeed = 'writable' | 'read' | 'deletable' | 'many' | 'none';

/** What `run` may return: nothing (exit 0), or `{ exitCode: 1 }` for a failure it has already reported. */
export type CommandResult = { readonly exitCode: 0 | 1 } | undefined;

/** Flags merged with prompt answers. Prompt names match option keys; extra answers are `unknown`. */
export type Answers<Options> = Options & Readonly<Record<string, unknown>>;

/** The answers `run` gets: the `required` options are present (checked by the runner). */
export type CheckedAnswers<Options, Required extends keyof Options> = Answers<Options> & {
  readonly [K in Required]-?: NonNullable<Options[K]>;
};

/** `config: false` is only allowed with `collection: 'none'`: a collection is opened from the config. */
export type ConfigFlag<Need extends CollectionNeed> = Need extends 'none' ? boolean : true;

/** Runs follow-up prompts (confirmations, loops) under the runner's cancel rule. */
export type Ask = (questions: prompts.PromptObject | prompts.PromptObject[]) => Promise<Record<string, unknown>>;

/** Input supplied to commands that accept piped text. Reading is deferred until the command needs it. */
export interface CommandStdin {
  readonly isTTY: boolean;
  read(): string;
}

interface BaseContext {
  /** Wall-clock milliseconds, injectable for verbose run timing. */
  readonly now: () => number;
  /** Optional directory for CLI-owned run summaries; production uses the system temp directory. */
  readonly summaryDirectory?: string;
  /** The explicit project root; production uses `INIT_CWD` (set by pnpm), else `process.cwd()`. */
  readonly cwd: string;
  /** The environment's interactive rule, read once; production requires stdin and stdout to be terminals. */
  readonly interactive: boolean;
  /** Prompts inside `run`. Cancelling (Ctrl+C) ends the command like any other cancel. */
  readonly ask: Ask;
  /** Explicit input adapter, defaulting to the process's terminal state and stdin file descriptor. */
  readonly stdin: CommandStdin;
}

interface ConfigResources {
  readonly config: LingoTrackerConfig;
  readonly project: OpenedProject;
  /** Absolute path of `.lingo-tracker.json`. */
  readonly configPath: string;
}

interface CollectionResources {
  /** The collection named by the collection flag (or selected), opened by core `openCollection`. */
  readonly collection: OpenedCollection;
}

interface ManyCollectionResources {
  /** All configured collections for building interactive questions; the final selection is in `run`. */
  readonly collections: Collection[];
}

type Resources<Need extends CollectionNeed, WithConfig extends boolean> = (WithConfig extends true
  ? ConfigResources
  : unknown) &
  (Need extends 'many' ? ManyCollectionResources : Need extends 'none' ? unknown : CollectionResources);

/** What `prompts` receives: everything but the answers. */
export type PromptContext<Need extends CollectionNeed, WithConfig extends boolean = true> = BaseContext &
  Resources<Need, WithConfig>;

/** What `preflight` receives: opened resources and flags, before prompt answers exist. */
export type PreflightContext<Options, Need extends CollectionNeed, WithConfig extends boolean = true> = PromptContext<
  Need,
  WithConfig
> & { readonly options: Options };

/** Only many-collection commands receive a resolved Selection. */
type SelectionResources<Need extends CollectionNeed> = Need extends 'many'
  ? { readonly selection: Selection }
  : Readonly<Record<never, never>>;

/** What `run` receives. */
export type CommandContext<
  Options,
  Need extends CollectionNeed,
  WithConfig extends boolean = true,
  Required extends keyof Options = never,
  Prepared = void,
> = PromptContext<Need, WithConfig> & {
  /** The value returned by this invocation's preflight, before prompts. */
  readonly preflight: Prepared;
  readonly answers: CheckedAnswers<Options, Required>;
  readonly selections: Partial<Record<keyof Options, Selection>>;
} & SelectionResources<Need>;

export interface CommandSpec<
  Options extends object,
  Need extends CollectionNeed,
  WithConfig extends boolean,
  Required extends keyof Options & string = never,
  Prepared = void,
> {
  /** Operation name for messages: `❌ <name> cancelled.` */
  readonly name: string;
  readonly collection: Need;
  readonly flags?: FlagRecords<Options, PromptContext<Need, WithConfig>, Record<string, unknown>>;
  /** Option holding the collection name (default `collection`); named in the missing-option message. */
  readonly collectionOption?: keyof Options & string;
  /** Selection is evaluated after prompts; every collection is opened for reading. */
  readonly many?: Need extends 'many'
    ? {
        readonly select?: (
          answers: Answers<Options>,
          ctx: PromptContext<Need, WithConfig>,
          selections: Partial<Record<keyof Options, Selection>>,
        ) => Selection | Promise<Selection>;
      }
    : never;
  /**
   * `false` skips loading `.lingo-tracker.json` (only `init` and `install-skill`). Only
   * allowed with `collection: 'none'`; anything else does not compile.
   */
  readonly config?: WithConfig;
  /**
   * Checks command preconditions after resources open and before questions are built,
   * in both modes. Returns the value passed to `run` as `preflight`.
   * Throw to fail through the runner's normal error reporting.
   */
  readonly preflight?: (ctx: PreflightContext<Options, Need, WithConfig>) => Prepared | Promise<Prepared>;
  /**
   * Questions for missing values. Called in both modes, after `preflight` and before
   * `required` is checked. Existing builders may throw to fail early (for example
   * "nothing to choose from"); command preconditions belong in `preflight`.
   * The questions are asked only when interactive.
   */
  readonly prompts?: (
    options: Options,
    ctx: PromptContext<Need, WithConfig>,
  ) => prompts.PromptObject[] | Promise<prompts.PromptObject[]>;
  /**
   * Options that must have a value before `run`: checked after the questions when
   * interactive, and against the flags when not. `undefined`, `null` and `''` count as
   * missing. `run` sees them typed as present.
   */
  readonly required?: readonly Required[];
  /** Text prompt fields that use the same comma parser as flag definitions. */
  readonly commaListAnswers?: readonly (keyof Options & string)[];
  /** Formats an untyped error after shared core wording; keeps the original error and cause. */
  readonly formatError?: (error: unknown, duringRun: boolean) => string | undefined;
  /** The core call(s) and the output. Throw to fail with `❌ <message>`. */
  readonly run: (
    ctx: CommandContext<Options, Need, WithConfig, Required, Prepared>,
  ) => Promise<CommandResult> | Promise<void> | CommandResult | void;
}

/**
 * Throws `Missing required options[ in non-interactive mode]: --a, --b` when any of
 * `fields` is `undefined`, `null` or `''`. The runner uses it for `required`; a command
 * whose required options depend on its state (`init`) calls it itself.
 */
export function requireOptions<Options extends object, Field extends keyof Options & string>(
  values: Options,
  fields: readonly Field[],
  interactive: boolean,
  records?: FlagRecords<Options, never, Record<string, unknown>>,
): asserts values is Options & { readonly [K in Field]-?: NonNullable<Options[K]> } {
  const missing = fields.filter((field) => isMissing(values[field]));
  if (missing.length > 0) {
    const mode = interactive ? '' : ' in non-interactive mode';
    throw new Error(
      `Missing required options${mode}: ${missing
        .map((field) => {
          const record = records?.[field];
          return record && 'flags' in record ? flagName(record) : toFlag(field);
        })
        .join(', ')}`,
    );
  }
}

/** The project root: `INIT_CWD` (set by pnpm to where the command was typed), else `process.cwd()`. */
function getCwd(): string {
  return process.env.INIT_CWD || process.cwd();
}

/** Explicit execution environment; omitted prompts cannot read the terminal. */
export interface CommandEnvironment {
  readonly now?: () => number;
  readonly cwd: string;
  readonly interactive?: boolean;
  readonly ask?: Ask;
  /** Optional input adapter; production reads process.stdin only when a command requests input. */
  readonly stdin?: CommandStdin;
  /** Optional live output adapter; captured output is returned even when this is supplied. */
  readonly output?: CommandOutputSink;
  /** Tests can keep CLI-owned summary files inside their temporary project. */
  readonly summaryDirectory?: string;
}

export interface CommandExecution {
  readonly exitCode: 0 | 1;
  readonly stdout: string;
  readonly stderr: string;
}

export interface DefinedCommand<Options extends object> {
  (options: Options): Promise<void>;
  readonly execute: (options: Options, environment: CommandEnvironment) => Promise<0 | 1>;
}

/** Runs the same pipeline as the production action, without changing process state. */
export async function runCommand<Options extends object>(
  command: DefinedCommand<Options>,
  options: Options,
  environment: CommandEnvironment,
): Promise<CommandExecution> {
  let stdout = '';
  let stderr = '';
  const sink: CommandOutputSink = {
    stdout: (text) => {
      stdout += text;
      environment.output?.stdout(text);
    },
    stderr: (text) => {
      stderr += text;
      environment.output?.stderr(text);
    },
  };
  const exitCode = await withCommandOutput({ sink }, () => command.execute(options, environment));
  return { exitCode, stdout, stderr };
}

/**
 * Defines a CLI command. The returned function is what `main.ts` calls with the parsed
 * Commander options. Curried so the options type is given and the rest is inferred:
 *
 * ```ts
 * export const addLocaleCommand = defineCommand<AddLocaleOptions>()({
 *   name: 'Add locale',
 *   collection: 'writable',
 *   prompts: (options) => (options.locale ? [] : [{ type: 'text', name: 'locale', message: 'Locale' }]),
 *   required: ['locale'],
 *   run: async ({ collection, answers }) => { ... },
 * });
 * ```
 *
 * The runner owns, in order: the project root and the interactive rule; loading the
 * config; resolving and opening the collection; preflight; asking the questions;
 * checking the required options; cancellation; and turning a thrown error into `❌ <message>` (plus its `cause`'s
 * message when that is an Error) and exit code 1. It sets `process.exitCode` and returns; it never calls `process.exit()`.
 */
export function defineCommand<Options extends object>() {
  return <
    const Need extends CollectionNeed,
    const WithConfig extends ConfigFlag<Need> = true,
    const Required extends keyof Options & string = never,
    Prepared = void,
  >(
    spec: CommandSpec<Options, Need, WithConfig, Required, Prepared>,
  ): DefinedCommand<Options> => {
    const command = async (options: Options): Promise<void> => {
      // With no capture scope, the output port uses the real console/streams.
      process.exitCode = await execute(spec, options, {
        cwd: getCwd(),
        interactive: isInteractiveTerminal(),
        ask,
      });
    };
    return Object.assign(command, {
      execute: (options: Options, environment: CommandEnvironment) => execute(spec, options, environment),
    });
  };
}

async function execute<
  Options extends object,
  Need extends CollectionNeed,
  WithConfig extends boolean,
  Required extends keyof Options & string,
  Prepared,
>(
  spec: CommandSpec<Options, Need, WithConfig, Required, Prepared>,
  options: Options,
  environment: CommandEnvironment,
): Promise<0 | 1> {
  let duringRun = false;
  try {
    const { cwd, interactive = false } = environment;
    const ask: Ask =
      environment.ask ??
      (async () => {
        throw new Error('Interactive commands require an ask adapter.');
      });
    let resources: Partial<ConfigResources & CollectionResources & ManyCollectionResources> = {};

    if (spec.config !== false) {
      const config = readConfig(cwd);
      resources = {
        config,
        configPath: path.join(cwd, CONFIG_FILENAME),
        project: { projectRoot: cwd, sourceConfig: config },
      };

      if (spec.collection === 'many') {
        const names = Object.keys(config.collections ?? {});
        if (names.length === 0) throw new Error(NO_COLLECTIONS_MESSAGE);
        resources = { ...resources, collections: names.map((name) => openCollection(config, name, { cwd })) };
      } else if (spec.collection !== 'none') {
        const flag = spec.collectionOption ?? 'collection';
        const given: unknown = options[flag as keyof Options];
        const name =
          typeof given === 'string' && given.length > 0
            ? given
            : await selectCollection(config, interactive, flag, ask, spec.flags?.[flag as keyof Options]);
        resources = {
          ...resources,
          collection: openCollection(config, name, {
            cwd,
            writable: spec.collection === 'writable',
            forDeletion: spec.collection === 'deletable',
          }),
        };
      }
    }

    // `resources` holds exactly what Need and WithConfig promise; the type cannot follow the branches above.
    const promptContext = {
      now: environment.now ?? Date.now,
      cwd,
      interactive,
      ask,
      stdin: environment.stdin ?? {
        isTTY: Boolean(process.stdin.isTTY),
        read: () => readFileSync(0, 'utf8'),
      },
      summaryDirectory: environment.summaryDirectory,
      ...resources,
    } as PromptContext<Need, WithConfig>;

    const preflight = await spec.preflight?.({ ...promptContext, options });
    const questions = [
      ...(spec.flags ? flagQuestions(spec.flags, options, promptContext) : []),
      ...(spec.prompts ? await spec.prompts(options, promptContext) : []),
    ];
    const merged: Options =
      interactive && questions.length > 0 ? { ...options, ...(await ask(questions)) } : { ...options };
    for (const field of spec.commaListAnswers ?? []) {
      const value = merged[field];
      if (typeof value === 'string') {
        Object.assign(merged, { [field]: parseCommaSeparatedList(value) });
      }
    }
    // Resolve once after prompts, when both flags and submitted selection answers are available.
    const resolved = spec.flags
      ? resolveFlagValues<Options>(spec.flags, options as Record<string, unknown>, merged as Record<string, unknown>)
      : { values: merged, selections: {} };
    requireOptions(resolved.values, spec.required ?? [], interactive, spec.flags);
    // requireOptions has just checked what CheckedAnswers claims; the type cannot follow it.
    const answers = resolved.values as CheckedAnswers<Options, Required>;

    let selection: Selection | undefined;
    if (spec.collection === 'many') {
      const config = resources.config;
      if (!config) throw new Error('Configuration was not loaded.');
      const selected = (await spec.many?.select?.(
        answers,
        promptContext as PromptContext<'many', WithConfig>,
        resolved.selections,
      )) ?? {
        kind: 'all',
      };
      const names = selected.kind === 'all' ? Object.keys(config.collections ?? {}) : selected.names;
      const collections: Collection[] = [];
      for (const name of new Set(names)) {
        const collection =
          resources.collections?.find((item) => item.name === name) ?? openCollection(config, name, { cwd });
        collections.push(collection);
      }
      resources = { ...resources, collections };
      selection = selected.kind === 'all' ? selected : { kind: 'some', names: collections.map((item) => item.name) };
    }

    duringRun = true;
    // The many branch supplies Selection; TypeScript cannot narrow the generic Need here.
    const selectionResources = (spec.collection === 'many' ? { selection } : {}) as SelectionResources<Need>;
    const result = await spec.run({
      ...promptContext,
      ...resources,
      // An omitted preflight uses the default void result type.
      preflight: preflight as Prepared,
      answers,
      selections: resolved.selections,
      ...selectionResources,
    });
    return result ? result.exitCode : 0;
  } catch (error) {
    return report(error, spec.name, () => spec.formatError?.(error, duringRun));
  }
}

/** Core `loadConfig`; an I/O failure other than a missing file reads as a parse failure, as before. */
function readConfig(cwd: string): LingoTrackerConfig {
  try {
    return loadConfig({ cwd });
  } catch (error) {
    if (error instanceof ConfigNotFoundError || error instanceof ConfigParseError) throw error;
    throw new ConfigParseError(path.join(cwd, CONFIG_FILENAME), error instanceof Error ? error.message : String(error));
  }
}

/** The runner's error for a command that needs a collection when the config has none. */
export const NO_COLLECTIONS_MESSAGE = 'No collections found. Run `lingo-tracker add-collection` first.';

/** No `--collection`: none configured fails, one is used, several are prompted for (interactive) or fail. */
async function selectCollection(
  config: LingoTrackerConfig,
  interactive: boolean,
  flag: string,
  ask: Ask,
  record?: { readonly flags: string } | { readonly argument: readonly [string, string] },
): Promise<string> {
  const names = Object.keys(config.collections ?? {});
  if (names.length === 0) {
    throw new Error(NO_COLLECTIONS_MESSAGE);
  }
  if (names.length === 1) {
    return names[0];
  }
  if (!interactive) {
    throw new Error(`Missing required option: ${record && 'flags' in record ? flagName(record) : toFlag(flag)}`);
  }
  const { collection } = await ask(
    selectionPrompt({ mode: 'single', name: 'collection', message: 'Select collection', choices: names }),
  );
  if (typeof collection !== 'string') {
    throw new CommandCancelledError();
  }
  return collection;
}

async function ask(questions: prompts.PromptObject | prompts.PromptObject[]): Promise<Record<string, unknown>> {
  let cancelled = false;
  const answers: Record<string, unknown> = await prompts(questions, {
    onCancel: () => {
      cancelled = true;
      return false;
    },
  });
  if (cancelled) {
    throw new CommandCancelledError();
  }
  return answers;
}

/** Prints the failure and returns the exit code: 0 for a cancel, 1 for anything else. */
function report(error: unknown, name: string, formatError: () => string | undefined): 0 | 1 {
  if (error instanceof CommandCancelledError) {
    ConsoleFormatter.error(`${name} cancelled.`);
    return 0;
  }
  printCliError(error, { commandName: name, formatError });
  return 1;
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** `targetFolder` → `--target-folder`. */
function toFlag(option: string): string {
  return `--${option.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}
