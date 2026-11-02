import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { BadRequestException, ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { hasFsErrorCode, type OpenedProject, openProjectCollection } from '@simoncodes-ca/core';
import { IMPORT_UPLOAD_EXTENSIONS, type ImportSourceListingDto } from '@simoncodes-ca/data-transfer';
import type { ImportUploadQuery } from '../validation/dto-schemas';
import { ImportSourceService, resolveImportFolder } from './import-source.service';

export interface UploadedImportFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

function invalidUpload(errors: string[], message = 'Invalid upload'): BadRequestException {
  return new BadRequestException({ statusCode: 400, message, error: 'Bad Request', errors });
}

function folded(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

export const IMPORT_UPLOAD_PLATFORM = Symbol('IMPORT_UPLOAD_PLATFORM');

function comparisonPath(path: string, platform: NodeJS.Platform): string {
  return platform === 'darwin' || platform === 'win32' ? path.normalize('NFC').toLowerCase() : path;
}

function inside(base: string, path: string, platform: NodeJS.Platform): boolean {
  const rel = relative(comparisonPath(base, platform), comparisonPath(path, platform));
  return rel === '' || (rel !== '..' && rel.startsWith(`..${sep}`) === false && isAbsolute(rel) === false);
}

function validateNames(files: readonly UploadedImportFile[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const names = files.map((file) => {
    const name = file.originalname.normalize('NFC');
    const reject = (reason: string) => errors.push(`"${name}" ${reason}`);
    const extension = extname(name);
    if (
      name.includes('/') ||
      name.includes('\\') ||
      Array.from(name).some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)
    )
      reject('must not contain path separators or control characters.');
    if (name !== name.trim() || name.endsWith('.')) reject('must not start or end with whitespace or a dot.');
    if (name.startsWith('.')) reject('must not be hidden.');
    if (
      /[<>:"|?*]/.test(name) ||
      /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/i.test(
        name.split('.')[0]?.replace(/[ .]+$/, '') ?? '',
      )
    )
      reject('is not a portable file name.');
    if (Buffer.byteLength(name, 'utf8') > 255) reject('must be at most 255 bytes.');
    if (IMPORT_UPLOAD_EXTENSIONS.some((allowed) => allowed === extension.toLowerCase()) === false)
      reject('must be an .xliff, .xlf or .json file.');
    if (file.size === 0) reject('is empty.');
    if (seen.has(folded(name))) reject('is listed twice.');
    seen.add(folded(name));
    return name;
  });
  if (errors.length > 0) throw invalidUpload(errors);
  return names;
}

/** Resolve existing ancestors natively, retaining the spelling of a not-yet-existing tail. */
function realUploadPath(path: string): string {
  let ancestor = path;
  while (existsSync(ancestor) === false) ancestor = dirname(ancestor);
  return resolve(realpathSync.native(ancestor), relative(ancestor, path));
}

function assertUploadFolder(project: OpenedProject, root: string, real: string, platform: NodeJS.Platform): void {
  const local = relative(comparisonPath(root, platform), comparisonPath(real, platform));
  const blockedSegment = local.split(sep).some((segment) => segment.startsWith('.') || segment === 'node_modules');
  const translations = Object.values(project.sourceConfig.collections ?? {}).some((collection) =>
    inside(realUploadPath(resolve(root, collection.translationsFolder)), real, platform),
  );
  if (local === '' || blockedSegment || translations) throw invalidUpload(['folder is not allowed for uploads.']);
}

function writableFolder(
  project: OpenedProject,
  root: string,
  folder: string,
  importFolder: string,
  platform: NodeJS.Platform,
): string {
  const disallowed = () => invalidUpload(['folder is not allowed for uploads.']);
  const allowed = realUploadPath(importFolder);
  if (inside(root, importFolder, platform) === false || inside(root, allowed, platform) === false) throw disallowed();
  assertUploadFolder(project, root, allowed, platform);
  const candidate = realUploadPath(folder);
  if (inside(root, folder, platform) === false || inside(allowed, candidate, platform) === false) throw disallowed();
  assertUploadFolder(project, root, candidate, platform);
  try {
    mkdirSync(folder, { recursive: true });
  } catch (error) {
    if (hasFsErrorCode(error, 'EEXIST') && statSync(folder).isDirectory() === false)
      throw invalidUpload(['folder must be a directory']);
    if (['EACCES', 'EPERM', 'ENOTDIR', 'ENOENT'].some((code) => hasFsErrorCode(error, code)))
      throw invalidUpload(['folder could not be written'], 'folder could not be written');
    throw error;
  }
  const real = realpathSync.native(folder);
  if (statSync(real).isDirectory() === false) throw invalidUpload(['folder must be a directory']);
  // Re-resolve both sides after creating the folder, before opening any upload file.
  const realImport = realUploadPath(importFolder);
  if (inside(root, realImport, platform) === false || inside(realImport, real, platform) === false) throw disallowed();
  assertUploadFolder(project, root, realImport, platform);
  assertUploadFolder(project, root, real, platform);
  return real;
}

@Injectable()
export class ImportUploadService {
  constructor(
    private readonly sources: ImportSourceService,
    @Optional() @Inject(IMPORT_UPLOAD_PLATFORM) private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  upload(
    project: OpenedProject,
    query: ImportUploadQuery,
    files: readonly UploadedImportFile[] = [],
  ): ImportSourceListingDto {
    const collection = openProjectCollection(project, query.collection, { writable: true });
    if (files.length === 0) throw invalidUpload(['files must contain at least one file.']);
    const names = validateNames(files);
    const root = realpathSync.native(project.projectRoot);
    const { folder, defaultFolder } = resolveImportFolder({ ...project, projectRoot: root }, collection, query.folder);
    const real = writableFolder(project, root, folder, defaultFolder, this.platform);
    const existing = new Map(readdirSync(real).map((name) => [folded(name), name]));
    const folderClashes = names.filter((name) => {
      const target = existing.get(folded(name));
      return target !== undefined && statSync(join(real, target)).isDirectory();
    });
    if (folderClashes.length > 0) throw invalidUpload(folderClashes.map((name) => `"${name}" clashes with a folder.`));
    const clashes = names.filter((name) => existing.has(folded(name)));
    if (clashes.length > 0 && query.overwrite !== 'true')
      throw new ConflictException({
        statusCode: 409,
        message: 'Files already exist',
        error: 'Conflict',
        errors: clashes,
      });
    for (const [index, file] of files.entries()) {
      const name = names[index];
      if (name === undefined) throw new Error('Missing validated upload name');
      const target = existing.get(folded(name)) ?? name;
      const tmp = join(real, `.upload-${randomUUID()}.tmp`);
      try {
        writeFileSync(tmp, file.buffer, { flag: 'wx' });
        renameSync(tmp, join(real, target));
      } catch (error) {
        try {
          rmSync(tmp);
        } catch {
          // Cleanup is best effort; retain the original write error.
        }
        const code = ['EACCES', 'EPERM', 'ENOSPC', 'EROFS'].find((candidate) => hasFsErrorCode(error, candidate));
        if (code) throw invalidUpload([`"${name}" could not be written (${code}).`], 'folder could not be written');
        throw error;
      }
    }
    return this.sources.listSources(project, { collection: query.collection, folder: query.folder });
  }
}
