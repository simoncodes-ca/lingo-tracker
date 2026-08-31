import { relative } from 'node:path';
import {
  readCollectionProtectedTerms,
  readGlobalProtectedTerms,
  resolveCollectionProtectedTermsFilePath,
  resolveGlobalProtectedTermsFilePath,
  setCollectionProtectedTerms,
  setCollectionProtectedTermsFile,
  setGlobalProtectedTerms,
  setGlobalProtectedTermsFile,
} from '@simoncodes-ca/core';
import { effectiveProtectedTerms, normalizeProtectedTerms } from '@simoncodes-ca/domain';
import { loadConfiguration, ConsoleFormatter } from '../utils';

export interface ProtectedTermsOptions {
  collection?: string;
  add?: string[];
  remove?: string[];
  set?: string;
  list?: boolean;
  /** Path to the protected terms file for this scope. An empty string clears the pointer. */
  file?: string;
}

/** Renders an absolute path relative to the project root, for readable output. */
function displayPath(filePath: string, cwd: string): string {
  const rel = relative(cwd, filePath);
  return rel && !rel.startsWith('..') ? rel : filePath;
}

export async function protectedTermsCommand(options: ProtectedTermsOptions): Promise<void> {
  const hasAdd = (options.add ?? []).length > 0;
  const hasRemove = (options.remove ?? []).length > 0;
  const hasSet = options.set !== undefined;
  const hasList = options.list === true;
  const hasFile = options.file !== undefined;

  if (hasSet && (hasAdd || hasRemove)) {
    ConsoleFormatter.error('--set cannot be combined with --add or --remove');
    process.exit(1);
    return;
  }

  if (!hasAdd && !hasRemove && !hasSet && !hasList && !hasFile) {
    ConsoleFormatter.error('Provide at least one of --add, --remove, --set, --list, or --file');
    process.exit(1);
    return;
  }

  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  const collectionName = options.collection;
  const collection = collectionName ? config.collections?.[collectionName] : undefined;
  if (collectionName && !collection) {
    ConsoleFormatter.error(`Collection "${collectionName}" not found`);
    process.exit(1);
    return;
  }

  // --file runs first so a combined `--file x.json --add Foo` points at the new file, then writes to it.
  if (hasFile) {
    const pointer = options.file?.trim() ? options.file.trim() : undefined;
    try {
      const result = collectionName
        ? await setCollectionProtectedTermsFile(collectionName, pointer, { cwd })
        : setGlobalProtectedTermsFile(pointer, { cwd });
      ConsoleFormatter.success(result.message);
    } catch (error) {
      ConsoleFormatter.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
      return;
    }
  }

  // Re-read after a pointer change so subsequent reads and writes target the new file.
  const currentConfig = hasFile ? loadConfiguration({ exitOnError: false })?.config : config;
  if (!currentConfig) return;
  const currentCollection = collectionName ? currentConfig.collections?.[collectionName] : undefined;

  let globalTerms: string[];
  let collectionTerms: string[];
  try {
    globalTerms = readGlobalProtectedTerms(currentConfig, cwd);
    collectionTerms = currentCollection ? readCollectionProtectedTerms(currentCollection, cwd) : [];
  } catch (error) {
    ConsoleFormatter.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
    return;
  }

  const globalFile = resolveGlobalProtectedTermsFilePath(currentConfig, cwd);
  const collectionFile = currentCollection
    ? resolveCollectionProtectedTermsFilePath(currentCollection, cwd)
    : undefined;

  if (hasList) {
    ConsoleFormatter.section('Protected Terms');
    if (collectionName) {
      ConsoleFormatter.keyValue('Scope', `Collection "${collectionName}" (global + collection)`);
      ConsoleFormatter.keyValue('Global file', displayPath(globalFile, cwd));
      ConsoleFormatter.keyValue('Global', globalTerms.length > 0 ? globalTerms.join(', ') : '(none)');
      ConsoleFormatter.keyValue('Collection file', collectionFile ? displayPath(collectionFile, cwd) : '(none)');
      ConsoleFormatter.keyValue(
        'Collection-specific',
        collectionTerms.length > 0 ? collectionTerms.join(', ') : '(none)',
      );
      ConsoleFormatter.keyValue(
        'Effective',
        effectiveProtectedTerms(globalTerms, collectionTerms).join(', ') || '(none)',
      );
    } else {
      ConsoleFormatter.keyValue('Scope', 'Global');
      ConsoleFormatter.keyValue('File', displayPath(globalFile, cwd));
      ConsoleFormatter.keyValue('Terms', globalTerms.length > 0 ? globalTerms.join(', ') : '(none)');
    }
  }

  if (hasAdd || hasRemove || hasSet) {
    let next = collectionName ? [...collectionTerms] : [...globalTerms];

    if (hasSet) {
      next = normalizeProtectedTerms((options.set ?? '').split(','));
    } else {
      if (hasAdd) {
        for (const term of normalizeProtectedTerms(options.add ?? [])) {
          if (!next.includes(term)) {
            next.push(term);
          }
        }
      }
      if (hasRemove) {
        const toRemove = normalizeProtectedTerms(options.remove ?? []);
        next = next.filter((t) => !toRemove.includes(t));
      }
    }

    try {
      const result = collectionName
        ? setCollectionProtectedTerms(collectionName, next, { cwd })
        : setGlobalProtectedTerms(next, { cwd });

      const scopeLabel = collectionName ? `Collection "${collectionName}"` : 'Global';
      const where = `(${displayPath(result.filePath, cwd)})`;
      if (next.length === 0) {
        ConsoleFormatter.success(`${scopeLabel} protected terms cleared ${where}`);
      } else {
        ConsoleFormatter.success(`${scopeLabel} protected terms updated: ${next.join(', ')} ${where}`);
      }
    } catch (error) {
      ConsoleFormatter.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}
