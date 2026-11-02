import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ImportSourceError } from '../errors/internal';
import { detectImportFormat } from './import-common';
import type { ImportFormat } from './types';

export interface ImportSourceInspection {
  format: ImportFormat;
  sizeBytes: number;
  modifiedAt: string;
  xliffTargetLanguage?: string;
}

/** Inspects source metadata and at most the first 64 KiB, without parsing entries. */
export function inspectImportSource(path: string, cwd: string): ImportSourceInspection {
  const sourcePath = resolve(cwd, path);
  try {
    const stats = statSync(sourcePath);
    if (!stats.isFile()) throw new ImportSourceError(`Import source is not a regular file: ${sourcePath}`);

    let format: ImportFormat;
    try {
      format = detectImportFormat(sourcePath);
    } catch (cause) {
      throw new ImportSourceError(cause instanceof Error ? cause.message : String(cause), { cause, stage: 'format' });
    }

    const result: ImportSourceInspection = {
      format,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
    if (format === 'xliff') {
      const descriptor = openSync(sourcePath, 'r');
      try {
        const buffer = Buffer.alloc(64 * 1024);
        const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
        const firstFile = /<file(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*?>/.exec(buffer.toString('utf8', 0, bytesRead));
        const attributes = /([^\s=]+)\s*=\s*(["'])([\s\S]*?)\2/g;
        let attribute = attributes.exec(firstFile?.[0] ?? '');
        while (attribute !== null) {
          if (attribute[1] === 'target-language') {
            result.xliffTargetLanguage = attribute[3];
            break;
          }
          attribute = attributes.exec(firstFile?.[0] ?? '');
        }
      } finally {
        closeSync(descriptor);
      }
    }
    return result;
  } catch (cause) {
    if (cause instanceof ImportSourceError) throw cause;
    throw new ImportSourceError(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}
