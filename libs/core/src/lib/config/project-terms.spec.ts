import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LingoTrackerCollection } from '../../config/lingo-tracker-collection';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { ProtectedTermsFileError } from '../errors/lingo-tracker-error';
import { type Collection, openCollection } from './open-collection';
import { DEFAULT_PREFERRED_TERMINOLOGY_FILENAME } from './preferred-terminology-file';
import { readProjectTerms } from './project-terms';
import { DEFAULT_PROTECTED_TERMS_FILENAME } from './protected-terms-file';

const rules = [
  { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Finance style guide' },
  { discouraged: 'e-mail', preferred: 'email' },
];

describe('Project Terms', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'lingo-project-terms-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  const write = (relativePath: string, contents: unknown): string => {
    const filePath = join(cwd, relativePath);
    writeFileSync(filePath, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf8');
    return filePath;
  };

  const open = (
    overrides: Partial<LingoTrackerConfig> = {},
    collection: LingoTrackerCollection = { translationsFolder: 'i18n' },
  ): Collection =>
    openCollection(
      {
        exportFolder: 'dist',
        importFolder: 'import',
        baseLocale: 'en',
        locales: ['en', 'fr'],
        collections: { app: collection },
        ...overrides,
      },
      'app',
      { cwd },
    );

  it('reads empty lists and no problems when no file exists', () => {
    const terms = readProjectTerms(open());

    expect(terms.protectedTerms).toEqual([]);
    expect(terms.preferredTerminology).toEqual([]);
    expect(terms.forReport()).toMatchObject({ errors: [], warnings: [] });
    expect(terms.forValidation()).toMatchObject({ warnings: [], loadError: undefined });
  });

  it("unites the global protected terms with the collection's own, deduped", () => {
    write('global.json', ['SimonCodes', 'iPhone']);
    write('own.json', ['iPhone', 'Node.js']);
    write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, rules);

    const terms = readProjectTerms(
      open({ protectedTermsFile: 'global.json' }, { translationsFolder: 'i18n', protectedTermsFile: 'own.json' }),
    );

    expect(terms.protectedTerms).toEqual(['SimonCodes', 'iPhone', 'Node.js']);
    expect(terms.preferredTerminology).toEqual(rules);
    expect(terms.forReport()).toMatchObject({ errors: [], warnings: [] });
    expect(terms.forValidation()).toMatchObject({ warnings: [], loadError: undefined });
  });

  it('reports each named file that does not exist as a warning', () => {
    const terms = readProjectTerms(
      open(
        { protectedTermsFile: 'global.json', preferredTerminologyFile: 'rules.json' },
        { translationsFolder: 'i18n', protectedTermsFile: 'own.json' },
      ),
    );

    expect(terms.forReport().warnings).toEqual([
      `Protected terms file not found: ${join(cwd, 'global.json')}. Treating as an empty list.`,
      `Protected terms file not found: ${join(cwd, 'own.json')}. Treating as an empty list.`,
    ]);
    expect(terms.forGuard().warnings).toEqual(terms.forReport().warnings);
    expect(terms.forGuard('source').warnings).toEqual([
      `Preferred terminology file not found: ${join(cwd, 'rules.json')}. Treating as an empty list.`,
    ]);
    expect(terms.forValidation().warnings).toEqual([
      ...terms.forReport().warnings,
      ...terms.forGuard('source').warnings,
    ]);
  });

  it('reports a broken file as an error, reads it as empty, and describes the skipped check', () => {
    const protectedPath = write(DEFAULT_PROTECTED_TERMS_FILENAME, '["iPhone",');
    const rulesPath = write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, '{ "rules": [] }');

    const terms = readProjectTerms(open());

    expect(terms.protectedTerms).toEqual([]);
    expect(terms.preferredTerminology).toEqual([]);
    const protectedError = `Protected terms checks skipped: Protected terms file is not valid JSON: ${protectedPath} (${jsonError('["iPhone",')})`;
    const preferredError = `Preferred terminology file must contain a JSON array of rules: ${rulesPath}`;
    expect(terms.forReport()).toMatchObject({ errors: [protectedError], warnings: [] });
    expect(terms.forValidation()).toEqual({ warnings: [protectedError], loadError: preferredError });
    expect(() => terms.forGuard()).toThrow(ProtectedTermsFileError);
    expect(() => terms.forGuard('source')).toThrow(ProtectedTermsFileError);
    expect(terms.checkBaseValue('key', 'value').problems).toEqual([
      `Preferred terminology checks skipped: ${preferredError}`,
    ]);
  });

  it('reads the files again on every call, so an edit on disk is seen at once', () => {
    write(DEFAULT_PROTECTED_TERMS_FILENAME, ['iPhone']);
    const collection = open();
    expect(readProjectTerms(collection).protectedTerms).toEqual(['iPhone']);

    write(DEFAULT_PROTECTED_TERMS_FILENAME, ['Android', 'Pixel']);

    expect(readProjectTerms(collection).protectedTerms).toEqual(['Android', 'Pixel']);
  });

  it.each([
    ['protected', 'missing'],
    ['protected', 'broken'],
    ['protected', 'ok'],
    ['preferred', 'missing'],
    ['preferred', 'broken'],
    ['preferred', 'ok'],
  ] as const)('maps a %s file in state %s by intent', (kind, state) => {
    const protectedFile = 'protected.json';
    const preferredFile = 'preferred.json';
    if (state !== 'missing') {
      write(
        kind === 'protected' ? protectedFile : preferredFile,
        state === 'broken' ? '{bad' : kind === 'protected' ? ['Brand'] : rules,
      );
    }
    const terms = readProjectTerms(
      open(kind === 'protected' ? { protectedTermsFile: protectedFile } : { preferredTerminologyFile: preferredFile }),
    );
    const broken = state === 'broken';
    const missing = state === 'missing';
    const report = terms.forReport();
    const validation = terms.forValidation();
    expect(report.errors).toHaveLength(kind === 'protected' && broken ? 1 : 0);
    expect(report.warnings).toHaveLength(kind === 'protected' && missing ? 1 : 0);
    expect(validation.warnings).toHaveLength(missing || (kind === 'protected' && broken) ? 1 : 0);
    expect(validation.loadError !== undefined).toBe(kind === 'preferred' && broken);
    if (kind === 'protected' && broken) {
      expect(() => terms.forGuard()).toThrow(ProtectedTermsFileError);
      expect(() => terms.forGuard('source')).toThrow(ProtectedTermsFileError);
    } else {
      expect(terms.forGuard().warnings).toHaveLength(kind === 'protected' && missing ? 1 : 0);
      expect(terms.forGuard('source').warnings).toHaveLength(kind === 'preferred' && state !== 'ok' ? 1 : 0);
    }
  });

  it('reports a shared protected file once for export notes', () => {
    const terms = readProjectTerms(
      open({ protectedTermsFile: 'shared.json' }, { translationsFolder: 'i18n', protectedTermsFile: 'shared.json' }),
    );
    expect(terms.forReport().warnings).toEqual([
      `Protected terms file not found: ${join(cwd, 'shared.json')}. Treating as an empty list.`,
    ]);
  });

  describe('checkBaseValue', () => {
    it('returns one finding per rule the value breaks, under the key, with the rule-file problems', () => {
      write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, rules);

      const result = readProjectTerms(open()).checkBaseValue(
        'budget.title',
        'Expenditure and more expenditure, by e-mail',
      );

      expect(result).toEqual({
        findings: [
          {
            key: 'budget.title',
            discouraged: 'Expenditure',
            preferred: 'Investment',
            reason: 'Finance style guide',
            message: 'consider "Investment" instead of "Expenditure"',
          },
          {
            key: 'budget.title',
            discouraged: 'e-mail',
            preferred: 'email',
            message: 'consider "email" instead of "e-mail"',
          },
        ],
        problems: [],
      });
    });

    it('returns no findings and the described problem when the rule file is broken', () => {
      const rulesPath = write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, 'not json');
      write(DEFAULT_PROTECTED_TERMS_FILENAME, '["broken",');

      const result = readProjectTerms(open()).checkBaseValue('budget.title', 'Expenditure');

      expect(result.findings).toEqual([]);
      // Only the rule file limits this check; the protected-terms problem belongs to other consumers.
      expect(result.problems).toEqual([
        `Preferred terminology checks skipped: Preferred terminology file is not valid JSON: ${rulesPath} (${jsonError('not json')})`,
      ]);
    });
  });

  describe('forGuard', () => {
    it('returns the terms when every protected-terms file is usable, missing named files included', () => {
      write(DEFAULT_PROTECTED_TERMS_FILENAME, ['iPhone']);
      write(DEFAULT_PREFERRED_TERMINOLOGY_FILENAME, 'not json');
      const terms = readProjectTerms(open({}, { translationsFolder: 'i18n', protectedTermsFile: 'absent.json' }));

      expect(terms.forGuard().protectedTerms).toEqual(['iPhone']);
      expect(terms.forGuard('source').warnings).toHaveLength(1);
      expect(terms.forValidation().loadError).toContain('not valid JSON');
      expect(terms.forReport().errors).toEqual([]);
    });

    it('throws ProtectedTermsFileError, naming the file, when a protected-terms file is broken', () => {
      const filePath = write(DEFAULT_PROTECTED_TERMS_FILENAME, '["iPhone", 42]');

      expect(() => readProjectTerms(open()).forGuard()).toThrow(
        expect.objectContaining({ code: 'INVALID_PROTECTED_TERMS_FILE', filePath }),
      );
      expect(() => readProjectTerms(open()).forGuard()).toThrow(ProtectedTermsFileError);
    });
  });
});

/** Node's own message for the malformed JSON, so the assertion does not depend on the engine's wording. */
function jsonError(text: string): string {
  try {
    JSON.parse(text);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
