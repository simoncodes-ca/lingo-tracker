import { vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { SafeAny } from '../constants';

export interface MockFile {
  type: 'file' | 'directory';
  content?: string;
  children?: string[];
}

export function setupMockFs(mockFs: Record<string, MockFile>): void {
  vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => (p as string) in mockFs);

  vi.mocked(fs.readdirSync).mockImplementation(((p: fs.PathLike, opts?: SafeAny) => {
    const entry = mockFs[p as string];
    if (!entry || entry.type !== 'directory') return [];
    const childNames = entry.children ?? [];
    if (opts && typeof opts === 'object' && (opts as { withFileTypes?: boolean }).withFileTypes) {
      return childNames.map((name) => {
        const childPath = path.join(p as string, name);
        const isDir = mockFs[childPath]?.type === 'directory';
        return {
          name,
          isDirectory: () => isDir,
          isFile: () => !isDir,
          isSymbolicLink: () => false,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isFIFO: () => false,
          isSocket: () => false,
        } as unknown as fs.Dirent;
      });
    }
    return childNames as unknown as fs.Dirent[];
  }) as SafeAny);

  vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor) => {
    const entry = mockFs[p as string];
    if (!entry || entry.type !== 'file') throw new Error(`ENOENT: ${p}`);
    return entry.content ?? '';
  });

  vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
}

export function makeBaseConfig(overrides: SafeAny = {}): SafeAny {
  return {
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: {
      main: {
        translationsFolder: 'src/i18n',
      },
    },
    ...overrides,
  };
}
