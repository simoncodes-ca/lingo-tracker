import { type Command, Option } from 'commander';
import { type ExplicitEmptyList, parseCommaSeparatedList } from '../utils/string-parsers';

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

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function repeatableListOption(flags: string, description: string): OptionDefinition {
  return (command) => {
    command.option(flags, description, collect, []);
  };
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
      // flagValues omits raw '': Commander turns a parser's undefined back into ''.
      return value === '' ? undefined : [];
    },
  });
}
