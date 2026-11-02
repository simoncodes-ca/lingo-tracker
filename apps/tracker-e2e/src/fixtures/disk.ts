import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BundleDefinitionDto } from '@simoncodes-ca/data-transfer';

export interface CollectionConfig {
  translationsFolder: string;
  baseLocale?: string;
  locales?: string[];
  exportFolder?: string;
  importFolder?: string;
  readOnly?: boolean;
  tags?: string[];
}

export interface ProjectConfig {
  baseLocale: string;
  locales: string[];
  exportFolder: string;
  importFolder: string;
  collections: Record<string, CollectionConfig>;
  protectedTermsFile?: string;
  preferredTerminologyFile?: string;
  bundles?: Record<string, BundleDefinitionDto>;
  [key: string]: unknown;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export function readConfig(projectRoot: string): Promise<ProjectConfig> {
  return readJson(join(projectRoot, '.lingo-tracker.json'));
}

export function readEntries(folder: string): Promise<Record<string, unknown>> {
  return readJson(join(folder, 'resource_entries.json'));
}

export function readMeta(folder: string): Promise<Record<string, unknown>> {
  return readJson(join(folder, 'tracker_meta.json'));
}

/** Core resolves an optional config pointer, otherwise this default filename, against the project root. */
export async function protectedTermsPath(projectRoot: string): Promise<string> {
  const config = await readConfig(projectRoot);
  return resolve(projectRoot, config.protectedTermsFile ?? '.lingo-tracker-protected-terms.json');
}

export async function readProtectedTerms(projectRoot: string): Promise<string[]> {
  return readJson(await protectedTermsPath(projectRoot));
}

export function readOutput(path: string): Promise<Record<string, unknown>> {
  return readJson(path);
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function preferredTerminologyPath(projectRoot: string): Promise<string> {
  const config = await readConfig(projectRoot);
  return resolve(projectRoot, config.preferredTerminologyFile ?? '.lingo-tracker-preferred-terminology.json');
}
