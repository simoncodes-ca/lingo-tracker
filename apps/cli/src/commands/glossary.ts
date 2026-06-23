import * as fs from 'fs';
import * as path from 'path';
import { loadResourcesFromCollections } from '@simoncodes-ca/core';
import type { LingoTrackerCollection, LingoTrackerConfig } from '@simoncodes-ca/core';
import { ConsoleFormatter, loadConfiguration, parseCommaSeparatedList, resolveCollection } from '../utils';
import { resolveExtractor, type CandidateExtractor, type ExtractorMode } from './glossary-extractor';
import { matchGlossary, type FlatEntry } from './glossary-matcher';

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
  /** Comma-separated locales to include (default: all configured locales). */
  locales?: string;
  /** Include new/stale entries (default: only translated + verified). */
  includeAll?: boolean;
  /** Extraction strategy (default: ngram). */
  extractor?: ExtractorMode;
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
  if (!process.stdin.isTTY) {
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

/**
 * Loads entries from the requested collection(s) via the shared core loader,
 * mapping each `LoadedResource` to the matcher's `FlatEntry`. Each collection's
 * effective base locale is stripped from `translations` (it lives in `source`).
 * Returns null if a named collection cannot be resolved.
 */
function loadEntries(options: GlossaryCommandOptions, config: LingoTrackerConfig, cwd: string): FlatEntry[] | null {
  const globalBase = config.baseLocale;

  let targets: { name: string; collection: LingoTrackerCollection }[];
  if (options.collection) {
    const resolved = resolveCollection(options.collection, config, cwd);
    if (!resolved) return null;
    targets = [{ name: resolved.name, collection: resolved.config }];
  } else {
    targets = Object.entries(config.collections ?? {}).map(([name, collection]) => ({ name, collection }));
  }

  const entries: FlatEntry[] = [];
  for (const { name, collection } of targets) {
    const base = collection.baseLocale ?? globalBase;
    const loaded = loadResourcesFromCollections([{ name, path: path.resolve(cwd, collection.translationsFolder) }]);
    for (const resource of loaded) {
      const translations = { ...resource.translations };
      if (base) delete translations[base];
      entries.push({
        key: resource.fullKey,
        collection: resource.collection,
        source: resource.source,
        translations,
        status: resource.status,
      });
    }
  }
  return entries;
}

function buildOutputPath(options: GlossaryCommandOptions, cwd: string): string {
  if (options.output) return path.resolve(cwd, options.output);
  // Keep milliseconds so two runs in the same second don't overwrite each other.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(cwd, `lingo-tracker-glossary-${timestamp}.json`);
}

export async function glossaryCommand(options: GlossaryCommandOptions): Promise<void> {
  const loaded = loadConfiguration();
  if (!loaded) return;
  const { config, cwd } = loaded;

  const block = resolveInputText(options, cwd);
  if (block === null) {
    process.exit(1);
  }

  const baseLocale = config.baseLocale || 'en';
  const requested = parseCommaSeparatedList(options.locales) ?? config.locales ?? [];
  const targetLocales = requested.filter((locale) => locale !== baseLocale);

  if (targetLocales.length === 0) {
    ConsoleFormatter.warning('No target locales to include (only the base locale is configured or requested).');
  }

  const entries = loadEntries(options, config, cwd);
  if (entries === null) {
    process.exit(1);
  }

  let extractor: CandidateExtractor;
  try {
    extractor = resolveExtractor(options.extractor ?? 'ngram');
  } catch (error) {
    ConsoleFormatter.error((error as Error).message);
    process.exit(1);
  }

  const candidates = extractor(block);
  const terms = matchGlossary(entries, candidates, {
    locales: targetLocales,
    includeAll: options.includeAll,
  });

  const glossary = {
    baseLocale,
    locales: targetLocales,
    source: { chars: block.length, candidates: candidates.length },
    matchCount: terms.length,
    terms,
  };

  const json = JSON.stringify(glossary, null, 2);

  if (options.stdout) {
    // Keep stdout clean for piping; status goes to stderr.
    process.stdout.write(`${json}\n`);
    console.error(`✅ ${terms.length} term(s) matched from ${candidates.length} candidate(s).`);
    return;
  }

  const outputPath = buildOutputPath(options, cwd);
  fs.writeFileSync(outputPath, json);

  if (terms.length === 0) {
    ConsoleFormatter.info(`No matching translations found. Wrote empty glossary to: ${outputPath}`);
  } else {
    ConsoleFormatter.success(`${terms.length} term(s) matched from ${candidates.length} candidate(s).`);
    ConsoleFormatter.keyValue('Glossary written to', outputPath);
  }
}
