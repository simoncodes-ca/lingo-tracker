import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_CONFIG } from '../../constants';
import { readCollectionSet } from '../collection-set/collection-set';
import type { Collection } from '../config/open-collection';
import { readProjectTerms } from '../config/project-terms';
import { CoreOperationError } from '../errors/lingo-tracker-error';
import { readCollection } from '../resource/read-collection';
import { describeFolderProblem } from '../resource/collection-folders';
import { assertTranslationStatusList } from '../resource/translation-status-input';
import {
  type ExportResource,
  filterResources,
  inspectOutputDirectory,
  validateBasePropertyName,
} from './export-common';
import { exportFileName } from './export-file-name';
import { buildFlatStructure, buildHierarchicalStructure } from './export-to-json';
import type { ExportRunOptions } from './run-export';
import type { ExportFormat, ExportOptions, FilteredResource } from './types';

export interface ExportPlanFile {
  readonly locale: string;
  /** Absolute path. */
  readonly path: string;
  readonly fileName: string;
  readonly exists: boolean;
  readonly entriesCount: number;
}
export interface ExportPlanSkip {
  readonly locale: string;
  readonly reason: 'no-matching-entries';
}

/** Pass this same object back to writePreparedExport; write-only state is keyed by identity. Do not spread or clone it. */
export interface PreparedExportRun {
  readonly format: ExportFormat;
  readonly outputDirectory: string; // absolute, resolved like today
  readonly outputProblem?: string; // not writable / is a file; no mkdir performed
  readonly baseLocale: string | undefined;
  readonly collections: readonly string[];
  readonly locales: readonly string[]; // export order, after narrowing
  readonly files: readonly ExportPlanFile[]; // locales that will write
  readonly skipped: readonly ExportPlanSkip[];
  readonly entriesTotal: number;
  readonly warnings: readonly string[];
  readonly errors: readonly string[]; // terms-file errors, read problems that are errors
  readonly malformedFiles: readonly string[];
  readonly hierarchicalConflicts: readonly string[]; // computed by building the tree without writing (JSON hierarchical only)
  /** A real key from the first collection, for the UI's entry-shape sample. */
  readonly exampleKey?: { readonly key: string; readonly baseValue: string; readonly collection: string };
  /** Filtered resources per locale, kept for the write phase. Not serialised. */
  readonly perLocale: ReadonlyMap<string, readonly FilteredResource[]>;
}

interface PreparedExportState {
  readonly localeErrors: ReadonlyMap<string, string>;
  readonly options: ExportOptions;
  readonly hierarchies: ReadonlyMap<string, ReturnType<typeof buildHierarchicalStructure>>;
}

// Keep write-only settings and cached trees out of the public preview contract.
const states = new WeakMap<PreparedExportRun, PreparedExportState>();

export function preparedExportState(prepared: PreparedExportRun): PreparedExportState {
  const state = states.get(prepared);
  if (!state) throw new CoreOperationError('Expected a run created by prepareExportRun.');
  return state;
}

/** Reads and filters once, without creating the output directory or writing files. */
export function prepareExportRun(collections: readonly Collection[], options: ExportRunOptions): PreparedExportRun {
  if (options.basePropertyName !== undefined) validateBasePropertyName(options.basePropertyName);
  const status = options.status;
  let validatedStatus: ExportOptions['status'];
  if (status !== undefined) {
    assertTranslationStatusList(status);
    validatedStatus = [...status];
  }
  const outputDirectory = resolve(
    options.cwd ?? process.cwd(),
    options.outputDirectory || options.exportFolder || DEFAULT_CONFIG.exportFolder,
  );
  const inspection = inspectOutputDirectory(outputDirectory);
  const scoped = readCollectionSet(collections, { scope: 'export', locales: options.locales });
  const set = (() => {
    try {
      return scoped.read();
    } catch (error) {
      // Output preconditions precede collection-read failures, as in runExport before the split.
      if (inspection.ok === false) throw new CoreOperationError(inspection.problem);
      throw error;
    }
  })();
  const runOptions: ExportOptions = {
    ...options,
    status: validatedStatus,
    tags: options.tags ? [...options.tags] : undefined,
    outputDirectory,
    collections: collections.map((collection) => collection.name),
    locales: [...set.targetLocales],
  };
  const warnings: string[] = [];
  const errors: string[] = [];
  const malformedFiles: string[] = [];
  const hierarchicalConflicts: string[] = [];
  const files: ExportPlanFile[] = [];
  const skipped: ExportPlanSkip[] = [];
  const perLocale = new Map<string, readonly FilteredResource[]>();
  const localeErrors = new Map<string, string>();
  const hierarchies = new Map<string, ReturnType<typeof buildHierarchicalStructure>>();
  const date = new Date();
  const augmentProtectedTerms = options.augmentProtectedTerms !== false;

  if (set.targetLocales.length > 0) {
    const baseLocale = set.baseLocale;
    // A nonempty target scope can only come from at least one collection.
    if (baseLocale === undefined) throw new CoreOperationError('An export with target locales requires collections.');
    for (const collection of collections) {
      if (!existsSync(collection.translationsFolder)) {
        warnings.push(
          `Collection '${collection.name}': translations folder not found: ${collection.translationsFolder}`,
        );
      }
    }
    malformedFiles.push(
      ...set.readProblems.map((problem) => describeFolderProblem(problem, { collectionName: problem.collection })),
    );
    const protectedTermsByCollection = new Map(
      collections.map((collection) => [collection.name, protectedTermsOf(collection)]),
    );
    for (const locale of set.targetLocales) {
      const exportResources: ExportResource[] = set.resources
        .filter((resource) => resource.targetLocales.includes(locale))
        .map((resource) => ({ ...resource, protectedTerms: protectedTermsByCollection.get(resource.collection) }));
      const filtered = filterResources(exportResources, locale, validatedStatus, options.tags, {
        augmentProtectedTerms,
        baseLocale,
      });
      perLocale.set(locale, filtered);
      if (filtered.length === 0) {
        skipped.push({ locale, reason: 'no-matching-entries' });
        continue;
      }
      try {
        let entriesCount = filtered.length;
        if (options.format === 'json') {
          if (options.jsonStructure === 'flat')
            entriesCount = Object.keys(buildFlatStructure(filtered, runOptions)).length;
          else {
            const built = buildHierarchicalStructure(filtered, runOptions);
            hierarchies.set(locale, built);
            entriesCount = built.keysCount;
            hierarchicalConflicts.push(...built.conflicts.map((conflict) => `[${locale}] ${conflict}`));
          }
        }
        const fileName = exportFileName(options.format, locale, baseLocale, options.filenamePattern, date);
        const path = join(outputDirectory, fileName);
        files.push({ locale, path, fileName, exists: existsSync(path), entriesCount });
      } catch (error) {
        const message = (error as Error).message;
        errors.push(`Export for locale ${locale} failed: ${message}`);
        localeErrors.set(locale, message);
      }
    }
  }
  let exampleKey: PreparedExportRun['exampleKey'];
  for (const collection of collections) {
    const selected = set.resources.find((resource) => resource.collection === collection.name);
    if (selected) {
      exampleKey = { key: selected.fullKey, baseValue: selected.source, collection: selected.collection };
    } else {
      // A collection can have base entries even when no target survives narrowing or collisions.
      const first = readCollection(collection).resources[0];
      if (first) exampleKey = { key: first.fullKey, baseValue: first.entry.source, collection: collection.name };
    }
    if (exampleKey) break;
  }
  const prepared: PreparedExportRun = {
    format: options.format,
    outputDirectory,
    outputProblem: inspection.ok === true ? undefined : inspection.problem,
    baseLocale: set.baseLocale,
    collections: runOptions.collections ?? [],
    locales: set.targetLocales,
    files,
    skipped,
    entriesTotal: files.reduce((total, file) => total + file.entriesCount, 0),
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
    malformedFiles,
    hierarchicalConflicts,
    exampleKey,
    perLocale,
  };
  states.set(prepared, { options: runOptions, hierarchies, localeErrors });
  return prepared;

  /**
   * The collection's protected terms for the do-not-translate notes. A broken terms file is an
   * error (the run fails: its notes would silently be missing); a named file that does not exist
   * is a warning.
   */
  function protectedTermsOf(collection: Collection): string[] | undefined {
    if (!augmentProtectedTerms) return undefined;
    const terms = readProjectTerms(collection).forReport();
    errors.push(...terms.errors);
    warnings.push(...terms.warnings);
    return [...terms.protectedTerms];
  }
}
