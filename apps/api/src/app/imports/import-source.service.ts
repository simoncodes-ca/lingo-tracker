import { type Dirent, readdirSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { BadRequestException, Injectable } from '@nestjs/common';
import { hasFsErrorCode, inspectImportSource, type OpenedProject, openProjectCollection } from '@simoncodes-ca/core';
import type { ImportSourceFileDto, ImportSourceListingDto } from '@simoncodes-ca/data-transfer';
import { DEFAULT_CONFIG, inferImportLocale } from '@simoncodes-ca/domain';
import type { ImportSourcesQuery } from '../validation/dto-schemas';

/** Paths outside the project remain usable server paths. */
export function importDisplayPath(root: string, path: string): string {
  const local = relative(root, path);
  return local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local) ? path : local || '.';
}

export function resolveImportFolder(
  project: OpenedProject,
  collection: ReturnType<typeof openProjectCollection>,
  requestedFolder?: string,
): { defaultFolder: string; folder: string } {
  const defaultFolder = resolve(
    project.projectRoot,
    collection.config.importFolder ?? project.sourceConfig.importFolder ?? DEFAULT_CONFIG.importFolder,
  );
  return { defaultFolder, folder: resolve(project.projectRoot, requestedFolder ?? defaultFolder) };
}

@Injectable()
export class ImportSourceService {
  listSources(project: OpenedProject, query: ImportSourcesQuery): ImportSourceListingDto {
    const collection = openProjectCollection(project, query.collection);
    const { defaultFolder, folder } = resolveImportFolder(project, collection, query.folder);
    const base = {
      collection: collection.name,
      folder: importDisplayPath(project.projectRoot, folder),
      defaultFolder: importDisplayPath(project.projectRoot, defaultFolder),
    };
    let entries: Dirent[];
    try {
      const stats = statSync(folder);
      if (!stats.isDirectory()) throw new BadRequestException('folder must be a directory');
      entries = readdirSync(folder, { withFileTypes: true });
    } catch (error) {
      if (hasFsErrorCode(error, 'ENOENT') || hasFsErrorCode(error, 'ENOTDIR'))
        return { ...base, exists: false, files: [] };
      if (hasFsErrorCode(error, 'EACCES') || hasFsErrorCode(error, 'EPERM'))
        throw new BadRequestException('folder could not be read');
      throw error;
    }
    const locales = collection.locales.includes(collection.baseLocale)
      ? collection.locales
      : [...collection.locales, collection.baseLocale];
    const files: ImportSourceFileDto[] = [];
    for (const entry of entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))) {
      if (!entry.isFile() || entry.name.startsWith('.') || !/\.(xliff|xlf|json)$/i.test(entry.name)) continue;
      try {
        const path = resolve(folder, entry.name);
        const inspection = inspectImportSource(path, project.projectRoot);
        const xliffTargetLanguage = inspection.xliffTargetLanguage || undefined;
        const inferred = inferImportLocale(entry.name, locales, xliffTargetLanguage);
        const localeProblem =
          xliffTargetLanguage !== undefined && inferred?.source !== 'xliff-target-language'
            ? 'not-configured'
            : inferred?.locale === collection.baseLocale
              ? 'base-locale'
              : undefined;
        files.push({
          path: importDisplayPath(project.projectRoot, path),
          name: entry.name,
          format: inspection.format,
          sizeBytes: inspection.sizeBytes,
          modifiedAt: inspection.modifiedAt,
          ...(xliffTargetLanguage !== undefined && { xliffTargetLanguage }),
          ...(inferred && { locale: inferred.locale, localeSource: inferred.source }),
          ...(localeProblem && { localeProblem }),
        });
      } catch {
        // A single unreadable or unusual source must not hide the other files.
      }
    }
    return { ...base, exists: true, files };
  }
}
