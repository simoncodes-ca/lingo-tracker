import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PreferredTermRule } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importFromJson } from './import-from-json';
import { importFromXliff } from './import-from-xliff';
import type { ImportOptions } from './types';

const rules: PreferredTermRule[] = [
  { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Finance style guide' },
  { discouraged: 'e-mail', preferred: 'email' },
];

const xliff = (targetLanguage: string, units: Record<string, { source: string; target: string }>): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="${targetLanguage}" datatype="plaintext" original="messages">
    <body>
${Object.entries(units)
  .map(
    ([id, { source, target }]) =>
      `      <trans-unit id="${id}"><source>${source}</source><target>${target}</target></trans-unit>`,
  )
  .join('\n')}
    </body>
  </file>
</xliff>`;

describe('preferred terminology on import', () => {
  let projectDir: string;
  let translationsFolder: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'lingo-import-terminology-'));
    translationsFolder = join(projectDir, 'translations');
    mkdirSync(translationsFolder, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(projectDir, { recursive: true, force: true });
  });

  const writeSource = (name: string, content: string): string => {
    const filePath = join(projectDir, name);
    writeFileSync(filePath, content, 'utf8');
    return filePath;
  };

  const baseOptions = (source: string, overrides: Partial<ImportOptions> = {}): ImportOptions => ({
    source,
    locale: 'en',
    baseLocale: 'en',
    strategy: 'migration',
    preferredTerminology: rules,
    ...overrides,
  });

  const seedExisting = (): void => {
    const folder = join(translationsFolder, 'budget');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'resource_entries.json'),
      JSON.stringify({ title: { source: 'Capital expenditure', es: 'Gasto de capital' } }),
    );
    writeFileSync(join(folder, 'tracker_meta.json'), JSON.stringify({ title: { en: { checksum: 'x' } } }));
  };

  it('warns once per rule for each base-locale JSON value it writes, and still imports them', () => {
    const source = writeSource(
      'en.json',
      JSON.stringify({
        'budget.title': 'Expenditure summary: expenditure by month',
        'budget.contact': 'Send the expenditure report by e-mail',
        'budget.clean': 'Investment summary',
      }),
    );

    const result = importFromJson(translationsFolder, baseOptions(source));

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'Preferred terminology: key "budget.title" — consider "Investment" instead of "Expenditure". Finance style guide',
        'Preferred terminology: key "budget.contact" — consider "Investment" instead of "Expenditure". Finance style guide',
        'Preferred terminology: key "budget.contact" — consider "email" instead of "e-mail"',
      ]),
    );
    expect(result.warnings.filter((w) => w.startsWith('Preferred terminology'))).toHaveLength(3);
    expect(result.resourcesCreated).toBe(3);
    expect(result.resourcesFailed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('warns about an updated base value', () => {
    seedExisting();
    const source = writeSource('en.json', JSON.stringify({ 'budget.title': 'Operating expenditure' }));

    const result = importFromJson(translationsFolder, baseOptions(source));

    expect(result.warnings).toContain(
      'Preferred terminology: key "budget.title" — consider "Investment" instead of "Expenditure". Finance style guide',
    );
    const entries = JSON.parse(readFileSync(join(translationsFolder, 'budget', 'resource_entries.json'), 'utf8'));
    expect(entries.title.source).toBe('Operating expenditure');
  });

  it('warns during a dry run without writing anything', () => {
    const source = writeSource('en.json', JSON.stringify({ 'budget.title': 'Expenditure' }));

    const result = importFromJson(translationsFolder, baseOptions(source, { dryRun: true }));

    expect(result.warnings.filter((w) => w.startsWith('Preferred terminology'))).toHaveLength(1);
    expect(result.filesModified).toEqual([]);
  });

  it('never warns on a target-locale import', () => {
    seedExisting();
    const source = writeSource('es.json', JSON.stringify({ 'budget.title': 'Expenditure de capital' }));

    const result = importFromJson(
      translationsFolder,
      baseOptions(source, { locale: 'es', strategy: 'translation-service' }),
    );

    expect(result.warnings.some((w) => w.startsWith('Preferred terminology'))).toBe(false);
    expect(result.resourcesUpdated).toBe(1);
  });

  it('skips the check when no rules are given', () => {
    const source = writeSource('en.json', JSON.stringify({ 'budget.title': 'Expenditure' }));

    const result = importFromJson(translationsFolder, baseOptions(source, { preferredTerminology: undefined }));

    expect(result.warnings.some((w) => w.startsWith('Preferred terminology'))).toBe(false);
  });

  it('warns for base-locale XLIFF values', async () => {
    const source = writeSource(
      'en.xliff',
      xliff('en', { 'budget.title': { source: 'Expenditure', target: 'Capital expenditure' } }),
    );

    const result = await importFromXliff(translationsFolder, baseOptions(source));

    expect(result.warnings).toContain(
      'Preferred terminology: key "budget.title" — consider "Investment" instead of "Expenditure". Finance style guide',
    );
    expect(result.resourcesCreated).toBe(1);
  });

  it('never warns on a target-locale XLIFF import', async () => {
    seedExisting();
    const source = writeSource(
      'es.xliff',
      xliff('es', { 'budget.title': { source: 'Capital expenditure', target: 'Expenditure de capital' } }),
    );

    const result = await importFromXliff(
      translationsFolder,
      baseOptions(source, { locale: 'es', strategy: 'translation-service' }),
    );

    expect(result.warnings.some((w) => w.startsWith('Preferred terminology'))).toBe(false);
  });
});
