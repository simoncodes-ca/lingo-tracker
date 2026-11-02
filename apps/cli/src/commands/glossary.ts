import { buildGlossary, type Collection } from '@simoncodes-ca/core';
import * as fs from 'fs';
import * as path from 'path';
import { CommandOutput } from '../runner/command-output';
import { type CommandResult, type CommandStdin, defineCommand } from '../runner/command-runner';
import { flagName } from '../runner/flag-record';
import { ConsoleFormatter, parseNameSelection } from '../utils';
import { GLOSSARY_FLAGS } from './glossary-flags';

export interface GlossaryCommandOptions {
  /** Inline text snippet to extract from. */
  text?: string;
  /** Path to a file whose contents are the input block. */
  input?: string;
  /** Output file path (defaults to a timestamped file in the cwd). */
  output?: string;
  /** Print the glossary JSON to stdout instead of a file. */
  stdout?: boolean;
  /** Limit matching to a single collection (default: all collections). */
  collection?: string;
  /** Comma-separated locales to include (default: opened collections' target locales). */
  locales?: string[];
  /** Include new/stale entries (default: only translated + verified). */
  includeAll?: boolean;
  /** Extraction strategy (default: ngram). */
  extractor?: 'ngram' | 'ai';
}

/**
 * Reads the input block from --text, --input <file>, or piped stdin (in that order
 * of precedence). Returns null and reports an error when no input is available.
 */
function resolveInputText(options: GlossaryCommandOptions, cwd: string, stdin: CommandStdin): string | null {
  if (options.text && options.text.trim().length > 0) {
    return options.text;
  }

  if (options.input) {
    const inputPath = path.resolve(cwd, options.input);
    if (!fs.existsSync(inputPath)) {
      ConsoleFormatter.error(`Input file not found: ${inputPath}`);
      return null;
    }
    return fs.readFileSync(inputPath, 'utf8');
  }

  // Fall back to piped stdin when not attached to a terminal.
  if (!stdin.isTTY) {
    try {
      const piped = stdin.read();
      if (piped.trim().length > 0) return piped;
    } catch {
      // No readable stdin — fall through to the error below.
    }
  }

  ConsoleFormatter.error(
    `No input provided. Use ${flagName(GLOSSARY_FLAGS.text)} "...", ${flagName(GLOSSARY_FLAGS.input)} <file>, or pipe text via stdin.`,
  );
  return null;
}

function buildOutputPath(options: GlossaryCommandOptions, cwd: string): string {
  if (options.output) return path.resolve(cwd, options.output);
  // Keep milliseconds so two runs in the same second don't overwrite each other.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(cwd, `lingo-tracker-glossary-${timestamp}.json`);
}

export const glossaryCommand = defineCommand<GlossaryCommandOptions>()({
  flags: GLOSSARY_FLAGS,
  name: 'Glossary',
  collection: 'many',
  many: { select: (answers) => parseNameSelection(answers.collection) ?? { kind: 'all' } },
  run: ({ cwd, collections, answers, stdin }) => runGlossary(answers, cwd, collections, stdin),
});

function runGlossary(
  options: GlossaryCommandOptions,
  cwd: string,
  collections: Collection[],
  stdin: CommandStdin,
): CommandResult {
  const block = resolveInputText(options, cwd, stdin);
  if (block === null) {
    return { exitCode: 1 };
  }

  const { warnings, ...glossary } = buildGlossary(collections, block, {
    extractor: options.extractor,
    locales: options.locales?.length ? options.locales : undefined,
    includeAll: options.includeAll,
  });

  for (const warning of warnings) {
    ConsoleFormatter.warning(warning);
  }

  if (glossary.locales.length === 0) {
    ConsoleFormatter.warning('No target locales to include (only the base locale is configured or requested).');
  }

  const json = JSON.stringify(glossary, null, 2);

  if (options.stdout) {
    // Keep stdout clean for piping; status goes to stderr.
    CommandOutput.write(`${json}\n`);
    CommandOutput.error(`✅ ${glossary.matchCount} term(s) matched from ${glossary.source.candidates} candidate(s).`);
    return;
  }

  const outputPath = buildOutputPath(options, cwd);
  fs.writeFileSync(outputPath, json);

  if (glossary.matchCount === 0) {
    ConsoleFormatter.info(`No matching translations found. Wrote empty glossary to: ${outputPath}`);
  } else {
    ConsoleFormatter.success(`${glossary.matchCount} term(s) matched from ${glossary.source.candidates} candidate(s).`);
    ConsoleFormatter.keyValue('Glossary written to', outputPath);
  }
}
