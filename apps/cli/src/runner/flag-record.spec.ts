import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { defineCommand, runCommand } from './command-runner';
import { defineFlags, flagName, flagValues, resolveFlagValues } from './flag-record';
import { registerCommand } from './register-command';

const noRun = async () => undefined;

describe('command flag records', () => {
  it('maps several positional arguments and parsed flag values to one handler object', async () => {
    const calls: unknown[] = [];
    const flags = defineFlags<{ source: string; destination: string; tags?: string[]; limit?: number }>()({
      source: { argument: ['<source>', 'Source'] },
      destination: { argument: ['<destination>', 'Destination'] },
      tags: { flags: '--tags <tags>', list: 'optional' },
      limit: { flags: '--limit <n>', parse: Number, runtimeDefault: 5 },
    });
    const root = new Command();
    registerCommand(root, {
      name: 'copy',
      description: 'Copy',
      flags,
      load: async () => async (options) => {
        calls.push(resolveFlagValues(flags, options as Record<string, unknown>).values);
      },
    });
    await root.parseAsync(['copy', 'a', 'b', '--tags', ' x, , y '], { from: 'user' });
    expect(calls).toEqual([{ source: 'a', destination: 'b', tags: ['x', 'y'], limit: 5 }]);
  });

  it('omits raw empty optional lists while preserving comma-only, clear and preserve values', async () => {
    const flags = defineFlags<{ tags?: string[]; cleared?: string[]; preserved?: unknown }>()({
      tags: { flags: '--tags <tags>', list: 'optional' },
      cleared: { flags: '--cleared <tags>', list: 'clear' },
      preserved: { flags: '--preserved <tags>', list: 'preserve' },
    });
    for (const row of [
      { input: '', tags: undefined, cleared: [], preserved: { kind: 'empty', input: '' } },
      { input: ',', tags: [], cleared: [], preserved: { kind: 'empty', input: ',' } },
      { input: 'ui, buttons', tags: ['ui', 'buttons'], cleared: ['ui', 'buttons'], preserved: ['ui', 'buttons'] },
    ]) {
      const root = new Command();
      const calls: unknown[] = [];
      registerCommand(root, {
        name: 'lists',
        description: '',
        flags,
        load: async () => async (options) => {
          calls.push(options);
        },
      });
      await root.parseAsync(['lists', '--tags', row.input, '--cleared', row.input, '--preserved', row.input], {
        from: 'user',
      });
      expect(calls).toEqual([{ tags: row.tags, cleared: row.cleared, preserved: row.preserved }]);
    }
  });

  it('maps renamed scalar, list and paired negated attributes without leaking Commander keys', async () => {
    const calls: unknown[] = [];
    const flags = defineFlags<{ resultLimit?: number; localeIDs?: string[]; transformICU?: boolean }>()({
      resultLimit: { flags: '--max-results <n>', parse: Number, runtimeDefault: 5 },
      localeIDs: { flags: '--locale-ids <ids>', list: 'optional', runtimeDefault: [] },
      transformICU: {
        flags: '--no-transform-icu',
        description: 'Disable transformation',
        positive: { flags: '--transform-icu', description: '' },
      },
    });
    const invoke = async (argv: string[]) => {
      const root = new Command();
      registerCommand(root, {
        name: 'convert',
        description: '',
        flags,
        load: async () => async (options) => {
          calls.push(resolveFlagValues(flags, options as Record<string, unknown>).values);
        },
      });
      await root.parseAsync(['convert', ...argv], { from: 'user' });
    };
    await invoke(['--max-results', '8', '--locale-ids', 'en,fr', '--transform-icu']);
    await invoke(['--no-transform-icu']);
    await invoke([]);
    expect(calls).toEqual([
      { resultLimit: 8, localeIDs: ['en', 'fr'], transformICU: true },
      { resultLimit: 5, localeIDs: [], transformICU: false },
      { resultLimit: 5, localeIDs: [] },
    ]);
  });

  it('creates fresh repeatable defaults for every registered command', async () => {
    const flags = defineFlags<{ tag?: string[] }>()({ tag: { flags: '--tag <tag>', list: 'repeatable' } });
    const root = new Command();
    const first = registerCommand(root, { name: 'first', description: '', flags, load: async () => noRun });
    const second = registerCommand(root, { name: 'second', description: '', flags, load: async () => noRun });
    first.parseOptions(['--tag', 'one']);
    expect(first.opts()).toEqual({ tag: ['one'] });
    expect(second.opts()).toEqual({ tag: [] });
  });

  it('asks flag questions before command questions and delivers both answers', async () => {
    const calls: unknown[] = [];
    const command = defineCommand<{ locale?: string; value?: string }>()({
      name: 'Questions',
      collection: 'none',
      config: false,
      flags: defineFlags<{ locale?: string; value?: string }>()({
        locale: {
          flags: '--locale <locale>',
          prompt: () => [{ type: 'text', name: 'locale', message: 'Locale' }],
        },
        value: { flags: '--value <value>' },
      }),
      prompts: () => [{ type: 'text', name: 'value', message: 'Value' }],
      run: ({ answers }) => {
        calls.push(answers);
      },
    });
    const result = await runCommand(
      command,
      {},
      {
        cwd: '.',
        interactive: true,
        ask: async (questions) => {
          const fields = Array.isArray(questions) ? questions : [questions];
          expect(fields.map((question) => question.name)).toEqual(['locale', 'value']);
          return { locale: 'fr', value: 'Bonjour' };
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([{ locale: 'fr', value: 'Bonjour' }]);
  });

  it('derives the long spelling without aliases or placeholders', () => {
    expect(flagName({ flags: '-l, --locale-value <value>' })).toBe('--locale-value');
  });

  it('requires exactly the Options keys, including keys introduced by a spread', () => {
    const define = defineFlags<{ locale?: string }>();
    // @ts-expect-error Missing an Options key must fail compilation.
    define({});
    const extra = { unrelated: { flags: '--unrelated' } };
    // @ts-expect-error A record without an Options key must fail even through a spread.
    define({ locale: { flags: '--locale <locale>' }, ...extra });
    // @ts-expect-error List parsing and a custom parser cannot silently replace each other.
    define({ locale: { flags: '--locale <locale>', list: 'optional', parse: Number } });
    // @ts-expect-error Prompt keys must belong to the declared answer type.
    define({ locale: { flags: '--locale <name>', selection: { prompt: 'loclae' } } });
    // @ts-expect-error All flags must belong to Options.
    define({ locale: { flags: '--locale <name>', selection: { allFlag: 'al' } } });
    expect(define({ locale: { flags: '--locale <locale>' } }).locale.flags).toBe('--locale <locale>');
  });
});

describe('flag value resolution', () => {
  const flags = defineFlags<
    {
      debugKeys?: string | boolean;
      limit?: number;
      transformICU?: boolean;
      names?: string[];
    },
    never,
    { nameOrAll?: string | string[] }
  >()({
    debugKeys: { flags: '--debug-keys [locale]', implicitValue: '99' },
    limit: { flags: '--limit <n>', runtimeDefault: 5 },
    transformICU: { flags: '--no-transform-icu' },
    names: {
      flags: '--name <names>',
      list: 'optional',
      selection: { prompt: 'nameOrAll', defaultAll: true },
    },
  });

  it('leaves an absent optional-value flag absent', () => {
    expect(resolveFlagValues(flags, {}).values).toEqual({ limit: 5, transformICU: true });
  });
  it('applies the implicit value only when the flag has no value', () => {
    expect(resolveFlagValues(flags, { debugKeys: true }).values.debugKeys).toBe('99');
    expect(resolveFlagValues(flags, { debugKeys: 'keys' }).values.debugKeys).toBe('keys');
    expect(resolveFlagValues(flags, { debugKeys: false }).values.debugKeys).toBe(false);
  });
  it('uses the runtime default while retaining an explicit limit', () => {
    expect(resolveFlagValues(flags, {}).values.limit).toBe(5);
    expect(resolveFlagValues(flags, { limit: 8 }).values.limit).toBe(8);
  });
  it('keeps a negated flag under its record key', () => {
    expect(flagValues(flags, { transformIcu: false }, []).transformICU).toBe(false);
    expect(resolveFlagValues(flags, { transformICU: false }).values.transformICU).toBe(false);
  });
  it('copies array defaults for each resolution', () => {
    const records = defineFlags<{ names?: string[] }>()({
      names: { flags: '--names <names>', runtimeDefault: ['first'] },
    });
    const first = resolveFlagValues<{ names?: string[] }>(records, {}).values.names;
    first?.push('second');
    expect(resolveFlagValues(records, {}).values.names).toEqual(['first']);
  });
  it('gives a supplied flag precedence over the prompt answer', () => {
    expect(resolveFlagValues(flags, { names: ['__ALL__', 'main'] }, { nameOrAll: '__ALL__' }).selections.names).toEqual(
      { kind: 'some', names: ['__ALL__', 'main'] },
    );
  });
  it('decodes a single name prompt answer', () => {
    expect(resolveFlagValues(flags, {}, { nameOrAll: 'main' }).selections.names).toEqual({
      kind: 'some',
      names: ['main'],
    });
  });
  it('decodes all-items prompt answers in both prompt modes', () => {
    for (const nameOrAll of ['__ALL__', ['main', '__ALL__']]) {
      expect(resolveFlagValues(flags, {}, { nameOrAll }).selections.names).toEqual({ kind: 'all' });
    }
  });
  it('defaults to all with no non-interactive input', () => {
    expect(resolveFlagValues(flags, {}).selections.names).toEqual({ kind: 'all' });
  });
  it('can require an explicit single-name or all selection', () => {
    const records = defineFlags<{ collection?: string; all?: boolean }, never, { collectionOrAll?: string }>()({
      collection: {
        flags: '--collection <name>',
        selection: { prompt: 'collectionOrAll', allFlag: 'all' },
      },
      all: { flags: '--all' },
    });
    expect(resolveFlagValues(records, {}).selections.collection).toBeUndefined();
    expect(resolveFlagValues(records, { collection: 'main' }).selections.collection).toEqual({
      kind: 'some',
      names: ['main'],
    });
    expect(resolveFlagValues(records, { collection: 'main', all: true }).selections.collection).toEqual({
      kind: 'all',
    });
  });
  it('preserves declared empty-flag fallback and explicit all-answer precedence', () => {
    const records = defineFlags<{ names?: string[]; all?: boolean }, never, { choice?: string }>()({
      all: { flags: '--all' },
      names: {
        flags: '--name <names>',
        list: 'optional',
        selection: { prompt: 'choice', emptyFlagFallsBack: true, allFlag: 'all' },
      },
    });
    expect(resolveFlagValues(records, { names: [] }, { choice: 'main' }).selections.names).toEqual({
      kind: 'some',
      names: ['main'],
    });
    expect(resolveFlagValues(records, { names: ['main'] }, { choice: '__ALL__' }).selections.names).toEqual({
      kind: 'all',
    });
  });
  it('uses the same resolver in runCommand, including submitted selections', async () => {
    const calls: unknown[] = [];
    const command = defineCommand<{
      debugKeys?: string | boolean;
      limit?: number;
      transformICU?: boolean;
      names?: string[];
    }>()({
      name: 'Resolve',
      collection: 'none',
      config: false,
      flags,
      prompts: () => [{ type: 'text', name: 'nameOrAll', message: 'Name' }],
      run: ({ answers, selections }) => {
        calls.push({ answers, selections });
      },
    });
    const result = await runCommand(
      command,
      { debugKeys: true },
      {
        cwd: '.',
        interactive: true,
        ask: async () => ({ nameOrAll: 'main' }),
      },
    );
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([
      {
        answers: { debugKeys: '99', limit: 5, transformICU: true },
        selections: { names: { kind: 'some', names: ['main'] } },
      },
    ]);
  });
});
