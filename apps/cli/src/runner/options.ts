import { type Command, Option } from 'commander';
import { type ExplicitEmptyList, parseCommaSeparatedList } from '../utils';

/** One Commander option registration. Each command gets its own Option instance. */
export type OptionDefinition = (command: Command) => void;

export interface OptionSpec<Value = string> {
  readonly flags: string;
  readonly description?: string;
  readonly defaultValue?: string | boolean;
  /** Printed in help without assigning a Commander value. */
  readonly helpDefault?: string | boolean;
  readonly parse?: (value: string) => Value;
}

export function option<Value = string>(spec: OptionSpec<Value>): OptionDefinition {
  if (spec.parse && spec.defaultValue !== undefined) {
    throw new Error('A CLI option cannot define both parse and defaultValue.');
  }
  if (spec.helpDefault !== undefined && spec.defaultValue !== undefined) {
    throw new Error('A CLI option cannot define both helpDefault and defaultValue.');
  }
  const description =
    spec.helpDefault === undefined
      ? spec.description
      : `${spec.description ?? ''} (default: ${JSON.stringify(spec.helpDefault)})`;
  return (command) => {
    if (spec.parse) command.option(spec.flags, description, spec.parse);
    else if (spec.defaultValue !== undefined) command.option(spec.flags, description, spec.defaultValue);
    else command.option(spec.flags, description);
  };
}

export function choiceOption(
  flags: string,
  description: string,
  choices: string[],
  defaultValue?: string,
): OptionDefinition {
  return (command) => {
    const item = new Option(flags, description).choices(choices);
    command.addOption(defaultValue === undefined ? item : item.default(defaultValue));
  };
}

export function collectionOption(description: string): OptionDefinition {
  return option({ flags: '--collection <name>', description });
}

export const tokenCasingOption: OptionDefinition = choiceOption(
  '--token-casing <casing>',
  'Token property key casing',
  ['upperCase', 'camelCase'],
);

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function repeatableListOption(flags: string, description: string): OptionDefinition {
  return (command) => {
    command.option(flags, description, collect, []);
  };
}

export const collectionSetupOptions: readonly OptionDefinition[] = [
  option({ flags: '--collection-name <name>', description: 'Name for the translation collection' }),
  option({ flags: '--translations-folder <path>' }),
  option({ flags: '--export-folder <path>', description: 'dist/lingo-export' }),
  option({ flags: '--import-folder <path>', description: 'dist/lingo-import' }),
  option({ flags: '--base-locale <locale>', description: 'en' }),
  option({ flags: '--locales <locales...>', description: 'supported locales' }),
];

export const setupBundleOption: OptionDefinition = option({
  flags: '--setup-bundle <bool>',
  description: 'Setup bundle configuration during init (true/false)',
  parse: (value) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`--setup-bundle must be "true" or "false", got "${value}"`);
  },
});

export const yesOption: OptionDefinition = option({ flags: '--yes', description: 'Skip confirmation prompt' });

/** Flag order and labels differ between add and edit, but their common fields are declared here. */
export function resourceFieldOptions(mode: 'add' | 'edit'): readonly OptionDefinition[] {
  if (mode === 'add') {
    return [
      option({ flags: '--key <key>', description: 'Resource key (dot-delimited, e.g., apps.common.buttons.ok)' }),
      option({ flags: '--value <value>', description: 'Base value (source text)' }),
      option({ flags: '--comment <comment>', description: 'Optional context for translators' }),
      commaListOption({ flags: '--tags <tags>', description: 'Optional tags (comma-separated)' }),
      option({ flags: '--target-folder <folder>', description: 'Optional target folder (dot-delimited)' }),
    ];
  }
  return [
    option({ flags: '--key <key>', description: 'Resource key (dot-delimited)' }),
    option({ flags: '--base-value <value>', description: 'New base value (source text)' }),
    option({ flags: '--comment <comment>', description: 'New comment' }),
    commaListOption({ flags: '--tags <tags>', description: 'New tags (comma-separated)' }),
    option({
      flags: '--target-folder <folder>',
      description: 'Move the resource into this folder (dot-delimited; "" for the collection root)',
    }),
  ];
}

/** Only raw empty optional flags are omitted; other empty lists retain the supplied-flag gates. */
export function commaListOption(
  spec: Omit<OptionSpec<string[]>, 'parse' | 'defaultValue'> & {
    readonly empty?: 'clear' | 'preserve';
  },
): OptionDefinition {
  const { empty, ...optionSpec } = spec;
  return option<string[] | ExplicitEmptyList | undefined>({
    ...optionSpec,
    parse: (value) => {
      const items = parseCommaSeparatedList(value);
      if (items !== undefined) return items;
      if (empty === 'clear') return [];
      if (empty === 'preserve') return { kind: 'empty', input: value };
      return value === '' ? undefined : [];
    },
  });
}
