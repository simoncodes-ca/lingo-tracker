import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PreferredTermRule } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readPreferredTerminologyFile, writePreferredTerminology } from './preferred-terminology-file';
import { readProtectedTermsFile, writeProtectedTermsFile } from './protected-terms-file';
import { resolveTermFilePath, type TermFile, type TermFileRead } from './term-file';

/** The two kinds behind the module, exercised the same way. */
interface Kind {
  readonly label: string;
  readonly items: string;
  /** A valid file whose items need trimming and deduping. */
  readonly valid: string;
  /** What `valid` reads as. */
  readonly expected: unknown[];
  readonly invalidItem: string;
  readonly invalidItemMessage: string;
  readonly read: (file: TermFile) => TermFileRead<unknown>;
  /** Writes `expected`. */
  readonly writeExpected: (filePath: string) => void;
  /** Writes an unsorted, untrimmed value; `written` is the file it produces. */
  readonly writeSample: (filePath: string) => void;
  readonly written: string;
}

const protectedTerms: Kind = {
  label: 'Protected terms file',
  items: 'strings',
  valid: '[" iPhone ", "iPhone", "Node.js", "  "]',
  expected: ['iPhone', 'Node.js'],
  invalidItem: '["iPhone", 42]',
  invalidItemMessage: 'must contain only strings',
  read: readProtectedTermsFile,
  writeExpected: (filePath) => writeProtectedTermsFile(filePath, ['iPhone', 'Node.js']),
  writeSample: (filePath) => writeProtectedTermsFile(filePath, ['Node.js', ' iPhone ', 'iPhone', '  ']),
  written: '[\n  "iPhone",\n  "Node.js"\n]\n',
};

/** Already in sorted order, so the written file reads back as-is. */
const rules: PreferredTermRule[] = [
  { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Brand voice' },
  { discouraged: 'Wallet', preferred: 'Account' },
];

const preferredTerminology: Kind = {
  label: 'Preferred terminology file',
  items: 'rules',
  valid: JSON.stringify([
    { discouraged: 'Expenditure', preferred: 'Investment', reason: ' Brand voice ' },
    { discouraged: ' Wallet ', preferred: 'Account', reason: '  ' },
  ]),
  expected: rules,
  invalidItem: '[{ "discouraged": "Expenditure", "preferred": "Investment" }, 42]',
  invalidItemMessage: 'has invalid rules',
  read: readPreferredTerminologyFile,
  writeExpected: (filePath) => writePreferredTerminology(filePath, rules),
  writeSample: (filePath) =>
    writePreferredTerminology(filePath, [
      { discouraged: 'wallet', preferred: 'Account', reason: '  ' },
      { discouraged: ' Expenditure ', preferred: 'Investment', reason: ' Brand voice ' },
      { discouraged: 'Client', preferred: 'Customer' },
    ]),
  written: `${JSON.stringify(
    [
      { discouraged: 'Client', preferred: 'Customer' },
      { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Brand voice' },
      { discouraged: 'wallet', preferred: 'Account' },
    ],
    null,
    2,
  )}\n`,
};

describe('term file', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'lingo-term-file-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  const write = (name: string, contents: string): string => {
    const filePath = join(cwd, name);
    writeFileSync(filePath, contents, 'utf8');
    return filePath;
  };

  describe('resolveTermFilePath', () => {
    it('resolves a relative pointer against the config directory', () => {
      expect(resolveTermFilePath('config/terms.json', cwd)).toBe(join(cwd, 'config/terms.json'));
    });

    it('uses an absolute pointer as-is', () => {
      expect(resolveTermFilePath('/etc/terms.json', cwd)).toBe('/etc/terms.json');
    });
  });

  describe.each([protectedTerms, preferredTerminology])('$label', (kind: Kind) => {
    it('reads and normalizes a valid file', () => {
      const path = write('terms.json', kind.valid);

      expect(kind.read({ path, explicit: false })).toEqual({ value: kind.expected, filePath: path });
    });

    it('reads a missing default file as empty, silently', () => {
      const path = join(cwd, 'absent.json');

      expect(kind.read({ path, explicit: false })).toEqual({ value: [], filePath: path });
    });

    it('reads a missing named file as empty, with a warning', () => {
      const path = join(cwd, 'absent.json');

      expect(kind.read({ path, explicit: true })).toEqual({
        value: [],
        filePath: path,
        warning: `${kind.label} not found: ${path}. Treating as an empty list.`,
      });
    });

    it('reports malformed JSON as an error, with no value', () => {
      const path = write('terms.json', '[{ "x": ');

      const read = kind.read({ path, explicit: false });

      expect(read.value).toEqual([]);
      expect(read.error).toContain(`${kind.label} is not valid JSON: ${path}`);
    });

    it('reports a non-array payload as an error', () => {
      const path = write('terms.json', '{ "items": [] }');

      expect(kind.read({ path, explicit: false }).error).toBe(
        `${kind.label} must contain a JSON array of ${kind.items}: ${path}`,
      );
    });

    it('reports an item the kind rejects as an error', () => {
      const path = write('terms.json', kind.invalidItem);

      const read = kind.read({ path, explicit: false });

      expect(read.value).toEqual([]);
      expect(read.error).toContain(kind.invalidItemMessage);
      expect(read.error).toContain(path);
    });

    it('reports a directory at the path as unreadable, not as invalid JSON', () => {
      const path = join(cwd, 'dir.json');
      mkdirSync(path);

      const read = kind.read({ path, explicit: true });

      expect(read.warning).toBeUndefined();
      expect(read.error).toContain(`${kind.label} cannot be read: ${path}`);
      expect(read.error).toContain('EISDIR');
    });

    it('reports a pointer through a regular file as unreadable', () => {
      write('file.json', '[]');
      const path = join(cwd, 'file.json', 'terms.json');

      expect(kind.read({ path, explicit: true }).error).toContain('ENOTDIR');
    });

    it('reports an invalid pointer as an error without touching the disk', () => {
      const path = write('terms.json', kind.valid);

      expect(kind.read({ path, explicit: false, invalid: 'pointer must be a string' })).toEqual({
        value: [],
        filePath: path,
        error: 'pointer must be a string',
      });
    });

    it('returns the new contents after the file changed on disk (different content, mtime and size)', () => {
      const path = write('terms.json', kind.valid);
      expect(kind.read({ path, explicit: false }).value).toEqual(kind.expected);
      const before = statSync(path);

      write('terms.json', kind.invalidItem);
      const bumped = new Date(before.mtimeMs + 5000);
      utimesSync(path, bumped, bumped);

      expect(kind.read({ path, explicit: false }).error).toContain(kind.invalidItemMessage);
      write('terms.json', '[]');
      expect(kind.read({ path, explicit: false })).toEqual({ value: [], filePath: path });
    });

    it('writes the value normalized and sorted, as 2-space JSON with a trailing newline', () => {
      const path = join(cwd, 'terms.json');

      kind.writeSample(path);

      expect(readFileSync(path, 'utf8')).toBe(kind.written);
    });

    it('creates the file when absent, and a following read sees it', () => {
      const path = join(cwd, 'terms.json');

      kind.writeExpected(path);

      expect(kind.read({ path, explicit: false }).value).toEqual(kind.expected);
    });

    it('throws when the parent directory is missing, naming the file', () => {
      expect(() => kind.writeExpected(join(cwd, 'nested/terms.json'))).toThrow('directory does not exist');
    });
  });
});
