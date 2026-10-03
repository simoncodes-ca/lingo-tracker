import * as fs from 'fs';
import * as path from 'path';
import { buildGlossary, type Collection, describeFolderProblem, GlossaryExtractorError } from '@simoncodes-ca/core';
import { type CommandResult, defineCommand } from '../runner/command-runner';
import { hasPipedStdin } from '../runner/terminal';
import { ConsoleFormatter, parseNameSelection } from '../utils';

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
function resolveInputText(options: GlossaryCommandOptions, cwd: string): string | null {
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
  if (hasPipedStdin()) {
    try {
      const piped = fs.readFileSync(0, 'utf8');
      if (piped.trim().length > 0) return piped;
    } catch {
      // No readable stdin — fall through to the error below.
    }
  }

  ConsoleFormatter.error('No input provided. Use --text "...", --input <file>, or pipe text via stdin.');
  return null;
}

function buildOutputPath(options: GlossaryCommandOptions, cwd: string): string {
  if (options.output) return path.resolve(cwd, options.output);
  // Keep milliseconds so two runs in the same second don't overwrite each other.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(cwd, `lingo-tracker-glossary-${timestamp}.json`);
}

/** Core names the extractor, not the flag; the command words the unimplemented "ai" mode as the flag. */
function buildWithFlagWording(collections: Collection[], block: string, options: GlossaryCommandOptions) {
  try {
    return buildGlossary(collections, block, {
      extractor: options.extractor,
      locales: options.locales?.length ? options.locales : undefined,
      includeAll: options.includeAll,
    });
  } catch (error) {
    if (error instanceof GlossaryExtractorError && error.mode === 'ai') {
      throw new Error('The "ai" extractor is not yet implemented. Use --extractor ngram (the default).');
    }
    throw error;
  }
}

export const glossaryCommand = defineCommand<GlossaryCommandOptions>()({
  name: 'Glossary',
  collection: 'many',
  many: { select: (answers) => parseNameSelection(answers.collection) ?? { kind: 'all' } },
  run: ({ cwd, collections, answers }) => runGlossary(answers, cwd, collections),
});

function runGlossary(options: GlossaryCommandOptions, cwd: string, collections: Collection[]): CommandResult {
  const block = resolveInputText(options, cwd);
  if (block === null) {
    return { exitCode: 1 };
  }

  const { readProblems, ...glossary } = buildWithFlagWording(collections, block, options);

  for (const problem of readProblems) {
    ConsoleFormatter.warning(describeFolderProblem(problem, { collectionName: problem.collectionName }));
  }

  if (glossary.locales.length === 0) {
    ConsoleFormatter.warning('No target locales to include (only the base locale is configured or requested).');
  }

  const json = JSON.stringify(glossary, null, 2);

  if (options.stdout) {
    // Keep stdout clean for piping; status goes to stderr.
    process.stdout.write(`${json}\n`);
    console.error(`✅ ${glossary.matchCount} term(s) matched from ${glossary.source.candidates} candidate(s).`);
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
