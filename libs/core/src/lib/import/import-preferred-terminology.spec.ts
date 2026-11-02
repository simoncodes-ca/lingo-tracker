import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PreferredTermRule } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Collection, openCollection } from '../config/open-collection';
import { importResources } from './import-resources';
import { parseJsonImport } from './parse-json-import';
import { parseXliffImport } from './parse-xliff-import';
import type { ImportRunOptions } from './types';

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
  let collection: Collection;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'lingo-import-terminology-'));
    translationsFolder = join(projectDir, 'translations');
    mkdirSync(translationsFolder, { recursive: true });
    writeFileSync(join(projectDir, '.lingo-tracker-preferred-terminology.json'), JSON.stringify(rules), 'utf8');
    collection = makeCollection('en');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  const writeSource = (name: string, content: string): string => {
    const filePath = join(projectDir, name);
    writeFileSync(filePath, content, 'utf8');
    return filePath;
  };

  const makeCollection = (baseLocale: string): Collection =>
    openCollection(
      {
        baseLocale: 'en',
        locales: ['en', 'es', 'fr'],
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        collections: { main: { translationsFolder: 'translations', baseLocale } },
      },
      'main',
      { cwd: projectDir },
    );

  const baseOptions = (overrides: Partial<ImportRunOptions> = {}): ImportRunOptions => ({
    locale: 'en',
    strategy: 'migration',
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

    const result = importResources(collection, parseJsonImport(source).resources, baseOptions());

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

    const result = importResources(collection, parseJsonImport(source).resources, baseOptions());

    expect(result.warnings).toContain(
      'Preferred terminology: key "budget.title" — consider "Investment" instead of "Expenditure". Finance style guide',
    );
    const entries = JSON.parse(readFileSync(join(translationsFolder, 'budget', 'resource_entries.json'), 'utf8'));
    expect(entries.title.source).toBe('Operating expenditure');
  });

  it('warns during a dry run without writing anything', () => {
    const source = writeSource('en.json', JSON.stringify({ 'budget.title': 'Expenditure' }));

    const result = importResources(collection, parseJsonImport(source).resources, baseOptions({ dryRun: true }));

    expect(result.warnings.filter((w) => w.startsWith('Preferred terminology'))).toHaveLength(1);
    expect(result.filesModified).toEqual([]);
  });

  it('never warns on a target-locale import', () => {
    seedExisting();
    const source = writeSource('es.json', JSON.stringify({ 'budget.title': 'Expenditure de capital' }));

    const result = importResources(
      collection,
      parseJsonImport(source).resources,
      baseOptions({ locale: 'es', strategy: 'translation-service' }),
    );

    expect(result.warnings.some((w) => w.startsWith('Preferred terminology'))).toBe(false);
    expect(result.resourcesUpdated).toBe(1);
  });

  it('skips the check when there is no rule file', () => {
    rmSync(join(projectDir, '.lingo-tracker-preferred-terminology.json'));
    const source = writeSource('en.json', JSON.stringify({ 'budget.title': 'Expenditure' }));

    const result = importResources(collection, parseJsonImport(source).resources, baseOptions());

    expect(result.warnings.some((w) => w.startsWith('Preferred terminology'))).toBe(false);
  });

  it('opens the warnings with the rule-file problem on a base-locale import, and skips the check', () => {
    const rulesPath = join(projectDir, '.lingo-tracker-preferred-terminology.json');
    writeFileSync(rulesPath, 'not json', 'utf8');
    const source = writeSource('en.json', JSON.stringify({ 'budget.title': 'Expenditure' }));

    const result = importResources(collection, parseJsonImport(source).resources, baseOptions());

    expect(result.warnings[0]).toContain(
      `Preferred terminology checks skipped: Preferred terminology file is not valid JSON: ${rulesPath}`,
    );
    expect(result.warnings.filter((w) => w.startsWith('Preferred terminology'))).toHaveLength(1);
    expect(result.resourcesCreated).toBe(1);
  });

  it('says nothing about a broken rule file on a target-locale import', () => {
    seedExisting();
    writeFileSync(join(projectDir, '.lingo-tracker-preferred-terminology.json'), 'not json', 'utf8');
    const source = writeSource('es.json', JSON.stringify({ 'budget.title': 'Gasto' }));

    const result = importResources(
      collection,
      parseJsonImport(source).resources,
      baseOptions({ locale: 'es', strategy: 'translation-service' }),
    );

    expect(result.warnings.some((w) => w.includes('Preferred terminology'))).toBe(false);
  });

  it('warns for base-locale XLIFF values', async () => {
    const source = writeSource(
      'en.xliff',
      xliff('en', { 'budget.title': { source: 'Expenditure', target: 'Capital expenditure' } }),
    );

    const result = importResources(collection, (await parseXliffImport(source)).resources, baseOptions());

    expect(result.warnings).toContain(
      'Preferred terminology: key "budget.title" — consider "Investment" instead of "Expenditure". Finance style guide',
    );
    expect(result.resourcesCreated).toBe(1);
  });

  describe("collection whose base locale differs from the project's", () => {
    it('warns on an import into that base locale', () => {
      const source = writeSource('fr.json', JSON.stringify({ 'budget.title': 'Expenditure du mois' }));

      const french = makeCollection('fr');
      const result = importResources(french, parseJsonImport(source).resources, baseOptions({ locale: 'fr' }));

      expect(result.warnings).toContain(
        'Preferred terminology: key "budget.title" — consider "Investment" instead of "Expenditure". Finance style guide',
      );
      const entries = JSON.parse(readFileSync(join(translationsFolder, 'budget', 'resource_entries.json'), 'utf8'));
      expect(entries.title.source).toBe('Expenditure du mois');
    });

    it("treats the project base locale as a target locale and doesn't warn", () => {
      seedExisting();
      const source = writeSource('en.json', JSON.stringify({ 'budget.title': 'Capital expenditure' }));

      const french = makeCollection('fr');
      const result = importResources(
        french,
        parseJsonImport(source).resources,
        baseOptions({ locale: 'en', strategy: 'translation-service' }),
      );

      expect(result.warnings.some((w) => w.startsWith('Preferred terminology'))).toBe(false);
      const entries = JSON.parse(readFileSync(join(translationsFolder, 'budget', 'resource_entries.json'), 'utf8'));
      expect(entries.title.en).toBe('Capital expenditure');
    });
  });

  it('never warns on a target-locale XLIFF import', async () => {
    seedExisting();
    const source = writeSource(
      'es.xliff',
      xliff('es', { 'budget.title': { source: 'Capital expenditure', target: 'Expenditure de capital' } }),
    );

    const result = importResources(
      collection,
      (await parseXliffImport(source)).resources,
      baseOptions({ locale: 'es', strategy: 'translation-service' }),
    );

    expect(result.warnings.some((w) => w.startsWith('Preferred terminology'))).toBe(false);
  });
});
